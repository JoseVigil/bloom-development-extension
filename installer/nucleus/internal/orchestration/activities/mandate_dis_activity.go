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
	"sort"
	"strconv"
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

// MandateDISCompletionResult is detached evidence observed from Brain's
// durable DIS tree. Nucleus never turns a proposal or a CLI success response
// into terminal state; Ready is true only after the committed ratification and
// its effect ledger independently reconcile.
type MandateDISCompletionResult struct {
	Ready              bool
	MandateID          string
	ActionID           string
	ContractDigest     string
	IntentID           string
	ProposalRef        string
	ProposalDigest     string
	TurnID             string
	RatificationRef    string
	RatificationDigest string
	LedgerRef          string
	LedgerDigest       string
	EffectsDigest      string
	Status             string
}

// ObserveDISTerminal waits without performing ratification. The DIS owner must
// apply and verify effects through Brain; this observer only accepts the
// resulting durable done + committed:true evidence.
func (a *MandateIntentActivity) ObserveDISTerminal(ctx context.Context, input MandateIntentInput) (MandateDISCompletionResult, error) {
	var result MandateDISCompletionResult
	if ctx == nil || ctx.Err() != nil || input.MandateID == "" || filepath.Base(input.MandateID) != input.MandateID || input.MandatesRoot == "" || a.IdentityPath == "" {
		return result, fmt.Errorf("invalid DIS terminal observation")
	}
	dir := filepath.Join(input.MandatesRoot, input.MandateID)
	envelope, err := mandatecontract.LoadVerified(dir, a.IdentityPath)
	if err != nil || envelope.Contract.ContractVersion != 4 || len(envelope.Contract.Actions) < 2 || envelope.Contract.Actions[1].IntentType != "dis" {
		return result, fmt.Errorf("signed DIS Action invalid")
	}
	actionID := envelope.Contract.Actions[1].ActionID
	var journal struct {
		MandateID string `json:"mandateId"`
		Adoption  struct {
			ContractDigest string `json:"contractDigest"`
		} `json:"adoption"`
		Actions map[string]struct {
			IntentID       string `json:"intentId"`
			Status         string `json:"status"`
			ProposalRef    string `json:"proposalRef"`
			ProposalSHA256 string `json:"proposalSha256"`
		} `json:"actions"`
	}
	raw, err := os.ReadFile(filepath.Join(dir, "mandate_state.json"))
	if err != nil || json.Unmarshal(raw, &journal) != nil || journal.MandateID != input.MandateID || journal.Adoption.ContractDigest != envelope.ContractDigest {
		return result, fmt.Errorf("DIS journal identity mismatch")
	}
	entry := journal.Actions[actionID]
	if entry.IntentID == "" || entry.Status != "awaiting_human_decision" || entry.ProposalRef == "" || entry.ProposalSHA256 == "" {
		return result, fmt.Errorf("DIS proposal is not awaiting ratification")
	}
	proposal, err := os.ReadFile(entry.ProposalRef)
	proposalSum := sha256.Sum256(proposal)
	if err != nil || hex.EncodeToString(proposalSum[:]) != entry.ProposalSHA256 {
		return result, fmt.Errorf("DIS proposal evidence changed")
	}
	nucleusRoot := resolveNucleusRootFromMandatesRoot(input.MandatesRoot)
	if !pathWithin(filepath.Join(nucleusRoot, ".intents", ".dis"), entry.ProposalRef) {
		return result, fmt.Errorf("DIS proposal evidence is outside Intent storage")
	}
	intentRoot, intentID, err := findAdoptedDIS(nucleusRoot, input.MandateID)
	if err != nil || intentID != entry.IntentID {
		return result, fmt.Errorf("DIS Intent identity mismatch")
	}
	var state struct {
		IntentID    string `json:"intent_id"`
		MandateID   string `json:"mandate_id"`
		IntentType  string `json:"intent_type"`
		PhaseActive string `json:"phase_active"`
	}
	stateRaw, err := os.ReadFile(filepath.Join(intentRoot, ".dis_state.json"))
	if err != nil || json.Unmarshal(stateRaw, &state) != nil || state.IntentID != intentID || state.MandateID != input.MandateID || state.IntentType != "dis" {
		return result, fmt.Errorf("DIS state identity invalid")
	}
	result = MandateDISCompletionResult{
		MandateID: input.MandateID, ActionID: actionID, ContractDigest: envelope.ContractDigest,
		IntentID: intentID, ProposalRef: entry.ProposalRef, ProposalDigest: entry.ProposalSHA256, Status: "pending",
	}
	if state.PhaseActive != "done" {
		return result, nil
	}
	turns, err := os.ReadDir(filepath.Join(intentRoot, ".ratification"))
	if err != nil {
		return MandateDISCompletionResult{}, err
	}
	type terminalTurn struct {
		number int
		dir    string
	}
	var candidates []terminalTurn
	for _, item := range turns {
		if !item.IsDir() || !strings.HasPrefix(item.Name(), ".turn_") {
			continue
		}
		n, parseErr := strconv.Atoi(strings.TrimPrefix(item.Name(), ".turn_"))
		if parseErr == nil && n > 0 {
			candidates = append(candidates, terminalTurn{n, filepath.Join(intentRoot, ".ratification", item.Name())})
		}
	}
	sort.Slice(candidates, func(i, j int) bool { return candidates[i].number > candidates[j].number })
	if len(candidates) == 0 {
		return MandateDISCompletionResult{}, fmt.Errorf("DIS done without ratification turn")
	}
	turn := candidates[0]
	controlRef := filepath.Join(turn.dir, ".ratification.json")
	controlRaw, err := os.ReadFile(controlRef)
	var control struct {
		Turn          string `json:"turn"`
		Committed     bool   `json:"committed"`
		LedgerRef     string `json:"ledger_ref"`
		EffectsDigest string `json:"effects_digest"`
	}
	if err != nil || json.Unmarshal(controlRaw, &control) != nil || !control.Committed || control.Turn != strconv.Itoa(turn.number) || control.LedgerRef != ".effect_ledger.json" || control.EffectsDigest == "" {
		return MandateDISCompletionResult{}, fmt.Errorf("DIS terminal ratification control invalid")
	}
	ledgerRef := filepath.Join(turn.dir, control.LedgerRef)
	ledgerRaw, err := os.ReadFile(ledgerRef)
	var ledger struct {
		Schema         string                   `json:"schema_version"`
		LedgerID       string                   `json:"ledger_id"`
		Identity       map[string]interface{}   `json:"identity"`
		State          string                   `json:"state"`
		StateAdvanced  bool                     `json:"state_advanced"`
		EffectsPayload interface{}              `json:"effects_payload"`
		EffectsDigest  string                   `json:"effects_digest"`
		Effects        []map[string]interface{} `json:"effects"`
	}
	if err != nil || json.Unmarshal(ledgerRaw, &ledger) != nil || ledger.Schema != "1.0" || ledger.Identity["intent_id"] != intentID || ledger.Identity["intent_type"] != "dis" || ledger.Identity["stage"] != "ratification" || ledger.Identity["turn_id"] != control.Turn || ledger.State != "state_advanced" || !ledger.StateAdvanced || len(ledger.Effects) == 0 || ledger.EffectsDigest != control.EffectsDigest {
		return MandateDISCompletionResult{}, fmt.Errorf("DIS terminal effect ledger invalid")
	}
	identityDigest, digestErr := pythonJSONDigest(ledger.Identity)
	if digestErr != nil || len(identityDigest) < 32 || ledger.LedgerID != identityDigest[:32] {
		return MandateDISCompletionResult{}, fmt.Errorf("DIS effect ledger identity digest mismatch")
	}
	payloadDigest, digestErr := pythonJSONDigest(ledger.EffectsPayload)
	if digestErr != nil {
		return MandateDISCompletionResult{}, fmt.Errorf("DIS effect payload is not canonicalizable")
	}
	expectedObligations := []string{"domain_graph_operation_applied", "domain_graph_delta_materialized"}
	for i, effect := range ledger.Effects {
		verification, _ := effect["verification"].(map[string]interface{})
		evidenceDigest, _ := verification["evidence_digest"].(string)
		obligation, _ := effect["obligation"].(string)
		effectIdentity := make(map[string]interface{}, len(ledger.Identity)+1)
		for key, value := range ledger.Identity {
			effectIdentity[key] = value
		}
		effectIdentity["obligation"] = obligation
		effectIdentityDigest, effectDigestErr := pythonJSONDigest(effectIdentity)
		if i >= len(expectedObligations) || obligation != expectedObligations[i] || effectDigestErr != nil || effect["effect_id"] != effectIdentityDigest[:24] || effect["payload_digest"] != payloadDigest || effect["status"] != "applied" || verification["verified"] != true || verification["evidence"] == nil || evidenceDigest == "" {
			return MandateDISCompletionResult{}, fmt.Errorf("DIS effect lacks verified evidence")
		}
		actualEvidenceDigest, canonicalErr := pythonJSONDigest(verification["evidence"])
		if canonicalErr != nil {
			return MandateDISCompletionResult{}, fmt.Errorf("DIS effect evidence is not canonicalizable")
		}
		if actualEvidenceDigest != evidenceDigest {
			return MandateDISCompletionResult{}, fmt.Errorf("DIS effect evidence digest mismatch")
		}
	}
	if len(ledger.Effects) != len(expectedObligations) {
		return MandateDISCompletionResult{}, fmt.Errorf("DIS effect obligation set mismatch")
	}
	canonicalEffects, canonicalErr := pythonCanonicalJSON(ledger.Effects)
	if canonicalErr != nil {
		return MandateDISCompletionResult{}, fmt.Errorf("DIS effects are not canonicalizable")
	}
	effectsSum := sha256.Sum256(canonicalEffects)
	if hex.EncodeToString(effectsSum[:]) != ledger.EffectsDigest {
		return MandateDISCompletionResult{}, fmt.Errorf("DIS effects digest mismatch")
	}
	controlSum, ledgerSum := sha256.Sum256(controlRaw), sha256.Sum256(ledgerRaw)
	result.Ready, result.Status, result.TurnID = true, "completed", control.Turn
	result.RatificationRef, result.RatificationDigest = controlRef, hex.EncodeToString(controlSum[:])
	result.LedgerRef, result.LedgerDigest, result.EffectsDigest = ledgerRef, hex.EncodeToString(ledgerSum[:]), ledger.EffectsDigest
	return result, nil
}

func pythonJSONDigest(value interface{}) (string, error) {
	canonical, err := pythonCanonicalJSON(value)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(canonical)
	return hex.EncodeToString(sum[:]), nil
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
