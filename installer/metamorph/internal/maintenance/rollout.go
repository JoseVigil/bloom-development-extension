package maintenance

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/svc"
	"golang.org/x/sys/windows/svc/mgr"

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

			// Rollout requires administrator privileges to stop/start services.
			if !dryRun {
				if err := ensureElevated(); err != nil {
					return err
				}
			}

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
	origin, err := resolveOriginFromNucleusJSON()
	if err != nil {
		return fmt.Errorf("could not resolve origin path: %w", err)
	}

	appDataBin, err := resolveAppDataBin()
	if err != nil {
		return fmt.Errorf("could not resolve AppData bin path: %w", err)
	}

	// origin.Path already points to installer/native/bin/<platform>
	// e.g. C:\repos\bloom\installer\native\bin\win64
	nativeBinBase := origin.Path
	nssmSrc := filepath.Join(filepath.Dir(filepath.Dir(nativeBinBase)), "nssm", origin.Platform, "nssm.exe")
	cortexSrc := filepath.Join(filepath.Dir(nativeBinBase), "cortex", "bloom-cortex.blx")

	if !c.Config.OutputJSON {
		fmt.Printf("  Origin: %s (%s / %s)\n\n", origin.Path, origin.Type, origin.Platform)
	}

	if dryRun {
		fmt.Println("[DRY RUN] No files will be written.")
		fmt.Println()
	}

	var deployed []rolloutResult
	var skipped []string
	var errors []string

	// Stop managed services before deploying to avoid "Access is denied" on locked files.
	managedServices := []string{"BloomBrain", "BloomNucleusService"}
	if !dryRun {
		if !c.Config.OutputJSON {
			fmt.Println("  Stopping services...")
		}
		for _, svcName := range managedServices {
			if err := controlService(svcName, false); err != nil {
				if !c.Config.OutputJSON {
					fmt.Printf("  ⚠  %-20s could not stop: %v\n", svcName, err)
				}
			} else if !c.Config.OutputJSON {
				fmt.Printf("  ⏹  %-20s stopped\n", svcName)
			}
		}
		fmt.Println()
	}

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

		var count int
		if entry.component == "Metamorph" {
			// metamorph.exe is the running process — use rename+replace so Windows
			// doesn't block the copy. The .old file is cleaned up on next startup.
			count, err = copyDirWithSelfUpdate(src, dst, dryRun)
		} else {
			count, err = copyDir(src, dst, dryRun)
		}
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

	// Restart managed services after deployment.
	if !dryRun {
		if !c.Config.OutputJSON {
			fmt.Println()
			fmt.Println("  Starting services...")
		}
		for _, svcName := range managedServices {
			if err := controlService(svcName, true); err != nil {
				if !c.Config.OutputJSON {
					fmt.Printf("  ⚠  %-20s could not start: %v\n", svcName, err)
				}
				errors = append(errors, fmt.Sprintf("restart %s: %v", svcName, err))
			} else if !c.Config.OutputJSON {
				fmt.Printf("  ▶  %-20s started\n", svcName)
			}
		}
		fmt.Println()
	}

	// Clean up metamorph.exe.old left by the self-update rename+replace.
	// Done here (after deploy, with admin rights) using the known appDataBin path
	// so we don't rely on os.Executable() which can differ in an elevated process.
	if !dryRun {
		oldExe := filepath.Join(appDataBin, "metamorph", "metamorph.exe.old")
		if _, err := os.Stat(oldExe); err == nil {
			if removeErr := os.Remove(oldExe); removeErr == nil {
				if !c.Config.OutputJSON {
					fmt.Printf("  🗑  metamorph.exe.old removed\n")
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

// installationOrigin holds the relevant fields from nucleus.json installation block.
type installationOrigin struct {
	Path     string // installation.origin_path  — e.g. C:\repos\bloom\installer\native\bin\win64
	Type     string // installation.origin_type  — "local_repo" | "remote_release"
	Platform string // installation.origin_platform — "win64" | "win32"
}

// resolveOriginFromNucleusJSON reads %LOCALAPPDATA%\BloomNucleus\config\nucleus.json
// and returns the origin_path recorded by the installer.
// This is the canonical way to locate the binary source directory — the installer
// writes it at install time so no heuristics or env vars are needed at runtime.
func resolveOriginFromNucleusJSON() (*installationOrigin, error) {
	nucleusJSON, err := resolveNucleusJSONPath()
	if err != nil {
		return nil, err
	}

	data, err := os.ReadFile(nucleusJSON)
	if err != nil {
		return nil, fmt.Errorf("could not read nucleus.json at %s: %w", nucleusJSON, err)
	}

	var manifest struct {
		Installation struct {
			OriginPath     string `json:"origin_path"`
			OriginType     string `json:"origin_type"`
			OriginPlatform string `json:"origin_platform"`
		} `json:"installation"`
	}
	if err := json.Unmarshal(data, &manifest); err != nil {
		return nil, fmt.Errorf("could not parse nucleus.json: %w", err)
	}

	if manifest.Installation.OriginPath == "" {
		return nil, fmt.Errorf(
			"nucleus.json does not contain installation.origin_path — " +
				"re-run the installer to populate this field",
		)
	}

	// Verify the origin path actually exists on disk.
	if _, err := os.Stat(manifest.Installation.OriginPath); os.IsNotExist(err) {
		return nil, fmt.Errorf(
			"origin_path %q from nucleus.json does not exist on disk — "+
				"is the repository/release folder still present?",
			manifest.Installation.OriginPath,
		)
	}

	return &installationOrigin{
		Path:     manifest.Installation.OriginPath,
		Type:     manifest.Installation.OriginType,
		Platform: manifest.Installation.OriginPlatform,
	}, nil
}

// resolveNucleusJSONPath returns the canonical path to nucleus.json.
func resolveNucleusJSONPath() (string, error) {
	if home := os.Getenv("BLOOM_NUCLEUS_HOME"); home != "" {
		return filepath.Join(home, "config", "nucleus.json"), nil
	}
	localAppData := os.Getenv("LOCALAPPDATA")
	if localAppData == "" {
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("could not determine home directory: %w", err)
		}
		localAppData = filepath.Join(homeDir, "AppData", "Local")
	}
	return filepath.Join(localAppData, "BloomNucleus", "config", "nucleus.json"), nil
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
// Kept as fallback for contexts outside of rollout.
func resolvePlatform() string {
	if runtime.GOARCH == "amd64" {
		return "win64"
	}
	return "win32"
}

// ensureElevated checks if the process is running as administrator.
// If not, it re-launches itself with UAC elevation and exits the current process.
func ensureElevated() error {
	elevated, err := isElevated()
	if err != nil {
		return fmt.Errorf("could not check elevation status: %w", err)
	}
	if elevated {
		return nil
	}

	// Re-launch with elevation via ShellExecuteW "runas".
	exe, err := os.Executable()
	if err != nil {
		return fmt.Errorf("could not determine executable path: %w", err)
	}

	// Build the original args string to pass through.
	args := strings.Join(os.Args[1:], " ")

	verbPtr, _ := windows.UTF16PtrFromString("runas")
	exePtr, _ := windows.UTF16PtrFromString(exe)
	argsPtr, _ := windows.UTF16PtrFromString(args)
	cwdPtr, _ := windows.UTF16PtrFromString(".")

	err = windows.ShellExecute(0, verbPtr, exePtr, argsPtr, cwdPtr, windows.SW_NORMAL)
	if err != nil {
		return fmt.Errorf("UAC elevation failed: %w", err)
	}

	// The elevated process is now running — exit this non-elevated instance.
	os.Exit(0)
	return nil
}

// isElevated returns true if the current process has administrator privileges.
// TOKEN_ELEVATION is a single DWORD so we read it directly as uint32.
func isElevated() (bool, error) {
	token := windows.Token(0)
	if err := windows.OpenProcessToken(windows.CurrentProcess(), windows.TOKEN_QUERY, &token); err != nil {
		return false, err
	}
	defer token.Close()

	var elevation uint32
	var size uint32
	err := windows.GetTokenInformation(token, windows.TokenElevation,
		(*byte)(unsafe.Pointer(&elevation)), uint32(unsafe.Sizeof(elevation)), &size)
	if err != nil {
		return false, err
	}
	return elevation != 0, nil
}

// controlService stops (start=false) or starts (start=true) a Windows service
// using the Service Control Manager. Waits up to 10 seconds for the transition.
func controlService(name string, start bool) error {
	m, err := mgr.Connect()
	if err != nil {
		return fmt.Errorf("could not connect to SCM: %w", err)
	}
	defer m.Disconnect()

	s, err := m.OpenService(name)
	if err != nil {
		// Service not found is not an error — it may not be installed yet.
		return nil
	}
	defer s.Close()

	status, err := s.Query()
	if err != nil {
		return fmt.Errorf("could not query service: %w", err)
	}

	if start {
		if status.State == svc.Running {
			return nil // already running
		}
		if err := s.Start(); err != nil {
			return fmt.Errorf("could not start: %w", err)
		}
		return waitForServiceState(s, svc.Running, 10*time.Second)
	}

	// Stop
	if status.State == svc.Stopped {
		return nil // already stopped
	}
	if _, err := s.Control(svc.Stop); err != nil {
		return fmt.Errorf("could not send stop: %w", err)
	}
	return waitForServiceState(s, svc.Stopped, 10*time.Second)
}

// waitForServiceState polls until the service reaches the desired state or times out.
func waitForServiceState(s *mgr.Service, desired svc.State, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		status, err := s.Query()
		if err != nil {
			return err
		}
		if status.State == desired {
			return nil
		}
		time.Sleep(300 * time.Millisecond)
	}
	return fmt.Errorf("timed out waiting for service state %v", desired)
}

// cleanupOldExe removes a .old file at the given path, silently ignoring errors.
// Used to clean up metamorph.exe.old after a self-update rename+replace.
func cleanupOldExe(path string) {
	if _, err := os.Stat(path); err == nil {
		_ = os.Remove(path)
	}
}

// copyDirWithSelfUpdate copies a directory like copyDir, but handles the special
// case where the destination contains the currently running executable (metamorph.exe).
// For that file it uses rename+replace: rename the live exe to .old (Windows allows
// this even while it's running), then copy the new one into place.
func copyDirWithSelfUpdate(src, dst string, dryRun bool) (int, error) {
	count := 0
	err := filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
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

		base := filepath.Base(path)
		if strings.HasPrefix(base, "._") || base == ".DS_Store" {
			return nil
		}

		if !dryRun {
			if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
				return fmt.Errorf("mkdir %s: %w", filepath.Dir(target), err)
			}

			// For the running exe, rename it away first so Windows releases the lock.
			if strings.EqualFold(base, "metamorph.exe") {
				if _, statErr := os.Stat(target); statErr == nil {
					if renameErr := os.Rename(target, target+".old"); renameErr != nil {
						return fmt.Errorf("could not rename running exe: %w", renameErr)
					}
				}
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