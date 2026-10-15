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
