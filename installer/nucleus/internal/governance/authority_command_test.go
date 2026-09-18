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
	projectID := "11111111-1111-4111-8111-111111111111"
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
		switch r.URL.Path {
		case "/v1/authority/installations/register":
			registrationCount++
			var body map[string]string
			_ = json.NewDecoder(r.Body).Decode(&body)
			installationID = body["installation_id"]
			if registrationCount == 1 {
				w.WriteHeader(201)
				_, _ = w.Write([]byte(`{"status":"registered"}`))
			} else {
				w.WriteHeader(409)
				_, _ = w.Write([]byte(`{"error":"installation_conflict"}`))
			}
		case "/v1/authority/trust-manifest":
			p := authority.TrustManifestPayload{Schema: "bloom.authority.trust-manifest", SchemaVersion: "1.0", ManifestID: "manifest", Issuer: "issuer", OrganizationID: "org-id", ManifestVersion: "1", IssuedAt: now.Add(-time.Minute), NotBefore: now.Add(-time.Minute), ExpiresAt: now.Add(time.Hour), RootKeyID: "root", Keys: []authority.TrustKey{{KeyID: "issuer-key", PublicKey: base64.RawURLEncoding.EncodeToString(issuerPublic), Status: "active", ValidFrom: now.Add(-time.Hour)}}}
			_, _ = w.Write(signEnvelope(p, "BLOOM-AUTHORITY-TRUST-MANIFEST-v1", "root", rootPrivate))
		case "/v1/authority/sync/challenge":
			_ = json.NewEncoder(w).Encode(map[string]any{"challenge": "challenge", "organization_id": "org-id", "installation_id": installationID, "issued_at": now, "expires_at": now.Add(time.Minute)})
		case "/v1/authority/sync/pull":
			content := authority.FullContent{Principals: []authority.Principal{{PrincipalID: "principal-jose", PrincipalType: "human", Status: "active", ExternalIdentities: []authority.ExternalIdentity{{Provider: "github", Subject: "jose", Status: "verified", VerifiedAt: now.Add(-time.Hour)}}}}, Memberships: []authority.Membership{{MembershipID: "membership-jose", PrincipalID: "principal-jose", OrganizationID: "org-id", Status: "active", ValidFrom: now.Add(-time.Hour), AcceptedAt: now.Add(-time.Hour)}}, RoleDefinitions: []authority.RoleDefinition{{RoleID: authority.RoleMaster, RoleVersion: "1", RoleOrigin: "builtin", DisplayName: "Master", Status: "active", Permissions: authority.BuiltinRoles[authority.RoleMaster]}}, RoleAssignments: []authority.RoleAssignment{{AssignmentID: "assignment-jose", MembershipID: "membership-jose", RoleID: authority.RoleMaster, RoleVersion: "1", Scope: authority.Scope{Type: "organization", ID: "org-id"}, Status: "active", ValidFrom: now.Add(-time.Hour), AcceptedAt: now.Add(-time.Hour)}}, Revocations: []authority.Revocation{}}
			contentRaw, _ := json.Marshal(content)
			p := authority.SnapshotPayload{Schema: "bloom.authority.snapshot", SchemaVersion: "1.0", Kind: "full", SnapshotID: "snapshot", Issuer: "issuer", OrganizationID: "org-id", AuthorityVersion: "1", IssuedAt: now.Add(-time.Minute), NotBefore: now.Add(-time.Minute), ExpiresAt: now.Add(time.Hour), Audience: authority.Audience{OrganizationID: "org-id", InstallationIDs: []string{installationID}}, Content: contentRaw}
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
			_ = json.NewEncoder(w).Encode(authority.ProjectBinding{Status: "bound", OrganizationID: "org-id", TenantID: "tenant-xyz", ProjectID: projectID, Revision: "1", SourceRef: "installation:" + installationID, EvidenceKind: "canonical", ClaimedAt: now.Add(-time.Minute), CheckedAt: now, ValidUntil: now.Add(time.Hour)})
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
	if projectClaimCount != 4 {
		t.Fatalf("project claim count=%d", projectClaimCount)
	}
	receipts, err := (&authority.ProjectBindingStore{Path: filepath.Join(appData, "authority", "project-bindings.json")}).Load()
	if err != nil || len(receipts) != 1 || receipts[0].ProjectID != projectID {
		t.Fatalf("canonical project receipt missing: %+v err=%v", receipts, err)
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
func TestAuthorityCLIHumanAndJSONCarrySameEvidence(t *testing.T) {
	service := AuthorityCommandServices{Run: func(command string, args []string) (AuthorityEvidenceReport, error) {
		return AuthorityEvidenceReport{OK: true, Evidence: map[string]any{"authority_version": "8", "outcome": "not_evaluable", "effective_mode": "local_legacy", "cutover": false}}, nil
	}}
	human, err := executeAuthority(t, false, "status", service)
	if err != nil {
		t.Fatal(err)
	}
	wire, err := executeAuthority(t, true, "status", service)
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
	got := map[string]bool{}
	for _, sub := range cmd.Commands() {
		got[sub.Name()] = true
	}
	for _, name := range []string{"status", "sync", "decision", "checkpoint", "observation"} {
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
