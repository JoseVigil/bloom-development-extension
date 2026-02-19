// ignition_spec.go
package ignition

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"time"
)

// loadIgnitionSpec carga la configuración de lanzamiento del perfil.
// Usa ig.SpecPath resuelto desde profiles.json vía getProfileData() —
// NO reconstruye la ruta desde ProfilesDir para no acoplar esta función
// a la convención de rutas del runtime de Chromium.
func (ig *Ignition) loadIgnitionSpec(profileID string) (*IgnitionSpec, error) {
	specPath := ig.SpecPath
	if specPath == "" {
		return nil, fmt.Errorf(
			"SpecPath no inicializado para perfil %s — getProfileData() debe ejecutarse antes de execute()",
			profileID,
		)
	}

	data, err := os.ReadFile(specPath)
	if err != nil {
		return nil, fmt.Errorf("no se pudo leer ignition_spec.json para perfil %s: %w", profileID, err)
	}

	var spec IgnitionSpec
	if err := json.Unmarshal(data, &spec); err != nil {
		return nil, fmt.Errorf("ignition_spec.json inválido para %s: %w", profileID, err)
	}

	// Saneamiento de campos
	if spec.Engine.Executable == "" {
		spec.Engine.Executable = filepath.Join(ig.Core.Paths.BinDir, "chrome-win", "chrome.exe")
		if runtime.GOOS == "darwin" {
			spec.Engine.Executable = filepath.Join(ig.Core.Paths.BinDir, "Chromium.app", "Contents", "MacOS", "Chromium")
		} else if runtime.GOOS == "linux" {
			spec.Engine.Executable = filepath.Join(ig.Core.Paths.BinDir, "chrome")
		}
	}

	if spec.Paths.UserData == "" {
		spec.Paths.UserData = filepath.Join(ig.Core.Paths.ProfilesDir, profileID, "userdata")
	}

	if spec.Paths.Extension == "" {
		spec.Paths.Extension = filepath.Join(ig.Core.Paths.BinDir, "extensions", "bloom-main")
	}

	// LogsBase apunta al directorio del perfil: logs/sentinel/profiles/<profileID>
	// LogsDir ya es logs/sentinel/ — NO agregar "sentinel" de nuevo.
	// buildSilentLaunchArgs lo usa directamente — NO agrega profileID de nuevo.
	if spec.Paths.LogsBase == "" {
		spec.Paths.LogsBase = filepath.Join(ig.Core.Paths.LogsDir, "profiles", profileID)
	}

	spec.ProfileID = profileID
	if ig.Session.LaunchID != "" {
		spec.LaunchID = ig.Session.LaunchID
	}

	return &spec, nil
}

// buildSilentLaunchArgs arma la lista completa de argumentos para Chromium en modo silencioso/controlado
func (ig *Ignition) buildSilentLaunchArgs(spec *IgnitionSpec, mode string) []string {
	var args []string

	// 1. Flags definidos en la spec (si existen)
	args = append(args, spec.EngineFlags...)

	// 2. Flags de silencio / hardening / headless-like
	silentFlags := []string{
		"--no-first-run",
		"--no-default-browser-check",
		"--disable-breakpad",
		"--disable-crash-reporter",
		"--disable-background-networking",
		"--disable-background-timer-throttling",
		"--disable-renderer-backgrounding",
		"--disable-features=Translate",
		"--disable-sync",
		"--disable-notifications",
		"--noerrdialogs",
		"--disable-gpu",
		"--disable-software-rasterizer",
		"--mute-audio",
		"--remote-debugging-port=9222",
		"--remote-allow-origins=*",
	}

	if runtime.GOOS == "windows" {
		silentFlags = append(silentFlags,
			"--disable-features=RendererCodeIntegrity",
		)
	}

	args = append(args, silentFlags...)

	// 3. Directorio de usuario y extensión
	if spec.Paths.UserData != "" {
		args = append(args, fmt.Sprintf("--user-data-dir=%s", spec.Paths.UserData))
	}
	if spec.Paths.Extension != "" {
		args = append(args, fmt.Sprintf("--load-extension=%s", spec.Paths.Extension))
	}

	// 4. Logging de Chromium
	//    spec.Paths.LogsBase ya apunta a logs/sentinel/profiles/<profileID>
	//    (establecido en seed.go y/o saneado en loadIgnitionSpec).
	//    NO concatenar spec.ProfileID de nuevo — causaría doble anidamiento.
	logDir := spec.Paths.LogsBase
	_ = os.MkdirAll(logDir, 0755)
	timestamp := time.Now().Format("20060102-150405")
	logPrefix := filepath.Join(logDir, timestamp)

	args = append(args,
		fmt.Sprintf("--log-net-log=%s_netlog.json", logPrefix),
		"--net-log-capture-mode=IncludeAll",
		fmt.Sprintf("--log-file=%s_debug.log", logPrefix),
	)

	// 5. URL de destino (ya debería estar seteada en prepareSessionFiles)
	if spec.TargetURL != "" {
		args = append(args, spec.TargetURL)
	}

	// 6. Flags adicionales custom del perfil
	args = append(args, spec.CustomFlags...)

	return args
}