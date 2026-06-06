package maintenance

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"metamorph/internal/core"

	"github.com/spf13/cobra"
)

func init() {
	core.RegisterCommand("MAINTENANCE", createRolloutCommand)
}

type component struct {
	Key      string
	SourceFn func(repoRoot string) string
	DestFn   func(basePath string) string
	// PostDeployFn is called after a successful file copy. It receives the
	// resolved source directory, the destination directory, and the dryRun flag.
	// Returning an error marks the component deployment as failed but does NOT
	// roll back the already-copied files — the post-deploy step is responsible
	// for its own idempotency.
	PostDeployFn func(c *core.Core, repoRoot, dst string, dryRun bool) error
	Platforms    []string
}

func exe(name string) string { return core.ExeName(name) }

func isARM64() bool { return runtime.GOARCH == "arm64" }

var allComponents = []component{
	{
		Key: "brain",
		SourceFn: func(r string) string {
			if runtime.GOOS == "darwin" {
				return filepath.Join(r, "installer", "native", "bin", "darwin_x64", "brain")
			}
			return filepath.Join(r, "brain", "dist", exe("brain"))
		},
		DestFn: func(b string) string { return filepath.Join(b, "bin", "brain") },
	},
	{
		Key: "nucleus",
		SourceFn: func(r string) string {
			if runtime.GOOS == "darwin" {
				return filepath.Join(r, "installer", "native", "bin", "darwin_x64", "nucleus")
			}
			return filepath.Join(r, "nucleus", "dist", exe("nucleus"))
		},
		DestFn: func(b string) string { return filepath.Join(b, "bin", "nucleus") },
	},
	{
		Key: "sentinel",
		SourceFn: func(r string) string {
			if runtime.GOOS == "darwin" {
				return filepath.Join(r, "installer", "native", "bin", "darwin_x64", "sentinel")
			}
			return filepath.Join(r, "sentinel", "dist", exe("sentinel"))
		},
		DestFn: func(b string) string { return filepath.Join(b, "bin", "sentinel") },
	},
	{
		Key: "metamorph",
		SourceFn: func(r string) string {
			if runtime.GOOS == "darwin" {
				return filepath.Join(r, "installer", "native", "bin", "darwin_x64", "metamorph")
			}
			return filepath.Join(r, "metamorph", exe("metamorph"))
		},
		DestFn: func(b string) string { return filepath.Join(b, "bin", "metamorph") },
	},
	{
		Key: "workspace",
		SourceFn: func(r string) string {
			if runtime.GOOS == "darwin" {
				subdir := "mac"
				if isARM64() {
					subdir = "mac-arm64"
				}
				return filepath.Join(r, "installer", "native", "bin", "darwin_x64", "workspace", subdir, "bloom-workspace.app", "Contents", "MacOS", "bloom-workspace")
			}
			return filepath.Join(r, "conductor", "dist", exe("bloom-conductor"))
		},
		DestFn: func(b string) string { return filepath.Join(b, "bin", "workspace") },
	},
	{
		Key: "setup",
		SourceFn: func(r string) string {
			if runtime.GOOS == "darwin" {
				return filepath.Join(r, "setup", "dist", "BloomSetup.pkg")
			}
			return filepath.Join(r, "setup", "dist", "BloomSetup.exe")
		},
		DestFn: func(b string) string {
			if runtime.GOOS == "darwin" {
				return filepath.Join(b, "bin", "setup", "BloomSetup.pkg")
			}
			return filepath.Join(b, "bin", "setup", "BloomSetup.exe")
		},
		Platforms: []string{"windows", "darwin"},
	},
	{
		Key: "host",
		SourceFn: func(r string) string {
			return filepath.Join(r, "host", "bin", runtime.GOOS, exe("bloom-host"))
		},
		DestFn: func(b string) string { return filepath.Join(b, "bin", "native") },
	},
	{
		Key: "cortex",
		SourceFn: func(r string) string {
			return filepath.Join(r, "installer", "native", "bin", "cortex", "bloom-cortex.blx")
		},
		DestFn: func(b string) string { return filepath.Join(b, "bin", "cortex") },
	},
	{
		// ionpump is a compound component. After copying installer/native/ionpump/
		// (bootstrap-ions.json + *.ion ZIPs) to AppData, it:
		//   1. Runs build-bootstrap-ions.py if the source dir is a repo working tree
		//      (i.e. installer/ions/ exists next to installer/native/ionpump/).
		//   2. Runs `ion-pump reconcile` against the deployed manifest (--force-swap).
		//   3. Runs `ion-pump verify` to confirm integrity.
		//
		// This makes `metamorph rollout --only ionpump` the single command needed to
		// go from repo source to a fully deployed and verified ionsites/ directory.
		Key: "ionpump",
		SourceFn: func(r string) string {
			return filepath.Join(r, "installer", "native", "ionpump")
		},
		DestFn: func(b string) string { return filepath.Join(b, "bin", "cortex", "ionpump") },
		PostDeployFn: ionpumpPostDeploy,
	},
	{
		Key: "node",
		SourceFn: func(r string) string {
			return filepath.Join(r, "vendors", "node", runtime.GOOS, exe("node"))
		},
		DestFn: func(b string) string { return filepath.Join(b, "bin", "node") },
	},
	{
		Key: "hook",
		SourceFn: func(r string) string {
			if runtime.GOOS == "darwin" {
				return filepath.Join(r, "installer", "native", "bin", "darwin_x64", "hook")
			}
			return filepath.Join(r, "hook", "dist", exe("hook"))
		},
		DestFn: func(b string) string { return filepath.Join(b, "bin", "hook") },
	},
	{
		Key:      "config",
		SourceFn: func(r string) string { return filepath.Join(r, "config") },
		DestFn:   func(b string) string { return filepath.Join(b, "config") },
	},
	{
		Key: "nssm",
		SourceFn: func(r string) string {
			return filepath.Join(r, "vendors", "nssm", "nssm.exe")
		},
		DestFn:    func(b string) string { return filepath.Join(b, "bin", "nssm") },
		Platforms: []string{"windows"},
	},
	{
		Key: "bootstrap",
		SourceFn: func(r string) string {
			if runtime.GOOS == "darwin" {
				return filepath.Join(r, "installer", "native", "bin", "bootstrap")
			}
			return filepath.Join(r, "bootstrap", "dist", "bootstrap.exe")
		},
		DestFn:    func(b string) string { return filepath.Join(b, "bin", "bootstrap") },
		Platforms: []string{"windows", "darwin"},
	},
	{
		Key: "vsix",
		SourceFn: func(r string) string {
			// r is the root of the bloom-development-extension repo itself,
			// so the .vsix lives directly at <r>/installer/vscode/.
			return filepath.Join(r, "installer", "vscode", "bloom-extension.vsix")
		},
		DestFn: func(b string) string { return filepath.Join(b, "bin", "vscode") },
		// No Platforms filter — the VS Code extension is deployed on all supported OSes.
		PostDeployFn: vsixPostDeploy,
	},
}

// ─────────────────────────────────────────────────────────────────────────────
// vsix post-deploy hook
// ─────────────────────────────────────────────────────────────────────────────

// vsixPostDeploy installs the staged bloom-extension.vsix into VS Code using
// the `code` CLI. It is non-critical: any failure is logged as a warning and
// the rollout continues — the .vsix file is already in place and the user can
// install it manually if needed.
//
// Resolution order for the `code` CLI:
//  1. `code` on PATH  (works on Windows, Linux, and macOS when Shell Command is installed)
//  2. macOS fallback: /Applications/Visual Studio Code.app/Contents/Resources/app/bin/code
func vsixPostDeploy(c *core.Core, repoRoot, dst string, dryRun bool) error {
	vsixPath := filepath.Join(dst, "bloom-extension.vsix")

	codeCLI, err := resolveCodeCLI()
	if err != nil {
		c.Logger.Warning("⚠️  vsix: VS Code CLI not found — extension staged at %s but not installed: %v", vsixPath, err)
		return nil // non-critical
	}

	args := []string{"--install-extension", vsixPath, "--force"}

	if dryRun {
		c.Logger.Info("🔍 [dry-run] vsix: would run: %s %s", codeCLI, strings.Join(args, " "))
		return nil
	}

	c.Logger.Info("🧩 Installing VS Code extension from %s ...", vsixPath)
	cmd := exec.Command(codeCLI, args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		// Non-critical: log and continue.
		c.Logger.Warning("⚠️  vsix: installation returned an error (non-critical): %v", err)
		c.Logger.Warning("    You can install manually: %s --install-extension %s --force", codeCLI, vsixPath)
		return nil
	}

	c.Logger.Info("✓ VS Code extension installed — active on next VS Code window")
	return nil
}

// resolveCodeCLI returns the path to the VS Code `code` CLI executable.
// It checks PATH first (covers Windows, Linux, and macOS with Shell Command installed),
// then falls back to the well-known macOS bundle location.
func resolveCodeCLI() (string, error) {
	if path, err := exec.LookPath("code"); err == nil {
		return path, nil
	}
	if runtime.GOOS == "darwin" {
		fallback := "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
		if _, err := os.Stat(fallback); err == nil {
			return fallback, nil
		}
		return "", fmt.Errorf("'code' not found in PATH and VS Code bundle not found at /Applications/Visual Studio Code.app")
	}
	return "", fmt.Errorf("'code' not found in PATH — ensure VS Code is installed and 'code' is in PATH")
}

// ─────────────────────────────────────────────────────────────────────────────
// ionpump post-deploy hook
// ─────────────────────────────────────────────────────────────────────────────

// ionpumpPostDeploy is called by runRollout after installer/native/ionpump/ has
// been successfully copied to $AppData/bin/cortex/ionpump/. It:
//
//  1. Re-runs build-bootstrap-ions.py if the installer/ions/ source tree is
//     present in the repo (dev/CI context). This ensures the deployed manifest
//     and ZIPs always reflect the latest ion source files.
//
//  2. Locates bootstrap-ions.json in the deployed ionpump directory and runs
//     `ion-pump reconcile --manifest <path> --force-swap` via a self-exec call
//     so the reconcile logic runs inside the same binary (no external dependency).
//
//  3. Runs `ion-pump verify` to confirm every deployed ion passes integrity
//     checks. A verify failure is logged as a warning but does NOT fail the
//     rollout — the files are already in place and Brain can still use them.
func ionpumpPostDeploy(c *core.Core, repoRoot, dst string, dryRun bool) error {
	// ── Step 1: rebuild bootstrap artefacts if working in a repo tree ──────
	buildScript := filepath.Join(repoRoot, "installer", "metamorph", "scripts", "build-bootstrap-ions.py")
	ionsSourceDir := filepath.Join(repoRoot, "installer", "ions")

	if _, err := os.Stat(buildScript); err == nil {
		if _, err := os.Stat(ionsSourceDir); err == nil {
			c.Logger.Info("🔨 Building bootstrap ion packages from source...")
			if dryRun {
				c.Logger.Info("🔍 [dry-run] would run: python %s", buildScript)
			} else {
				python, err := resolvePython()
				if err != nil {
					return fmt.Errorf("ionpump build: %w", err)
				}
				cmd := exec.Command(python, buildScript)
				cmd.Dir = repoRoot
				cmd.Stdout = os.Stdout
				cmd.Stderr = os.Stderr
				if err := cmd.Run(); err != nil {
					return fmt.Errorf("ionpump build: build-bootstrap-ions.py failed: %w", err)
				}
				c.Logger.Info("✓ Ion packages built successfully")
			}
		} else {
			c.Logger.Info("ℹ️  No installer/ions/ source tree found — skipping build step")
		}
	} else {
		c.Logger.Info("ℹ️  No build-bootstrap-ions.py found — skipping build step")
	}

	// ── Step 2: locate bootstrap-ions.json in the deployed destination ─────
	manifestPath := filepath.Join(dst, "bootstrap-ions.json")
	if _, err := os.Stat(manifestPath); err != nil {
		return fmt.Errorf("ionpump reconcile: bootstrap-ions.json not found at %s after copy — "+
			"ensure build-bootstrap-ions.py ran and produced the manifest", manifestPath)
	}

	// ── Step 3: reconcile ──────────────────────────────────────────────────
	c.Logger.Info("🔄 Reconciling ion sites against %s ...", manifestPath)
	reconcileArgs := []string{"ion-pump", "reconcile", "--manifest", manifestPath, "--force-swap"}
	if dryRun {
		reconcileArgs = append(reconcileArgs, "--dry-run")
	}
	if err := selfExec(c, reconcileArgs...); err != nil {
		return fmt.Errorf("ionpump reconcile failed: %w", err)
	}

	// ── Step 4: verify ─────────────────────────────────────────────────────
	c.Logger.Info("🔍 Verifying installed ion integrity...")
	if err := selfExec(c, "ion-pump", "verify"); err != nil {
		// Verify failure is non-fatal: files are deployed, Brain can use them.
		// The operator is warned and can investigate manually.
		c.Logger.Warning("⚠️  Ion integrity verification reported issues — run 'metamorph ion-pump verify' for details")
	}

	return nil
}

// selfExec re-invokes the current metamorph binary with the given arguments,
// inheriting stdout/stderr so output appears inline with the rollout log.
func selfExec(c *core.Core, args ...string) error {
	self, err := os.Executable()
	if err != nil {
		return fmt.Errorf("cannot resolve current executable: %w", err)
	}
	cmd := exec.Command(self, args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

// resolvePython finds a usable Python 3 interpreter in the following order:
//  1. BLOOM_PYTHON env var (explicit override)
//  2. "python3" on PATH
//  3. "python" on PATH (Windows typically)
func resolvePython() (string, error) {
	if p := os.Getenv("BLOOM_PYTHON"); p != "" {
		return p, nil
	}
	for _, candidate := range []string{"python3", "python"} {
		if path, err := exec.LookPath(candidate); err == nil {
			return path, nil
		}
	}
	return "", fmt.Errorf("no Python interpreter found (tried python3, python) — " +
		"set BLOOM_PYTHON to the interpreter path")
}

// ─────────────────────────────────────────────────────────────────────────────
// Component registry helpers
// ─────────────────────────────────────────────────────────────────────────────

func activeComponents() []component {
	result := make([]component, 0, len(allComponents))
	for _, c := range allComponents {
		if len(c.Platforms) == 0 {
			result = append(result, c)
			continue
		}
		for _, p := range c.Platforms {
			if p == runtime.GOOS {
				result = append(result, c)
				break
			}
		}
	}
	return result
}

func componentKeys() string {
	comps := activeComponents()
	keys := make([]string, len(comps))
	for i, c := range comps {
		keys[i] = c.Key
	}
	return strings.Join(keys, ", ")
}

// ─────────────────────────────────────────────────────────────────────────────
// Command
// ─────────────────────────────────────────────────────────────────────────────

func createRolloutCommand(c *core.Core) *cobra.Command {
	var dryRun bool
	var only string

	cmd := &cobra.Command{
		Use:   "rollout [--only <component>] [--dry-run]",
		Short: "Deploy built binaries from repo to AppData",
		Long: `Copies compiled binaries from the repository build output into the
BloomNucleus AppData directory so the running system picks them up.

Use --dry-run to preview what would be copied without making changes.
Use --only to deploy a single component instead of everything.

The 'ionpump' component is special: after copying the bundled ZIPs and manifest,
it automatically runs the full deploy pipeline:
  1. build-bootstrap-ions.py  (if installer/ions/ source tree is present)
  2. ion-pump reconcile        (atomic swap into ionsites/)
  3. ion-pump verify           (SHA-256 integrity check)`,

		Annotations: map[string]string{
			"category": "MAINTENANCE",
			"json_response": `{
  "status": "success",
  "dry_run": false,
  "only": "",
  "repo_root": "...",
  "deployed": [
    {"component": "Brain",   "source": "...", "destination": "...", "files_copied": 1},
    {"component": "Nucleus", "source": "...", "destination": "...", "files_copied": 1}
  ],
  "skipped": [],
  "errors": []
}`,
		},

		Example: `  metamorph rollout
  metamorph rollout --dry-run
  metamorph rollout --only brain
  metamorph rollout --only ionpump
  metamorph rollout --only ionpump --dry-run
  metamorph --json rollout --only nucleus`,

		RunE: func(cmd *cobra.Command, args []string) error {
			return runRollout(c, dryRun, only)
		},
	}

	cmd.Flags().BoolVar(&dryRun, "dry-run", false, "Preview what would be copied without making changes")
	cmd.Flags().StringVar(&only, "only", "", "Deploy a single component instead of all ("+componentKeys()+")")

	return cmd
}

// ─────────────────────────────────────────────────────────────────────────────
// Result types
// ─────────────────────────────────────────────────────────────────────────────

type deployedEntry struct {
	Component   string `json:"component"`
	Source      string `json:"source"`
	Destination string `json:"destination"`
	FilesCopied int    `json:"files_copied"`
}

type rolloutResult struct {
	Status   string          `json:"status"`
	DryRun   bool            `json:"dry_run"`
	Only     string          `json:"only"`
	RepoRoot string          `json:"repo_root"`
	Deployed []deployedEntry `json:"deployed"`
	Skipped  []string        `json:"skipped"`
	Errors   []string        `json:"errors"`
}

// ─────────────────────────────────────────────────────────────────────────────
// Core rollout logic
// ─────────────────────────────────────────────────────────────────────────────

func runRollout(c *core.Core, dryRun bool, only string) error {
	basePath := core.GetBaseAppDataPath()

	repoRoot, err := resolveRepoRoot()
	if err != nil {
		return fmt.Errorf("cannot determine repo root: %w\n\nHint: set BLOOM_REPO_ROOT to the repository root directory, e.g.:\n  export BLOOM_REPO_ROOT=$(pwd)", err)
	}

	// Validate that the resolved root looks like a real directory.
	if info, statErr := os.Stat(repoRoot); statErr != nil || !info.IsDir() {
		return fmt.Errorf("resolved repo root %q does not exist or is not a directory\n\nHint: set BLOOM_REPO_ROOT to the repository root directory, e.g.:\n  export BLOOM_REPO_ROOT=$(pwd)", repoRoot)
	}

	c.Logger.Info("📁 repo root: %s", repoRoot)

	comps := activeComponents()

	if only != "" {
		found := false
		for _, comp := range comps {
			if comp.Key == only {
				comps = []component{comp}
				found = true
				break
			}
		}
		if !found {
			return fmt.Errorf("unknown component %q for platform %s — valid: %s", only, runtime.GOOS, componentKeys())
		}
	}

	result := rolloutResult{
		Status:   "success",
		DryRun:   dryRun,
		Only:     only,
		RepoRoot: repoRoot,
		Deployed: []deployedEntry{},
		Skipped:  []string{},
		Errors:   []string{},
	}

	for _, comp := range comps {
		src := comp.SourceFn(repoRoot)
		dst := comp.DestFn(basePath)

		info, err := os.Stat(src)
		if err != nil {
			msg := fmt.Sprintf("%s: source not found at %s", comp.Key, src)
			c.Logger.Warning("⚠️  %s", msg)
			result.Skipped = append(result.Skipped, msg)
			continue
		}

		if dryRun {
			c.Logger.Info("🔍 [dry-run] %s: %s → %s", comp.Key, src, dst)
			result.Deployed = append(result.Deployed, deployedEntry{
				Component:   titleCase(comp.Key),
				Source:      src,
				Destination: dst,
				FilesCopied: 0,
			})
			// Still run PostDeployFn in dry-run mode so it can log what it would do.
			if comp.PostDeployFn != nil {
				if err := comp.PostDeployFn(c, repoRoot, dst, true); err != nil {
					msg := fmt.Sprintf("%s: post-deploy (dry-run) error: %v", comp.Key, err)
					c.Logger.Warning("⚠️  %s", msg)
				}
			}
			continue
		}

		if err := os.MkdirAll(dst, 0o755); err != nil {
			msg := fmt.Sprintf("%s: could not create destination %s: %v", comp.Key, dst, err)
			c.Logger.Error("❌ %s", msg)
			result.Errors = append(result.Errors, msg)
			result.Status = "partial"
			continue
		}

		var copied int
		if info.IsDir() {
			copied, err = copyDir(src, dst)
		} else {
			err = copyFile(src, filepath.Join(dst, filepath.Base(src)))
			if err == nil {
				copied = 1
			}
		}
		if err != nil {
			msg := fmt.Sprintf("%s: copy failed: %v", comp.Key, err)
			c.Logger.Error("❌ %s", msg)
			result.Errors = append(result.Errors, msg)
			result.Status = "partial"
			continue
		}

		c.Logger.Success("✅ %s: %d file(s) → %s", titleCase(comp.Key), copied, dst)
		result.Deployed = append(result.Deployed, deployedEntry{
			Component:   titleCase(comp.Key),
			Source:      src,
			Destination: dst,
			FilesCopied: copied,
		})

		// Run optional post-deploy hook (e.g. ionpump reconcile + verify).
		if comp.PostDeployFn != nil {
			if err := comp.PostDeployFn(c, repoRoot, dst, false); err != nil {
				msg := fmt.Sprintf("%s: post-deploy failed: %v", comp.Key, err)
				c.Logger.Error("❌ %s", msg)
				result.Errors = append(result.Errors, msg)
				result.Status = "partial"
			}
		}
	}

	if len(result.Errors) > 0 {
		result.Status = "partial"
	}

	if c.Config.OutputJSON {
		c.OutputJSON(result)
		return nil
	}

	if !dryRun {
		fmt.Printf("\nRollout complete — %d deployed, %d skipped, %d errors\n",
			len(result.Deployed), len(result.Skipped), len(result.Errors))
	}
	return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// Repo root resolution
// ─────────────────────────────────────────────────────────────────────────────

// resolveRepoRoot resolves the repository root from multiple sources in priority order.
// It returns an error only when all sources are exhausted or produce an empty path,
// ensuring filepath.Join never receives an empty string (which would produce a
// root-relative path like /installer/... instead of ./installer/...).
//
// Resolution order:
//
//  1. BLOOM_REPO_ROOT env var — explicit CI / local override.
//  2. nucleus.json installation.origin_path — canonical production source of truth.
//     origin_path points to installer/native/bin/<platform>/<component>; walking up
//     5 levels yields the repo root. Mirrors the logic in
//     internal/supervisor/dev_start.go:getBloomDir().
//  3. BLOOM_DIR env var — legacy fallback used by dev_start.go.
//  4. Current working directory — automatic fallback when running from inside
//     the repo tree (the common developer workflow).
func resolveRepoRoot() (string, error) {
	// 1. Explicit override — highest priority, no validation needed here.
	if r := strings.TrimSpace(os.Getenv("BLOOM_REPO_ROOT")); r != "" {
		return filepath.Clean(r), nil
	}

	// 2. nucleus.json origin_path — walk up 5 levels from the binary location.
	nucleusJSON := filepath.Join(core.GetBaseAppDataPath(), "config", "nucleus.json")
	if data, err := os.ReadFile(nucleusJSON); err == nil {
		var cfg struct {
			Installation struct {
				OriginPath string `json:"origin_path"`
			} `json:"installation"`
		}
		if json.Unmarshal(data, &cfg) == nil {
			if p := strings.TrimSpace(cfg.Installation.OriginPath); p != "" {
				for i := 0; i < 5; i++ {
					p = filepath.Dir(p)
				}
				if p != "" && p != "." && p != string(filepath.Separator) {
					return filepath.Clean(p), nil
				}
			}
		}
	}

	// 3. Legacy BLOOM_DIR env var.
	if r := strings.TrimSpace(os.Getenv("BLOOM_DIR")); r != "" {
		return filepath.Clean(r), nil
	}

	// 4. Current working directory — safe fallback for interactive dev use.
	if cwd, err := os.Getwd(); err == nil && cwd != "" {
		return cwd, nil
	}

	return "", fmt.Errorf("all resolution strategies exhausted (BLOOM_REPO_ROOT, nucleus.json, BLOOM_DIR, os.Getwd)")
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

func titleCase(s string) string {
	if len(s) == 0 {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	inInfo, err := in.Stat()
	if err != nil {
		return err
	}

	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, inInfo.Mode())
	if err != nil {
		return err
	}
	defer out.Close()

	if _, err = io.Copy(out, in); err != nil {
		return err
	}
	return out.Sync()
}

func copyDir(src, dst string) (int, error) {
	count := 0
	// filepath.Walk does not follow symlinks but reports them with lstat info.
	// Electron .app bundles contain many symlinks inside Frameworks — we must
	// preserve them instead of trying to open them as regular files.
	err := filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		target := filepath.Join(dst, rel)

		// Use Lstat to reliably detect symlinks.
		linfo, lerr := os.Lstat(path)
		if lerr != nil {
			return lerr
		}

		if linfo.Mode()&os.ModeSymlink != 0 {
			linkTarget, lerr := os.Readlink(path)
			if lerr != nil {
				return lerr
			}
			_ = os.Remove(target)
			if err := os.Symlink(linkTarget, target); err != nil {
				return err
			}
			count++
			return nil
		}

		if linfo.IsDir() {
			return os.MkdirAll(target, linfo.Mode())
		}

		if err := copyFile(path, target); err != nil {
			return err
		}
		count++
		return nil
	})
	return count, err
}
