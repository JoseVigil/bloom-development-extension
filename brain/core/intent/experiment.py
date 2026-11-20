"""Fail-closed validation of an EXP result against action evidence."""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from collections.abc import Mapping
from pathlib import Path

from brain.shared.logger import get_logger


logger = get_logger(__name__)
EXP_RESULT_SCHEMA = "bloom.exp-result/v1"
_SHA256_RE = re.compile(r"^sha256:[0-9a-f]{64}$")
_SAFE_ID_RE = re.compile(r"^[A-Za-z0-9._-]+$")
_TEST_EXCLUDED_DIRS = {".bloom", ".git", "__pycache__", ".venv", "node_modules"}


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


def _sha256_bytes(value: bytes) -> str:
    return "sha256:" + hashlib.sha256(value).hexdigest()


def _sha256_file(path: Path) -> str:
    return _sha256_bytes(path.read_bytes())


def _canonical_bytes(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, ensure_ascii=False,
                      separators=(",", ":")).encode("utf-8")


def _resolve_evidence(root: Path, name: str, ref: str, expected: str) -> dict[str, str]:
    if not isinstance(ref, str) or not ref.strip():
        raise ExperimentEvaluationError(f"{name} evidence ref is missing")
    if not isinstance(expected, str) or not _SHA256_RE.fullmatch(expected):
        raise ExperimentEvaluationError(f"{name} evidence SHA-256 is invalid")
    candidate = Path(ref)
    if not candidate.is_absolute():
        candidate = (root / candidate).resolve()
        try:
            candidate.relative_to(root)
        except ValueError as exc:
            raise ExperimentEvaluationError(f"{name} evidence escapes nucleus_path") from exc
    else:
        candidate = candidate.resolve()
    if not candidate.is_file():
        raise ExperimentEvaluationError(f"{name} evidence file does not exist: {candidate}")
    actual = _sha256_file(candidate)
    if actual != expected:
        raise ExperimentEvaluationError(f"{name} evidence SHA-256 does not match")
    return {"ref": str(candidate), "sha256": actual}


def _run_unit_tests(project_path: Path) -> tuple[list[dict], dict]:
    test_files = sorted(
        path for path in project_path.rglob("test*.py")
        if path.is_file() and not _TEST_EXCLUDED_DIRS.intersection(path.relative_to(project_path).parts)
    )
    if not test_files:
        return [], {"name": "unit_tests", "outcome": "not_run", "reason": "no_tests"}

    interpreter = sys.executable
    if getattr(sys, "frozen", False):
        interpreter = shutil.which("python") or shutil.which("python3")
        if not interpreter:
            raise ExperimentEvaluationError(
                "a real Python interpreter is required to evaluate unit tests from frozen Brain"
            )

    with tempfile.TemporaryDirectory(prefix="bloom-exp-") as raw_sandbox:
        sandbox = Path(raw_sandbox) / "project"
        shutil.copytree(
            project_path,
            sandbox,
            symlinks=False,
            ignore=shutil.ignore_patterns(*sorted(_TEST_EXCLUDED_DIRS)),
        )
        env = os.environ.copy()
        env["PYTHONDONTWRITEBYTECODE"] = "1"
        try:
            completed = subprocess.run(
                [interpreter, "-B", "-m", "unittest", "discover", "-s", str(sandbox)],
                cwd=raw_sandbox,
                env=env,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=300,
                check=False,
            )
            returncode = completed.returncode
            output = completed.stdout + "\n" + completed.stderr
        except subprocess.TimeoutExpired as exc:
            returncode = 124
            output = (exc.stdout or "") + "\n" + (exc.stderr or "") + "\nTIMEOUT"
        output = output.replace(str(sandbox), "<project>").replace(raw_sandbox, "<sandbox>")
        output = re.sub(r"Ran (\d+) tests? in [0-9.]+s", r"Ran \1 tests in <duration>", output)
    output_digest = _sha256_bytes(output.encode("utf-8"))
    check = {
        "name": "unit_tests",
        "outcome": "passed" if returncode == 0 else "failed",
        "returncode": returncode,
        "discovered_files": len(test_files),
        "output_sha256": output_digest,
        "isolated_copy": True,
    }
    if returncode == 0:
        return [], check
    return [{
        "id": "unit_tests_failed",
        "blocking": True,
        "evidence": {
            "check": "unit_tests",
            "returncode": str(returncode),
            "output_sha256": output_digest,
        },
        "remediation": "Corregir los tests unitarios fallidos y volver a ejecutar evaluate-exp.",
    }], check


def evaluate_exp(
    *,
    nucleus_path: Path,
    mandate_id: str,
    action_id: str,
    project_path: Path,
    evidence_refs: Mapping[str, tuple[str, str]],
) -> dict:
    """Evaluate EXP evidence and persist one deterministic result artifact."""
    root = Path(nucleus_path).resolve()
    project = Path(project_path).resolve()
    if not root.is_dir():
        raise ExperimentEvaluationError("nucleus_path does not exist or is not a directory")
    if not project.is_dir():
        raise ExperimentEvaluationError("project_path does not exist or is not a directory")
    if not mandate_id or not _SAFE_ID_RE.fullmatch(mandate_id):
        raise ExperimentEvaluationError("mandate_id is missing or unsafe")
    if not action_id or not _SAFE_ID_RE.fullmatch(action_id):
        raise ExperimentEvaluationError("action_id is missing or unsafe")

    required = ("ing", "dis", "doc") + (("dev",) if "dev" in evidence_refs else ())
    if set(evidence_refs) != set(required):
        raise ExperimentEvaluationError("EXP evidence set is incomplete or contains unsupported keys")
    evidence = {
        name: _resolve_evidence(root, name, *evidence_refs[name])
        for name in required
    }
    findings, unit_check = _run_unit_tests(project)
    evaluation = {
        "status": "remediation_required" if findings else "ready",
        "findings": findings,
    }
    validated = validate_evaluation(evaluation, evidence, required_evidence=required)
    artifact = {
        "schema_version": EXP_RESULT_SCHEMA,
        "mandate_id": mandate_id,
        "action_id": action_id,
        "status": validated["status"],
        "findings": validated["findings"],
        "evidence": evidence,
        "checks": [unit_check],
    }
    artifact["result_digest"] = _sha256_bytes(_canonical_bytes(artifact))
    result_dir = root / ".intents" / ".exp" / f".{action_id}-{mandate_id[:8]}"
    result_path = result_dir / "exp_result.json"
    result_dir.mkdir(parents=True, exist_ok=True)
    raw = (json.dumps(artifact, sort_keys=True, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    temp = result_path.with_name(result_path.name + ".tmp")
    temp.write_bytes(raw)
    temp.replace(result_path)
    logger.info("EXP evaluation persisted: %s", result_path)
    return {
        "status": artifact["status"],
        "result_ref": result_path.relative_to(root).as_posix(),
        "result_sha256": _sha256_bytes(raw),
        "findings": artifact["findings"],
    }
