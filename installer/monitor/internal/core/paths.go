package core

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

type Paths struct {
	AppDataDir string
	LogsDir    string
	NucleusBin string
}

// Matches Nucleus ResolveAppDataDir, including explicit installation override.
func ResolvePaths() (Paths, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return Paths{}, err
	}
	base := os.Getenv("BLOOM_APPDATA_DIR")
	if base == "" {
		switch runtime.GOOS {
		case "windows":
			d := os.Getenv("LOCALAPPDATA")
			if d == "" {
				d = filepath.Join(home, "AppData", "Local")
			}
			base = filepath.Join(d, "BloomNucleus")
		case "darwin":
			base = filepath.Join(home, "Library", "BloomNucleus")
		default:
			d := os.Getenv("XDG_DATA_HOME")
			if d == "" {
				d = filepath.Join(home, ".local", "share")
			}
			base = filepath.Join(d, "BloomNucleus")
		}
	}
	base, err = filepath.Abs(base)
	if err != nil {
		return Paths{}, err
	}
	name := "nucleus"
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	candidates := []string{filepath.Join(base, "bin", "nucleus", name)}
	if exe, e := os.Executable(); e == nil {
		candidates = append(candidates, filepath.Join(filepath.Dir(exe), "..", "nucleus", name))
	}
	if path, e := exec.LookPath(name); e == nil {
		candidates = append(candidates, path)
	}
	for _, path := range candidates {
		if info, e := os.Stat(path); e == nil && !info.IsDir() {
			abs, e := filepath.Abs(path)
			if e != nil {
				return Paths{}, e
			}
			return Paths{base, filepath.Join(base, "logs"), abs}, nil
		}
	}
	return Paths{}, fmt.Errorf("Nucleus executable unavailable; telemetry registration required")
}
