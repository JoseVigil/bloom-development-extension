import pytest

from brain.core.intent.experiment import ExperimentEvaluationError, validate_evaluation


EVIDENCE = {phase: {"ref": f"{phase}/result.json", "sha256": "a" * 64}
            for phase in ("ing", "dis", "doc")}
REQUIRED = ("ing", "dis", "doc")
BLOCKER = {"id": "finding-1", "blocking": True,
           "evidence": {"ref": "exp/finding.json"},
           "remediation": "Correct the documented failing behavior and rerun its test"}


def test_ready_requires_all_phase_evidence_and_no_blocker():
    assert validate_evaluation({"status": "ready", "findings": []}, EVIDENCE, required_evidence=REQUIRED)["status"] == "ready"
    for phase in ("ing", "dis", "doc"):
        with pytest.raises(ExperimentEvaluationError):
            validate_evaluation({"status": "ready", "findings": []},
                                {key: value for key, value in EVIDENCE.items() if key != phase},
                                required_evidence=REQUIRED)
    with pytest.raises(ExperimentEvaluationError):
        validate_evaluation({"status": "ready", "findings": [BLOCKER]}, EVIDENCE, required_evidence=REQUIRED)


def test_remediation_requires_a_verifiable_finding_and_action():
    assert validate_evaluation({"status": "remediation_required", "findings": [BLOCKER]},
                               EVIDENCE, required_evidence=REQUIRED)["status"] == "remediation_required"
    with pytest.raises(ExperimentEvaluationError):
        validate_evaluation({"status": "remediation_required", "findings": []}, EVIDENCE, required_evidence=REQUIRED)
    with pytest.raises(ExperimentEvaluationError):
        validate_evaluation({"status": "remediation_required", "findings": [
            {**BLOCKER, "remediation": " "}]}, EVIDENCE, required_evidence=REQUIRED)


def test_action_contract_selects_required_evidence():
    result = {"status": "ready", "findings": []}
    with pytest.raises(ExperimentEvaluationError):
        validate_evaluation(result, EVIDENCE, required_evidence=(*REQUIRED, "dev"))
    assert validate_evaluation(result, {**EVIDENCE, "dev": {"ref": "dev/result.json"}},
                               required_evidence=(*REQUIRED, "dev"))["status"] == "ready"


@pytest.mark.parametrize("result", [None, {}, {"status": "unknown", "findings": []},
                                     {"status": "ready"}, {"status": "inconclusive", "findings": []}])
def test_invalid_or_inconclusive_result_fails_closed(result):
    with pytest.raises(ExperimentEvaluationError):
        validate_evaluation(result, EVIDENCE, required_evidence=REQUIRED)
