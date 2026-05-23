package core

import (
	"os"
	"path/filepath"
	"runtime"
)

// GetBaseAppDataPath returns the platform-correct root for BloomNucleus.
//
//   Windows : %LOCALAPPDATA%\BloomNucleus
//   macOS   : ~/Library/BloomNucleus
//   Linux   : ~/.local/share/BloomNucleus
func GetBaseAppDataPath() string {
	switch runtime.GOOS {
	case "windows":
		localAppData := os.Getenv("LOCALAPPDATA")
		if localAppData == "" {
			home, _ := os.UserHomeDir()
			localAppData = filepath.Join(home, "AppData", "Local")
		}
		return filepath.Join(localAppData, "BloomNucleus")

	case "darwin":
		home, _ := os.UserHomeDir()
		return filepath.Join(home, "Library", "BloomNucleus")

	default: // linux and anything else
		home, _ := os.UserHomeDir()
		return filepath.Join(home, ".local", "share", "BloomNucleus")
	}
}

// GetBinPath returns <base>/bin — where all managed and external binaries live.
func GetBinPath() string {
	return filepath.Join(GetBaseAppDataPath(), "bin")
}

// GetConfigPath returns <base>/config — where metamorph.json and friends live.
func GetConfigPath() string {
	return filepath.Join(GetBaseAppDataPath(), "config")
}

// GetStagingPath returns <base>/staging — Metamorph's transient work area.
func GetStagingPath() string {
	return filepath.Join(GetBaseAppDataPath(), "staging")
}

// GetLogsPath returns <base>/logs — where all log files are written.
func GetLogsPath() string {
	return filepath.Join(GetBaseAppDataPath(), "logs")
}

// ExeName appends ".exe" on Windows and returns the name unchanged on every
// other platform. Use this whenever you need to resolve a binary file name.
//
//	ExeName("brain")      → "brain"      (macOS/Linux)
//	ExeName("brain")      → "brain.exe"  (Windows)
func ExeName(name string) string {
	if runtime.GOOS == "windows" {
		return name + ".exe"
	}
	return name
}

// NativeBinDir returns the path to the native build output directory for the
// current platform, rooted at repoRoot.
//
// Layout expected by the build system:
//
//	<repoRoot>/installer/native/bin/darwin_arm64/
//	<repoRoot>/installer/native/bin/darwin_x64/
//	<repoRoot>/installer/native/bin/windows/
//	<repoRoot>/installer/native/bin/linux/
func NativeBinDir(repoRoot string) string {
	if runtime.GOOS == "darwin" {
		arch := "darwin_x64"
		if runtime.GOARCH == "arm64" {
			arch = "darwin_arm64"
		}
		return filepath.Join(repoRoot, "installer", "native", "bin", arch)
	}
	return filepath.Join(repoRoot, "installer", "native", "bin", runtime.GOOS)
}
