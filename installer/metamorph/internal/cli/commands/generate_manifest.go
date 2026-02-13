package commands

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/bloom/metamorph/internal/core"
	"github.com/spf13/cobra"
)

// generateManifestCmd representa el comando generate-manifest
var generateManifestCmd = &cobra.Command{
	Use:   "generate-manifest",
	Short: "Generate manifest from current state",
	Long: `Generate a declarative manifest file representing the current system state,
including all managed binaries and their metadata.

Example:
  metamorph generate-manifest
  metamorph generate-manifest > current-state.json`,
	RunE: func(cmd *cobra.Command, args []string) error {
		paths, err := InitPaths()
		if err != nil {
			return err
		}

		printManifest(paths)
		return nil
	},
}

func init() {
	rootCmd.AddCommand(generateManifestCmd)
}

// printManifest imprime el manifest generado (siempre en JSON)
func printManifest(paths interface{}) {
	manifest := map[string]interface{}{
		"manifest_version": "1.1",
		"system_version":   fmt.Sprintf("v%s-build.%d", core.Version, core.BuildNumber),
		"release_channel":  "stable",
		"timestamp":        time.Now().UTC().Format(time.RFC3339),
		"artifacts":        []interface{}{},
		"_comment":         "Manifest generation not yet fully implemented",
	}

	bytes, _ := json.MarshalIndent(manifest, "", "  ")
	fmt.Println(string(bytes))
}
