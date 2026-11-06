package mandateoffer

import (
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"time"

	"nucleus/internal/authority"
	"nucleus/internal/mandatedefinition"
	"nucleus/internal/mandatedelivery"
	"nucleus/internal/orchestration/mandatecontract"
)

// Preparer turns one installed offer into a signed, verified but inactive v4.
// It never authorizes an act or starts a workflow.
type Preparer struct {
	Upgrade        bool // explicit 1.1.0 -> 1.2.0 transition; never inferred
	OrganizationID string
	AppDataDir     string
	MandatesRoot   string
	ProjectPath    string
	ProjectName    string
	Identity       *authority.LocalIdentity
	Receiver       Receiver
	PublisherKeys  func() (map[string]ed25519.PublicKey, error)
	Eligibility    func(projectID string) (Eligibility, error)
	Now            func() time.Time
}

type PrepareResult struct {
	Status         string   `json:"status"`
	MandateID      string   `json:"mandateId"`
	ContractDigest string   `json:"contractDigest"`
	StatePath      string   `json:"statePath"`
	ContractPath   string   `json:"contractPath"`
	SourceFiles    []string `json:"sourceFiles"`
}

func (p *Preparer) Prepare(ctx context.Context, mandateID string, sel mandatedelivery.OfferSelection, sourceFiles []string) (PrepareResult, error) {
	if p == nil || p.Identity == nil || p.Identity.InstallationID == "" || p.Receiver == nil || p.PublisherKeys == nil ||
		p.Eligibility == nil || p.Now == nil || p.OrganizationID == "" || p.AppDataDir == "" || p.MandatesRoot == "" ||
		p.ProjectPath == "" || p.ProjectName == "" {
		return PrepareResult{}, errors.New("preparation dependencies required")
	}
	if !uuidPattern.MatchString(mandateID) || !uuidPattern.MatchString(sel.DefinitionID) || (sel.Version != "1.1.0" && sel.Version != "1.2.0") ||
		len(sel.Digest) != 64 || len(sourceFiles) == 0 {
		return PrepareResult{}, errors.New("invalid preparation selection")
	}
	files, err := normalizeSourceFiles(sourceFiles)
	if err != nil {
		return PrepareResult{}, err
	}
	unlock, err := lockDir(p.MandatesRoot)
	if err != nil {
		return PrepareResult{}, err
	}
	defer unlock()
	dir := filepath.Join(p.MandatesRoot, mandateID)
	statePath := filepath.Join(dir, "mandate_state.json")
	raw, err := os.ReadFile(statePath)
	if err != nil {
		return PrepareResult{}, fmt.Errorf("installed instance not found: %w", err)
	}
	var inst Instance
	if err := json.Unmarshal(raw, &inst); err != nil || inst.Schema != InstanceSchema || inst.MandateID != mandateID ||
		(inst.Status != StatusInstalled && inst.Status != StatusPrepared) || inst.OrganizationID != p.OrganizationID ||
		inst.Authorization.InstallationID != p.Identity.InstallationID || inst.Definition.DefinitionID != sel.DefinitionID {
		return PrepareResult{}, errors.New("installed instance identity mismatch")
	}
	contractPath := filepath.Join(dir, "mandate.json")
	if inst.Status == StatusPrepared {
		if p.Upgrade {
			return p.upgradePrepared(ctx, inst, dir, statePath, sel, files)
		}
		if inst.Preparation == nil || inst.Preparation.Definition.Version != sel.Version || inst.Preparation.Definition.Digest != sel.Digest ||
			!reflect.DeepEqual(inst.Preparation.SourceFiles, files) {
			return PrepareResult{}, errors.New("already prepared with a different selection")
		}
		verified, err := mandatecontract.LoadVerified(dir, filepath.Join(p.AppDataDir, "authority", "identity.json"))
		if err != nil || verified.ContractDigest != inst.Preparation.ContractDigest {
			return PrepareResult{}, errors.New("prepared contract does not verify")
		}
		return PrepareResult{Status: "already_prepared", MandateID: mandateID, ContractDigest: verified.ContractDigest,
			StatePath: statePath, ContractPath: contractPath, SourceFiles: files}, nil
	}
	if p.Upgrade {
		return PrepareResult{}, errors.New("upgrade requires a prepared instance")
	}
	if inst.Preparation != nil || inst.Definition.Version != "1.0.0" || inst.Definition.Preparation != mandatedefinition.PreparationNotDefined {
		return PrepareResult{}, errors.New("instance is not at the approved preparation boundary")
	}
	eligibility, err := p.Eligibility(inst.ProjectID)
	if err != nil {
		return PrepareResult{}, err
	}
	if !eligibility.Eligible() {
		return PrepareResult{}, &ProjectNotEligibleError{Eligibility: eligibility}
	}
	keys, err := p.PublisherKeys()
	if err != nil {
		return PrepareResult{}, err
	}
	originalRaw, err := os.ReadFile(DefinitionPath(p.AppDataDir, inst.Definition.DefinitionID, inst.Definition.Version))
	if err != nil || mandatedefinition.FileDigest(originalRaw) != inst.Definition.Digest {
		return PrepareResult{}, errors.New("installed definition missing or digest mismatch")
	}
	original, err := mandatedefinition.Verify(originalRaw, keys)
	if err != nil {
		return PrepareResult{}, fmt.Errorf("installed definition invalid: %w", err)
	}
	var candidate mandatedefinition.Definition
	receipt, err := p.Receiver.ReceiveOffer(ctx, sel, func(content []byte) error {
		d, verifyErr := mandatedefinition.Verify(content, keys)
		if verifyErr != nil {
			return verifyErr
		}
		if d.Payload.DefinitionID != sel.DefinitionID || d.Payload.Version != sel.Version || d.Digest != sel.Digest ||
			d.Payload.Publisher.KeyID != inst.Definition.PublisherKeyID {
			return errors.New("preparation definition differs from the selection or publisher")
		}
		if err := mandatedefinition.RequirePreparable(d); err != nil {
			return err
		}
		if !sameOfferPlan(original.Payload, d.Payload) {
			return errors.New("preparation version changed the installed plan or limits")
		}
		candidate = d
		return nil
	})
	if err != nil {
		return PrepareResult{}, err
	}
	if err := writeImmutable(DefinitionPath(p.AppDataDir, sel.DefinitionID, sel.Version), candidate.Raw, sel.Digest); err != nil {
		return PrepareResult{}, err
	}
	definitionDir := filepath.Dir(DefinitionPath(p.AppDataDir, sel.DefinitionID, sel.Version))
	policyRaw, err := base64.StdEncoding.Strict().DecodeString(candidate.Payload.Policy.ContentBase64)
	if err != nil {
		return PrepareResult{}, err
	}
	registryRaw, err := base64.StdEncoding.Strict().DecodeString(candidate.Payload.Registry.ContentBase64)
	if err != nil {
		return PrepareResult{}, err
	}
	policyPath := filepath.Join(definitionDir, "policy.json")
	registryPath := filepath.Join(definitionDir, "registry.json")
	if err := writeImmutable(policyPath, policyRaw, candidate.Payload.Policy.SHA256); err != nil {
		return PrepareResult{}, err
	}
	if err := writeImmutable(registryPath, registryRaw, candidate.Payload.Registry.SHA256); err != nil {
		return PrepareResult{}, err
	}
	inputs, err := freezeProjectFiles(p.ProjectPath, dir, files)
	if err != nil {
		return PrepareResult{}, err
	}
	contract := contractFromDefinition(inst, candidate.Payload, p.ProjectName, eligibility.BindingRevision, policyPath, registryPath, inputs)
	signed, err := mandatecontract.Sign(contract, p.Identity)
	if err != nil {
		return PrepareResult{}, err
	}
	if err := mandatecontract.Verify(signed, p.Identity.InstallationID, p.Identity.PublicKey); err != nil {
		return PrepareResult{}, err
	}
	if existing, readErr := os.ReadFile(contractPath); readErr == nil {
		var saved mandatecontract.Envelope
		if json.Unmarshal(existing, &saved) != nil || mandatecontract.Verify(saved, p.Identity.InstallationID, p.Identity.PublicKey) != nil ||
			saved.ContractDigest != signed.ContractDigest {
			return PrepareResult{}, errors.New("existing signed contract conflicts with preparation")
		}
	} else if !os.IsNotExist(readErr) {
		return PrepareResult{}, readErr
	} else {
		encoded, marshalErr := json.MarshalIndent(signed, "", "  ")
		if marshalErr != nil {
			return PrepareResult{}, marshalErr
		}
		if err := writeAtomic(contractPath, append(encoded, '\n')); err != nil {
			return PrepareResult{}, err
		}
	}
	verified, err := mandatecontract.LoadVerified(dir, filepath.Join(p.AppDataDir, "authority", "identity.json"))
	if err != nil || verified.ContractDigest != signed.ContractDigest {
		return PrepareResult{}, errors.New("signed contract did not verify after persistence")
	}
	receiptRef, err := filepath.Rel(p.AppDataDir, receipt.ReceiptPath)
	if err != nil {
		receiptRef = receipt.ReceiptPath
	}
	inst.Status = StatusPrepared
	inst.ProjectBinding = InstanceProjectBinding{Revision: eligibility.BindingRevision, CheckedAt: eligibility.BindingCheckedAt}
	inst.Preparation = &InstancePreparation{
		Definition: InstanceDefinition{DefinitionID: sel.DefinitionID, Version: sel.Version, Digest: sel.Digest,
			Label: candidate.Payload.Label, PublisherKeyID: candidate.Payload.Publisher.KeyID, Preparation: candidate.Payload.Preparation.Status},
		ReceiptRef: filepath.ToSlash(receiptRef), ContractDigest: signed.ContractDigest,
		PreparedAt: p.Now().UTC().Format(time.RFC3339Nano), SourceFiles: files,
	}
	stateRaw, err := MarshalInstance(inst)
	if err != nil {
		return PrepareResult{}, err
	}
	if err := writeAtomic(statePath, stateRaw); err != nil {
		return PrepareResult{}, err
	}
	return PrepareResult{Status: StatusPrepared, MandateID: mandateID, ContractDigest: signed.ContractDigest,
		StatePath: statePath, ContractPath: contractPath, SourceFiles: files}, nil
}

func sameOfferPlan(a, b mandatedefinition.Payload) bool {
	bPlan := b.Plan
	if b.Version == "1.2.0" {
		if !mandatedefinition.HasApprovedGenesisIntelligenceRequirements(b) {
			return false
		}
		bPlan.Actions = append([]mandatedefinition.PlanAction(nil), b.Plan.Actions...)
		for i := range bPlan.Actions {
			bPlan.Actions[i].RequiresIntelligence = nil
			bPlan.Actions[i].RequiredCapabilities = nil
		}
	}
	return a.DefinitionID == b.DefinitionID && a.Label == b.Label && a.Purpose == b.Purpose &&
		reflect.DeepEqual(a.Publisher, b.Publisher) && reflect.DeepEqual(a.Plan, bPlan) &&
		reflect.DeepEqual(a.Fulfillment, b.Fulfillment) && a.ObjectiveTemplate == b.ObjectiveTemplate &&
		reflect.DeepEqual(a.IntelligenceLimits, b.IntelligenceLimits) && reflect.DeepEqual(a.Policy, b.Policy) &&
		reflect.DeepEqual(a.Registry, b.Registry) && reflect.DeepEqual(a.Requires, b.Requires)
}

// upgradePrepared transitions only the already prepared, inactive 1.1.0
// instance. Both signed contracts and the transition receipt remain immutable.
// The state is advanced before the active contract: readers fail closed during
// that brief window, and a retry completes the second write.
func (p *Preparer) upgradePrepared(ctx context.Context, inst Instance, dir, statePath string, sel mandatedelivery.OfferSelection, files []string) (PrepareResult, error) {
	if sel.Version != "1.2.0" || inst.Status != StatusPrepared || inst.Preparation == nil ||
		!reflect.DeepEqual(inst.Preparation.SourceFiles, files) {
		return PrepareResult{}, errors.New("upgrade requires the existing prepared inputs and version 1.2.0")
	}
	activePath := filepath.Join(dir, "mandate.json")
	identityPath := filepath.Join(p.AppDataDir, "authority", "identity.json")
	newPath := filepath.Join(dir, "preparations", inst.Preparation.ContractDigest, "mandate.json")
	if inst.Preparation.Definition.Version == "1.2.0" {
		if inst.Preparation.Definition.Digest != sel.Digest || len(inst.PreparationHistory) != 1 {
			return PrepareResult{}, errors.New("upgrade selection differs from recorded transition")
		}
		newPath = filepath.Join(dir, "preparations", inst.Preparation.ContractDigest, "mandate.json")
		if err := verifyTransitionArtifacts(p, inst, dir, identityPath); err != nil {
			return PrepareResult{}, err
		}
		candidate, err := mandatecontract.LoadVerifiedFile(newPath, identityPath, inst.MandateID)
		if err != nil {
			return PrepareResult{}, err
		}
		active, err := mandatecontract.LoadVerified(dir, identityPath)
		if err == nil && active.ContractDigest == candidate.ContractDigest {
			return PrepareResult{Status: "already_prepared", MandateID: inst.MandateID, ContractDigest: candidate.ContractDigest,
				StatePath: statePath, ContractPath: activePath, SourceFiles: files}, nil
		}
		previous := inst.PreparationHistory[0]
		if err != nil || active.ContractDigest != previous.ContractDigest {
			return PrepareResult{}, errors.New("active contract conflicts with pending transition")
		}
		raw, err := os.ReadFile(newPath)
		if err != nil {
			return PrepareResult{}, err
		}
		if err := writeAtomic(activePath, raw); err != nil {
			return PrepareResult{}, err
		}
		return PrepareResult{Status: StatusPrepared, MandateID: inst.MandateID, ContractDigest: candidate.ContractDigest,
			StatePath: statePath, ContractPath: activePath, SourceFiles: files}, nil
	}
	if inst.Preparation.Definition.Version != "1.1.0" || len(inst.PreparationHistory) != 0 || inst.TransitionReceiptRef != "" {
		return PrepareResult{}, errors.New("instance is not at the approved upgrade boundary")
	}
	old, err := mandatecontract.LoadVerified(dir, identityPath)
	if err != nil || old.ContractDigest != inst.Preparation.ContractDigest || old.Contract.MandateID != inst.MandateID ||
		old.Contract.ProjectID != inst.ProjectID || old.Contract.OrganizationID != inst.OrganizationID {
		return PrepareResult{}, errors.New("existing prepared contract does not verify")
	}
	for _, input := range old.Contract.Inputs {
		if !strings.HasPrefix(input.Ref, "inputs/") || filepath.Base(input.Ref) == "." {
			return PrepareResult{}, errors.New("invalid frozen input reference")
		}
		for _, base := range []string{"inputs", "docs"} {
			path := filepath.Join(dir, base, filepath.FromSlash(strings.TrimPrefix(input.Ref, "inputs/")))
			info, statErr := os.Lstat(path)
			if statErr != nil || !info.Mode().IsRegular() || info.Size() != input.Size {
				return PrepareResult{}, errors.New("frozen input missing or changed")
			}
			raw, readErr := os.ReadFile(path)
			if readErr != nil || mandatedefinition.FileDigest(raw) != input.SHA256 {
				return PrepareResult{}, errors.New("frozen input digest mismatch")
			}
		}
	}
	eligibility, err := p.Eligibility(inst.ProjectID)
	if err != nil {
		return PrepareResult{}, err
	}
	if !eligibility.Eligible() {
		return PrepareResult{}, &ProjectNotEligibleError{Eligibility: eligibility}
	}
	keys, err := p.PublisherKeys()
	if err != nil {
		return PrepareResult{}, err
	}
	originalRaw, err := os.ReadFile(DefinitionPath(p.AppDataDir, inst.Definition.DefinitionID, inst.Definition.Version))
	if err != nil || mandatedefinition.FileDigest(originalRaw) != inst.Definition.Digest {
		return PrepareResult{}, errors.New("installed definition missing or digest mismatch")
	}
	original, err := mandatedefinition.Verify(originalRaw, keys)
	if err != nil {
		return PrepareResult{}, err
	}
	previousRaw, err := os.ReadFile(DefinitionPath(p.AppDataDir, inst.Preparation.Definition.DefinitionID, "1.1.0"))
	if err != nil || mandatedefinition.FileDigest(previousRaw) != inst.Preparation.Definition.Digest {
		return PrepareResult{}, errors.New("previous definition missing or digest mismatch")
	}
	if _, err := mandatedefinition.Verify(previousRaw, keys); err != nil {
		return PrepareResult{}, err
	}
	var candidate mandatedefinition.Definition
	receipt, err := p.Receiver.ReceiveOffer(ctx, sel, func(content []byte) error {
		d, verifyErr := mandatedefinition.Verify(content, keys)
		if verifyErr != nil {
			return verifyErr
		}
		if d.Payload.DefinitionID != sel.DefinitionID || d.Payload.Version != sel.Version || d.Digest != sel.Digest ||
			d.Payload.Publisher.KeyID != inst.Definition.PublisherKeyID || !sameOfferPlan(original.Payload, d.Payload) ||
			mandatedefinition.RequirePreparable(d) != nil {
			return errors.New("upgrade definition differs from the approved plan")
		}
		candidate = d
		return nil
	})
	if err != nil {
		return PrepareResult{}, err
	}
	if err := writeImmutable(DefinitionPath(p.AppDataDir, sel.DefinitionID, sel.Version), candidate.Raw, sel.Digest); err != nil {
		return PrepareResult{}, err
	}
	definitionDir := filepath.Dir(DefinitionPath(p.AppDataDir, sel.DefinitionID, sel.Version))
	for _, embedded := range []struct{ name, content, digest string }{
		{"policy.json", candidate.Payload.Policy.ContentBase64, candidate.Payload.Policy.SHA256},
		{"registry.json", candidate.Payload.Registry.ContentBase64, candidate.Payload.Registry.SHA256},
	} {
		decoded, decodeErr := base64.StdEncoding.Strict().DecodeString(embedded.content)
		if decodeErr != nil {
			return PrepareResult{}, decodeErr
		}
		if err := writeImmutable(filepath.Join(definitionDir, embedded.name), decoded, embedded.digest); err != nil {
			return PrepareResult{}, err
		}
	}
	contract := contractFromDefinition(inst, candidate.Payload, old.Contract.Domain.Name, old.Contract.ProjectBinding,
		filepath.Join(definitionDir, "policy.json"), filepath.Join(definitionDir, "registry.json"), old.Contract.Inputs)
	signed, err := mandatecontract.Sign(contract, p.Identity)
	if err != nil {
		return PrepareResult{}, err
	}
	if err := mandatecontract.Verify(signed, p.Identity.InstallationID, p.Identity.PublicKey); err != nil {
		return PrepareResult{}, err
	}
	oldRaw, err := os.ReadFile(activePath)
	if err != nil {
		return PrepareResult{}, err
	}
	if err := writeImmutable(filepath.Join(dir, "preparations", old.ContractDigest, "mandate.json"), oldRaw, mandatedefinition.FileDigest(oldRaw)); err != nil {
		return PrepareResult{}, err
	}
	newRaw, err := json.MarshalIndent(signed, "", "  ")
	if err != nil {
		return PrepareResult{}, err
	}
	newRaw = append(newRaw, '\n')
	newPath = filepath.Join(dir, "preparations", signed.ContractDigest, "mandate.json")
	if err := writeImmutable(newPath, newRaw, mandatedefinition.FileDigest(newRaw)); err != nil {
		return PrepareResult{}, err
	}
	receiptRef, err := filepath.Rel(p.AppDataDir, receipt.ReceiptPath)
	if err != nil {
		return PrepareResult{}, err
	}
	receiptRef = filepath.ToSlash(receiptRef)
	transitionPath := filepath.Join(dir, "preparations", signed.ContractDigest, "transition.json")
	transitionRaw, err := os.ReadFile(transitionPath)
	if os.IsNotExist(err) {
		transition, signErr := mandatecontract.SignPreparationTransition(mandatecontract.PreparationTransition{
			Schema: "bloom.preparation-transition/v1", MandateID: inst.MandateID, FromDigest: old.ContractDigest,
			ToDigest: signed.ContractDigest, FromDefinitionDigest: inst.Preparation.Definition.Digest, ToDefinitionDigest: sel.Digest,
			FromReceiptRef: inst.Preparation.ReceiptRef, ToReceiptRef: receiptRef, SignedAt: p.Now().UTC().Format(time.RFC3339Nano),
		}, p.Identity)
		if signErr != nil {
			return PrepareResult{}, signErr
		}
		transitionRaw, signErr = json.MarshalIndent(transition, "", "  ")
		if signErr != nil {
			return PrepareResult{}, signErr
		}
		transitionRaw = append(transitionRaw, '\n')
		if err := writeImmutable(transitionPath, transitionRaw, mandatedefinition.FileDigest(transitionRaw)); err != nil {
			return PrepareResult{}, err
		}
	} else if err != nil {
		return PrepareResult{}, err
	}
	var transition mandatecontract.PreparationTransition
	if json.Unmarshal(transitionRaw, &transition) != nil || mandatecontract.VerifyPreparationTransition(transition, p.Identity.InstallationID, p.Identity.PublicKey) != nil ||
		transition.MandateID != inst.MandateID || transition.FromDigest != old.ContractDigest || transition.ToDigest != signed.ContractDigest ||
		transition.FromDefinitionDigest != inst.Preparation.Definition.Digest || transition.ToDefinitionDigest != sel.Digest ||
		transition.FromReceiptRef != inst.Preparation.ReceiptRef || transition.ToReceiptRef != receiptRef {
		return PrepareResult{}, errors.New("existing transition receipt conflicts with upgrade")
	}
	previous := *inst.Preparation
	inst.PreparationHistory = []InstancePreparation{previous}
	inst.Preparation = &InstancePreparation{Definition: InstanceDefinition{DefinitionID: sel.DefinitionID, Version: sel.Version, Digest: sel.Digest,
		Label: candidate.Payload.Label, PublisherKeyID: candidate.Payload.Publisher.KeyID, Preparation: candidate.Payload.Preparation.Status},
		ReceiptRef: receiptRef, ContractDigest: signed.ContractDigest, PreparedAt: p.Now().UTC().Format(time.RFC3339Nano), SourceFiles: files}
	inst.TransitionReceiptRef = filepath.ToSlash(filepath.Join("preparations", signed.ContractDigest, "transition.json"))
	if err := verifyTransitionArtifacts(p, inst, dir, identityPath); err != nil {
		return PrepareResult{}, err
	}
	stateRaw, err := MarshalInstance(inst)
	if err != nil {
		return PrepareResult{}, err
	}
	if err := writeAtomic(statePath, stateRaw); err != nil {
		return PrepareResult{}, err
	}
	if err := writeAtomic(activePath, newRaw); err != nil {
		return PrepareResult{}, err
	}
	return PrepareResult{Status: StatusPrepared, MandateID: inst.MandateID, ContractDigest: signed.ContractDigest,
		StatePath: statePath, ContractPath: activePath, SourceFiles: files}, nil
}

func verifyTransitionArtifacts(p *Preparer, inst Instance, dir, identityPath string) error {
	if inst.Preparation == nil || len(inst.PreparationHistory) != 1 {
		return errors.New("preparation transition history missing")
	}
	previous := inst.PreparationHistory[0]
	old, err := mandatecontract.LoadVerifiedFile(filepath.Join(dir, "preparations", previous.ContractDigest, "mandate.json"), identityPath, inst.MandateID)
	if err != nil || old.ContractDigest != previous.ContractDigest {
		return errors.New("historical contract invalid")
	}
	current, err := mandatecontract.LoadVerifiedFile(filepath.Join(dir, "preparations", inst.Preparation.ContractDigest, "mandate.json"), identityPath, inst.MandateID)
	if err != nil || current.ContractDigest != inst.Preparation.ContractDigest {
		return errors.New("candidate contract invalid")
	}
	if inst.TransitionReceiptRef != filepath.ToSlash(filepath.Join("preparations", inst.Preparation.ContractDigest, "transition.json")) {
		return errors.New("transition receipt reference invalid")
	}
	raw, err := os.ReadFile(filepath.Join(dir, filepath.FromSlash(inst.TransitionReceiptRef)))
	if err != nil {
		return err
	}
	var transition mandatecontract.PreparationTransition
	if json.Unmarshal(raw, &transition) != nil || mandatecontract.VerifyPreparationTransition(transition, p.Identity.InstallationID, p.Identity.PublicKey) != nil ||
		transition.MandateID != inst.MandateID || transition.FromDigest != previous.ContractDigest || transition.ToDigest != inst.Preparation.ContractDigest ||
		transition.FromDefinitionDigest != previous.Definition.Digest || transition.ToDefinitionDigest != inst.Preparation.Definition.Digest ||
		transition.FromReceiptRef != previous.ReceiptRef || transition.ToReceiptRef != inst.Preparation.ReceiptRef {
		return errors.New("transition receipt invalid")
	}
	return nil
}

func normalizeSourceFiles(files []string) ([]string, error) {
	if len(files) == 0 {
		return nil, errors.New("at least one project file is required")
	}
	result := append([]string(nil), files...)
	sort.Strings(result)
	for i, name := range result {
		if name == "" || name == "." || path.Clean(name) != name || strings.HasPrefix(name, "../") ||
			strings.ContainsAny(name, "\\:\x00") || strings.HasPrefix(name, "/") || (i > 0 && name == result[i-1]) {
			return nil, fmt.Errorf("invalid or duplicate project file %q", name)
		}
	}
	return result, nil
}

func freezeProjectFiles(projectRoot, mandateDir string, files []string) ([]mandatecontract.Input, error) {
	rootInfo, err := os.Lstat(projectRoot)
	if err != nil || !rootInfo.IsDir() || rootInfo.Mode()&os.ModeSymlink != 0 {
		return nil, errors.New("project root is not a regular directory")
	}
	inputs := make([]mandatecontract.Input, 0, len(files))
	for _, rel := range files {
		parts := strings.Split(rel, "/")
		current := projectRoot
		for i, part := range parts {
			if part == "" || part == "." || part == ".." {
				return nil, errors.New("invalid project file component")
			}
			current = filepath.Join(current, part)
			info, err := os.Lstat(current)
			if err != nil || info.Mode()&os.ModeSymlink != 0 {
				return nil, fmt.Errorf("project file unavailable or linked: %s", rel)
			}
			if i < len(parts)-1 && !info.IsDir() {
				return nil, fmt.Errorf("project file parent is not a directory: %s", rel)
			}
			if i == len(parts)-1 && !info.Mode().IsRegular() {
				return nil, fmt.Errorf("project input is not a regular file: %s", rel)
			}
		}
		content, err := os.ReadFile(current)
		if err != nil {
			return nil, err
		}
		sum := sha256.Sum256(content)
		digest := hex.EncodeToString(sum[:])
		for _, base := range []string{"docs", "inputs"} {
			dest := filepath.Join(mandateDir, base, filepath.FromSlash(rel))
			if err := writeImmutable(dest, content, digest); err != nil {
				return nil, err
			}
		}
		inputs = append(inputs, mandatecontract.Input{Ref: "inputs/" + rel, SHA256: digest, Size: int64(len(content))})
	}
	return inputs, nil
}

func contractFromDefinition(inst Instance, d mandatedefinition.Payload, projectName, binding, policyPath, registryPath string, inputs []mandatecontract.Input) mandatecontract.Contract {
	actions := make([]mandatecontract.Action, 0, len(d.Plan.Actions))
	for _, src := range d.Plan.Actions {
		key := sha256.Sum256([]byte(inst.MandateID + "/" + src.ActionID))
		actions = append(actions, mandatecontract.Action{ActionID: src.ActionID, Type: src.Type,
			IntentType: src.IntentType, RequiresIntelligence: src.RequiresIntelligence, RequiredCapabilities: src.RequiredCapabilities, DomainID: inst.ProjectID, IdempotencyKey: hex.EncodeToString(key[:]),
			DependsOn: append([]string(nil), src.DependsOn...), WhenResult: src.WhenResult})
	}
	return mandatecontract.Contract{MandateID: inst.MandateID, ContractVersion: 4,
		OrganizationID: inst.OrganizationID, ProjectID: inst.ProjectID, ProjectBinding: binding,
		Objective: strings.ReplaceAll(d.ObjectiveTemplate, "{project_name}", projectName),
		Domain:    mandatecontract.Domain{ID: inst.ProjectID, Name: projectName}, Actions: actions,
		Intelligence: &mandatecontract.Intelligence{PolicyRef: policyPath, PolicyVersion: d.Policy.PolicyVersion,
			PolicySHA256: d.Policy.SHA256, RegistryRef: registryPath, RegistrySHA256: d.Registry.SHA256,
			RegistrySnapshotID: d.Registry.SnapshotID, MaxTotalTokens: d.IntelligenceLimits.MaxTotalTokens,
			MaxOutputTokens: d.IntelligenceLimits.MaxOutputTokens},
		Inputs: inputs, Gravity: []mandatecontract.GravityRef{},
		Fulfillment: mandatecontract.Fulfillment{Evaluator: d.Fulfillment.Evaluator,
			EvaluatorVersion: d.Fulfillment.EvaluatorVersion, RequiredFields: append([]string(nil), d.Fulfillment.RequiredFields...)}}
}
