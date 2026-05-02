package inspection

import (
	"archive/zip"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de integración
// ─────────────────────────────────────────────────────────────────────────────

// buildIonZIP crea un .ion ZIP en destPath con el manifest y los files dados.
// Usado para preparar el staging/downloads/ antes de llamar a ReconcileIonRecipe.
func buildIonZIP(t *testing.T, destPath string, manifest IonDomainManifest, files map[string]string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(destPath), 0755); err != nil {
		t.Fatalf("buildIonZIP: mkdir: %v", err)
	}

	f, err := os.Create(destPath)
	if err != nil {
		t.Fatalf("buildIonZIP: create: %v", err)
	}
	defer f.Close()

	w := zip.NewWriter(f)
	defer w.Close()

	// Write domain.manifest.json
	data, _ := json.MarshalIndent(manifest, "", "  ")
	mw, err := w.Create(domainManifestFile)
	if err != nil {
		t.Fatalf("buildIonZIP: create manifest entry: %v", err)
	}
	mw.Write(data)

	// Write declared files
	for path, content := range files {
		fw, err := w.Create(path)
		if err != nil {
			t.Fatalf("buildIonZIP: create entry %s: %v", path, err)
		}
		fw.Write([]byte(content))
	}
}

// makeIonRecipeUpdate constructs an IonRecipeUpdate with correct SHA-256 hashes
// for all declared files. files is path→content.
func makeIonRecipeUpdate(domain, version string, files map[string]string) IonRecipeUpdate {
	var ionFiles []IonRecipeFile
	for path, content := range files {
		ionFiles = append(ionFiles, IonRecipeFile{
			Path:   path,
			SHA256: sha256hex(content),
		})
	}
	return IonRecipeUpdate{
		Site:    domain,
		Version: version,
		SHA256:  "zip-level-hash-not-verified-in-unit", // ZIP-level hash verified by Nucleus
		Files:   ionFiles,
	}
}

// setupIonsitesDir creates the ionsites directory structure expected by
// ReconcileIonRecipe: ionsites/, ionsites/_staging/downloads/
func setupIonsitesDir(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, ionStagingDir, "downloads"), 0755); err != nil {
		t.Fatalf("setupIonsitesDir: %v", err)
	}
	return dir
}

// ─────────────────────────────────────────────────────────────────────────────
// Integration tests
// ─────────────────────────────────────────────────────────────────────────────

func TestReconcileIonRecipe_SkippedIfUpToDate(t *testing.T) {
	ionsitesPath := setupIonsitesDir(t)
	domain := "github.com"
	version := "1.0.0"
	fileContent := "# auth flow"

	// Pre-install same version with same hash into versions.json
	if err := updateVersionsJSON(ionsitesPath, domain, VersionEntry{
		Version: version,
		SHA256:  "zip-level-hash-not-verified-in-unit",
		Status:  "active",
	}); err != nil {
		t.Fatal(err)
	}

	update := makeIonRecipeUpdate(domain, version, map[string]string{
		"actions/auth.ion": fileContent,
	})

	result := ReconcileIonRecipe(ionsitesPath, update, &NoopIonPumpClient{}, false, false)

	if result.Action != "skipped" {
		t.Errorf("expected skipped, got %q (error: %s)", result.Action, result.Error)
	}
}

func TestReconcileIonRecipe_HappyPath(t *testing.T) {
	ionsitesPath := setupIonsitesDir(t)
	domain := "github.com"
	version := "1.1.0"
	files := map[string]string{
		"actions/auth.ion":           "# auth",
		"pages/settings.page.ion":    "# settings",
		domainManifestFile:           "", // will be overwritten by buildIonZIP
	}
	fileContent := map[string]string{
		"actions/auth.ion":        "# auth",
		"pages/settings.page.ion": "# settings",
	}

	manifest := IonDomainManifest{
		SchemaVersion: "2.0",
		Domain:        domain,
		Version:       version,
		Actions:       map[string]IonAction{"bootstrap": {File: "actions/auth.ion", Public: true}},
		EntryActions:  []string{"bootstrap"},
	}

	// Build the ZIP in staging/downloads/
	zipPath := filepath.Join(ionsitesPath, ionStagingDir, "downloads", domain+".ion")
	buildIonZIP(t, zipPath, manifest, fileContent)

	// Also create the live dir so atomicSwap has something to rename
	liveDir := filepath.Join(ionsitesPath, domain)
	makeManifest(t, liveDir, domain, "1.0.0", "actions/auth.ion")
	writefile(t, filepath.Join(liveDir, "actions/auth.ion"), "# old")

	update := makeIonRecipeUpdate(domain, version, fileContent)

	result := ReconcileIonRecipe(ionsitesPath, update, &NoopIonPumpClient{}, false, false)

	if result.Action != "swapped" {
		t.Errorf("expected swapped, got %q (phase: %s, error: %s)", result.Action, result.Phase, result.Error)
	}
	if result.SwappedAt == "" {
		t.Error("expected SwappedAt to be set")
	}

	// versions.json must reflect new version
	vf, _ := readVersionsFile(ionsitesPath)
	if vf.Sites[domain].Version != version {
		t.Errorf("versions.json: expected %s, got %s", version, vf.Sites[domain].Version)
	}
}

func TestReconcileIonRecipe_BrainRefusesQuiesce(t *testing.T) {
	ionsitesPath := setupIonsitesDir(t)

	// Brain client that refuses to quiesce
	client := &timeoutIonPumpClient{}

	update := makeIonRecipeUpdate("github.com", "1.1.0", map[string]string{
		"actions/auth.ion": "# auth",
	})

	// Need a live dir for the version check to differ
	liveDir := filepath.Join(ionsitesPath, "github.com")
	makeManifest(t, liveDir, "github.com", "1.0.0", "actions/auth.ion")
	writefile(t, filepath.Join(liveDir, "actions/auth.ion"), "# old")

	// Build ZIP so staging extraction succeeds
	manifest := IonDomainManifest{
		SchemaVersion: "2.0",
		Domain:        "github.com",
		Version:       "1.1.0",
		Actions:       map[string]IonAction{"bootstrap": {File: "actions/auth.ion", Public: true}},
		EntryActions:  []string{"bootstrap"},
	}
	zipPath := filepath.Join(ionsitesPath, ionStagingDir, "downloads", "github.com.ion")
	buildIonZIP(t, zipPath, manifest, map[string]string{"actions/auth.ion": "# auth"})

	result := ReconcileIonRecipe(ionsitesPath, update, client, false, false)

	if result.Action != "failed" {
		t.Errorf("expected failed, got %q", result.Action)
	}
	if result.Phase != "signal_pre" {
		t.Errorf("expected phase signal_pre, got %q", result.Phase)
	}
}

func TestReconcileIonRecipe_BrainFailsReload(t *testing.T) {
	ionsitesPath := setupIonsitesDir(t)
	domain := "github.com"
	version := "1.1.0"
	fileContent := map[string]string{"actions/auth.ion": "# auth"}

	client := &reloadErrorIonPumpClient{}

	manifest := IonDomainManifest{
		SchemaVersion: "2.0",
		Domain:        domain,
		Version:       version,
		Actions:       map[string]IonAction{"bootstrap": {File: "actions/auth.ion", Public: true}},
		EntryActions:  []string{"bootstrap"},
	}

	zipPath := filepath.Join(ionsitesPath, ionStagingDir, "downloads", domain+".ion")
	buildIonZIP(t, zipPath, manifest, fileContent)

	// Live dir must exist for atomicSwap
	liveDir := filepath.Join(ionsitesPath, domain)
	makeManifest(t, liveDir, domain, "1.0.0", "actions/auth.ion")
	writefile(t, filepath.Join(liveDir, "actions/auth.ion"), "# old")

	update := makeIonRecipeUpdate(domain, version, fileContent)
	result := ReconcileIonRecipe(ionsitesPath, update, client, false, false)

	if result.Action != "rolled_back" {
		t.Errorf("expected rolled_back, got %q (error: %s)", result.Action, result.Error)
	}
}

func TestReconcileIonRecipe_VerificationFail(t *testing.T) {
	ionsitesPath := setupIonsitesDir(t)
	domain := "github.com"
	version := "1.1.0"

	manifest := IonDomainManifest{
		SchemaVersion: "2.0",
		Domain:        domain,
		Version:       version,
		Actions:       map[string]IonAction{"bootstrap": {File: "actions/auth.ion", Public: true}},
		EntryActions:  []string{"bootstrap"},
	}

	// ZIP has "real content" but update declares wrong hash
	zipPath := filepath.Join(ionsitesPath, ionStagingDir, "downloads", domain+".ion")
	buildIonZIP(t, zipPath, manifest, map[string]string{"actions/auth.ion": "real content"})

	// Live dir
	liveDir := filepath.Join(ionsitesPath, domain)
	makeManifest(t, liveDir, domain, "1.0.0", "actions/auth.ion")
	writefile(t, filepath.Join(liveDir, "actions/auth.ion"), "# old")

	update := IonRecipeUpdate{
		Site:    domain,
		Version: version,
		Files: []IonRecipeFile{
			{Path: "actions/auth.ion", SHA256: sha256hex("WRONG CONTENT")},
		},
	}

	result := ReconcileIonRecipe(ionsitesPath, update, &NoopIonPumpClient{}, false, false)

	if result.Action != "failed" {
		t.Errorf("expected failed, got %q", result.Action)
	}
	if result.Phase != "verify" {
		t.Errorf("expected phase verify, got %q", result.Phase)
	}

	// Staging must have been cleaned up
	stagingDir := filepath.Join(ionsitesPath, ionStagingDir, domain)
	if _, err := os.Stat(stagingDir); err == nil {
		t.Error("staging dir should have been deleted after verify failure")
	}
}

func TestReconcileAllIonRecipes_OneSiteFailsOthersContinue(t *testing.T) {
	ionsitesPath := setupIonsitesDir(t)

	goodDomain := "github.com"
	badDomain := "claude.ai"
	version := "1.1.0"
	fileContent := map[string]string{"actions/auth.ion": "# auth"}

	// Prepare good site
	goodManifest := IonDomainManifest{
		SchemaVersion: "2.0", Domain: goodDomain, Version: version,
		Actions: map[string]IonAction{"bootstrap": {File: "actions/auth.ion", Public: true}},
		EntryActions: []string{"bootstrap"},
	}
	goodZip := filepath.Join(ionsitesPath, ionStagingDir, "downloads", goodDomain+".ion")
	buildIonZIP(t, goodZip, goodManifest, fileContent)

	goodLive := filepath.Join(ionsitesPath, goodDomain)
	makeManifest(t, goodLive, goodDomain, "1.0.0", "actions/auth.ion")
	writefile(t, filepath.Join(goodLive, "actions/auth.ion"), "# old")

	// Bad site: ZIP exists but declared hash is wrong (verify will fail)
	badManifest := IonDomainManifest{
		SchemaVersion: "2.0", Domain: badDomain, Version: version,
		Actions: map[string]IonAction{"bootstrap": {File: "actions/auth.ion", Public: true}},
		EntryActions: []string{"bootstrap"},
	}
	badZip := filepath.Join(ionsitesPath, ionStagingDir, "downloads", badDomain+".ion")
	buildIonZIP(t, badZip, badManifest, fileContent)

	badLive := filepath.Join(ionsitesPath, badDomain)
	makeManifest(t, badLive, badDomain, "1.0.0", "actions/auth.ion")
	writefile(t, filepath.Join(badLive, "actions/auth.ion"), "# old")

	updates := []IonRecipeUpdate{
		makeIonRecipeUpdate(goodDomain, version, fileContent),
		{
			Site: badDomain, Version: version,
			Files: []IonRecipeFile{{Path: "actions/auth.ion", SHA256: sha256hex("WRONG")}},
		},
	}

	allResult := ReconcileAllIonRecipes(ionsitesPath, updates, &NoopIonPumpClient{}, false, false)

	if allResult.Summary.TotalSites != 2 {
		t.Errorf("expected 2 total sites, got %d", allResult.Summary.TotalSites)
	}
	if allResult.Summary.Swapped != 1 {
		t.Errorf("expected 1 swapped, got %d", allResult.Summary.Swapped)
	}
	if allResult.Summary.Failed != 1 {
		t.Errorf("expected 1 failed, got %d", allResult.Summary.Failed)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Test-only IonPumpClient implementations
// ─────────────────────────────────────────────────────────────────────────────

// timeoutIonPumpClient simulates Brain returning "timeout" on quiesce.
type timeoutIonPumpClient struct{}

func (c *timeoutIonPumpClient) QuiesceSite(site string, timeoutMs int) (QuiesceResult, error) {
	return QuiesceResult{Status: "timeout", ActiveFlows: 3}, nil
}

func (c *timeoutIonPumpClient) ReloadSite(site string, version string) (ReloadResult, error) {
	return ReloadResult{Status: "reloaded", Version: version}, nil
}

// reloadErrorIonPumpClient quiesces OK but returns error on reload.
type reloadErrorIonPumpClient struct{}

func (c *reloadErrorIonPumpClient) QuiesceSite(site string, timeoutMs int) (QuiesceResult, error) {
	return QuiesceResult{Status: "quiesced", ActiveFlows: 0}, nil
}

func (c *reloadErrorIonPumpClient) ReloadSite(site string, version string) (ReloadResult, error) {
	return ReloadResult{Status: "error", Error: "recipe parse failed"}, nil
}
