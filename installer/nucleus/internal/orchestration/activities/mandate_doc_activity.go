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

	"nucleus/internal/mandateoffer"
	"nucleus/internal/orchestration/mandatecontract"
	"nucleus/internal/orchestration/mandatestate"
)

type MandateDOCResult struct {
	Ready          bool
	MandateID      string
	ActionID       string
	DISActionID    string
	ContractDigest string
	TriggerIntent  string
	IntentID       string
	FolderName     string
	Name           string
	ProjectID      string
	ProjectPath    string
	DocStatus      string
	NextAction     string
	RunDigest      string
	ContractSHA256 string
}

type MandateDOCActivity struct {
	IdentityPath string
	BrainPath    string
	RunBrain     brainCommandRunner
}

// RunAfterDIS creates or resumes one independent DOC only after the durable
// Nucleus DIS gate is closed. It never declares anomalies and never supplies a
// response on behalf of a person.
func (a *MandateDOCActivity) RunAfterDIS(ctx context.Context, input MandateIntentInput) (MandateDOCResult, error) {
	var result MandateDOCResult
	if ctx == nil || ctx.Err() != nil || input.MandateID == "" || filepath.Base(input.MandateID) != input.MandateID ||
		input.MandatesRoot == "" || a.IdentityPath == "" || a.BrainPath == "" {
		return result, fmt.Errorf("invalid DOC dispatch request")
	}
	mandateDir := filepath.Join(input.MandatesRoot, input.MandateID)
	envelope, err := mandatecontract.LoadVerified(mandateDir, a.IdentityPath)
	if err != nil || envelope.Contract.ContractVersion != 4 || envelope.Contract.MandateID != input.MandateID {
		return result, fmt.Errorf("signed DOC antecedent contract invalid")
	}
	stateRaw, err := os.ReadFile(filepath.Join(mandateDir, "mandate_state.json"))
	if err != nil {
		return result, err
	}
	var state struct {
		MandateID   string                            `json:"mandateId"`
		ProjectID   string                            `json:"projectId"`
		Preparation *mandateoffer.InstancePreparation `json:"preparation"`
		Adoption    struct {
			ContractDigest string `json:"contractDigest"`
		} `json:"adoption"`
		Actions map[string]struct {
			IntentID        string `json:"intentId"`
			Status          string `json:"status"`
			RatificationRef string `json:"ratificationRef"`
			RatificationSHA string `json:"ratificationSha256"`
			LedgerRef       string `json:"ledgerRef"`
			LedgerSHA       string `json:"ledgerSha256"`
			EffectsDigest   string `json:"effectsDigest"`
		} `json:"actions"`
	}
	if json.Unmarshal(stateRaw, &state) != nil || state.MandateID != input.MandateID || state.ProjectID != envelope.Contract.ProjectID ||
		state.Adoption.ContractDigest != envelope.ContractDigest || state.Preparation == nil || state.Preparation.ContractDigest != envelope.ContractDigest || len(state.Preparation.SourceFiles) == 0 {
		return result, fmt.Errorf("prepared DOC source binding invalid")
	}
	disAction, docAction, err := signedDOCFollowingDIS(envelope.Contract.Actions, input.DISActionID, input.ActionID)
	if err != nil {
		return result, err
	}
	dis := state.Actions[disAction.ActionID]
	if dis.Status != "completed" || dis.IntentID == "" || dis.RatificationRef == "" || dis.RatificationSHA == "" || dis.LedgerRef == "" || dis.LedgerSHA == "" || dis.EffectsDigest == "" {
		return result, fmt.Errorf("DIS terminal gate has not been persisted")
	}
	for _, evidence := range []struct{ ref, digest string }{{dis.RatificationRef, dis.RatificationSHA}, {dis.LedgerRef, dis.LedgerSHA}} {
		raw, readErr := os.ReadFile(evidence.ref)
		sum := sha256.Sum256(raw)
		if readErr != nil || hex.EncodeToString(sum[:]) != evidence.digest {
			return result, fmt.Errorf("persisted DIS terminal evidence changed")
		}
	}
	nucleusRoot := resolveNucleusRootFromMandatesRoot(input.MandatesRoot)
	projectPath, err := resolvePreparedProject(nucleusRoot, state.ProjectID, state.Preparation.SourceFiles, envelope.Contract.Inputs)
	if err != nil {
		return result, err
	}
	name := "doc-after-dis-" + dis.IntentID
	result = MandateDOCResult{MandateID: input.MandateID, ActionID: docAction.ActionID, DISActionID: disAction.ActionID, ContractDigest: envelope.ContractDigest,
		TriggerIntent: dis.IntentID, Name: name, ProjectID: state.ProjectID, ProjectPath: projectPath}
	if err := persistIndependentDOC(input.MandatesRoot, result); err != nil {
		return MandateDOCResult{}, err
	}
	runner := a.RunBrain
	if runner == nil {
		runner = func(path string, args []string) ([]byte, []byte, int, error) {
			cmd := exec.CommandContext(ctx, path, args...)
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
		}
	}
	run := func(args []string) (*brainCLIResult, error) {
		return runBrainIntentJSONWithRunner(a.BrainPath, args, runner)
	}
	createArgs := []string{"--json", "intent", "create", "-t", "doc", "-n", name, "-p", projectPath,
		"--trigger-intent", dis.IntentID, "--trigger-nucleus", nucleusRoot}
	for _, source := range state.Preparation.SourceFiles {
		createArgs = append(createArgs, "-f", source, "--doc-document", source)
	}
	created, err := run(createArgs)
	if err != nil {
		return result, err
	}
	result.IntentID, result.FolderName = stringField(created.Data, "intent_id"), stringField(created.Data, "folder_name")
	if result.IntentID == "" || result.FolderName == "" {
		return MandateDOCResult{}, fmt.Errorf("Brain DOC identity response invalid")
	}
	view, err := docView(created.Data)
	if err != nil {
		return MandateDOCResult{}, err
	}
	if view.NextAction == "hydrate" || view.NextAction == "resume" {
		hydrated, runErr := run([]string{"--json", "intent", "hydrate", "--folder", result.FolderName, "-p", projectPath})
		if runErr != nil {
			return MandateDOCResult{}, runErr
		}
		view, err = docView(hydrated.Data)
		if err != nil {
			return MandateDOCResult{}, err
		}
	}
	if view.NextAction == "finalize" {
		finalized, runErr := run([]string{"--json", "intent", "finalize", "--folder", result.FolderName, "-p", projectPath})
		if runErr != nil {
			return MandateDOCResult{}, runErr
		}
		view, err = docView(finalized.Data)
		if err != nil {
			return MandateDOCResult{}, err
		}
	}
	if view.NextAction == "declare_anomalies" {
		// DJ-16 is a human declaration. Nucleus only waits.
		view.DocStatus = "anomalies"
	}
	result.DocStatus, result.NextAction = view.DocStatus, view.NextAction
	result.RunDigest, result.ContractSHA256 = view.RunDigest, view.ContractDigest
	result.Ready = view.DocStatus == "completed" && view.NextAction == "none"
	if err := persistIndependentDOC(input.MandatesRoot, result); err != nil {
		return MandateDOCResult{}, err
	}
	return result, nil
}

func signedDOCFollowingDIS(actions []mandatecontract.Action, disActionID, docActionID string) (mandatecontract.Action, mandatecontract.Action, error) {
	var disIndex = -1
	for index, action := range actions {
		if action.IntentType == "dis" && (disActionID == "" || disActionID == action.ActionID) {
			if disIndex >= 0 {
				return mandatecontract.Action{}, mandatecontract.Action{}, fmt.Errorf("signed DIS Action binding is ambiguous")
			}
			disIndex = index
		}
	}
	if disIndex < 0 || disIndex+1 >= len(actions) {
		return mandatecontract.Action{}, mandatecontract.Action{}, fmt.Errorf("signed DOC Action missing after DIS")
	}
	disAction, docAction := actions[disIndex], actions[disIndex+1]
	if docAction.ActionID == "" || docAction.IntentType != "doc" || len(docAction.DependsOn) != 1 || docAction.DependsOn[0] != disAction.ActionID ||
		(docActionID != "" && docActionID != docAction.ActionID) {
		return mandatecontract.Action{}, mandatecontract.Action{}, fmt.Errorf("signed DOC Action binding invalid")
	}
	return disAction, docAction, nil
}

type docStatusView struct {
	DocStatus      string
	NextAction     string
	RunDigest      string
	ContractDigest string
}

func docView(data map[string]interface{}) (docStatusView, error) {
	raw, ok := data["doc"].(map[string]interface{})
	if !ok {
		return docStatusView{}, fmt.Errorf("Brain DOC status response missing")
	}
	view := docStatusView{DocStatus: stringField(raw, "doc_status"), NextAction: stringField(raw, "next_action"),
		RunDigest: stringField(raw, "run_sha256"), ContractDigest: stringField(raw, "contract_sha256")}
	allowed := map[string]map[string]bool{
		"created": {"hydrate": true}, "empty": {"finalize": true}, "pending_response": {"respond": true},
		"draft_ready": {"finalize": true}, "anomalies": {"declare_anomalies": true}, "completed": {"none": true},
		"error": {"resume": true},
	}
	if !allowed[view.DocStatus][view.NextAction] {
		return docStatusView{}, fmt.Errorf("Brain DOC status transition invalid: %s/%s", view.DocStatus, view.NextAction)
	}
	return view, nil
}

func stringField(data map[string]interface{}, key string) string {
	value, _ := data[key].(string)
	return value
}

func resolvePreparedProject(nucleusRoot, projectID string, sourceFiles []string, inputs []mandatecontract.Input) (string, error) {
	raw, err := os.ReadFile(filepath.Join(nucleusRoot, ".core", ".nucleus-config.json"))
	if err != nil {
		return "", err
	}
	var config struct {
		Projects []struct {
			ID           string `json:"id"`
			AbsolutePath string `json:"absolutePath"`
			LocalPath    string `json:"localPath"`
		} `json:"projects"`
	}
	if json.Unmarshal(raw, &config) != nil {
		return "", fmt.Errorf("Nucleus project catalog invalid")
	}
	var matches []string
	for _, project := range config.Projects {
		if project.ID != projectID {
			continue
		}
		path := project.AbsolutePath
		if path == "" && project.LocalPath != "" {
			path = filepath.Join(nucleusRoot, project.LocalPath)
		}
		if filepath.IsAbs(path) {
			matches = append(matches, filepath.Clean(path))
		}
	}
	if len(matches) != 1 {
		return "", fmt.Errorf("prepared Project is not linked exactly once")
	}
	if len(inputs) != len(sourceFiles) {
		return "", fmt.Errorf("prepared DOC sources do not match signed inputs")
	}
	for index, source := range sourceFiles {
		clean := filepath.ToSlash(filepath.Clean(filepath.FromSlash(source)))
		if clean != source || source == "." || strings.HasPrefix(source, "../") || filepath.IsAbs(source) {
			return "", fmt.Errorf("prepared DOC source path invalid: %s", source)
		}
		input := inputs[index]
		if input.Ref != "inputs/"+source || input.SHA256 == "" || input.Size < 0 {
			return "", fmt.Errorf("prepared DOC source is not bound by the signed contract: %s", source)
		}
		path := filepath.Join(matches[0], filepath.FromSlash(source))
		info, statErr := os.Lstat(path)
		if statErr != nil || !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 {
			return "", fmt.Errorf("prepared DOC source is not a current regular Project file: %s", source)
		}
		raw, readErr := os.ReadFile(path)
		sum := sha256.Sum256(raw)
		if readErr != nil || info.Size() != input.Size || hex.EncodeToString(sum[:]) != input.SHA256 {
			return "", fmt.Errorf("prepared DOC source changed since the signed preparation: %s", source)
		}
	}
	return matches[0], nil
}

func persistIndependentDOC(mandatesRoot string, result MandateDOCResult) error {
	path := filepath.Join(mandatesRoot, result.MandateID, "mandate_state.json")
	_, err := mandatestate.Mutate(path, func(state map[string]interface{}) (bool, error) {
		if state["mandateId"] != result.MandateID {
			return false, fmt.Errorf("DOC journal Mandate mismatch")
		}
		record := map[string]interface{}{"actionId": result.ActionID, "dependsOnActionId": result.DISActionID, "name": result.Name, "intentId": result.IntentID, "folderName": result.FolderName,
			"triggerIntentId": result.TriggerIntent, "projectId": result.ProjectID, "projectPath": result.ProjectPath,
			"status": result.DocStatus, "nextAction": result.NextAction, "runSha256": result.RunDigest,
			"contractSha256": result.ContractSHA256, "completed": result.Ready}
		if result.ActionID == "" {
			return false, fmt.Errorf("signed DOC Action identity missing")
		}
		actions, _ := state["actions"].(map[string]interface{})
		if actions == nil {
			return false, fmt.Errorf("DOC journal Actions missing")
		}
		prior, _ := state["docAfterDIS"].(map[string]interface{})
		if prior != nil {
			for _, key := range []string{"actionId", "dependsOnActionId", "name", "triggerIntentId", "projectId", "projectPath"} {
				if prior[key] != record[key] {
					return false, fmt.Errorf("independent DOC identity conflict")
				}
			}
			for _, key := range []string{"intentId", "folderName"} {
				if prior[key] != nil && prior[key] != "" && record[key] != "" && prior[key] != record[key] {
					return false, fmt.Errorf("independent DOC identity conflict")
				}
				if record[key] == "" {
					record[key] = prior[key]
				}
			}
			if prior["completed"] == true && prior["status"] == "completed" {
				if !result.Ready {
					return false, nil
				}
				if result.Ready && prior["runSha256"] == record["runSha256"] && prior["contractSha256"] == record["contractSha256"] {
					return false, nil
				}
				return false, fmt.Errorf("completed DOC evidence changed")
			}
		}
		action, _ := actions[result.ActionID].(map[string]interface{})
		if result.DISActionID == "" {
			return false, fmt.Errorf("signed DOC antecedent Action identity missing")
		}
		if action != nil && action["dependsOn"] != result.DISActionID {
			return false, fmt.Errorf("signed DOC Action journal conflict")
		}
		actions[result.ActionID] = map[string]interface{}{"status": map[bool]string{true: "completed", false: "in_progress"}[result.Ready],
			"dependsOn": result.DISActionID, "intentId": record["intentId"], "folderName": record["folderName"],
			"runSha256": result.RunDigest, "contractSha256": result.ContractSHA256}
		state["currentAction"] = result.ActionID
		state["docAfterDIS"] = record
		return true, nil
	})
	return err
}
