package maintenance

import (
	"archive/tar"
	"archive/zip"
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
	// ExtractFn, when non-nil, is called instead of copyFile/copyDir.
	// src is the source archive path; dstDir is the destination directory.
	ExtractFn func(src, dstDir string) error
	Platforms []string
}

func exe(name string) string { return core.ExeName(name) }

func isARM64() bool { return runtime.GOARCH == "arm64" }

// nativePlatformDir resolves the subdirectory of native/bin/ by OS + ARCH.
func nativePlatformDir() string {
	switch runtime.GOOS {
	case "windows":
		return "win64"
	case "darwin":
		if runtime.GOARCH == "arm64" {
			return "darwin_arm64"
		}
		return "darwin_x64"
	case "linux":
		if runtime.GOARCH == "arm64" {
			return "linux_arm64"
		}
		return "linux_x64"
	}
	return runtime.GOOS
}

// nativeBin builds the source path inside installer/native/bin/{platform}/{comp}/
func nativeBin(r, comp string) string {
	return filepath.Join(r, "installer", "native", "bin", nativePlatformDir(), comp)
}

var allComponents = []component{
	{
		Key: "brain",
		SourceFn: func(r string) string {
			return nativeBin(r, "brain")
		},
		DestFn: func(b string) string { return filepath.Join(b, "bin", "brain") },
	},
	{
		Key: "nucleus",
		SourceFn: func(r string) string {
			return nativeBin(r, "nucleus")
		},
		DestFn: func(b string) string { return filepath.Join(b, "bin", "nucleus") },
	},
	{
		Key: "sentinel",
		SourceFn: func(r string) string {
			return nativeBin(r, "sentinel")
		},
		DestFn: func(b string) string { return filepath.Join(b, "bin", "sentinel") },
	},
	{
		Key: "metamorph",
		SourceFn: func(r string) string {
			return nativeBin(r, "metamorph")
		},
		DestFn: func(b string) string { return filepath.Join(b, "bin", "metamorph") },
	},
	{
		Key: "host",
		SourceFn: func(r string) string {
			return nativeBin(r, "host")
		},
		DestFn: func(b string) string { return filepath.Join(b, "bin", "host") },
	},
	{
		Key: "workspace",
		SourceFn: func(r string) string {
			switch runtime.GOOS {
			case "windows":
				return filepath.Join(r, "installer", "native", "bin", "win64", "workspace", "bloom-workspace.exe")
			case "darwin":
				subdir := "mac"
				if isARM64() {
					subdir = "mac-arm64"
				}
				return filepath.Join(r, "installer", "native", "bin", "darwin_x64", "workspace", subdir, "bloom-workspace.app")
			default: // linux
				return filepath.Join(nativeBin(r, "workspace"), "linux-unpacked")
			}
		},
		DestFn: func(b string) string { return filepath.Join(b, "bin", "workspace") },
	},
	{
		Key: "setup",
		SourceFn: func(r string) string {
			switch runtime.GOOS {
			case "windows":
				return filepath.Join(r, "installer", "native", "bin", "win64", "setup", "bloom-setup.exe")
			case "darwin":
				subdir := "mac"
				if isARM64() {
					subdir = "mac-arm64"
				}
				return filepath.Join(r, "installer", "native", "bin", "darwin_x64", "setup", subdir, "bloom-setup.app")
			default: // linux
				return filepath.Join(nativeBin(r, "setup"), "linux-unpacked")
			}
		},
		DestFn: func(b string) string { return filepath.Join(b, "bin", "setup") },
	},
	{
		// sensor source must point to the component directory (not the binary
		// directly) so that subdirectories such as help/ are copied alongside
		// the executable.  runRollout detects a directory and calls copyDir.
		Key: "sensor",
		SourceFn: func(r string) string {
			return nativeBin(r, "sensor")
		},
		DestFn: func(b string) string { return filepath.Join(b, "bin", "sensor") },
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
		DestFn:       func(b string) string { return filepath.Join(b, "bin", "cortex", "ionpump") },
		PostDeployFn: ionpumpPostDeploy,
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
	{
		Key:      "bootstrap",
		SourceFn: func(r string) string { return filepath.Join(r, "installer", "native", "bin", "bootstrap") },
		DestFn:   func(b string) string { return filepath.Join(b, "bin", "bootstrap") },
		Platforms: []string{"windows", "darwin"},
	},
	{
		Key:      "hooks",
		SourceFn: func(r string) string { return filepath.Join(r, "installer", "native", "hooks") },
		DestFn:   func(b string) string { return filepath.Join(b, "hooks") },
	},
	{
		Key:      "config",
		SourceFn: func(r string) string { return filepath.Join(r, "config") },
		DestFn:   func(b string) string { return filepath.Join(b, "config") },
	},
	{
		Key: "nssm",
		SourceFn: func(r string) string {
			return filepath.Join(r, "installer", "native", "bin", "win64", "nssm", "nssm.exe")
		},
		DestFn:    func(b string) string { return filepath.Join(b, "bin", "nssm") },
		Platforms: []string{"windows"},
	},
	// ── Generic components ──────────────────────────────────────────────────
	{
		Key: "ollama",
		SourceFn: func(r string) string {
			switch runtime.GOOS {
			case "windows":
				return filepath.Join(r, "installer", "ollama", "windows", "ollama.exe")
			case "darwin":
				return filepath.Join(r, "installer", "ollama", "darwin", "ollama")
			default:
				return filepath.Join(r, "installer", "ollama", "linux", "ollama")
			}
		},
		DestFn: func(b string) string { return filepath.Join(b, "bin", "ollama") },
		PostDeployFn: func(c *core.Core, repoRoot, dst string, dryRun bool) error {
			if runtime.GOOS == "windows" {
				return nil
			}
			target := filepath.Join(dst, "ollama")
			if runtime.GOOS == "windows" {
				target = filepath.Join(dst, "ollama.exe")
			}
			if dryRun {
				c.Logger.Info("🔍 [dry-run] ollama: would chmod 0755 %s", target)
				return nil
			}
			return os.Chmod(target, 0o755)
		},
	},
	{
		Key: "temporal",
		SourceFn: func(r string) string {
			switch runtime.GOOS {
			case "windows":
				return filepath.Join(r, "installer", "temporal", "win64", "temporal.exe")
			case "darwin":
				return filepath.Join(r, "installer", "temporal", "darwin", "temporal")
			default:
				return filepath.Join(r, "installer", "temporal", "linux", "temporal")
			}
		},
		DestFn: func(b string) string { return filepath.Join(b, "bin", "temporal") },
		PostDeployFn: func(c *core.Core, repoRoot, dst string, dryRun bool) error {
			if runtime.GOOS == "windows" {
				return nil
			}
			target := filepath.Join(dst, "temporal")
			if dryRun {
				c.Logger.Info("🔍 [dry-run] temporal: would chmod 0755 %s", target)
				return nil
			}
			return os.Chmod(target, 0o755)
		},
	},
	{
		// node ships as a pre-extracted binary in the repo on all platforms.
		// The tar.xz mentioned in earlier documentation was the upstream
		// download artefact; it was already unpacked before being committed.
		// Conductor simply copies the binary and ensures it is executable on Linux.
		Key: "node",
		SourceFn: func(r string) string {
			switch runtime.GOOS {
			case "windows":
				return filepath.Join(r, "installer", "node", "win64", "node.exe")
			case "darwin":
				return filepath.Join(r, "installer", "node", "darwin", "node")
			default: // linux
				return filepath.Join(r, "installer", "node", "linux_x64", "node")
			}
		},
		DestFn: func(b string) string { return filepath.Join(b, "bin", "node") },
		PostDeployFn: func(_ *core.Core, _, dst string, dryRun bool) error {
			if runtime.GOOS != "linux" {
				return nil
			}
			if dryRun {
				return nil
			}
			return os.Chmod(filepath.Join(dst, "node"), 0o755)
		},
	},
	{
		Key: "runtime",
		SourceFn: func(r string) string {
			switch runtime.GOOS {
			case "windows":
				return filepath.Join(r, "installer", "resources", "runtime-windows")
			case "darwin":
				return filepath.Join(r, "installer", "resources", "runtime-darwin")
			default:
				return filepath.Join(r, "installer", "resources", "runtime-linux")
			}
		},
		DestFn: func(b string) string { return filepath.Join(b, "bin", "engine", "runtime") },
	},
	{
		Key: "chrome",
		SourceFn: func(r string) string {
			switch runtime.GOOS {
			case "windows":
				return filepath.Join(r, "installer", "chrome", "chrome-win.zip")
			case "darwin":
				return filepath.Join(r, "installer", "chrome", "chrome-mac.zip")
			default:
				return filepath.Join(r, "installer", "chrome", "chrome-linux.tar.xz")
			}
		},
		DestFn: func(b string) string {
			switch runtime.GOOS {
			case "windows":
				return filepath.Join(b, "bin", "chrome-win")
			case "darwin":
				return filepath.Join(b, "bin", "chrome-mac")
			default:
				return filepath.Join(b, "bin", "chrome-linux")
			}
		},
		ExtractFn: func(src, dstDir string) error {
			// Clean destination for idempotency.
			if err := os.RemoveAll(dstDir); err != nil {
				return fmt.Errorf("chrome: clean dst: %w", err)
			}
			tmp, err := os.MkdirTemp("", "chrome-extract-*")
			if err != nil {
				return fmt.Errorf("chrome: mktemp: %w", err)
			}
			defer os.RemoveAll(tmp)

			if strings.HasSuffix(src, ".tar.xz") {
				if err := extractTarXz(src, tmp); err != nil {
					return fmt.Errorf("chrome: extractTarXz: %w", err)
				}
			} else {
				if err := extractZip(src, tmp); err != nil {
					return fmt.Errorf("chrome: extractZip: %w", err)
				}
			}

			// Flatten single top-level directory if present.
			entries, err := os.ReadDir(tmp)
			if err != nil {
				return fmt.Errorf("chrome: readdir tmp: %w", err)
			}
			srcDir := tmp
			if len(entries) == 1 && entries[0].IsDir() {
				srcDir = filepath.Join(tmp, entries[0].Name())
			}

			if err := os.MkdirAll(dstDir, 0o755); err != nil {
				return fmt.Errorf("chrome: mkdirall dst: %w", err)
			}
			if _, err := copyDir(srcDir, dstDir); err != nil {
				return fmt.Errorf("chrome: copyDir: %w", err)
			}
			return chromePostExtract(dstDir)
		},
		PostDeployFn: func(c *core.Core, repoRoot, dst string, dryRun bool) error {
			// Permissions are applied inside ExtractFn; nothing extra needed here.
			return nil
		},
	},
}

// chromePostExtract applies platform-specific permissions after extraction.
func chromePostExtract(dst string) error {
	switch runtime.GOOS {
	case "darwin":
		main := filepath.Join(dst, "Chromium.app", "Contents", "MacOS", "Chromium")
		if err := os.Chmod(main, 0o755); err != nil && !os.IsNotExist(err) {
			return err
		}
		helpersDir := filepath.Join(dst, "Chromium.app", "Contents", "Helpers")
		entries, _ := os.ReadDir(helpersDir)
		for _, e := range entries {
			_ = os.Chmod(filepath.Join(helpersDir, e.Name()), 0o755)
		}
	case "linux":
		// chmod 0755 the main executable (first non-directory file named 'chrome' or 'chromium').
		_ = filepath.Walk(dst, func(p string, fi os.FileInfo, err error) error {
			if err != nil || fi.IsDir() {
				return err
			}
			name := filepath.Base(p)
			if name == "chrome" || name == "chromium" {
				_ = os.Chmod(p, 0o755)
			}
			return nil
		})
		// chrome-sandbox requires setuid root.
		sandbox := filepath.Join(dst, "chrome-sandbox")
		if _, err := os.Stat(sandbox); err == nil {
			if err := os.Chown(sandbox, 0, 0); err != nil {
				// Non-fatal: log via stderr and document --no-sandbox.
				fmt.Fprintf(os.Stderr, "⚠️  chrome: chown chrome-sandbox failed (run as root or use --no-sandbox): %v\n", err)
			} else {
				_ = os.Chmod(sandbox, 0o4755)
			}
		}
	}
	return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// Extraction helpers
// ─────────────────────────────────────────────────────────────────────────────

// extractZip extracts a ZIP archive to dstDir, preserving internal structure.
func extractZip(src, dstDir string) error {
	fi, err := os.Stat(src)
	if err != nil {
		return fmt.Errorf("extractZip: stat %s: %w", src, err)
	}
	const minSize = 50 * 1024 * 1024 // 50 MB sanity check
	if fi.Size() < minSize {
		return fmt.Errorf("extractZip: %s is suspiciously small (%d bytes, expected >50 MB)", src, fi.Size())
	}

	r, err := zip.OpenReader(src)
	if err != nil {
		return fmt.Errorf("extractZip: open %s: %w", src, err)
	}
	defer r.Close()

	for _, f := range r.File {
		target := filepath.Join(dstDir, filepath.FromSlash(f.Name))
		// Guard against zip-slip.
		if !strings.HasPrefix(target, filepath.Clean(dstDir)+string(os.PathSeparator)) {
			return fmt.Errorf("extractZip: illegal path %q", f.Name)
		}
		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(target, f.Mode()); err != nil {
				return err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		rc, err := f.Open()
		if err != nil {
			return err
		}
		out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, f.Mode())
		if err != nil {
			rc.Close()
			return err
		}
		_, copyErr := io.Copy(out, rc)
		rc.Close()
		out.Close()
		if copyErr != nil {
			return copyErr
		}
	}
	return nil
}

// extractTarXz extracts a .tar.xz archive to dstDir using the system tar command.
// Falls back to a pure-Go path using github.com/ulikunitz/xz if tar is unavailable.
func extractTarXz(src, dstDir string) error {
	// Try the system tar first — it's faster and handles edge cases well.
	if path, err := exec.LookPath("tar"); err == nil {
		cmd := exec.Command(path, "-xJf", src, "-C", dstDir)
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		if err := cmd.Run(); err != nil {
			return fmt.Errorf("extractTarXz: tar: %w", err)
		}
		return nil
	}

	// Pure-Go fallback using archive/tar with a raw xz reader.
	// This requires github.com/ulikunitz/xz; if not linked it will fail at
	// compile time and the operator should add the dependency.
	f, err := os.Open(src)
	if err != nil {
		return fmt.Errorf("extractTarXz: open %s: %w", src, err)
	}
	defer f.Close()

	// NOTE: import "github.com/ulikunitz/xz" must be added to go.mod.
	// xzReader, err := xz.NewReader(f)
	// if err != nil { return err }
	// tr := tar.NewReader(xzReader)
	//
	// For now we surface a clear error rather than silently fail.
	_ = tar.NewReader(f) // keep archive/tar imported
	return fmt.Errorf("extractTarXz: system 'tar' not found and pure-Go xz fallback not linked; add github.com/ulikunitz/xz to go.mod")
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

// componentKeysDetailed returns the full component list for --help display,
// including platform restrictions for components that are not cross-platform.
// This is consumed by the --only flag usage string so help_renderer shows
// every valid value with its platform note inline.
func componentKeysDetailed() string {
	var lines []string
	for _, comp := range allComponents {
		entry := comp.Key
		if len(comp.Platforms) > 0 {
			entry += " [" + strings.Join(comp.Platforms, ", ") + " only]"
		}
		lines = append(lines, entry)
	}
	return strings.Join(lines, ", ")
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
  metamorph rollout --only nucleus
  metamorph rollout --only sentinel
  metamorph rollout --only metamorph
  metamorph rollout --only host
  metamorph rollout --only workspace
  metamorph rollout --only setup
  metamorph rollout --only sensor
  metamorph rollout --only cortex
  metamorph rollout --only ionpump
  metamorph rollout --only vsix
  metamorph rollout --only bootstrap
  metamorph rollout --only hooks
  metamorph rollout --only config
  metamorph rollout --only nssm
  metamorph rollout --only ollama
  metamorph rollout --only temporal
  metamorph rollout --only node
  metamorph rollout --only runtime
  metamorph rollout --only chrome
  metamorph rollout --only ionpump --dry-run
  metamorph --json rollout --only nucleus`,

		RunE: func(cmd *cobra.Command, args []string) error {
			return runRollout(c, dryRun, only)
		},
	}

	cmd.Flags().BoolVar(&dryRun, "dry-run", false, "Preview what would be copied without making changes")
	cmd.Flags().StringVar(&only, "only", "", "Deploy a single component instead of all. Valid values: "+componentKeysDetailed())

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
			// Check whether the component exists but is restricted to other
			// platforms, so we can give a more helpful error than "unknown".
			for _, comp := range allComponents {
				if comp.Key == only && len(comp.Platforms) > 0 {
					return fmt.Errorf("component %q is only supported on: %s (current platform: %s)",
						only, strings.Join(comp.Platforms, ", "), runtime.GOOS)
				}
			}
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
		if comp.ExtractFn != nil {
			// Archive-based component: delegate entirely to ExtractFn.
			err = comp.ExtractFn(src, dst)
			if err == nil {
				copied = 1 // treat the extracted tree as a single logical unit
			}
		} else if info.IsDir() {
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

	// Write to a temp file in the same directory, then rename over dst.
	// This avoids ETXTBSY on Linux when dst is a running executable (the
	// kernel keeps the old inode alive in memory; the rename replaces only
	// the directory entry). It also gives atomic replacement on all platforms:
	// readers never see a half-written file.
	dir := filepath.Dir(dst)
	tmp, err := os.CreateTemp(dir, ".rollout-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	// Best-effort cleanup if we return an error before the rename.
	defer func() { _ = os.Remove(tmpName) }()

	if err := tmp.Chmod(inInfo.Mode()); err != nil {
		tmp.Close()
		return err
	}
	if _, err = io.Copy(tmp, in); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	tmp.Close()

	return os.Rename(tmpName, dst)
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
