package commands

import (
	"encoding/json"
	"fmt"

	"github.com/spf13/cobra"
)

var (
	cleanSnapshots bool
	cleanStaging   bool
	cleanAll       bool
)

// cleanupCmd representa el comando cleanup
var cleanupCmd = &cobra.Command{
	Use:   "cleanup",
	Short: "Clean up staging and old snapshots",
	Long: `Clean up temporary staging directories and old snapshot files to free up
disk space and maintain system hygiene.

Example:
  metamorph cleanup --all
  metamorph cleanup --snapshots
  metamorph cleanup --staging
  metamorph cleanup --all --json`,
	RunE: func(cmd *cobra.Command, args []string) error {
		// Si no se especifica ningún flag, limpiar todo por defecto
		if !cleanSnapshots && !cleanStaging && !cleanAll {
			cleanAll = true
		}

		paths, err := InitPaths()
		if err != nil {
			return err
		}

		if GetJSONOutput() {
			printCleanupJSON(paths)
		} else {
			printCleanupText(paths)
		}
		return nil
	},
}

func init() {
	rootCmd.AddCommand(cleanupCmd)

	// Flags locales para este comando
	cleanupCmd.Flags().BoolVar(&cleanSnapshots, "snapshots", false, "Clean old snapshots")
	cleanupCmd.Flags().BoolVar(&cleanStaging, "staging", false, "Clean staging directory")
	cleanupCmd.Flags().BoolVarP(&cleanAll, "all", "a", false, "Clean everything")
}

// printCleanupJSON imprime el resultado de la limpieza en formato JSON
func printCleanupJSON(paths interface{}) {
	data := map[string]interface{}{
		"success":           false,
		"error":             "Cleanup not yet implemented",
		"clean_snapshots":   cleanSnapshots || cleanAll,
		"clean_staging":     cleanStaging || cleanAll,
		"bytes_freed":       0,
		"files_removed":     0,
		"snapshots_removed": 0,
	}
	bytes, _ := json.MarshalIndent(data, "", "  ")
	fmt.Println(string(bytes))
}

// printCleanupText imprime el resultado de la limpieza en formato texto
func printCleanupText(paths interface{}) {
	fmt.Println("Cleanup")
	fmt.Println("=======")
	
	if cleanAll {
		fmt.Println("Mode: Clean all")
	} else {
		if cleanSnapshots {
			fmt.Println("Mode: Clean snapshots")
		}
		if cleanStaging {
			fmt.Println("Mode: Clean staging")
		}
	}
	
	fmt.Println()
	fmt.Println("⚠️  Cleanup not yet implemented")
	fmt.Println()
	fmt.Println("This feature will:")
	fmt.Println("  • Remove temporary staging files")
	fmt.Println("  • Delete old snapshot backups")
	fmt.Println("  • Free up disk space")
	fmt.Println("  • Report space savings")
}
