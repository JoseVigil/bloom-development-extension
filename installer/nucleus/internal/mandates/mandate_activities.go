package mandates

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"

	"go.temporal.io/sdk/activity"
)

// RunPostLaunchHooksActivity es la Temporal Activity que ejecuta
// todos los hooks registrados bajo post_launch.
//
// Contrato:
//   - No retorna error al workflow — los hooks son best-effort
//   - El workflow de perfil no se bloquea si un hook falla
//   - Cada hook individual registra su propio éxito/fallo en HooksRunResult
func RunPostLaunchHooksActivity(ctx context.Context, hctx HookContext) (HooksRunResult, error) {
	logger := activity.GetLogger(ctx)

	scripts, _ := DiscoverHooks("post_launch")
	if len(scripts) == 0 {
		logger.Info("No post_launch hooks registered, skipping")
		return HooksRunResult{Event: "post_launch", Success: true}, nil
	}

	logger.Info("Running post_launch hooks", "count", len(scripts), "launch_id", hctx.LaunchID)

	result := RunEvent(ctx, "post_launch", hctx)

	if result.Failed > 0 {
		logger.Warn("Some post_launch hooks failed",
			"total", result.Total,
			"failed", result.Failed,
			"launch_id", hctx.LaunchID,
		)
	} else {
		logger.Info("All post_launch hooks completed",
			"total", result.Total,
			"launch_id", hctx.LaunchID,
		)
	}

	// Nunca retornar error — los hooks no bloquean el workflow
	return result, nil
}

// resolveBloomBase resuelve la raíz de BloomNucleus en Windows.
//
// Orden de prioridad (mismo patrón que _resolve_bloom_root en synapse_host_init_manager.py):
//  1. Variable de entorno BLOOM_DIR (inyectada por Brain en _build_env)
//  2. os.Executable() — nucleus.exe está en <bloom_base>/bin/nucleus/nucleus.exe,
//     por lo tanto bloom_base = filepath.Dir(filepath.Dir(filepath.Dir(exe)))
//  3. LOCALAPPDATA/BloomNucleus como último fallback (entornos de desarrollo)
func resolveBloomBase() string {
	// 1. BLOOM_DIR explícito
	if bloomDir := os.Getenv("BLOOM_DIR"); bloomDir != "" {
		return bloomDir
	}

	// 2. Derivar desde la ubicación del ejecutable actual
	if exe, err := os.Executable(); err == nil {
		// exe   = <bloom_base>/bin/nucleus/nucleus.exe
		// Dir   = <bloom_base>/bin/nucleus
		// Dir   = <bloom_base>/bin
		// Dir   = <bloom_base>
		base := filepath.Dir(filepath.Dir(filepath.Dir(exe)))
		if base != "" && base != "." {
			return base
		}
	}

	// 3. Fallback: LOCALAPPDATA (solo válido fuera del contexto SYSTEM)
	return filepath.Join(os.Getenv("LOCALAPPDATA"), "BloomNucleus")
}

// nucleusBin resuelve el path al binario de nucleus según el OS.
// Usado por el worker para construir el HookContext correctamente.
func nucleusBin() string {
	switch runtime.GOOS {
	case "windows":
		return filepath.Join(resolveBloomBase(), "bin", "nucleus", "nucleus.exe")
	case "darwin":
		home, _ := os.UserHomeDir()
		return filepath.Join(home, "Library", "Application Support", "BloomNucleus", "bin", "nucleus")
	default:
		home, _ := os.UserHomeDir()
		return filepath.Join(home, ".local", "share", "BloomNucleus", "bin", "nucleus")
	}
}

// logBaseDir resuelve el directorio base de logs según el OS.
func logBaseDir() string {
	switch runtime.GOOS {
	case "windows":
		return filepath.Join(resolveBloomBase(), "logs")
	case "darwin":
		home, _ := os.UserHomeDir()
		return filepath.Join(home, "Library", "Application Support", "BloomNucleus", "logs")
	default:
		home, _ := os.UserHomeDir()
		return filepath.Join(home, ".local", "share", "BloomNucleus", "logs")
	}
}

// profilesJSON es la estructura mínima necesaria para leer profiles.json.
type profilesJSON struct {
	Profiles []struct {
		ID           string `json:"id"`
		LastLaunchID string `json:"last_launch_id"`
	} `json:"profiles"`
}

// resolveIgnitionID lee config/profiles.json y devuelve el last_launch_id
// del perfil indicado.
//
// El ignition ID (ej: "001_0cdcd75e_132129") es el prefijo real de los logs
// de Chrome generados por Sentinel. Es distinto del Temporal launch_id
// (ej: "launch_{uuid}_{nanoseconds}") que usa el workflow internamente.
// El hook 00_generate_synapse_trace.py espera el ignition ID para hacer
// rglob de {launch_id}_debug.log en log_base_dir.
//
// Si no puede resolverse (perfil no encontrado, archivo no existe, etc.)
// retorna el temporalLaunchID recibido como fallback, preservando el
// comportamiento anterior.
func resolveIgnitionID(profileID, temporalLaunchID string) string {
	profilesPath := filepath.Join(resolveBloomBase(), "config", "profiles.json")

	data, err := os.ReadFile(profilesPath)
	if err != nil {
		return temporalLaunchID
	}

	var pj profilesJSON
	if err := json.Unmarshal(data, &pj); err != nil {
		return temporalLaunchID
	}

	for _, p := range pj.Profiles {
		if p.ID == profileID && p.LastLaunchID != "" {
			return p.LastLaunchID
		}
	}

	return temporalLaunchID
}

// NewHookContext construye el HookContext estándar para el worker.
// El worker de Temporal llama esto para armar el contexto antes de
// invocar RunPostLaunchHooksActivity.
//
// El LaunchID que se pasa al HookContext es el ignition ID del perfil
// (ej: "001_0cdcd75e_132129"), leído desde config/profiles.json.
// Este es el ID que usan los logs de Chrome y que el hook
// 00_generate_synapse_trace.py necesita para localizar los archivos
// {launch_id}_debug.log y {launch_id}_netlog.json en log_base_dir.
func NewHookContext(launchID, profileID string) HookContext {
	return HookContext{
		LaunchID:   resolveIgnitionID(profileID, launchID),
		ProfileID:  profileID,
		LogBaseDir: logBaseDir(),
		NucleusBin: nucleusBin(),
	}
}