package activities

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"nucleus/internal/authority"
	"nucleus/internal/orchestration/mandatecontract"
)

type MandateDISResult struct {
	MandateID       string
	ActionID        string
	ContractDigest  string
	IntentID        string
	INGIntentID     string
	INGResultRef    string
	INGResultDigest string
	ProposalRef     string
	ProposalDigest  string
	Status          string
}

// RunDIS starts or resumes only the signed DIS mapping Action. Ratification
// remains a separate human act; a mapping proposal cannot complete DIS.
func (a *MandateIntentActivity) RunDIS(ctx context.Context, input MandateIntentInput) (MandateDISResult, error) {
	var result MandateDISResult
	if ctx == nil || ctx.Err() != nil || input.MandateID == "" || filepath.Base(input.MandateID) != input.MandateID ||
		input.MandatesRoot == "" || a.IdentityPath == "" || a.BrainPath == "" {
		return result, fmt.Errorf("invalid DIS request")
	}
	dir := filepath.Join(input.MandatesRoot, input.MandateID)
	envelope, err := mandatecontract.LoadVerified(dir, a.IdentityPath)
	if err != nil {
		return result, err
	}
	if envelope.Contract.ContractVersion != 4 || envelope.Contract.MandateID != input.MandateID || len(envelope.Contract.Actions) != 6 ||
		envelope.Contract.Actions[0].IntentType != "ing" || envelope.Contract.Actions[1].IntentType != "dis" || envelope.Contract.Intelligence == nil {
		return result, fmt.Errorf("signed DIS Action invalid")
	}
	identity, err := authority.LoadExistingLocalIdentity(a.IdentityPath)
	if err != nil {
		return result, err
	}
	roots := a.TrustRoots
	if roots == nil {
		roots = authority.DevelopmentPinnedRoots()
	}
	for _, operation := range []string{"approve", "activate"} {
		receipt, loadErr := mandatecontract.LoadActReceipt(dir, operation)
		if loadErr != nil {
			return result, loadErr
		}
		if err := mandatecontract.VerifyActReceipt(receipt, identity, roots, operation,
			input.MandateID, envelope.ContractDigest, envelope.Contract.ProjectID); err != nil {
			return result, err
		}
	}
	if err := verifySignedINGResources(envelope.Contract); err != nil {
		return result, err
	}
	selection, err := mandatecontract.LoadConfirmedDestination(dir, a.IdentityPath, input.MandateID,
		envelope.ContractDigest, envelope.Contract.Actions[1].ActionID)
	if err != nil {
		return result, fmt.Errorf("confirmed DIS W4 selection required: %w", err)
	}
	selectionRaw, err := json.Marshal(selection)
	if err != nil {
		return result, err
	}
	var state struct {
		MandateID     string `json:"mandateId"`
		CurrentAction string `json:"currentAction"`
		Adoption      struct {
			ContractDigest string `json:"contractDigest"`
		} `json:"adoption"`
		Actions map[string]struct {
			IntentID       string `json:"intentId"`
			Status         string `json:"status"`
			ResultRef      string `json:"resultRef"`
			ResultSHA256   string `json:"resultSha256"`
			ProposalRef    string `json:"proposalRef"`
			ProposalSHA256 string `json:"proposalSha256"`
		} `json:"actions"`
	}
	stateRaw, err := os.ReadFile(filepath.Join(dir, "mandate_state.json"))
	if err != nil || json.Unmarshal(stateRaw, &state) != nil || state.MandateID != input.MandateID ||
		state.Adoption.ContractDigest != envelope.ContractDigest || state.CurrentAction != envelope.Contract.Actions[1].ActionID ||
		state.Actions[envelope.Contract.Actions[0].ActionID].Status != "completed" ||
		(state.Actions[envelope.Contract.Actions[1].ActionID].Status != "pending" &&
			state.Actions[envelope.Contract.Actions[1].ActionID].Status != "awaiting_human_decision") {
		return result, fmt.Errorf("DIS journal is not ready after completed ING")
	}
	ing := state.Actions[envelope.Contract.Actions[0].ActionID]
	nucleusRoot := resolveNucleusRootFromMandatesRoot(input.MandatesRoot)
	ingBase := filepath.Join(nucleusRoot, ".intents", ".ing")
	if !pathWithin(ingBase, ing.ResultRef) || ing.IntentID == "" {
		return result, fmt.Errorf("ING result outside Intent storage")
	}
	ingBytes, err := os.ReadFile(ing.ResultRef)
	if err != nil {
		return result, err
	}
	ingSum := sha256.Sum256(ingBytes)
	if hex.EncodeToString(ingSum[:]) != ing.ResultSHA256 {
		return result, fmt.Errorf("ING result digest changed")
	}
	var ingResult struct {
		Schema    string `json:"schema_version"`
		MandateID string `json:"mandate_id"`
		IntentID  string `json:"intent_id"`
		Status    string `json:"status"`
	}
	if json.Unmarshal(ingBytes, &ingResult) != nil || ingResult.Schema != "bloom.ing-result/v1" ||
		ingResult.MandateID != input.MandateID || ingResult.IntentID != ing.IntentID || ingResult.Status != "done" {
		return result, fmt.Errorf("ING result identity invalid")
	}
	intentRoot, intentID, err := findAdoptedDIS(nucleusRoot, input.MandateID)
	if err != nil {
		return result, err
	}
	runBrain := func(args []string) (*brainCLIResult, error) {
		return runBrainIntentJSONWithRunner(a.BrainPath, args, func(path string, argv []string) ([]byte, []byte, int, error) {
			cmd := exec.CommandContext(ctx, path, argv...)
			var stdout, stderr bytes.Buffer
			cmd.Stdout, cmd.Stderr = &stdout, &stderr
			runErr := cmd.Run()
			code := 0
			if runErr != nil {
				code = -1
				if exit, ok := runErr.(*exec.ExitError); ok {
					code = exit.ExitCode()
				}
			}
			return stdout.Bytes(), stderr.Bytes(), code, runErr
		})
	}
	if intentID == "" {
		if state.Actions[envelope.Contract.Actions[1].ActionID].Status != "pending" {
			return result, fmt.Errorf("recorded DIS Intent missing")
		}
		created, createErr := runBrain([]string{"--json", "intent", "create", "--type", "dis",
			"--name", envelope.Contract.Domain.Name, "--mandate-id", input.MandateID, "--nucleus-path", nucleusRoot})
		if createErr != nil {
			return result, createErr
		}
		intentID, _ = created.Data["intent_id"].(string)
		folder, _ := created.Data["folder_name"].(string)
		if intentID == "" || folder == "" || filepath.Base(folder) != folder {
			return result, fmt.Errorf("Brain create returned invalid DIS identity")
		}
		intentRoot = filepath.Join(nucleusRoot, ".intents", ".dis", folder)
	}
	proposalRef := filepath.Join(intentRoot, ".mapping", ".turn_1", ".files", ".mapping_proposal.json")
	if _, err := os.Stat(proposalRef); os.IsNotExist(err) {
		_, err = runBrain([]string{"--json", "intent", "supply", "--intent-root", intentRoot,
			"--semantic-index", filepath.Join(nucleusRoot, ".cache", ".semantic-index.json"),
			"--ing-result", ing.ResultRef, "--policy-version", envelope.Contract.Intelligence.PolicyVersion,
			"--policy", envelope.Contract.Intelligence.PolicyRef, "--registry", envelope.Contract.Intelligence.RegistryRef,
			"--destination", string(selectionRaw)})
		if err != nil {
			return result, err
		}
	} else if err != nil {
		return result, err
	}
	turnDir := filepath.Join(intentRoot, ".mapping", ".turn_1")
	requestRaw, err := os.ReadFile(filepath.Join(turnDir, ".request.json"))
	if err != nil {
		return result, err
	}
	var inferenceRequest struct {
		RequestID          string `json:"request_id"`
		LogicalInferenceID string `json:"logical_inference_id"`
		Intent             struct {
			MandateID  string `json:"mandate_id"`
			IntentID   string `json:"intent_id"`
			IntentType string `json:"intent_type"`
		} `json:"intent"`
		Routing struct {
			PolicyVersion string                               `json:"policy_version"`
			Destination   mandatecontract.ConfirmedDestination `json:"destination"`
		} `json:"routing"`
	}
	if json.Unmarshal(requestRaw, &inferenceRequest) != nil || inferenceRequest.Intent.MandateID != input.MandateID ||
		inferenceRequest.Intent.IntentID != intentID || inferenceRequest.Intent.IntentType != "dis" ||
		inferenceRequest.RequestID == "" || inferenceRequest.LogicalInferenceID == "" ||
		inferenceRequest.Routing.PolicyVersion != envelope.Contract.Intelligence.PolicyVersion ||
		inferenceRequest.Routing.Destination != selection {
		return result, fmt.Errorf("DIS inference request does not use confirmed W4 selection")
	}
	supplyRaw, err := os.ReadFile(filepath.Join(turnDir, ".supply_result.json"))
	if err != nil {
		return result, err
	}
	var supply struct {
		RequestID          string `json:"request_id"`
		LogicalInferenceID string `json:"logical_inference_id"`
		Outcome            string `json:"outcome"`
		Provider           string `json:"provider"`
		Model              string `json:"model"`
		RoutingDecision    struct {
			EffectiveIntelligence mandatecontract.ConfirmedDestination `json:"effective_intelligence"`
		} `json:"routing_decision"`
	}
	if json.Unmarshal(supplyRaw, &supply) != nil || supply.RequestID != inferenceRequest.RequestID ||
		supply.LogicalInferenceID != inferenceRequest.LogicalInferenceID || supply.Outcome != "completed" ||
		supply.Provider != selection.Provider ||
		supply.Model != selection.Model || supply.RoutingDecision.EffectiveIntelligence != selection {
		return result, fmt.Errorf("DIS inference used a different W4 destination")
	}
	proposalBytes, err := os.ReadFile(proposalRef)
	if err != nil {
		return result, err
	}
	var proposal struct {
		Schema          string            `json:"schema_version"`
		MandateID       string            `json:"mandate_id"`
		IntentID        string            `json:"intent_id"`
		INGResultRef    string            `json:"ing_result_ref"`
		INGResultDigest string            `json:"ing_result_digest"`
		Operations      []json.RawMessage `json:"operations"`
	}
	if json.Unmarshal(proposalBytes, &proposal) != nil || proposal.Schema != "bloom.dis-mapping/v1" ||
		proposal.MandateID != input.MandateID || proposal.IntentID != intentID || proposal.INGResultRef != ing.ResultRef ||
		proposal.INGResultDigest == "" || proposal.Operations == nil {
		return result, fmt.Errorf("DIS mapping proposal invalid")
	}
	canonicalING, err := authority.Canonicalize(ingBytes)
	if err != nil {
		return result, err
	}
	canonicalSum := sha256.Sum256(canonicalING)
	if proposal.INGResultDigest != "sha256:"+hex.EncodeToString(canonicalSum[:]) {
		return result, fmt.Errorf("DIS proposal ING binding mismatch")
	}
	proposalSum := sha256.Sum256(proposalBytes)
	if prior := state.Actions[envelope.Contract.Actions[1].ActionID]; prior.Status == "awaiting_human_decision" &&
		(prior.IntentID != intentID || prior.ProposalRef != proposalRef || prior.ProposalSHA256 != hex.EncodeToString(proposalSum[:])) {
		return result, fmt.Errorf("recorded DIS proposal changed")
	}
	return MandateDISResult{MandateID: input.MandateID, ActionID: envelope.Contract.Actions[1].ActionID,
		ContractDigest: envelope.ContractDigest, IntentID: intentID, INGIntentID: ing.IntentID,
		INGResultRef: ing.ResultRef, INGResultDigest: ing.ResultSHA256, ProposalRef: proposalRef,
		ProposalDigest: hex.EncodeToString(proposalSum[:]), Status: "awaiting_human_decision"}, nil
}

func findAdoptedDIS(nucleusRoot, mandateID string) (string, string, error) {
	root := filepath.Join(nucleusRoot, ".intents", ".dis")
	entries, err := os.ReadDir(root)
	if os.IsNotExist(err) {
		return "", "", nil
	}
	if err != nil {
		return "", "", err
	}
	var foundRoot, foundID string
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(root, entry.Name(), ".dis_state.json"))
		if err != nil {
			continue
		}
		var state struct {
			MandateID string `json:"mandate_id"`
			IntentID  string `json:"intent_id"`
		}
		if json.Unmarshal(raw, &state) != nil || state.MandateID != mandateID {
			continue
		}
		if foundID != "" || state.IntentID == "" {
			return "", "", fmt.Errorf("duplicate or invalid DIS Intent for Mandate")
		}
		foundRoot, foundID = filepath.Join(root, entry.Name()), state.IntentID
	}
	return foundRoot, foundID, nil
}

func pathWithin(root, path string) bool {
	if !filepath.IsAbs(path) {
		return false
	}
	rel, err := filepath.Rel(root, path)
	return err == nil && rel != "." && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}
