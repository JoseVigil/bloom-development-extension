package authority

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"github.com/gofrs/flock"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"time"
)

type Audience struct {
	OrganizationID  string   `json:"organization_id"`
	InstallationIDs []string `json:"installation_ids"`
}
type Principal struct {
	PrincipalID        string             `json:"principal_id"`
	PrincipalType      string             `json:"principal_type"`
	Status             string             `json:"status"`
	ExternalIdentities []ExternalIdentity `json:"external_identities"`
}
type ExternalIdentity struct {
	Provider      string    `json:"provider"`
	Subject       string    `json:"subject"`
	DisplayHandle string    `json:"display_handle"`
	Status        string    `json:"status"`
	VerifiedAt    time.Time `json:"verified_at"`
}
type Membership struct {
	MembershipID   string     `json:"membership_id"`
	PrincipalID    string     `json:"principal_id"`
	OrganizationID string     `json:"organization_id"`
	Status         string     `json:"status"`
	ValidFrom      time.Time  `json:"valid_from"`
	ValidUntil     *time.Time `json:"valid_until"`
	AcceptedAt     time.Time  `json:"accepted_at"`
}
type Scope struct {
	Type string `json:"type"`
	ID   string `json:"id"`
}
type RoleAssignment struct {
	AssignmentID string     `json:"assignment_id"`
	MembershipID string     `json:"membership_id"`
	RoleID       string     `json:"role_id"`
	RoleVersion  string     `json:"role_version"`
	Scope        Scope      `json:"scope"`
	Status       string     `json:"status"`
	ValidFrom    time.Time  `json:"valid_from"`
	ValidUntil   *time.Time `json:"valid_until"`
	AcceptedAt   time.Time  `json:"accepted_at"`
}
type Revocation struct {
	RevocationID               string    `json:"revocation_id"`
	TargetType                 string    `json:"target_type"`
	TargetID                   string    `json:"target_id"`
	EffectiveAt                time.Time `json:"effective_at"`
	RecordedInAuthorityVersion string    `json:"recorded_in_authority_version"`
	ReasonCode                 string    `json:"reason_code"`
}
type FullContent struct {
	Principals      []Principal      `json:"principals"`
	Memberships     []Membership     `json:"memberships"`
	RoleDefinitions []RoleDefinition `json:"role_definitions"`
	RoleAssignments []RoleAssignment `json:"role_assignments"`
	Revocations     []Revocation     `json:"revocations"`
}
type DeltaOperation struct {
	Sequence   string          `json:"sequence"`
	Operation  string          `json:"operation"`
	Collection string          `json:"collection"`
	EntityID   string          `json:"entity_id"`
	Value      json.RawMessage `json:"value"`
}
type DeltaContent struct {
	ResultDigest string           `json:"result_digest"`
	Operations   []DeltaOperation `json:"operations"`
}
type SnapshotPayload struct {
	Schema               string          `json:"schema"`
	SchemaVersion        string          `json:"schema_version"`
	Kind                 string          `json:"kind"`
	SnapshotID           string          `json:"snapshot_id"`
	Issuer               string          `json:"issuer"`
	OrganizationID       string          `json:"organization_id"`
	AuthorityVersion     string          `json:"authority_version"`
	BaseAuthorityVersion *string         `json:"base_authority_version"`
	IssuedAt             time.Time       `json:"issued_at"`
	NotBefore            time.Time       `json:"not_before"`
	ExpiresAt            time.Time       `json:"expires_at"`
	Audience             Audience        `json:"audience"`
	Content              json.RawMessage `json:"content"`
}
type Binding struct {
	OrganizationID string `json:"organization_id"`
	Issuer         string `json:"issuer"`
	InstallationID string `json:"installation_id"`
}
type MonotonicState struct {
	HighWaterMark string `json:"high_water_mark"`
	Digest        string `json:"digest"`
	CutoverFloor  string `json:"cutover_floor"`
}
type JournalEntry struct {
	SnapshotID    string    `json:"snapshot_id"`
	Version       string    `json:"version"`
	Outcome       string    `json:"outcome"`
	At            time.Time `json:"at"`
	CorrelationID string    `json:"correlation_id,omitempty"`
}
type DurableState struct {
	Binding    Binding        `json:"binding"`
	Projection FullContent    `json:"accepted_projection"`
	Monotonic  MonotonicState `json:"monotonic_state"`
	Journal    []JournalEntry `json:"acceptance_journal"`
}
type Store struct{ Path string }

var authorityStoreHook func(stage string) error

type Verifier struct {
	Trust   TrustBundle
	Binding Binding
	Store   *Store
	Now     func() time.Time
}

func (v *Verifier) VerifyAndAccept(raw []byte, correlationID string) (*DurableState, error) {
	if v.Store == nil || v.Store.Path == "" {
		return nil, errors.New("authority store required")
	}
	if err := os.MkdirAll(filepath.Dir(v.Store.Path), 0700); err != nil {
		return nil, err
	}
	lock := flock.New(v.Store.Path + ".lock")
	if err := lock.Lock(); err != nil {
		return nil, err
	}
	defer func() { _ = lock.Unlock() }()
	env, _, err := ParseAndVerifyEnvelope(raw, v.Trust)
	if err != nil {
		return nil, err
	}
	var p SnapshotPayload
	if err = decodeStrict(env.Payload, &p); err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	if v.Now != nil {
		now = v.Now().UTC()
	}
	if err = validatePayload(p, v.Binding, now); err != nil {
		return nil, err
	}
	state, err := v.Store.Load()
	if err != nil && !os.IsNotExist(err) {
		return nil, err
	}
	if state == nil {
		state = &DurableState{Binding: v.Binding}
	}
	current, _ := strictVersion(state.Monotonic.HighWaterMark)
	incoming, _ := strictVersion(p.AuthorityVersion)
	floor, err := strictVersion(state.Monotonic.CutoverFloor)
	if err != nil {
		return nil, err
	}
	if incoming < floor {
		return nil, errors.New("authority version below cutover floor")
	}
	if incoming < current {
		return nil, errors.New("authority downgrade rejected")
	}
	if incoming == current {
		if state.Monotonic.Digest == env.Integrity.Digest {
			return state, nil
		}
		return nil, errors.New("same authority version with conflicting digest")
	}
	var projection FullContent
	if p.Kind == "full" {
		if err = decodeStrict(p.Content, &projection); err != nil {
			return nil, err
		}
		normalizeProjection(&projection)
	} else {
		if p.BaseAuthorityVersion == nil || *p.BaseAuthorityVersion != state.Monotonic.HighWaterMark {
			return nil, errors.New("delta gap requires full reconciliation")
		}
		projection, err = applyDelta(state.Projection, p.Content)
		if err != nil {
			return nil, err
		}
	}
	if err = validateProjection(projection, p.OrganizationID); err != nil {
		return nil, err
	}
	state.Binding = v.Binding
	state.Projection = projection
	state.Monotonic.HighWaterMark = p.AuthorityVersion
	state.Monotonic.Digest = env.Integrity.Digest
	state.Journal = append(state.Journal, JournalEntry{SnapshotID: p.SnapshotID, Version: p.AuthorityVersion, Outcome: "accepted", At: now, CorrelationID: correlationID})
	if err = v.Store.saveLocked(state); err != nil {
		return nil, err
	}
	return state, nil
}
func validatePayload(p SnapshotPayload, b Binding, now time.Time) error {
	if p.Schema != "bloom.authority.snapshot" || p.SchemaVersion != "1.0" || (p.Kind != "full" && p.Kind != "delta") {
		return errors.New("unsupported snapshot")
	}
	if p.AuthorityVersion == "" {
		return errors.New("authority version required")
	}
	if _, e := strictVersion(p.AuthorityVersion); e != nil {
		return e
	}
	if p.OrganizationID != b.OrganizationID || p.Issuer != b.Issuer || p.Audience.OrganizationID != p.OrganizationID {
		return errors.New("snapshot binding mismatch")
	}
	found := false
	for _, id := range p.Audience.InstallationIDs {
		if id == b.InstallationID {
			found = true
		}
	}
	if !found {
		return errors.New("snapshot not targeted to installation")
	}
	if !p.IssuedAt.Before(p.ExpiresAt) || p.NotBefore.After(p.ExpiresAt) || p.ExpiresAt.Sub(p.IssuedAt) > 24*time.Hour || now.Before(p.NotBefore) || !now.Before(p.ExpiresAt) {
		return errors.New("snapshot outside validity window")
	}
	return nil
}
func strictVersion(s string) (uint64, error) {
	if s == "" {
		return 0, nil
	}
	if s[0] == '0' {
		return 0, errors.New("invalid authority version")
	}
	return strconv.ParseUint(s, 10, 64)
}
func validateProjection(f FullContent, org string) error {
	roles := map[string]bool{}
	for _, r := range f.RoleDefinitions {
		if err := ValidateRoleDefinition(r); err != nil {
			return err
		}
		roles[r.RoleID+"@"+r.RoleVersion] = true
	}
	principals := map[string]bool{}
	for _, p := range f.Principals {
		principals[p.PrincipalID] = true
	}
	members := map[string]bool{}
	for _, m := range f.Memberships {
		if !principals[m.PrincipalID] || m.OrganizationID != org {
			return errors.New("invalid membership reference")
		}
		members[m.MembershipID] = true
	}
	for _, a := range f.RoleAssignments {
		if !members[a.MembershipID] || !roles[a.RoleID+"@"+a.RoleVersion] || a.Scope.ID == "" {
			return errors.New("invalid role assignment")
		}
		if _, ok := ScopeTypes[a.Scope.Type]; !ok {
			return errors.New("invalid scope")
		}
	}
	return nil
}
func applyDelta(base FullContent, raw []byte) (FullContent, error) {
	var d DeltaContent
	if err := decodeStrict(raw, &d); err != nil {
		return base, err
	}
	for i, op := range d.Operations {
		if op.Sequence != strconv.Itoa(i+1) {
			return base, errors.New("delta sequence gap")
		}
		if op.Operation != "upsert" && op.Operation != "remove" {
			return base, errors.New("invalid delta operation")
		}
		if err := applyOperation(&base, op); err != nil {
			return base, err
		}
	}
	normalizeProjection(&base)
	normalized, err := json.Marshal(base)
	if err != nil {
		return base, err
	}
	canonical, err := Canonicalize(normalized)
	if err != nil {
		return base, err
	}
	sum := sha256.Sum256(canonical)
	if base64.RawURLEncoding.EncodeToString(sum[:]) != d.ResultDigest {
		return base, errors.New("delta result digest mismatch")
	}
	return base, nil
}
func applyOperation(f *FullContent, op DeltaOperation) error {
	if op.Operation == "remove" && string(op.Value) != "null" {
		return errors.New("delta remove value must be null")
	}
	switch op.Collection {
	case "principals":
		var v Principal
		if op.Operation == "upsert" {
			if err := decodeStrict(op.Value, &v); err != nil {
				return err
			}
			if v.PrincipalID != op.EntityID {
				return errors.New("delta principal entity_id mismatch")
			}
		}
		f.Principals = mutate(f.Principals, op.EntityID, op.Operation, v, func(x Principal) string { return x.PrincipalID })
	case "memberships":
		var v Membership
		if op.Operation == "upsert" {
			if err := decodeStrict(op.Value, &v); err != nil {
				return err
			}
			if v.MembershipID != op.EntityID {
				return errors.New("delta membership entity_id mismatch")
			}
		}
		f.Memberships = mutate(f.Memberships, op.EntityID, op.Operation, v, func(x Membership) string { return x.MembershipID })
	case "role_definitions":
		var v RoleDefinition
		if op.Operation == "upsert" {
			if err := decodeStrict(op.Value, &v); err != nil {
				return err
			}
			if v.RoleID != op.EntityID {
				return errors.New("delta role entity_id mismatch")
			}
		}
		f.RoleDefinitions = mutate(f.RoleDefinitions, op.EntityID, op.Operation, v, func(x RoleDefinition) string { return x.RoleID })
	case "role_assignments":
		var v RoleAssignment
		if op.Operation == "upsert" {
			if err := decodeStrict(op.Value, &v); err != nil {
				return err
			}
			if v.AssignmentID != op.EntityID {
				return errors.New("delta assignment entity_id mismatch")
			}
		}
		f.RoleAssignments = mutate(f.RoleAssignments, op.EntityID, op.Operation, v, func(x RoleAssignment) string { return x.AssignmentID })
	case "revocations":
		var v Revocation
		if op.Operation == "upsert" {
			if err := decodeStrict(op.Value, &v); err != nil {
				return err
			}
			if v.RevocationID != op.EntityID {
				return errors.New("delta revocation entity_id mismatch")
			}
		}
		f.Revocations = mutate(f.Revocations, op.EntityID, op.Operation, v, func(x Revocation) string { return x.RevocationID })
	default:
		return errors.New("unknown delta collection")
	}
	return nil
}

func normalizeProjection(f *FullContent) {
	sort.Slice(f.Principals, func(i, j int) bool { return f.Principals[i].PrincipalID < f.Principals[j].PrincipalID })
	sort.Slice(f.Memberships, func(i, j int) bool { return f.Memberships[i].MembershipID < f.Memberships[j].MembershipID })
	sort.Slice(f.RoleDefinitions, func(i, j int) bool {
		if f.RoleDefinitions[i].RoleID == f.RoleDefinitions[j].RoleID {
			return f.RoleDefinitions[i].RoleVersion < f.RoleDefinitions[j].RoleVersion
		}
		return f.RoleDefinitions[i].RoleID < f.RoleDefinitions[j].RoleID
	})
	sort.Slice(f.RoleAssignments, func(i, j int) bool { return f.RoleAssignments[i].AssignmentID < f.RoleAssignments[j].AssignmentID })
	sort.Slice(f.Revocations, func(i, j int) bool { return f.Revocations[i].RevocationID < f.Revocations[j].RevocationID })
}

func mutate[T any](in []T, id, operation string, value T, key func(T) string) []T {
	out := make([]T, 0, len(in)+1)
	replaced := false
	for _, x := range in {
		if key(x) == id {
			if operation == "upsert" {
				out = append(out, value)
				replaced = true
			}
			continue
		}
		out = append(out, x)
	}
	if operation == "upsert" && !replaced {
		out = append(out, value)
	}
	return out
}
func (s *Store) Load() (*DurableState, error) {
	raw, e := os.ReadFile(s.Path)
	if e != nil {
		return nil, e
	}
	var st DurableState
	if e = json.Unmarshal(raw, &st); e != nil {
		return nil, e
	}
	return &st, nil
}
func (s *Store) Save(st *DurableState) error {
	if s == nil || s.Path == "" {
		return errors.New("authority store required")
	}
	if e := os.MkdirAll(filepath.Dir(s.Path), 0700); e != nil {
		return e
	}
	lock := flock.New(s.Path + ".lock")
	if e := lock.Lock(); e != nil {
		return e
	}
	defer lock.Unlock()
	return s.saveLocked(st)
}

// saveLocked requires the store lock. VerifyAndAccept owns that lock across
// read, monotonic comparison and atomic replacement.
func (s *Store) saveLocked(st *DurableState) error {
	raw, e := json.MarshalIndent(st, "", "  ")
	if e != nil {
		return e
	}
	tmp, e := os.CreateTemp(filepath.Dir(s.Path), ".authority.*.tmp")
	if e != nil {
		return e
	}
	name := tmp.Name()
	defer os.Remove(name)
	if _, e = tmp.Write(append(raw, '\n')); e == nil {
		e = tmp.Sync()
	}
	if c := tmp.Close(); e == nil {
		e = c
	}
	if e != nil {
		return e
	}
	if authorityStoreHook != nil {
		if e = authorityStoreHook("before_rename"); e != nil {
			return e
		}
	}
	if e = os.Rename(name, s.Path); e != nil {
		return e
	}
	if authorityStoreHook != nil {
		return authorityStoreHook("after_rename")
	}
	return nil
}
