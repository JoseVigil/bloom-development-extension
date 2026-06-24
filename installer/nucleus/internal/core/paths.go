package core

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

type Paths struct {
	BinDir       string // bin\ raíz — chrome, host, extensions, nucleus
	SentinelDir  string // bin\sentinel\ — config y binario propio de sentinel
	AppDataDir   string
	ProfilesDir  string
	LogsDir      string
	TelemetryDir string
	NucleusBin   string // Ruta absoluta a nucleus.exe — escritor único de telemetry.json
}

func InitPaths() (*Paths, error) {
	exe, err := os.Executable()
	if err != nil {
		return nil, err
	}
	// sentinel.exe vive en bin\sentinel\ — separamos los dos conceptos:
	// SentinelDir = bin\sentinel\  (config propia, binario sentinel)
	// BinDir      = bin\           (chrome, host, extensions, nucleus)
	sentinelDir := filepath.Dir(exe)
	binDir := filepath.Dir(sentinelDir)

	// Resolve appDataDir cross-platform: BLOOM_APPDATA_DIR overrides everything.
	// On Windows use LOCALAPPDATA; on macOS use ~/Library/BloomNucleus;
	// on Linux use ~/.local/share/BloomNucleus (XDG Base Directory spec).
	appDataDir := os.Getenv("BLOOM_APPDATA_DIR")
	if appDataDir == "" {
		home, _ := os.UserHomeDir()
		switch runtime.GOOS {
		case "windows":
			localAppData := os.Getenv("LOCALAPPDATA")
			if localAppData == "" {
				localAppData = filepath.Join(home, "AppData", "Local")
			}
			appDataDir = filepath.Join(localAppData, "BloomNucleus")
		case "darwin":
			appDataDir = filepath.Join(home, "Library", "BloomNucleus")
		default:
			// Linux — XDG Base Directory spec: $XDG_DATA_HOME/BloomNucleus
			// Falls back to ~/.local/share/BloomNucleus if XDG_DATA_HOME is not set.
			xdgDataHome := os.Getenv("XDG_DATA_HOME")
			if xdgDataHome == "" {
				xdgDataHome = filepath.Join(home, ".local", "share")
			}
			appDataDir = filepath.Join(xdgDataHome, "BloomNucleus")
		}
	}

	// Resolve nucleus binary: try without extension first (macOS/Linux), then .exe (Windows).
	nucleusBin := filepath.Join(binDir, "nucleus", "nucleus")
	if _, err := os.Stat(nucleusBin); err != nil {
		nucleusBin = filepath.Join(binDir, "nucleus", "nucleus.exe")
	}

	paths := &Paths{
		BinDir:       binDir,
		SentinelDir:  sentinelDir,
		AppDataDir:   appDataDir,
		ProfilesDir:  filepath.Join(appDataDir, "profiles"),
		LogsDir:      filepath.Join(appDataDir, "logs"),
		TelemetryDir: filepath.Join(appDataDir, "logs"),
		NucleusBin:   nucleusBin,
	}

	dirs := []string{paths.AppDataDir, paths.ProfilesDir, paths.LogsDir}
	for _, dir := range dirs {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return nil, err
		}
	}

	return paths, nil
}

// ResolveBrainPath localiza el binario "brain" siguiendo esta precedencia:
//
//  1. Variable de entorno BLOOM_BRAIN_PATH (override explícito)
//  2. Mismo directorio que el ejecutable nucleus en ejecución
//  3. PATH del sistema operativo
//
// Si ninguna estrategia localiza el binario, retorna un error descriptivo
// para que el caller pueda emitir un mensaje claro al usuario.
func ResolveBrainPath() (string, error) {
	// ── 1. Variable de entorno explícita ──────────────────────────────────
	if p := os.Getenv("BLOOM_BRAIN_PATH"); p != "" {
		return p, nil
	}

	// ── 2. Mismo directorio que el ejecutable nucleus en ejecución ────────
	execPath, err := os.Executable()
	if err == nil {
		candidate := filepath.Join(filepath.Dir(execPath), "brain")
		if runtime.GOOS == "windows" {
			candidate += ".exe"
		}
		if _, statErr := os.Stat(candidate); statErr == nil {
			return candidate, nil
		}
	}

	// ── 3. PATH del sistema ────────────────────────────────────────────────
	if found, lookErr := exec.LookPath("brain"); lookErr == nil {
		return found, nil
	}

	return "", fmt.Errorf(
		"brain binary not found: set BLOOM_BRAIN_PATH or ensure brain is in PATH",
	)
}

func (p *Paths) String() string {
	var sb strings.Builder
	sb.WriteString("Rutas del Sistema:\n")
	sb.WriteString("  BinDir:      " + p.BinDir + "\n")
	sb.WriteString("  SentinelDir: " + p.SentinelDir + "\n")
	sb.WriteString("  AppDataDir:  " + p.AppDataDir + "\n")
	sb.WriteString("  ProfilesDir: " + p.ProfilesDir + "\n")
	sb.WriteString("  LogsDir:     " + p.LogsDir + "\n")
	sb.WriteString("  NucleusBin:  " + p.NucleusBin + "\n")
	return sb.String()
}
