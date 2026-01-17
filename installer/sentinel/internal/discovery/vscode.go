package discovery

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
)

func FindVSCodeBinary() (string, error) {
	var paths []string
	if runtime.GOOS == "windows" {
		localApp := os.Getenv("LOCALAPPDATA")
		paths = []string{
			filepath.Join(localApp, "Programs", "Microsoft VS Code", "bin", "code.cmd"),
			filepath.Join(os.Getenv("ProgramFiles"), "Microsoft VS Code", "bin", "code.cmd"),
		}
	} else {
		paths = []string{"/usr/local/bin/code", "/usr/bin/code", "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"}
	}

	for _, p := range paths {
		if info, err := os.Stat(p); err == nil && !info.IsDir() {
			return p, nil
		}
	}
	return "", fmt.Errorf("VSCode (code.cmd) no encontrado. Asegurate de que este en el PATH o instalado por defecto")
}