package governance

import (
	"bytes"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"nucleus/internal/authority"
	"nucleus/internal/core"
)

// ─── extractOrganizationID ──────────────────────────────────────────────────

func TestExtractOrganizationID(t *testing.T) {
	cases := []struct {
		name    string
		raw     string
		want    string
		wantErr bool
	}{
		{"plain text", "org-abc-123", "org-abc-123", false},
		{"plain text with surrounding whitespace", "  org-abc-123  \n", "org-abc-123", false},
		{"json with organizationId", `{"organizationId":"org-xyz","principalId":"p1","csrf":"c"}`, "org-xyz", false},
		{"json without organizationId field", `{"principalId":"p1"}`, "", true},
		{"json with empty organizationId", `{"organizationId":""}`, "", true},
		{"invalid json", `{not json`, "", true},
		{"empty string", "", "", true},
		{"only whitespace", "   \n\t", "", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := extractOrganizationID(tc.raw)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("esperaba error para %q, no hubo (got=%q)", tc.raw, got)
				}
				return
			}
			if err != nil {
				t.Fatalf("error inesperado para %q: %v", tc.raw, err)
			}
			if got != tc.want {
				t.Fatalf("got %q want %q", got, tc.want)
			}
		})
	}
}

// ─── writeActiveOrgContext ──────────────────────────────────────────────────

func readNucleusConfig(t *testing.T, appData string) map[string]any {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(appData, "config", "nucleus.json"))
	if err != nil {
		t.Fatal(err)
	}
	var cfg map[string]any
	if err := json.Unmarshal(raw, &cfg); err != nil {
		t.Fatalf("nucleus.json inválido: %v\n%s", err, raw)
	}
	return cfg
}

func TestWriteActiveOrgContextRejectsMissingArguments(t *testing.T) {
	if err := writeActiveOrgContext("", "org-id", "https://authority.test", "/ws"); err == nil {
		t.Fatal("esperaba error con orgSlug vacío")
	}
	if err := writeActiveOrgContext("acme", "", "https://authority.test", "/ws"); err == nil {
		t.Fatal("esperaba error con organizationID vacío")
	}
	if err := writeActiveOrgContext("acme", "org-id", "", "/ws"); err == nil {
		t.Fatal("esperaba error con authorityURL vacía")
	}
	if err := writeActiveOrgContext("acme", "org-id", "https://authority.test", ""); err == nil {
		t.Fatal("esperaba error con workspacePath vacío")
	}
}

func TestWriteActiveOrgContextCreatesFileWhenMissing(t *testing.T) {
	appData := t.TempDir()
	t.Setenv("BLOOM_APPDATA_DIR", appData)

	if err := writeActiveOrgContext("acme", "org-real-id", "https://authority.test", "/home/user/repos/acme"); err != nil {
		t.Fatal(err)
	}

	cfg := readNucleusConfig(t, appData)
	if cfg["authority_base_url"] != "https://authority.test" {
		t.Fatalf("authority_base_url=%v", cfg["authority_base_url"])
	}
	onboarding, ok := cfg["onboarding"].(map[string]any)
	if !ok {
		t.Fatalf("onboarding faltante o con forma inesperada: %v", cfg["onboarding"])
	}
	if onboarding["active_org_slug"] != "acme" {
		t.Fatalf("active_org_slug=%v", onboarding["active_org_slug"])
	}
	orgs, ok := onboarding["organizations"].([]any)
	if !ok || len(orgs) != 1 {
		t.Fatalf("organizations=%v", onboarding["organizations"])
	}
	entry := orgs[0].(map[string]any)
	if entry["org_slug"] != "acme" || entry["organization_id"] != "org-real-id" || entry["workspace_path"] != "/home/user/repos/acme" {
		t.Fatalf("entry=%v", entry)
	}
}

func TestWriteActiveOrgContextPreservesOtherOrganizationsAndUnknownFields(t *testing.T) {
	appData := t.TempDir()
	t.Setenv("BLOOM_APPDATA_DIR", appData)
	configPath := filepath.Join(appData, "config", "nucleus.json")
	if err := os.MkdirAll(filepath.Dir(configPath), 0700); err != nil {
		t.Fatal(err)
	}
	// Simula un archivo que ya tiene una organización distinta y un campo de nivel
	// superior que este comando no conoce (por ejemplo, escrito por Conductor) — ambos
	// deben sobrevivir intactos.
	existing := `{
	  "authority_base_url": "https://authority.test",
	  "some_conductor_field": "keep-me",
	  "onboarding": {
	    "active_org_slug": "other-org",
	    "organizations": [
	      {"org_slug": "other-org", "organization_id": "org-other", "workspace_path": "/ws/other", "extra_field": "keep-me-too"}
	    ]
	  }
	}`
	if err := os.WriteFile(configPath, []byte(existing), 0600); err != nil {
		t.Fatal(err)
	}

	if err := writeActiveOrgContext("acme", "org-real-id", "https://ignored.test", "/ws/acme"); err != nil {
		t.Fatal(err)
	}

	cfg := readNucleusConfig(t, appData)
	// authority_base_url ya estaba seteado — no se pisa con la URL nueva.
	if cfg["authority_base_url"] != "https://authority.test" {
		t.Fatalf("authority_base_url pisado: %v", cfg["authority_base_url"])
	}
	if cfg["some_conductor_field"] != "keep-me" {
		t.Fatalf("campo desconocido de nivel superior perdido: %v", cfg["some_conductor_field"])
	}
	onboarding := cfg["onboarding"].(map[string]any)
	if onboarding["active_org_slug"] != "acme" {
		t.Fatalf("active_org_slug no actualizado: %v", onboarding["active_org_slug"])
	}
	orgs := onboarding["organizations"].([]any)
	if len(orgs) != 2 {
		t.Fatalf("esperaba 2 organizaciones, hubo %d: %v", len(orgs), orgs)
	}
	byOrgSlug := map[string]map[string]any{}
	for _, o := range orgs {
		entry := o.(map[string]any)
		byOrgSlug[entry["org_slug"].(string)] = entry
	}
	other := byOrgSlug["other-org"]
	if other == nil || other["organization_id"] != "org-other" || other["extra_field"] != "keep-me-too" {
		t.Fatalf("organización preexistente alterada: %v", other)
	}
	acme := byOrgSlug["acme"]
	if acme == nil || acme["organization_id"] != "org-real-id" || acme["workspace_path"] != "/ws/acme" {
		t.Fatalf("organización nueva mal escrita: %v", acme)
	}
}

func TestWriteActiveOrgContextUpdatesExistingSlugInPlaceWithoutDuplicating(t *testing.T) {
	appData := t.TempDir()
	t.Setenv("BLOOM_APPDATA_DIR", appData)

	if err := writeActiveOrgContext("acme", "org-first", "https://authority.test", "/ws/acme"); err != nil {
		t.Fatal(err)
	}
	if err := writeActiveOrgContext("acme", "org-second", "https://authority.test", "/ws/acme-moved"); err != nil {
		t.Fatal(err)
	}

	cfg := readNucleusConfig(t, appData)
	onboarding := cfg["onboarding"].(map[string]any)
	orgs := onboarding["organizations"].([]any)
	if len(orgs) != 1 {
		t.Fatalf("esperaba una sola entrada para el mismo slug, hubo %d: %v", len(orgs), orgs)
	}
	entry := orgs[0].(map[string]any)
	if entry["organization_id"] != "org-second" || entry["workspace_path"] != "/ws/acme-moved" {
		t.Fatalf("entry no actualizada por la segunda corrida: %v", entry)
	}
}

func TestWriteActiveOrgContextRejectsCorruptExistingFile(t *testing.T) {
	appData := t.TempDir()
	t.Setenv("BLOOM_APPDATA_DIR", appData)
	configPath := filepath.Join(appData, "config", "nucleus.json")
	if err := os.MkdirAll(filepath.Dir(configPath), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(configPath, []byte("{not valid json"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := writeActiveOrgContext("acme", "org-id", "https://authority.test", "/ws"); err == nil {
		t.Fatal("esperaba error en vez de pisar un nucleus.json corrupto")
	}
	// El archivo corrupto no fue tocado.
	raw, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(raw) != "{not valid json" {
		t.Fatalf("el archivo corrupto fue modificado: %s", raw)
	}
}

// ─── extremo a extremo: comando 'nucleus auth link' completo ───────────────

func signEnvelope(payload any, domain, keyID string, private ed25519.PrivateKey) []byte {
	raw, _ := json.Marshal(payload)
	canonical, _ := authority.Canonicalize(raw)
	sum := sha256.Sum256(canonical)
	sig := ed25519.Sign(private, append(append([]byte(domain), 0), canonical...))
	out, _ := json.Marshal(authority.Envelope{Payload: raw, Integrity: authority.Integrity{
		Canonicalization: "JCS-RFC8785", DigestAlgorithm: "SHA-256", Digest: base64.RawURLEncoding.EncodeToString(sum[:]),
		SignatureAlgorithm: "Ed25519", KeyID: keyID, Signature: base64.RawURLEncoding.EncodeToString(sig)}})
	return out
}

func mustCanonical(t *testing.T, envelope []byte) []byte {
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

// TestAuthLinkCommandWritesOrgContextThenSyncs cubre el flujo completo del
// comando 'nucleus auth link': pega un organizationId (JSON crudo, como el que
// devuelve hoy el callback de Génesis), verifica que config/nucleus.json quede
// escrito, y que la misma lógica de 'nucleus authority sync' corra a
// continuación sin reabrir ese código (mismo patrón de servidor de prueba que
// TestAuthoritySyncWiresIdentityRegistrationTrustAndMandateDelivery en
// authority_command_test.go).
func TestAuthLinkCommandWritesOrgContextThenSyncs(t *testing.T) {
	now := time.Date(2026, 9, 14, 12, 0, 0, 0, time.UTC)
	rootPublic, rootPrivate, _ := ed25519.GenerateKey(rand.Reader)
	issuerPublic, issuerPrivate, _ := ed25519.GenerateKey(rand.Reader)
	appData, workspace, logsDir := t.TempDir(), t.TempDir(), t.TempDir()
	t.Setenv("BLOOM_APPDATA_DIR", appData)
	t.Setenv("AUTHORITY_SERVICE_TOKEN", "service-token")
	nucleusRoot := filepath.Join(workspace, ".bloom", ".nucleus-acme")
	if err := os.MkdirAll(filepath.Join(nucleusRoot, ".core"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(nucleusRoot, ".core", ".nucleus-config.json"), []byte(`{}`), 0600); err != nil {
		t.Fatal(err)
	}

	var installationID string
	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/authority/installations/register":
			var body map[string]string
			_ = json.NewDecoder(r.Body).Decode(&body)
			installationID = body["installation_id"]
			w.WriteHeader(201)
			_, _ = w.Write([]byte(`{"status":"registered"}`))
		case "/v1/authority/trust-manifest":
			p := authority.TrustManifestPayload{Schema: "bloom.authority.trust-manifest", SchemaVersion: "1.0", ManifestID: "manifest",
				Issuer: "issuer", OrganizationID: "org-real-id", ManifestVersion: "1", IssuedAt: now.Add(-time.Minute), NotBefore: now.Add(-time.Minute),
				ExpiresAt: now.Add(time.Hour), RootKeyID: "root",
				Keys: []authority.TrustKey{{KeyID: "issuer-key", PublicKey: base64.RawURLEncoding.EncodeToString(issuerPublic), Status: "active", ValidFrom: now.Add(-time.Hour)}}}
			_, _ = w.Write(signEnvelope(p, "BLOOM-AUTHORITY-TRUST-MANIFEST-v1", "root", rootPrivate))
		case "/v1/authority/sync/challenge":
			_ = json.NewEncoder(w).Encode(map[string]any{"challenge": "challenge", "organization_id": "org-real-id", "installation_id": installationID, "issued_at": now, "expires_at": now.Add(time.Minute)})
		case "/v1/authority/sync/pull":
			content := authority.FullContent{Principals: []authority.Principal{}, Memberships: []authority.Membership{}, RoleDefinitions: []authority.RoleDefinition{}, RoleAssignments: []authority.RoleAssignment{}, Revocations: []authority.Revocation{}}
			contentRaw, _ := json.Marshal(content)
			p := authority.SnapshotPayload{Schema: "bloom.authority.snapshot", SchemaVersion: "1.0", Kind: "full", SnapshotID: "snapshot", Issuer: "issuer",
				OrganizationID: "org-real-id", AuthorityVersion: "1", IssuedAt: now.Add(-time.Minute), NotBefore: now.Add(-time.Minute), ExpiresAt: now.Add(time.Hour),
				Audience: authority.Audience{OrganizationID: "org-real-id", InstallationIDs: []string{installationID}}, Content: contentRaw}
			snapshot := signEnvelope(p, "BLOOM-AUTHORITY-SNAPSHOT-v1", "issuer-key", issuerPrivate)
			stateDigest, _ := authority.StateDigest(content, "org-real-id")
			snapshotSum := sha256.Sum256(mustCanonical(t, snapshot))
			challengeSum := sha256.Sum256([]byte("challenge"))
			check := authority.CurrentCheckPayload{Schema: "bloom.authority.current-check", SchemaVersion: "1.0", CheckID: "check", Issuer: "issuer",
				OrganizationID: "org-real-id", InstallationID: installationID, ChallengeDigest: hex.EncodeToString(challengeSum[:]), AuthorityVersion: "1",
				StateDigest: stateDigest, SnapshotDigest: base64.RawURLEncoding.EncodeToString(snapshotSum[:]), CheckedAt: now}
			var checkEnvelope authority.Envelope
			_ = json.Unmarshal(signEnvelope(check, "BLOOM-AUTHORITY-CURRENT-PULL-v1", "issuer-key", issuerPrivate), &checkEnvelope)
			_ = json.NewEncoder(w).Encode(map[string]any{"snapshot": json.RawMessage(snapshot), "current_check": checkEnvelope})
		case "/v1/mandate/bootstrap":
			w.WriteHeader(404)
		}
	}))
	defer server.Close()

	authorityCommandHTTPClient = server.Client()
	authorityCommandRoots = func() map[string]ed25519.PublicKey { return map[string]ed25519.PublicKey{"root": rootPublic} }
	authorityCommandNow = func() time.Time { return now }
	defer func() {
		authorityCommandHTTPClient = nil
		authorityCommandRoots = authority.DevelopmentPinnedRoots
		authorityCommandNow = func() time.Time { return time.Now().UTC() }
	}()

	opened := ""
	previousOpenBrowser := openBrowser
	openBrowser = func(target string) error { opened = target; return nil }
	defer func() { openBrowser = previousOpenBrowser }()

	c := &core.Core{Paths: core.Paths{AppDataDir: appData, LogsDir: logsDir}}
	cmd := createAuthLinkCommand(c)
	cmd.SetArgs([]string{"--authority-url", server.URL, "--org", "acme", "--path", workspace})
	cmd.SetIn(strings.NewReader(`{"organizationId":"org-real-id","principalId":"p1","csrf":"c","expiresAt":"2026-09-14T13:00:00Z","created":true}` + "\n"))
	var out bytes.Buffer
	cmd.SetOut(&out)
	cmd.SetErr(&out)

	if err := cmd.Execute(); err != nil {
		t.Fatalf("cmd.Execute() = %v\nsalida:\n%s", err, out.String())
	}

	wantLoginURL := server.URL + "/v1/authority/genesis/login"
	if opened != wantLoginURL {
		t.Fatalf("openBrowser recibió %q, esperaba %q", opened, wantLoginURL)
	}
	// La confirmación de organizationId ahora va por el logger estructurado de
	// GOVERNANCE (v2.0 §2.2), no por cmd.OutOrStdout() — se verifica leyendo el
	// log del stream nucleus_governance en vez de out.String(). Que
	// cmd.Execute() no haya fallado ya prueba que core.InitLogger (y el
	// RegisterStream/rollover que dispara internamente contra telemetry.json)
	// se ejecutó sin error.
	today := time.Now().UTC().Format("20060102")
	governanceLog := filepath.Join(logsDir, "nucleus", "nucleus_governance_"+today+".log")
	logData, err := os.ReadFile(governanceLog)
	if err != nil {
		t.Fatalf("no pude leer el log de GOVERNANCE (%s): %v", governanceLog, err)
	}
	if !strings.Contains(string(logData), "organizationId registrado: org-real-id") {
		t.Fatalf("el log de GOVERNANCE no confirma el organizationId registrado:\n%s", logData)
	}
	if !strings.Contains(out.String(), "performed: true") {
		t.Fatalf("salida no muestra el sync como performed:\n%s", out.String())
	}

	cfg := readNucleusConfig(t, appData)
	onboarding := cfg["onboarding"].(map[string]any)
	if onboarding["active_org_slug"] != "acme" {
		t.Fatalf("active_org_slug=%v", onboarding["active_org_slug"])
	}
	orgs := onboarding["organizations"].([]any)
	entry := orgs[0].(map[string]any)
	if entry["organization_id"] != "org-real-id" {
		t.Fatalf("organization_id no quedó escrito: %v", entry)
	}
	if installationID == "" {
		t.Fatal("la instalación nunca se registró contra Authority")
	}
}

func TestAuthLinkCommandRejectsEmptyPastedResponse(t *testing.T) {
	appData, workspace, logsDir := t.TempDir(), t.TempDir(), t.TempDir()
	t.Setenv("BLOOM_APPDATA_DIR", appData)

	previousOpenBrowser := openBrowser
	openBrowser = func(string) error { return nil }
	defer func() { openBrowser = previousOpenBrowser }()

	c := &core.Core{Paths: core.Paths{AppDataDir: appData, LogsDir: logsDir}}
	cmd := createAuthLinkCommand(c)
	cmd.SetArgs([]string{"--authority-url", "https://authority.test", "--org", "acme", "--path", workspace})
	cmd.SetIn(strings.NewReader("\n"))
	var out bytes.Buffer
	cmd.SetOut(&out)
	cmd.SetErr(&out)

	if err := cmd.Execute(); err == nil {
		t.Fatal("esperaba error con respuesta vacía, no hubo")
	}
	if _, err := os.Stat(filepath.Join(appData, "config", "nucleus.json")); !os.IsNotExist(err) {
		t.Fatalf("no debería haberse escrito config/nucleus.json: err=%v", err)
	}
}
