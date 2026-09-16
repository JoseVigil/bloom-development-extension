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

	registrationCount, mandateMode := 0, "pending"
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
			content := authority.FullContent{Principals: []authority.Principal{}, Memberships: []authority.Membership{}, RoleDefinitions: []authority.RoleDefinition{}, RoleAssignments: []authority.RoleAssignment{}, Revocations: []authority.Revocation{}}
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
			// Sovereign Tenant Fase 5 — Opción A: endpoint S2S de sólo lectura, mismo
			// mecanismo de autenticación (Bearer AUTHORITY_SERVICE_TOKEN) que ya se
			// verifica implícitamente en /v1/authority/installations/register vía el
			// resto de este fake server.
			_ = json.NewEncoder(w).Encode(map[string]string{"tenantId": "tenant-xyz"})
		}
	}))
	defer server.Close()
	config := map[string]any{"authority_base_url": server.URL, "onboarding": map[string]any{"active_org_slug": "acme", "organizations": []map[string]string{{"org_slug": "acme", "organization_id": "org-id", "workspace_path": workspace}}}}
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
	if reconciled.Binding.State != ownershipcontract.BindingStateBound {
		t.Fatalf("binding state=%v, esperaba BOUND", reconciled.Binding.State)
	}
	if reconciled.Organization.CanonicalID == nil || *reconciled.Organization.CanonicalID != "org-id" {
		t.Fatalf("canonical_id no reconciliado: %+v", reconciled.Organization)
	}
	if reconciled.Organization.TenantID == nil || *reconciled.Organization.TenantID != "tenant-xyz" {
		t.Fatalf("tenant_id no reconciliado: %+v", reconciled.Organization)
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
