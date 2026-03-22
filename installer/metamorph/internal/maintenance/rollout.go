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

// validComponents is the canonical list of component names accepted by --only.
// Keys are lowercase for case-insensitive matching; values are the display names
// used in log output and JSON responses.
var validComponents = map[string]string{
	"brain":     "Brain",
	"nucleus":   "Nucleus",
	"sentinel":  "Sentinel",
	"metamorph": "Metamorph",
	"conductor": "Conductor",
	"setup":     "Setup",
	"host":      "Host",
	"cortex":    "Cortex",
	"nssm":      "NSSM",
	"bootstrap": "Bootstrap",
	"vsix":      "VSCode",
	"node":      "Node",
	"hook":      "Hooks",
	"config":    "Config",
}

// componentTeardown describes exactly which services and processes must be
// stopped/killed before deploying a given component. Only entries that actually
// hold file handles on the component's binaries are listed here.
//
// Design notes:
//   - nssm.exe is the SCM wrapper (parent) for both BloomBrain and
//     BloomNucleusService. It must be killed BEFORE its children, otherwise
//     it restarts them mid-copy and re-acquires file handles.
//   - bloom-host.exe holds a handle on brain/_internal/VCRUNTIME140.dll,
//     so it appears in the Brain entry even though it is not the service itself.
//   - Components that are never locked at runtime (cortex, nssm binary, bootstrap,
//     vsix, node, conductor, setup, metamorph) have no entry — their slices stay
//     nil and nothing is torn down.
//   - Metamorph uses rename+replace (copyDirWithSelfUpdate) so no teardown is
//     needed even for its own binary.
//   - gracefulFirst lists processes that must receive a graceful termination
//     request (taskkill without /F) BEFORE services are stopped. This allows
//     those processes to close their open TCP connections cleanly so that the
//     other side (e.g. Brain) receives the TCP FIN instead of a hard reset.
//     After a short grace period the process is force-killed if still alive.
type componentTeardown struct {
	services     []string
	processes    []string
	gracefulFirst []string // closed gently before service stop; force-killed after grace period
}

var processesForComponent = map[string]componentTeardown{
	"brain": {
		services: []string{"BloomBrain"},
		// bloom-sensor.exe (Sentinel) holds active TCP connections to Brain on
		// 127.0.0.1:5678. It must receive a graceful termination request first so
		// it can close its sockets cleanly and Brain gets the TCP FIN. Without this,
		// Windows kills the process hard and Brain sees WinError 64 / ConnectionReset.
		gracefulFirst: []string{"bloom-sensor.exe"},
		// nssm.exe first — it is the parent of BloomBrain and will restart
		// brain.exe if killed after the child.
		// bloom-host.exe holds handles on brain/_internal/VCRUNTIME140.dll.
		processes: []string{"nssm.exe", "brain.exe", "bloom-host.exe"},
	},
	"nucleus": {
		services: []string{"BloomNucleusService"},
		// nssm.exe first for the same reason as brain.
		// temporal.exe is a worker spawned by nucleus.exe; /T in taskkill
		// kills the whole tree, but listing it explicitly is safer.
		processes: []string{"nssm.exe", "nucleus.exe", "temporal.exe"},
	},
	"host": {
		// bloom-host.exe is not a managed service — killed directly.
		services:  []string{},
		processes: []string{"bloom-host.exe"},
	},
	"sentinel": {
		services:  []string{},
		processes: []string{"bloom-sensor.exe"},
	},
	// brain + nucleus together (full rollout path reuses this via nil check)
	// cortex, nssm, bootstrap, vsix, node, conductor, setup, metamorph:
	// no runtime lock — no entry needed.
}

func createRolloutCommand(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "rollout [--only <component>] [--dry-run]",
		Short: "Deploy built binaries from repo to AppData",
		Long: `Copy managed binaries from the local repository (native/bin/win64/)
to the BloomNucleus AppData directory, making them available at runtime.

By default ALL components are deployed. Use --only to redeploy a single
component — useful when retrying a failed component without touching the rest.

This command resolves the canonical source path automatically from nucleus.json.
It copies each component's full directory, preserving subdirectories
(help/, win-unpacked/, _internal/, etc.).

Components available:
  brain      Brain service binary and dependencies
  nucleus    Nucleus service binary and dependencies
  sentinel   Sentinel binary
  metamorph  Metamorph binary (self-update via rename+replace)
  conductor  Conductor binary
  setup      Setup binary
  host       Host directory (bloom-host.exe + support files)
  cortex     Cortex engine (.blx single file)
  nssm       NSSM service wrapper (single .exe, outside platform tree)
  bootstrap  Bootstrap server bundle (server-bootstrap.js + bundle files)
  vsix       VSCode extension (.vsix single file)
  node       Node.js runtime (platform-aware: win64 or win32)
  hook       Hooks directory (installer\native\hooks → AppData\BloomNucleus\hooks)
  config     Config directory (installer\native\config → AppData\BloomNucleus\config, merge/overwrite only)

After a full rollout, 'metamorph inspect' is run automatically to update
%LOCALAPPDATA%\BloomNucleus\config\metamorph.json.

Use --dry-run to preview what would be copied without making changes.`,
		Annotations: map[string]string{
			"category": "MAINTENANCE",
			"json_response": `{
  "status": "success",
  "dry_run": false,
  "only": "",
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
  metamorph rollout --only brain
  metamorph rollout --only nucleus
  metamorph rollout --only sentinel
  metamorph rollout --only metamorph
  metamorph rollout --only conductor
  metamorph rollout --only setup
  metamorph rollout --only host
  metamorph rollout --only cortex
  metamorph rollout --only nssm
  metamorph rollout --only bootstrap
  metamorph rollout --only vsix
  metamorph rollout --only node
  metamorph rollout --only hook
  metamorph rollout --only config
  metamorph rollout --only brain --dry-run
  metamorph --json rollout --only nucleus`,
		RunE: func(cmd *cobra.Command, args []string) error {
			dryRun, _ := cmd.Flags().GetBool("dry-run")
			only, _ := cmd.Flags().GetString("only")

			// Validate --only value if provided.
			if only != "" {
				normalized := strings.ToLower(strings.TrimSpace(only))
				if _, ok := validComponents[normalized]; !ok {
					names := make([]string, 0, len(validComponents))
					for k := range validComponents {
						names = append(names, k)
					}
					return fmt.Errorf(
						"unknown component %q — valid values: %s",
						only, strings.Join(names, ", "),
					)
				}
				only = normalized
			}

			// Rollout requires administrator privileges to stop/start services.
			if !dryRun {
				if err := ensureElevated(); err != nil {
					return err
				}
			}

			return runRollout(c, dryRun, only)
		},
	}

	cmd.Flags().Bool("dry-run", false, "Preview what would be copied without making changes")
	cmd.Flags().String("only", "", "Deploy a single component instead of all (brain, nucleus, sentinel, metamorph, conductor, setup, host, cortex, nssm, bootstrap, vsix, node, hook, config)")
	return cmd
}

// rolloutEntry maps a source path (relative to native/bin/<platform>/) to
// a destination path (relative to BloomNucleus/bin/).
// srcIsFile=true means only a single file is copied, not the whole directory.
type rolloutEntry struct {
	component string
	src       string // relative to native/bin/win64/ (or native/ for nssm)
	dst       string // relative to BloomNucleus/bin/
	srcIsFile bool   // copy single file instead of full directory
}

// getRolloutEntries returns the canonical source→destination mapping.
// Host lives in native/bin/win64/host/ and deploys to AppData bin/host/.
// Cortex is a single .blx file living one level up at native/bin/cortex/.
// NSSM lives at native/nssm/win64/ (outside the per-platform bin tree).
func getRolloutEntries() []rolloutEntry {
	return []rolloutEntry{
		{component: "Brain", src: "brain", dst: "brain"},
		{component: "Nucleus", src: "nucleus", dst: "nucleus"},
		{component: "Sentinel", src: "sentinel", dst: "sentinel"},
		{component: "Metamorph", src: "metamorph", dst: "metamorph"},
		{component: "Conductor", src: "conductor", dst: "conductor"},
		{component: "Setup", src: "setup", dst: "setup"},
		{component: "Host", src: "host", dst: "host"},
	}
}

// rolloutResult holds the outcome of a single component deployment.
type rolloutResult struct {
	Component   string `json:"component"`
	Source      string `json:"source"`
	Destination string `json:"destination"`
	FilesCopied int    `json:"files_copied"`
}

// shouldDeploy returns true when the component should be included in this run.
// If only is empty all components are included; otherwise only the matching one.
func shouldDeploy(componentName, only string) bool {
	if only == "" {
		return true
	}
	return strings.EqualFold(componentName, validComponents[only])
}

// runRollout resolves paths and deploys all components (or the one named by only).
func runRollout(c *core.Core, dryRun bool, only string) error {
	c.Logger.Info("rollout started — dry_run=%v only=%q", dryRun, only)

	origin, err := resolveOriginFromNucleusJSON()
	if err != nil {
		c.Logger.Error("could not resolve origin path: %v", err)
		return fmt.Errorf("could not resolve origin path: %w", err)
	}
	c.Logger.Info("origin resolved — path=%s type=%s platform=%s", origin.Path, origin.Type, origin.Platform)

	appDataBin, err := resolveAppDataBin()
	if err != nil {
		c.Logger.Error("could not resolve AppData bin path: %v", err)
		return fmt.Errorf("could not resolve AppData bin path: %w", err)
	}

	// origin.Path already points to installer/native/bin/<platform>
	// e.g. C:\repos\bloom\installer\native\bin\win64
	nativeBinBase := origin.Path
	// installerRoot = installer/  (three levels up from native/bin/<platform>)
	installerRoot := filepath.Dir(filepath.Dir(filepath.Dir(nativeBinBase)))
	nssmSrc := filepath.Join(filepath.Dir(filepath.Dir(nativeBinBase)), "nssm", origin.Platform, "nssm.exe")
	cortexSrc := filepath.Join(filepath.Dir(nativeBinBase), "cortex", "bloom-cortex.blx")

	// Bootstrap: installer/native/bin/bootstrap/ (not platform-specific, full directory)
	bootstrapSrcDir := filepath.Join(filepath.Dir(nativeBinBase), "bootstrap")

	// Hooks: installer/native/hooks/ → AppData/BloomNucleus/hooks/
	// nativeBinBase = installer/native/bin/win64 — two levels up to reach native/
	hooksSrcDir := filepath.Join(filepath.Dir(filepath.Dir(nativeBinBase)), "hooks")

	// Config: installer/native/config/ → AppData/BloomNucleus/config/
	// Same root as hooks — merge/overwrite only, never delete existing files.
	configSrcDir := filepath.Join(filepath.Dir(filepath.Dir(nativeBinBase)), "config")

	// VSCode extension: installer/vscode/bloom-extension.vsix
	vscodeSrc := filepath.Join(installerRoot, "vscode", "bloom-extension.vsix")

	// Node: platform-aware source (win64 or win32), always deploys to bin/node/
	nodeSrc := filepath.Join(installerRoot, "node", origin.Platform, "node.exe")

	if !c.Config.OutputJSON {
		fmt.Printf("  Origin: %s (%s / %s)\n", origin.Path, origin.Type, origin.Platform)
		if only != "" {
			fmt.Printf("  Target: %s (--only)\n", validComponents[only])
		}
		fmt.Println()
	}

	if dryRun {
		fmt.Println("[DRY RUN] No files will be written.")
		fmt.Println()
	}

	var deployed []rolloutResult
	var skipped []string
	var errors []string

	// Determine which services and processes must be torn down before copying.
	//
	// Full rollout (only == ""): stop everything — we are touching all binaries
	// so every service and process that could hold a file handle must be down.
	//
	// Targeted rollout (only != ""): consult processesForComponent and tear down
	// only what actually blocks the requested component's files. Services and
	// processes unrelated to the target keep running without interruption.
	var managedServices []string
	var allProcessesToKill []string
	var gracefulFirst []string

	if only == "" {
		// Full rollout: bring down the entire managed stack.
		managedServices = []string{"BloomBrain", "BloomNucleusService"}
		// bloom-sensor.exe (Sentinel) holds TCP connections to Brain — graceful
		// stop first so Brain gets the TCP FIN before the service is killed.
		gracefulFirst = []string{"bloom-sensor.exe"}
		// Order matters: nssm.exe must die first — it is the SCM parent of both
		// BloomBrain and BloomNucleusService. Killing children first lets NSSM
		// restart them before we copy and re-acquire file handles.
		// bloom-host.exe holds handles on brain/_internal/VCRUNTIME140.dll.
		// nucleus.exe spawns worker children; /T in taskkill kills the whole tree.
		allProcessesToKill = []string{
			"nssm.exe",
			"brain.exe",
			"nucleus.exe",
			"temporal.exe",
			"bloom-host.exe",
			"bloom-sensor.exe",
		}
	} else {
		// Targeted rollout: only tear down what blocks this specific component.
		if mapping, ok := processesForComponent[only]; ok {
			managedServices = mapping.services
			allProcessesToKill = mapping.processes
			gracefulFirst = mapping.gracefulFirst
		}
		// Components with no entry (cortex, nssm, bootstrap, vsix, node,
		// conductor, setup, metamorph) have no runtime lock — both slices
		// stay nil and the teardown block below becomes a no-op.
	}
	if !dryRun {
		hasTeardown := len(managedServices) > 0 || len(allProcessesToKill) > 0 || len(gracefulFirst) > 0
		if hasTeardown && !c.Config.OutputJSON {
			fmt.Println("  Stopping services and killing processes...")
		}
		// Step 1: gracefully stop processes that hold open TCP connections to the
		// service being replaced. This lets them close their sockets cleanly so
		// the other side receives the TCP FIN instead of a hard reset (WinError 64).
		// After a short grace period, force-kill any that did not exit on their own.
		const gracePeriod = 3 * time.Second
		for _, procName := range gracefulFirst {
			c.Logger.Info("graceful stop: %s (grace=%s)", procName, gracePeriod)
			if !c.Config.OutputJSON {
				fmt.Printf("  ⏳ %-20s graceful stop (waiting %s)...\n", procName, gracePeriod)
			}
			gracefulStop(procName, gracePeriod)
		}
		// Step 2: stop services via SCM.
		for _, svcName := range managedServices {
			if err := controlService(svcName, false); err != nil {
				c.Logger.Warning("could not stop service %s: %v", svcName, err)
				if !c.Config.OutputJSON {
					fmt.Printf("  ⚠  %-20s could not stop: %v\n", svcName, err)
				}
			} else {
				c.Logger.Info("service stopped: %s", svcName)
				if !c.Config.OutputJSON {
					fmt.Printf("  ⏹  %-20s stopped\n", svcName)
				}
			}
		}
		// Step 3: force-kill all known processes and their trees.
		// This catches workers running outside services and releases all
		// file handles including DLL locks like VCRUNTIME140.dll.
		for _, procName := range allProcessesToKill {
			c.Logger.Info("killing process: %s", procName)
			killProcess(procName)
		}
		// Step 4: pause to let Windows release all file handles.
		time.Sleep(1 * time.Second)
		// Step 4: remove legacy bin/native/ dir created by old incorrect rollout.
		nativeLegacyDir := filepath.Join(appDataBin, "native")
		if _, err := os.Stat(nativeLegacyDir); err == nil {
			_ = os.RemoveAll(nativeLegacyDir)
			c.Logger.Info("removed legacy bin/native directory")
			if !c.Config.OutputJSON {
				fmt.Printf("  🗑  removed legacy bin/native/ directory\n")
			}
		}
		fmt.Println()
	}

	// Deploy standard per-platform components
	for _, entry := range getRolloutEntries() {
		if !shouldDeploy(entry.component, only) {
			continue
		}

		src := filepath.Join(nativeBinBase, entry.src)
		dst := filepath.Join(appDataBin, entry.dst)

		if _, err := os.Stat(src); os.IsNotExist(err) {
			msg := fmt.Sprintf("%s (source not found: %s)", entry.component, src)
			skipped = append(skipped, msg)
			c.Logger.Warning("component skipped — source not found: %s", entry.component)
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
			c.Logger.Error("error deploying %s: %v", entry.component, err)
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
		c.Logger.Info("deployed %s — %d files → %s", entry.component, count, dst)
		if !c.Config.OutputJSON {
			verb := "Deployed"
			if dryRun {
				verb = "Would deploy"
			}
			fmt.Printf("  ✔  %-14s %s → %s (%d files)\n", entry.component, verb, dst, count)
		}
	}

	// Deploy Cortex (.blx single file)
	if shouldDeploy("Cortex", only) {
		dst := filepath.Join(appDataBin, "cortex", "bloom-cortex.blx")
		if _, err := os.Stat(cortexSrc); os.IsNotExist(err) {
			skipped = append(skipped, "Cortex (source not found: "+cortexSrc+")")
			c.Logger.Warning("component skipped — source not found: Cortex")
			if !c.Config.OutputJSON {
				fmt.Printf("  ⚠  %-14s skipped — source not found\n", "Cortex")
			}
		} else {
			count, err := copySingleFile(cortexSrc, dst, dryRun)
			if err != nil {
				errors = append(errors, "Cortex: "+err.Error())
				c.Logger.Error("error deploying Cortex: %v", err)
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
				c.Logger.Info("deployed Cortex — %d files → %s", count, dst)
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
	if shouldDeploy("NSSM", only) {
		dst := filepath.Join(appDataBin, "nssm", "nssm.exe")
		if _, err := os.Stat(nssmSrc); os.IsNotExist(err) {
			skipped = append(skipped, "NSSM (source not found: "+nssmSrc+")")
			c.Logger.Warning("component skipped — source not found: NSSM")
			if !c.Config.OutputJSON {
				fmt.Printf("  ⚠  %-14s skipped — source not found\n", "NSSM")
			}
		} else {
			count, err := copySingleFile(nssmSrc, dst, dryRun)
			if err != nil {
				errors = append(errors, "NSSM: "+err.Error())
				c.Logger.Error("error deploying NSSM: %v", err)
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
				c.Logger.Info("deployed NSSM — %d files → %s", count, dst)
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

	// Deploy Bootstrap (full directory)
	if shouldDeploy("Bootstrap", only) {
		dst := filepath.Join(appDataBin, "bootstrap")
		if _, err := os.Stat(bootstrapSrcDir); os.IsNotExist(err) {
			skipped = append(skipped, "Bootstrap (source not found: "+bootstrapSrcDir+")")
			c.Logger.Warning("component skipped — source not found: Bootstrap")
			if !c.Config.OutputJSON {
				fmt.Printf("  ⚠  %-14s skipped — source not found\n", "Bootstrap")
			}
		} else {
			count, err := copyDir(bootstrapSrcDir, dst, dryRun)
			if err != nil {
				errors = append(errors, "Bootstrap: "+err.Error())
				c.Logger.Error("error deploying Bootstrap: %v", err)
				if !c.Config.OutputJSON {
					fmt.Printf("  ✗  %-14s ERROR: %v\n", "Bootstrap", err)
				}
			} else {
				deployed = append(deployed, rolloutResult{
					Component:   "Bootstrap",
					Source:      bootstrapSrcDir,
					Destination: dst,
					FilesCopied: count,
				})
				c.Logger.Info("deployed Bootstrap — %d files → %s", count, dst)
				if !c.Config.OutputJSON {
					verb := "Deployed"
					if dryRun {
						verb = "Would deploy"
					}
					fmt.Printf("  ✔  %-14s %s → %s (%d files)\n", "Bootstrap", verb, dst, count)
				}
			}
		}
	}

	// Deploy VSCode extension (single .vsix file)
	if shouldDeploy("VSCode", only) {
		dst := filepath.Join(appDataBin, "vscode", "bloom-extension.vsix")
		if _, err := os.Stat(vscodeSrc); os.IsNotExist(err) {
			skipped = append(skipped, "VSCode (source not found: "+vscodeSrc+")")
			c.Logger.Warning("component skipped — source not found: VSCode")
			if !c.Config.OutputJSON {
				fmt.Printf("  ⚠  %-14s skipped — source not found\n", "VSCode")
			}
		} else {
			count, err := copySingleFile(vscodeSrc, dst, dryRun)
			if err != nil {
				errors = append(errors, "VSCode: "+err.Error())
				c.Logger.Error("error deploying VSCode: %v", err)
				if !c.Config.OutputJSON {
					fmt.Printf("  ✗  %-14s ERROR: %v\n", "VSCode", err)
				}
			} else {
				deployed = append(deployed, rolloutResult{
					Component:   "VSCode",
					Source:      vscodeSrc,
					Destination: dst,
					FilesCopied: count,
				})
				c.Logger.Info("deployed VSCode — %d files → %s", count, dst)
				if !c.Config.OutputJSON {
					verb := "Deployed"
					if dryRun {
						verb = "Would deploy"
					}
					fmt.Printf("  ✔  %-14s %s → %s\n", "VSCode", verb, dst)
				}
			}
		}
	}

	// Deploy Node (platform-aware)
	if shouldDeploy("Node", only) {
		dst := filepath.Join(appDataBin, "node", "node.exe")
		if _, err := os.Stat(nodeSrc); os.IsNotExist(err) {
			skipped = append(skipped, fmt.Sprintf("Node (source not found: %s)", nodeSrc))
			c.Logger.Warning("component skipped — source not found: Node (%s)", origin.Platform)
			if !c.Config.OutputJSON {
				fmt.Printf("  ⚠  %-14s skipped — source not found (%s)\n", "Node", origin.Platform)
			}
		} else {
			count, err := copySingleFile(nodeSrc, dst, dryRun)
			if err != nil {
				errors = append(errors, "Node: "+err.Error())
				c.Logger.Error("error deploying Node: %v", err)
				if !c.Config.OutputJSON {
					fmt.Printf("  ✗  %-14s ERROR: %v\n", "Node", err)
				}
			} else {
				deployed = append(deployed, rolloutResult{
					Component:   "Node",
					Source:      nodeSrc,
					Destination: dst,
					FilesCopied: count,
				})
				c.Logger.Info("deployed Node — %d files → %s [%s]", count, dst, origin.Platform)
				if !c.Config.OutputJSON {
					verb := "Deployed"
					if dryRun {
						verb = "Would deploy"
					}
					fmt.Printf("  ✔  %-14s %s → %s [%s]\n", "Node", verb, dst, origin.Platform)
				}
			}
		}
	}

	// Deploy Hooks (full directory: installer/native/hooks → AppData/BloomNucleus/hooks)
	if shouldDeploy("Hooks", only) {
		dst := filepath.Join(filepath.Dir(appDataBin), "hooks")
		if _, err := os.Stat(hooksSrcDir); os.IsNotExist(err) {
			skipped = append(skipped, "Hooks (source not found: "+hooksSrcDir+")")
			c.Logger.Warning("component skipped — source not found: Hooks")
			if !c.Config.OutputJSON {
				fmt.Printf("  ⚠  %-14s skipped — source not found\n", "Hooks")
			}
		} else {
			count, err := copyDir(hooksSrcDir, dst, dryRun)
			if err != nil {
				errors = append(errors, "Hooks: "+err.Error())
				c.Logger.Error("error deploying Hooks: %v", err)
				if !c.Config.OutputJSON {
					fmt.Printf("  ✗  %-14s ERROR: %v\n", "Hooks", err)
				}
			} else {
				deployed = append(deployed, rolloutResult{
					Component:   "Hooks",
					Source:      hooksSrcDir,
					Destination: dst,
					FilesCopied: count,
				})
				c.Logger.Info("deployed Hooks — %d files → %s", count, dst)
				if !c.Config.OutputJSON {
					verb := "Deployed"
					if dryRun {
						verb = "Would deploy"
					}
					fmt.Printf("  ✔  %-14s %s → %s (%d files)\n", "Hooks", verb, dst, count)
				}
			}
		}
	}

	// Deploy Config (merge/overwrite: installer/native/config → AppData/BloomNucleus/config)
	// Files present in the destination but absent from the source are intentionally
	// left untouched — copyDir only writes files that exist in the source tree.
	if shouldDeploy("Config", only) {
		dst := filepath.Join(filepath.Dir(appDataBin), "config")
		if _, err := os.Stat(configSrcDir); os.IsNotExist(err) {
			skipped = append(skipped, "Config (source not found: "+configSrcDir+")")
			c.Logger.Warning("component skipped — source not found: Config")
			if !c.Config.OutputJSON {
				fmt.Printf("  ⚠  %-14s skipped — source not found\n", "Config")
			}
		} else {
			count, err := copyDir(configSrcDir, dst, dryRun)
			if err != nil {
				errors = append(errors, "Config: "+err.Error())
				c.Logger.Error("error deploying Config: %v", err)
				if !c.Config.OutputJSON {
					fmt.Printf("  ✗  %-14s ERROR: %v\n", "Config", err)
				}
			} else {
				deployed = append(deployed, rolloutResult{
					Component:   "Config",
					Source:      configSrcDir,
					Destination: dst,
					FilesCopied: count,
				})
				c.Logger.Info("deployed Config — %d files → %s", count, dst)
				if !c.Config.OutputJSON {
					verb := "Deployed"
					if dryRun {
						verb = "Would deploy"
					}
					fmt.Printf("  ✔  %-14s %s → %s (%d files)\n", "Config", verb, dst, count)
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
				c.Logger.Warning("could not restart service %s: %v", svcName, err)
				if !c.Config.OutputJSON {
					fmt.Printf("  ⚠  %-20s could not start: %v\n", svcName, err)
				}
				errors = append(errors, fmt.Sprintf("restart %s: %v", svcName, err))
			} else {
				c.Logger.Info("service started: %s", svcName)
				if !c.Config.OutputJSON {
					fmt.Printf("  ▶  %-20s started\n", svcName)
				}
			}
		}
		fmt.Println()
	}

	// Clean up metamorph.exe.old left by the self-update rename+replace.
	if !dryRun {
		oldExe := filepath.Join(appDataBin, "metamorph", "metamorph.exe.old")
		if _, err := os.Stat(oldExe); err == nil {
			if removeErr := os.Remove(oldExe); removeErr == nil {
				c.Logger.Info("removed stale metamorph.exe.old")
				if !c.Config.OutputJSON {
					fmt.Printf("  🗑  metamorph.exe.old removed\n")
				}
			}
		}
	}

	// Build summary
	status := "success"
	if len(errors) > 0 {
		status = "partial"
	}
	if len(deployed) == 0 {
		status = "failed"
	}

	c.Logger.Info("rollout complete — status=%s deployed=%d skipped=%d errors=%d dry_run=%v only=%q",
		status, len(deployed), len(skipped), len(errors), dryRun, only)

	if c.Config.OutputJSON {
		c.OutputJSON(map[string]interface{}{
			"status":   status,
			"dry_run":  dryRun,
			"only":     only,
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

// componentNames extracts just the component names from a slice of rolloutResult,
// used for a compact log summary.
func componentNames(results []rolloutResult) []string {
	names := make([]string, len(results))
	for i, r := range results {
		names[i] = r.Component
	}
	return names
}

// installationOrigin holds the relevant fields from nucleus.json installation block.
type installationOrigin struct {
	Path     string // installation.origin_path  — e.g. C:\repos\bloom\installer\native\bin\win64
	Type     string // installation.origin_type  — "local_repo" | "remote_release"
	Platform string // installation.origin_platform — "win64" | "win32"
}

// resolveOriginFromNucleusJSON reads %LOCALAPPDATA%\BloomNucleus\config\nucleus.json
// and returns the origin_path recorded by the installer.
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

// killProcess force-kills all instances of a process by name using taskkill /F /T.
func killProcess(name string) {
	_ = exec.Command("taskkill", "/F", "/IM", name, "/T").Run()
}

// gracefulStop sends a graceful termination request to all instances of a process
// by name (taskkill without /F), waits up to the given grace period for them to
// exit on their own, then force-kills any that are still alive.
//
// This allows processes that hold open TCP connections (e.g. Sentinel / bloom-sensor.exe
// connected to Brain on 127.0.0.1:5678) to close their sockets cleanly before the
// service they talk to is stopped. Without this, Windows terminates the process
// hard and the remote side sees a connection reset (WinError 64) instead of a
// clean TCP FIN.
func gracefulStop(name string, grace time.Duration) {
	// Ask the process to terminate gracefully (no /F = gentle signal).
	_ = exec.Command("taskkill", "/IM", name, "/T").Run()

	// Poll until no instance remains or the grace period expires.
	deadline := time.Now().Add(grace)
	for time.Now().Before(deadline) {
		// tasklist /FI exits with 0 and prints the header even when no process
		// matches, so we check the output for the process name instead.
		out, err := exec.Command("tasklist", "/FI", "IMAGENAME eq "+name, "/NH").Output()
		if err != nil || !strings.Contains(strings.ToLower(string(out)), strings.ToLower(name)) {
			return // process is gone — nothing left to force-kill
		}
		time.Sleep(300 * time.Millisecond)
	}

	// Grace period elapsed — force-kill whatever is still alive.
	_ = exec.Command("taskkill", "/F", "/IM", name, "/T").Run()
}

// cleanupOldExe removes a .old file at the given path, silently ignoring errors.
func cleanupOldExe(path string) {
	if _, err := os.Stat(path); err == nil {
		_ = os.Remove(path)
	}
}

// copyDirWithSelfUpdate copies a directory like copyDir, but handles the special
// case where the destination contains the currently running executable (metamorph.exe).
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
func copyDir(src, dst string, dryRun bool) (int, error) {
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