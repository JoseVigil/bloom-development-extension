package governance

import (
	"bytes"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"nucleus/internal/authority"
	"nucleus/internal/core"
	"nucleus/internal/governance/ownershipcontract"
	"nucleus/internal/mandatedelivery"
)

func executeAuthority(t *testing.T, jsonMode bool, name string, service AuthorityCommandServices) (string, error) {
	t.Helper()
	cmd := NewAuthorityCommand(service, func() bool { return jsonMode })
	var out bytes.Buffer
	cmd.SetOut(&out)
	cmd.SetErr(&out)
	cmd.SetArgs([]string{name})
	err := cmd.Execute()
	return out.String(), err
}

func TestSupplyReadCommandRequiresSelectionAndKeepsAuthorityUnevaluated(t *testing.T) {
	service := AuthorityCommandServices{Run: func(name string, args []string) (AuthorityEvidenceReport, error) {
		if name != "supply-read" || len(args) != 2 || args[0] != "acme" || args[1] != "-" {
			t.Fatalf("unexpected command %q args %v", name, args)
		}
		return AuthorityEvidenceReport{Evidence: map[string]any{
			"context":   map[string]any{"status": "verified", "organization_id": "org"},
			"authority": map[string]any{"status": "not_evaluable", "reason": "session_subject_grant_link_unavailable"},
		}}, nil
	}}
	cmd := NewAuthorityCommand(service, func() bool { return true })
	var out bytes.Buffer
	cmd.SetOut(&out)
	cmd.SetArgs([]string{"supply-read", "acme", "-"})
	if err := cmd.Execute(); err != nil {
		t.Fatal(err)
	}
	var report AuthorityEvidenceReport
	if err := json.Unmarshal(out.Bytes(), &report); err != nil {
		t.Fatal(err)
	}
	if report.Evidence["authority"].(map[string]any)["status"] != "not_evaluable" {
		t.Fatal(report)
	}
}

func TestSupplyReadContextEvidenceDoesNotPromoteSelection(t *testing.T) {
	active := &core.ActiveOrgContext{OrgSlug: "acme", OrganizationID: "org-1"}
	if got := supplyReadContextEvidence("other", "project", active, nil); got["status"] != "not_evaluable" || got["reason"] != "selection_mismatch" {
		t.Fatal(got)
	}
	if got := supplyReadContextEvidence("acme", "project", active, nil); got["status"] != "verified" || got["project_status"] != "not_evaluable" {
		t.Fatal(got)
	}
	if got := supplyReadContextEvidence("acme", "-", nil, errors.New("missing")); got["status"] != "not_evaluable" {
		t.Fatal(got)
	}
}

func TestConfirmedContextUnavailableAuthorityKeepsBindingUnevaluated(t *testing.T) {
	appData := t.TempDir()
	workspace := t.TempDir()
	t.Setenv("BLOOM_APPDATA_DIR", appData)
	root := filepath.Join(workspace, ".bloom", ".nucleus-acme", ".core")
	if err := os.MkdirAll(root, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, ".nucleus-config.json"), []byte(`{}`), 0600); err != nil {
		t.Fatal(err)
	}
	config := `{"authority_base_url":"https://authority.test","onboarding":{"active_org_slug":"acme","organizations":[{"org_slug":"acme","organization_id":"org","workspace_path":` + strconv.Quote(workspace) + `,"projects":[{"project_id":"11111111-1111-4111-8111-111111111111"}]}]}}`
	if err := os.MkdirAll(filepath.Join(appData, "config"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(appData, "config", "nucleus.json"), []byte(config), 0600); err != nil {
		t.Fatal(err)
	}
	got := confirmedContextEvidence(appData, "acme", "11111111-1111-4111-8111-111111111111")
	if got["identityAndMembership"].(map[string]any)["reason"] != "authority_state_unavailable" || got["projectBinding"].(map[string]any)["reason"] != "authority_state_unavailable" || got["projectBinding"].(map[string]any)["status"] != "not_evaluable" {
		t.Fatal(got)
	}
}

func TestConfirmedContextLocationSurvivesMissingAuthorityWithoutWrites(t *testing.T) {
	appData := t.TempDir()
	workspace := t.TempDir()
	t.Setenv("BLOOM_APPDATA_DIR", appData)
	selected := filepath.Join(workspace, "selected")
	root := filepath.Join(workspace, ".bloom", ".nucleus-acme")
	if err := os.MkdirAll(filepath.Join(root, ".core"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(selected, 0700); err != nil {
		t.Fatal(err)
	}
	const projectID = "11111111-1111-4111-8111-111111111111"
	material := `{"projects":[{"id":"` + projectID + `","absolutePath":` + strconv.Quote(selected) + `}]}`
	materialPath := filepath.Join(root, ".core", ".nucleus-config.json")
	if err := os.WriteFile(materialPath, []byte(material), 0600); err != nil {
		t.Fatal(err)
	}
	config := `{"authority_base_url":"https://authority.test","onboarding":{"active_org_slug":"acme","organizations":[{"org_slug":"acme","organization_id":"org","workspace_path":` + strconv.Quote(workspace) + `,"projects":[{"project_id":"` + projectID + `","project_path":` + strconv.Quote(selected) + `}]}]}}`
	if err := os.MkdirAll(filepath.Join(appData, "config"), 0700); err != nil {
		t.Fatal(err)
	}
	configPath := filepath.Join(appData, "config", "nucleus.json")
	if err := os.WriteFile(configPath, []byte(config), 0600); err != nil {
		t.Fatal(err)
	}
	beforeConfig, _ := os.ReadFile(configPath)
	beforeMaterial, _ := os.ReadFile(materialPath)
	got := confirmedContextEvidence(appData, "acme", projectID)
	if got["localLocation"].(map[string]any)["status"] != "present" || got["projectIdContinuity"].(map[string]any)["status"] != "matched" {
		t.Fatal(got)
	}
	if got["identityAndMembership"].(map[string]any)["reason"] != "authority_state_unavailable" || got["projectBinding"].(map[string]any)["status"] != "not_evaluable" {
		t.Fatal(got)
	}
	if got["cognitumCompatibility"].(map[string]any)["status"] != "not_evaluable" || got["intelligencePreference"].(map[string]any)["status"] != "not_evaluable" {
		t.Fatal(got)
	}
	for _, item := range []map[string]any{got["localLocation"].(map[string]any), got["projectIdContinuity"].(map[string]any)} {
		if _, err := time.Parse(time.RFC3339Nano, item["checkedAt"].(string)); err != nil {
			t.Fatal(err)
		}
	}
	afterConfig, _ := os.ReadFile(configPath)
	afterMaterial, _ := os.ReadFile(materialPath)
	if !bytes.Equal(beforeConfig, afterConfig) || !bytes.Equal(beforeMaterial, afterMaterial) {
		t.Fatal("context read changed catalogs")
	}
	if _, err := os.Stat(filepath.Join(appData, "authority")); !os.IsNotExist(err) {
		t.Fatal("context read created Authority state or log")
	}
}

func TestContextReadHelpAndJSONContract(t *testing.T) {
	service := AuthorityCommandServices{Run: func(name string, args []string) (AuthorityEvidenceReport, error) {
		if name != "context-read" || len(args) != 2 {
			t.Fatalf("unexpected call %s %v", name, args)
		}
		return AuthorityEvidenceReport{OK: true, Evidence: map[string]any{"schema": "bloom.confirmed-context/v1", "localLocation": map[string]any{"status": "present"}, "projectIdContinuity": map[string]any{"status": "not_evaluable"}}}, nil
	}}
	cmd := NewAuthorityCommand(service, func() bool { return true })
	sub, _, err := cmd.Find([]string{"context-read"})
	if err != nil {
		t.Fatal(err)
	}
	if sub.Annotations["category"] != "GOVERNANCE" || !strings.Contains(sub.Long, "local folder") || !strings.Contains(sub.Example, "--json") {
		t.Fatal(sub)
	}
	var example map[string]any
	if err := json.Unmarshal([]byte(sub.Annotations["json_response"]), &example); err != nil {
		t.Fatal(err)
	}
	evidence := example["evidence"].(map[string]any)
	if evidence["localLocation"] == nil || evidence["projectIdContinuity"] == nil {
		t.Fatal(evidence)
	}
	var output bytes.Buffer
	cmd.SetOut(&output)
	cmd.SetArgs([]string{"context-read", "acme", "11111111-1111-4111-8111-111111111111"})
	if err := cmd.Execute(); err != nil {
		t.Fatal(err)
	}
	var report AuthorityEvidenceReport
	if err := json.Unmarshal(output.Bytes(), &report); err != nil {
		t.Fatal(err)
	}
	if report.Command != "context-read" || report.Evidence["projectIdContinuity"] == nil {
		t.Fatal(report)
	}
	cmd = NewAuthorityCommand(service, func() bool { return false })
	output.Reset()
	cmd.SetOut(&output)
	cmd.SetArgs([]string{"context-read", "--help"})
	if err := cmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(output.String(), "project ID continuity") || !strings.Contains(output.String(), "Examples:") {
		t.Fatal(output.String())
	}
}

func TestResolveCutoverPrincipalRequiresExactlyOneVerifiedLegacyIdentity(t *testing.T) {
	at := time.Date(2026, 9, 18, 1, 0, 0, 0, time.UTC)
	principal := func(id, subject string) authority.Principal {
		return authority.Principal{PrincipalID: id, Status: "active", ExternalIdentities: []authority.ExternalIdentity{{Subject: subject, Status: "verified", VerifiedAt: at.Add(-time.Hour)}}}
	}
	state := &authority.DurableState{Projection: authority.FullContent{Principals: []authority.Principal{principal("p1", "legacy")}, Memberships: []authority.Membership{{MembershipID: "m1", PrincipalID: "p1", OrganizationID: "org", Status: "active", ValidFrom: at.Add(-time.Hour), AcceptedAt: at.Add(-time.Hour)}}, RoleAssignments: []authority.RoleAssignment{{AssignmentID: "a1", MembershipID: "m1", RoleID: "master", RoleVersion: "1", Scope: authority.Scope{Type: "organization", ID: "org"}, Status: "active", ValidFrom: at.Add(-time.Hour), AcceptedAt: at.Add(-time.Hour)}}, RoleDefinitions: []authority.RoleDefinition{{RoleID: "master", RoleVersion: "1", RoleOrigin: "builtin", Status: "active", Permissions: authority.BuiltinRoles[authority.RoleMaster]}}}}
	if got, err := resolveCutoverPrincipal(state, "legacy", "org", at); err != nil || got != "p1" {
		t.Fatalf("got=%q err=%v", got, err)
	}
	if _, err := resolveCutoverPrincipal(state, "", "org", at); err == nil {
		t.Fatal("empty legacy subject accepted")
	}
	state.Projection.Principals = append(state.Projection.Principals, principal("p2", "legacy"))
	state.Projection.Memberships = append(state.Projection.Memberships, authority.Membership{MembershipID: "m2", PrincipalID: "p2", OrganizationID: "org", Status: "active", ValidFrom: at.Add(-time.Hour), AcceptedAt: at.Add(-time.Hour)})
	state.Projection.RoleAssignments = append(state.Projection.RoleAssignments, authority.RoleAssignment{AssignmentID: "a2", MembershipID: "m2", RoleID: "master", RoleVersion: "1", Scope: authority.Scope{Type: "organization", ID: "org"}, Status: "active", ValidFrom: at.Add(-time.Hour), AcceptedAt: at.Add(-time.Hour)})
	if _, err := resolveCutoverPrincipal(state, "legacy", "org", at); err == nil {
		t.Fatal("ambiguous legacy identity accepted")
	}
}

func TestAuthoritySyncWiresIdentityRegistrationTrustAndMandateDelivery(t *testing.T) {
	now := time.Date(2026, 9, 10, 12, 0, 0, 0, time.UTC)
	rootPublic, rootPrivate, _ := ed25519.GenerateKey(rand.Reader)
	issuerPublic, issuerPrivate, _ := ed25519.GenerateKey(rand.Reader)
	appData, workspace := t.TempDir(), t.TempDir()
	t.Setenv("BLOOM_APPDATA_DIR", appData)
	t.Setenv("AUTHORITY_SERVICE_TOKEN", "service-token")
	nucleusRoot := filepath.Join(workspace, ".bloom", ".nucleus-acme")
	if err := os.MkdirAll(filepath.Join(nucleusRoot, ".core"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(nucleusRoot, ".core", ".nucleus-config.json"), []byte(`{}`), 0600); err != nil {
		t.Fatal(err)
	}
	// Sovereign Tenant Fase 5 — .ownership.json de un `nucleus init` real, todavía en
	// formato legado (org_<timestamp> local, sin canonical_id). El sync de más abajo
	// debe migrarlo y reconciliar canonical_id + tenant_id (ver
	// ownership_reconciliation.go) sin que este test tenga que orquestar nada especial.
	if err := os.WriteFile(filepath.Join(nucleusRoot, ".ownership.json"), []byte(`{"org_id":"org_legacy_local","owner_id":"jose","created_at":"2026-09-04T10:00:00Z","team_members":[]}`), 0600); err != nil {
		t.Fatal(err)
	}

	registrationCount, projectClaimCount, mandateMode := 0, 0, "pending"
	capabilityGets, capabilityPuts, capabilityRevision := 0, 0, "1"
	capability11 := false
	failureStage := ""
	loggerReadyAtRegistration := false
	projectID := "11111111-1111-4111-8111-111111111111"
	bindingFailure := ""
	bindingTenant := "tenant-xyz"
	var installationID string
	var server *httptest.Server
	signEnvelope := func(payload any, domain, keyID string, private ed25519.PrivateKey) []byte {
		raw, _ := json.Marshal(payload)
		canonical, _ := authority.Canonicalize(raw)
		sum := sha256.Sum256(canonical)
		sig := ed25519.Sign(private, append(append([]byte(domain), 0), canonical...))
		out, _ := json.Marshal(authority.Envelope{Payload: raw, Integrity: authority.Integrity{Canonicalization: "JCS-RFC8785", DigestAlgorithm: "SHA-256", Digest: base64.RawURLEncoding.EncodeToString(sum[:]), SignatureAlgorithm: "Ed25519", KeyID: keyID, Signature: base64.RawURLEncoding.EncodeToString(sig)}})
		return out
	}
	server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if failureStage == "registration" && r.URL.Path == "/v1/authority/installations/register" {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		if failureStage == "capability" && r.URL.Path == "/v1/authority/installations/capabilities" {
			_, _ = w.Write([]byte(`{"malformed":true}`))
			return
		}
		if failureStage == "trust" && r.URL.Path == "/v1/authority/trust-manifest" {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		if failureStage == "pull" && r.URL.Path == "/v1/authority/sync/challenge" {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		switch r.URL.Path {
		case "/v1/authority/installations/register":
			matches, _ := filepath.Glob(filepath.Join(appData, "logs", "nucleus", "nucleus_governance_*.log"))
			if len(matches) == 1 {
				if currentLog, readErr := os.ReadFile(matches[0]); readErr == nil && strings.Contains(string(currentLog), "authority sync started") {
					loggerReadyAtRegistration = true
				}
			}
			registrationCount++
			var body struct {
				InstallationID                   string   `json:"installation_id"`
				SupportedAuthoritySchemaVersions []string `json:"supported_authority_schema_versions"`
			}
			_ = json.NewDecoder(r.Body).Decode(&body)
			installationID = body.InstallationID
			if len(body.SupportedAuthoritySchemaVersions) != 2 || body.SupportedAuthoritySchemaVersions[0] != "1.0" || body.SupportedAuthoritySchemaVersions[1] != "1.1" {
				t.Error("registration did not declare Authority 1.1")
			}
			// Simula una instalación existente, ya backfilled como 1.0.
			w.WriteHeader(409)
			_, _ = w.Write([]byte(`{"error":"installation_conflict"}`))
		case "/v1/authority/installations/capabilities":
			if r.Header.Get("X-Bloom-Installation-Id") != installationID || r.Header.Get("X-Bloom-Signature") == "" || r.URL.Query().Get("org") != "org-id" {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			if r.Method == http.MethodGet {
				capabilityGets++
				versions := []string{"1.0"}
				if capability11 {
					versions = []string{"1.0", "1.1"}
				}
				_ = json.NewEncoder(w).Encode(map[string]any{"organizationId": "org-id", "installationId": installationID, "revision": capabilityRevision, "supportedAuthoritySchemaVersions": versions, "source": "signed_update", "declaredAt": now})
				return
			}
			capabilityPuts++
			var update struct {
				ExpectedRevision                 string   `json:"expectedRevision"`
				SupportedAuthoritySchemaVersions []string `json:"supportedAuthoritySchemaVersions"`
				Signature                        string   `json:"signature"`
			}
			_ = json.NewDecoder(r.Body).Decode(&update)
			if update.ExpectedRevision != capabilityRevision || len(update.SupportedAuthoritySchemaVersions) != 2 || update.Signature == "" {
				t.Error("invalid capability update")
			}
			capabilityRevision, capability11 = "2", true
			_ = json.NewEncoder(w).Encode(map[string]any{"installationId": installationID, "revision": capabilityRevision, "supportedAuthoritySchemaVersions": []string{"1.0", "1.1"}})
		case "/v1/authority/trust-manifest":
			if !capability11 {
				t.Error("trust manifest requested before capability confirmation")
			}
			p := authority.TrustManifestPayload{Schema: "bloom.authority.trust-manifest", SchemaVersion: "1.0", ManifestID: "manifest", Issuer: "issuer", OrganizationID: "org-id", ManifestVersion: "1", IssuedAt: now.Add(-time.Minute), NotBefore: now.Add(-time.Minute), ExpiresAt: now.Add(time.Hour), RootKeyID: "root", Keys: []authority.TrustKey{{KeyID: "issuer-key", PublicKey: base64.RawURLEncoding.EncodeToString(issuerPublic), Status: "active", ValidFrom: now.Add(-time.Hour)}}}
			_, _ = w.Write(signEnvelope(p, "BLOOM-AUTHORITY-TRUST-MANIFEST-v1", "root", rootPrivate))
		case "/v1/authority/sync/challenge":
			_ = json.NewEncoder(w).Encode(map[string]any{"challenge": "challenge", "organization_id": "org-id", "installation_id": installationID, "issued_at": now, "expires_at": now.Add(time.Minute)})
		case "/v1/authority/sync/pull":
			if !capability11 {
				t.Error("snapshot pulled before capability confirmation")
			}
			grants := []authority.IntelligenceSupplyGrant{{GrantID: "grant-integrated", OrganizationID: "org-id", InstallationIDs: []string{installationID}, ConsumerID: "brain", ActorPrincipalID: "principal-jose", Purpose: "mandate_intelligence", AllowedCapabilities: []string{"text.generate"}, AllowedPrivacy: []string{"approved_cloud"}, AllowedDestinations: []authority.IntelligenceSupplyDestination{{Provider: "anthropic", BackendID: "anthropic_api", Models: []string{"model"}}}, Limits: authority.IntelligenceSupplyLimits{MaxTotalTokens: 10000, MaxOutputTokensPerInference: 2000, MaxInferences: 5, MaxUSD: "1.500000"}, IssuedByPrincipalID: "principal-jose", ValidFrom: now.Add(-time.Minute), ValidUntil: now.Add(time.Hour)}}
			content := authority.FullContent{Principals: []authority.Principal{{PrincipalID: "principal-jose", PrincipalType: "human", Status: "active", ExternalIdentities: []authority.ExternalIdentity{{Provider: "github", Subject: "jose", Status: "verified", VerifiedAt: now.Add(-time.Hour)}}}}, Memberships: []authority.Membership{{MembershipID: "membership-jose", PrincipalID: "principal-jose", OrganizationID: "org-id", Status: "active", ValidFrom: now.Add(-time.Hour), AcceptedAt: now.Add(-time.Hour)}}, RoleDefinitions: []authority.RoleDefinition{{RoleID: authority.RoleMaster, RoleVersion: "1", RoleOrigin: "builtin", DisplayName: "Master", Status: "active", Permissions: authority.BuiltinRoles[authority.RoleMaster]}}, RoleAssignments: []authority.RoleAssignment{{AssignmentID: "assignment-jose", MembershipID: "membership-jose", RoleID: authority.RoleMaster, RoleVersion: "1", Scope: authority.Scope{Type: "organization", ID: "org-id"}, Status: "active", ValidFrom: now.Add(-time.Hour), AcceptedAt: now.Add(-time.Hour)}}, Revocations: []authority.Revocation{}, IntelligenceSupplyGrants: &grants}
			contentRaw, _ := json.Marshal(content)
			p := authority.SnapshotPayload{Schema: "bloom.authority.snapshot", SchemaVersion: "1.1", Kind: "full", SnapshotID: "snapshot", Issuer: "issuer", OrganizationID: "org-id", AuthorityVersion: "1", IssuedAt: now.Add(-time.Minute), NotBefore: now.Add(-time.Minute), ExpiresAt: now.Add(time.Hour), Audience: authority.Audience{OrganizationID: "org-id", InstallationIDs: []string{installationID}}, Content: contentRaw}
			snapshot := signEnvelope(p, "BLOOM-AUTHORITY-SNAPSHOT-v1", "issuer-key", issuerPrivate)
			stateDigest, _ := authority.StateDigest(content, "org-id")
			snapshotSum := sha256.Sum256(mustCanonicalPayload(t, snapshot))
			challengeSum := sha256.Sum256([]byte("challenge"))
			check := authority.CurrentCheckPayload{Schema: "bloom.authority.current-check", SchemaVersion: "1.0", CheckID: "check", Issuer: "issuer", OrganizationID: "org-id", InstallationID: installationID, ChallengeDigest: hex.EncodeToString(challengeSum[:]), AuthorityVersion: "1", StateDigest: stateDigest, SnapshotDigest: base64.RawURLEncoding.EncodeToString(snapshotSum[:]), CheckedAt: now}
			var checkEnvelope authority.Envelope
			_ = json.Unmarshal(signEnvelope(check, "BLOOM-AUTHORITY-CURRENT-PULL-v1", "issuer-key", issuerPrivate), &checkEnvelope)
			_ = json.NewEncoder(w).Encode(map[string]any{"snapshot": json.RawMessage(snapshot), "current_check": checkEnvelope})
		case "/v1/mandate/bootstrap":
			if mandateMode == "pending" {
				w.WriteHeader(404)
				return
			}
			if mandateMode == "error" {
				_, _ = w.Write([]byte(`{"invalid":true}`))
				return
			}
			artifact := []byte("mandate")
			digest := sha256.Sum256(artifact)
			issued := now.Format(time.RFC3339Nano)
			payload := map[string]string{"mandate_id": "mandate", "organization_id": "org-id", "installation_id": installationID, "mandate_version": "1", "mandate_digest": hex.EncodeToString(digest[:]), "issued_at": issued}
			canonical, _ := authority.Canonicalize(mustJSON(payload))
			sig := ed25519.Sign(issuerPrivate, append(append([]byte(mandatedelivery.Domain), 0), canonical...))
			_ = json.NewEncoder(w).Encode(map[string]any{"envelope": map[string]string{"mandate_id": "mandate", "organization_id": "org-id", "installation_id": installationID, "mandate_version": "1", "mandate_digest": hex.EncodeToString(digest[:]), "issued_at": issued, "signature": base64.StdEncoding.EncodeToString(sig), "signing_key_id": "issuer-key"}, "mandate_base64": base64.StdEncoding.EncodeToString(artifact)})
		case tenantSelfPath:
			// Sovereign Tenant Fase 5 — Opción A: endpoint S2S de sólo lectura,
			// autenticado con verifyInstallationAuth (firma de instalación + ?org=),
			// no con el Bearer estático de AUTHORITY_SERVICE_TOKEN (fix companion tras
			// Cierre_Implementacion_Endpoint_TenantSelf_v1_0.md — ver
			// authority.FetchOrganizationTenantID). Confirmar acá, no sólo confiar en
			// que el caller mande algo: sin ?org= o sin firma, este handler nunca
			// hubiera atrapado el bug original.
			if r.URL.Query().Get("org") != "org-id" || r.Header.Get("X-Bloom-Installation-Id") == "" || r.Header.Get("X-Bloom-Signature") == "" || r.Header.Get("X-Bloom-Timestamp") == "" {
				w.WriteHeader(401)
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]string{"tenantId": "tenant-xyz"})
		case "/v1/authority/projects/" + projectID + "/claim":
			if r.Method != http.MethodPut || r.URL.Query().Get("org") != "org-id" || r.Header.Get("X-Bloom-Signature") == "" {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			projectClaimCount++
			status := authority.ProjectAlreadyClaimed
			if projectClaimCount == 1 {
				status = authority.ProjectClaimed
				w.WriteHeader(http.StatusCreated)
			}
			_ = json.NewEncoder(w).Encode(authority.ProjectClaim{Status: status, OrganizationID: "org-id", TenantID: "tenant-xyz", ProjectID: projectID, Revision: "1", SourceRef: "installation:" + installationID, EvidenceKind: "canonical", ClaimedAt: now.Add(-time.Minute)})
		case "/v1/authority/projects/" + projectID + "/binding":
			if r.Method != http.MethodGet || r.URL.Query().Get("org") != "org-id" || r.Header.Get("X-Bloom-Signature") == "" {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			if bindingFailure != "" {
				status := map[string]int{"project_binding_required": 404, "project_binding_expired": 410, "project_binding_revoked": 410, "project_binding_conflict": 409, "project_binding_unavailable": 503}[bindingFailure]
				w.WriteHeader(status)
				_ = json.NewEncoder(w).Encode(map[string]string{"error": bindingFailure})
				return
			}
			_ = json.NewEncoder(w).Encode(authority.ProjectBinding{Status: "bound", OrganizationID: "org-id", TenantID: bindingTenant, ProjectID: projectID, Revision: "1", SourceRef: "installation:" + installationID, EvidenceKind: "canonical", ClaimedAt: now.Add(-time.Minute), CheckedAt: now, ValidUntil: now.Add(time.Hour)})
		}
	}))
	defer server.Close()
	config := map[string]any{"authority_base_url": server.URL, "onboarding": map[string]any{"active_org_slug": "acme", "organizations": []map[string]any{{"org_slug": "acme", "organization_id": "org-id", "workspace_path": workspace, "projects": []map[string]string{{"project_id": projectID, "name": "Canonical project"}}}}}}
	if err := os.MkdirAll(filepath.Join(appData, "config"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(appData, "config", "nucleus.json"), mustJSON(config), 0600); err != nil {
		t.Fatal(err)
	}
	authorityCommandHTTPClient, authorityCommandRoots, authorityCommandNow = server.Client(), func() map[string]ed25519.PublicKey { return map[string]ed25519.PublicKey{"root": rootPublic} }, func() time.Time { return now }
	defer func() {
		authorityCommandHTTPClient = nil
		authorityCommandRoots = authority.DevelopmentPinnedRoots
		authorityCommandNow = func() time.Time { return time.Now().UTC() }
	}()
	// LogsDir/TelemetryDir replican lo que core.InitPaths() arma en producción
	// (filepath.Join(appDataDir, "logs")) — necesario porque el auto-encadenamiento de
	// sync ahora usa core.InitLogger(&c.Paths, "MANDATE", ...) (mismo stream de
	// telemetría "nucleus_mandate" que ya usa 'nucleus mandate install' manual); sin
	// LogsDir, InitLogger escribiría con un path relativo vacío fuera de t.TempDir().
	services := defaultAuthorityServices(&core.Core{Paths: core.Paths{AppDataDir: appData, LogsDir: filepath.Join(appData, "logs"), TelemetryDir: filepath.Join(appData, "logs")}})
	for _, expected := range []string{"pending", "accepted", "replay", "error"} {
		mandateMode = expected
		report, err := services.Run("sync", nil)
		if err != nil || !report.OK || report.Evidence["mandate_delivery"] != expected {
			t.Fatalf("mode=%s report=%+v err=%v", expected, report, err)
		}
		// Auto-encadenamiento sync→install (Encargo_Implementacion_AutoEncadenamiento_
		// Sync_Install_y_Validacion_Backend_v1_0.md §2.4): tanto "accepted" como "replay"
		// deben terminar con el mandate materializado en disco de verdad — no alcanza con
		// que el campo de evidencia diga true, hay que leer mandate.json del filesystem y
		// confirmar el contenido exacto que sirvió el handler fake de /v1/mandate/bootstrap.
		if expected == "accepted" || expected == "replay" {
			if report.Evidence["mandate_installed"] != true {
				t.Fatalf("mode=%s expected mandate_installed=true, report=%+v", expected, report)
			}
			mandatePath := filepath.Join(nucleusRoot, ".mandates", "mandate", "mandate.json")
			got, readErr := os.ReadFile(mandatePath)
			if readErr != nil {
				t.Fatalf("mode=%s no pude leer el mandate.json materializado en %s: %v", expected, mandatePath, readErr)
			}
			if string(got) != "mandate" {
				t.Fatalf("mode=%s contenido de mandate.json inesperado: got %q", expected, got)
			}
		}
	}
	if registrationCount != 4 {
		t.Fatalf("registration count=%d", registrationCount)
	}
	if capabilityPuts != 1 || capabilityGets != 5 {
		t.Fatalf("capability gets=%d puts=%d", capabilityGets, capabilityPuts)
	}
	if projectClaimCount != 4 {
		t.Fatalf("project claim count=%d", projectClaimCount)
	}
	if !loggerReadyAtRegistration {
		t.Fatal("GOVERNANCE logger was not initialized before installation registration")
	}
	for _, stage := range []string{"registration", "capability", "trust", "pull"} {
		failureStage = stage
		report, syncErr := services.Run("sync", nil)
		if syncErr == nil || report.OK {
			t.Fatalf("stage=%s expected fail-closed sync, report=%+v err=%v", stage, report, syncErr)
		}
	}
	failureStage = ""
	governanceLogs, _ := filepath.Glob(filepath.Join(appData, "logs", "nucleus", "nucleus_governance_*.log"))
	if len(governanceLogs) != 1 {
		t.Fatalf("GOVERNANCE log files=%v", governanceLogs)
	}
	governanceLog, err := os.ReadFile(governanceLogs[0])
	if err != nil {
		t.Fatal(err)
	}
	logText := string(governanceLog)
	for _, evidence := range []string{
		"authority sync started",
		"stage=registration result=registered",
		"stage=capability update=attempted",
		"stage=capability confirmed=1.1 revision=2",
		"stage=trust result=verified",
		"stage=pull result=accepted authority_version=1 state_digest=",
		"failed stage=registration",
		"failed stage=capability",
		"failed stage=trust",
		"failed stage=pull",
	} {
		if !strings.Contains(logText, evidence) {
			t.Fatalf("GOVERNANCE log missing %q:\n%s", evidence, logText)
		}
	}
	if starts, ends := strings.Count(logText, "Logging session started"), strings.Count(logText, "Logging session ended"); starts != 8 || ends != 8 {
		t.Fatalf("GOVERNANCE logger initialization count starts=%d ends=%d, want one session per 8 sync attempts", starts, ends)
	}
	for _, forbidden := range []string{
		"service-token",
		"grant-integrated",
		base64.RawURLEncoding.EncodeToString(rootPrivate),
		base64.RawURLEncoding.EncodeToString(issuerPrivate),
		base64.RawURLEncoding.EncodeToString(rootPublic),
		base64.RawURLEncoding.EncodeToString(issuerPublic),
	} {
		if forbidden != "" && strings.Contains(logText, forbidden) {
			t.Fatalf("GOVERNANCE log leaked forbidden material %q", forbidden)
		}
	}
	logFiles, err := filepath.Glob(filepath.Join(appData, "logs", "nucleus", "*.log"))
	if err != nil {
		t.Fatal(err)
	}
	for _, path := range logFiles {
		if strings.Contains(filepath.Base(path), "authority") {
			t.Fatalf("authority sync created a new log stream: %s", path)
		}
	}
	grantEvidence, grantErr := authority.ResolveIntelligenceSupplyGrant(&authority.Store{Path: filepath.Join(appData, "authority", "state.json")}, &authority.CheckpointStore{Path: filepath.Join(appData, "authority", "checkpoint.json")}, "org-id", installationID, "grant-integrated", now)
	if grantErr != nil || grantEvidence.Status != authority.IntelligenceSupplyGrantActive || grantEvidence.ConsumerID != "brain" {
		t.Fatalf("integrated Authority 1.1 Grant was not persisted/resolved: %+v err=%v", grantEvidence, grantErr)
	}
	receipts, err := (&authority.ProjectBindingStore{Path: filepath.Join(appData, "authority", "project-bindings.json")}).Load()
	if err != nil || len(receipts) != 1 || receipts[0].ProjectID != projectID {
		t.Fatalf("canonical project receipt missing: %+v err=%v", receipts, err)
	}
	// Context read must not claim or sync again, and must keep principal,
	// location, Cognitum and preference independent of a valid binding.
	beforeClaims := projectClaimCount
	stateBefore, err := os.ReadFile(filepath.Join(appData, "authority", "state.json"))
	if err != nil {
		t.Fatal(err)
	}
	checkpointBefore, err := os.ReadFile(filepath.Join(appData, "authority", "checkpoint.json"))
	if err != nil {
		t.Fatal(err)
	}
	context := confirmedContextEvidence(appData, "acme", projectID)
	if context["schema"] != "bloom.confirmed-context/v1" {
		t.Fatal(context)
	}
	bind := context["projectBinding"].(map[string]any)
	if bind["status"] != "bound" || bind["projectId"] != projectID || bind["organizationId"] != "org-id" || bind["tenantId"] != "tenant-xyz" {
		t.Fatal(context)
	}
	if context["identityAndMembership"].(map[string]any)["status"] != "not_evaluable" || context["cognitumCompatibility"].(map[string]any)["status"] != "not_evaluable" || context["intelligencePreference"].(map[string]any)["status"] != "not_evaluable" {
		t.Fatal(context)
	}
	if projectClaimCount != beforeClaims {
		t.Fatal("read claimed a project")
	}
	stateAfter, _ := os.ReadFile(filepath.Join(appData, "authority", "state.json"))
	checkpointAfter, _ := os.ReadFile(filepath.Join(appData, "authority", "checkpoint.json"))
	if !bytes.Equal(stateBefore, stateAfter) || !bytes.Equal(checkpointBefore, checkpointAfter) {
		t.Fatal("context read mutated Authority state")
	}
	bindingTenant = "other-tenant"
	if got := confirmedContextEvidence(appData, "acme", projectID)["projectBinding"].(map[string]any); got["status"] == "bound" {
		t.Fatal("cross-tenant binding accepted")
	}
	bindingTenant = "tenant-xyz"
	if wrong := confirmedContextEvidence(appData, "other", projectID); wrong["projectBinding"].(map[string]any)["status"] == "bound" {
		t.Fatal(wrong)
	}
	if wrong := confirmedContextEvidence(appData, "acme", "22222222-2222-4222-8222-222222222222"); wrong["projectBinding"].(map[string]any)["status"] == "bound" {
		t.Fatal(wrong)
	}
	for _, failure := range []string{"project_binding_required", "project_binding_expired", "project_binding_revoked", "project_binding_conflict", "project_binding_unavailable"} {
		bindingFailure = failure
		got := confirmedContextEvidence(appData, "acme", projectID)["projectBinding"].(map[string]any)
		if got["status"] == "bound" || got["reason"] != failure {
			t.Fatalf("failure=%s got=%v", failure, got)
		}
	}
	bindingFailure = ""
	authorityCommandNow = func() time.Time { return now.Add(48 * time.Hour) }
	if got := confirmedContextEvidence(appData, "acme", projectID); got["projectBinding"].(map[string]any)["status"] == "bound" {
		t.Fatal("stale Authority state promoted binding")
	}
	authorityCommandNow = func() time.Time { return now }
	checkpointPath := filepath.Join(appData, "authority", "checkpoint.json")
	checkpointRaw, err := os.ReadFile(checkpointPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(checkpointPath, []byte(`{}`), 0600); err != nil {
		t.Fatal(err)
	}
	if got := confirmedContextEvidence(appData, "acme", projectID); got["projectBinding"].(map[string]any)["status"] == "bound" {
		t.Fatal("invalid checkpoint promoted binding")
	}
	if err := os.WriteFile(checkpointPath, checkpointRaw, 0600); err != nil {
		t.Fatal(err)
	}

	// Sovereign Tenant Fase 5 — el mismo sync que ya se probó arriba (4 corridas, una
	// por cada mandateMode) debe haber dejado .ownership.json migrado y reconciliado:
	// canonical_id == "org-id" (el organizationId real) y tenant_id == "tenant-xyz"
	// (servido por el fake tenantSelfPath de más arriba), sin que este test haya tenido
	// que orquestar nada aparte de escribir el .ownership.json legado inicial.
	reconciledRaw, err := os.ReadFile(filepath.Join(nucleusRoot, ".ownership.json"))
	if err != nil {
		t.Fatalf("no pude leer .ownership.json reconciliado: %v", err)
	}
	var reconciled ownershipcontract.Document
	if err := json.Unmarshal(reconciledRaw, &reconciled); err != nil {
		t.Fatalf(".ownership.json reconciliado no es JSON válido: %v", err)
	}
	if reconciled.Binding.State != ownershipcontract.BindingStateRemoteLocked {
		t.Fatalf("binding state=%v, esperaba REMOTE_LOCKED", reconciled.Binding.State)
	}
	if reconciled.Organization.CanonicalID == nil || *reconciled.Organization.CanonicalID != "org-id" {
		t.Fatalf("canonical_id no reconciliado: %+v", reconciled.Organization)
	}
	if reconciled.Organization.TenantID == nil || *reconciled.Organization.TenantID != "tenant-xyz" {
		t.Fatalf("tenant_id no reconciliado: %+v", reconciled.Organization)
	}

	// Ajuste pedido por Jose (2026-09-16): el mismo tenant_id ("tenant-xyz", servido
	// por el fake tenantSelfPath de más arriba) también debe quedar anotado como campo
	// plano en la entrada "acme" de onboarding.organizations dentro de config/
	// nucleus.json — sin que la forma del array cambie (sigue siendo el mismo array
	// plano sembrado al principio de este test, con un campo más) y sin perder
	// authority_base_url ni el resto de los campos ya sembrados de esa organización.
	nucleusConfigRaw, err := os.ReadFile(filepath.Join(appData, "config", "nucleus.json"))
	if err != nil {
		t.Fatalf("no pude leer config/nucleus.json: %v", err)
	}
	var nucleusConfig map[string]any
	if err := json.Unmarshal(nucleusConfigRaw, &nucleusConfig); err != nil {
		t.Fatalf("config/nucleus.json no es JSON válido: %v", err)
	}
	if got := nucleusConfig["authority_base_url"]; got != server.URL {
		t.Fatalf("authority_base_url no se preservó: got %v", got)
	}
	onboarding, _ := nucleusConfig["onboarding"].(map[string]any)
	organizations, _ := onboarding["organizations"].([]any)
	if len(organizations) != 1 {
		t.Fatalf("onboarding.organizations cambió de forma (se esperaba el mismo array plano de 1 elemento): %+v", organizations)
	}
	acme, _ := organizations[0].(map[string]any)
	if acme["org_slug"] != "acme" || acme["organization_id"] != "org-id" || acme["workspace_path"] != workspace {
		t.Fatalf("la entrada de acme perdió campos ya existentes: %+v", acme)
	}
	if acme["tenant_id"] != "tenant-xyz" {
		t.Fatalf("tenant_id no se anotó en config/nucleus.json: %+v", acme)
	}
}

func mustJSON(value any) []byte { raw, _ := json.Marshal(value); return raw }

func mustCanonicalPayload(t *testing.T, envelope []byte) []byte {
	t.Helper()
	var parsed authority.Envelope
	if err := json.Unmarshal(envelope, &parsed); err != nil {
		t.Fatal(err)
	}
	canonical, err := authority.Canonicalize(parsed.Payload)
	if err != nil {
		t.Fatal(err)
	}
	return canonical
}

func TestAuthorityCapabilityTelemetryLogsBootstrapAndCASConflictWithoutBodies(t *testing.T) {
	logsDir := t.TempDir()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte(`{"secret":"bootstrap-response-body"}`))
		case http.MethodPut:
			w.WriteHeader(http.StatusConflict)
			_, _ = w.Write([]byte(`{"secret":"cas-response-body"}`))
		}
	}))
	defer server.Close()

	authorityCommandHTTPClient = server.Client()
	defer func() { authorityCommandHTTPClient = nil }()
	logger, err := core.InitLogger(&core.Paths{LogsDir: logsDir}, "GOVERNANCE", true)
	if err != nil {
		t.Fatal(err)
	}
	client := authorityHTTPClientWithTelemetry(logger)
	response, err := client.Get(server.URL + "/v1/authority/installations/capabilities")
	if err != nil {
		t.Fatal(err)
	}
	_ = response.Body.Close()
	request, err := http.NewRequest(http.MethodPut, server.URL+"/v1/authority/installations/capabilities", strings.NewReader(`{"signature":"must-not-be-logged"}`))
	if err != nil {
		t.Fatal(err)
	}
	response, err = client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	_ = response.Body.Close()
	if err := logger.Close(); err != nil {
		t.Fatal(err)
	}

	logs, _ := filepath.Glob(filepath.Join(logsDir, "nucleus", "nucleus_governance_*.log"))
	if len(logs) != 1 {
		t.Fatalf("logs=%v", logs)
	}
	raw, err := os.ReadFile(logs[0])
	if err != nil {
		t.Fatal(err)
	}
	text := string(raw)
	for _, expected := range []string{"bootstrap=required expected_revision=0", "cas_conflict=true retry=bounded"} {
		if !strings.Contains(text, expected) {
			t.Fatalf("missing %q in telemetry:\n%s", expected, text)
		}
	}
	for _, forbidden := range []string{"bootstrap-response-body", "cas-response-body", "must-not-be-logged"} {
		if strings.Contains(text, forbidden) {
			t.Fatalf("telemetry leaked HTTP material %q", forbidden)
		}
	}
}

func TestAuthorityCLIHumanAndJSONCarrySameEvidence(t *testing.T) {
	service := AuthorityCommandServices{Run: func(command string, args []string) (AuthorityEvidenceReport, error) {
		return AuthorityEvidenceReport{OK: true, Evidence: map[string]any{"authority_version": "8", "outcome": "not_evaluable", "effective_mode": "local_legacy", "cutover": false}}, nil
	}}
	human, err := executeAuthority(t, false, "sync", service)
	if err != nil {
		t.Fatal(err)
	}
	wire, err := executeAuthority(t, true, "sync", service)
	if err != nil {
		t.Fatal(err)
	}
	var report AuthorityEvidenceReport
	if json.Unmarshal([]byte(wire), &report) != nil {
		t.Fatal("invalid JSON")
	}
	for k, v := range report.Evidence {
		raw, _ := json.Marshal(v)
		if !strings.Contains(human, k+": "+string(raw)) {
			t.Fatalf("human output omitted %s=%s: %s", k, raw, human)
		}
	}
	if !strings.Contains(human, "Schema: "+report.Schema) || !strings.Contains(human, "OK: true") {
		t.Fatalf("schema/status missing: %s", human)
	}
}
func TestAuthorityCLIStableErrorAndObservationCannotChangeMode(t *testing.T) {
	service := AuthorityCommandServices{Run: func(command string, args []string) (AuthorityEvidenceReport, error) {
		return AuthorityEvidenceReport{Evidence: map[string]any{"effective_mode": "local_legacy", "cutover": false, "outcome": "not_evaluable"}}, AuthorityCommandError{"controls_absent"}
	}}
	for _, name := range []string{"status", "sync", "decision", "checkpoint", "observation"} {
		out, err := executeAuthority(t, true, name, service)
		if err == nil {
			t.Fatalf("%s accepted error", name)
		}
		var coded AuthorityCommandError
		if !errors.As(err, &coded) || coded.Code != "controls_absent" {
			t.Fatalf("%s err=%v", name, err)
		}
		var report AuthorityEvidenceReport
		if json.Unmarshal([]byte(out), &report) != nil || report.ErrorCode != "controls_absent" || report.Evidence["effective_mode"] != "local_legacy" || report.Evidence["cutover"] != false {
			t.Fatalf("%s report=%s", name, out)
		}
	}
}
func TestAuthorityCLIHasOnlyReadAndExplicitSyncCommands(t *testing.T) {
	cmd := NewAuthorityCommand(AuthorityCommandServices{Run: func(string, []string) (AuthorityEvidenceReport, error) { return AuthorityEvidenceReport{OK: true}, nil }}, func() bool { return false })
	if cmd.Long == "" || cmd.Example == "" || cmd.Annotations["category"] != "GOVERNANCE" {
		t.Fatalf("authority help metadata incomplete: long=%q example=%q annotations=%v", cmd.Long, cmd.Example, cmd.Annotations)
	}
	var rootExample map[string]any
	if err := json.Unmarshal([]byte(cmd.Annotations["json_response"]), &rootExample); err != nil {
		t.Fatalf("authority json_response invalid: %v", err)
	}
	got := map[string]bool{}
	for _, sub := range cmd.Commands() {
		got[sub.Name()] = true
		if sub.Long == "" || sub.Example == "" || sub.Annotations["category"] != "GOVERNANCE" {
			t.Fatalf("%s help metadata incomplete: long=%q example=%q annotations=%v", sub.Name(), sub.Long, sub.Example, sub.Annotations)
		}
		var example AuthorityEvidenceReport
		if err := json.Unmarshal([]byte(sub.Annotations["json_response"]), &example); err != nil {
			t.Fatalf("%s json_response invalid: %v", sub.Name(), err)
		}
		if example.Command != sub.Name() || example.Schema != "bloom.authority.cli-evidence/v1" {
			t.Fatalf("%s json_response is not representative: %+v", sub.Name(), example)
		}
	}
	for _, name := range []string{"status", "sync", "decision", "checkpoint", "observation", "service-identity", "service-grants"} {
		if !got[name] {
			t.Fatalf("missing %s", name)
		}
	}
	for _, forbidden := range []string{"cutover", "mode", "enforce"} {
		if got[forbidden] {
			t.Fatalf("unexpected mutator %s", forbidden)
		}
	}
}
