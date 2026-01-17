package boot

import (
	"fmt"
	"os/exec"
)

func LaunchExtensionHost(codePath, extPath, workspacePath string) error {
	if extPath == "" {
		return fmt.Errorf("la ruta de la extension (extensionPath) no esta definida en el blueprint")
	}

	args := []string{"--extensionDevelopmentPath=" + extPath}
	if workspacePath != "" {
		args = append(args, workspacePath)
	}

	cmd := exec.Command(codePath, args...)
	
	// Usamos Start en lugar de Run para que Sentinel no se quede bloqueado
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("error al iniciar VSCode: %w", err)
	}
	return nil
}