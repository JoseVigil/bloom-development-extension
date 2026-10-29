// Package mandateoffer installs a Mandate offer selected in Wisdom.
//
// The result of an install is a durable, inactive instance bound to one
// project: a delivery receipt, the immutable definition and a
// mandate_state.json with status "installed". It never writes mandate.json,
// inputs, an adoption journal or an act receipt, never starts a workflow and
// never calls AITAP. Preparation is a separate, explicit operation requiring
// a signed definition that declares its inputs.
package mandateoffer

import (
	"context"
	"crypto/ed25519"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"time"

	"nucleus/internal/mandatedefinition"
	"nucleus/internal/mandatedelivery"
	"nucleus/internal/orchestration/mandatecontract"
)

const (
	InstanceSchema        = "bloom.mandate-instance"
	InstanceSchemaVersion = "1.0"
	StatusInstalled       = "installed"
	StatusPrepared        = "prepared"
	// AuthorizationMasterLocal records that a local Master role and the signed
	// installation authorized the install. It does NOT claim that Authority
	// verified the human who acted.
	AuthorizationMasterLocal = "master_local"
)

var uuidPattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

// Instance is the exact content of .mandates/<mandateId>/mandate_state.json.
// It deliberately has no mandateType, adoption, signature, phases or source
// properties: the mandate watcher ignores it, live and after a restart.
type Instance struct {
	Schema         string                 `json:"schema"`
	SchemaVersion  string                 `json:"schemaVersion"`
	MandateID      string                 `json:"mandateId"`
	Status         string                 `json:"status"`
	OrganizationID string                 `json:"organizationId"`
	ProjectID      string                 `json:"projectId"`
	ProjectBinding InstanceProjectBinding `json:"projectBinding"`
	Definition     InstanceDefinition     `json:"definition"`
	ReceiptRef     string                 `json:"receiptRef"`
	Authorization  InstanceAuthorization  `json:"authorization"`
	InstalledAt    string                 `json:"installedAt"`
	Preparation    *InstancePreparation   `json:"preparation,omitempty"`
}

// InstancePreparation records the new signed definition without replacing the
// immutable definition and delivery receipt that created the installation.
type InstancePreparation struct {
	Definition     InstanceDefinition `json:"definition"`
	ReceiptRef     string             `json:"receiptRef"`
	ContractDigest string             `json:"contractDigest"`
	PreparedAt     string             `json:"preparedAt"`
	SourceFiles    []string           `json:"sourceFiles"`
}

type InstanceProjectBinding struct {
	Revision  string `json:"revision"`
	CheckedAt string `json:"checkedAt"`
}

type InstanceDefinition struct {
	DefinitionID   string `json:"definitionId"`
	Version        string `json:"version"`
	Digest         string `json:"digest"`
	Label          string `json:"label"`
	PublisherKeyID string `json:"publisherKeyId"`
	Preparation    string `json:"preparation"`
}

type InstanceAuthorization struct {
	Kind           string `json:"kind"`
	InstallationID string `json:"installationId"`
}

// Eligibility is the read projection of `authority context-read` that the
// install needs. Only "bound" + "present" + "matched" is eligible.
type Eligibility struct {
	BindingStatus    string
	BindingRevision  string
	BindingCheckedAt string
	LocationStatus   string
	ContinuityStatus string
	Reason           string
}

func (e Eligibility) Eligible() bool {
	return e.BindingStatus == "bound" && e.LocationStatus == "present" && e.ContinuityStatus == "matched"
}

// ProjectNotEligibleError is returned before any network request.
type ProjectNotEligibleError struct{ Eligibility Eligibility }

func (e *ProjectNotEligibleError) Error() string {
	return fmt.Sprintf("project not eligible: binding=%s location=%s continuity=%s %s",
		e.Eligibility.BindingStatus, e.Eligibility.LocationStatus, e.Eligibility.ContinuityStatus, e.Eligibility.Reason)
}

type Receiver interface {
	ReceiveOffer(ctx context.Context, sel mandatedelivery.OfferSelection, verifyContent func([]byte) error) (mandatedelivery.OfferReceipt, error)
}

type Installer struct {
	OrganizationID string
	InstallationID string
	AppDataDir     string
	MandatesRoot   string
	Receiver       Receiver
	PublisherKeys  func() (map[string]ed25519.PublicKey, error)
	Eligibility    func(projectID string) (Eligibility, error)
	NewID          func() (string, error)
	Now            func() time.Time
}

type Result struct {
	Status         string   `json:"status"` // installed | already_installed
	MandateID      string   `json:"mandateId"`
	StatePath      string   `json:"statePath"`
	DefinitionPath string   `json:"definitionPath"`
	ReceiptPath    string   `json:"receiptPath"`
	ReceiptStatus  string   `json:"receiptStatus,omitempty"`
	Instance       Instance `json:"instance"`
}

// DefinitionPath is the immutable local copy of a verified definition.
func DefinitionPath(appDataDir, definitionID, version string) string {
	return filepath.Join(appDataDir, "mandate-definitions", definitionID, version, "definition.json")
}

// Install performs the explicit install of exactly one selected version for
// one eligible project. Order: eligibility → lock → existing instance →
// download + verification (no writes) → receipt → definition → instance.
func (in *Installer) Install(ctx context.Context, sel mandatedelivery.OfferSelection, projectID string) (Result, error) {
	if in.Receiver == nil || in.PublisherKeys == nil || in.Eligibility == nil || in.NewID == nil || in.Now == nil ||
		in.OrganizationID == "" || in.InstallationID == "" || in.AppDataDir == "" || in.MandatesRoot == "" {
		return Result{}, errors.New("installer dependencies required")
	}
	if !uuidPattern.MatchString(projectID) {
		return Result{}, errors.New("invalid project id")
	}
	eligibility, err := in.Eligibility(projectID)
	if err != nil {
		return Result{}, err
	}
	if !eligibility.Eligible() {
		return Result{}, &ProjectNotEligibleError{Eligibility: eligibility}
	}
	if err := os.MkdirAll(in.MandatesRoot, 0700); err != nil {
		return Result{}, err
	}
	unlock, err := lockDir(in.MandatesRoot)
	if err != nil {
		return Result{}, err
	}
	defer unlock()

	instances, err := ListInstances(in.MandatesRoot)
	if err != nil {
		return Result{}, err
	}
	for _, existing := range instances {
		if existing.Instance.ProjectID == projectID && existing.Instance.Definition.DefinitionID == sel.DefinitionID &&
			existing.Instance.Definition.Version == sel.Version {
			if existing.Instance.Definition.Digest != sel.Digest || existing.Instance.OrganizationID != in.OrganizationID {
				return Result{}, errors.New("an instance of this definition version exists with a different digest or organization")
			}
			return Result{Status: "already_installed", MandateID: existing.Instance.MandateID, StatePath: existing.StatePath,
				DefinitionPath: DefinitionPath(in.AppDataDir, sel.DefinitionID, sel.Version), ReceiptPath: existing.Instance.ReceiptRef,
				Instance: existing.Instance}, nil
		}
	}

	keys, err := in.PublisherKeys()
	if err != nil {
		return Result{}, err
	}
	if len(keys) == 0 {
		return Result{}, errors.New("trust manifest has no active mandate-definition key")
	}
	var verified mandatedefinition.Definition
	receipt, err := in.Receiver.ReceiveOffer(ctx, sel, func(content []byte) error {
		d, err := mandatedefinition.Verify(content, keys)
		if err != nil {
			return err
		}
		if d.Payload.DefinitionID != sel.DefinitionID || d.Payload.Version != sel.Version || d.Digest != sel.Digest {
			return errors.New("definition differs from the selection")
		}
		verified = d
		return nil
	})
	if err != nil {
		return Result{}, err
	}

	definitionPath := DefinitionPath(in.AppDataDir, sel.DefinitionID, sel.Version)
	if err := writeImmutable(definitionPath, verified.Raw, sel.Digest); err != nil {
		return Result{}, err
	}

	mandateID, err := in.NewID()
	if err != nil {
		return Result{}, err
	}
	if !uuidPattern.MatchString(mandateID) {
		return Result{}, errors.New("generated mandate id is not a UUID")
	}
	receiptRef, err := filepath.Rel(in.AppDataDir, receipt.ReceiptPath)
	if err != nil {
		receiptRef = receipt.ReceiptPath
	}
	instance := Instance{Schema: InstanceSchema, SchemaVersion: InstanceSchemaVersion, MandateID: mandateID, Status: StatusInstalled,
		OrganizationID: in.OrganizationID, ProjectID: projectID,
		ProjectBinding: InstanceProjectBinding{Revision: eligibility.BindingRevision, CheckedAt: eligibility.BindingCheckedAt},
		Definition: InstanceDefinition{DefinitionID: sel.DefinitionID, Version: sel.Version, Digest: sel.Digest,
			Label: verified.Payload.Label, PublisherKeyID: verified.Payload.Publisher.KeyID, Preparation: verified.Payload.Preparation.Status},
		ReceiptRef:    filepath.ToSlash(receiptRef),
		Authorization: InstanceAuthorization{Kind: AuthorizationMasterLocal, InstallationID: in.InstallationID},
		InstalledAt:   in.Now().UTC().Format(time.RFC3339Nano)}
	data, err := MarshalInstance(instance)
	if err != nil {
		return Result{}, err
	}
	dir := filepath.Join(in.MandatesRoot, mandateID)
	if err := os.Mkdir(dir, 0700); err != nil {
		return Result{}, err
	}
	statePath := filepath.Join(dir, "mandate_state.json")
	if err := writeAtomic(statePath, data); err != nil {
		return Result{}, err
	}
	return Result{Status: "installed", MandateID: mandateID, StatePath: statePath, DefinitionPath: definitionPath,
		ReceiptPath: receipt.ReceiptPath, ReceiptStatus: receipt.Status, Instance: instance}, nil
}

// MarshalInstance is the single writer format of an installed instance.
func MarshalInstance(i Instance) ([]byte, error) {
	data, err := json.MarshalIndent(i, "", "  ")
	if err != nil {
		return nil, err
	}
	return append(data, '\n'), nil
}

type InstalledInstance struct {
	StatePath string   `json:"statePath"`
	Instance  Instance `json:"instance"`
	// Consistent is false when the definition file is missing or its digest
	// differs from the instance; it is reported, never repaired silently.
	Consistent bool   `json:"consistent"`
	Problem    string `json:"problem,omitempty"`
}

// ListInstances reads only bloom.mandate-instance records under .mandates.
func ListInstances(mandatesRoot string) ([]InstalledInstance, error) {
	entries, err := os.ReadDir(mandatesRoot)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var out []InstalledInstance
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		path := filepath.Join(mandatesRoot, e.Name(), "mandate_state.json")
		raw, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		var probe struct {
			Schema string `json:"schema"`
		}
		if json.Unmarshal(raw, &probe) != nil || probe.Schema != InstanceSchema {
			continue
		}
		var inst Instance
		if err := json.Unmarshal(raw, &inst); err != nil {
			continue
		}
		out = append(out, InstalledInstance{StatePath: path, Instance: inst})
	}
	return out, nil
}

// Installations lists instances and checks each against its local definition.
func Installations(appDataDir, mandatesRoot string) ([]InstalledInstance, error) {
	list, err := ListInstances(mandatesRoot)
	if err != nil {
		return nil, err
	}
	for i := range list {
		def := list[i].Instance.Definition
		raw, err := os.ReadFile(DefinitionPath(appDataDir, def.DefinitionID, def.Version))
		switch {
		case err != nil:
			list[i].Problem = "definition_missing"
		case mandatedefinition.FileDigest(raw) != def.Digest:
			list[i].Problem = "definition_digest_mismatch"
		default:
			list[i].Consistent = true
		}
		if list[i].Consistent && list[i].Instance.Status == StatusPrepared {
			prepared := list[i].Instance.Preparation
			if prepared == nil || prepared.Definition.Version == "" || prepared.ContractDigest == "" {
				list[i].Consistent, list[i].Problem = false, "preparation_missing"
				continue
			}
			preparedRaw, readErr := os.ReadFile(DefinitionPath(appDataDir, prepared.Definition.DefinitionID, prepared.Definition.Version))
			if readErr != nil || mandatedefinition.FileDigest(preparedRaw) != prepared.Definition.Digest {
				list[i].Consistent, list[i].Problem = false, "preparation_definition_mismatch"
				continue
			}
			envelope, verifyErr := mandatecontract.LoadVerified(filepath.Dir(list[i].StatePath), filepath.Join(appDataDir, "authority", "identity.json"))
			if verifyErr != nil || envelope.ContractDigest != prepared.ContractDigest {
				list[i].Consistent, list[i].Problem = false, "prepared_contract_invalid"
			}
		}
	}
	return list, nil
}

// RefusePreparation retains the fail-closed check for legacy installed
// definitions that do not declare preparation.
func RefusePreparation(appDataDir, mandatesRoot, mandateID string) error {
	if !uuidPattern.MatchString(mandateID) {
		return errors.New("invalid mandate id")
	}
	raw, err := os.ReadFile(filepath.Join(mandatesRoot, mandateID, "mandate_state.json"))
	if err != nil {
		return fmt.Errorf("installed instance not found: %w", err)
	}
	var inst Instance
	if err := json.Unmarshal(raw, &inst); err != nil || inst.Schema != InstanceSchema || inst.Status != StatusInstalled {
		return errors.New("not an installed offer instance")
	}
	defRaw, err := os.ReadFile(DefinitionPath(appDataDir, inst.Definition.DefinitionID, inst.Definition.Version))
	if err != nil {
		return fmt.Errorf("installed definition not found: %w", err)
	}
	var wire struct {
		Payload mandatedefinition.Payload `json:"payload"`
	}
	if err := json.Unmarshal(defRaw, &wire); err != nil {
		return errors.New("installed definition unreadable")
	}
	return mandatedefinition.RequirePreparable(mandatedefinition.Definition{Payload: wire.Payload, Digest: mandatedefinition.FileDigest(defRaw), Raw: defRaw})
}

func writeImmutable(path string, data []byte, digest string) error {
	if existing, err := os.ReadFile(path); err == nil {
		if mandatedefinition.FileDigest(existing) != digest {
			return errors.New("a different definition is already stored for this version")
		}
		return nil
	} else if !os.IsNotExist(err) {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	return writeAtomic(path, data)
}

func writeAtomic(path string, data []byte) error {
	temp, err := os.CreateTemp(filepath.Dir(path), ".offer-*.tmp")
	if err != nil {
		return err
	}
	name := temp.Name()
	defer os.Remove(name)
	if _, err = temp.Write(data); err == nil {
		err = temp.Sync()
	}
	if closeErr := temp.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	return os.Rename(name, path)
}
