//go:build linux

package core

import (
	"os"
	"path/filepath"
)

func resolveAppDataDir() string {
	// XDG_DATA_HOME es el estándar en Linux; fallback a ~/.local/share
	if xdg := os.Getenv("XDG_DATA_HOME"); xdg != "" {
		return filepath.Join(xdg, "BloomNucleus")
	}
	home, _ := os.UserHomeDir()
	if home == "" {
		home = os.Getenv("HOME")
	}
	return filepath.Join(home, ".local", "share", "BloomNucleus")
}

func nucleusBinaryName() string { return "nucleus" }
