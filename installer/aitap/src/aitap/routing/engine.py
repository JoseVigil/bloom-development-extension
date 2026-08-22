"""Deterministic routing of runtime and effective intelligence."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


class RoutingError(ValueError):
    """No deterministic, eligible pair can be selected."""


def _canonical(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def _digest(value: Any) -> str:
    return hashlib.sha256(_canonical(value)).hexdigest()


@dataclass(frozen=True)
class RoutingEngine:
    policy: dict[str, Any]
    registry: dict[str, Any]

    @classmethod
    def from_files(cls, policy_path: Path, registry_path: Path) -> "RoutingEngine":
        return cls(json.loads(policy_path.read_text(encoding="utf-8")), json.loads(registry_path.read_text(encoding="utf-8")))

    def decide(self, request: dict[str, Any]) -> dict[str, Any]:
        self._validate_registry()
        self._validate_request(request)
        rule = self.policy["stages"].get(request["stage"])
        if rule is None:
            raise RoutingError(f"stage desconocido para policy: {request['stage']}")
        runtime_id, backend_id, reason = self._requested_pair(request, rule)
        runtime_fallback = list(rule.get("runtime_fallback", []))
        intelligence_fallback = list(rule.get("intelligence_fallback", []))
        runtime, runtime_candidates = self._select_runtime(request, [runtime_id, *runtime_fallback], reason)
        intelligence, intelligence_candidates = self._select_intelligence(request, runtime, [backend_id, *intelligence_fallback], reason)
        fingerprint_input = {"request": request, "policy": self.policy, "registry": self.registry, "runtime_id": runtime["runtime_id"], "backend_id": intelligence["backend_id"], "model": intelligence["model"]}
        fingerprint_hash = _digest(fingerprint_input)
        decision_id = f"rd-{fingerprint_hash[:32]}"
        return {
            "schema_version": "cognituum.routing/v2",
            "routing_decision_id": decision_id,
            "routing_request_id": request["routing_request_id"],
            "logical_inference_id": request["logical_inference_id"],
            "intent_id": request["intent_id"],
            "stage": request["stage"],
            "turn_id": request["turn_id"],
            "policy_version": self.policy["policy_version"],
            "registry_snapshot_id": self.registry["snapshot_id"],
            "runtime": {"runtime_id": runtime["runtime_id"], "runtime_kind": runtime["runtime_kind"], "health": runtime["health"]},
            "effective_intelligence": {"backend_id": intelligence["backend_id"], "provider": intelligence["provider"], "model": intelligence["model"], "credential_ref": intelligence["credential_ref"], "health": intelligence["health"], "accounting_ref": intelligence["accounting_ref"]},
            "runtime_candidates": runtime_candidates,
            "intelligence_candidates": intelligence_candidates,
            "fallback": {"runtime_ids": runtime_fallback, "backend_ids": intelligence_fallback},
            "override_ref": request.get("override_ref"),
            "accounting": {"routing_accounting_ref": f"accounting://routing/{decision_id}", "inference_accounting_ref": intelligence["accounting_ref"], "runtime_id": runtime["runtime_id"], "provider": intelligence["provider"], "model": intelligence["model"]},
            "fingerprint": f"sha256:{fingerprint_hash}",
        }

    def _select_runtime(self, request: dict[str, Any], ordered_ids: list[str], reason: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        runtimes = {item["runtime_id"]: item for item in self.registry["runtimes"]}
        required = set(request["runtime"]["required_capabilities"])
        excluded = set(request["runtime"]["excluded_runtime_ids"])
        candidates, chosen = [], None
        for runtime_id in dict.fromkeys(ordered_ids):
            item, codes = runtimes.get(runtime_id), []
            eligible = item is not None
            if item is None:
                codes.append("UNKNOWN_RUNTIME")
            else:
                if runtime_id in excluded: eligible = False; codes.append("EXCLUDED")
                if item["health"] == "unavailable": eligible = False; codes.append("RUNTIME_UNAVAILABLE")
                if item["compatibility"] == "incompatible": eligible = False; codes.append("RUNTIME_INCOMPATIBLE")
                if required - set(item["capabilities"]): eligible = False; codes.append("MISSING_RUNTIME_CAPABILITIES")
            if eligible and chosen is None:
                chosen = item; codes.append(reason if runtime_id == ordered_ids[0] else "RUNTIME_FALLBACK")
            candidates.append({"runtime_id": runtime_id, "eligible": eligible, "reason_codes": codes})
        if chosen is None: raise RoutingError("ningún runtime elegible")
        return chosen, candidates

    def _select_intelligence(self, request: dict[str, Any], runtime: dict[str, Any], ordered_ids: list[str], reason: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        backends = {item["backend_id"]: item for item in self.registry["intelligence_backends"]}
        spec = request["intelligence"]
        required, excluded = set(spec["required_capabilities"]), set(spec["excluded_backend_ids"])
        candidates, chosen = [], None
        for backend_id in dict.fromkeys(ordered_ids):
            item, codes = backends.get(backend_id), []
            eligible = item is not None
            if item is None:
                codes.append("UNKNOWN_BACKEND")
            else:
                if backend_id in excluded: eligible = False; codes.append("EXCLUDED")
                if backend_id not in runtime["supported_backend_ids"]: eligible = False; codes.append("RUNTIME_BACKEND_MISMATCH")
                if item["health"] == "unavailable": eligible = False; codes.append("BACKEND_UNAVAILABLE")
                if required - set(item["capabilities"]): eligible = False; codes.append("MISSING_INTELLIGENCE_CAPABILITIES")
                if spec["privacy"] != "any" and item["privacy"] != spec["privacy"]: eligible = False; codes.append("PRIVACY_MISMATCH")
                if spec.get("forced_model") and item["model"] != spec["forced_model"]: eligible = False; codes.append("MODEL_MISMATCH")
            if eligible and chosen is None:
                chosen = item; codes.append(reason if backend_id == ordered_ids[0] else "INTELLIGENCE_FALLBACK")
            candidates.append({"backend_id": backend_id, "eligible": eligible, "reason_codes": codes})
        if chosen is None: raise RoutingError("ningún backend/model elegible para el runtime seleccionado")
        return chosen, candidates

    def _requested_pair(self, request: dict[str, Any], rule: dict[str, Any]) -> tuple[str, str, str]:
        mode, runtime_spec, intelligence_spec = request["routing_mode"], request["runtime"], request["intelligence"]
        if mode == "forced":
            if not runtime_spec.get("forced_runtime_id") or not intelligence_spec.get("forced_backend_id"): raise RoutingError("forced requiere runtime y backend explícitos")
            return runtime_spec["forced_runtime_id"], intelligence_spec["forced_backend_id"], "FORCED_MATCH"
        if mode == "sticky":
            if not request.get("sticky_decision_id") or not runtime_spec.get("previous_runtime_id") or not intelligence_spec.get("previous_backend_id"): raise RoutingError("sticky requiere decision, runtime y backend previos")
            return runtime_spec["previous_runtime_id"], intelligence_spec["previous_backend_id"], "STICKY_MATCH"
        if mode == "recovery":
            if not rule.get("recovery_runtime_id") or not rule.get("recovery_backend_id"): raise RoutingError("stage sin par de recovery")
            return rule["recovery_runtime_id"], rule["recovery_backend_id"], "POLICY_RECOVERY"
        return rule["runtime_id"], rule["backend_id"], "POLICY_MATCH" if mode == "policy" else mode.upper()

    def _validate_request(self, request: dict[str, Any]) -> None:
        required = {"schema_version", "routing_request_id", "logical_inference_id", "intent_id", "stage", "turn_id", "routing_mode", "policy_version", "runtime", "intelligence"}
        missing = sorted(required - request.keys())
        if missing: raise RoutingError(f"campos requeridos ausentes: {', '.join(missing)}")
        if request["schema_version"] != "cognituum.routing/v2": raise RoutingError("routing v1 está supersedido; se requiere cognituum.routing/v2")
        if request["policy_version"] != self.policy.get("policy_version"): raise RoutingError("policy_version solicitada no coincide con la cargada")

    def _validate_registry(self) -> None:
        runtime_ids = set()
        for runtime in self.registry.get("runtimes", []):
            if runtime.get("publisher") not in {"executor", "executor_fixture"}: raise RoutingError("runtime descriptor no publicado por Executor")
            runtime_ids.add(runtime.get("runtime_id"))
        if "opencode" not in runtime_ids: raise RoutingError("opencode debe registrarse como runtime first-party")
        for backend in self.registry.get("intelligence_backends", []):
            if backend.get("backend_id") == "opencode" or backend.get("provider") == "opencode":
                raise RoutingError("OpenCode no puede registrarse como intelligence provider/backend")
