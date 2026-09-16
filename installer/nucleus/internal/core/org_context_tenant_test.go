// internal/core/org_context_tenant_test.go
//
// Sovereign Tenant Fase 5 — ajuste pedido por Jose (2026-09-16): además de la
// reconciliación criptográfica que persiste TenantID en .ownership.json (governance/
// ownership_reconciliation.go), RecordOrganizationTenantID anota el mismo tenant_id
// como campo plano en la entrada de onboarding.organizations[] de config/nucleus.json
// que Conductor (Electron/JS) ya lee para agrupar organizaciones visualmente. Archivo
// nuevo, aislado — no existía test para org_context.go antes de este ajuste.
package core

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// seedMachineConfig escribe un config/nucleus.json realista: dos organizaciones (para
// probar que sólo se toca la indicada) y varias secciones de nivel superior que
// RecordOrganizationTenantID no conoce — para confirmar que sobreviven intactas.
func seedMachineConfig(t *testing.T, appData string) {
	t.Helper()
	config := map[string]any{
		"version":         1,
		"authority_base_url": "https://authority.test",
		"installation": map[string]any{
			"completed":   true,
			"origin_path": "/home/jose/repos/bloom-development-extension",
		},
		"system_map": map[string]any{
			"bloom_base": appData,
		},
		"onboarding": map[string]any{
			"active_org_slug": "acme",
			"organizations": []any{
				map[string]any{
					"org_slug":        "acme",
					"organization_id": "org-acme",
					"workspace_path":  "/home/jose/repos/acme",
					"created_at":      "2026-09-01T00:00:00Z",
					"projects":        []any{},
				},
				map[string]any{
					"org_slug":        "beta",
					"organization_id": "org-beta",
					"workspace_path":  "/home/jose/repos/beta",
					"created_at":      "2026-09-02T00:00:00Z",
					"projects":        []any{},
				},
			},
		},
	}
	if err := os.MkdirAll(filepath.Join(appData, "config"), 0700); err != nil {
		t.Fatal(err)
	}
	raw, err := json.Marshal(config)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(appData, "config", "nucleus.json"), raw, 0600); err != nil {
		t.Fatal(err)
	}
}

func readMachineConfig(t *testing.T, appData string) map[string]any {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(appData, "config", "nucleus.json"))
	if err != nil {
		t.Fatal(err)
	}
	var root map[string]any
	if err := json.Unmarshal(raw, &root); err != nil {
		t.Fatal(err)
	}
	return root
}

func orgEntry(t *testing.T, root map[string]any, slug string) map[string]any {
	t.Helper()
	onboarding, _ := root["onboarding"].(map[string]any)
	organizations, _ := onboarding["organizations"].([]any)
	for _, entry := range organizations {
		candidate, _ := entry.(map[string]any)
		if candidate["org_slug"] == slug {
			return candidate
		}
	}
	t.Fatalf("org_slug %q no encontrado en onboarding.organizations", slug)
	return nil
}

func TestRecordOrganizationTenantIDSetsFieldPreservingEverythingElse(t *testing.T) {
	appData := t.TempDir()
	t.Setenv("BLOOM_APPDATA_DIR", appData)
	seedMachineConfig(t, appData)

	if err := RecordOrganizationTenantID("acme", "org-acme", "tenant-1"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	root := readMachineConfig(t, appData)
	if root["authority_base_url"] != "https://authority.test" {
		t.Fatalf("authority_base_url no se preservó: %+v", root)
	}
	installation, _ := root["installation"].(map[string]any)
	if installation["origin_path"] != "/home/jose/repos/bloom-development-extension" {
		t.Fatalf("sección installation no se preservó: %+v", root)
	}

	acme := orgEntry(t, root, "acme")
	if acme["tenant_id"] != "tenant-1" {
		t.Fatalf("tenant_id no se anotó: %+v", acme)
	}
	if acme["organization_id"] != "org-acme" || acme["workspace_path"] != "/home/jose/repos/acme" || acme["created_at"] != "2026-09-01T00:00:00Z" {
		t.Fatalf("la entrada acme perdió campos existentes: %+v", acme)
	}

	// La otra organización del mismo array no debe verse tocada en absoluto.
	beta := orgEntry(t, root, "beta")
	if _, hasTenant := beta["tenant_id"]; hasTenant {
		t.Fatalf("beta no debía recibir tenant_id: %+v", beta)
	}
	if beta["organization_id"] != "org-beta" {
		t.Fatalf("la entrada beta se corrompió: %+v", beta)
	}
}

func TestRecordOrganizationTenantIDIsIdempotent(t *testing.T) {
	appData := t.TempDir()
	t.Setenv("BLOOM_APPDATA_DIR", appData)
	seedMachineConfig(t, appData)

	if err := RecordOrganizationTenantID("acme", "org-acme", "tenant-1"); err != nil {
		t.Fatalf("first call: %v", err)
	}
	before, err := os.Stat(filepath.Join(appData, "config", "nucleus.json"))
	if err != nil {
		t.Fatal(err)
	}

	if err := RecordOrganizationTenantID("acme", "org-acme", "tenant-1"); err != nil {
		t.Fatalf("second call (idempotent) failed: %v", err)
	}
	after, err := os.Stat(filepath.Join(appData, "config", "nucleus.json"))
	if err != nil {
		t.Fatal(err)
	}
	if !before.ModTime().Equal(after.ModTime()) {
		t.Fatalf("segunda llamada con el mismo tenant_id reescribió el archivo (mtime cambió): before=%v after=%v", before.ModTime(), after.ModTime())
	}
}

func TestRecordOrganizationTenantIDOverwritesOnChange(t *testing.T) {
	appData := t.TempDir()
	t.Setenv("BLOOM_APPDATA_DIR", appData)
	seedMachineConfig(t, appData)

	if err := RecordOrganizationTenantID("acme", "org-acme", "tenant-1"); err != nil {
		t.Fatal(err)
	}
	// Tenant es puramente informativo (Fase 5 §3.2, mismo criterio que .ownership.json):
	// un tenantId distinto se sobreescribe sin ningún estado tipo DIVERGENT.
	if err := RecordOrganizationTenantID("acme", "org-acme", "tenant-2"); err != nil {
		t.Fatal(err)
	}
	acme := orgEntry(t, readMachineConfig(t, appData), "acme")
	if acme["tenant_id"] != "tenant-2" {
		t.Fatalf("tenant_id no se actualizó al nuevo valor: %+v", acme)
	}
}

func TestRecordOrganizationTenantIDFailsClosedOnUnknownSlug(t *testing.T) {
	appData := t.TempDir()
	t.Setenv("BLOOM_APPDATA_DIR", appData)
	seedMachineConfig(t, appData)

	if err := RecordOrganizationTenantID("no-existe", "org-acme", "tenant-1"); err == nil {
		t.Fatal("esperaba error para un org_slug que no existe en onboarding.organizations")
	}
	// El archivo no debe haberse tocado.
	acme := orgEntry(t, readMachineConfig(t, appData), "acme")
	if _, hasTenant := acme["tenant_id"]; hasTenant {
		t.Fatalf("un slug inexistente no debía dejar rastro en ninguna organización: %+v", acme)
	}
}

func TestRecordOrganizationTenantIDFailsClosedOnOrganizationIDMismatch(t *testing.T) {
	appData := t.TempDir()
	t.Setenv("BLOOM_APPDATA_DIR", appData)
	seedMachineConfig(t, appData)

	// org_slug "acme" existe, pero con un organization_id distinto al esperado — no
	// debe anotar tenant_id en la entrada equivocada.
	if err := RecordOrganizationTenantID("acme", "org-que-no-es", "tenant-1"); err == nil {
		t.Fatal("esperaba error cuando organization_id no coincide con la entrada del slug")
	}
	acme := orgEntry(t, readMachineConfig(t, appData), "acme")
	if _, hasTenant := acme["tenant_id"]; hasTenant {
		t.Fatalf("no debía anotar tenant_id cuando organization_id no coincide: %+v", acme)
	}
}

func TestRecordOrganizationTenantIDRejectsEmptyArguments(t *testing.T) {
	appData := t.TempDir()
	t.Setenv("BLOOM_APPDATA_DIR", appData)
	seedMachineConfig(t, appData)

	for _, args := range [][3]string{
		{"", "org-acme", "tenant-1"},
		{"acme", "", "tenant-1"},
		{"acme", "org-acme", ""},
	} {
		if err := RecordOrganizationTenantID(args[0], args[1], args[2]); err == nil {
			t.Fatalf("esperaba error para argumentos %+v", args)
		}
	}
}
