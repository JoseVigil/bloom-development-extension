package activities

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/gofrs/flock"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"time"
	"unicode/utf8"

	"nucleus/internal/authority"
	"nucleus/internal/core"
	"nucleus/internal/orchestration/mandatecontract"
	"nucleus/internal/orchestration/mandateintelligence"
)

// MandateGenActivity is registered by the worker with its own installation
// identity path. Neither that path nor the executable plan comes from a
// workflow signal. Brain proposes content; Nucleus validates and commits it.
type MandateGenActivity struct {
	IdentityPath string
	TrustRoots   map[string]ed25519.PublicKey
	BrainPath    string
	RunBrain     func(context.Context, []byte) ([]byte, error)
	RunAITAP     mandateintelligence.Runner
	Logger       *core.Logger
}

type MandateGenInput struct {
	MandatesRoot string
	MandateID    string
}

type MandateGenResult struct {
	MandateID         string `json:"mandateId"`
	ActionID          string `json:"actionId"`
	ContractDigest    string `json:"contractDigest"`
	ArtifactRef       string `json:"artifactRef"`
	ArtifactSHA256    string `json:"artifactSha256"`
	FulfillmentStatus string `json:"fulfillmentStatus"`
	AlreadyApplied    bool   `json:"alreadyApplied"`
}

func (a *MandateGenActivity) Run(ctx context.Context, input MandateGenInput) (MandateGenResult, error) {
	if a == nil || a.IdentityPath == "" || input.MandatesRoot == "" || input.MandateID == "" || filepath.Base(input.MandateID) != input.MandateID {
		if a != nil {
			a.emit("mandate.execution.denied", map[string]interface{}{"mandateId": input.MandateID, "reason": "context_invalid"})
		}
		return MandateGenResult{}, errors.New("Mandate execution context invalid")
	}
	dir := filepath.Join(input.MandatesRoot, input.MandateID)
	envelope, err := mandatecontract.LoadVerified(dir, a.IdentityPath)
	if err != nil {
		a.emit("mandate.execution.denied", map[string]interface{}{"mandateId": input.MandateID, "reason": "contract_invalid"})
		return MandateGenResult{}, err
	}
	identity, err := authority.LoadExistingLocalIdentity(a.IdentityPath)
	if err != nil {
		return MandateGenResult{}, err
	}
	for _, operation := range []string{"approve", "activate"} {
		receipt, loadErr := mandatecontract.LoadActReceipt(dir, operation)
		if loadErr != nil {
			return MandateGenResult{}, loadErr
		}
		roots := a.TrustRoots
		if roots == nil {
			roots = authority.DevelopmentPinnedRoots()
		}
		if err := mandatecontract.VerifyActReceipt(receipt, identity, roots, operation, input.MandateID, envelope.ContractDigest, envelope.Contract.ProjectID); err != nil {
			a.emit("mandate.execution.denied", map[string]interface{}{"mandateId": input.MandateID, "reason": "human_act_invalid", "operation": operation})
			return MandateGenResult{}, err
		}
	}
	lock := flock.New(filepath.Join(dir, "domain_definition.json.lock"))
	if err := lock.Lock(); err != nil {
		return MandateGenResult{}, err
	}
	defer lock.Unlock()
	return a.runGenAfterActivation(ctx, input)
}

// runGenAfterActivation contains the independently testable effect path.
// Only a verified activation decision may call it from Run.
func (a *MandateGenActivity) runGenAfterActivation(ctx context.Context, input MandateGenInput) (result MandateGenResult, runErr error) {
	defer func() {
		if runErr != nil {
			a.emit("mandate.gen.failed", map[string]interface{}{"mandateId": input.MandateID, "error": runErr.Error()})
		}
	}()
	if a == nil || a.IdentityPath == "" || (a.BrainPath == "" && a.RunBrain == nil) || input.MandatesRoot == "" || input.MandateID == "" || filepath.Base(input.MandateID) != input.MandateID {
		return MandateGenResult{}, errors.New("Mandate gen prerequisites unavailable")
	}
	dir := filepath.Join(input.MandatesRoot, input.MandateID)
	envelope, err := mandatecontract.LoadVerified(dir, a.IdentityPath)
	if err != nil {
		return MandateGenResult{}, err
	}
	if err := requireActiveMandate(dir, envelope.ContractDigest); err != nil {
		return MandateGenResult{}, err
	}
	if (envelope.Contract.ContractVersion != 2 && envelope.Contract.ContractVersion != 3) || envelope.Contract.Intelligence == nil {
		return MandateGenResult{}, errors.New("signed intelligence selection and budget required")
	}
	if envelope.Contract.ContractVersion == 3 {
		if err := a.verifyLocalObservation(ctx, *envelope.Contract.Intelligence); err != nil {
			return MandateGenResult{}, err
		}
	}
	for _, resource := range []struct{ path, digest string }{{envelope.Contract.Intelligence.PolicyRef, envelope.Contract.Intelligence.PolicySHA256}, {envelope.Contract.Intelligence.RegistryRef, envelope.Contract.Intelligence.RegistrySHA256}} {
		content, readErr := os.ReadFile(resource.path)
		if readErr != nil {
			return MandateGenResult{}, readErr
		}
		sum := sha256.Sum256(content)
		if hex.EncodeToString(sum[:]) != resource.digest {
			return MandateGenResult{}, errors.New("signed AITAP policy or registry changed")
		}
	}
	a.emit("mandate.gen.started", map[string]interface{}{"mandateId": input.MandateID, "actionId": envelope.Contract.Action.ActionID,
		"contractDigest": envelope.ContractDigest, "intentType": "gen"})
	sources, err := frozenSources(dir, envelope.Contract.Inputs)
	if err != nil {
		return MandateGenResult{}, err
	}
	request, err := json.Marshal(map[string]interface{}{
		"contract": envelope.Contract, "contractDigest": envelope.ContractDigest, "sources": sources,
		"supply": map[string]string{"directory": filepath.Join(dir, ".gen-supply"), "policyRef": envelope.Contract.Intelligence.PolicyRef, "registryRef": envelope.Contract.Intelligence.RegistryRef},
	})
	if err != nil {
		return MandateGenResult{}, err
	}
	var output []byte
	if a.RunBrain != nil {
		output, err = a.RunBrain(ctx, request)
	} else {
		command := exec.CommandContext(ctx, a.BrainPath, "--json", "intent", "gen-domain")
		command.Stdin = bytes.NewReader(request)
		output, err = command.Output()
	}
	if err != nil {
		return MandateGenResult{}, fmt.Errorf("Brain gen failed: %w", err)
	}
	var response struct {
		Status    string                 `json:"status"`
		Data      map[string]interface{} `json:"data"`
		Inference struct {
			LogicalInferenceID string `json:"logicalInferenceId"`
			RawResponseDigest  string `json:"rawResponseDigest"`
			AccountingRef      string `json:"accountingRef"`
			Model              string `json:"model"`
		} `json:"inference"`
	}
	if err := json.Unmarshal(output, &response); err != nil || response.Status != "success" {
		return MandateGenResult{}, errors.New("Brain gen returned an invalid response")
	}
	if err := verifyDomainDefinition(response.Data, envelope); err != nil {
		return MandateGenResult{}, err
	}
	if err := verifyGenSupplyEvidence(filepath.Join(dir, ".gen-supply"), envelope, response.Data,
		response.Inference.LogicalInferenceID, response.Inference.RawResponseDigest, response.Inference.AccountingRef, response.Inference.Model); err != nil {
		return MandateGenResult{}, err
	}
	for _, resource := range []struct{ path, digest string }{{envelope.Contract.Intelligence.PolicyRef, envelope.Contract.Intelligence.PolicySHA256}, {envelope.Contract.Intelligence.RegistryRef, envelope.Contract.Intelligence.RegistrySHA256}} {
		content, readErr := os.ReadFile(resource.path)
		if readErr != nil {
			return MandateGenResult{}, readErr
		}
		sum := sha256.Sum256(content)
		if hex.EncodeToString(sum[:]) != resource.digest {
			return MandateGenResult{}, errors.New("AITAP policy or registry changed during inference")
		}
	}
	if envelope.Contract.ContractVersion == 3 {
		if err := a.verifyLocalObservation(ctx, *envelope.Contract.Intelligence); err != nil {
			return MandateGenResult{}, err
		}
	}
	// Check durable inputs again after Brain returns. A source cannot be
	// swapped while the subprocess runs and still authorize this effect.
	if _, err := frozenSources(dir, envelope.Contract.Inputs); err != nil {
		return MandateGenResult{}, err
	}
	if err := requireActiveMandate(dir, envelope.ContractDigest); err != nil {
		return MandateGenResult{}, err
	}
	verifiedAgain, err := mandatecontract.LoadVerified(dir, a.IdentityPath)
	if err != nil {
		return MandateGenResult{}, err
	}
	if verifiedAgain.ContractDigest != envelope.ContractDigest {
		return MandateGenResult{}, errors.New("signed Mandate changed during gen")
	}
	artifact, err := json.MarshalIndent(response.Data, "", "  ")
	if err != nil {
		return MandateGenResult{}, err
	}
	artifact = append(artifact, '\n')
	artifactPath := filepath.Join(dir, envelope.Contract.Action.ArtifactRef)
	alreadyApplied := false
	if info, statErr := os.Lstat(artifactPath); statErr == nil {
		if !info.Mode().IsRegular() {
			return MandateGenResult{}, errors.New("domain definition target is not a regular file")
		}
	} else if !os.IsNotExist(statErr) {
		return MandateGenResult{}, statErr
	}
	if existing, readErr := os.ReadFile(artifactPath); readErr == nil {
		if !bytes.Equal(existing, artifact) {
			return MandateGenResult{}, errors.New("existing domain definition conflicts with signed Action")
		}
		alreadyApplied = true
	} else if !os.IsNotExist(readErr) {
		return MandateGenResult{}, readErr
	} else {
		tmp, createErr := os.CreateTemp(dir, ".domain-definition-*")
		if createErr != nil {
			return MandateGenResult{}, createErr
		}
		tmpName := tmp.Name()
		defer os.Remove(tmpName)
		if _, err := tmp.Write(artifact); err != nil {
			tmp.Close()
			return MandateGenResult{}, err
		}
		if err := tmp.Sync(); err != nil {
			tmp.Close()
			return MandateGenResult{}, err
		}
		if err := tmp.Close(); err != nil {
			return MandateGenResult{}, err
		}
		if err := os.Rename(tmpName, artifactPath); err != nil {
			return MandateGenResult{}, err
		}
	}
	sum := sha256.Sum256(artifact)
	result = MandateGenResult{MandateID: input.MandateID, ActionID: envelope.Contract.Action.ActionID,
		ContractDigest: envelope.ContractDigest, ArtifactRef: envelope.Contract.Action.ArtifactRef,
		ArtifactSHA256: hex.EncodeToString(sum[:]), FulfillmentStatus: "fulfilled", AlreadyApplied: alreadyApplied}
	a.emit("mandate.gen.fulfilled", map[string]interface{}{"mandateId": input.MandateID, "actionId": result.ActionID,
		"contractDigest": result.ContractDigest, "artifactSha256": result.ArtifactSHA256, "fulfillmentStatus": result.FulfillmentStatus,
		"alreadyApplied": result.AlreadyApplied})
	return result, nil
}

func (a *MandateGenActivity) verifyLocalObservation(ctx context.Context, selection mandatecontract.Intelligence) error {
	version, digest, err := mandateintelligence.PolicyFingerprint(ctx, a.RunAITAP)
	if err != nil {
		return err
	}
	if version != selection.AccessPolicyVersion || digest != selection.AccessPolicySHA256 {
		return errors.New("signed local access policy changed")
	}
	observed, err := mandateintelligence.Observe(ctx, a.RunAITAP, selection.ModelID, selection.Model, time.Now().UTC())
	if err != nil {
		return err
	}
	if observed.ManifestSHA256 != selection.ModelManifestSHA256 {
		return errors.New("signed local model digest changed")
	}
	return nil
}

func verifyGenSupplyEvidence(dir string, envelope mandatecontract.Envelope, artifact map[string]interface{}, logicalID, rawDigest, accountingRef, model string) error {
	if len(logicalID) != 71 || !strings.HasPrefix(logicalID, "sha256:") || rawDigest == "" || accountingRef == "" || model != envelope.Contract.Intelligence.Model {
		return errors.New("AITAP inference evidence missing or wrong model")
	}
	requestBytes, err := os.ReadFile(filepath.Join(dir, ".request.json"))
	if err != nil {
		return err
	}
	var request struct {
		LogicalID string `json:"logical_inference_id"`
		Intent    struct {
			MandateID string `json:"mandate_id"`
			Type      string `json:"intent_type"`
			Phase     string `json:"phase"`
		} `json:"intent"`
		Payload struct {
			ContractDigest string `json:"contractDigest"`
		} `json:"payload"`
		Routing struct {
			PolicyVersion string `json:"policy_version"`
			Privacy       string `json:"privacy"`
		} `json:"routing"`
	}
	if json.Unmarshal(requestBytes, &request) != nil || request.LogicalID != logicalID || request.Intent.MandateID != envelope.Contract.MandateID || request.Intent.Type != "gen" || request.Intent.Phase != "generation" || request.Payload.ContractDigest != envelope.ContractDigest || request.Routing.PolicyVersion != envelope.Contract.Intelligence.PolicyVersion {
		return errors.New("AITAP request differs from signed Mandate")
	}
	if envelope.Contract.ContractVersion == 3 && request.Routing.Privacy != "local" {
		return errors.New("AITAP request privacy differs from signed Mandate")
	}
	resultBytes, err := os.ReadFile(filepath.Join(dir, ".supply_result.json"))
	if err != nil {
		return err
	}
	var result struct {
		LogicalID         string `json:"logical_inference_id"`
		Outcome           string `json:"outcome"`
		RawResponse       string `json:"raw_response"`
		RawDigest         string `json:"raw_response_digest"`
		AccountingRef     string `json:"accounting_ref"`
		Model             string `json:"model"`
		Provider          string `json:"provider"`
		RoutingDecisionID string `json:"routing_decision_id"`
		RoutingDecision   struct {
			RoutingDecisionID  string `json:"routing_decision_id"`
			LogicalID          string `json:"logical_inference_id"`
			PolicyVersion      string `json:"policy_version"`
			RegistrySnapshotID string `json:"registry_snapshot_id"`
			Effective          struct {
				BackendID     string  `json:"backend_id"`
				Provider      string  `json:"provider"`
				Model         string  `json:"model"`
				ModelDigest   string  `json:"model_digest"`
				Privacy       string  `json:"privacy"`
				CredentialRef *string `json:"credential_ref"`
			} `json:"effective_intelligence"`
			Fingerprints struct {
				SupplyPolicy  string `json:"supply_policy_sha256"`
				Registry      string `json:"registry_sha256"`
				AccessPolicy  string `json:"access_policy_sha256"`
				ModelManifest string `json:"model_manifest_sha256"`
			} `json:"resource_fingerprints"`
		} `json:"routing_decision"`
	}
	credentialMatches := false
	if json.Unmarshal(resultBytes, &result) == nil {
		credentialMatches = result.RoutingDecision.Effective.CredentialRef == nil && envelope.Contract.Intelligence.CredentialRef == nil || result.RoutingDecision.Effective.CredentialRef != nil && envelope.Contract.Intelligence.CredentialRef != nil && *result.RoutingDecision.Effective.CredentialRef == *envelope.Contract.Intelligence.CredentialRef
	}
	if !credentialMatches || result.LogicalID != logicalID || result.Outcome != "completed" || result.RawDigest != rawDigest || result.AccountingRef != accountingRef || result.AccountingRef != "accounting://inference/"+logicalID[7:] || result.Model != model || result.RoutingDecision.Effective.BackendID != envelope.Contract.Intelligence.BackendID {
		return errors.New("AITAP durable result missing or inconsistent")
	}
	if envelope.Contract.ContractVersion == 3 {
		i := envelope.Contract.Intelligence
		route := result.RoutingDecision
		var exact struct {
			RoutingDecision struct {
				Effective map[string]json.RawMessage `json:"effective_intelligence"`
			} `json:"routing_decision"`
		}
		if json.Unmarshal(resultBytes, &exact) != nil || string(exact.RoutingDecision.Effective["credential_ref"]) != "null" {
			return errors.New("AITAP local credential reference must be JSON null")
		}
		if result.Provider != "ollama" || route.RoutingDecisionID != result.RoutingDecisionID || route.LogicalID != logicalID || route.PolicyVersion != i.PolicyVersion || route.RegistrySnapshotID != i.RegistrySnapshotID || route.Effective.Provider != "ollama" || route.Effective.Model != i.Model || route.Effective.ModelDigest != i.ModelManifestSHA256 || route.Effective.Privacy != "local" || route.Fingerprints.SupplyPolicy != i.PolicySHA256 || route.Fingerprints.Registry != i.RegistrySHA256 || route.Fingerprints.AccessPolicy != i.AccessPolicySHA256 || route.Fingerprints.ModelManifest != i.ModelManifestSHA256 {
			return errors.New("AITAP local decision differs from signed resources")
		}
	}
	stateDir := os.Getenv("AITAP_STATE_DIR")
	if stateDir == "" {
		return errors.New("AITAP accounting directory unavailable")
	}
	journalBytes, err := os.ReadFile(filepath.Join(stateDir, logicalID[7:]+".json"))
	if err != nil {
		return err
	}
	var recorded struct {
		JournalDigest string          `json:"journal_digest"`
		JournalRaw    json.RawMessage `json:"journal"`
	}
	var journal struct {
		State    string            `json:"state"`
		Attempts []json.RawMessage `json:"attempts"`
		Result   struct {
			LogicalID       string          `json:"logical_inference_id"`
			RawDigest       string          `json:"raw_response_digest"`
			RoutingDecision json.RawMessage `json:"routing_decision"`
		} `json:"result"`
	}
	if json.Unmarshal(journalBytes, &recorded) != nil || json.Unmarshal(recorded.JournalRaw, &journal) != nil || journal.State != "completed" || len(journal.Attempts) != 1 || journal.Result.LogicalID != logicalID || journal.Result.RawDigest != rawDigest {
		return errors.New("AITAP accounting journal is incomplete or uncertain")
	}
	canonicalJournal, err := authority.Canonicalize(recorded.JournalRaw)
	if err != nil {
		return err
	}
	journalSum := sha256.Sum256(canonicalJournal)
	if recorded.JournalDigest != "sha256:"+hex.EncodeToString(journalSum[:]) {
		return errors.New("AITAP accounting journal integrity invalid")
	}
	if envelope.Contract.ContractVersion == 3 {
		var completeResult struct {
			RoutingDecision json.RawMessage `json:"routing_decision"`
		}
		if json.Unmarshal(resultBytes, &completeResult) != nil {
			return errors.New("AITAP local result unreadable")
		}
		left, leftErr := authority.Canonicalize(completeResult.RoutingDecision)
		right, rightErr := authority.Canonicalize(journal.Result.RoutingDecision)
		if leftErr != nil || rightErr != nil || !bytes.Equal(left, right) {
			return errors.New("AITAP local decision differs from durable journal")
		}
	}
	sum := sha256.Sum256([]byte(result.RawResponse))
	if "sha256:"+hex.EncodeToString(sum[:]) != rawDigest {
		return errors.New("AITAP raw response altered")
	}
	var proposed map[string]interface{}
	if json.Unmarshal([]byte(result.RawResponse), &proposed) != nil {
		return errors.New("AITAP raw response invalid")
	}
	for _, field := range []string{"purpose", "boundaries", "concepts", "decisions"} {
		if !reflect.DeepEqual(proposed[field], artifact[field]) {
			return errors.New("domain definition differs from AITAP response")
		}
	}
	return nil
}

func (a *MandateGenActivity) emit(event string, fields map[string]interface{}) {
	if a == nil || a.Logger == nil {
		return
	}
	fields["event"] = event
	raw, err := json.Marshal(fields)
	if err == nil {
		a.Logger.Info("%s", raw)
	}
}

func requireActiveMandate(dir, digest string) error {
	raw, err := os.ReadFile(filepath.Join(dir, "mandate_state.json"))
	if err != nil {
		return err
	}
	var state struct {
		Activation struct {
			Status         string `json:"status"`
			ContractDigest string `json:"contractDigest"`
		} `json:"activation"`
	}
	if err := json.Unmarshal(raw, &state); err != nil {
		return err
	}
	if state.Activation.Status != "active" || state.Activation.ContractDigest != digest {
		return errors.New("Mandate is not activated for this signed digest")
	}
	return nil
}

func frozenSources(dir string, inputs []mandatecontract.Input) ([]map[string]string, error) {
	sources := make([]map[string]string, 0, len(inputs))
	for _, input := range inputs {
		current := dir
		parts := strings.Split(input.Ref, "/")
		for index, part := range parts {
			current = filepath.Join(current, part)
			info, err := os.Lstat(current)
			if err != nil {
				return nil, err
			}
			if info.Mode()&os.ModeSymlink != 0 || (index < len(parts)-1 && !info.IsDir()) || (index == len(parts)-1 && !info.Mode().IsRegular()) {
				return nil, fmt.Errorf("input %q is not a regular file under the Mandate", input.Ref)
			}
		}
		raw, err := os.ReadFile(current)
		if err != nil {
			return nil, err
		}
		if !utf8.Valid(raw) || int64(len(raw)) != input.Size {
			return nil, fmt.Errorf("input %q size or encoding mismatch", input.Ref)
		}
		sum := sha256.Sum256(raw)
		if hex.EncodeToString(sum[:]) != input.SHA256 {
			return nil, fmt.Errorf("input %q digest mismatch", input.Ref)
		}
		sources = append(sources, map[string]string{"ref": input.Ref, "content": string(raw)})
	}
	return sources, nil
}

func verifyDomainDefinition(data map[string]interface{}, envelope mandatecontract.Envelope) error {
	c := envelope.Contract
	allowed := map[string]bool{"schemaVersion": true, "mandateId": true, "contractDigest": true, "domainId": true,
		"name": true, "purpose": true, "boundaries": true, "concepts": true, "decisions": true, "sources": true}
	if len(data) != len(allowed) {
		return errors.New("domain definition has missing or extra top-level fields")
	}
	for key := range data {
		if !allowed[key] {
			return fmt.Errorf("domain definition field %q is not authorized", key)
		}
	}
	for key, expected := range map[string]string{
		"mandateId": c.MandateID, "contractDigest": envelope.ContractDigest,
		"domainId": c.Domain.ID, "name": c.Domain.Name, "purpose": c.Objective,
	} {
		if data[key] != expected {
			return fmt.Errorf("domain definition %s conflicts with signed plan", key)
		}
	}
	if data["schemaVersion"] != "1.0" || data["boundaries"] == nil || data["concepts"] == nil || data["decisions"] == nil {
		return errors.New("domain definition structural fields missing")
	}
	if _, ok := data["boundaries"].(map[string]interface{}); !ok {
		return errors.New("boundaries must be an object")
	}
	if _, ok := data["concepts"].([]interface{}); !ok {
		return errors.New("concepts must be an array")
	}
	if _, ok := data["decisions"].([]interface{}); !ok {
		return errors.New("decisions must be an array")
	}
	want := make([]interface{}, 0, len(c.Inputs))
	for _, input := range c.Inputs {
		want = append(want, map[string]interface{}{"ref": input.Ref, "sha256": input.SHA256})
	}
	if !reflect.DeepEqual(data["sources"], want) {
		return errors.New("domain definition sources conflict with signed inputs")
	}
	return nil
}
