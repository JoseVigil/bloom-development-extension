package boot

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

func LaunchSvelte(repoRoot string) (*exec.Cmd, error) {
	appPath := filepath.Join(repoRoot, "webview", "app")
	if _, err := os.Stat(appPath); err != nil {
		return nil, fmt.Errorf("no se encontró webview/app en: %s", appPath)
	}

	npmCmd := "npm"
	if runtime.GOOS == "windows" {
		npmCmd = "npm.cmd"
	}

	cmd := exec.Command(npmCmd, "run", "dev")
	cmd.Dir = appPath

	// Captura de logs con prefijo Svelte
	stdout, _ := cmd.StdoutPipe()
	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			fmt.Printf("\033[35m[SVELTE]\033[0m %s\n", scanner.Text())
		}
	}()

	if err := cmd.Start(); err != nil {
		return nil, err
	}

	return cmd, nil
}