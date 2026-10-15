"""Fail-closed validation of an EXP result against action evidence."""

from __future__ import annotations

from collections.abc import Mapping


class ExperimentEvaluationError(ValueError):
    """The evaluation cannot be used to advance a Mandate."""


def _evidence(value: object, name: str) -> Mapping[str, str]:
    if not isinstance(value, Mapping) or not value:
        raise ExperimentEvaluationError(f"{name} evidence is missing")
    if any(not isinstance(key, str) or not key or not isinstance(ref, str) or not ref
           for key, ref in value.items()):
        raise ExperimentEvaluationError(f"{name} evidence is invalid")
    return value


def validate_evaluation(result: object, evidence: object, *, required_evidence: tuple[str, ...]) -> dict:
    """Validate one independent EXP result against required phase evidence.

    The action contract supplies required evidence keys. This function does not
    infer readiness from an absent result or prescribe a Mandate action graph.
    The Mandate executor must verify referenced bytes and digests.
    """
    if not isinstance(result, Mapping) or set(result) != {"status", "findings"}:
        raise ExperimentEvaluationError("EXP result is missing or invalid")
    status, findings = result["status"], result["findings"]
    if status not in ("ready", "remediation_required") or not isinstance(findings, list):
        raise ExperimentEvaluationError("EXP status or findings are invalid")
    if not isinstance(evidence, Mapping):
        raise ExperimentEvaluationError("EXP evidence is missing")
    if not isinstance(required_evidence, tuple) or not required_evidence or any(
            not isinstance(name, str) or not name for name in required_evidence):
        raise ExperimentEvaluationError("EXP required evidence is invalid")
    for name in required_evidence:
        _evidence(evidence.get(name), name)
    seen = set()
    blockers = []
    for finding in findings:
        if not isinstance(finding, Mapping) or set(finding) != {"id", "blocking", "evidence", "remediation"}:
            raise ExperimentEvaluationError("EXP finding is invalid")
        identifier = finding["id"]
        if not isinstance(identifier, str) or not identifier or identifier in seen:
            raise ExperimentEvaluationError("EXP finding identity is invalid or duplicated")
        seen.add(identifier)
        if type(finding["blocking"]) is not bool:
            raise ExperimentEvaluationError("EXP finding blocking flag is invalid")
        _evidence(finding["evidence"], f"finding {identifier}")
        remediation = finding["remediation"]
        if finding["blocking"]:
            if not isinstance(remediation, str) or not remediation.strip():
                raise ExperimentEvaluationError("blocking finding lacks a concrete remediation")
            blockers.append(identifier)
        elif remediation is not None:
            raise ExperimentEvaluationError("nonblocking finding has remediation")
    if status == "ready" and blockers:
        raise ExperimentEvaluationError("ready EXP has pending blocking findings")
    if status == "remediation_required" and not blockers:
        raise ExperimentEvaluationError("remediation_required lacks blocking findings")
    return {"status": status, "findings": [dict(item) for item in findings]}
