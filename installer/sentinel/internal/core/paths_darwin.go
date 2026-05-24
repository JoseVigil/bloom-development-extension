//go:build darwin

package core

import (
	"os"
	"path/filepath"
)

func resolveAppDataDir() string {
	home, _ := os.UserHomeDir()
	if home == "" {
		home = os.Getenv("HOME")
	}
	return filepath.Join(home, "Library", "BloomNucleus")
}

func nucleusBinaryName() string { return "nucleus" }
