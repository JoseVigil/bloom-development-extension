package inspection

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"time"

)

const (
	domainManifestFile    = "domain.manifest.json"
	ionManifestMaxSize    = 64 * 1024 // 64 KB safety cap
	ionSupportedSchema    = "2.0"
	ionMetaDir            = "_meta"
	ionStagingDir         = "_staging"
	ionBackupDir          = "_backup"
	ionVersionsFile       = "versions.json"
	ionQuiesceTimeoutMs   = 10_000
)

// ─────────────────────────────────────────────────────────────────────────────
// Inspection
// ─────────────────────────────────────────────────────────────────────────────

// InspectAllIonRecipes reads every installed site under ionsitesPath and returns
// a summary. Directories prefixed with "_" (_meta, _staging, _backup) are skipped.
func InspectAllIonRecipes(ionsitesPath string) (*IonRecipesResult, error) {
	result := &IonRecipesResult{
		Recipes:   []IonRecipeInfo{},
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}

	entries, err := os.ReadDir(ionsitesPath)
	if err != nil {
		if os.IsNotExist(err) {
			return result, fmt.Errorf("ionsites directory not found: %s", ionsitesPath)
		}
		return result, fmt.Errorf("failed to read ionsites directory: %w", err)
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		if strings.HasPrefix(entry.Name(), "_") {
			continue // skip _meta, _staging, _backup
		}

		sitePath := filepath.Join(ionsitesPath, entry.Name())
		info, err := InspectIonRecipe(sitePath)
		if err != nil {
			// Non-fatal: report the site as failed rather than aborting the whole run.
			result.Recipes = append(result.Recipes, IonRecipeInfo{
				Site:   entry.Name(),
				Status: "invalid_manifest",
			})
			continue
		}
		result.Recipes = append(result.Recipes, *info)
	}

	return result, nil
}

// InspectIonRecipe inspects a single installed site directory and returns its
// IonRecipeInfo. sitePath must point to the extracted contents of the .ion ZIP
// (i.e. BloomNucleus/bin/cortex/ionsites/{domain}/).
func InspectIonRecipe(sitePath string) (*IonRecipeInfo, error) {
	manifestPath := filepath.Join(sitePath, domainManifestFile)

	data, err := os.ReadFile(manifestPath)
	if err != nil {
		if os.IsNotExist(err) {
			return &IonRecipeInfo{
				Site:   filepath.Base(sitePath),
				Status: "missing_manifest",
			}, nil
		}
		return nil, fmt.Errorf("failed to read %s: %w", domainManifestFile, err)
	}

	var manifest IonDomainManifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		return &IonRecipeInfo{
			Site:   filepath.Base(sitePath),
			Status: "invalid_manifest",
		}, nil
	}

	if manifest.Version == "" {
		return &IonRecipeInfo{
			Site:   filepath.Base(sitePath),
			Status: "invalid_manifest",
		}, nil
	}

	// Collect public action names.
	var publicActions []string
	for name, action := range manifest.Actions {
		if action.Public {
			publicActions = append(publicActions, name)
		}
	}

	// Verify that every entry_action file exists on disk.
	status := "healthy"
	for _, actionName := range manifest.EntryActions {
		action, ok := manifest.Actions[actionName]
		if !ok {
			status = "missing_entrypoint"
			break
		}
		if _, err := os.Stat(filepath.Join(sitePath, action.File)); os.IsNotExist(err) {
			status = "missing_entrypoint"
			break
		}
	}

	sizeBytes := calculateDirSize(sitePath)

	return &IonRecipeInfo{
		Site:                  manifest.Domain,
		Version:               manifest.Version,
		Description:           manifest.Description,
		SchemaVersion:         manifest.SchemaVersion,
		EntryActions:          manifest.EntryActions,
		PublicActions:         publicActions,
		PageCount:             len(manifest.Pages),
		SharedCount:           len(manifest.Shared),
		Capabilities:          manifest.Capabilities,
		RequiresCortexVersion: manifest.RequiresCortexVersion,
		SizeBytes:             sizeBytes,
		Status:                status,
	}, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// Staging — download + verify
// ─────────────────────────────────────────────────────────────────────────────

// ReadIonManifestFromZIP opens a .ion ZIP (at zipPath), reads domain.manifest.json,
// and returns the parsed manifest. Nothing is extracted to disk.
// Mirrors the pattern in cortex.go / ReadCortexMeta.
func ReadIonManifestFromZIP(zipPath string) (*IonDomainManifest, error) {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open .ion archive: %w", err)
	}
	defer r.Close()

	var manifestFile *zip.File
	for _, f := range r.File {
		if f.Name == domainManifestFile {
			manifestFile = f
			break
		}
	}
	if manifestFile == nil {
		return nil, fmt.Errorf("%s not found inside .ion archive", domainManifestFile)
	}
	if manifestFile.UncompressedSize64 > ionManifestMaxSize {
		return nil, fmt.Errorf("%s exceeds max allowed size (%d bytes)", domainManifestFile, ionManifestMaxSize)
	}

	rc, err := manifestFile.Open()
	if err != nil {
		return nil, fmt.Errorf("failed to open %s inside archive: %w", domainManifestFile, err)
	}
	defer rc.Close()

	data, err := io.ReadAll(io.LimitReader(rc, ionManifestMaxSize))
	if err != nil {
		return nil, fmt.Errorf("failed to read %s: %w", domainManifestFile, err)
	}

	var manifest IonDomainManifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		return nil, fmt.Errorf("failed to parse %s: %w", domainManifestFile, err)
	}
	if manifest.Version == "" {
		return nil, fmt.Errorf("%s is missing required field: version", domainManifestFile)
	}
	if manifest.Domain == "" {
		return nil, fmt.Errorf("%s is missing required field: domain", domainManifestFile)
	}

	return &manifest, nil
}

// extractIonZIP extracts all files from a .ion ZIP into destDir, preserving
// the internal directory structure. destDir must already exist.
// File permissions are normalized to 0644 (files) and 0755 (directories).
func extractIonZIP(zipPath, destDir string) error {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return fmt.Errorf("failed to open .ion archive for extraction: %w", err)
	}
	defer r.Close()

	for _, f := range r.File {
		// Security: reject paths that escape destDir.
		destPath := filepath.Join(destDir, filepath.FromSlash(f.Name))
		if !strings.HasPrefix(destPath, filepath.Clean(destDir)+string(os.PathSeparator)) {
			return fmt.Errorf("zip entry %q would escape destination directory", f.Name)
		}

		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(destPath, 0755); err != nil {
				return fmt.Errorf("failed to create directory %s: %w", destPath, err)
			}
			continue
		}

		// Ensure parent directory exists.
		if err := os.MkdirAll(filepath.Dir(destPath), 0755); err != nil {
			return fmt.Errorf("failed to create parent dir for %s: %w", destPath, err)
		}

		if err := extractZIPEntry(f, destPath); err != nil {
			return err
		}
	}

	return nil
}

func extractZIPEntry(f *zip.File, destPath string) error {
	rc, err := f.Open()
	if err != nil {
		return fmt.Errorf("failed to open zip entry %s: %w", f.Name, err)
	}
	defer rc.Close()

	out, err := os.OpenFile(destPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		return fmt.Errorf("failed to create file %s: %w", destPath, err)
	}
	defer out.Close()

	if _, err := io.Copy(out, rc); err != nil {
		return fmt.Errorf("failed to write file %s: %w", destPath, err)
	}

	return nil
}

// verifyIonRecipeStaging checks that every file declared in update.Files exists
// in stagingDir and matches the declared SHA-256 hash.
// Returns an error describing the first mismatch found.
func verifyIonRecipeStaging(stagingDir string, update IonRecipeUpdate) error {
	for _, f := range update.Files {
		fullPath := filepath.Join(stagingDir, filepath.FromSlash(f.Path))

		actual, err := CalculateSHA256(fullPath)
		if err != nil {
			return fmt.Errorf("verify: file %s: %w", f.Path, err)
		}
		if !strings.EqualFold(actual, f.SHA256) {
			return fmt.Errorf("verify: hash mismatch for %s: expected %s got %s", f.Path, f.SHA256, actual)
		}
	}
	return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// Atomic swap
// ─────────────────────────────────────────────────────────────────────────────

// atomicSwap performs the two-rename swap:
//  1. liveDir  → backupDir
//  2. stagingDir → liveDir
//
// If step 2 fails, step 1 is immediately reversed before returning the error.
// Returns the final swapState so crash-recovery can inspect it on next startup.
func atomicSwap(liveDir, stagingDir, backupDir string) (swapState, error) {
	// Step 1: live → backup (skipped on first install when liveDir doesn't exist yet)
	if _, err := os.Stat(liveDir); err == nil {
		if err := os.Rename(liveDir, backupDir); err != nil {
			return swapStateNone, fmt.Errorf("swap: first rename (live→backup) failed: %w", err)
		}
	}

	// Step 2: staging → live
	if err := os.Rename(stagingDir, liveDir); err != nil {
		// Reverse step 1 immediately if it happened.
		if _, statErr := os.Stat(backupDir); statErr == nil {
			_ = os.Rename(backupDir, liveDir)
		}
		return swapStateFirstDone, fmt.Errorf("swap: second rename (staging→live) failed: %w", err)
	}

	return swapStateBothDone, nil
}

// rollbackSwap restores a site from its backup directory.
// liveDir is removed and backupDir is renamed to liveDir.
// If backupDir does not exist, liveDir is left untouched and an error is returned.
func rollbackSwap(liveDir, backupDir string) error {
	if _, err := os.Stat(backupDir); os.IsNotExist(err) {
		return fmt.Errorf("rollback: backup directory not found: %s", backupDir)
	}

	if err := os.RemoveAll(liveDir); err != nil {
		return fmt.Errorf("rollback: failed to remove live directory: %w", err)
	}

	if err := os.Rename(backupDir, liveDir); err != nil {
		return fmt.Errorf("rollback: failed to rename backup→live: %w", err)
	}

	return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// versions.json
// ─────────────────────────────────────────────────────────────────────────────

// readVersionsFile reads _meta/versions.json. Returns an empty VersionsFile
// (not an error) if the file does not exist yet.
func readVersionsFile(ionsitesPath string) (*VersionsFile, error) {
	path := filepath.Join(ionsitesPath, ionMetaDir, ionVersionsFile)

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return &VersionsFile{
				SchemaVersion: "1.0",
				Sites:         map[string]VersionEntry{},
			}, nil
		}
		return nil, fmt.Errorf("failed to read versions.json: %w", err)
	}

	var vf VersionsFile
	if err := json.Unmarshal(data, &vf); err != nil {
		return nil, fmt.Errorf("failed to parse versions.json: %w", err)
	}
	if vf.Sites == nil {
		vf.Sites = map[string]VersionEntry{}
	}

	return &vf, nil
}

// updateVersionsJSON writes an updated VersionEntry for the given site into
// _meta/versions.json using an atomic write-then-rename.
// A versions.json write failure after a successful swap MUST NOT trigger rollback —
// the caller is responsible for logging the error and continuing.
func updateVersionsJSON(ionsitesPath, site string, entry VersionEntry) error {
	metaDir := filepath.Join(ionsitesPath, ionMetaDir)
	if err := os.MkdirAll(metaDir, 0755); err != nil {
		return fmt.Errorf("failed to create _meta dir: %w", err)
	}

	vf, err := readVersionsFile(ionsitesPath)
	if err != nil {
		return err
	}

	entry.SwapCount = vf.Sites[site].SwapCount + 1
	vf.Sites[site] = entry
	vf.LastUpdated = time.Now().UTC().Format(time.RFC3339)

	data, err := json.MarshalIndent(vf, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal versions.json: %w", err)
	}

	finalPath := filepath.Join(metaDir, ionVersionsFile)
	tmpPath := finalPath + ".tmp"

	if err := os.WriteFile(tmpPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write versions.json.tmp: %w", err)
	}

	if err := os.Rename(tmpPath, finalPath); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("failed to rename versions.json.tmp → versions.json: %w", err)
	}

	return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// Reconciliation
// ─────────────────────────────────────────────────────────────────────────────

// ReconcileIonRecipe executes the full 7-phase reconciliation lifecycle for a
// single site. It is called once per site by ReconcileAllIonRecipes.
//
// Phases:
//  1. Skip check   — version + SHA-256 match → action: "skipped"
//  2. Stage        — extract ZIP into _staging/{site}/
//  3. Verify       — SHA-256 every declared file in staging
//  4. Signal pre   — ask Brain to quiesce the site
//  5. Swap         — atomicSwap (two renames)
//  6. Signal post  — ask Brain to reload the site
//  7. Rollback     — if Brain reports reload error, restore from backup
func ReconcileIonRecipe(
	ionsitesPath string,
	update IonRecipeUpdate,
	client IonPumpClient,
	dryRun bool,
	forceSwap bool,
) ReconcileResult {
	start := time.Now()
	result := ReconcileResult{
		Site:       update.Site,
		NewVersion: update.Version,
	}

	liveDir    := filepath.Join(ionsitesPath, update.Site)
	stagingDir := filepath.Join(ionsitesPath, ionStagingDir, update.Site)
	backupDir  := filepath.Join(ionsitesPath, ionBackupDir, update.Site)

	// ── Phase 1: Skip check ─────────────────────────────────────────────────
	vf, _ := readVersionsFile(ionsitesPath)
	existing, hasExisting := vf.Sites[update.Site]
	if hasExisting {
		result.PreviousVersion = existing.Version
		if existing.Version == update.Version && strings.EqualFold(existing.SHA256, update.SHA256) {
			result.Action = "skipped"
			result.DurationMs = time.Since(start).Milliseconds()
			return result
		}
	}

	if dryRun {
		result.Action = "skipped"
		result.DurationMs = time.Since(start).Milliseconds()
		return result
	}

	// ── Phase 2: Stage ───────────────────────────────────────────────────────
	if err := os.MkdirAll(stagingDir, 0755); err != nil {
		result.Action = "failed"
		result.Phase = "stage"
		result.Error = err.Error()
		result.DurationMs = time.Since(start).Milliseconds()
		return result
	}

	// Download is handled externally (Nucleus fetches to staging/downloads/).
	// Here we expect the ZIP already present at the staging download path.
	// extractIonZIP unpacks it into stagingDir preserving subdirectories.
	zipPath := filepath.Join(ionsitesPath, ionStagingDir, "downloads", update.Site+".ion")
	if err := extractIonZIP(zipPath, stagingDir); err != nil {
		_ = os.RemoveAll(stagingDir)
		result.Action = "failed"
		result.Phase = "stage"
		result.Error = err.Error()
		result.DurationMs = time.Since(start).Milliseconds()
		return result
	}

	// ── Phase 3: Verify ──────────────────────────────────────────────────────
	if err := verifyIonRecipeStaging(stagingDir, update); err != nil {
		_ = os.RemoveAll(stagingDir)
		result.Action = "failed"
		result.Phase = "verify"
		result.Error = err.Error()
		result.DurationMs = time.Since(start).Milliseconds()
		return result
	}

	// ── Phase 4: Signal pre (quiesce) ────────────────────────────────────────
	if !forceSwap {
		qr, err := client.QuiesceSite(update.Site, ionQuiesceTimeoutMs)
		if err != nil || qr.Status != "quiesced" {
			result.Action = "failed"
			result.Phase = "signal_pre"
			if err != nil {
				result.Error = err.Error()
			} else {
				result.Error = fmt.Sprintf("Brain returned status: %s", qr.Status)
			}
			result.DurationMs = time.Since(start).Milliseconds()
			return result
		}
	}

	// ── Phase 5: Swap ─────────────────────────────────────────────────────────
	// Ensure the _backup/ parent directory exists before the first rename.
	if err := os.MkdirAll(filepath.Dir(backupDir), 0755); err != nil {
		result.Action = "failed"
		result.Phase = "swap"
		result.Error = fmt.Sprintf("failed to create backup dir: %v", err)
		result.DurationMs = time.Since(start).Milliseconds()
		return result
	}
	_, swapErr := atomicSwap(liveDir, stagingDir, backupDir)
	if swapErr != nil {
		result.Action = "failed"
		result.Phase = "swap"
		result.Error = swapErr.Error()
		result.DurationMs = time.Since(start).Milliseconds()
		return result
	}

	swappedAt := time.Now().UTC().Format(time.RFC3339)

	// ── Phase 6: Signal post (reload) ────────────────────────────────────────
	rr, err := client.ReloadSite(update.Site, update.Version)
	if err != nil || rr.Status != "reloaded" {
		// ── Phase 7: Rollback ────────────────────────────────────────────────
		rollbackErr := rollbackSwap(liveDir, backupDir)
		if rollbackErr != nil {
			// Critical failure — log maximum severity, alert Nucleus separately.
			result.Action = "failed"
			result.Phase = "rollback"
			result.Error = fmt.Sprintf("reload failed AND rollback failed: %v / %v", err, rollbackErr)
		} else {
			result.Action = "rolled_back"
			result.Phase = "signal_post"
			if err != nil {
				result.Error = err.Error()
			} else {
				result.Error = rr.Error
			}
		}
		result.DurationMs = time.Since(start).Milliseconds()
		return result
	}

	// ── Update versions.json (failure here does NOT trigger rollback) ─────────
	entry := VersionEntry{
		Version:     update.Version,
		InstalledAt: swappedAt,
		SHA256:      update.SHA256,
		Status:      "active",
	}
	if versErr := updateVersionsJSON(ionsitesPath, update.Site, entry); versErr != nil {
		// Log only — swap is complete on disk.
		_ = versErr
	}

	result.Action = "swapped"
	result.SwappedAt = swappedAt
	result.DurationMs = time.Since(start).Milliseconds()
	return result
}

// ReconcileAllIonRecipes processes every site in the manifest sequentially.
// A failure on one site does not abort others.
func ReconcileAllIonRecipes(
	ionsitesPath string,
	updates []IonRecipeUpdate,
	client IonPumpClient,
	dryRun bool,
	forceSwap bool,
) ReconcileAllResult {
	all := ReconcileAllResult{
		Results:   make([]ReconcileResult, 0, len(updates)),
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}

	for _, update := range updates {
		r := ReconcileIonRecipe(ionsitesPath, update, client, dryRun, forceSwap)
		all.Results = append(all.Results, r)

		switch r.Action {
		case "skipped":
			all.Summary.Skipped++
		case "swapped":
			all.Summary.Swapped++
		case "rolled_back":
			all.Summary.RolledBack++
		default:
			all.Summary.Failed++
		}
	}

	all.Summary.TotalSites = len(updates)
	return all
}

// ─────────────────────────────────────────────────────────────────────────────
// Crash recovery
// ─────────────────────────────────────────────────────────────────────────────

// RecoverPendingSwaps runs at Metamorph startup and repairs any site left in
// "pending" status from a previous crashed reconciliation run.
//
// Case A: backup exists AND live is new version  → swap completed, update versions.json.
// Case B: backup exists AND live is old version  → first rename only happened, delete backup.
// Case C: no backup                              → nothing to recover.
func RecoverPendingSwaps(ionsitesPath string, client IonPumpClient) error {
	vf, err := readVersionsFile(ionsitesPath)
	if err != nil {
		return err
	}

	for site, entry := range vf.Sites {
		if entry.Status != "pending" {
			continue
		}

		backupDir := filepath.Join(ionsitesPath, ionBackupDir, site)
		backupInfo, backupErr := os.Stat(backupDir)

		if backupErr != nil || !backupInfo.IsDir() {
			// Case C: nothing to recover.
			continue
		}

		liveDir := filepath.Join(ionsitesPath, site)
		liveManifestPath := filepath.Join(liveDir, domainManifestFile)

		liveData, err := os.ReadFile(liveManifestPath)
		if err != nil {
			// Can't determine live version — leave for manual inspection.
			continue
		}

		var liveManifest IonDomainManifest
		if err := json.Unmarshal(liveData, &liveManifest); err != nil {
			continue
		}

		if liveManifest.Version == entry.Version {
			// Case A: swap completed on disk, versions.json not updated.
			updated := entry
			updated.Status = "active"
			_ = updateVersionsJSON(ionsitesPath, site, updated)
		} else {
			// Case B: only first rename happened. Delete backup, abort.
			_ = os.RemoveAll(backupDir)
		}
	}

	return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// calculateDirSize returns the total size in bytes of all files under dir.
func calculateDirSize(dir string) int64 {
	var total int64
	_ = filepath.WalkDir(dir, func(_ string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		info, err := d.Info()
		if err == nil {
			total += info.Size()
		}
		return nil
	})
	return total
}