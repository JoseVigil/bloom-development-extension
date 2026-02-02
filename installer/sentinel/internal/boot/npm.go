package boot

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

// LaunchApiServer inicia el servidor Fastify independiente
func LaunchApiServer(extPath string) (*exec.Cmd, error) {
	if extPath == "" {
		return nil, fmt.Errorf("extensionPath no definido")
	}

	// Ruta al entrypoint compilado de la API
	apiEntry := filepath.Join(extPath, "out", "extension.js")
	
	// Verificar que existe
	if _, err := os.Stat(apiEntry); os.IsNotExist(err) {
		return nil, fmt.Errorf("API entrypoint no encontrado: %s", apiEntry)
	}

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command("node", apiEntry)
	} else {
		cmd = exec.Command("node", apiEntry)
	}

	cmd.Dir = extPath
	cmd.Env = append(os.Environ(), "PORT=48215")
	cmd.Stdout = &prefixedWriter{prefix: "[API] ", out: os.Stderr}
	cmd.Stderr = &prefixedWriter{prefix: "[API-ERR] ", out: os.Stderr}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("error iniciando API server: %w", err)
	}

	fmt.Fprintf(os.Stderr, "[API] Servidor iniciado (PID: %d)\n", cmd.Process.Pid)
	return cmd, nil
}

// LaunchSvelte inicia el servidor de desarrollo Svelte
func LaunchSvelte(extPath string) (*exec.Cmd, error) {
	if extPath == "" {
		return nil, fmt.Errorf("extensionPath no definido")
	}

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command("npm", "run", "dev")
	} else {
		cmd = exec.Command("npm", "run", "dev")
	}

	cmd.Dir = extPath
	cmd.Stdout = &prefixedWriter{prefix: "[SVELTE] ", out: os.Stderr}
	cmd.Stderr = &prefixedWriter{prefix: "[SVELTE-ERR] ", out: os.Stderr}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("error iniciando Svelte: %w", err)
	}

	fmt.Fprintf(os.Stderr, "[SVELTE] Servidor iniciado (PID: %d)\n", cmd.Process.Pid)
	return cmd, nil
}

// prefixedWriter añade prefijo a cada línea
type prefixedWriter struct {
	prefix string
	out    *os.File
}

func (pw *prefixedWriter) Write(p []byte) (n int, err error) {
	// Escribir con prefijo
	_, err = fmt.Fprintf(pw.out, "%s%s", pw.prefix, string(p))
	return len(p), err
}