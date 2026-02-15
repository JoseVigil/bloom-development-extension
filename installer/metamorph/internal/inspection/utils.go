package inspection

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"os/exec"
	"regexp"
	"runtime"
	"strings"
	"time"
)

// CalculateSHA256 computes the SHA-256 hash of a file
func CalculateSHA256(filePath string) (string, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return "", err
	}
	defer file.Close()

	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", err
	}

	return hex.EncodeToString(hash.Sum(nil)), nil
}

// ExecuteCommandWithTimeout executes a command with a timeout and returns stdout
func ExecuteCommandWithTimeout(binary string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, binary, args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return "", fmt.Errorf("command timed out after 5 seconds")
		}
		return string(output), err
	}

	return string(output), nil
}

// ParseVersionFromOutput extracts version from various output formats
func ParseVersionFromOutput(output string) string {
	// Common version patterns
	patterns := []string{
		`version\s+is\s+([0-9]+\.[0-9]+\.[0-9]+[^\s]*)`,      // "version is 0.1.25"
		`version\s+([0-9]+\.[0-9]+\.[0-9]+[^\s]*)`,           // "version 1.22.0"
		`v([0-9]+\.[0-9]+\.[0-9]+[^\s]*)`,                    // "v20.11.0"
		`([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)`,                   // "146.0.7635.0"
		`([0-9]+\.[0-9]+\.[0-9]+)`,                           // "1.0.0"
	}

	for _, pattern := range patterns {
		re := regexp.MustCompile(pattern)
		matches := re.FindStringSubmatch(output)
		if len(matches) > 1 {
			return strings.TrimSpace(matches[1])
		}
	}

	return "unknown"
}

// FormatSize converts bytes to human-readable format
func FormatSize(bytes int64) string {
	const (
		KB = 1024
		MB = KB * 1024
		GB = MB * 1024
	)

	switch {
	case bytes >= GB:
		return fmt.Sprintf("%.1f GB", float64(bytes)/float64(GB))
	case bytes >= MB:
		return fmt.Sprintf("%.1f MB", float64(bytes)/float64(MB))
	case bytes >= KB:
		return fmt.Sprintf("%.1f KB", float64(bytes)/float64(KB))
	default:
		return fmt.Sprintf("%d B", bytes)
	}
}

// GetBasePath resolves the base path for BloomNucleus binaries
func GetBasePath() string {
	// Check environment variable first
	if envPath := os.Getenv("BLOOM_NUCLEUS_HOME"); envPath != "" {
		return envPath
	}

	// Platform-specific defaults
	homeDir, err := os.UserHomeDir()
	if err != nil {
		homeDir = "~"
	}

	switch runtime.GOOS {
	case "windows":
		return homeDir + `\AppData\Local\BloomNucleus\bin`
	case "darwin":
		return homeDir + "/Library/Application Support/BloomNucleus/bin"
	default: // linux and others
		return homeDir + "/.local/share/BloomNucleus/bin"
	}
}

// FileExists checks if a file exists and is not a directory
func FileExists(path string) bool {
	info, err := os.Stat(path)
	if err != nil {
		return false
	}
	return !info.IsDir()
}

// GetFileInfo returns file size and modification time
func GetFileInfo(path string) (size int64, modTime time.Time, err error) {
	info, err := os.Stat(path)
	if err != nil {
		return 0, time.Time{}, err
	}
	return info.Size(), info.ModTime(), nil
}

// buildPath constructs the full path to a binary
func buildPath(basePath, relativePath string) string {
	if runtime.GOOS == "windows" {
		return basePath + `\` + strings.ReplaceAll(relativePath, "/", `\`)
	}
	return basePath + "/" + relativePath
}

// extractBinaryName extracts display name from path (e.g., "brain/brain.exe" -> "Brain")
func extractBinaryName(path string) string {
	parts := strings.Split(strings.ReplaceAll(path, `\`, "/"), "/")
	if len(parts) == 0 {
		return "Unknown"
	}
	
	filename := parts[len(parts)-1]
	name := strings.TrimSuffix(filename, ".exe")
	name = strings.TrimSuffix(name, ".blx")
	
	// Special case for bloom-* binaries
	if strings.HasPrefix(name, "bloom-") {
		name = strings.TrimPrefix(name, "bloom-")
	}
	
	// Capitalize first letter
	if len(name) > 0 {
		return strings.ToUpper(name[:1]) + name[1:]
	}
	
	return name
}