package ionpump

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"

	"metamorph/internal/core"
	"github.com/spf13/cobra"
)

func createListCommand(c *core.Core) *cobra.Command {
	var source string

	cmd := &cobra.Command{
		Use:   "list [source]",
		Short: "List available ion reconciliation manifests",
		Long: `List ion reconciliation manifests available for use with 'ion-pump reconcile'.

Searches the local installer bundle for bootstrap manifests bundled at build
time. In Phase 6b, this command will also enumerate manifests known to Batcave.

The optional positional argument is a shorthand for --source.`,

		Args: cobra.MaximumNArgs(1),

		Annotations: map[string]string{
			"category": "IONPUMP",
			"json_response": `{
  "manifests": [
    {
      "source": "local",
      "path": "installer/native/ionpump/bootstrap-ions.json",
      "ions_count": 1,
      "schema_version": "2.0"
    }
  ]
}`,
		},

		Example: `  metamorph ion-pump list
  metamorph ion-pump list local
  metamorph ion-pump list --source remote
  metamorph --json ion-pump list`,

		RunE: func(cmd *cobra.Command, args []string) error {
			// Positional arg is a shorthand for --source.
			if len(args) == 1 {
				source = args[0]
			}

			result, err := runList(c, source)
			if err != nil {
				return err
			}

			if c.Config.OutputJSON {
				c.OutputJSON(result)
				return nil
			}

			printManifestList(result)
			return nil
		},
	}

	cmd.Flags().StringVarP(&source, "source", "s", "all", "Filter by source: local | remote | all")

	return cmd
}

func runList(c *core.Core, source string) (*ListResult, error) {
	result := &ListResult{Manifests: []ManifestEntry{}}

	if source == "all" || source == "local" {
		locals, err := discoverLocalManifests(c)
		if err != nil {
			c.Logger.Info("⚠️  Could not scan local manifests: %v", err)
		} else {
			result.Manifests = append(result.Manifests, locals...)
		}
	}

	if source == "remote" {
		c.Logger.Info("ℹ️  Remote manifest discovery is not yet implemented (Phase 6b)")
	}

	return result, nil
}

// discoverLocalManifests searches well-known locations for bundled manifests.
// Priority order: installer bundle path → working directory → AppData config.
func discoverLocalManifests(c *core.Core) ([]ManifestEntry, error) {
	var entries []ManifestEntry

	searchDirs := localManifestSearchDirs(c)
	for _, dir := range searchDirs {
		found, err := scanManifestDir(dir)
		if err != nil {
			continue
		}
		entries = append(entries, found...)
	}

	return entries, nil
}

// localManifestSearchDirs returns candidate directories to search for manifests.
// Search order (highest to lowest priority):
//  1. BLOOM_REPO_ROOT / installer / native / ionpump  — developer / CI override
//  2. Relative to executable                           — packaged installer
//  3. Current working directory                        — running from repo tree
//  4. Canonical AppData ionpump path                   — deployed via `rollout --only ionpump`
//  5. Legacy platform-specific paths                   — older installs
func localManifestSearchDirs(c *core.Core) []string {
	var dirs []string

	// 1. BLOOM_REPO_ROOT / installer / native / ionpump
	if root := os.Getenv("BLOOM_REPO_ROOT"); root != "" {
		dirs = append(dirs, filepath.Join(root, "installer", "native", "ionpump"))
	}

	// 2. Relative to executable (common in packaged installer).
	if exe, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exe)
		dirs = append(dirs,
			filepath.Join(exeDir, "ionpump"),
			filepath.Join(exeDir, "..", "ionpump"),
		)
	}

	// 3. Current working directory.
	if cwd, err := os.Getwd(); err == nil {
		dirs = append(dirs,
			filepath.Join(cwd, "installer", "native", "ionpump"),
			filepath.Join(cwd, "ionpump"),
		)
	}

	// 4. Canonical AppData ionpump path — populated by `metamorph rollout --only ionpump`.
	//    This is the path that `rollout` writes to, so it works regardless of whether
	//    BLOOM_REPO_ROOT is set (e.g. on a production machine or after a fresh install).
	dirs = append(dirs, filepath.Join(core.GetBaseAppDataPath(), "bin", "cortex", "ionpump"))

	// 5. Legacy platform-specific installer defaults (older installs that pre-date rollout).
	switch runtime.GOOS {
	case "windows":
		if lad := os.Getenv("LOCALAPPDATA"); lad != "" {
			dirs = append(dirs, filepath.Join(lad, "BloomNucleus", "ionpump"))
		}
	case "darwin":
		if home := os.Getenv("HOME"); home != "" {
			dirs = append(dirs, filepath.Join(home, "Library", "BloomNucleus", "ionpump"))
		}
	}

	return dirs
}

// scanManifestDir returns ManifestEntry for every *.json file in dir that
// parses as a valid IonManifest.
func scanManifestDir(dir string) ([]ManifestEntry, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	var result []ManifestEntry
	for _, e := range entries {
		if e.IsDir() || filepath.Ext(e.Name()) != ".json" {
			continue
		}

		fullPath := filepath.Join(dir, e.Name())
		m, err := tryParseManifest(fullPath)
		if err != nil {
			continue
		}

		result = append(result, ManifestEntry{
			Source:        "local",
			Path:          fullPath,
			IonsCount:     len(m.Ions),
			SchemaVersion: m.SchemaVersion,
		})
	}

	return result, nil
}

// tryParseManifest attempts to parse a file as IonManifest. Returns an error
// if the file is not a valid manifest (so non-manifest JSON files are skipped).
func tryParseManifest(path string) (*IonManifest, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var m IonManifest
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, err
	}

	// Require at least the "ions" key to be present (even if empty slice).
	if m.Ions == nil {
		return nil, fmt.Errorf("not an ion manifest")
	}

	return &m, nil
}

func printManifestList(result *ListResult) {
	fmt.Println("Available Ion Manifests")
	fmt.Println("=======================")
	fmt.Println()

	if len(result.Manifests) == 0 {
		fmt.Println("No manifests found.")
		fmt.Println()
		fmt.Println("Expected location: installer/native/ionpump/bootstrap-ions.json")
		fmt.Println("Run 'metamorph rollout --only ionpump' to deploy the bundled manifests.")
		return
	}

	for _, m := range result.Manifests {
		fmt.Printf("  [%s]  %s\n", m.Source, m.Path)
		fmt.Printf("         schema: %-6s  ions: %d\n", m.SchemaVersion, m.IonsCount)
		fmt.Println()
	}

	fmt.Printf("%d manifest(s) found\n", len(result.Manifests))
}
