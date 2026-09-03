package commands

import "testing"

func TestInitialGenesisMandateStateIncludesVersionAndSignature(t *testing.T) {
	state := initialGenesisMandateState("m1", "genesis", "project", "project-id", "cli", "", nil, "2026-08-27T10:00:00Z")
	if state["stateVersion"] != 1 || state["updatedAt"] != "2026-08-27T10:00:00Z" {
		t.Fatalf("version fields=%#v", state)
	}
	if state["projectId"] != "project-id" {
		t.Fatalf("projectId=%#v", state["projectId"])
	}
	signature := state["signature"].(map[string]interface{})
	artifacts := signature["artifacts"].(map[string]interface{})
	if signature["status"] != "not_ready" || signature["intentId"] != nil || artifacts["humanSyncPersisted"] != false {
		t.Fatalf("signature=%#v", signature)
	}
}

func TestInitialGenesisMandateStateAllowsEmptyProjectID(t *testing.T) {
	state := initialGenesisMandateState("m1", "genesis", "project", "", "cli", "", nil, "2026-08-27T10:00:00Z")
	if state["projectId"] != "" {
		t.Fatalf("projectId=%#v, want empty string", state["projectId"])
	}
}
