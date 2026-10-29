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
	if !uuidPattern.MatchString(mandateID) || !uuidPattern.MatchString(sel.DefinitionID) || sel.Version != "1.1.0" ||
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
	return a.DefinitionID == b.DefinitionID && a.Label == b.Label && a.Purpose == b.Purpose &&
		reflect.DeepEqual(a.Publisher, b.Publisher) && reflect.DeepEqual(a.Plan, b.Plan) &&
		reflect.DeepEqual(a.Fulfillment, b.Fulfillment) && a.ObjectiveTemplate == b.ObjectiveTemplate &&
		reflect.DeepEqual(a.IntelligenceLimits, b.IntelligenceLimits) && reflect.DeepEqual(a.Policy, b.Policy) &&
		reflect.DeepEqual(a.Registry, b.Registry) && reflect.DeepEqual(a.Requires, b.Requires)
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
			IntentType: src.IntentType, DomainID: inst.ProjectID, IdempotencyKey: hex.EncodeToString(key[:]),
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
