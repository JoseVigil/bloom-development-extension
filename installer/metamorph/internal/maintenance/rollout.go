package maintenance

import (
	"encoding/json"
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

type component struct {
	Key       string
	SourceFn  func(repoRoot string) string
	DestFn    func(basePath string) string
	Platforms []string
}

func exe(name string) string { return core.ExeName(name) }

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
		Key: "conductor",
		SourceFn: func(r string) string {
			if runtime.GOOS == "darwin" {
				return filepath.Join(r, "conductor", "dist", "Bloom Conductor.app")
			}
			return filepath.Join(r, "conductor", "dist", exe("bloom-conductor"))
		},
		DestFn: func(b string) string { return filepath.Join(b, "bin", "conductor") },
	},
	{
		Key: "setup",
		SourceFn: func(r string) string {
			if runtime.GOOS == "darwin" {
				return filepath.Join(r, "setup", "dist", "BloomSetup.pkg")
			}
			return filepath.Join(r, "setup", "dist", "BloomSetup.exe")
		},
		DestFn:    func(b string) string { return filepath.Join(b, "bin", "setup") },
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
			return filepath.Join(r, "cortex", "dist", "bloom-cortex.crx")
		},
		DestFn: func(b string) string { return filepath.Join(b, "bin", "cortex") },
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
			return filepath.Join(r, "bloom-development-extension", "dist", "bloom.vsix")
		},
		DestFn:    func(b string) string { return filepath.Join(b, "bin", "vsix") },
		Platforms: []string{"windows"},
	},
}

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

func createRolloutCommand(c *core.Core) *cobra.Command {
	var dryRun bool
	var only string

	cmd := &cobra.Command{
		Use:   "rollout [--only <component>] [--dry-run]",
		Short: "Deploy built binaries from repo to AppData",
		Long: `Copies compiled binaries from the repository build output into the
BloomNucleus AppData directory so the running system picks them up.

Use --dry-run to preview what would be copied without making changes.
Use --only to deploy a single component instead of everything.`,

		Annotations: map[string]string{
			"category": "MAINTENANCE",
			"json_response": `{
  "status": "success",
  "dry_run": false,
  "only": "",
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
  metamorph rollout --only brain --dry-run
  metamorph --json rollout --only nucleus`,

		RunE: func(cmd *cobra.Command, args []string) error {
			return runRollout(c, dryRun, only)
		},
	}

	cmd.Flags().BoolVar(&dryRun, "dry-run", false, "Preview what would be copied without making changes")
	cmd.Flags().StringVar(&only, "only", "", "Deploy a single component instead of all ("+componentKeys()+")")

	return cmd
}

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
	Deployed []deployedEntry `json:"deployed"`
	Skipped  []string        `json:"skipped"`
	Errors   []string        `json:"errors"`
}

func runRollout(c *core.Core, dryRun bool, only string) error {
	basePath := core.GetBaseAppDataPath()
	repoRoot := resolveRepoRoot()

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

// resolveRepoRoot resolves the repository root (today) or the standalone
// installer root (production). Resolution order:
//
//  1. BLOOM_REPO_ROOT env var — CI / local override, no recompile needed.
//  2. nucleus.json installation.origin_path — canonical source of truth.
//     origin_path points to installer/native/bin/<platform>/<component>; walking up
//     5 levels yields the repo root. Mirrors the logic in
//     internal/supervisor/dev_start.go:getBloomDir().
//  3. BLOOM_DIR env var — last-resort fallback used by dev_start.go.
func resolveRepoRoot() string {
	if r := os.Getenv("BLOOM_REPO_ROOT"); r != "" {
		return r
	}

	nucleusJSON := filepath.Join(core.GetBaseAppDataPath(), "config", "nucleus.json")
	if data, err := os.ReadFile(nucleusJSON); err == nil {
		var cfg struct {
			Installation struct {
				OriginPath string `json:"origin_path"`
			} `json:"installation"`
		}
		if json.Unmarshal(data, &cfg) == nil && cfg.Installation.OriginPath != "" {
			p := cfg.Installation.OriginPath
			for i := 0; i < 5; i++ {
				p = filepath.Dir(p)
			}
			return p
		}
	}

	return os.Getenv("BLOOM_DIR")
}

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
			return os.MkdirAll(target, info.Mode())
		}
		if err := copyFile(path, target); err != nil {
			return err
		}
		count++
		return nil
	})
	return count, err
}
