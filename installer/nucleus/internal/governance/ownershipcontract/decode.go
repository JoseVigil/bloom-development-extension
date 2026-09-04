package ownershipcontract

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"sort"
	"time"
	"unicode/utf8"
)

func DecodeCanonical(raw []byte) (*Document, error) {
	if err := validateJSON(raw); err != nil {
		return nil, err
	}
	var document Document
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&document); err != nil {
		return nil, fmt.Errorf("ownership: decode canonical: %w", err)
	}
	if err := requireEOF(decoder); err != nil {
		return nil, err
	}
	if err := Validate(&document); err != nil {
		return nil, err
	}
	return &document, nil
}

func Analyze(raw []byte) (Analysis, error) {
	if err := validateJSON(raw); err != nil {
		return Analysis{}, err
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(raw, &fields); err != nil {
		return Analysis{}, err
	}
	if _, canonical := fields["schema"]; canonical {
		document, err := DecodeCanonical(raw)
		if err != nil {
			return Analysis{}, err
		}
		return Analysis{Source: SourceCanonical, Canonical: document}, nil
	}
	if contradictoryLegacyKeys(fields) {
		return Analysis{}, ErrContradictoryOwnership
	}
	matches := classify(fields)
	if len(matches) == 0 {
		return Analysis{}, ErrUnknownFormat
	}
	if len(matches) != 1 {
		return Analysis{}, fmt.Errorf("%w: %v", ErrAmbiguousFormat, matches)
	}
	facts, err := decodeLegacyFacts(raw, matches[0])
	if err != nil {
		return Analysis{}, err
	}
	return Analysis{Source: matches[0], LegacyFacts: facts}, nil
}

func Normalize(analysis Analysis, context NormalizationContext) (*Document, error) {
	if analysis.Canonical != nil {
		copy := *analysis.Canonical
		return &copy, Validate(&copy)
	}
	if analysis.LegacyFacts == nil || context.InstallationID == "" || context.MigrationID == "" || context.SourceDigest == "" || context.MigratedAt.IsZero() {
		return nil, ErrInsufficientLegacyEvidence
	}
	markers := append([]string(nil), context.EffectiveMarkers...)
	sort.Strings(markers)
	facts := analysis.LegacyFacts
	updatedAt := context.MigratedAt.UTC()
	if updatedAt.Before(facts.CreatedAt.UTC()) {
		updatedAt = facts.CreatedAt.UTC()
	}
	document := &Document{
		Schema:        SchemaName,
		SchemaVersion: SchemaVersion,
		AuthorityMode: AuthorityModeLocalLegacy,
		Organization:  facts.Organization,
		Installation:  Installation{InstallationID: context.InstallationID},
		Binding:       Binding{State: BindingStateUnbound},
		LegacyAuthority: &LegacyAuthority{
			Owner:            facts.Owner,
			TeamMembers:      append([]LegacyMember(nil), facts.TeamMembers...),
			EffectiveMarkers: markers,
		},
		Migration: &Migration{
			SourceFormat:       analysis.Source,
			SourceDigestSHA256: context.SourceDigest,
			MigratedAt:         context.MigratedAt.UTC(),
			MigrationID:        context.MigrationID,
		},
		CreatedAt: facts.CreatedAt.UTC(),
		UpdatedAt: updatedAt,
	}
	if err := Validate(document); err != nil {
		return nil, err
	}
	return document, nil
}

func EffectiveLegacyView(analysis Analysis) (LegacyAuthorityView, error) {
	if analysis.Canonical != nil {
		if err := Validate(analysis.Canonical); err != nil {
			return LegacyAuthorityView{}, err
		}
		if analysis.Canonical.AuthorityMode == AuthorityModeRemoteEnforced {
			return LegacyAuthorityView{}, ErrLegacyAuthorityForbidden
		}
		legacy := analysis.Canonical.LegacyAuthority
		return LegacyAuthorityView{Mode: analysis.Canonical.AuthorityMode, Owner: legacy.Owner, TeamMembers: append([]LegacyMember(nil), legacy.TeamMembers...), Markers: append([]string(nil), legacy.EffectiveMarkers...), MarkersDeclared: true}, nil
	}
	if analysis.LegacyFacts == nil {
		return LegacyAuthorityView{}, ErrInsufficientLegacyEvidence
	}
	return LegacyAuthorityView{Mode: AuthorityModeLocalLegacy, Owner: analysis.LegacyFacts.Owner, TeamMembers: append([]LegacyMember(nil), analysis.LegacyFacts.TeamMembers...), MarkersDeclared: false}, nil
}

func validateJSON(raw []byte) error {
	if !utf8.Valid(raw) {
		return errors.New("ownership: invalid UTF-8")
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	if err := consumeValue(decoder); err != nil {
		return err
	}
	return requireEOF(decoder)
}

func consumeValue(decoder *json.Decoder) error {
	token, err := decoder.Token()
	if err != nil {
		return fmt.Errorf("ownership: invalid JSON: %w", err)
	}
	delim, isDelimiter := token.(json.Delim)
	if !isDelimiter {
		return nil
	}
	switch delim {
	case '{':
		seen := map[string]struct{}{}
		for decoder.More() {
			keyToken, err := decoder.Token()
			if err != nil {
				return fmt.Errorf("ownership: invalid object key: %w", err)
			}
			key, ok := keyToken.(string)
			if !ok {
				return errors.New("ownership: object key is not a string")
			}
			if _, duplicate := seen[key]; duplicate {
				return fmt.Errorf("ownership: duplicate property %q", key)
			}
			seen[key] = struct{}{}
			if err := consumeValue(decoder); err != nil {
				return err
			}
		}
		closing, err := decoder.Token()
		if err != nil || closing != json.Delim('}') {
			return errors.New("ownership: unterminated object")
		}
	case '[':
		for decoder.More() {
			if err := consumeValue(decoder); err != nil {
				return err
			}
		}
		closing, err := decoder.Token()
		if err != nil || closing != json.Delim(']') {
			return errors.New("ownership: unterminated array")
		}
	default:
		return errors.New("ownership: unexpected JSON delimiter")
	}
	return nil
}

func requireEOF(decoder *json.Decoder) error {
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		if err == nil {
			return errors.New("ownership: multiple JSON values")
		}
		return fmt.Errorf("ownership: trailing JSON: %w", err)
	}
	return nil
}

func contradictoryLegacyKeys(fields map[string]json.RawMessage) bool {
	_, owner := fields["owner"]
	_, ownerID := fields["owner_id"]
	_, ownerName := fields["owner_name"]
	_, masterUser := fields["master_user"]
	return owner && (ownerID || ownerName || masterUser) || ownerID && masterUser
}

func classify(fields map[string]json.RawMessage) []SourceFormat {
	has := func(name string) bool { _, ok := fields[name]; return ok }
	var matches []SourceFormat
	if has("org_id") && has("owner_id") && has("created_at") && !has("organization_fingerprint") && !has("master_user") && !has("owner") {
		matches = append(matches, SourceNucleusGoV0)
	}
	if has("organization_fingerprint") && has("organization_name") && has("master_user") && has("key_fingerprint") && has("created_at") && !has("org_id") && !has("owner_id") && !has("owner") {
		matches = append(matches, SourceBatcaveTypeScriptV0)
	}
	if has("owner") && has("created_at") && !has("organization_fingerprint") && !has("version") && !has("org_id") && !has("owner_id") && !has("master_user") {
		matches = append(matches, SourceSupervisorOwnerV0)
	}
	var version string
	_ = json.Unmarshal(fields["version"], &version)
	if version == "2.0" && has("organization_fingerprint") && has("owner") && has("roles") && has("team_members") && !has("org_id") && !has("owner_id") && !has("master_user") {
		matches = append(matches, SourceGovernanceSpecV2Documented)
	}
	if has("organization_fingerprint") && has("key_fingerprint") && !has("master_user") && !has("owner") && !has("org_id") && version != "2.0" {
		matches = append(matches, SourceBatcaveArchitectureV1)
	}
	return matches
}

func decodeLegacyFacts(raw []byte, format SourceFormat) (*LegacyFacts, error) {
	var generic map[string]json.RawMessage
	if err := json.Unmarshal(raw, &generic); err != nil {
		return nil, err
	}
	facts := &LegacyFacts{}
	parseCreatedAt := func() error {
		var value string
		if err := json.Unmarshal(generic["created_at"], &value); err != nil {
			return ErrInsufficientLegacyEvidence
		}
		parsed, err := time.Parse(time.RFC3339, value)
		if err != nil {
			return ErrInsufficientLegacyEvidence
		}
		facts.CreatedAt = parsed
		return nil
	}
	if format != SourceBatcaveArchitectureV1 {
		if err := parseCreatedAt(); err != nil {
			return nil, err
		}
	}
	switch format {
	case SourceNucleusGoV0:
		var orgID, ownerID, ownerName string
		_ = json.Unmarshal(generic["org_id"], &orgID)
		_ = json.Unmarshal(generic["owner_id"], &ownerID)
		_ = json.Unmarshal(generic["owner_name"], &ownerName)
		if orgID == "" || ownerID == "" {
			return nil, ErrInsufficientLegacyEvidence
		}
		facts.Organization.LegacyOrgID = stringPointer(orgID)
		facts.Owner = LegacyOwner{Source: "github_handle", Subject: ownerID}
		if ownerName != "" {
			facts.Owner.DisplayName = stringPointer(ownerName)
		}
		if members, exists := generic["team_members"]; exists {
			if err := json.Unmarshal(members, &facts.TeamMembers); err != nil {
				return nil, ErrInsufficientLegacyEvidence
			}
		}
	case SourceBatcaveTypeScriptV0:
		var locator, displayName, owner string
		_ = json.Unmarshal(generic["organization_fingerprint"], &locator)
		_ = json.Unmarshal(generic["organization_name"], &displayName)
		_ = json.Unmarshal(generic["master_user"], &owner)
		if locator == "" || owner == "" {
			return nil, ErrInsufficientLegacyEvidence
		}
		facts.Organization.LegacyLocator = stringPointer(locator)
		if displayName != "" {
			facts.Organization.DisplayName = stringPointer(displayName)
		}
		facts.Owner = LegacyOwner{Source: "github_handle", Subject: owner}
	case SourceSupervisorOwnerV0, SourceGovernanceSpecV2Documented:
		owner, err := decodeStructuredOwner(generic["owner"])
		if err != nil {
			return nil, err
		}
		facts.Owner = owner
		if format == SourceGovernanceSpecV2Documented {
			var locator string
			_ = json.Unmarshal(generic["organization_fingerprint"], &locator)
			if locator != "" {
				facts.Organization.LegacyLocator = stringPointer(locator)
			}
			_ = json.Unmarshal(generic["team_members"], &facts.TeamMembers)
		}
	case SourceBatcaveArchitectureV1:
		return nil, ErrInsufficientLegacyEvidence
	default:
		return nil, ErrUnknownFormat
	}
	return facts, nil
}

func decodeStructuredOwner(raw json.RawMessage) (LegacyOwner, error) {
	var object struct {
		Source      string  `json:"source"`
		Subject     string  `json:"subject"`
		ID          string  `json:"id"`
		DisplayName *string `json:"display_name"`
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&object); err != nil {
		return LegacyOwner{}, ErrInsufficientLegacyEvidence
	}
	if object.Subject == "" {
		object.Subject = object.ID
	}
	if object.Subject == "" {
		return LegacyOwner{}, ErrInsufficientLegacyEvidence
	}
	if object.Source == "" {
		object.Source = "github_handle"
	}
	return LegacyOwner{Source: object.Source, Subject: object.Subject, DisplayName: object.DisplayName}, nil
}

func stringPointer(value string) *string { return &value }
