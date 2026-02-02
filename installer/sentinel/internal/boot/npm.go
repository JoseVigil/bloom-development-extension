package boot

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

// prefixedWriter añade prefijo a cada línea para distinguir API de SVELTE en la consola
type prefixedWriter struct {
	prefix string
	out    *os.File
}

func (pw *prefixedWriter) Write(p []byte) (n int, err error) {
	_, err = fmt.Fprintf(pw.out, "%s%s", pw.prefix, string(p))
	return len(p), err
}

// LaunchApiServer inicia el servidor de la API/Swagger
func LaunchApiServer(serverPath string) (*exec.Cmd, error) {
	if serverPath == "" {
		return nil, fmt.Errorf("serverPath no definido")
	}

	// Verificar que el archivo existe antes de lanzar
	if _, err := os.Stat(serverPath); os.IsNotExist(err) {
		return nil, fmt.Errorf("API entrypoint no encontrado: %s", serverPath)
	}

	cmd := exec.Command("node", serverPath)
	
	// La carpeta de trabajo es la raíz de la extensión
	cmd.Dir = filepath.Dir(filepath.Dir(serverPath)) 
	
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
func LaunchSvelte(workingDir string) (*exec.Cmd, error) {
	if workingDir == "" {
		return nil, fmt.Errorf("workingDir no definido")
	}

	var cmd *exec.Cmd
	// En Windows es mandatorio usar npm.cmd para que exec lo encuentre
	if runtime.GOOS == "windows" {
		cmd = exec.Command("npm.cmd", "run", "dev")
	} else {
		cmd = exec.Command("npm", "run", "dev")
	}

	cmd.Dir = workingDir
	cmd.Stdout = &prefixedWriter{prefix: "[SVELTE] ", out: os.Stderr}
	cmd.Stderr = &prefixedWriter{prefix: "[SVELTE-ERR] ", out: os.Stderr}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("error iniciando Svelte: %w", err)
	}

	fmt.Fprintf(os.Stderr, "[SVELTE] Servidor iniciado (PID: %d)\n", cmd.Process.Pid)
	return cmd, nil
}