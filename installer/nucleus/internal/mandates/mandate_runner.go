package mandates

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
)

// HooksBaseDir retorna el directorio base de hooks según el OS.
func HooksBaseDir() string {
	switch runtime.GOOS {
	case "windows":
		return filepath.Join(os.Getenv("LOCALAPPDATA"), "BloomNucleus", "hooks")
	case "darwin":
		home, _ := os.UserHomeDir()
		return filepath.Join(home, "Library", "Application Support", "BloomNucleus", "hooks")
	default:
		home, _ := os.UserHomeDir()
		return filepath.Join(home, ".local", "share", "BloomNucleus", "hooks")
	}
}

// DiscoverHooks retorna los scripts Python del evento ordenados por nombre.
// Si el directorio no existe, retorna lista vacía sin error — es válido.
func DiscoverHooks(event string) ([]string, error) {
	dir := filepath.Join(HooksBaseDir(), event)
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, nil
	}
	var scripts []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".py") {
			scripts = append(scripts, filepath.Join(dir, e.Name()))
		}
	}
	sort.Strings(scripts)
	return scripts, nil
}

// RunHook ejecuta un script Python con el contexto via stdin.
// Retorna HookResult parseado desde stdout del script.
func RunHook(ctx context.Context, script string, hctx HookContext) HookResult {
	ctxJSON, _ := json.Marshal(hctx)

	python := "python3"
	if runtime.GOOS == "windows" {
		python = "python"
	}

	cmd := exec.CommandContext(ctx, python, script)
	cmd.Stdin = strings.NewReader(string(ctxJSON))

	out, err := cmd.Output()
	if err != nil {
		return HookResult{
			Hook:    filepath.Base(script),
			Success: false,
			Error:   fmt.Sprintf("execution failed: %v", err),
		}
	}

	var result HookResult
	if err := json.Unmarshal(out, &result); err != nil {
		return HookResult{
			Hook:    filepath.Base(script),
			Success: false,
			Error:   fmt.Sprintf("invalid output: %v", err),
		}
	}

	result.Hook = filepath.Base(script)
	return result
}

// RunEvent descubre y ejecuta todos los hooks de un evento.
// Es el punto de entrada central — usado por la Activity y por el CLI.
func RunEvent(ctx context.Context, event string, hctx HookContext) HooksRunResult {
	scripts, _ := DiscoverHooks(event)

	result := HooksRunResult{
		Event:   event,
		Success: true,
	}

	for _, script := range scripts {
		hr := RunHook(ctx, script, hctx)
		result.Hooks = append(result.Hooks, hr)
		if !hr.Success {
			result.Failed++
			result.Success = false
		}
	}

	result.Total = len(scripts)
	return result
}