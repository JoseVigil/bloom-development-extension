package bootstrap

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"

	"nucleus/internal/core"
	"github.com/spf13/cobra"
)

// ────────────────────────────────────────────────────────────────
// EXIT CODES
// ────────────────────────────────────────────────────────────────

const (
	ExitSuccess      = 0
	ExitGeneralError = 1
	ExitNotRunning   = 2
	ExitNotInstalled = 3
	ExitAlreadyRunning = 4
)

// ────────────────────────────────────────────────────────────────
// SHARED UTILITIES
// ────────────────────────────────────────────────────────────────

// getTemporalExecutablePath devuelve la ruta al ejecutable temporal.exe
func getTemporalExecutablePath() (string, error) {
	userHome, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("failed to get user home: %w", err)
	}

	var basePath string
	if runtime.GOOS == "windows" {
		localAppData := os.Getenv("LOCALAPPDATA")
		if localAppData == "" {
			localAppData = filepath.Join(userHome, "AppData", "Local")
		}
		basePath = filepath.Join(localAppData, "BloomNucleus", "bin", "temporal")
	} else {
		basePath = filepath.Join(userHome, ".bloom-nucleus", "bin", "temporal")
	}

	executablePath := filepath.Join(basePath, "temporal.exe")
	
	if _, err := os.Stat(executablePath); err != nil {
		return "", fmt.Errorf("temporal executable not found at %s", executablePath)
	}

	return executablePath, nil
}

// getPIDFilePath devuelve la ruta al archivo PID
func getPIDFilePath(c *core.Core) string {
	return filepath.Join(c.Paths.Logs, "temporal", "temporal.pid")
}

// getGlobalJSONFlag obtiene el flag --json de manera robusta
func getGlobalJSONFlag(cmd *cobra.Command) bool {
	if cmd == nil {
		return false
	}

	// Intentar obtener flag local primero
	if jsonFlag := cmd.Flags().Lookup("json"); jsonFlag != nil {
		if val, err := cmd.Flags().GetBool("json"); err == nil {
			return val
		}
	}

	// Intentar obtener flag global de root
	if cmd.Root() != nil {
		if jsonFlag := cmd.Root().PersistentFlags().Lookup("json"); jsonFlag != nil {
			if val, err := cmd.Root().PersistentFlags().GetBool("json"); err == nil {
				return val
			}
		}
	}

	return false
}