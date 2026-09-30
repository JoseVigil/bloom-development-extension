"""Aplicacion de la politica de acceso local en ``route supply``.

Todo ocurre ANTES de enviar el pedido al modelo: una denegacion nunca deja un
intento registrado ni una inferencia incierta.

- Permiso: decision por defecto ``deny``. Solo un ``grant`` que coincida
  exactamente en consumidor + ``intent_type`` + version de politica de ruteo,
  sobre un modelo habilitado, concede acceso.
- Cuotas: bytes de entrada, timeout, concurrencia (lock no bloqueante por
  backend) y ventana de inferencias y tokens por backend y consumidor.
"""
from __future__ import annotations

import json
import time
from contextlib import ExitStack, contextmanager
from pathlib import Path
from typing import Any

from aitap.access.policy import AccessPolicy
from aitap.accounting.store import atomic_json, file_lock
from aitap.providers.base import SupplyError


def _denied(code: str, message: str, *, retryable: bool = False) -> SupplyError:
    error = SupplyError(code, "access", message)
    error.retryable = retryable
    return error


def evaluate_grant(policy: AccessPolicy, *, model_id: str, consumer_id: str, intent_type: str,
                   policy_version: str) -> dict[str, Any]:
    """Decision efectiva para consumidor + intent_type + version de politica + modelo."""
    query = {"model_id": model_id, "consumer_id": consumer_id, "intent_type": intent_type,
             "policy_version": policy_version}
    rule = policy.rule_for_model(model_id)
    if rule is None:
        return {**query, "allowed": False, "reason": "UNKNOWN_MODEL", "grant": None}
    if not rule["enabled"]:
        return {**query, "allowed": False, "reason": "MODEL_DISABLED", "grant": None}
    for grant in rule.get("grants", []):
        if (grant["consumer_id"] == consumer_id and intent_type in grant["intent_types"]
                and policy_version in grant["policy_versions"]):
            return {**query, "allowed": True, "reason": "GRANTED", "grant": grant}
    return {**query, "allowed": False, "reason": "NO_MATCHING_GRANT", "grant": None}


def effective_grants(policy: AccessPolicy) -> list[dict[str, Any]]:
    """Lista plana de combinaciones permitidas, para que un tercero las verifique."""
    rows = []
    for rule in policy.document["models"]:
        if not rule["enabled"]:
            continue
        for grant in rule.get("grants", []):
            for intent_type in grant["intent_types"]:
                for policy_version in grant["policy_versions"]:
                    rows.append({"model_id": rule["model_id"], "backend_id": rule["backend_id"],
                                 "consumer_id": grant["consumer_id"], "intent_type": intent_type,
                                 "policy_version": policy_version})
    return rows


def quotas_for(policy: AccessPolicy, backend_id: str, consumer_id: str) -> dict[str, Any]:
    rule = policy.rule(backend_id)
    return dict(rule["consumer_overrides"].get(consumer_id, rule["quotas"]))


def authorize(policy: AccessPolicy, *, backend_id: str, consumer_id: str, intent_type: str,
              policy_version: str, input_bytes: int) -> dict[str, Any]:
    """Permiso + limites que no requieren estado. Devuelve las cuotas aplicables."""
    rule = policy.rule(backend_id)
    if rule is None:
        raise _denied("ACCESS_DENIED", "Backend has no local access rule")
    decision = evaluate_grant(policy, model_id=rule["model_id"], consumer_id=consumer_id,
                              intent_type=intent_type, policy_version=policy_version)
    if not decision["allowed"]:
        raise _denied("ACCESS_DENIED", f"Local access denied: {decision['reason']}")
    quotas = quotas_for(policy, backend_id, consumer_id)
    if input_bytes > quotas["max_input_bytes"]:
        raise SupplyError("INVALID_REQUEST", "access", "Input exceeds local access policy bounds")
    return quotas


@contextmanager
def concurrency_slot(state_root: Path, backend_id: str, max_concurrency: int):
    """Ocupa una ranura libre del backend o falla sin esperar (reintentable)."""
    slots = Path(state_root) / "local" / "slots"
    with ExitStack() as stack:
        for index in range(max(1, int(max_concurrency))):
            try:
                # Solo la adquisicion se intenta ranura por ranura; los errores del cuerpo se propagan.
                stack.enter_context(file_lock(slots / f"{backend_id}.{index}.lock"))
                break
            except SupplyError as exc:
                if exc.code != "STATE_CONFLICT" or exc.stage != "lock":
                    raise
        else:
            raise _denied("CONCURRENCY_LIMIT", "Local backend concurrency limit reached", retryable=True)
        yield


class QuotaLedger:
    """Ventana deslizante de inferencias y tokens por backend y consumidor."""

    def __init__(self, state_root: Path, backend_id: str, consumer_id: str, quotas: dict[str, Any],
                 clock=time.time):
        self.path = Path(state_root) / "local" / "quotas" / f"{backend_id}__{consumer_id}.json"
        self.quotas, self.clock = quotas, clock

    def _load(self) -> list[dict[str, Any]]:
        try:
            entries = json.loads(self.path.read_text(encoding="utf-8"))["entries"]
        except FileNotFoundError:
            return []
        except (OSError, ValueError, KeyError, TypeError):
            raise SupplyError("STATE_CONFLICT", "access", "Invalid local quota ledger") from None
        horizon = self.clock() - self.quotas["window_seconds"]
        return [e for e in entries if e["at"] >= horizon]

    def reserve(self, logical_id: str, input_tokens_bound: int, output_tokens_bound: int) -> None:
        with file_lock(self.path.with_suffix(".lock")):
            entries = self._load()
            if (len(entries) + 1 > self.quotas["max_inferences"]
                    or sum(e["input"] for e in entries) + input_tokens_bound > self.quotas["max_input_tokens"]
                    or sum(e["output"] for e in entries) + output_tokens_bound > self.quotas["max_output_tokens"]):
                raise _denied("QUOTA_EXCEEDED", "Local access window quota exhausted", retryable=True)
            entries.append({"id": logical_id, "at": self.clock(), "input": input_tokens_bound,
                            "output": output_tokens_bound})
            atomic_json(self.path, {"entries": entries})

    def release(self, logical_id: str) -> None:
        """Devuelve una reserva cuando un chequeo previo posterior impide el envio."""
        with file_lock(self.path.with_suffix(".lock")):
            atomic_json(self.path, {"entries": [e for e in self._load() if e["id"] != logical_id]})

    def settle(self, logical_id: str, input_tokens: int, output_tokens: int) -> None:
        with file_lock(self.path.with_suffix(".lock")):
            entries = self._load()
            for entry in entries:
                if entry["id"] == logical_id:
                    entry.update(input=input_tokens, output=output_tokens)
            atomic_json(self.path, {"entries": entries})
