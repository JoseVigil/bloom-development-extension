package boot

import (
	"fmt"
	"os/exec"
	"runtime"
	"strconv"
)

func KillProcessTree(pid int) {
	if runtime.GOOS == "windows" {
		// 1. Intento por PID (para Svelte/NPM funciona bien)
		if pid > 0 {
			_ = exec.Command("taskkill", "/F", "/T", "/PID", strconv.Itoa(pid)).Run()
		}

		// 2. ATAQUE QUIRÚRGICO para VS Code:
		// Buscamos cualquier proceso 'Code.exe' que tenga en su linea de comandos
		// la bandera '--extensionDevelopmentPath'. Esto es infalible y seguro.
		psCommand := `Get-CimInstance Win32_Process -Filter "Name = 'Code.exe'" | ` +
			`Where-Object { $_.CommandLine -like '*--extensionDevelopmentPath*' } | ` +
			`ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`
		
		_ = exec.Command("powershell", "-Command", psCommand).Run()
	} else {
		if pid > 0 {
			_ = exec.Command("pkill", "-P", strconv.Itoa(pid)).Run()
		}
	}
}

func CleanPorts(ports []int) {
	for _, port := range ports {
		if runtime.GOOS == "windows" {
			// Aniquilación de procesos por puerto
			cmdStr := fmt.Sprintf("for /f \"tokens=5\" %%a in ('netstat -aon ^| findstr :%d') do taskkill /f /pid %%a", port)
			_ = exec.Command("cmd", "/C", cmdStr).Run()
		}
	}
}