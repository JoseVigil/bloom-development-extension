package mandates

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"time"

	"go.temporal.io/sdk/activity"
)

// ─── helpers ─────────────────────────────────────────────────────────────────

// nucleusBin retorna el path al binario nucleus según el OS.
func nucleusBin() string {
	switch runtime.GOOS {
	case "windows":
		return filepath.Join(
			os.Getenv("LOCALAPPDATA"),
			"BloomNucleus", "bin", "nucleus", "nucleus.exe",
		)
	case "darwin":
		home, _ := os.UserHomeDir()
		return filepath.Join(home, "Library", "Application Support",
			"BloomNucleus", "bin", "nucleus", "nucleus")
	default:
		home, _ := os.UserHomeDir()
		return filepath.Join(home, ".local", "share",
			"BloomNucleus", "bin", "nucleus", "nucleus")
	}
}

// logBaseDir retorna el directorio base de logs según el OS.
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

// NewHookContext construye un HookContext listo para pasarle a RunEvent/RunHook.
// Usa los defaults del OS para LogBaseDir y NucleusBin.
func NewHookContext(launchID, profileID string) HookContext {
	return HookContext{
		LaunchID:   launchID,
		ProfileID:  profileID,
		LogBaseDir: logBaseDir(),
		NucleusBin: nucleusBin(),
	}
}

// NewHookContextWithPaths construye un HookContext con paths explícitos.
// Usado por brain_poller donde los paths ya vienen del PathConfig del worker.
func NewHookContextWithPaths(launchID, profileID, logDir, nucleusExe string) HookContext {
	if logDir == "" {
		logDir = logBaseDir()
	}
	if nucleusExe == "" {
		nucleusExe = nucleusBin()
	}
	return HookContext{
		LaunchID:   launchID,
		ProfileID:  profileID,
		LogBaseDir: logDir,
		NucleusBin: nucleusExe,
	}
}

// ─── activities ───────────────────────────────────────────────────────────────

// RunPostLaunchHooksActivity ejecuta todos los hooks del evento "post_launch".
// Best-effort: nunca retorna error — fallos individuales quedan registrados en
// HooksRunResult.Hooks para diagnóstico en la UI de Temporal.
func RunPostLaunchHooksActivity(ctx context.Context, hctx HookContext) (HooksRunResult, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("RunPostLaunchHooksActivity started",
		"launch_id", hctx.LaunchID,
		"profile_id", hctx.ProfileID,
	)

	// Heartbeat periódico para que Temporal sepa que la activity sigue viva
	// mientras los hooks corren (algunos pueden tardar varios segundos).
	heartbeatDone := make(chan struct{})
	go func() {
		defer close(heartbeatDone)
		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				activity.RecordHeartbeat(ctx, "running hooks")
			}
		}
	}()

	result := RunEvent(ctx, "post_launch", hctx)

	<-heartbeatDone

	logger.Info("RunPostLaunchHooksActivity completed",
		"total", result.Total,
		"failed", result.Failed,
		"success", result.Success,
	)

	// Best-effort: siempre nil error — los fallos individuales están en result.Hooks
	return result, nil
}

// RunProfileDisconnectedHooksActivity ejecuta todos los hooks del evento
// "profile_disconnected". Se invoca desde el brain_poller cuando Brain
// emite PROFILE_DISCONNECTED (Chrome cerró).
//
// Best-effort: nunca retorna error — el hook 00_notify_temporal.py es
// responsable de traducir el evento a una señal Temporal.
func RunProfileDisconnectedHooksActivity(ctx context.Context, hctx HookContext) (HooksRunResult, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("RunProfileDisconnectedHooksActivity started",
		"profile_id", hctx.ProfileID,
	)

	heartbeatDone := make(chan struct{})
	go func() {
		defer close(heartbeatDone)
		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				activity.RecordHeartbeat(ctx, "running profile_disconnected hooks")
			}
		}
	}()

	result := RunEvent(ctx, "profile_disconnected", hctx)

	<-heartbeatDone

	if result.Success {
		logger.Info("RunProfileDisconnectedHooksActivity completed",
			"total", result.Total,
		)
	} else {
		logger.Warn("RunProfileDisconnectedHooksActivity partial failure",
			"total", result.Total,
			"failed", result.Failed,
			"details", fmt.Sprintf("%+v", result.Hooks),
		)
	}

	// Best-effort: nunca retornar error al workflow
	return result, nil
}