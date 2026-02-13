package cli

import (
	"fmt"
)

// ShowHelp muestra el mensaje de ayuda general
func ShowHelp() {
	config := DefaultMetamorphConfig()

	fmt.Println()
	fmt.Printf("%*s\n", (config.Width+len(config.AppName))/2, config.AppName)
	fmt.Printf("%*s\n", (config.Width+len(config.AppSubtitle))/2, config.AppSubtitle)
	fmt.Println()
	fmt.Println()

	// USAGE
	printSection("USAGE", config.Width)
	fmt.Println()
	fmt.Println("  metamorph [OPTIONS] <command> [args]")
	fmt.Println()
	fmt.Println("  Quick examples:")
	fmt.Println("    metamorph version                    # Display version information")
	fmt.Println("    metamorph status                     # Show system state")
	fmt.Println("    metamorph --json inspect             # JSON output for automation")
	fmt.Println()
	fmt.Println()

	// GLOBAL OPTIONS
	printSection("GLOBAL OPTIONS", config.Width)
	fmt.Println()
	fmt.Println("  --json           Output in JSON format (machine-readable)")
	fmt.Println("  --verbose        Enable detailed logging for debugging")
	fmt.Println("  --help           Show this help message")
	fmt.Println()
	fmt.Println()

	// COMMAND CATEGORIES
	printSection("COMMAND CATEGORIES", config.Width)
	fmt.Println()
	fmt.Printf("  %-18s %-55s %s\n", "SYSTEM", "System information and diagnostics", "2 cmds")
	fmt.Printf("  %-18s %-55s %s\n", "RECONCILIATION", "State reconciliation and updates", "2 cmds")
	fmt.Printf("  %-18s %-55s %s\n", "INSPECTION", "Binary and state inspection", "2 cmds")
	fmt.Printf("  %-18s %-55s %s\n", "ROLLBACK", "Rollback and recovery operations", "1 cmd")
	fmt.Printf("  %-18s %-55s %s\n", "MAINTENANCE", "Cleanup and maintenance tasks", "1 cmd")
	fmt.Println("  " + repeatString("-", config.Width-2) + "  Total: 8 commands")
	fmt.Println()
	fmt.Println()

	// SYSTEM
	printCategoryHeader("SYSTEM", config.Width)
	fmt.Println()
	fmt.Println("  > VERSION")
	fmt.Println("    Display version and build information")
	fmt.Println()
	fmt.Println("    Usage: metamorph version")
	fmt.Println()
	fmt.Println("    " + repeatString("-", 80))
	fmt.Println()
	fmt.Println("  > INFO")
	fmt.Println("    Display detailed system information")
	fmt.Println()
	fmt.Println("    Usage: metamorph info")
	fmt.Println()
	fmt.Println("    Flags:")
	fmt.Println("      --json                     Output as JSON")
	fmt.Println()
	fmt.Println("    " + repeatString("-", 80))
	fmt.Println()
	fmt.Println()

	// RECONCILIATION
	printCategoryHeader("RECONCILIATION", config.Width)
	fmt.Println()
	fmt.Println("  > RECONCILE")
	fmt.Println("    Reconcile system state against manifest")
	fmt.Println()
	fmt.Println("    Usage: metamorph reconcile --manifest <path>")
	fmt.Println()
	fmt.Println("    Flags:")
	fmt.Println("      --manifest                 Path to manifest JSON file (required)")
	fmt.Println("      --dry-run                  Simulate without applying changes")
	fmt.Println("      --force                    Force reconciliation even if no drift")
	fmt.Println("      --json                     Output result as JSON")
	fmt.Println()
	fmt.Println("    Example:")
	fmt.Println("        metamorph reconcile --manifest manifest.json")
	fmt.Println("        metamorph --json reconcile --manifest manifest.json")
	fmt.Println()
	fmt.Println("    " + repeatString("-", 80))
	fmt.Println()
	fmt.Println("  > GENERATE-MANIFEST")
	fmt.Println("    Generate manifest from current system state")
	fmt.Println()
	fmt.Println("    Usage: metamorph generate-manifest")
	fmt.Println()
	fmt.Println("    Example:")
	fmt.Println("        metamorph generate-manifest > current_manifest.json")
	fmt.Println()
	fmt.Println("    " + repeatString("-", 80))
	fmt.Println()
	fmt.Println()

	// INSPECTION
	printCategoryHeader("INSPECTION", config.Width)
	fmt.Println()
	fmt.Println("  > STATUS")
	fmt.Println("    Display current system state summary")
	fmt.Println()
	fmt.Println("    Usage: metamorph status")
	fmt.Println()
	fmt.Println("    " + repeatString("-", 80))
	fmt.Println()
	fmt.Println("  > INSPECT")
	fmt.Println("    Inspect all binaries and show detailed information")
	fmt.Println()
	fmt.Println("    Usage: metamorph inspect")
	fmt.Println()
	fmt.Println("    Flags:")
	fmt.Println("      --json                     Output as JSON")
	fmt.Println()
	fmt.Println("    " + repeatString("-", 80))
	fmt.Println()
	fmt.Println()

	// ROLLBACK
	printCategoryHeader("ROLLBACK", config.Width)
	fmt.Println()
	fmt.Println("  > ROLLBACK")
	fmt.Println("    Rollback to a previous system snapshot")
	fmt.Println()
	fmt.Println("    Usage: metamorph rollback [flags]")
	fmt.Println()
	fmt.Println("    Flags:")
	fmt.Println("      --snapshot                 Snapshot ID to restore")
	fmt.Println("      --latest                   Use latest snapshot")
	fmt.Println("      --list                     List available snapshots")
	fmt.Println()
	fmt.Println("    Example:")
	fmt.Println("        metamorph rollback --latest")
	fmt.Println("        metamorph rollback --snapshot snapshot_20260213_143022")
	fmt.Println()
	fmt.Println("    " + repeatString("-", 80))
	fmt.Println()
	fmt.Println()

	// MAINTENANCE
	printCategoryHeader("MAINTENANCE", config.Width)
	fmt.Println()
	fmt.Println("  > CLEANUP")
	fmt.Println("    Clean up staging directory and old snapshots")
	fmt.Println()
	fmt.Println("    Usage: metamorph cleanup")
	fmt.Println()
	fmt.Println("    Flags:")
	fmt.Println("      --keep-snapshots           Number of snapshots to keep [default: 3]")
	fmt.Println("      --keep-downloads           Keep staging downloads")
	fmt.Println("      --dry-run                  Show what would be deleted")
	fmt.Println()
	fmt.Println("    " + repeatString("-", 80))
	fmt.Println()
	fmt.Println()

	// FOOTER
	fmt.Printf("%*s\n", (config.Width+60)/2, "[!] Metamorph: System State Reconciler for Bloom")
	fmt.Printf("%*s\n", (config.Width+70)/2, "Use 'metamorph <command> --help' for detailed command information")
	fmt.Println()
}

func printSection(title string, width int) {
	fmt.Println(repeatString("-", width))
	fmt.Printf("  %s\n", title)
	fmt.Println(repeatString("-", width))
}

func printCategoryHeader(category string, width int) {
	left := repeatString("=", (width-len(category)-4)/2)
	right := repeatString("=", width-len(left)-len(category)-4)
	fmt.Printf("%s[ %s ]%s\n", left, category, right)
}

func repeatString(s string, count int) string {
	if count <= 0 {
		return ""
	}
	result := ""
	for i := 0; i < count; i++ {
		result += s
	}
	return result
}
