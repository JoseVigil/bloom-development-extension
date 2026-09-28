package acceptance

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"go.temporal.io/sdk/client"
	"nucleus/internal/authority"
	"nucleus/internal/orchestration/mandatecontract"
)

// Opt-in verifier for an operator-run acceptance with real Authority, Temporal,
// Nucleus worker and AITAP. It makes no provider call and never creates grants.
func TestMandateGenE2EOptIn(t *testing.T) {
	if os.Getenv("MANDATE_GEN_E2E_OPT_IN") != "1" {
		t.Skip("requires separately approved live acceptance")
	}
	root, id, identityPath := os.Getenv("MANDATE_GEN_E2E_ROOT"), os.Getenv("MANDATE_GEN_E2E_ID"), os.Getenv("MANDATE_GEN_E2E_IDENTITY")
	stateDir, temporalAddress := os.Getenv("MANDATE_GEN_E2E_AITAP_STATE"), os.Getenv("MANDATE_GEN_E2E_TEMPORAL_ADDRESS")
	if root == "" || id == "" || identityPath == "" || stateDir == "" || temporalAddress == "" {
		t.Fatal("explicit acceptance context missing")
	}
	dir := filepath.Join(root, id)
	envelope, err := mandatecontract.LoadVerified(dir, identityPath)
	if err != nil {
		t.Fatal(err)
	}
	if envelope.Contract.ContractVersion != 2 || envelope.Contract.Intelligence == nil {
		t.Fatal("live Mandate lacks bound inference selection")
	}
	identity, err := authority.LoadExistingLocalIdentity(identityPath)
	if err != nil {
		t.Fatal(err)
	}
	for _, operation := range []string{"approve", "activate"} {
		receipt, loadErr := mandatecontract.LoadActReceipt(dir, operation)
		if loadErr != nil {
			t.Fatal(loadErr)
		}
		if verifyErr := mandatecontract.VerifyActReceipt(receipt, identity, authority.DevelopmentPinnedRoots(), operation, id, envelope.ContractDigest, envelope.Contract.ProjectID); verifyErr != nil {
			t.Fatal(verifyErr)
		}
	}
	requestRaw, err := os.ReadFile(filepath.Join(dir, ".gen-supply", ".request.json"))
	if err != nil {
		t.Fatal(err)
	}
	var request struct {
		LogicalID string `json:"logical_inference_id"`
		Intent    struct {
			MandateID string `json:"mandate_id"`
		} `json:"intent"`
		Payload struct {
			ContractDigest string `json:"contractDigest"`
		} `json:"payload"`
	}
	if json.Unmarshal(requestRaw, &request) != nil || request.Intent.MandateID != id || request.Payload.ContractDigest != envelope.ContractDigest || len(request.LogicalID) != 71 {
		t.Fatal("supply request does not match signed contract")
	}
	journalRaw, err := os.ReadFile(filepath.Join(stateDir, request.LogicalID[7:]+".json"))
	if err != nil {
		t.Fatal(err)
	}
	var journal struct {
		Journal struct {
			State    string            `json:"state"`
			Attempts []json.RawMessage `json:"attempts"`
			Result   struct {
				RawDigest string `json:"raw_response_digest"`
			} `json:"result"`
		} `json:"journal"`
	}
	if json.Unmarshal(journalRaw, &journal) != nil || journal.Journal.State != "completed" || len(journal.Journal.Attempts) != 1 {
		t.Fatal("one completed inference not evidenced")
	}
	artifactRaw, err := os.ReadFile(filepath.Join(dir, "domain_definition.json"))
	if err != nil {
		t.Fatal(err)
	}
	var artifact struct {
		MandateID      string `json:"mandateId"`
		ContractDigest string `json:"contractDigest"`
		DomainID       string `json:"domainId"`
	}
	if json.Unmarshal(artifactRaw, &artifact) != nil || artifact.MandateID != id || artifact.ContractDigest != envelope.ContractDigest || artifact.DomainID != envelope.Contract.Domain.ID {
		t.Fatal("artifact differs from signed plan")
	}
	artifactHash := sha256.Sum256(artifactRaw)
	t.Logf("artifactSha256=%s logicalInferenceId=%s", hex.EncodeToString(artifactHash[:]), request.LogicalID)
	temporalClient, err := client.Dial(client.Options{HostPort: temporalAddress})
	if err != nil {
		t.Fatal(err)
	}
	defer temporalClient.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if _, err := temporalClient.DescribeWorkflowExecution(ctx, "mandate_build_"+id, ""); err != nil {
		t.Fatal(err)
	}
}
