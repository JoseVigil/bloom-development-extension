package maintenance

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/bloom/metamorph/internal/core"
	"github.com/spf13/cobra"
)

func init() {
	core.RegisterCommand("MAINTENANCE", createRolloutCommand)
}

func createRolloutCommand(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "rollout",
		Short: "Deploy built binaries from repo to AppData",
		Long: `Copy all managed binaries from the local repository (native/bin/win64/)
to the BloomNucleus AppData directory, making them available at runtime.

This command resolves the canonical source path automatically based on
the location of metamorph.exe. It copies each component's full directory,
preserving subdirectories (help/, win-unpacked/, _internal/, etc.).

Components deployed:
  Brain, Nucleus, Sentinel, Metamorph, Conductor (+ win-unpacked),
  Host → native/, Cortex (.blx), Setup, NSSM

After rollout, 'metamorph inspect' is run automatically to update
%LOCALAPPDATA%\BloomNucleus\config\metamorph.json.

Use --dry-run to preview what would be copied without making changes.

Example:
  metamorph rollout
  metamorph rollout --dry-run
  metamorph --json rollout`,
		Annotations: map[string]string{
			"category": "MAINTENANCE",
			"json_response": `{
  "status": "success",
  "deployed": [
    {"component": "Brain",     "source": "...", "destination": "...", "files_copied": 12},
    {"component": "Nucleus",   "source": "...", "destination": "...", "files_copied": 4}
  ],
  "skipped": [],
  "errors": []
}`,
		},
		Example: `  metamorph rollout
  metamorph rollout --dry-run
  metamorph --json rollout`,
		RunE: func(cmd *cobra.Command, args []string) error {
			dryRun, _ := cmd.Flags().GetBool("dry-run")
			return runRollout(c, dryRun)
		},
	}

	cmd.Flags().Bool("dry-run", false, "Preview what would be copied without making changes")
	return cmd
}

// rolloutEntry maps a source path (relative to native/bin/<platform>/) to
// a destination path (relative to BloomNucleus/bin/).
// srcIsFile=true means only a single file is copied, not the whole directory.
type rolloutEntry struct {
	component  string
	src        string // relative to native/bin/win64/ (or native/ for nssm)
	dst        string // relative to BloomNucleus/bin/
	srcIsFile  bool   // copy single file instead of full directory
}

// getRolloutEntries returns the canonical source→destination mapping.
// Host lives in native/bin/win64/host/ but deploys to AppData bin/native/.
// Cortex is a single .blx file living one level up at native/bin/cortex/.
// NSSM lives at native/nssm/win64/ (outside the per-platform bin tree).
func getRolloutEntries() []rolloutEntry {
	return []rolloutEntry{
		{component: "Brain",     src: "brain",     dst: "brain"},
		{component: "Nucleus",   src: "nucleus",   dst: "nucleus"},
		{component: "Sentinel",  src: "sentinel",  dst: "sentinel"},
		{component: "Metamorph", src: "metamorph", dst: "metamorph"},
		{component: "Conductor", src: "conductor", dst: "conductor"},
		{component: "Setup",     src: "setup",     dst: "setup"},
		// Host folder is named "host" in repo but deploys to "native" in AppData
		{component: "Host",      src: "host",      dst: "native"},
	}
}

// rolloutResult holds the outcome of a single component deployment.
type rolloutResult struct {
	Component   string `json:"component"`
	Source      string `json:"source"`
	Destination string `json:"destination"`
	FilesCopied int    `json:"files_copied"`
}

// runRollout resolves paths and deploys all components.
func runRollout(c *core.Core, dryRun bool) error {
	repoBase, err := resolveRepoBase()
	if err != nil {
		return fmt.Errorf("could not resolve repository root: %w", err)
	}

	appDataBin, err := resolveAppDataBin()
	if err != nil {
		return fmt.Errorf("could not resolve AppData bin path: %w", err)
	}

	platform := resolvePlatform()
	nativeBinBase := filepath.Join(repoBase, "native", "bin", platform)
	nssmSrc := filepath.Join(repoBase, "native", "nssm", platform, "nssm.exe")
	cortexSrc := filepath.Join(repoBase, "native", "bin", "cortex", "bloom-cortex.blx")

	if dryRun {
		fmt.Println("[DRY RUN] No files will be written.")
		fmt.Println()
	}

	var deployed []rolloutResult
	var skipped []string
	var errors []string

	// Deploy standard per-platform components
	for _, entry := range getRolloutEntries() {
		src := filepath.Join(nativeBinBase, entry.src)
		dst := filepath.Join(appDataBin, entry.dst)

		if _, err := os.Stat(src); os.IsNotExist(err) {
			skipped = append(skipped, fmt.Sprintf("%s (source not found: %s)", entry.component, src))
			if !c.Config.OutputJSON {
				fmt.Printf("  ⚠  %-14s skipped — source not found\n", entry.component)
			}
			continue
		}

		count, err := copyDir(src, dst, dryRun)
		if err != nil {
			msg := fmt.Sprintf("%s: %v", entry.component, err)
			errors = append(errors, msg)
			if !c.Config.OutputJSON {
				fmt.Printf("  ✗  %-14s ERROR: %v\n", entry.component, err)
			}
			continue
		}

		deployed = append(deployed, rolloutResult{
			Component:   entry.component,
			Source:      src,
			Destination: dst,
			FilesCopied: count,
		})
		if !c.Config.OutputJSON {
			verb := "Deployed"
			if dryRun {
				verb = "Would deploy"
			}
			fmt.Printf("  ✔  %-14s %s → %s (%d files)\n", entry.component, verb, dst, count)
		}
	}

	// Deploy Cortex (.blx single file)
	{
		dst := filepath.Join(appDataBin, "cortex", "bloom-cortex.blx")
		if _, err := os.Stat(cortexSrc); os.IsNotExist(err) {
			skipped = append(skipped, "Cortex (source not found: "+cortexSrc+")")
			if !c.Config.OutputJSON {
				fmt.Printf("  ⚠  %-14s skipped — source not found\n", "Cortex")
			}
		} else {
			count, err := copySingleFile(cortexSrc, dst, dryRun)
			if err != nil {
				errors = append(errors, "Cortex: "+err.Error())
				if !c.Config.OutputJSON {
					fmt.Printf("  ✗  %-14s ERROR: %v\n", "Cortex", err)
				}
			} else {
				deployed = append(deployed, rolloutResult{
					Component:   "Cortex",
					Source:      cortexSrc,
					Destination: dst,
					FilesCopied: count,
				})
				if !c.Config.OutputJSON {
					verb := "Deployed"
					if dryRun {
						verb = "Would deploy"
					}
					fmt.Printf("  ✔  %-14s %s → %s\n", "Cortex", verb, dst)
				}
			}
		}
	}

	// Deploy NSSM (single file, outside the platform bin tree)
	{
		dst := filepath.Join(appDataBin, "nssm", "nssm.exe")
		if _, err := os.Stat(nssmSrc); os.IsNotExist(err) {
			skipped = append(skipped, "NSSM (source not found: "+nssmSrc+")")
			if !c.Config.OutputJSON {
				fmt.Printf("  ⚠  %-14s skipped — source not found\n", "NSSM")
			}
		} else {
			count, err := copySingleFile(nssmSrc, dst, dryRun)
			if err != nil {
				errors = append(errors, "NSSM: "+err.Error())
				if !c.Config.OutputJSON {
					fmt.Printf("  ✗  %-14s ERROR: %v\n", "NSSM", err)
				}
			} else {
				deployed = append(deployed, rolloutResult{
					Component:   "NSSM",
					Source:      nssmSrc,
					Destination: dst,
					FilesCopied: count,
				})
				if !c.Config.OutputJSON {
					verb := "Deployed"
					if dryRun {
						verb = "Would deploy"
					}
					fmt.Printf("  ✔  %-14s %s → %s\n", "NSSM", verb, dst)
				}
			}
		}
	}

	// Print summary
	status := "success"
	if len(errors) > 0 {
		status = "partial"
	}
	if len(deployed) == 0 {
		status = "failed"
	}

	if c.Config.OutputJSON {
		c.OutputJSON(map[string]interface{}{
			"status":   status,
			"dry_run":  dryRun,
			"deployed": deployed,
			"skipped":  skipped,
			"errors":   errors,
		})
	} else {
		fmt.Println()
		if dryRun {
			fmt.Printf("Dry run complete. %d components would be deployed.\n", len(deployed))
		} else {
			fmt.Printf("Rollout %s. %d components deployed", status, len(deployed))
			if len(skipped) > 0 {
				fmt.Printf(", %d skipped", len(skipped))
			}
			if len(errors) > 0 {
				fmt.Printf(", %d errors", len(errors))
			}
			fmt.Println(".")
		}
	}

	return nil
}

// resolveRepoBase walks up from the metamorph.exe location to find the repo root.
// Expected layout: <repo>/native/bin/win64/metamorph/metamorph.exe
// So we go up 4 levels from the exe dir.
func resolveRepoBase() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	// exe is at: <repo>/native/bin/<platform>/metamorph/metamorph.exe
	// Dir:       <repo>/native/bin/<platform>/metamorph/
	// Up 4:      <repo>/
	dir := filepath.Dir(exe)
	for i := 0; i < 4; i++ {
		dir = filepath.Dir(dir)
	}
	// Sanity check: native/ should exist here
	if _, err := os.Stat(filepath.Join(dir, "native")); os.IsNotExist(err) {
		return "", fmt.Errorf("could not find repo root from exe path %s (expected native/ at %s)", exe, dir)
	}
	return dir, nil
}

// resolveAppDataBin returns the path to BloomNucleus/bin in AppData.
func resolveAppDataBin() (string, error) {
	if home := os.Getenv("BLOOM_NUCLEUS_HOME"); home != "" {
		return filepath.Join(home, "bin"), nil
	}
	localAppData := os.Getenv("LOCALAPPDATA")
	if localAppData == "" {
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("could not determine home directory: %w", err)
		}
		localAppData = filepath.Join(homeDir, "AppData", "Local")
	}
	return filepath.Join(localAppData, "BloomNucleus", "bin"), nil
}

// resolvePlatform returns "win64" or "win32" based on the current architecture.
func resolvePlatform() string {
	if runtime.GOARCH == "amd64" {
		return "win64"
	}
	return "win32"
}

// copyDir recursively copies src directory into dst, creating dst if needed.
// Returns number of files copied.
func copyDir(src, dst string, dryRun bool) (int, error) {
	count := 0
	err := filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		// Compute destination path
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		target := filepath.Join(dst, rel)

		if info.IsDir() {
			if !dryRun {
				if err := os.MkdirAll(target, 0755); err != nil {
					return fmt.Errorf("mkdir %s: %w", target, err)
				}
			}
			return nil
		}

		// Skip macOS metadata files that might be in the repo
		base := filepath.Base(path)
		if strings.HasPrefix(base, "._") || base == ".DS_Store" {
			return nil
		}

		if !dryRun {
			if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
				return fmt.Errorf("mkdir %s: %w", filepath.Dir(target), err)
			}
			if err := copyFile(path, target); err != nil {
				return fmt.Errorf("copy %s: %w", path, err)
			}
		}
		count++
		return nil
	})
	return count, err
}

// copySingleFile copies one file to dst, creating parent directories as needed.
// Returns 1 on success for consistent counting.
func copySingleFile(src, dst string, dryRun bool) (int, error) {
	if !dryRun {
		if err := os.MkdirAll(filepath.Dir(dst), 0755); err != nil {
			return 0, fmt.Errorf("mkdir %s: %w", filepath.Dir(dst), err)
		}
		if err := copyFile(src, dst); err != nil {
			return 0, err
		}
	}
	return 1, nil
}

// copyFile copies a single file from src to dst atomically (write to .tmp, rename).
func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	info, err := in.Stat()
	if err != nil {
		return err
	}

	tmpDst := dst + ".tmp"
	out, err := os.OpenFile(tmpDst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, info.Mode())
	if err != nil {
		return err
	}

	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		os.Remove(tmpDst)
		return err
	}
	if err := out.Close(); err != nil {
		os.Remove(tmpDst)
		return err
	}

	if err := os.Rename(tmpDst, dst); err != nil {
		os.Remove(tmpDst)
		return err
	}
	return nil
}