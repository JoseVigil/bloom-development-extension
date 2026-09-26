package authority

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/gofrs/flock"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"time"
	"unicode/utf16"
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
type VaultServiceGrant struct {
	GrantID             string    `json:"grant_id"`
	OrganizationID      string    `json:"organization_id"`
	InstallationID      string    `json:"installation_id"`
	Consumer            string    `json:"consumer"`
	Permission          string    `json:"permission"`
	KeyID               string    `json:"key_id"`
	Purpose             string    `json:"purpose"`
	ServicePublicKey    string    `json:"service_public_key"`
	IssuedByPrincipalID string    `json:"issued_by_principal_id"`
	ValidFrom           time.Time `json:"valid_from"`
	ValidUntil          time.Time `json:"valid_until"`
}
type FullContent struct {
	Principals         []Principal         `json:"principals"`
	Memberships        []Membership        `json:"memberships"`
	RoleDefinitions    []RoleDefinition    `json:"role_definitions"`
	RoleAssignments    []RoleAssignment    `json:"role_assignments"`
	Revocations        []Revocation        `json:"revocations"`
	VaultServiceGrants []VaultServiceGrant `json:"vault_service_grants,omitempty"`
}

// Historical snapshots carry five collections. The sixth is mandatory only
// when present, preserving their signed bytes and state digests.
type legacyFullContent struct {
	Principals      []Principal      `json:"principals"`
	Memberships     []Membership     `json:"memberships"`
	RoleDefinitions []RoleDefinition `json:"role_definitions"`
	RoleAssignments []RoleAssignment `json:"role_assignments"`
	Revocations     []Revocation     `json:"revocations"`
}

func decodeProjection(raw []byte, out *FullContent) error {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(raw, &fields); err != nil {
		return err
	}
	if _, present := fields["vault_service_grants"]; present {
		return decodeWire(raw, out)
	}
	var legacy legacyFullContent
	if err := decodeWire(raw, &legacy); err != nil {
		return err
	}
	*out = FullContent{Principals: legacy.Principals, Memberships: legacy.Memberships, RoleDefinitions: legacy.RoleDefinitions, RoleAssignments: legacy.RoleAssignments, Revocations: legacy.Revocations}
	return nil
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
	Digest        string `json:"digest"` // Legacy-compatible name: payload digest, NEVER state digest.
	StateDigest   string `json:"state_digest,omitempty"`
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
	Binding    Binding           `json:"binding"`
	Projection FullContent       `json:"accepted_projection"`
	Monotonic  MonotonicState    `json:"monotonic_state"`
	Journal    []JournalEntry    `json:"acceptance_journal"`
	Emission   *EmissionMetadata `json:"emission,omitempty"`
}

// All fields shared by full and delta; kind, base and content are deliberately absent.
type EmissionMetadata struct {
	Schema           string    `json:"schema"`
	SchemaVersion    string    `json:"schema_version"`
	SnapshotID       string    `json:"snapshot_id"`
	Issuer           string    `json:"issuer"`
	OrganizationID   string    `json:"organization_id"`
	AuthorityVersion string    `json:"authority_version"`
	IssuedAt         time.Time `json:"issued_at"`
	NotBefore        time.Time `json:"not_before"`
	ExpiresAt        time.Time `json:"expires_at"`
	Audience         Audience  `json:"audience"`
}

func metadata(p SnapshotPayload) EmissionMetadata {
	return EmissionMetadata{p.Schema, p.SchemaVersion, p.SnapshotID, p.Issuer, p.OrganizationID, p.AuthorityVersion, p.IssuedAt.UTC(), p.NotBefore.UTC(), p.ExpiresAt.UTC(), p.Audience}
}

var ErrLegacyState = errors.New("legacy authority state lacks emission evidence; recovery required without lowering high-water mark")

type Store struct{ Path string }

var authorityStoreHook func(stage string) error

type Verifier struct {
	Trust      TrustBundle
	Manifest   *VerifiedTrustManifest
	Binding    Binding
	Store      *Store
	Checkpoint *CheckpointStore
	Now        func() time.Time
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
	now := time.Now().UTC()
	if v.Now != nil {
		now = v.Now().UTC()
	}
	var err error
	trust := v.Trust
	if v.Manifest != nil {
		if v.Manifest.Payload.OrganizationID != v.Binding.OrganizationID || v.Manifest.Payload.Issuer != v.Binding.Issuer || now.Before(v.Manifest.Payload.NotBefore) || !now.Before(v.Manifest.Payload.ExpiresAt) {
			return nil, errors.New("trust manifest binding or validity mismatch")
		}
		trust, err = v.Manifest.SnapshotTrust(now)
		if err != nil {
			return nil, err
		}
	}
	if v.Checkpoint != nil {
		if err = v.Checkpoint.recoverLocked(v.Store); err != nil {
			return nil, err
		}
	}
	env, _, err := ParseAndVerifyEnvelope(raw, trust)
	if err != nil {
		return nil, err
	}
	var p SnapshotPayload
	if err = decodeWire(env.Payload, &p); err != nil {
		return nil, err
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
	if v.Checkpoint != nil {
		if _, err = v.Checkpoint.validateLocked(v.Store, state, v.Manifest); err != nil {
			return nil, err
		}
	}
	if state.Binding != v.Binding {
		return nil, errors.New("durable binding mismatch")
	}
	current, err := strictVersion(state.Monotonic.HighWaterMark)
	if err != nil {
		return nil, err
	}
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
	common := metadata(p)
	if incoming == current && !sameJSON(state.Emission, &common) {
		return nil, errors.New("same authority version with conflicting emission metadata")
	}
	if incoming == current && state.Monotonic.Digest == env.Integrity.Digest {
		return state, nil
	}
	var projection FullContent
	if p.Kind == "full" {
		if err = decodeProjection(p.Content, &projection); err != nil {
			return nil, err
		}
		normalizeProjection(&projection)
	} else {
		if incoming == current {
			return nil, errors.New("unknown delta replay requires full reconciliation")
		}
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
	for _, r := range projection.Revocations {
		version, _ := strictVersion(r.RecordedInAuthorityVersion)
		if version > incoming {
			return nil, errors.New("future revocation version")
		}
	}
	digest, err := StateDigest(projection, p.OrganizationID)
	if err != nil {
		return nil, err
	}
	if incoming == current {
		if digest != state.Monotonic.StateDigest {
			return nil, errors.New("same authority version with conflicting state digest")
		}
		return state, nil // Equivalent full does not rewrite accepted evidence or journal.
	}
	if current != 0 {
		if err := validateContinuity(state.Projection, projection); err != nil {
			return nil, err
		}
	}
	state.Binding = v.Binding
	state.Projection = projection
	state.Monotonic.HighWaterMark = p.AuthorityVersion
	state.Monotonic.Digest = env.Integrity.Digest
	state.Monotonic.StateDigest = digest
	state.Emission = &common
	state.Journal = append(state.Journal, JournalEntry{SnapshotID: p.SnapshotID, Version: p.AuthorityVersion, Outcome: "accepted", At: now, CorrelationID: correlationID})
	if v.Checkpoint != nil {
		err = v.Checkpoint.commitLocked(v.Store, state, v.Manifest)
	} else {
		err = v.Store.saveLocked(state)
	}
	if err != nil {
		return nil, err
	}
	return state, nil
}
func validatePayload(p SnapshotPayload, b Binding, now time.Time) error {
	if p.Schema != "bloom.authority.snapshot" || p.SchemaVersion != "1.0" || (p.Kind != "full" && p.Kind != "delta") {
		return errors.New("unsupported snapshot")
	}
	if p.AuthorityVersion == "" || p.SnapshotID == "" || b.OrganizationID == "" || b.Issuer == "" || b.InstallationID == "" {
		return errors.New("authority version required")
	}
	if _, e := strictVersion(p.AuthorityVersion); e != nil {
		return e
	}
	if p.Kind == "full" && p.BaseAuthorityVersion != nil {
		return errors.New("full cannot specify a base")
	}
	if p.Kind == "delta" {
		if p.BaseAuthorityVersion == nil || *p.BaseAuthorityVersion == "" {
			return errors.New("delta base required")
		}
		base, err := strictVersion(*p.BaseAuthorityVersion)
		if err != nil {
			return err
		}
		version, _ := strictVersion(p.AuthorityVersion)
		if base >= version {
			return errors.New("delta version order")
		}
	}
	if p.OrganizationID != b.OrganizationID || p.Issuer != b.Issuer || p.Audience.OrganizationID != p.OrganizationID {
		return errors.New("snapshot binding mismatch")
	}
	found := false
	seen := map[string]bool{}
	for i, id := range p.Audience.InstallationIDs {
		if id == "" || seen[id] || (i > 0 && !wireLess(p.Audience.InstallationIDs[i-1], id)) {
			return errors.New("noncanonical audience")
		}
		seen[id] = true
		if id == b.InstallationID {
			found = true
		}
	}
	if !found {
		return errors.New("snapshot not targeted to installation")
	}
	if !p.IssuedAt.Before(p.ExpiresAt) || p.IssuedAt.After(now) || p.NotBefore.After(p.ExpiresAt) || p.ExpiresAt.Sub(p.IssuedAt) > 24*time.Hour || now.Before(p.NotBefore) || !now.Before(p.ExpiresAt) {
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
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0, errors.New("invalid authority version")
		}
	}
	return strconv.ParseUint(s, 10, 64)
}
func validateProjection(f FullContent, org string) error {
	// Reuse the wire shape check for direct Go callers as well as decoded JSON.
	raw, err := json.Marshal(f)
	if err != nil {
		return err
	}
	var checked FullContent
	if err := decodeProjection(raw, &checked); err != nil {
		return err
	}
	if org == "" {
		return errors.New("organization required")
	}
	one := func(value string, choices ...string) bool {
		for _, c := range choices {
			if value == c {
				return true
			}
		}
		return false
	}
	unique := func(seen map[string]bool, id string) bool {
		if id == "" || seen[id] {
			return false
		}
		seen[id] = true
		return true
	}
	validity := func(from time.Time, until *time.Time) bool { return until == nil || until.After(from) }
	roles := map[string]bool{}
	for _, r := range f.RoleDefinitions {
		if err := ValidateRoleDefinition(r); err != nil {
			return err
		}
		if _, err := strictVersion(r.RoleVersion); err != nil {
			return err
		}
		if !one(r.Status, "active", "suspended", "retired") || !unique(roles, roleKey(r.RoleID, r.RoleVersion)) {
			return errors.New("invalid or duplicate role")
		}
	}
	principals := map[string]bool{}
	identities := map[string]bool{}
	for _, p := range f.Principals {
		if !unique(principals, p.PrincipalID) || !one(p.PrincipalType, "human", "service") || !one(p.Status, "active", "suspended", "retired") {
			return errors.New("invalid or duplicate principal")
		}
		local := map[string]bool{}
		for _, e := range p.ExternalIdentities {
			key := roleKey(e.Provider, e.Subject)
			if e.Provider == "" || e.Subject == "" || !one(e.Status, "verified", "revoked") || !unique(local, key) {
				return errors.New("invalid external identity")
			}
			if e.Status == "verified" && !unique(identities, key) {
				return errors.New("duplicate active identity binding")
			}
		}
	}
	members := map[string]bool{}
	for _, m := range f.Memberships {
		if !principals[m.PrincipalID] || m.OrganizationID != org {
			return errors.New("invalid membership reference")
		}
		if !unique(members, m.MembershipID) || !one(m.Status, "pending", "active", "suspended", "expired", "revoked") || !validity(m.ValidFrom, m.ValidUntil) {
			return errors.New("invalid membership")
		}
	}
	assignments := map[string]bool{}
	for _, a := range f.RoleAssignments {
		if !members[a.MembershipID] || !roles[roleKey(a.RoleID, a.RoleVersion)] || a.Scope.ID == "" {
			return errors.New("invalid role assignment")
		}
		if _, ok := ScopeTypes[a.Scope.Type]; !ok {
			return errors.New("invalid scope")
		}
		if !unique(assignments, a.AssignmentID) || !one(a.Status, "pending", "active", "suspended", "expired", "revoked") || !validity(a.ValidFrom, a.ValidUntil) || (a.Scope.Type == "organization" && a.Scope.ID != org) {
			return errors.New("invalid assignment")
		}
	}
	revocations := map[string]bool{}
	for _, r := range f.Revocations {
		if !unique(revocations, r.RevocationID) || r.TargetID == "" || r.ReasonCode == "" || !one(r.TargetType, "external_identity", "membership", "role_definition", "role_assignment", "vault_service_grant") || r.RecordedInAuthorityVersion == "" {
			return errors.New("invalid revocation")
		}
		if _, err := strictVersion(r.RecordedInAuthorityVersion); err != nil {
			return err
		}
	}
	grants := map[string]bool{}
	for _, g := range f.VaultServiceGrants {
		key, err := base64.RawURLEncoding.DecodeString(g.ServicePublicKey)
		issuerHuman := false
		for _, p := range f.Principals {
			if p.PrincipalID == g.IssuedByPrincipalID && p.PrincipalType == "human" {
				issuerHuman = true
			}
		}
		if !unique(grants, g.GrantID) || g.OrganizationID != org || g.InstallationID == "" || g.Consumer != "aitap" || g.Permission != "vault.key.read" || g.KeyID == "" || g.Purpose != "mandate_genesis_intelligence" || len(key) != 32 || base64.RawURLEncoding.EncodeToString(key) != g.ServicePublicKey || !issuerHuman || !g.ValidUntil.After(g.ValidFrom) || err != nil {
			return errors.New("invalid vault service grant")
		}
	}
	return nil
}
func applyDelta(base FullContent, raw []byte) (FullContent, error) {
	copyRaw, err := json.Marshal(base)
	if err != nil {
		return base, err
	}
	if err := json.Unmarshal(copyRaw, &base); err != nil {
		return base, err
	}
	var d DeltaContent
	if err := decodeWire(raw, &d); err != nil {
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
			if err := decodeWire(op.Value, &v); err != nil {
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
			if err := decodeWire(op.Value, &v); err != nil {
				return err
			}
			if v.MembershipID != op.EntityID {
				return errors.New("delta membership entity_id mismatch")
			}
		}
		f.Memberships = mutate(f.Memberships, op.EntityID, op.Operation, v, func(x Membership) string { return x.MembershipID })
	case "role_definitions":
		if op.Operation == "remove" {
			return errors.New("historical role removal forbidden")
		}
		var v RoleDefinition
		if op.Operation == "upsert" {
			if err := decodeWire(op.Value, &v); err != nil {
				return err
			}
			if v.RoleID != op.EntityID {
				return errors.New("delta role entity_id mismatch")
			}
		}
		f.RoleDefinitions = mutate(f.RoleDefinitions, roleKey(v.RoleID, v.RoleVersion), op.Operation, v, func(x RoleDefinition) string { return roleKey(x.RoleID, x.RoleVersion) })
	case "role_assignments":
		var v RoleAssignment
		if op.Operation == "upsert" {
			if err := decodeWire(op.Value, &v); err != nil {
				return err
			}
			if v.AssignmentID != op.EntityID {
				return errors.New("delta assignment entity_id mismatch")
			}
		}
		f.RoleAssignments = mutate(f.RoleAssignments, op.EntityID, op.Operation, v, func(x RoleAssignment) string { return x.AssignmentID })
	case "revocations":
		if op.Operation == "remove" {
			return errors.New("revocation removal forbidden")
		}
		var v Revocation
		if op.Operation == "upsert" {
			if err := decodeWire(op.Value, &v); err != nil {
				return err
			}
			if v.RevocationID != op.EntityID {
				return errors.New("delta revocation entity_id mismatch")
			}
		}
		f.Revocations = mutate(f.Revocations, op.EntityID, op.Operation, v, func(x Revocation) string { return x.RevocationID })
	case "vault_service_grants":
		var v VaultServiceGrant
		if op.Operation == "upsert" {
			if err := decodeWire(op.Value, &v); err != nil {
				return err
			}
			if v.GrantID != op.EntityID {
				return errors.New("delta grant entity_id mismatch")
			}
		}
		f.VaultServiceGrants = mutate(f.VaultServiceGrants, op.EntityID, op.Operation, v, func(x VaultServiceGrant) string { return x.GrantID })
	default:
		return errors.New("unknown delta collection")
	}
	return nil
}

func normalizeProjection(f *FullContent) {
	for i := range f.Principals {
		e := f.Principals[i].ExternalIdentities
		for j := range e {
			e[j].VerifiedAt = e[j].VerifiedAt.UTC()
		}
		sort.Slice(e, func(i, j int) bool {
			if e[i].Provider == e[j].Provider {
				return wireLess(e[i].Subject, e[j].Subject)
			}
			return wireLess(e[i].Provider, e[j].Provider)
		})
	}
	for i := range f.Memberships {
		m := &f.Memberships[i]
		m.ValidFrom = m.ValidFrom.UTC()
		m.AcceptedAt = m.AcceptedAt.UTC()
		if m.ValidUntil != nil {
			u := m.ValidUntil.UTC()
			m.ValidUntil = &u
		}
	}
	for i := range f.RoleAssignments {
		a := &f.RoleAssignments[i]
		a.ValidFrom = a.ValidFrom.UTC()
		a.AcceptedAt = a.AcceptedAt.UTC()
		if a.ValidUntil != nil {
			u := a.ValidUntil.UTC()
			a.ValidUntil = &u
		}
	}
	for i := range f.Revocations {
		f.Revocations[i].EffectiveAt = f.Revocations[i].EffectiveAt.UTC()
	}
	for i := range f.RoleDefinitions {
		p := f.RoleDefinitions[i].Permissions
		sort.Slice(p, func(i, j int) bool { return wireLess(p[i], p[j]) })
	}
	sort.Slice(f.Principals, func(i, j int) bool { return wireLess(f.Principals[i].PrincipalID, f.Principals[j].PrincipalID) })
	sort.Slice(f.Memberships, func(i, j int) bool { return wireLess(f.Memberships[i].MembershipID, f.Memberships[j].MembershipID) })
	sort.Slice(f.RoleDefinitions, func(i, j int) bool {
		if f.RoleDefinitions[i].RoleID == f.RoleDefinitions[j].RoleID {
			a, _ := strictVersion(f.RoleDefinitions[i].RoleVersion)
			b, _ := strictVersion(f.RoleDefinitions[j].RoleVersion)
			return a < b
		}
		return wireLess(f.RoleDefinitions[i].RoleID, f.RoleDefinitions[j].RoleID)
	})
	sort.Slice(f.RoleAssignments, func(i, j int) bool {
		return wireLess(f.RoleAssignments[i].AssignmentID, f.RoleAssignments[j].AssignmentID)
	})
	sort.Slice(f.Revocations, func(i, j int) bool { return wireLess(f.Revocations[i].RevocationID, f.Revocations[j].RevocationID) })
	sort.Slice(f.VaultServiceGrants, func(i, j int) bool { return wireLess(f.VaultServiceGrants[i].GrantID, f.VaultServiceGrants[j].GrantID) })
}

func wireLess(a, b string) bool {
	x, y := utf16.Encode([]rune(a)), utf16.Encode([]rune(b))
	for i := 0; i < len(x) && i < len(y); i++ {
		if x[i] != y[i] {
			return x[i] < y[i]
		}
	}
	return len(x) < len(y)
}
func roleKey(id, version string) string {
	raw, _ := json.Marshal([]string{id, version})
	return string(raw)
}
func sameJSON(a, b any) bool {
	x, e := json.Marshal(a)
	if e != nil {
		return false
	}
	y, e := json.Marshal(b)
	if e != nil {
		return false
	}
	x, e = Canonicalize(x)
	if e != nil {
		return false
	}
	y, e = Canonicalize(y)
	return e == nil && bytes.Equal(x, y)
}

// StateDigest hashes a detached normal form, never the envelope or emission metadata.
func StateDigest(f FullContent, org string) (string, error) {
	if err := validateProjection(f, org); err != nil {
		return "", err
	}
	raw, _ := json.Marshal(f)
	var copy FullContent
	if err := json.Unmarshal(raw, &copy); err != nil {
		return "", err
	}
	normalizeProjection(&copy)
	raw, err := json.Marshal(copy)
	if err != nil {
		return "", err
	}
	canonical, err := Canonicalize(raw)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(canonical)
	return base64.RawURLEncoding.EncodeToString(sum[:]), nil
}
func validateContinuity(old, next FullContent) error {
	for _, r := range old.Revocations {
		found := false
		for _, n := range next.Revocations {
			if n.RevocationID == r.RevocationID && sameJSON(r, n) {
				found = true
			}
		}
		if !found {
			return errors.New("revocation history cannot change")
		}
	}
	for _, r := range old.RoleDefinitions {
		found := false
		for _, n := range next.RoleDefinitions {
			if n.RoleID == r.RoleID && n.RoleVersion == r.RoleVersion {
				if n.RoleOrigin != r.RoleOrigin || !sameJSON(n.Permissions, r.Permissions) {
					return errors.New("role permissions or origin change requires a new role version")
				}
				found = true
			}
		}
		if !found {
			return errors.New("historical role removal forbidden")
		}
	}
	for _, p := range old.Principals {
		found := false
		for _, n := range next.Principals {
			if n.PrincipalID == p.PrincipalID {
				found = true
			}
		}
		if !found {
			return errors.New("principal removal deferred")
		}
	}
	revoked := func(kind, id string) bool {
		for _, r := range next.Revocations {
			if r.TargetType == kind && r.TargetID == id {
				return true
			}
		}
		return false
	}
	for _, m := range old.Memberships {
		found := false
		for _, n := range next.Memberships {
			if n.MembershipID == m.MembershipID {
				found = true
			}
		}
		if !found && !revoked("membership", m.MembershipID) {
			return errors.New("membership removal requires revocation")
		}
	}
	for _, a := range old.RoleAssignments {
		found := false
		for _, n := range next.RoleAssignments {
			if n.AssignmentID == a.AssignmentID {
				found = true
			}
		}
		if !found && !revoked("role_assignment", a.AssignmentID) {
			return errors.New("assignment removal requires revocation")
		}
	}
	for _, g := range old.VaultServiceGrants {
		found := false
		for _, n := range next.VaultServiceGrants {
			if n.GrantID == g.GrantID && sameJSON(n, g) {
				found = true
			}
		}
		if !found {
			return errors.New("vault service grant history cannot change")
		}
	}
	return nil
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
	if e = rejectDuplicateKeys(raw); e != nil {
		return nil, e
	}
	if e = decodeStrict(raw, &st); e != nil {
		return nil, e
	}
	if st.Emission == nil || st.Monotonic.StateDigest == "" {
		return nil, ErrLegacyState
	}
	if st.Monotonic.HighWaterMark == "" || st.Emission.AuthorityVersion != st.Monotonic.HighWaterMark || st.Emission.OrganizationID != st.Binding.OrganizationID || st.Emission.Issuer != st.Binding.Issuer {
		return nil, errors.New("invalid durable emission")
	}
	if _, e := strictVersion(st.Monotonic.HighWaterMark); e != nil {
		return nil, e
	}
	if _, e := strictVersion(st.Monotonic.CutoverFloor); e != nil {
		return nil, e
	}
	digest, e := StateDigest(st.Projection, st.Binding.OrganizationID)
	if e != nil || digest != st.Monotonic.StateDigest {
		return nil, fmt.Errorf("durable state digest mismatch: %v", e)
	}
	payloadDigest, e := base64.RawURLEncoding.DecodeString(st.Monotonic.Digest)
	if e != nil || len(payloadDigest) != sha256.Size || base64.RawURLEncoding.EncodeToString(payloadDigest) != st.Monotonic.Digest {
		return nil, errors.New("invalid durable payload digest")
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
