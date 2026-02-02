package boot

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

// SyncVScodeSettings inyecta las rutas reales en el settings.json del repo de dev
func SyncVScodeSettings(repoRoot, brainPath, pythonPath string) error {
	dotVscode := filepath.Join(repoRoot, ".vscode")
	if err := os.MkdirAll(dotVscode, 0755); err != nil {
		return err
	}

	settingsPath := filepath.Join(dotVscode, "settings.json")
	settings := make(map[string]interface{})

	// Leer settings existentes si hay
	if data, err := os.ReadFile(settingsPath); err == nil {
		json.Unmarshal(data, &settings)
	}

	// Inyectar rutas detectadas por Sentinel
	settings["bloom.brain.executable"] = brainPath
	settings["bloom.pythonPath"] = pythonPath
	settings["bloom.useInternalRuntime"] = true 

	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(settingsPath, data, 0644)
}

func LaunchExtensionHost(codePath, extPath, workspacePath, runtimePath string) (*exec.Cmd, error) {
	if extPath == "" {
		return nil, fmt.Errorf("extensionPath no definido")
	}

	pythonExe := filepath.Join(runtimePath, "python.exe")
	if runtime.GOOS != "windows" {
		pythonExe = filepath.Join(runtimePath, "bin", "python3")
	}

	newEnv := os.Environ()
	pathKey := "PATH"
	if runtime.GOOS == "windows" {
		pathKey = "Path"
	}

	newEnv = append(newEnv, fmt.Sprintf("%s=%s%c%s", pathKey, runtimePath, os.PathListSeparator, os.Getenv(pathKey)))
	newEnv = append(newEnv, "BLOOM_PYTHON_PATH="+pythonExe)

	// --- CONFIGURACIÓN DE ARGUMENTOS ---
	args := []string{
		"--extensionDevelopmentPath=" + extPath,
		"--disable-extension", "github.copilot",      // Mata el proceso de Copilot
		"--disable-extension", "github.copilot-chat", // Mata el chat de Copilot
		"--no-proxy-server",                          // Evita que intente salir por proxys de red
	}

	if workspacePath != "" {
		args = append(args, workspacePath)
	}

	cmd := exec.Command(codePath, args...)
	cmd.Env = newEnv

	if err := cmd.Start(); err != nil {
		return nil, err
	}

	return cmd, nil
}