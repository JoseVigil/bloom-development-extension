// Package mandatedefinition verifies the portable definition of a Mandate offer.
//
// A definition carries no organization, project, installation, local path or
// inputs: it is what a publisher offers. The installation that installs it is
// bound to one project; preparing an executable contract from it (T2) is a
// separate act that this package refuses for every definition whose
// preparation rules are not defined.
package mandatedefinition

import (
	"bytes"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"regexp"
	"time"

	"nucleus/internal/authority"
	"nucleus/internal/orchestration/mandatecontract"
)

const (
	Schema                  = "bloom.mandate-definition"
	SchemaVersion           = "1.0"
	PreparableSchemaVersion = "1.1"
	// SignatureDomain separates publisher signatures from every Authority domain.
	SignatureDomain = "BLOOM-MANDATE-DEFINITION-v1"

	PreparationNotDefined         = "not_defined"
	PreparationDefined            = "defined"
	PreparationDomainProject      = "project_identity"
	PreparationSourceProjectFiles = "project_files"

	maxDefinitionBytes = 1 << 20
)

var (
	uuidPattern    = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
	semverPattern  = regexp.MustCompile(`^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$`)
	hex64Pattern   = regexp.MustCompile(`^[0-9a-f]{64}$`)
	wireTime       = regexp.MustCompile(`^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,9})?Z$`)
	ErrNotPrepared = errors.New("mandate definition preparation is not defined: this version can be installed but not prepared")
)

type Publisher struct {
	PublisherID string `json:"publisher_id"`
	KeyID       string `json:"key_id"`
}

type PlanAction struct {
	ActionID   string   `json:"action_id"`
	Type       string   `json:"type"`
	IntentType string   `json:"intent_type"`
	DependsOn  []string `json:"depends_on"`
	WhenResult string   `json:"when_result"`
}

type Plan struct {
	Actions []PlanAction `json:"actions"`
}

type Fulfillment struct {
	Evaluator        string   `json:"evaluator"`
	EvaluatorVersion string   `json:"evaluator_version"`
	RequiredFields   []string `json:"required_fields"`
}

type IntelligenceLimits struct {
	MaxTotalTokens  int `json:"max_total_tokens"`
	MaxOutputTokens int `json:"max_output_tokens"`
}

type EmbeddedPolicy struct {
	PolicyVersion string `json:"policy_version"`
	SHA256        string `json:"sha256"`
	ContentBase64 string `json:"content_base64"`
}

type EmbeddedRegistry struct {
	SnapshotID    string `json:"snapshot_id"`
	SHA256        string `json:"sha256"`
	ContentBase64 string `json:"content_base64"`
}

type Requires struct {
	ContractVersion int  `json:"contract_version"`
	Project         bool `json:"project"`
}

// Preparation is part of the signed payload. In schema 1.0 its only legal
// status is not_defined: the domain rule and input requirements are deferred
// to a later published version, never filled in locally or by default.
type Preparation struct {
	Status            string             `json:"status"`
	DomainRule        string             `json:"domain_rule,omitempty"`
	InputRequirements *InputRequirements `json:"input_requirements,omitempty"`
}

type InputRequirements struct {
	Source   string `json:"source"`
	MinFiles int    `json:"min_files"`
}

type Payload struct {
	Schema             string             `json:"schema"`
	SchemaVersion      string             `json:"schema_version"`
	DefinitionID       string             `json:"definition_id"`
	Version            string             `json:"version"`
	Label              string             `json:"label"`
	Purpose            string             `json:"purpose"`
	Publisher          Publisher          `json:"publisher"`
	PublishedAt        string             `json:"published_at"`
	Plan               Plan               `json:"plan"`
	Fulfillment        Fulfillment        `json:"fulfillment"`
	ObjectiveTemplate  string             `json:"objective_template"`
	IntelligenceLimits IntelligenceLimits `json:"intelligence_limits"`
	Policy             EmbeddedPolicy     `json:"policy"`
	Registry           EmbeddedRegistry   `json:"registry"`
	Requires           Requires           `json:"requires"`
	Preparation        Preparation        `json:"preparation"`
}

type Integrity struct {
	Canonicalization   string `json:"canonicalization"`
	DigestAlgorithm    string `json:"digest_algorithm"`
	Digest             string `json:"digest"`
	SignatureAlgorithm string `json:"signature_algorithm"`
	KeyID              string `json:"key_id"`
	Signature          string `json:"signature"`
}

type signedWire struct {
	Payload   json.RawMessage `json:"payload"`
	Integrity Integrity       `json:"integrity"`
}

// Definition is a verified definition together with its exact bytes.
type Definition struct {
	Payload Payload
	// Digest is the lowercase hex SHA-256 of the exact delivered file. It is the
	// value shown in the catalog, requested on delivery and recorded locally.
	Digest string
	Raw    []byte
}

// FileDigest returns the offer digest of the exact bytes.
func FileDigest(raw []byte) string {
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:])
}

func strictDecode(raw []byte, dst any) error {
	if _, err := authority.Canonicalize(raw); err != nil {
		return err
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		return err
	}
	if dec.Decode(new(any)) != io.EOF {
		return errors.New("trailing JSON")
	}
	// Exact shape: re-encoding must reproduce the same canonical object, so a
	// missing property (decoded as its zero value) or a null is rejected.
	again, err := json.Marshal(dst)
	if err != nil {
		return err
	}
	a, err := authority.Canonicalize(raw)
	if err != nil {
		return err
	}
	b, err := authority.Canonicalize(again)
	if err != nil {
		return err
	}
	if !bytes.Equal(a, b) {
		return errors.New("mandate definition has missing, null or non-canonical properties")
	}
	return nil
}

// Verify parses the exact bytes, checks the publisher signature with keys
// that the trust manifest designates for mandate-definition, and validates
// the payload. Nothing is written by this function.
func Verify(raw []byte, publisherKeys map[string]ed25519.PublicKey) (Definition, error) {
	if len(raw) == 0 || len(raw) > maxDefinitionBytes {
		return Definition{}, errors.New("mandate definition size out of range")
	}
	var wire signedWire
	if err := strictDecode(raw, &wire); err != nil {
		return Definition{}, fmt.Errorf("mandate definition envelope: %w", err)
	}
	in := wire.Integrity
	if in.Canonicalization != "JCS-RFC8785" || in.DigestAlgorithm != "SHA-256" || in.SignatureAlgorithm != "Ed25519" || in.KeyID == "" {
		return Definition{}, errors.New("unsupported mandate definition integrity")
	}
	canonical, err := authority.Canonicalize(wire.Payload)
	if err != nil {
		return Definition{}, err
	}
	sum := sha256.Sum256(canonical)
	if base64.RawURLEncoding.EncodeToString(sum[:]) != in.Digest {
		return Definition{}, errors.New("mandate definition payload digest mismatch")
	}
	key, ok := publisherKeys[in.KeyID]
	if !ok || len(key) != ed25519.PublicKeySize {
		return Definition{}, errors.New("mandate definition signed by an untrusted key")
	}
	sig, err := base64.RawURLEncoding.DecodeString(in.Signature)
	if err != nil || len(sig) != ed25519.SignatureSize || !ed25519.Verify(key, SigningMessage(canonical), sig) {
		return Definition{}, errors.New("invalid mandate definition signature")
	}
	var p Payload
	if err := strictDecode(wire.Payload, &p); err != nil {
		return Definition{}, fmt.Errorf("mandate definition payload: %w", err)
	}
	if p.Publisher.KeyID != in.KeyID {
		return Definition{}, errors.New("mandate definition publisher key does not match its signature")
	}
	if err := p.Validate(); err != nil {
		return Definition{}, err
	}
	return Definition{Payload: p, Digest: FileDigest(raw), Raw: append([]byte(nil), raw...)}, nil
}

// SigningMessage is domain || 0x00 || JCS(payload).
func SigningMessage(canonicalPayload []byte) []byte {
	return append(append([]byte(SignatureDomain), 0), canonicalPayload...)
}

// Validate checks the payload rules of schema 1.0.
func (p Payload) Validate() error {
	if p.Schema != Schema || (p.SchemaVersion != SchemaVersion && p.SchemaVersion != PreparableSchemaVersion) {
		return errors.New("unsupported mandate definition schema")
	}
	if !uuidPattern.MatchString(p.DefinitionID) || !semverPattern.MatchString(p.Version) {
		return errors.New("mandate definition identity is invalid")
	}
	if p.Label == "" || p.Purpose == "" || p.Publisher.PublisherID == "" || p.Publisher.KeyID == "" {
		return errors.New("mandate definition label, purpose and publisher are required")
	}
	if !wireTime.MatchString(p.PublishedAt) {
		return errors.New("mandate definition published_at must be a UTC wire timestamp")
	}
	if _, err := time.Parse(time.RFC3339Nano, p.PublishedAt); err != nil {
		return errors.New("mandate definition published_at is invalid")
	}
	actions := make([]mandatecontract.Action, len(p.Plan.Actions))
	for i, a := range p.Plan.Actions {
		if a.DependsOn == nil {
			return errors.New("mandate definition depends_on must be an array")
		}
		actions[i] = mandatecontract.Action{ActionID: a.ActionID, Type: a.Type, IntentType: a.IntentType,
			IdempotencyKey: a.ActionID, DependsOn: a.DependsOn, WhenResult: a.WhenResult}
	}
	if err := mandatecontract.ValidateMandateActions(actions); err != nil {
		return fmt.Errorf("mandate definition plan: %w", err)
	}
	f := p.Fulfillment
	if f.Evaluator != "exp-ready" || f.EvaluatorVersion != "1" || len(f.RequiredFields) == 0 {
		return errors.New("mandate definition fulfillment is invalid")
	}
	if p.ObjectiveTemplate == "" || p.IntelligenceLimits.MaxTotalTokens <= 0 || p.IntelligenceLimits.MaxOutputTokens <= 0 ||
		p.IntelligenceLimits.MaxOutputTokens > p.IntelligenceLimits.MaxTotalTokens {
		return errors.New("mandate definition objective or intelligence limits are invalid")
	}
	if p.Policy.PolicyVersion == "" || p.Registry.SnapshotID == "" {
		return errors.New("mandate definition policy version and registry snapshot are required")
	}
	if err := checkEmbedded(p.Policy.SHA256, p.Policy.ContentBase64, "policy_version", p.Policy.PolicyVersion); err != nil {
		return fmt.Errorf("mandate definition policy: %w", err)
	}
	if err := checkEmbedded(p.Registry.SHA256, p.Registry.ContentBase64, "snapshot_id", p.Registry.SnapshotID); err != nil {
		return fmt.Errorf("mandate definition registry: %w", err)
	}
	if p.Requires.ContractVersion != 4 || !p.Requires.Project {
		return errors.New("mandate definition requirements are invalid")
	}
	switch p.SchemaVersion {
	case SchemaVersion:
		if p.Preparation.Status != PreparationNotDefined || p.Preparation.DomainRule != "" || p.Preparation.InputRequirements != nil {
			return errors.New("mandate definition schema 1.0 only allows preparation not_defined")
		}
	case PreparableSchemaVersion:
		if p.Preparation.Status != PreparationDefined || p.Preparation.DomainRule != PreparationDomainProject ||
			p.Preparation.InputRequirements == nil || p.Preparation.InputRequirements.Source != PreparationSourceProjectFiles ||
			p.Preparation.InputRequirements.MinFiles != 1 {
			return errors.New("mandate definition preparation rule is invalid")
		}
	}
	return nil
}

func checkEmbedded(digest, content, identityField, identity string) error {
	if !hex64Pattern.MatchString(digest) {
		return errors.New("sha256 must be lowercase hex")
	}
	raw, err := base64.StdEncoding.Strict().DecodeString(content)
	if err != nil || len(raw) == 0 || base64.StdEncoding.EncodeToString(raw) != content {
		return errors.New("content must be non-empty standard base64")
	}
	if FileDigest(raw) != digest {
		return errors.New("embedded content digest mismatch")
	}
	var declared map[string]any
	if err := json.Unmarshal(raw, &declared); err != nil {
		return errors.New("embedded content must be a JSON object")
	}
	if declared[identityField] != identity {
		return fmt.Errorf("embedded %s does not match the definition", identityField)
	}
	return nil
}

// RequirePreparable is the only gate that a preparation step may use. It is
// closed for every definition of schema 1.0: there is no default domain rule
// and no default input requirement.
func RequirePreparable(d Definition) error {
	if err := d.Payload.Validate(); err != nil {
		return ErrNotPrepared
	}
	if d.Payload.SchemaVersion != PreparableSchemaVersion || d.Payload.Preparation.Status != PreparationDefined {
		return ErrNotPrepared
	}
	return nil
}

// Sign builds the exact signed file for a payload. It is used by the
// publisher's offline tool and by tests; Nucleus never signs definitions.
func Sign(p Payload, privateKey ed25519.PrivateKey) ([]byte, error) {
	if err := p.Validate(); err != nil {
		return nil, err
	}
	rawPayload, err := json.Marshal(p)
	if err != nil {
		return nil, err
	}
	canonical, err := authority.Canonicalize(rawPayload)
	if err != nil {
		return nil, err
	}
	sum := sha256.Sum256(canonical)
	sig := ed25519.Sign(privateKey, SigningMessage(canonical))
	wire := signedWire{Payload: canonical, Integrity: Integrity{Canonicalization: "JCS-RFC8785", DigestAlgorithm: "SHA-256",
		Digest: base64.RawURLEncoding.EncodeToString(sum[:]), SignatureAlgorithm: "Ed25519", KeyID: p.Publisher.KeyID,
		Signature: base64.RawURLEncoding.EncodeToString(sig)}}
	raw, err := json.Marshal(wire)
	if err != nil {
		return nil, err
	}
	return authority.Canonicalize(raw)
}
