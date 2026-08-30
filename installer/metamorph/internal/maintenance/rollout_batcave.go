package maintenance

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"metamorph/internal/core"
)

var batcaveSlugPattern = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])?$`)
var nodeVersionPattern = regexp.MustCompile(`^v([0-9]+)\.([0-9]+)\.([0-9]+)$`)

type batcaveArtifactFile struct {
	SHA256 string `json:"sha256"`
	Size   int64  `json:"size"`
}

type batcaveArtifactManifest struct {
	SchemaVersion     int                            `json:"schema_version"`
	Component         string                         `json:"component"`
	Version           string                         `json:"version"`
	Build             int                            `json:"build"`
	NodeTarget        string                         `json:"node_target"`
	ModuleFormat      string                         `json:"module_format"`
	PrimaryEntrypoint string                         `json:"primary_entrypoint"`
	Entrypoints       map[string]string              `json:"entrypoints"`
	Files             map[string]batcaveArtifactFile `json:"files"`
}

type batcaveLegacyLayout struct {
	Detected bool     `json:"detected"`
	Action   string   `json:"action"`
	Paths    []string `json:"paths"`
}

type batcaveRolloutReceipt struct {
	SchemaVersion  int    `json:"schema_version"`
	RolloutID      string `json:"rollout_id"`
	Workspace      string `json:"workspace"`
	Organization   string `json:"organization"`
	Destination    string `json:"destination"`
	SourceManifest string `json:"source_manifest_sha256"`
	CreatedAt      string `json:"created_at"`
}

type nucleusIdentity struct {
	Organization struct {
		Slug string `json:"slug"`
	} `json:"organization"`
	Nucleus struct {
		Path     string `json:"path"`
		RootPath string `json:"rootPath"`
	} `json:"nucleus"`
}

func runBatcaveRollout(c *core.Core, dryRun bool, workspaceInput, organization string) error {
	workspace, _, batcaveRoot, err := validateBatcaveOrganization(workspaceInput, organization)
	if err != nil {
		return err
	}
	repoRoot, err := resolveRepoRoot()
	if err != nil {
		return fmt.Errorf("cannot determine repo root: %w", err)
	}
	source := filepath.Join(repoRoot, "installer", "native", "batcave")
	manifest, manifestHash, err := validateBatcaveArtifact(source, false)
	if err != nil {
		return fmt.Errorf("batcave artifact validation failed: %w", err)
	}
	managedNode := filepath.Join(core.GetBaseAppDataPath(), "bin", "node", exe("node"))
	if err := validateManagedNode(managedNode, manifest.NodeTarget); err != nil {
		return err
	}

	destination := filepath.Join(batcaveRoot, "app")
	legacy := detectBatcaveLegacyLayout(batcaveRoot)
	result := rolloutResult{
		Status: "success", DryRun: dryRun, Only: "batcave", RepoRoot: repoRoot,
		Workspace: workspace, Organization: organization,
		Deployed: []deployedEntry{}, Skipped: []string{}, Errors: []string{}, Pending: []rolloutHandoff{}, Warnings: []string{},
		LegacyLayout: &legacy,
	}
	if legacy.Detected {
		result.Status = "success_with_warnings"
		result.Warnings = append(result.Warnings, "legacy Batcave root layout was preserved because file ownership cannot be verified")
	}

	id, err := newBatcaveRolloutID()
	if err != nil {
		return fmt.Errorf("create Batcave rollout ID: %w", err)
	}
	stage := filepath.Join(batcaveRoot, ".app.rollout-"+id)
	backup := filepath.Join(batcaveRoot, ".app.rollback-"+id)
	for _, candidate := range []string{destination, stage, backup} {
		if err := requireContainedPath(batcaveRoot, candidate); err != nil {
			return err
		}
	}

	cleanupWarnings, cleanupPending, err := recoverBatcaveResidues(batcaveRoot, destination, workspace, organization, dryRun)
	if err != nil {
		return err
	}
	result.Warnings = append(result.Warnings, cleanupWarnings...)
	result.CleanupPending = cleanupPending
	if len(cleanupWarnings) > 0 && result.Status == "success" {
		result.Status = "success_with_warnings"
	}

	entry := deployedEntry{Component: "Batcave", Source: source, Destination: destination, Staging: stage, Version: manifest.Version, Build: manifest.Build}
	if dryRun {
		result.Deployed = append(result.Deployed, entry)
		if c.Config.OutputJSON {
			c.OutputJSON(result)
			return nil
		}
		fmt.Printf("\nBatcave rollout dry-run validated\nOrganization: %s\nWorkspace: %s\nSource: %s\nStaging: %s\nDestination: %s\nVersion: %s\nBuild: %d\n",
			organization, workspace, source, stage, destination, manifest.Version, manifest.Build)
		printBatcaveWarnings(result.Warnings)
		return nil
	}

	if err := os.MkdirAll(batcaveRoot, 0o755); err != nil {
		return fmt.Errorf("create Batcave root: %w", err)
	}
	if err := os.Mkdir(stage, 0o755); err != nil {
		return fmt.Errorf("create Batcave stage: %w", err)
	}
	stagePresent := true
	destinationMoved := false
	stageInstalled := false
	defer func() {
		if stagePresent {
			_ = os.RemoveAll(stage)
		}
	}()

	copied, err := copyDir(source, stage)
	if err != nil {
		return fmt.Errorf("stage Batcave artifact: %w", err)
	}
	receipt := batcaveRolloutReceipt{SchemaVersion: 1, RolloutID: id, Workspace: workspace, Organization: organization, Destination: destination, SourceManifest: manifestHash, CreatedAt: time.Now().UTC().Format(time.RFC3339Nano)}
	if err := writeBatcaveJSON(filepath.Join(stage, ".metamorph-rollout.json"), receipt); err != nil {
		return fmt.Errorf("write Batcave stage receipt: %w", err)
	}
	if _, _, err := validateBatcaveArtifact(stage, true); err != nil {
		return fmt.Errorf("validate Batcave stage: %w", err)
	}

	if _, err := os.Stat(destination); err == nil {
		if err := os.Rename(destination, backup); err != nil {
			return fmt.Errorf("move current Batcave application to rollback directory: %w", err)
		}
		destinationMoved = true
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("inspect current Batcave application: %w", err)
	}

	rollback := func(cause error) error {
		if stageInstalled {
			if removeErr := os.RemoveAll(destination); removeErr != nil {
				return fmt.Errorf("%v; additionally could not remove failed application: %w", cause, removeErr)
			}
		}
		if destinationMoved {
			if restoreErr := os.Rename(backup, destination); restoreErr != nil {
				return fmt.Errorf("%v; rollback from %s failed: %w", cause, backup, restoreErr)
			}
		}
		return cause
	}
	if err := os.Rename(stage, destination); err != nil {
		return rollback(fmt.Errorf("install staged Batcave application: %w", err))
	}
	stagePresent = false
	stageInstalled = true
	installed, _, err := validateBatcaveArtifact(destination, true)
	if err != nil {
		return rollback(fmt.Errorf("validate installed Batcave application: %w", err))
	}
	if installed.Build != manifest.Build || installed.Version != manifest.Version {
		return rollback(fmt.Errorf("installed Batcave identity differs from source artifact"))
	}

	if destinationMoved {
		if err := os.RemoveAll(backup); err != nil {
			result.CleanupPending = true
			result.Status = "success_with_warnings"
			result.Warnings = append(result.Warnings, fmt.Sprintf("installed application is valid but rollback directory could not be removed: %s", backup))
		}
	}
	entry.FilesCopied = copied
	result.Deployed = append(result.Deployed, entry)
	if c.Config.OutputJSON {
		c.OutputJSON(result)
		return nil
	}
	fmt.Printf("\nBatcave rollout complete\nOrganization: %s\nDestination: %s\nVersion: %s\nBuild: %d\nFiles deployed: %d\n", organization, destination, manifest.Version, manifest.Build, copied)
	printBatcaveWarnings(result.Warnings)
	return nil
}

func validateBatcaveOrganization(workspaceInput, organization string) (string, string, string, error) {
	if strings.TrimSpace(workspaceInput) == "" {
		return "", "", "", fmt.Errorf("--workspace is required with --only batcave")
	}
	if strings.TrimSpace(organization) == "" {
		return "", "", "", fmt.Errorf("--org is required with --only batcave")
	}
	if !filepath.IsAbs(workspaceInput) {
		return "", "", "", fmt.Errorf("--workspace must be an absolute path")
	}
	if !batcaveSlugPattern.MatchString(organization) {
		return "", "", "", fmt.Errorf("invalid organization slug %q", organization)
	}
	workspace := filepath.Clean(workspaceInput)
	info, err := os.Stat(workspace)
	if err != nil || !info.IsDir() {
		return "", "", "", fmt.Errorf("workspace is not an existing directory: %s", workspace)
	}
	resolvedWorkspace, err := filepath.EvalSymlinks(workspace)
	if err != nil {
		return "", "", "", fmt.Errorf("resolve workspace: %w", err)
	}
	bloomRoot := filepath.Join(resolvedWorkspace, ".bloom")
	nucleusRoot := filepath.Join(bloomRoot, ".nucleus-"+organization)
	for label, candidate := range map[string]string{".bloom": bloomRoot, "organizational Nucleus": nucleusRoot} {
		info, err := os.Stat(candidate)
		if err != nil || !info.IsDir() {
			return "", "", "", fmt.Errorf("%s directory does not exist: %s", label, candidate)
		}
	}
	resolvedNucleus, err := filepath.EvalSymlinks(nucleusRoot)
	if err != nil {
		return "", "", "", fmt.Errorf("resolve organizational Nucleus: %w", err)
	}
	if err := requireContainedPath(resolvedWorkspace, resolvedNucleus); err != nil {
		return "", "", "", err
	}

	ownershipPath := filepath.Join(resolvedNucleus, ".ownership.json")
	data, err := os.ReadFile(ownershipPath)
	if err != nil {
		return "", "", "", fmt.Errorf("read .ownership.json: %w", err)
	}
	var ownershipRaw map[string]any
	if json.Unmarshal(data, &ownershipRaw) != nil || strings.TrimSpace(fmt.Sprint(ownershipRaw["org_id"])) == "" || strings.TrimSpace(fmt.Sprint(ownershipRaw["owner_id"])) == "" || strings.TrimSpace(fmt.Sprint(ownershipRaw["created_at"])) == "" {
		return "", "", "", fmt.Errorf(".ownership.json is structurally invalid")
	}
	configPath := filepath.Join(resolvedNucleus, ".core", ".nucleus-config.json")
	var identity nucleusIdentity
	data, err = os.ReadFile(configPath)
	if err != nil {
		return "", "", "", fmt.Errorf("read .nucleus-config.json: %w", err)
	}
	if err := json.Unmarshal(data, &identity); err != nil {
		return "", "", "", fmt.Errorf("parse .nucleus-config.json: %w", err)
	}
	if identity.Organization.Slug != organization {
		return "", "", "", fmt.Errorf("organization slug mismatch: requested %q, config contains %q", organization, identity.Organization.Slug)
	}
	if !sameCleanPath(identity.Nucleus.Path, resolvedNucleus) {
		return "", "", "", fmt.Errorf("nucleus.path does not match resolved organizational Nucleus")
	}
	if !sameCleanPath(identity.Nucleus.RootPath, resolvedWorkspace) {
		return "", "", "", fmt.Errorf("nucleus.rootPath does not match resolved workspace")
	}
	batcaveRoot := filepath.Join(resolvedNucleus, ".batcave")
	if _, err := os.Lstat(batcaveRoot); err == nil {
		resolvedBatcave, resolveErr := filepath.EvalSymlinks(batcaveRoot)
		if resolveErr != nil {
			return "", "", "", fmt.Errorf("resolve Batcave root: %w", resolveErr)
		}
		if !sameCleanPath(resolvedBatcave, batcaveRoot) {
			return "", "", "", fmt.Errorf("Batcave root must not be a symlink or reparse-point redirect: %s", batcaveRoot)
		}
	} else if !os.IsNotExist(err) {
		return "", "", "", fmt.Errorf("inspect Batcave root: %w", err)
	}
	return resolvedWorkspace, resolvedNucleus, batcaveRoot, nil
}

func validateBatcaveArtifact(root string, allowReceipt bool) (batcaveArtifactManifest, string, error) {
	var manifest batcaveArtifactManifest
	manifestPath := filepath.Join(root, "artifact-manifest.json")
	data, err := os.ReadFile(manifestPath)
	if err != nil {
		return manifest, "", err
	}
	if err := json.Unmarshal(data, &manifest); err != nil {
		return manifest, "", err
	}
	if manifest.SchemaVersion != 1 || manifest.Component != "batcave" || manifest.Build < 1 || strings.TrimSpace(manifest.Version) == "" || manifest.ModuleFormat != "esm" {
		return manifest, "", fmt.Errorf("invalid Batcave artifact manifest")
	}
	if !regexp.MustCompile(`^node[0-9]+$`).MatchString(manifest.NodeTarget) {
		return manifest, "", fmt.Errorf("invalid node_target %q", manifest.NodeTarget)
	}
	primary := manifest.Entrypoints[manifest.PrimaryEntrypoint]
	if primary == "" {
		return manifest, "", fmt.Errorf("primary entrypoint is not declared")
	}
	if _, ok := manifest.Files[primary]; !ok {
		return manifest, "", fmt.Errorf("primary entrypoint %q is absent from files", primary)
	}
	declared := map[string]bool{"artifact-manifest.json": true}
	if allowReceipt {
		declared[".metamorph-rollout.json"] = true
	}
	for relative, expected := range manifest.Files {
		if err := safeArtifactRelativePath(relative); err != nil {
			return manifest, "", err
		}
		declared[filepath.Clean(relative)] = true
		file := filepath.Join(root, relative)
		linkInfo, err := os.Lstat(file)
		if err != nil || linkInfo.Mode()&os.ModeSymlink != 0 {
			return manifest, "", fmt.Errorf("artifact symlink or missing file is not allowed: %s", relative)
		}
		info, err := os.Stat(file)
		if err != nil || !info.Mode().IsRegular() {
			return manifest, "", fmt.Errorf("artifact file missing or invalid: %s", relative)
		}
		if info.Size() != expected.Size {
			return manifest, "", fmt.Errorf("artifact size mismatch: %s", relative)
		}
		hash, err := fileSHA256(file)
		if err != nil || !strings.EqualFold(hash, expected.SHA256) {
			return manifest, "", fmt.Errorf("artifact hash mismatch: %s", relative)
		}
	}
	err = filepath.Walk(root, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("artifact symlink is not allowed: %s", path)
		}
		if info.IsDir() {
			return nil
		}
		relative, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		if !declared[filepath.Clean(relative)] {
			return fmt.Errorf("undeclared artifact file: %s", relative)
		}
		return nil
	})
	sum := sha256.Sum256(data)
	return manifest, hex.EncodeToString(sum[:]), err
}

func validateManagedNode(nodePath, target string) error {
	info, err := os.Stat(nodePath)
	if err != nil || !info.Mode().IsRegular() {
		return fmt.Errorf("managed Bloom Node runtime not found: %s", nodePath)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	output, err := exec.CommandContext(ctx, nodePath, "--version").Output()
	if ctx.Err() != nil {
		return fmt.Errorf("managed Bloom Node version check timed out")
	}
	if err != nil {
		return fmt.Errorf("managed Bloom Node version check failed: %w", err)
	}
	match := nodeVersionPattern.FindStringSubmatch(strings.TrimSpace(string(output)))
	if match == nil {
		return fmt.Errorf("managed Bloom Node returned an invalid version: %q", strings.TrimSpace(string(output)))
	}
	required, _ := strconv.Atoi(strings.TrimPrefix(target, "node"))
	actual, _ := strconv.Atoi(match[1])
	if actual < required {
		return fmt.Errorf("managed Bloom Node major %d is incompatible; artifact requires %s or newer", actual, target)
	}
	return nil
}

func detectBatcaveLegacyLayout(root string) batcaveLegacyLayout {
	known := []string{"main.ts", "package.json", "tsconfig.json", "README.md", "version.json", "core", "dynamic", "utils"}
	result := batcaveLegacyLayout{Action: "preserved", Paths: []string{}}
	for _, relative := range known {
		if _, err := os.Lstat(filepath.Join(root, relative)); err == nil {
			result.Paths = append(result.Paths, relative)
		}
	}
	result.Detected = len(result.Paths) > 0
	return result
}

func recoverBatcaveResidues(root, destination, workspace, organization string, dryRun bool) ([]string, bool, error) {
	entries, err := os.ReadDir(root)
	if os.IsNotExist(err) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	var stages, backups []string
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		name := entry.Name()
		if strings.HasPrefix(name, ".app.rollout-") {
			stages = append(stages, filepath.Join(root, name))
		}
		if strings.HasPrefix(name, ".app.rollback-") {
			backups = append(backups, filepath.Join(root, name))
		}
	}
	valid := func(candidate string) bool {
		data, err := os.ReadFile(filepath.Join(candidate, ".metamorph-rollout.json"))
		if err != nil {
			return false
		}
		var receipt batcaveRolloutReceipt
		return json.Unmarshal(data, &receipt) == nil && receipt.SchemaVersion == 1 && sameCleanPath(receipt.Workspace, workspace) && receipt.Organization == organization && sameCleanPath(receipt.Destination, destination)
	}
	warnings := []string{}
	pending := false
	destinationExists := false
	if _, err := os.Stat(destination); err == nil {
		destinationExists = true
	}
	validBackups := []string{}
	for _, backup := range backups {
		if valid(backup) {
			validBackups = append(validBackups, backup)
		} else {
			pending = true
			warnings = append(warnings, "unattributed Batcave rollback directory was preserved: "+backup)
		}
	}
	if !destinationExists && len(validBackups) == 1 {
		action := "interrupted Batcave rollout backup was restored: "
		if dryRun {
			action = "interrupted Batcave rollout backup would be restored: "
		}
		warnings = append(warnings, action+validBackups[0])
		if !dryRun {
			if err := os.Rename(validBackups[0], destination); err != nil {
				return warnings, true, fmt.Errorf("restore interrupted Batcave rollout: %w", err)
			}
		}
		validBackups = nil
	} else if !destinationExists && len(validBackups) > 1 {
		return warnings, true, fmt.Errorf("multiple attributable Batcave rollback directories exist; refusing ambiguous recovery")
	}
	for _, candidate := range append(stages, validBackups...) {
		if !valid(candidate) {
			pending = true
			warnings = append(warnings, "unattributed Batcave staging directory was preserved: "+candidate)
			continue
		}
		action := "stale attributable Batcave rollout directory cleaned: "
		if dryRun {
			action = "stale attributable Batcave rollout directory would be cleaned: "
		}
		warnings = append(warnings, action+candidate)
		if !dryRun {
			if err := os.RemoveAll(candidate); err != nil {
				pending = true
				warnings = append(warnings, "cleanup failed: "+candidate)
			}
		}
	}
	return warnings, pending, nil
}

func safeArtifactRelativePath(relative string) error {
	if relative == "" || filepath.IsAbs(relative) || filepath.Clean(relative) == "." || strings.HasPrefix(filepath.Clean(relative), ".."+string(os.PathSeparator)) || filepath.Clean(relative) == ".." {
		return fmt.Errorf("unsafe artifact path: %q", relative)
	}
	return nil
}

func requireContainedPath(parent, child string) error {
	relative, err := filepath.Rel(filepath.Clean(parent), filepath.Clean(child))
	if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(os.PathSeparator)) || filepath.IsAbs(relative) {
		return fmt.Errorf("path escapes Batcave boundary: %s", child)
	}
	return nil
}

func sameCleanPath(a, b string) bool {
	if runtimePathCaseInsensitive() {
		return strings.EqualFold(filepath.Clean(a), filepath.Clean(b))
	}
	return filepath.Clean(a) == filepath.Clean(b)
}

func runtimePathCaseInsensitive() bool { return os.PathSeparator == '\\' }

func fileSHA256(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", err
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

func writeBatcaveJSON(path string, value any) error {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(data, '\n'), 0o600)
}

func newBatcaveRolloutID() (string, error) {
	buffer := make([]byte, 16)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return hex.EncodeToString(buffer), nil
}

func printBatcaveWarnings(warnings []string) {
	for _, warning := range warnings {
		fmt.Printf("Warning: %s\n", warning)
	}
}
