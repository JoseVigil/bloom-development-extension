//go:build windows

package core

import (
	"os"
	"path/filepath"
)

func resolveAppDataDir() string {
	localAppData := os.Getenv("LOCALAPPDATA")
	if localAppData == "" {
		localAppData = filepath.Join(os.Getenv("USERPROFILE"), "AppData", "Local")
	}
	return filepath.Join(localAppData, "BloomNucleus")
}

func nucleusBinaryName() string { return "nucleus.exe" }
