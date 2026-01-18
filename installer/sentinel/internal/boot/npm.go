package boot

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

func LaunchSvelte(repoRoot string) (*exec.Cmd, error) {
	appPath := filepath.Join(repoRoot, "webview", "app")
	
	// 1. Validación de node_modules
	if _, err := os.Stat(filepath.Join(appPath, "node_modules")); err != nil {
		return nil, fmt.Errorf("error: node_modules no detectado. Ejecuta 'npm install' en %s", appPath)
	}

	// 2. PRE-FLIGHT: Sincronización de SvelteKit
	// Esto genera .svelte-kit/tsconfig.json y evita el WARNING que viste
	fmt.Println("\033[35m[SVELTE]\033[0m Sincronizando SvelteKit...")
	var syncCmd *exec.Cmd
	if runtime.GOOS == "windows" {
		syncCmd = exec.Command("cmd", "/C", "npx", "svelte-kit", "sync")
	} else {
		syncCmd = exec.Command("npx", "svelte-kit", "sync")
	}
	syncCmd.Dir = appPath
	_ = syncCmd.Run() // No importa si falla, el dev intentará levantarlo igual

	// 3. LANZAMIENTO: Servidor Dev
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		// Usamos exactamente el comando que te funcionó manualmente
		cmd = exec.Command("cmd", "/C", "npm", "run", "dev", "--", "--host", "127.0.0.1")
	} else {
		cmd = exec.Command("npm", "run", "dev", "--", "--host", "127.0.0.1")
	}

	cmd.Dir = appPath
	cmd.Env = os.Environ()

	stdout, _ := cmd.StdoutPipe()
	stderr, _ := cmd.StderrPipe()

	// Handler de Logs
	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Text()
			fmt.Printf("\033[35m[SVELTE]\033[0m %s\n", line)
		}
	}()

	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			line := scanner.Text()
			// Solo imprimimos si no es ruido de red
			if !strings.Contains(line, "api.github.com") {
				fmt.Printf("\033[31m[SVELTE-ERR]\033[0m %s\n", line)
			}
		}
	}()

	if err := cmd.Start(); err != nil {
		return nil, err
	}

	return cmd, nil
}