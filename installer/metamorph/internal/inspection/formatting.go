package inspection

import (
	"fmt"
	"strings"
)

// printInspectionTable prints the inspection result in a formatted table
func printInspectionTable(result InspectionResult, includeExternal bool) {
	fmt.Println("System Binary Inspection")
	fmt.Println(strings.Repeat("─", 60))

	if !includeExternal {
		// Simple output - managed binaries only
		printManagedBinariesSimple(result.ManagedBinaries)
	} else {
		// Extended output - both managed and external
		fmt.Println("MANAGED BINARIES (Updatable by Metamorph)")
		fmt.Println(strings.Repeat("─", 60))
		printManagedBinariesTable(result.ManagedBinaries)

		if len(result.ExternalBinaries) > 0 {
			fmt.Println()
			fmt.Println("EXTERNAL BINARIES (Auditable Only)")
			fmt.Println(strings.Repeat("─", 60))
			printExternalBinariesTable(result.ExternalBinaries)
		}
	}

	fmt.Println(strings.Repeat("─", 60))
	printSummary(result.Summary, includeExternal)
}

// printManagedBinariesSimple prints managed binaries in compact format
func printManagedBinariesSimple(binaries []ManagedBinary) {
	for _, bin := range binaries {
		name := padRight(bin.Name, 14)
		version := formatVersion(bin.Version, bin.BuildNumber)
		version = padRight(version, 20)
		size := padLeft(FormatSize(bin.SizeBytes), 9)
		status := formatStatus(bin.Status)

		fmt.Printf("%s %s %s  %s\n", name, version, size, status)
	}
}

// printManagedBinariesTable prints managed binaries with details
func printManagedBinariesTable(binaries []ManagedBinary) {
	for _, bin := range binaries {
		name := padRight(bin.Name, 14)
		version := formatVersion(bin.Version, bin.BuildNumber)
		version = padRight(version, 20)
		size := padLeft(FormatSize(bin.SizeBytes), 9)
		status := formatStatus(bin.Status)

		fmt.Printf("%s %s %s  %s\n", name, version, size, status)
	}
}

// printExternalBinariesTable prints external binaries with update info
func printExternalBinariesTable(binaries []ExternalBinary) {
	for _, bin := range binaries {
		name := padRight(bin.Name, 14)
		version := padRight(bin.Version, 20)
		size := padLeft(FormatSize(bin.SizeBytes), 9)
		status := formatStatus(bin.Status)
		
		updateInfo := ""
		if bin.UpdateAvailable && bin.LatestVersion != "" {
			updateInfo = fmt.Sprintf("  (Update: %s available)", bin.LatestVersion)
		} else if bin.Status == "healthy" && !bin.UpdateAvailable {
			updateInfo = "  (Up to date)"
		}

		fmt.Printf("%s %s %s  %s%s\n", name, version, size, status, updateInfo)
	}
}

// printSummary prints aggregate statistics
func printSummary(summary InspectionSummary, includeExternal bool) {
	if !includeExternal {
		fmt.Printf("Total: %d components, %s\n",
			summary.ManagedCount,
			FormatSize(summary.ManagedSizeBytes))
	} else {
		fmt.Printf("Total: %d components, %s\n",
			summary.TotalBinaries,
			FormatSize(summary.TotalSizeBytes))
		fmt.Printf("Managed: %d binaries (%s)\n",
			summary.ManagedCount,
			FormatSize(summary.ManagedSizeBytes))
		fmt.Printf("External: %d binaries (%s)\n",
			summary.ExternalCount,
			FormatSize(summary.ExternalSizeBytes))
		
		if summary.UpdatesAvailable > 0 {
			fmt.Printf("Updates available: %d external binaries\n", summary.UpdatesAvailable)
		}
	}

	// Show warnings if any issues
	if summary.MissingCount > 0 {
		fmt.Printf("⚠️  Missing: %d binaries\n", summary.MissingCount)
	}
	if summary.CorruptedCount > 0 {
		fmt.Printf("⚠️  Corrupted: %d binaries\n", summary.CorruptedCount)
	}
}

// formatVersion formats version with optional build number
func formatVersion(version string, buildNumber int) string {
	if version == "unknown" || version == "" {
		return "unknown"
	}
	if buildNumber > 0 {
		return fmt.Sprintf("v%s (build %d)", version, buildNumber)
	}
	return fmt.Sprintf("v%s", version)
}

// formatStatus formats the status with appropriate symbol
func formatStatus(status string) string {
	switch status {
	case "healthy":
		return "✓ Healthy"
	case "missing":
		return "✗ Missing"
	case "corrupted":
		return "✗ Corrupted"
	case "unknown":
		return "? Unknown"
	default:
		return status
	}
}

// padRight pads a string to the right
func padRight(s string, length int) string {
	if len(s) >= length {
		return s[:length]
	}
	return s + strings.Repeat(" ", length-len(s))
}

// padLeft pads a string to the left
func padLeft(s string, length int) string {
	if len(s) >= length {
		return s
	}
	return strings.Repeat(" ", length-len(s)) + s
}

// calculateSummary computes aggregate statistics
func calculateSummary(managed []ManagedBinary, external []ExternalBinary) InspectionSummary {
	summary := InspectionSummary{}

	// Count managed binaries
	summary.ManagedCount = len(managed)
	for _, bin := range managed {
		summary.ManagedSizeBytes += bin.SizeBytes
		switch bin.Status {
		case "healthy":
			summary.HealthyCount++
		case "missing":
			summary.MissingCount++
		case "corrupted":
			summary.CorruptedCount++
		}
	}

	// Count external binaries
	summary.ExternalCount = len(external)
	for _, bin := range external {
		summary.ExternalSizeBytes += bin.SizeBytes
		switch bin.Status {
		case "healthy":
			summary.HealthyCount++
		case "missing":
			summary.MissingCount++
		case "corrupted":
			summary.CorruptedCount++
		}
		if bin.UpdateAvailable {
			summary.UpdatesAvailable++
		}
	}

	// Calculate totals
	summary.TotalBinaries = summary.ManagedCount + summary.ExternalCount
	summary.TotalSizeBytes = summary.ManagedSizeBytes + summary.ExternalSizeBytes

	return summary
}