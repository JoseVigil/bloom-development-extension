package mandates

import (
	"context"
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

// nucleusBin resuelve el path al binario de nucleus según el OS.
// Usado por el worker para construir el HookContext correctamente.
func nucleusBin() string {
	switch runtime.GOOS {
	case "windows":
		return filepath.Join(os.Getenv("LOCALAPPDATA"), "BloomNucleus", "bin", "nucleus", "nucleus.exe")
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
		return filepath.Join(os.Getenv("LOCALAPPDATA"), "BloomNucleus", "logs")
	case "darwin":
		home, _ := os.UserHomeDir()
		return filepath.Join(home, "Library", "Application Support", "BloomNucleus", "logs")
	default:
		home, _ := os.UserHomeDir()
		return filepath.Join(home, ".local", "share", "BloomNucleus", "logs")
	}
}

// NewHookContext construye el HookContext estándar para el worker.
// El worker de Temporal llama esto para armar el contexto antes de
// invocar RunPostLaunchHooksActivity.
func NewHookContext(launchID, profileID string) HookContext {
	return HookContext{
		LaunchID:   launchID,
		ProfileID:  profileID,
		LogBaseDir: logBaseDir(),
		NucleusBin: nucleusBin(),
	}
}