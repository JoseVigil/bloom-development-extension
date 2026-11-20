package activities

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"nucleus/internal/gene"
	"nucleus/internal/mandateoffer"
	"nucleus/internal/orchestration/mandatecontract"
)

const expResultSchema = "bloom.exp-result/v1"

type MandateEXPInput struct {
	MandatesRoot string
	MandateID    string
}

type MandateEXPConditionalAction struct {
	ActionID   string
	IntentType string
	DependsOn  string
	WhenResult string
}

type MandateEXPResult struct {
	MandateID              string
	ActionID               string
	ContractDigest         string
	DOCActionID            string
	DOCContractSHA256      string
	EvaluationStatus       string
	ResultRef              string
	ResultSHA256           string
	ConditionalActionID    string
	ConditionalSkipActions []MandateEXPConditionalAction
}

type MandateEXPActivity struct {
	IdentityPath                  string
	BrainPath                     string
	RunBrain                      brainCommandRunner
	VerifyINGMaterializationBatch func(root, evidencePath string, expected gene.INGMaterializationBatchBinding) (gene.INGMaterializationBatchReceipt, error)
}

type expJournalAction struct {
	IntentID           string `json:"intentId"`
	Status             string `json:"status"`
	ResultRef          string `json:"resultRef"`
	ResultSHA256       string `json:"resultSha256"`
	LedgerRef          string `json:"ledgerRef"`
	LedgerSHA256       string `json:"ledgerSha256"`
	DecisionDigest     string `json:"decisionDigest"`
	GeneReceiptRef     string `json:"geneMaterializationReceiptRef"`
	GeneReceiptDigest  string `json:"geneMaterializationReceiptDigest"`
	RatificationRef    string `json:"ratificationRef"`
	RatificationSHA256 string `json:"ratificationSha256"`
	FolderName         string `json:"folderName"`
	ContractSHA256     string `json:"contractSha256"`
	RunSHA256          string `json:"runSha256"`
}

type expJournal struct {
	MandateID   string                            `json:"mandateId"`
	ProjectID   string                            `json:"projectId"`
	Preparation *mandateoffer.InstancePreparation `json:"preparation"`
	Adoption    struct {
		ContractDigest string `json:"contractDigest"`
	} `json:"adoption"`
	Actions     map[string]expJournalAction `json:"actions"`
	DOCAfterDIS map[string]any              `json:"docAfterDIS"`
}

type expArtifact struct {
	SchemaVersion string                     `json:"schema_version"`
	MandateID     string                     `json:"mandate_id"`
	ActionID      string                     `json:"action_id"`
	Status        string                     `json:"status"`
	ResultDigest  string                     `json:"result_digest"`
	Evidence      map[string]expEvidenceItem `json:"evidence"`
}

type expEvidenceItem struct {
	Ref    string `json:"ref"`
	SHA256 string `json:"sha256"`
}

// Run evaluates exp-4 only after the signed DOC-after-DIS gate and all source
// evidence have been independently revalidated. Brain receives evidence refs;
// it never receives authority to advance or fulfill the Mandate.
func (a *MandateEXPActivity) Run(ctx context.Context, input MandateEXPInput) (MandateEXPResult, error) {
	var result MandateEXPResult
	if ctx == nil || ctx.Err() != nil || input.MandateID == "" || filepath.Base(input.MandateID) != input.MandateID ||
		input.MandatesRoot == "" || a.IdentityPath == "" || a.BrainPath == "" {
		return result, errors.New("invalid EXP evaluation request")
	}

	mandateDir := filepath.Join(input.MandatesRoot, input.MandateID)
	envelope, err := mandatecontract.LoadVerified(mandateDir, a.IdentityPath)
	if err != nil || envelope.Contract.ContractVersion != 4 || envelope.Contract.MandateID != input.MandateID {
		return result, errors.New("signed EXP contract invalid")
	}
	expAction, expIndex, err := signedActionByID(envelope.Contract.Actions, "exp-4")
	if err != nil || expAction.IntentType != "exp" || expAction.Type != "run_intent" || expAction.WhenResult != "" ||
		expIndex == 0 || envelope.Contract.Actions[expIndex-1].IntentType != "doc" || len(expAction.DependsOn) != 1 ||
		expAction.DependsOn[0] != envelope.Contract.Actions[expIndex-1].ActionID {
		return result, errors.New("signed exp-4 Action binding invalid")
	}
	docAction := envelope.Contract.Actions[expIndex-1]
	if docAction.ActionID != "doc-after-dis-2" {
		return result, errors.New("signed DOC-after-DIS Action binding invalid for EXP")
	}
	conditional, err := signedEXPConditionalActions(envelope.Contract.Actions, expIndex)
	if err != nil {
		return result, err
	}

	stateRaw, err := os.ReadFile(filepath.Join(mandateDir, "mandate_state.json"))
	if err != nil {
		return result, err
	}
	var state expJournal
	if json.Unmarshal(stateRaw, &state) != nil || state.MandateID != input.MandateID || state.ProjectID != envelope.Contract.ProjectID ||
		!boundJournal(stateRaw, envelope.ContractDigest) || state.Preparation == nil || state.Preparation.ContractDigest != envelope.ContractDigest || len(state.Preparation.SourceFiles) == 0 {
		return result, errors.New("prepared EXP journal binding invalid")
	}

	ingAction, _, err := uniqueSignedAction(envelope.Contract.Actions, "ing")
	if err != nil {
		return result, err
	}
	disAction, _, err := uniqueSignedAction(envelope.Contract.Actions, "dis")
	if err != nil {
		return result, err
	}
	ing := state.Actions[ingAction.ActionID]
	dis := state.Actions[disAction.ActionID]
	doc := state.Actions[docAction.ActionID]
	if ing.Status != "completed" || ing.IntentID == "" || ing.ResultRef == "" || ing.ResultSHA256 == "" ||
		ing.DecisionDigest == "" || ing.LedgerRef == "" || ing.LedgerSHA256 == "" || ing.GeneReceiptRef == "" || ing.GeneReceiptDigest == "" {
		return result, errors.New("EXP ING evidence is incomplete")
	}
	if dis.Status != "completed" || dis.IntentID == "" || dis.RatificationRef == "" || dis.RatificationSHA256 == "" {
		return result, errors.New("EXP DIS ratification is incomplete")
	}
	if doc.Status != "completed" || doc.FolderName == "" || doc.ContractSHA256 == "" || state.DOCAfterDIS["completed"] != true ||
		state.DOCAfterDIS["status"] != "completed" || state.DOCAfterDIS["actionId"] != docAction.ActionID ||
		state.DOCAfterDIS["contractSha256"] != doc.ContractSHA256 {
		return result, errors.New("EXP requires completed DOC-after-DIS evidence")
	}

	nucleusRoot := resolveNucleusRootFromMandatesRoot(input.MandatesRoot)
	ingPath, ingBytes, err := readBoundEvidence(nucleusRoot, filepath.Join(nucleusRoot, ".intents", ".ing"), ing.ResultRef, ing.ResultSHA256, false)
	if err != nil {
		return result, fmt.Errorf("EXP ING result evidence invalid: %w", err)
	}
	_ = ingBytes
	disPath, _, err := readBoundEvidence(nucleusRoot, filepath.Join(nucleusRoot, ".intents", ".dis"), dis.RatificationRef, dis.RatificationSHA256, false)
	if err != nil {
		return result, fmt.Errorf("EXP DIS ratification evidence invalid: %w", err)
	}
	if !pathWithin(filepath.Join(mandateDir, "evidence"), ing.GeneReceiptRef) {
		return result, errors.New("EXP G2 receipt is outside Mandate evidence")
	}
	materialization, err := expectedINGMaterializationBatchBinding(mandateDir, envelope.Contract, envelope.ContractDigest,
		ingAction.ActionID, ing.IntentID, ing.DecisionDigest, ing.ResultSHA256, ing.LedgerSHA256, ing.ResultRef,
		struct {
			IntentID              string `json:"intentId"`
			Status                string `json:"status"`
			ResultRef             string `json:"resultRef"`
			ResultSHA             string `json:"resultSha256"`
			LedgerRef             string `json:"ledgerRef"`
			LedgerSHA             string `json:"ledgerSha256"`
			DecisionDigest        string `json:"decisionDigest"`
			MaterializationRef    string `json:"geneMaterializationReceiptRef"`
			MaterializationDigest string `json:"geneMaterializationReceiptDigest"`
		}{IntentID: ing.IntentID, Status: ing.Status, ResultRef: ing.ResultRef, ResultSHA: ing.ResultSHA256, LedgerRef: ing.LedgerRef, LedgerSHA: ing.LedgerSHA256,
			DecisionDigest: ing.DecisionDigest, MaterializationRef: ing.GeneReceiptRef, MaterializationDigest: ing.GeneReceiptDigest})
	if err != nil {
		return result, fmt.Errorf("EXP G2 receipt binding invalid: %w", err)
	}
	verifyBatch := a.VerifyINGMaterializationBatch
	if verifyBatch == nil {
		verifyBatch = func(root, evidencePath string, expected gene.INGMaterializationBatchBinding) (gene.INGMaterializationBatchReceipt, error) {
			return (&gene.Store{Root: root}).VerifyINGMaterializationBatchReceipt(evidencePath, expected)
		}
	}
	verifiedReceipt, err := verifyBatch(nucleusRoot, ing.GeneReceiptRef, materialization)
	if err != nil || verifiedReceipt.ReceiptDigest != ing.GeneReceiptDigest {
		return result, errors.New("EXP G2 batch receipt verification failed")
	}
	projectPath, err := resolvePreparedProject(nucleusRoot, state.ProjectID, state.Preparation.SourceFiles, envelope.Contract.Inputs)
	if err != nil {
		return result, fmt.Errorf("EXP prepared Project binding invalid: %w", err)
	}
	docContractPath := filepath.Join(projectPath, ".bloom", ".intents", ".doc", doc.FolderName,
		".pipeline", ".context", ".response", ".staging", ".doc_contract.json")
	docPath, _, err := readBoundEvidence(projectPath, filepath.Join(projectPath, ".bloom", ".intents", ".doc"), docContractPath, doc.ContractSHA256, true)
	if err != nil {
		return result, fmt.Errorf("EXP DOC contract evidence invalid: %w", err)
	}
	if docPath == "" {
		return result, errors.New("EXP DOC contract evidence ref invalid")
	}
	if _, _, err := readBoundEvidence(nucleusRoot, filepath.Join(nucleusRoot, ".intents", ".ing"), ing.LedgerRef, ing.LedgerSHA256, false); err != nil {
		return result, fmt.Errorf("EXP ING ledger evidence invalid: %w", err)
	}

	brainEvidence := map[string]expEvidenceItem{
		"ing": {Ref: ingPath, SHA256: "sha256:" + ing.ResultSHA256},
		"dis": {Ref: disPath, SHA256: "sha256:" + dis.RatificationSHA256},
		"doc": {Ref: docPath, SHA256: doc.ContractSHA256},
	}
	args := []string{"--json", "intent", "evaluate-exp", "--nucleus-path", nucleusRoot, "--mandate-id", input.MandateID,
		"--action-id", expAction.ActionID, "--project-path", projectPath,
		"--ing-ref", ingPath, "--ing-sha256", brainEvidence["ing"].SHA256,
		"--dis-ref", disPath, "--dis-sha256", brainEvidence["dis"].SHA256,
		"--doc-ref", docPath, "--doc-sha256", brainEvidence["doc"].SHA256}
	runner := a.RunBrain
	if runner == nil {
		runner = execBrainCommand
	}
	out, err := runBrainIntentJSONWithRunner(a.BrainPath, args, runner)
	if err != nil {
		return result, fmt.Errorf("brain intent evaluate-exp failed: %w", err)
	}
	status, _ := out.Data["status"].(string)
	resultRef, _ := out.Data["result_ref"].(string)
	resultSHA, _ := out.Data["result_sha256"].(string)
	if status != "ready" && status != "remediation_required" {
		return result, errors.New("Brain EXP status invalid")
	}
	resultPath, artifact, err := verifyEXPArtifact(nucleusRoot, resultRef, resultSHA, input.MandateID, expAction.ActionID, status)
	if err != nil {
		return result, fmt.Errorf("Brain EXP artifact verification failed: %w", err)
	}
	if err := verifyEXPEvidence(artifact.Evidence, brainEvidence); err != nil {
		return result, err
	}
	result = MandateEXPResult{MandateID: input.MandateID, ActionID: expAction.ActionID, ContractDigest: envelope.ContractDigest,
		DOCActionID: docAction.ActionID, DOCContractSHA256: doc.ContractSHA256, EvaluationStatus: status, ResultRef: resultPath, ResultSHA256: resultSHA}
	if status == "ready" {
		result.ConditionalSkipActions = conditional
	} else {
		result.ConditionalActionID = conditional[0].ActionID
	}
	return result, nil
}

func signedActionByID(actions []mandatecontract.Action, id string) (mandatecontract.Action, int, error) {
	var found *mandatecontract.Action
	index := -1
	for i := range actions {
		if actions[i].ActionID == id {
			if found != nil {
				return mandatecontract.Action{}, -1, fmt.Errorf("signed Action %s is duplicated", id)
			}
			copyAction := actions[i]
			found, index = &copyAction, i
		}
	}
	if found == nil {
		return mandatecontract.Action{}, -1, fmt.Errorf("signed Action %s is missing", id)
	}
	return *found, index, nil
}

func signedEXPConditionalActions(actions []mandatecontract.Action, expIndex int) ([]MandateEXPConditionalAction, error) {
	if expIndex+1 >= len(actions) {
		return nil, errors.New("signed conditional DEV Action is missing after exp-4")
	}
	first := actions[expIndex+1]
	if first.ActionID != "dev-5" || first.IntentType != "dev" || first.WhenResult != "remediation_required" ||
		len(first.DependsOn) != 1 || first.DependsOn[0] != actions[expIndex].ActionID {
		return nil, errors.New("signed exp-4 conditional DEV Action binding invalid")
	}
	frontier := map[string]bool{actions[expIndex].ActionID: true}
	var descendants []MandateEXPConditionalAction
	for i := expIndex + 1; i < len(actions); i++ {
		action := actions[i]
		if len(action.DependsOn) != 1 || !frontier[action.DependsOn[0]] {
			break
		}
		if action.WhenResult != "" && !(action.ActionID == "dev-5" && action.WhenResult == "remediation_required") {
			return nil, errors.New("signed conditional descendant has an unsupported result condition")
		}
		descendants = append(descendants, MandateEXPConditionalAction{ActionID: action.ActionID, IntentType: action.IntentType,
			DependsOn: action.DependsOn[0], WhenResult: action.WhenResult})
		frontier[action.ActionID] = true
	}
	if len(descendants) != 3 || descendants[1].ActionID != "doc-after-dev-5" || descendants[2].ActionID != "exp-6" {
		return nil, errors.New("signed exp-4 conditional dependency chain is incomplete")
	}
	return descendants, nil
}

func readBoundEvidence(root, allowedRoot, ref, expected string, prefixed bool) (string, []byte, error) {
	if ref == "" || expected == "" {
		return "", nil, errors.New("evidence reference or digest missing")
	}
	if !filepath.IsAbs(ref) {
		ref = filepath.Join(root, filepath.FromSlash(ref))
	}
	absolute, err := filepath.Abs(filepath.Clean(ref))
	if err != nil {
		return "", nil, err
	}
	rootResolved, err := filepath.EvalSymlinks(allowedRoot)
	if err != nil {
		return "", nil, err
	}
	resolved, err := filepath.EvalSymlinks(absolute)
	if err != nil || !pathWithin(rootResolved, resolved) {
		return "", nil, errors.New("evidence reference escapes its governed root")
	}
	info, err := os.Lstat(absolute)
	if err != nil || !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 {
		return "", nil, errors.New("evidence is not a regular file")
	}
	raw, err := os.ReadFile(absolute)
	if err != nil {
		return "", nil, err
	}
	sum := sha256.Sum256(raw)
	actual := hex.EncodeToString(sum[:])
	if prefixed {
		actual = "sha256:" + actual
	}
	if actual != expected {
		return "", nil, errors.New("evidence SHA-256 mismatch")
	}
	return absolute, raw, nil
}

func verifyEXPArtifact(root, ref, expectedSHA, mandateID, actionID, status string) (string, expArtifact, error) {
	var artifact expArtifact
	if !strings.HasPrefix(expectedSHA, "sha256:") || len(expectedSHA) != len("sha256:")+64 {
		return "", artifact, errors.New("EXP result SHA-256 format invalid")
	}
	path, raw, err := readBoundEvidence(root, filepath.Join(root, ".intents", ".exp"), ref, expectedSHA, true)
	if err != nil {
		return "", artifact, err
	}
	if json.Unmarshal(raw, &artifact) != nil || artifact.SchemaVersion != expResultSchema || artifact.MandateID != mandateID ||
		artifact.ActionID != actionID || artifact.Status != status || (status != "ready" && status != "remediation_required") {
		return "", artifact, errors.New("EXP result schema or identity invalid")
	}
	if artifact.ResultDigest == "" || artifact.ResultDigest != digestEXPArtifact(raw) {
		return "", artifact, errors.New("EXP internal result digest mismatch")
	}
	return path, artifact, nil
}

func digestEXPArtifact(raw []byte) string {
	var value any
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	if decoder.Decode(&value) != nil {
		return ""
	}
	object, ok := value.(map[string]any)
	if !ok {
		return ""
	}
	delete(object, "result_digest")
	var canonical bytes.Buffer
	encoder := json.NewEncoder(&canonical)
	encoder.SetEscapeHTML(false)
	if encoder.Encode(object) != nil {
		return ""
	}
	canonicalBytes := bytes.TrimSuffix(canonical.Bytes(), []byte("\n"))
	sum := sha256.Sum256(canonicalBytes)
	return "sha256:" + hex.EncodeToString(sum[:])
}

func verifyEXPEvidence(actual, expected map[string]expEvidenceItem) error {
	if len(actual) != len(expected) {
		return errors.New("EXP result evidence set differs from the verified inputs")
	}
	for key, want := range expected {
		got, ok := actual[key]
		if !ok || !sameEvidencePath(got.Ref, want.Ref) || got.SHA256 != want.SHA256 {
			return fmt.Errorf("EXP result evidence binding changed for %s", key)
		}
	}
	return nil
}

func sameEvidencePath(a, b string) bool {
	return filepath.Clean(a) == filepath.Clean(b) || strings.EqualFold(filepath.Clean(a), filepath.Clean(b))
}

func expResultRawDigest(raw []byte) string {
	sum := sha256.Sum256(raw)
	return "sha256:" + hex.EncodeToString(sum[:])
}
