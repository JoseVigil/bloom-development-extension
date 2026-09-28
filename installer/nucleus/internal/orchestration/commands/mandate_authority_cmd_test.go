package commands

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/spf13/cobra"
	"nucleus/internal/authority"
	"nucleus/internal/orchestration/mandatecontract"
)

func TestMandateActsExposeDistinctHumanAndJSONHelp(t *testing.T) {
	root := &cobra.Command{Use: "nucleus"}
	mandate := &cobra.Command{Use: "mandate"}
	root.AddCommand(mandate)
	for _, operation := range []string{"approve", "activate"} {
		mandate.AddCommand(createMandateActCommand(nil, operation))
		cmd, _, err := root.Find([]string{"mandate", operation})
		if err != nil || cmd.CommandPath() != "nucleus mandate "+operation || cmd.Long == "" || cmd.Example == "" || cmd.Flags().Lookup("id") == nil || cmd.Annotations["json_response"] == "" {
			t.Fatalf("%s help missing: %v", operation, err)
		}
	}
}

func TestMandateApprovalRequiresExplicitVerifiedModelPolicyAndBudget(t *testing.T) {
	if _, err := verifyIntelligenceSelection(mandatecontract.Intelligence{}); err == nil {
		t.Fatal("empty intelligence selection accepted")
	}
	root := t.TempDir()
	policy := filepath.Join(root, "policy.json")
	registry := filepath.Join(root, "registry.json")
	selected := mandatecontract.Intelligence{Model: "chosen-test-model", PolicyRef: policy, RegistryRef: registry, MaxUSD: "0.10", MaxTotalTokens: 1000, MaxOutputTokens: 100}
	policyRaw := []byte(`{"policy_version":"mandate-gen/v1","intelligence_supply":{"backend_id":"anthropic_api","fallback":[],"max_attempts":1,"max_output_tokens":100,"budget":{"per_mandate":true,"max_usd":"0.10","max_total_tokens":1000,"max_inferences":1}}}`)
	registryRaw := []byte(`{"intelligence_backends":[{"backend_id":"anthropic_api","provider":"anthropic","model":"chosen-test-model","credential_ref":"credential-ref://anthropic/default","health":"healthy","supply_enabled":true}]}`)
	if err := os.WriteFile(policy, policyRaw, 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(registry, registryRaw, 0600); err != nil {
		t.Fatal(err)
	}
	bound, err := verifyIntelligenceSelection(selected)
	if err != nil || bound.Model != selected.Model || bound.PolicySHA256 == "" || bound.RegistrySHA256 == "" {
		t.Fatalf("bound=%#v err=%v", bound, err)
	}
	for name, change := range map[string]func(*mandatecontract.Intelligence){
		"missing model":          func(i *mandatecontract.Intelligence) { i.Model = "" },
		"missing USD ceiling":    func(i *mandatecontract.Intelligence) { i.MaxUSD = "" },
		"missing token ceiling":  func(i *mandatecontract.Intelligence) { i.MaxTotalTokens = 0 },
		"policy budget mismatch": func(i *mandatecontract.Intelligence) { i.MaxUSD = "0.20" },
		"model mismatch":         func(i *mandatecontract.Intelligence) { i.Model = "another-model" },
	} {
		t.Run(name, func(t *testing.T) {
			candidate := selected
			change(&candidate)
			if _, err := verifyIntelligenceSelection(candidate); err == nil {
				t.Fatal("unbound intelligence selection accepted")
			}
		})
	}
	unknownRegistry := []byte(`{"intelligence_backends":[{"backend_id":"anthropic_api","provider":"anthropic","model":"chosen-test-model","credential_ref":"credential-ref://anthropic/default","health":"unknown","supply_enabled":true}]}`)
	if err := os.WriteFile(registry, unknownRegistry, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := verifyIntelligenceSelection(selected); err == nil {
		t.Fatal("model without verified availability accepted")
	}
	if err := os.WriteFile(registry, []byte(`{"intelligence_backends":[]}`), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := verifyIntelligenceSelection(bound); err == nil {
		t.Fatal("changed registry accepted")
	}
}

func TestConfirmedContractAndLocalActStateRecoverWithoutChangingDigest(t *testing.T) {
	root := t.TempDir()
	id := "m-1"
	dir := filepath.Join(root, id)
	auth := filepath.Join(root, "authority")
	if err := os.MkdirAll(filepath.Join(dir, "inputs"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(auth, 0700); err != nil {
		t.Fatal(err)
	}
	source := []byte("# Billing\n")
	if err := os.WriteFile(filepath.Join(dir, "inputs", "source.md"), source, 0600); err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(source)
	state := map[string]any{"mandateId": id, "project": "app", "projectId": "project-1", "stateVersion": 1, "updatedAt": "2026-09-26T00:00:00Z", "signature": map[string]any{"status": "pending"}, "phases": map[string]any{"validate": map[string]any{"humanSync": map[string]any{"candidateDomains": []any{map[string]any{"domainId": "d-1", "name": "Billing"}}, "confirmedDomainIds": []string{"d-1"}, "files": []mandatecontract.Input{{Ref: "inputs/source.md", SHA256: hex.EncodeToString(sum[:]), Size: int64(len(source))}}}}}}
	raw, _ := json.Marshal(state)
	if err := os.WriteFile(filepath.Join(dir, "mandate_state.json"), raw, 0600); err != nil {
		t.Fatal(err)
	}
	bindings, _ := json.Marshal(map[string]any{"project_bindings": []any{map[string]any{"organization_id": "org", "tenant_id": "tenant", "project_id": "project-1", "revision": "rev-1", "source_ref": "installation:receipt", "evidence_kind": "canonical", "confirmed_at": time.Now().UTC().Format(time.RFC3339)}}})
	if err := os.WriteFile(filepath.Join(auth, "project-bindings.json"), bindings, 0600); err != nil {
		t.Fatal(err)
	}
	contract, err := buildConfirmedContract(dir, id, "org", auth)
	if err != nil {
		t.Fatal(err)
	}
	digest, err := mandatecontract.Digest(contract)
	if err != nil {
		t.Fatal(err)
	}
	public, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	identity := &authority.LocalIdentity{InstallationID: "installation-1", PublicKey: public, PrivateKey: private}
	identityRaw, _ := json.Marshal(map[string]string{"installation_id": identity.InstallationID, "public_key": base64.StdEncoding.EncodeToString(public)})
	identityPath := filepath.Join(root, "identity.json")
	if err := os.WriteFile(identityPath, identityRaw, 0600); err != nil {
		t.Fatal(err)
	}
	if err := persistApprovedContract(dir, contract, identity); err != nil {
		t.Fatal(err)
	}
	if err := persistSignedState(dir, digest); err != nil {
		t.Fatal(err)
	}
	if err := persistApprovedContract(dir, contract, identity); err != nil {
		t.Fatal(err)
	}
	if err := persistSignedState(dir, digest); err != nil {
		t.Fatal(err)
	}
	if err := persistActivationState(dir, digest); err != nil {
		t.Fatal(err)
	}
	if err := persistActivationState(dir, digest); err != nil {
		t.Fatal(err)
	}
	reloaded, err := mandatecontract.LoadVerified(dir, identityPath)
	if err != nil || reloaded.ContractDigest != digest {
		t.Fatalf("restart contract=%#v err=%v", reloaded, err)
	}
	if err := os.WriteFile(filepath.Join(dir, "inputs", "source.md"), []byte("altered"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := buildConfirmedContract(dir, id, "org", auth); err == nil {
		t.Fatal("altered frozen File accepted")
	}
}
