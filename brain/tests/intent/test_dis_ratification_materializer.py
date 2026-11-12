import pytest

from brain.core.intent.dis_ratification import DisRatificationError, apply_operations, build_delta


BASE = {
    "updated_at": "old",
    "domains": {
        "d1": {"name": "One", "genes": ["g1", "g2"], "origin_mandate_id": "old", "mandates": ["old"]},
        "d2": {"name": "Two", "genes": ["g3"], "origin_mandate_id": "old", "mandates": ["old"]},
    },
}


def _op(kind, proposal, operation_id="op"):
    return {"operation_id": operation_id, "type": kind, "proposal": proposal,
            "human_decision": "approved", "evidence": {"source": "test"}, "override": None}


@pytest.mark.parametrize("operation,assertion", [
    (_op("create_domain", {"name": "New", "gene_ids": ["g4"]}),
     lambda graph: any(value["name"] == "New" and value["genes"] == ["g4"] for value in graph["domains"].values())),
    (_op("rename_domain", {"domain_id": "d1", "new_name": "Renamed"}),
     lambda graph: graph["domains"]["d1"]["name"] == "Renamed"),
    (_op("add_edge", {"domain_id": "d2", "gene_id": "g1"}),
     lambda graph: graph["domains"]["d2"]["genes"] == ["g1", "g3"]),
    (_op("remove_edge", {"domain_id": "d1", "gene_id": "g2"}),
     lambda graph: graph["domains"]["d1"]["genes"] == ["g1"]),
    (_op("merge_domains", {"source_domain_ids": ["d1", "d2"], "target_name": "Merged", "evidence": {"why": "same"}}),
     lambda graph: len(graph["domains"]) == 1 and next(iter(graph["domains"].values()))["genes"] == ["g1", "g2", "g3"]),
    (_op("split_domains", {"source_domain_id": "d1", "targets": [
        {"name": "A", "gene_ids": ["g1"]}, {"name": "B", "gene_ids": ["g2"]}
    ]}), lambda graph: "d1" not in graph["domains"] and len(graph["domains"]) == 3),
])
def test_all_dis_operations_are_deterministic(operation, assertion):
    first = apply_operations(BASE, [operation], mandate_id="m", intent_id="i", timestamp="now")
    second = apply_operations(BASE, [operation], mandate_id="m", intent_id="i", timestamp="now")
    assert first == second
    assert assertion(first)


def test_rejected_operation_has_no_graph_effect_beyond_checkpoint_timestamp():
    operation = _op("rename_domain", {"domain_id": "d1", "new_name": "No"})
    operation["human_decision"] = "rejected"
    graph = apply_operations(BASE, [operation], mandate_id="m", intent_id="i", timestamp="now")
    assert graph["domains"] == BASE["domains"]


def test_invalid_split_fails_before_returning_partial_graph():
    operation = _op("split_domains", {"source_domain_id": "d1", "targets": [
        {"name": "A", "gene_ids": ["g1"]}, {"name": "B", "gene_ids": ["g3"]}
    ]})
    with pytest.raises(DisRatificationError) as raised:
        apply_operations(BASE, [operation], mandate_id="m", intent_id="i", timestamp="now")
    assert raised.value.code == "GRAPH_APPLICATION_FAILED"
    assert BASE["domains"]["d1"]["genes"] == ["g1", "g2"]


def test_delta_binds_snapshot_final_graph_mapping_and_decision():
    operation = _op("add_edge", {"domain_id": "d2", "gene_id": "g1"})
    final = apply_operations(BASE, [operation], mandate_id="m", intent_id="i", timestamp="now")
    delta = build_delta(BASE, final, [operation], intent_id="i", mandate_id="m",
                        mapping_ref="mapping.json", mapping_digest="sha256:m", decision_digest="sha256:d")
    assert delta["domains_changed"] == ["d2"]
    assert delta["applied_operation_ids"] == ["op"]
    assert delta["mapping_digest"] == "sha256:m"
    assert delta["decision_digest"] == "sha256:d"
