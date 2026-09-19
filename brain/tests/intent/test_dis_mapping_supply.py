import copy

import pytest

from brain.core.intelligence_supply import SupplyError, digest
from brain.core.intent.genesis_intelligence import validate_mapping, validate_classification


GRAPH = {"domains": {"d1": {"name": "One", "genes": ["g1", "g2"]}, "d2": {"name": "Two", "genes": ["g3"]}}}


@pytest.mark.parametrize("kind,proposal", [
    ("create_domain", {"name": "New", "gene_ids": ["g1"]}),
    ("rename_domain", {"domain_id": "d1", "new_name": "Renamed"}),
    ("add_edge", {"domain_id": "d2", "gene_id": "g1"}),
    ("remove_edge", {"domain_id": "d1", "gene_id": "g1"}),
    ("merge_domains", {"source_domain_ids": ["d1", "d2"], "target_name": "Merged", "evidence": {"reason": "related"}}),
    ("split_domains", {"source_domain_id": "d1", "targets": [{"name": "A", "gene_ids": ["g1"]}, {"name": "B", "gene_ids": ["g2"]}]}),
])
def test_six_operations_validate_and_reject_model_authority(kind, proposal):
    operation = {"operation_id": digest([kind, proposal, digest(GRAPH), "intent"]), "type": kind,
                 "proposal": proposal, "evidence": {"reason": "source"}, "human_decision": None, "override": None}
    value = {"schema_version": "bloom.dis-mapping/v1", "intent_id": "intent", "mandate_id": "mandate", "turn_id": "1",
             "ing_result_ref": "ing_result.json", "ing_result_digest": digest({}), "graph_snapshot_digest": digest(GRAPH),
             "operations": [operation]}
    validate_mapping(value, GRAPH)
    bad = copy.deepcopy(value)
    bad["operations"][0]["human_decision"] = "approved"
    with pytest.raises(SupplyError):
        validate_mapping(bad, GRAPH)
    validate_mapping({**value, "operations": []}, GRAPH)


def test_classification_rejects_cross_domain_and_unknown_ids():
    value = {"schema_version": "bloom.ing-classification/v1", "intent_id": "i", "mandate_id": "m", "turn_id": "1",
        "input_digest": digest({}), "clusters": [{"cluster_id": "c", "files": ["a"],
        "domain": {"status": "existing", "domain_id": "d1", "name": "One", "score": 0.9},
        "gene": {"status": "extend", "gene_id": "g1", "score": 0.8}, "evidence": {"source": "a"}}]}
    validate_classification(value, ["a"], GRAPH)
    for bad_id in ("g3", "missing"):
        value["clusters"][0]["gene"]["gene_id"] = bad_id
        with pytest.raises(SupplyError):
            validate_classification(value, ["a"], GRAPH)
