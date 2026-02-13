package commands

import (
	"encoding/json"
	"fmt"

	"github.com/spf13/cobra"
)

var (
	snapshotID  string
	useLatest   bool
)

// rollbackCmd representa el comando rollback
var rollbackCmd = &cobra.Command{
	Use:   "rollback",
	Short: "Rollback to previous snapshot",
	Long: `Rollback the system to a previous snapshot state, restoring all managed
binaries to their previous versions.

Example:
  metamorph rollback --latest
  metamorph rollback --snapshot 20260213_143000
  metamorph rollback --snapshot 20260213_143000 --json`,
	RunE: func(cmd *cobra.Command, args []string) error {
		if !useLatest && snapshotID == "" {
			return fmt.Errorf("either --latest or --snapshot must be specified")
		}

		paths, err := InitPaths()
		if err != nil {
			return err
		}

		if GetJSONOutput() {
			printRollbackJSON(paths)
		} else {
			printRollbackText(paths)
		}
		return nil
	},
}

func init() {
	rootCmd.AddCommand(rollbackCmd)

	// Flags locales para este comando
	rollbackCmd.Flags().StringVarP(&snapshotID, "snapshot", "s", "", "Snapshot ID to restore")
	rollbackCmd.Flags().BoolVarP(&useLatest, "latest", "l", false, "Use latest snapshot")
}

// printRollbackJSON imprime el resultado del rollback en formato JSON
func printRollbackJSON(paths interface{}) {
	data := map[string]interface{}{
		"success":     false,
		"error":       "Rollback not yet implemented",
		"snapshot_id": snapshotID,
		"use_latest":  useLatest,
	}
	bytes, _ := json.MarshalIndent(data, "", "  ")
	fmt.Println(string(bytes))
}

// printRollbackText imprime el resultado del rollback en formato texto
func printRollbackText(paths interface{}) {
	fmt.Println("Rollback")
	fmt.Println("========")
	if useLatest {
		fmt.Println("Target: Latest snapshot")
	} else {
		fmt.Printf("Target: Snapshot %s\n", snapshotID)
	}
	fmt.Println()
	fmt.Println("⚠️  Rollback not yet implemented")
	fmt.Println()
	fmt.Println("This feature will:")
	fmt.Println("  • Identify available snapshots")
	fmt.Println("  • Validate snapshot integrity")
	fmt.Println("  • Restore previous binary versions")
	fmt.Println("  • Update system state atomically")
}
