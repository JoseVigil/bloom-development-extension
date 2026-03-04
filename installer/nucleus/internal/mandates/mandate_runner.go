package mandates

import (
	"bytes"
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
//
// Notas de implementación:
//   - Captura stdout y stderr por separado para no perder diagnóstico.
//   - NO usa cmd.Output() porque descarta stdout cuando exit != 0.
//     En su lugar usa cmd.Run() e ignora el exit code — la señal de
//     éxito/fallo es el campo Success del HookResult JSON, no el exit code.
//   - Si stdout no es JSON parseable, se construye un HookResult de error
//     que incluye el stdout y stderr completos para facilitar el diagnóstico.
func RunHook(ctx context.Context, script string, hctx HookContext) HookResult {
	ctxJSON, _ := json.Marshal(hctx)

	python := "python3"
	if runtime.GOOS == "windows" {
		python = "python"
	}

	cmd := exec.CommandContext(ctx, python, script)
	cmd.Stdin = strings.NewReader(string(ctxJSON))

	var stdoutBuf, stderrBuf bytes.Buffer
	cmd.Stdout = &stdoutBuf
	cmd.Stderr = &stderrBuf

	// cmd.Run() — ignoramos el exit code deliberadamente.
	// El contrato con los hooks es que reporten Success via JSON,
	// no via exit code. Un exit != 0 no debe descartar el stdout.
	_ = cmd.Run()

	rawOut := stdoutBuf.Bytes()
	rawErr := stderrBuf.String()

	// Extraer la primera línea JSON del stdout.
	// nucleus logs synapse puede emitir líneas de texto antes del JSON
	// cuando no corre en modo --json; buscamos la primera línea que
	// empiece con '{' para tolerar ese prefijo de texto humano.
	jsonLine := ""
	for _, line := range strings.Split(string(rawOut), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "{") {
			jsonLine = line
			break
		}
	}

	if jsonLine == "" {
		// stdout vacío o sin JSON — construir error con todo el contexto
		return HookResult{
			Hook:    filepath.Base(script),
			Success: false,
			Stdout:  strings.TrimSpace(string(rawOut)),
			Stderr:  strings.TrimSpace(rawErr),
			Error:   "no JSON found in hook stdout",
		}
	}

	var result HookResult
	if err := json.Unmarshal([]byte(jsonLine), &result); err != nil {
		return HookResult{
			Hook:    filepath.Base(script),
			Success: false,
			Stdout:  strings.TrimSpace(string(rawOut)),
			Stderr:  strings.TrimSpace(rawErr),
			Error:   fmt.Sprintf("invalid output: %v", err),
		}
	}

	result.Hook = filepath.Base(script)
	// Preservar stderr capturado aunque el hook haya reportado Success=true,
	// para que RunEvent lo pueda incluir en los logs si es necesario.
	if result.Stderr == "" && rawErr != "" {
		result.Stderr = strings.TrimSpace(rawErr)
	}
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