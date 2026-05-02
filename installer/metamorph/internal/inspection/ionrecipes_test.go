package inspection

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de test
// ─────────────────────────────────────────────────────────────────────────────

// writefile escribe contenido en path, creando directorios intermedios.
func writefile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		t.Fatalf("writefile: mkdir %s: %v", filepath.Dir(path), err)
	}
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatalf("writefile: %s: %v", path, err)
	}
}

// sha256hex retorna el SHA-256 hex de una string. Usado para construir
// IonRecipeFile con hashes correctos en los tests.
func sha256hex(content string) string {
	h := sha256.Sum256([]byte(content))
	return fmt.Sprintf("%x", h[:])
}

// makeManifest escribe un domain.manifest.json v2.0 mínimo válido en sitePath.
func makeManifest(t *testing.T, sitePath, domain, version, entrypointFile string) {
	t.Helper()
	manifest := IonDomainManifest{
		SchemaVersion: "2.0",
		Domain:        domain,
		Version:       version,
		Description:   "test recipe",
		Actions: map[string]IonAction{
			"bootstrap": {File: entrypointFile, Public: true},
		},
		EntryActions: []string{"bootstrap"},
	}
	data, _ := json.MarshalIndent(manifest, "", "  ")
	writefile(t, filepath.Join(sitePath, domainManifestFile), string(data))
}

// ─────────────────────────────────────────────────────────────────────────────
// InspectIonRecipe
// ─────────────────────────────────────────────────────────────────────────────

func TestInspectIonRecipe_Healthy(t *testing.T) {
	dir := t.TempDir()
	sitePath := filepath.Join(dir, "github.com")
	entryFile := "actions/auth_pat.ion"

	makeManifest(t, sitePath, "github.com", "1.0.0", entryFile)
	writefile(t, filepath.Join(sitePath, entryFile), "# auth flow")

	info, err := InspectIonRecipe(sitePath)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info.Status != "healthy" {
		t.Errorf("expected status healthy, got %q", info.Status)
	}
	if info.Version != "1.0.0" {
		t.Errorf("expected version 1.0.0, got %q", info.Version)
	}
	if info.Site != "github.com" {
		t.Errorf("expected site github.com, got %q", info.Site)
	}
}

func TestInspectIonRecipe_MissingManifest(t *testing.T) {
	dir := t.TempDir()
	sitePath := filepath.Join(dir, "github.com")
	if err := os.MkdirAll(sitePath, 0755); err != nil {
		t.Fatal(err)
	}

	info, err := InspectIonRecipe(sitePath)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info.Status != "missing_manifest" {
		t.Errorf("expected missing_manifest, got %q", info.Status)
	}
}

func TestInspectIonRecipe_ManifestUnparseable(t *testing.T) {
	dir := t.TempDir()
	sitePath := filepath.Join(dir, "github.com")
	writefile(t, filepath.Join(sitePath, domainManifestFile), "{ this is not json }")

	info, err := InspectIonRecipe(sitePath)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info.Status != "invalid_manifest" {
		t.Errorf("expected invalid_manifest, got %q", info.Status)
	}
}

func TestInspectIonRecipe_EntrypointMissing(t *testing.T) {
	dir := t.TempDir()
	sitePath := filepath.Join(dir, "github.com")
	// Manifest declares entrypoint but we do NOT write the file
	makeManifest(t, sitePath, "github.com", "1.0.0", "actions/missing.ion")

	info, err := InspectIonRecipe(sitePath)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info.Status != "missing_entrypoint" {
		t.Errorf("expected missing_entrypoint, got %q", info.Status)
	}
}

func TestInspectIonRecipe_SkipsMetaDir(t *testing.T) {
	dir := t.TempDir()

	// Create _meta, _staging, _backup — they must not appear in results
	for _, reserved := range []string{"_meta", "_staging", "_backup"} {
		if err := os.MkdirAll(filepath.Join(dir, reserved), 0755); err != nil {
			t.Fatal(err)
		}
	}

	// One valid site
	sitePath := filepath.Join(dir, "github.com")
	makeManifest(t, sitePath, "github.com", "1.0.0", "actions/auth.ion")
	writefile(t, filepath.Join(sitePath, "actions/auth.ion"), "# auth")

	result, err := InspectAllIonRecipes(dir)
	if err != nil {
		// A missing ionsites dir returns an error but also returns partial data —
		// here dir exists so we expect no error.
		t.Fatalf("unexpected error: %v", err)
	}

	for _, r := range result.Recipes {
		if r.Site == "_meta" || r.Site == "_staging" || r.Site == "_backup" {
			t.Errorf("reserved directory %q appeared in results", r.Site)
		}
	}

	if len(result.Recipes) != 1 {
		t.Errorf("expected 1 recipe, got %d", len(result.Recipes))
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// verifyIonRecipeStaging
// ─────────────────────────────────────────────────────────────────────────────

func TestVerifyIonRecipeStaging_AllPass(t *testing.T) {
	dir := t.TempDir()
	content := "# auth flow content"
	writefile(t, filepath.Join(dir, "actions/auth.ion"), content)

	update := IonRecipeUpdate{
		Site:    "github.com",
		Version: "1.0.0",
		Files: []IonRecipeFile{
			{Path: "actions/auth.ion", SHA256: sha256hex(content)},
		},
	}

	if err := verifyIonRecipeStaging(dir, update); err != nil {
		t.Errorf("expected no error, got: %v", err)
	}
}

func TestVerifyIonRecipeStaging_HashMismatch(t *testing.T) {
	dir := t.TempDir()
	writefile(t, filepath.Join(dir, "actions/auth.ion"), "real content")

	update := IonRecipeUpdate{
		Site:    "github.com",
		Version: "1.0.0",
		Files: []IonRecipeFile{
			{Path: "actions/auth.ion", SHA256: sha256hex("different content")},
		},
	}

	if err := verifyIonRecipeStaging(dir, update); err == nil {
		t.Error("expected hash mismatch error, got nil")
	}
}

func TestVerifyIonRecipeStaging_FileMissing(t *testing.T) {
	dir := t.TempDir()
	// Do NOT write the declared file

	update := IonRecipeUpdate{
		Site:    "github.com",
		Version: "1.0.0",
		Files: []IonRecipeFile{
			{Path: "actions/auth.ion", SHA256: sha256hex("anything")},
		},
	}

	if err := verifyIonRecipeStaging(dir, update); err == nil {
		t.Error("expected missing file error, got nil")
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// atomicSwap
// ─────────────────────────────────────────────────────────────────────────────

func TestAtomicSwap_BothRenames(t *testing.T) {
	root := t.TempDir()
	liveDir := filepath.Join(root, "live")
	stagingDir := filepath.Join(root, "staging")
	backupDir := filepath.Join(root, "backup")

	// Create live and staging with marker files
	writefile(t, filepath.Join(liveDir, "marker"), "live")
	writefile(t, filepath.Join(stagingDir, "marker"), "staging")

	state, err := atomicSwap(liveDir, stagingDir, backupDir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if state != swapStateBothDone {
		t.Errorf("expected swapStateBothDone, got %v", state)
	}

	// staging is now live
	data, err := os.ReadFile(filepath.Join(liveDir, "marker"))
	if err != nil || string(data) != "staging" {
		t.Errorf("expected live dir to contain staging content, got %q", string(data))
	}

	// old live is now backup
	data, err = os.ReadFile(filepath.Join(backupDir, "marker"))
	if err != nil || string(data) != "live" {
		t.Errorf("expected backup dir to contain old live content, got %q", string(data))
	}
}

func TestAtomicSwap_SecondRenameFails(t *testing.T) {
	root := t.TempDir()
	liveDir := filepath.Join(root, "live")
	backupDir := filepath.Join(root, "backup")
	// stagingDir does NOT exist — second rename will fail
	stagingDir := filepath.Join(root, "nonexistent_staging")

	writefile(t, filepath.Join(liveDir, "marker"), "live")

	state, err := atomicSwap(liveDir, stagingDir, backupDir)
	if err == nil {
		t.Fatal("expected error from second rename, got nil")
	}
	_ = state

	// First rename must have been reversed: live must still exist
	if _, statErr := os.Stat(liveDir); os.IsNotExist(statErr) {
		t.Error("live dir was not restored after second rename failure")
	}

	// backup must not exist (was reversed)
	if _, statErr := os.Stat(backupDir); statErr == nil {
		t.Error("backup dir still exists after reversal — first rename was not reversed")
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// rollbackSwap
// ─────────────────────────────────────────────────────────────────────────────

func TestRollbackSwap_RestoresFromBackup(t *testing.T) {
	root := t.TempDir()
	liveDir := filepath.Join(root, "live")
	backupDir := filepath.Join(root, "backup")

	writefile(t, filepath.Join(liveDir, "marker"), "new-broken")
	writefile(t, filepath.Join(backupDir, "marker"), "old-good")

	if err := rollbackSwap(liveDir, backupDir); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	data, err := os.ReadFile(filepath.Join(liveDir, "marker"))
	if err != nil || string(data) != "old-good" {
		t.Errorf("expected live to be restored from backup, got %q", string(data))
	}

	if _, statErr := os.Stat(backupDir); statErr == nil {
		t.Error("backup dir still exists after rollback")
	}
}

func TestRollbackSwap_NoBackup(t *testing.T) {
	root := t.TempDir()
	liveDir := filepath.Join(root, "live")
	backupDir := filepath.Join(root, "backup") // does not exist

	writefile(t, filepath.Join(liveDir, "marker"), "live")

	if err := rollbackSwap(liveDir, backupDir); err == nil {
		t.Error("expected error when backup does not exist, got nil")
	}

	// live must be untouched
	if _, statErr := os.Stat(liveDir); os.IsNotExist(statErr) {
		t.Error("live dir was removed even though backup was absent")
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// updateVersionsJSON
// ─────────────────────────────────────────────────────────────────────────────

func TestUpdateVersionsJSON_Atomic(t *testing.T) {
	dir := t.TempDir()

	entry := VersionEntry{
		Version:     "1.0.0",
		InstalledAt: "2026-05-02T12:00:00Z",
		SHA256:      "abc123",
		Status:      "active",
	}

	if err := updateVersionsJSON(dir, "github.com", entry); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// .tmp must not remain
	tmpPath := filepath.Join(dir, ionMetaDir, ionVersionsFile+".tmp")
	if _, err := os.Stat(tmpPath); err == nil {
		t.Error(".tmp file still exists after atomic write")
	}

	// Final file must exist and parse correctly
	vf, err := readVersionsFile(dir)
	if err != nil {
		t.Fatalf("could not read versions file: %v", err)
	}

	got, ok := vf.Sites["github.com"]
	if !ok {
		t.Fatal("github.com not found in versions.json")
	}
	if got.Version != "1.0.0" {
		t.Errorf("expected version 1.0.0, got %q", got.Version)
	}
}

func TestUpdateVersionsJSON_SwapCountIncrement(t *testing.T) {
	dir := t.TempDir()

	entry := VersionEntry{
		Version: "1.0.0",
		Status:  "active",
	}

	// First write — swap_count should be 1
	if err := updateVersionsJSON(dir, "github.com", entry); err != nil {
		t.Fatalf("first write: %v", err)
	}

	// Second write — swap_count should be 2
	entry.Version = "1.1.0"
	if err := updateVersionsJSON(dir, "github.com", entry); err != nil {
		t.Fatalf("second write: %v", err)
	}

	vf, err := readVersionsFile(dir)
	if err != nil {
		t.Fatalf("read: %v", err)
	}

	got := vf.Sites["github.com"]
	if got.SwapCount != 2 {
		t.Errorf("expected swap_count 2, got %d", got.SwapCount)
	}
	if got.Version != "1.1.0" {
		t.Errorf("expected version 1.1.0, got %q", got.Version)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// RecoverPendingSwaps
// ─────────────────────────────────────────────────────────────────────────────

func TestRecoverPendingSwap_BackupDoneNewLive(t *testing.T) {
	// Simulates crash after BOTH renames succeeded:
	// live has new version, backup has old version, versions.json still "pending"
	dir := t.TempDir()

	domain := "github.com"
	liveDir := filepath.Join(dir, domain)
	backupDir := filepath.Join(dir, ionBackupDir, domain)

	// Write new manifest in live (swap completed on disk)
	makeManifest(t, liveDir, domain, "1.1.0", "actions/auth.ion")
	writefile(t, filepath.Join(liveDir, "actions/auth.ion"), "# new")

	// Write old manifest in backup
	makeManifest(t, backupDir, domain, "1.0.0", "actions/auth.ion")

	// versions.json says pending at 1.1.0
	if err := updateVersionsJSON(dir, domain, VersionEntry{
		Version: "1.1.0",
		Status:  "pending",
	}); err != nil {
		t.Fatal(err)
	}

	if err := RecoverPendingSwaps(dir, &NoopIonPumpClient{}); err != nil {
		t.Fatalf("RecoverPendingSwaps: %v", err)
	}

	vf, _ := readVersionsFile(dir)
	if vf.Sites[domain].Status != "active" {
		t.Errorf("expected status active after recovery, got %q", vf.Sites[domain].Status)
	}
}

func TestRecoverPendingSwap_BackupDoneOldLive(t *testing.T) {
	// Simulates crash after FIRST rename only:
	// live has old version, backup also exists — backup should be deleted, abort
	dir := t.TempDir()

	domain := "github.com"
	liveDir := filepath.Join(dir, domain)
	backupDir := filepath.Join(dir, ionBackupDir, domain)

	// live has OLD version (first rename happened: live→backup, then crash before staging→live)
	makeManifest(t, liveDir, domain, "1.0.0", "actions/auth.ion")
	writefile(t, filepath.Join(liveDir, "actions/auth.ion"), "# old")

	// backup also has old version (it's what was renamed away)
	makeManifest(t, backupDir, domain, "1.0.0", "actions/auth.ion")

	// versions.json says pending at 1.1.0 (the target version that never landed)
	if err := updateVersionsJSON(dir, domain, VersionEntry{
		Version: "1.1.0",
		Status:  "pending",
	}); err != nil {
		t.Fatal(err)
	}

	if err := RecoverPendingSwaps(dir, &NoopIonPumpClient{}); err != nil {
		t.Fatalf("RecoverPendingSwaps: %v", err)
	}

	// Backup must be deleted
	if _, err := os.Stat(backupDir); err == nil {
		t.Error("backup dir should have been deleted after case-B recovery")
	}

	// Live must still be intact
	if _, err := os.Stat(liveDir); os.IsNotExist(err) {
		t.Error("live dir must not be touched in case-B recovery")
	}
}
