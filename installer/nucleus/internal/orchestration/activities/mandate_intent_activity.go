package activities

import (
	"bytes"
	"context"
	"crypto/ed25519"
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

type MandateIntentActivity struct {
	IdentityPath string
	BrainPath    string
	TrustRoots   map[string]ed25519.PublicKey
}

type MandateIntentInput struct{ MandatesRoot, MandateID string }
type MandateIntentResult struct {
	MandateID, ActionID, ContractDigest, IntentID, EvidenceRef, EvidenceDigest, Status string
}

type MandateINGCompletionResult struct {
	MandateID, ActionID, NextActionID, ContractDigest, IntentID, ResultRef, ResultDigest, LedgerRef, LedgerDigest, DecisionDigest string
}

// CompleteING consumes the decision already committed by Nucleus. The signal
// that wakes the workflow is only a hint and cannot supply another decision.
func (a *MandateIntentActivity) CompleteING(ctx context.Context, input MandateIntentInput) (MandateINGCompletionResult, error) {
	var result MandateINGCompletionResult
	if input.MandateID == "" || filepath.Base(input.MandateID) != input.MandateID || input.MandatesRoot == "" || a.IdentityPath == "" || a.BrainPath == "" {
		return result, fmt.Errorf("invalid ING completion request")
	}
	dir := filepath.Join(input.MandatesRoot, input.MandateID)
	envelope, err := mandatecontract.LoadVerified(dir, a.IdentityPath)
	if err != nil {
		return result, err
	}
	if envelope.Contract.ContractVersion != 4 || envelope.Contract.MandateID != input.MandateID {
		return result, fmt.Errorf("signed ING contract invalid")
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
		if verifyErr := mandatecontract.VerifyActReceipt(receipt, identity, roots, operation, input.MandateID, envelope.ContractDigest, envelope.Contract.ProjectID); verifyErr != nil {
			return result, verifyErr
		}
	}
	var journal struct {
		Adoption struct {
			ContractDigest string `json:"contractDigest"`
			Digest         string `json:"digest"`
			Version        string `json:"version"`
			OrganizationID string `json:"organizationId"`
			InstallationID string `json:"installationId"`
		} `json:"adoption"`
		Actions map[string]struct {
			IntentID             string `json:"intentId"`
			Status               string `json:"status"`
			EvidenceRef          string `json:"evidenceRef"`
			EvidenceSHA256       string `json:"evidenceSha256"`
			ClassificationRef    string `json:"classificationRef"`
			ClassificationSHA256 string `json:"classificationSha256"`
		} `json:"actions"`
		INGDecision struct {
			ActionID             string           `json:"actionId"`
			ContractDigest       string           `json:"contractDigest"`
			IntentID             string           `json:"intentId"`
			ClassificationDigest string           `json:"classificationDigest"`
			DecisionDigest       string           `json:"decisionDigest"`
			Decisions            []map[string]any `json:"decisions"`
		} `json:"ingDecision"`
	}
	raw, err := os.ReadFile(filepath.Join(dir, "mandate_state.json"))
	if err != nil {
		return result, err
	}
	mandateRaw, err := os.ReadFile(filepath.Join(dir, "mandate.json"))
	if err != nil {
		return result, err
	}
	deliverySum := sha256.Sum256(mandateRaw)
	if json.Unmarshal(raw, &journal) != nil || journal.Adoption.ContractDigest != envelope.ContractDigest || journal.Adoption.Digest != hex.EncodeToString(deliverySum[:]) || journal.Adoption.Version == "" || journal.Adoption.OrganizationID != envelope.Contract.OrganizationID || journal.Adoption.InstallationID != envelope.SignatureKeyID {
		return result, fmt.Errorf("adopted journal invalid")
	}
	action := envelope.Contract.Actions[0]
	entry, ok := journal.Actions[action.ActionID]
	decision := journal.INGDecision
	classificationRef, classificationDigest := entry.EvidenceRef, entry.EvidenceSHA256
	if entry.Status == "completed" {
		classificationRef, classificationDigest = entry.ClassificationRef, entry.ClassificationSHA256
	}
	if !ok || (entry.Status != "awaiting_human_decision" && entry.Status != "completed") || entry.IntentID == "" || decision.ActionID != action.ActionID || decision.ContractDigest != envelope.ContractDigest || decision.IntentID != entry.IntentID || decision.ClassificationDigest != classificationDigest || len(decision.Decisions) == 0 {
		return result, fmt.Errorf("ING decision is not bound to waiting Action")
	}
	canonical, _ := json.Marshal(decision.Decisions)
	sum := sha256.Sum256(canonical)
	if hex.EncodeToString(sum[:]) != decision.DecisionDigest {
		return result, fmt.Errorf("ING decision digest changed")
	}
	nucleusRoot := resolveNucleusRootFromMandatesRoot(input.MandatesRoot)
	intentRoot, foundID, err := findAdoptedING(nucleusRoot, input.MandateID)
	if err != nil {
		return result, err
	}
	if foundID != entry.IntentID {
		return result, fmt.Errorf("ING Intent identity changed")
	}
	classification, err := os.ReadFile(classificationRef)
	if err != nil {
		return result, err
	}
	classificationSum := sha256.Sum256(classification)
	if hex.EncodeToString(classificationSum[:]) != classificationDigest {
		return result, fmt.Errorf("ING classification changed")
	}
	var classificationData struct {
		SchemaVersion string `json:"schema_version"`
		IntentID      string `json:"intent_id"`
		MandateID     string `json:"mandate_id"`
		Clusters      []struct {
			ClusterID string `json:"cluster_id"`
		} `json:"clusters"`
	}
	if json.Unmarshal(classification, &classificationData) != nil || classificationData.SchemaVersion != "bloom.ing-classification/v1" || classificationData.IntentID != entry.IntentID || classificationData.MandateID != input.MandateID || len(classificationData.Clusters) != len(decision.Decisions) {
		return result, fmt.Errorf("ING classification and decisions differ")
	}
	known := map[string]bool{}
	for _, cluster := range classificationData.Clusters {
		known[cluster.ClusterID] = true
	}
	for _, item := range decision.Decisions {
		id, _ := item["cluster_id"].(string)
		if !known[id] {
			return result, fmt.Errorf("ING decision cluster is not classified")
		}
		delete(known, id)
	}
	if err := verifySignedINGResources(envelope.Contract); err != nil {
		return result, err
	}
	decisionsFile, err := os.CreateTemp(intentRoot, ".mandate-decisions-*.json")
	if err != nil {
		return result, err
	}
	defer os.Remove(decisionsFile.Name())
	if _, err := decisionsFile.Write(canonical); err != nil {
		decisionsFile.Close()
		return result, err
	}
	if err := decisionsFile.Sync(); err != nil {
		decisionsFile.Close()
		return result, err
	}
	if err := decisionsFile.Close(); err != nil {
		return result, err
	}
	brain, err := runBrainIntentJSONWithRunner(a.BrainPath, []string{"--json", "intent", "supply", "--intent-root", intentRoot,
		"--semantic-index", filepath.Join(nucleusRoot, ".cache", ".semantic-index.json"), "--policy-version", envelope.Contract.Intelligence.PolicyVersion, "--decisions", decisionsFile.Name()},
		func(path string, argv []string) ([]byte, []byte, int, error) {
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
	if err != nil {
		return result, err
	}
	if status, _ := brain.Data["status"].(string); status != "done" {
		return result, fmt.Errorf("ING did not finish consolidation")
	}
	if err := verifySignedINGResources(envelope.Contract); err != nil {
		return result, err
	}
	resultRef := filepath.Join(intentRoot, "ing_result.json")
	resultBytes, err := os.ReadFile(resultRef)
	if err != nil {
		return result, err
	}
	var checked map[string]any
	if json.Unmarshal(resultBytes, &checked) != nil || checked["schema_version"] != "bloom.ing-result/v1" || checked["intent_id"] != entry.IntentID || checked["mandate_id"] != input.MandateID || checked["status"] != "done" {
		return result, fmt.Errorf("ING result invalid")
	}
	ledgerRef := filepath.Join(intentRoot, ".consolidation", ".turn_1", ".effect_ledger.json")
	ledgerBytes, err := os.ReadFile(ledgerRef)
	if err != nil {
		return result, err
	}
	if err := verifyINGEffectLedger(ledgerBytes, checked, entry.IntentID); err != nil {
		return result, err
	}
	semanticRaw, err := os.ReadFile(filepath.Join(nucleusRoot, ".cache", ".semantic-index.json"))
	if err != nil {
		return result, err
	}
	var semantic any
	if json.Unmarshal(semanticRaw, &semantic) != nil {
		return result, fmt.Errorf("ING semantic index invalid")
	}
	canonicalSemantic, err := pythonCanonicalJSON(semantic)
	if err != nil {
		return result, err
	}
	semanticSum := sha256.Sum256(canonicalSemantic)
	if checked["semantic_index_digest"] != "sha256:"+hex.EncodeToString(semanticSum[:]) {
		return result, fmt.Errorf("ING semantic index digest mismatch")
	}
	ledgerSum := sha256.Sum256(ledgerBytes)
	resultSum := sha256.Sum256(resultBytes)
	return MandateINGCompletionResult{MandateID: input.MandateID, ActionID: action.ActionID, NextActionID: envelope.Contract.Actions[1].ActionID, ContractDigest: envelope.ContractDigest, IntentID: entry.IntentID,
		ResultRef: resultRef, ResultDigest: hex.EncodeToString(resultSum[:]), LedgerRef: ledgerRef, LedgerDigest: hex.EncodeToString(ledgerSum[:]), DecisionDigest: decision.DecisionDigest}, nil
}

func verifyINGEffectLedger(ledgerBytes []byte, checked map[string]any, intentID string) error {
	var ledger map[string]any
	if json.Unmarshal(ledgerBytes, &ledger) != nil || ledger["state"] != "state_advanced" || ledger["state_advanced"] != true || ledger["closure_semantics"] != "logical_contributions" {
		return fmt.Errorf("ING effect ledger incomplete")
	}
	ledgerIdentity, _ := ledger["identity"].(map[string]any)
	if ledgerIdentity == nil || ledgerIdentity["intent_id"] != intentID || ledgerIdentity["intent_type"] != "ing" || ledgerIdentity["stage"] != "consolidation" {
		return fmt.Errorf("ING ledger identity invalid")
	}
	effects, _ := ledger["effects"].([]any)
	if len(effects) != 3 {
		return fmt.Errorf("ING ledger obligations incomplete")
	}
	for _, value := range effects {
		effect, _ := value.(map[string]any)
		if effect == nil || effect["status"] != "applied" {
			return fmt.Errorf("ING effect unapplied")
		}
	}
	canonicalLedger, err := pythonCanonicalJSON(ledger)
	if err != nil {
		return err
	}
	canonicalSum := sha256.Sum256(canonicalLedger)
	if checked["effect_ledger_digest"] != "sha256:"+hex.EncodeToString(canonicalSum[:]) {
		return fmt.Errorf("ING result ledger digest mismatch")
	}
	return nil
}

func pythonCanonicalJSON(value any) ([]byte, error) {
	var output bytes.Buffer
	encoder := json.NewEncoder(&output)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(value); err != nil {
		return nil, err
	}
	return bytes.TrimSpace(output.Bytes()), nil
}

// Run executes only the first signed ING Action. It leaves the action waiting
// for the real human decision returned by Brain, without claiming completion.
func (a *MandateIntentActivity) Run(ctx context.Context, input MandateIntentInput) (MandateIntentResult, error) {
	if ctx.Err() != nil {
		return MandateIntentResult{}, ctx.Err()
	}
	if input.MandateID == "" || filepath.Base(input.MandateID) != input.MandateID || input.MandatesRoot == "" || a.IdentityPath == "" || a.BrainPath == "" {
		return MandateIntentResult{}, fmt.Errorf("invalid Mandate Intent request")
	}
	runBrain := func(args []string) (*brainCLIResult, error) {
		return runBrainIntentJSONWithRunner(a.BrainPath, args, func(path string, argv []string) ([]byte, []byte, int, error) {
			cmd := exec.CommandContext(ctx, path, argv...)
			var stdout, stderr bytes.Buffer
			cmd.Stdout, cmd.Stderr = &stdout, &stderr
			err := cmd.Run()
			code := 0
			if err != nil {
				code = -1
				if exit, ok := err.(*exec.ExitError); ok {
					code = exit.ExitCode()
				}
			}
			return stdout.Bytes(), stderr.Bytes(), code, err
		})
	}
	dir := filepath.Join(input.MandatesRoot, input.MandateID)
	envelope, err := mandatecontract.LoadVerified(dir, a.IdentityPath)
	if err != nil {
		return MandateIntentResult{}, err
	}
	if envelope.Contract.ContractVersion != 4 || len(envelope.Contract.Actions) != 6 || envelope.Contract.Actions[0].IntentType != "ing" {
		return MandateIntentResult{}, fmt.Errorf("signed first Action is not ING")
	}
	identity, err := authority.LoadExistingLocalIdentity(a.IdentityPath)
	if err != nil {
		return MandateIntentResult{}, err
	}
	roots := a.TrustRoots
	if roots == nil {
		roots = authority.DevelopmentPinnedRoots()
	}
	for _, operation := range []string{"approve", "activate"} {
		receipt, loadErr := mandatecontract.LoadActReceipt(dir, operation)
		if loadErr != nil {
			return MandateIntentResult{}, loadErr
		}
		if verifyErr := mandatecontract.VerifyActReceipt(receipt, identity, roots, operation,
			input.MandateID, envelope.ContractDigest, envelope.Contract.ProjectID); verifyErr != nil {
			return MandateIntentResult{}, verifyErr
		}
	}
	if err := verifySignedINGResources(envelope.Contract); err != nil {
		return MandateIntentResult{}, err
	}
	var journal struct {
		Adoption struct {
			ContractDigest string `json:"contractDigest"`
		} `json:"adoption"`
	}
	raw, err := os.ReadFile(filepath.Join(dir, "mandate_state.json"))
	if err != nil || json.Unmarshal(raw, &journal) != nil || journal.Adoption.ContractDigest != envelope.ContractDigest {
		return MandateIntentResult{}, fmt.Errorf("adopted journal does not match signed contract")
	}
	nucleusRoot := resolveNucleusRootFromMandatesRoot(input.MandatesRoot)
	files := make([]string, 0, len(envelope.Contract.Inputs))
	for _, item := range envelope.Contract.Inputs {
		path := filepath.Join(dir, filepath.FromSlash(item.Ref))
		bytes, readErr := os.ReadFile(path)
		if readErr != nil || int64(len(bytes)) != item.Size {
			return MandateIntentResult{}, fmt.Errorf("frozen ING input missing or changed: %s", item.Ref)
		}
		sum := sha256.Sum256(bytes)
		if hex.EncodeToString(sum[:]) != item.SHA256 {
			return MandateIntentResult{}, fmt.Errorf("frozen ING input digest changed: %s", item.Ref)
		}
		files = append(files, path)
	}
	intentRoot, intentID, err := findAdoptedING(nucleusRoot, input.MandateID)
	if err != nil {
		return MandateIntentResult{}, err
	}
	if intentID == "" {
		created, createErr := runBrain([]string{"--json", "intent", "create", "--type", "ing", "--name", envelope.Contract.Domain.Name,
			"--mandate-id", input.MandateID, "--domain-baseline", "empty", "--nucleus-path", nucleusRoot})
		if createErr != nil {
			return MandateIntentResult{}, createErr
		}
		intentID, _ = created.Data["intent_id"].(string)
		folder, _ := created.Data["folder_name"].(string)
		if intentID == "" || folder == "" || filepath.Base(folder) != folder {
			return MandateIntentResult{}, fmt.Errorf("Brain create returned invalid ING identity")
		}
		intentRoot = filepath.Join(nucleusRoot, ".intents", ".ing", folder)
	}
	phase, err := readINGIntentPhase(intentRoot, input.MandateID, intentID)
	if err != nil {
		stateRaw, readErr := os.ReadFile(filepath.Join(intentRoot, ".ing_state.json"))
		var state struct {
			MandateID   string `json:"mandate_id"`
			IntentID    string `json:"intent_id"`
			Status      string `json:"status"`
			PhaseActive string `json:"phase_active"`
		}
		if readErr != nil || json.Unmarshal(stateRaw, &state) != nil || state.MandateID != input.MandateID ||
			state.IntentID != intentID || state.Status != "hydrated" || state.PhaseActive != "consolidation" {
			return MandateIntentResult{}, err
		}
		phase = "classified"
	}
	if phase == "created" {
		_, err = runBrain([]string{"--json", "intent", "hydrate", "--id", intentID,
			"--nucleus-path", nucleusRoot, "--files", strings.Join(files, ",")})
		if err != nil {
			return MandateIntentResult{}, err
		}
	}
	supply, err := runBrain([]string{"--json", "intent", "supply", "--intent-root", intentRoot,
		"--semantic-index", filepath.Join(nucleusRoot, ".cache", ".semantic-index.json"), "--policy-version", envelope.Contract.Intelligence.PolicyVersion})
	if err != nil {
		return MandateIntentResult{}, err
	}
	if err := verifySignedINGResources(envelope.Contract); err != nil {
		return MandateIntentResult{}, err
	}
	status, _ := supply.Data["status"].(string)
	ref, _ := supply.Data["classification_ref"].(string)
	if status != "awaiting_human_decision" || ref == "" {
		return MandateIntentResult{}, fmt.Errorf("ING did not return classified evidence awaiting decision")
	}
	if rel, relErr := filepath.Rel(intentRoot, ref); relErr != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return MandateIntentResult{}, fmt.Errorf("ING evidence escaped Intent directory")
	}
	evidence, err := os.ReadFile(ref)
	if err != nil {
		return MandateIntentResult{}, err
	}
	sum := sha256.Sum256(evidence)
	return MandateIntentResult{MandateID: input.MandateID, ActionID: envelope.Contract.Actions[0].ActionID,
		ContractDigest: envelope.ContractDigest, IntentID: intentID, EvidenceRef: ref,
		EvidenceDigest: hex.EncodeToString(sum[:]), Status: "awaiting_human_decision"}, nil
}

func verifySignedINGResources(contract mandatecontract.Contract) error {
	if contract.Intelligence == nil {
		return fmt.Errorf("signed intelligence selection missing")
	}
	for _, resource := range []struct{ path, digest string }{{contract.Intelligence.PolicyRef, contract.Intelligence.PolicySHA256},
		{contract.Intelligence.RegistryRef, contract.Intelligence.RegistrySHA256}} {
		bytes, err := os.ReadFile(resource.path)
		if err != nil {
			return err
		}
		sum := sha256.Sum256(bytes)
		if hex.EncodeToString(sum[:]) != resource.digest {
			return fmt.Errorf("signed intelligence resource changed")
		}
	}
	return nil
}

func findAdoptedING(nucleusRoot, mandateID string) (string, string, error) {
	root := filepath.Join(nucleusRoot, ".intents", ".ing")
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
		raw, readErr := os.ReadFile(filepath.Join(root, entry.Name(), ".ing_state.json"))
		if readErr != nil {
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
			return "", "", fmt.Errorf("duplicate or invalid ING Intent for Mandate")
		}
		foundRoot, foundID = filepath.Join(root, entry.Name()), state.IntentID
	}
	return foundRoot, foundID, nil
}
