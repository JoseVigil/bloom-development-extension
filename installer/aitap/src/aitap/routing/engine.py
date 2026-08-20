"""Pure routing engine.

This module selects an abstract target. It never invokes a provider, CLI,
filesystem tool, Vault, or Temporal. JSON files are loaded by the composition
root; ``decide`` itself is deterministic for the same three inputs.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


class RoutingError(ValueError):
    """A request cannot produce an eligible, policy-compliant decision."""


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
        return cls(
            policy=json.loads(policy_path.read_text(encoding="utf-8")),
            registry=json.loads(registry_path.read_text(encoding="utf-8")),
        )

    def decide(self, request: dict[str, Any]) -> dict[str, Any]:
        self._validate_request(request)
        stage_rule = self.policy["stages"].get(request["stage"])
        if stage_rule is None:
            raise RoutingError(f"stage desconocido para policy: {request['stage']}")

        targets = {item["target_id"]: item for item in self.registry["targets"]}
        selected_id, reason = self._requested_target(request, stage_rule)
        fallback = list(stage_rule.get("fallback", []))
        ordered_ids = list(dict.fromkeys([selected_id, *fallback]))
        excluded = set(request.get("excluded_targets", []))
        required = set(request.get("required_capabilities", []))

        candidates: list[dict[str, Any]] = []
        chosen: dict[str, Any] | None = None
        for target_id in ordered_ids:
            descriptor = targets.get(target_id)
            reason_codes: list[str] = []
            eligible = True
            if descriptor is None:
                eligible = False
                reason_codes.append("UNKNOWN_TARGET")
            else:
                if target_id in excluded:
                    eligible = False
                    reason_codes.append("EXCLUDED")
                if descriptor["health"] == "unavailable":
                    eligible = False
                    reason_codes.append("UNAVAILABLE")
                missing = sorted(required - set(descriptor["capabilities"]))
                if missing:
                    eligible = False
                    reason_codes.append("MISSING_CAPABILITIES")
                compatible_class = descriptor["target_class"] == request["target_class"]
                experimental_counterpart = (
                    descriptor["target_class"] == "deterministic_counterpart"
                    and request["routing_mode"] in {"forced", "recovery", "policy"}
                )
                if not compatible_class and not experimental_counterpart:
                    eligible = False
                    reason_codes.append("TARGET_CLASS_MISMATCH")
            if eligible:
                reason_codes.append(reason if target_id == selected_id else "POLICY_FALLBACK")
                if chosen is None:
                    chosen = descriptor
            candidates.append(
                {
                    "target_id": target_id,
                    "eligible": eligible,
                    "reason_codes": reason_codes,
                }
            )

        if chosen is None:
            raise RoutingError("ningún target elegible para request y policy")

        fingerprint_input = {
            "request": request,
            "policy": self.policy,
            "registry": self.registry,
            "selected_target_id": chosen["target_id"],
        }
        fingerprint_hash = _digest(fingerprint_input)
        return {
            "schema_version": "cognituum.routing/v1",
            "routing_decision_id": f"rd-{fingerprint_hash[:32]}",
            "routing_request_id": request["routing_request_id"],
            "logical_inference_id": request["logical_inference_id"],
            "intent_id": request["intent_id"],
            "stage": request["stage"],
            "turn_id": request["turn_id"],
            "policy_version": self.policy["policy_version"],
            "registry_snapshot_id": self.registry["snapshot_id"],
            "selected_target": {
                "target_id": chosen["target_id"],
                "target_class": chosen["target_class"],
            },
            "candidates": candidates,
            "fallback": fallback,
            "override": request.get("override"),
            "fingerprint": f"sha256:{fingerprint_hash}",
        }

    def _requested_target(self, request: dict[str, Any], rule: dict[str, Any]) -> tuple[str, str]:
        override = request.get("override")
        if override:
            return override["target_id"], "HUMAN_OVERRIDE"
        mode = request["routing_mode"]
        if mode == "forced":
            target = request.get("forced_target_id")
            if not target:
                raise RoutingError("forced routing requiere forced_target_id")
            return target, "FORCED_MATCH"
        if mode == "sticky":
            target = request.get("previous_target_id")
            if not target or not request.get("sticky_decision_id"):
                raise RoutingError("sticky routing requiere previous_target_id y sticky_decision_id")
            return target, "STICKY_MATCH"
        if mode == "recovery":
            target = rule.get("recovery_target")
            if not target:
                raise RoutingError(f"stage {request['stage']} no define recovery_target")
            return target, "POLICY_RECOVERY"
        return rule["target"], "POLICY_MATCH" if mode == "policy" else mode.upper()

    def _validate_request(self, request: dict[str, Any]) -> None:
        required = {
            "schema_version", "routing_request_id", "logical_inference_id",
            "intent_id", "stage", "turn_id", "target_class",
            "required_capabilities", "routing_mode", "policy_version",
        }
        missing = sorted(required - request.keys())
        if missing:
            raise RoutingError(f"campos requeridos ausentes: {', '.join(missing)}")
        if request["schema_version"] != "cognituum.routing/v1":
            raise RoutingError("schema_version no soportada")
        if request["policy_version"] != self.policy.get("policy_version"):
            raise RoutingError("policy_version solicitada no coincide con la cargada")
