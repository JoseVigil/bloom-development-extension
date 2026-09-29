package mandatecontract

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func fixtureContract() Contract {
	return Contract{
		MandateID: "mandate-1", ContractVersion: 1, OrganizationID: "org-1", ProjectID: "project-1",
		ProjectBinding: "claim-1", Objective: "Define one domain from approved files",
		Domain: Domain{ID: "domain-1", Name: "Identity"},
		Action: Action{ActionID: "action-1", Type: "run_intent", IntentType: "gen", DomainID: "domain-1",
			ArtifactRef: "domain_definition.json", IdempotencyKey: "key-1"},
		Inputs: []Input{{Ref: "inputs/source.md", SHA256: strings.Repeat("a", 64), Size: 4}},
		Fulfillment: Fulfillment{Evaluator: "domain-definition-structure", EvaluatorVersion: "1",
			RequiredFields: []string{"domainId", "purpose", "boundaries", "concepts", "decisions", "sources"}},
	}
}

func TestFreezeFilesSnapshotsAndRejectsChangedDocuments(t *testing.T) {
	dir := t.TempDir()
	if err := os.Mkdir(filepath.Join(dir, "docs"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "docs", "source.md"), []byte("original"), 0600); err != nil {
		t.Fatal(err)
	}
	first, err := FreezeFiles(dir, []string{"source.md"})
	if err != nil || len(first) != 1 || first[0].Ref != "inputs/source.md" || first[0].Size != 8 {
		t.Fatalf("freeze=%#v err=%v", first, err)
	}
	second, err := FreezeFiles(dir, []string{"source.md"})
	if err != nil || second[0] != first[0] {
		t.Fatalf("retry=%#v err=%v", second, err)
	}
	if err := os.WriteFile(filepath.Join(dir, "docs", "source.md"), []byte("altered"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := FreezeFiles(dir, []string{"source.md"}); err == nil {
		t.Fatal("changed source accepted")
	}
	if _, err := FreezeFiles(dir, []string{"../escape"}); err == nil {
		t.Fatal("path escape accepted")
	}
}

func TestContractRequiresClosedInputsAndOneGenAction(t *testing.T) {
	valid := fixtureContract()
	if err := valid.Validate(); err != nil {
		t.Fatal(err)
	}
	for name, change := range map[string]func(*Contract){
		"path escape":    func(c *Contract) { c.Inputs[0].Ref = "../secret" },
		"missing digest": func(c *Contract) { c.Inputs[0].SHA256 = "" },
		"other action":   func(c *Contract) { c.Action.IntentType = "other" },
		"other domain":   func(c *Contract) { c.Action.DomainID = "other" },
		"other artifact": func(c *Contract) { c.Action.ArtifactRef = "_INCOMPLETE_SCAFFOLD.json" },
	} {
		t.Run(name, func(t *testing.T) {
			candidate := fixtureContract()
			change(&candidate)
			if err := candidate.Validate(); err == nil {
				t.Fatal("invalid contract accepted")
			}
		})
	}
}

func TestVersionTwoBindsIntelligenceSelection(t *testing.T) {
	contract := fixtureContract()
	contract.ContractVersion = 2
	if err := contract.Validate(); err == nil {
		t.Fatal("missing intelligence accepted")
	}
	credential := "credential-ref://anthropic/default"
	contract.Intelligence = &Intelligence{Provider: "anthropic", BackendID: "anthropic_api", Model: "selected-model",
		CredentialRef: &credential, PolicyRef: filepath.Join(t.TempDir(), "policy.json"),
		PolicyVersion: "mandate-gen/v1", PolicySHA256: strings.Repeat("a", 64), RegistryRef: filepath.Join(t.TempDir(), "registry.json"),
		RegistrySHA256: strings.Repeat("b", 64), MaxUSD: "0.10", MaxTotalTokens: 1000, MaxOutputTokens: 100}
	if err := contract.Validate(); err != nil {
		t.Fatal(err)
	}
	before, err := Digest(contract)
	if err != nil {
		t.Fatal(err)
	}
	contract.Intelligence.Model = "other-model"
	after, err := Digest(contract)
	if err != nil || before == after {
		t.Fatal("model did not change signed digest")
	}
	contract.Intelligence.Model = "selected-model"
	contract.Intelligence.MaxUSD = "0.20"
	budgetDigest, err := Digest(contract)
	if err != nil || before == budgetDigest {
		t.Fatal("budget did not change signed digest")
	}
	contract.Intelligence.MaxUSD = "0.10"
	contract.Intelligence.PolicySHA256 = strings.Repeat("c", 64)
	policyDigest, err := Digest(contract)
	if err != nil || before == policyDigest {
		t.Fatal("policy did not change signed digest")
	}
	contract.Intelligence.Model = ""
	if err := contract.Validate(); err == nil {
		t.Fatal("missing model accepted")
	}
}

func TestVersionThreeRequiresBoundLocalResources(t *testing.T) {
	c := fixtureContract()
	c.ContractVersion = 3
	c.Intelligence = &Intelligence{Provider: "ollama", BackendID: "local.ollama.selected", ModelID: "selected", Model: "selected:tag",
		Privacy: "local", PolicyRef: filepath.Join(t.TempDir(), "policy.json"), PolicyVersion: "mandate-gen-local/v1",
		PolicySHA256: strings.Repeat("a", 64), RegistryRef: filepath.Join(t.TempDir(), "registry.json"),
		RegistrySHA256: strings.Repeat("b", 64), RegistrySnapshotID: "local-snapshot",
		AccessPolicyVersion: "local-access-default/v1", AccessPolicySHA256: strings.Repeat("c", 64),
		ModelManifestSHA256: strings.Repeat("d", 64), MaxUSD: "0", MaxTotalTokens: 1000, MaxOutputTokens: 100}
	if err := c.Validate(); err != nil {
		t.Fatal(err)
	}
	before, _ := Digest(c)
	c.Intelligence.ModelManifestSHA256 = strings.Repeat("e", 64)
	after, _ := Digest(c)
	if before == after {
		t.Fatal("manifest digest not signed")
	}
	c.Intelligence.CredentialRef = new(string)
	if err := c.Validate(); err == nil {
		t.Fatal("local credential accepted")
	}
}
