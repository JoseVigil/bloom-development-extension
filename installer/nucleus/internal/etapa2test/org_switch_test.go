// internal/etapa2test/org_switch_test.go
//
// Test de verificación de Etapa 2 (PROMPT-EJECUCION-synapse-switch-organization.md
// §"Criterio de verificación"): "un test que cree dos organizaciones locales
// de prueba, cambie el contexto activo por el mecanismo elegido, y confirme
// que tanto una operación de Vault como una operación de Mandates ven la
// misma organización activa después del cambio."
//
// Vive en su propio paquete (no en internal/vault ni internal/supervisor)
// porque es un test de INTEGRACIÓN entre los dos — antes de Etapa 2,
// Vault (internal/core.ResolveNucleusRoot, vía BLOOM_ORG) y Mandates
// (internal/supervisor.LoadNucleusConfig, vía filesystem-scan) resolvían la
// organización activa con dos mecanismos completamente independientes que
// nunca se probaron juntos. Este test existe para que esa divergencia no
// pueda reaparecer en silencio: si algún cambio futuro vuelve a desalinear
// los dos call sites, este test debería ser el que lo note.
package etapa2test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"nucleus/internal/supervisor"
	"nucleus/internal/vault"
)

// clearOrgEnv desconecta todas las señales explícitas de organización
// (BLOOM_NUCLEUS_ROOT, BLOOM_ORG) para forzar que ResolveNucleusRoot() pase
// por el fallback de filesystem-scan (internal/core.ScanForNucleus) en vez
// de un override — es exactamente ese camino el que este test necesita
// ejercitar, porque es el que Mandates ya usaba y Vault no.
func clearOrgEnv(t *testing.T) {
	t.Helper()
	for _, envVar := range []string{"BLOOM_NUCLEUS_ROOT", "BLOOM_ORG"} {
		original, had := os.LookupEnv(envVar)
		os.Unsetenv(envVar)
		if had {
			t.Cleanup(func() { os.Setenv(envVar, original) })
		}
	}
}

// setActiveWorkspace apunta BLOOM_NUCLEUS_PATH (el override que
// core.ScanForNucleus() y, antes de Etapa 2, solo supervisor.LoadNucleusConfig()
// respetaban) a workspaceRoot, simulando "esta es la organización activa
// ahora mismo" sin depender de os.Getwd() del proceso de test.
func setActiveWorkspace(t *testing.T, workspaceRoot string) {
	t.Helper()
	original, had := os.LookupEnv("BLOOM_NUCLEUS_PATH")
	if err := os.Setenv("BLOOM_NUCLEUS_PATH", workspaceRoot); err != nil {
		t.Fatalf("failed to set BLOOM_NUCLEUS_PATH: %v", err)
	}
	t.Cleanup(func() {
		if had {
			os.Setenv("BLOOM_NUCLEUS_PATH", original)
		} else {
			os.Unsetenv("BLOOM_NUCLEUS_PATH")
		}
	})
}

// makeFakeOrgWorkspace crea <root>/.bloom/.nucleus-{slug}/.core/.nucleus-config.json
// con el contenido mínimo que loadNucleusConfigAt() necesita para validar el
// Nucleus como real (ver internal/supervisor/supervisor.go). El slug de la
// carpeta y el slug declarado adentro del JSON coinciden a propósito — un
// mismatch es un error distinto, no lo que este test está probando.
func makeFakeOrgWorkspace(t *testing.T, root, orgSlug string) string {
	t.Helper()
	nucleusDir := filepath.Join(root, ".bloom", ".nucleus-"+orgSlug)
	coreDir := filepath.Join(nucleusDir, ".core")
	if err := os.MkdirAll(coreDir, 0755); err != nil {
		t.Fatalf("failed to create fake nucleus dir for org %q: %v", orgSlug, err)
	}

	configPath := filepath.Join(coreDir, ".nucleus-config.json")
	payload, err := json.Marshal(map[string]any{
		"organization": map[string]string{"slug": orgSlug, "name": orgSlug},
	})
	if err != nil {
		t.Fatalf("failed to marshal fake .nucleus-config.json: %v", err)
	}
	if err := os.WriteFile(configPath, payload, 0644); err != nil {
		t.Fatalf("failed to write fake .nucleus-config.json for org %q: %v", orgSlug, err)
	}

	return nucleusDir
}

// TestVaultAndMandatesAgreeOnActiveOrg_AfterSwitch es el test central de
// Etapa 2: crea dos organizaciones locales reales en disco (acme, globex),
// cambia cuál está activa por el ÚNICO mecanismo que ahora existe
// (BLOOM_NUCLEUS_PATH + filesystem-scan, ver internal/core/nucleus_scan.go),
// y confirma que Vault (vault.GetVaultPath) y Mandates
// (supervisor.LoadNucleusConfig) coinciden en cuál es la organización activa
// en cada paso — nunca la del switch anterior.
func TestVaultAndMandatesAgreeOnActiveOrg_AfterSwitch(t *testing.T) {
	clearOrgEnv(t)

	workspaceAcme := t.TempDir()
	workspaceGlobex := t.TempDir()

	nucleusDirAcme := makeFakeOrgWorkspace(t, workspaceAcme, "acme")
	nucleusDirGlobex := makeFakeOrgWorkspace(t, workspaceGlobex, "globex")

	assertBothSeeOrg := func(label, expectedSlug, expectedNucleusDir string) {
		t.Helper()

		vaultPath, err := vault.GetVaultPath()
		if err != nil {
			t.Fatalf("[%s] vault.GetVaultPath() error: %v", label, err)
		}
		wantVaultPath := filepath.Join(expectedNucleusDir, "vault.json")
		if vaultPath != wantVaultPath {
			t.Fatalf("[%s] vault.GetVaultPath() = %q, want %q (Vault y Mandates deben ver la misma org activa)", label, vaultPath, wantVaultPath)
		}

		mandateCfg, err := supervisor.LoadNucleusConfig()
		if err != nil {
			t.Fatalf("[%s] supervisor.LoadNucleusConfig() error: %v", label, err)
		}
		if mandateCfg.Slug != expectedSlug {
			t.Fatalf("[%s] supervisor.LoadNucleusConfig().Slug = %q, want %q", label, mandateCfg.Slug, expectedSlug)
		}
		if mandateCfg.MandatesRoot() != filepath.Join(expectedNucleusDir, ".mandates") {
			t.Fatalf("[%s] MandatesRoot() = %q, want dentro de %q", label, mandateCfg.MandatesRoot(), expectedNucleusDir)
		}
	}

	// 1. Organización activa: acme.
	setActiveWorkspace(t, workspaceAcme)
	assertBothSeeOrg("acme activa", "acme", nucleusDirAcme)

	// 2. Switch: organización activa pasa a ser globex.
	setActiveWorkspace(t, workspaceGlobex)
	assertBothSeeOrg("globex activa (post-switch)", "globex", nucleusDirGlobex)

	// 3. Doble switch: volver a acme — confirma que no quedó ningún estado
	//    cacheado a nivel de proceso apuntando todavía a globex (mismo
	//    riesgo de "fuga de datos entre organizaciones" que documentan los
	//    invariantes INVARIANT-ORG-004/006 citados en la investigación
	//    previa — acá se verifica el caso concreto de paths, no de
	//    credenciales, pero es la misma clase de bug).
	setActiveWorkspace(t, workspaceAcme)
	assertBothSeeOrg("acme activa otra vez", "acme", nucleusDirAcme)
}

// TestSwitchToNonexistentOrg_FailsExplicitly cubre el segundo criterio de
// verificación de Etapa 2 del prompt original (§6): "un test de switch a
// una organización inexistente, verificando que falla de forma explícita y
// no en silencio". No hay todavía un handler SWITCH_ORGANIZATION real (eso
// es Etapa 5) — lo que este test prueba es que el mecanismo de resolución
// subyacente, que ese handler futuro va a usar, ya se comporta así.
func TestSwitchToNonexistentOrg_FailsExplicitly(t *testing.T) {
	clearOrgEnv(t)

	emptyWorkspace := t.TempDir() // sin .bloom adentro — org inexistente

	setActiveWorkspace(t, emptyWorkspace)

	if _, err := vault.GetVaultPath(); err == nil {
		t.Fatal("vault.GetVaultPath() apuntando a un workspace sin organización: want error, got nil")
	}
	if _, err := supervisor.LoadNucleusConfig(); err == nil {
		t.Fatal("supervisor.LoadNucleusConfig() apuntando a un workspace sin organización: want error, got nil")
	}
}
