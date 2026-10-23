package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type processRow struct {
	PID        int    `json:"ProcessId"`
	Executable string `json:"ExecutablePath"`
	Command    string `json:"CommandLine"`
}

type processTarget struct {
	PID        int
	Executable string
	Command    string
	Name       string
	External   bool
}

var queryProcessRows = cimProcessRows
var terminateProcess = func(pid int) error {
	proc, err := os.FindProcess(pid)
	if err != nil {
		return err
	}
	return proc.Kill()
}

func configuredSvelteApp(root string) string {
	data, err := os.ReadFile(filepath.Join(root, "config", "nucleus.json"))
	if err != nil {
		return ""
	}
	var cfg struct {
		Installation struct {
			OriginPath string `json:"origin_path"`
		} `json:"installation"`
	}
	if json.Unmarshal(data, &cfg) != nil || !filepath.IsAbs(cfg.Installation.OriginPath) {
		return ""
	}
	app := filepath.Join(filepath.Clean(cfg.Installation.OriginPath), "webview", "app")
	if _, err := os.Stat(filepath.Join(app, "vite.config.ts")); err != nil {
		return ""
	}
	resolved, err := filepath.EvalSymlinks(app)
	if err != nil || !strings.EqualFold(resolved, app) {
		return ""
	}
	return app
}

func cimProcessRows(root, svelteApp string) ([]processRow, error) {
	quote := func(s string) string { return strings.ReplaceAll(s, "'", "''") }
	vitePath := ""
	if svelteApp != "" {
		vitePath = svelteApp + string(os.PathSeparator)
	}
	ps := fmt.Sprintf(`$ErrorActionPreference='Stop'; $r='%s\'; $v='%s'; $rows=@(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object { ($_.ExecutablePath -and $_.ExecutablePath.StartsWith($r,[StringComparison]::OrdinalIgnoreCase)) -or ($v -ne '' -and $_.CommandLine -and $_.CommandLine.IndexOf($v,[StringComparison]::OrdinalIgnoreCase) -ge 0) } | Select-Object ProcessId,ExecutablePath,CommandLine); ConvertTo-Json -InputObject $rows -Depth 3 -Compress`, quote(filepath.Clean(root)), quote(vitePath))
	v, err := command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", ps)
	if err != nil {
		return nil, fmt.Errorf("CIM no permitió inventariar procesos: %w", err)
	}
	var rows []processRow
	if err := json.Unmarshal([]byte(strings.TrimSpace(v)), &rows); err != nil {
		return nil, fmt.Errorf("respuesta de inventario de procesos inválida: %w", err)
	}
	return rows, nil
}

func classifyProcess(row processRow, root, svelteApp string) (processTarget, bool) {
	if row.PID <= 0 || row.Executable == "" {
		return processTarget{}, false
	}
	exe := filepath.Clean(row.Executable)
	internal := strings.HasPrefix(strings.ToLower(exe), strings.ToLower(filepath.Clean(root)+string(os.PathSeparator)))
	name := "Proceso Bloom"
	external := false
	if !internal {
		if svelteApp == "" || !strings.EqualFold(filepath.Base(exe), "node.exe") || !isConfiguredViteCommand(row.Command, svelteApp) {
			return processTarget{}, false
		}
		name, external = "Svelte/Vite del repositorio configurado", true
	} else {
		cmd := strings.ToLower(strings.ReplaceAll(row.Command, "/", `\`))
		switch {
		case strings.EqualFold(filepath.Base(exe), "node.exe") && strings.Contains(cmd, strings.ToLower(filepath.Join(root, "bin", "bootstrap", "bundle.js"))):
			name = "Control Plane API"
		case strings.EqualFold(filepath.Base(exe), "brain.exe") && (strings.Contains(cmd, "service start") || strings.Contains(cmd, "server start")):
			name = "Brain API"
		case strings.EqualFold(filepath.Base(exe), "temporal.exe"):
			name = "Temporal"
		case strings.EqualFold(filepath.Base(exe), "nucleus.exe") && strings.Contains(cmd, "worker"):
			name = "Nucleus Worker"
		case strings.EqualFold(filepath.Base(exe), "nucleus.exe"):
			name = "Nucleus"
		case strings.EqualFold(filepath.Base(exe), "ollama.exe"):
			name = "Ollama"
		}
	}
	return processTarget{PID: row.PID, Executable: exe, Command: row.Command, Name: name, External: external}, true
}

func isConfiguredViteCommand(command, app string) bool {
	cmd := strings.ToLower(strings.ReplaceAll(command, "/", `\`))
	base := strings.ToLower(filepath.Clean(app) + string(os.PathSeparator))
	if !strings.Contains(cmd, "vite.js") {
		return false
	}
	for _, suffix := range []string{`node_modules\vite\`, `node_modules\.bin\..\vite\`} {
		if strings.Contains(cmd, base+suffix) {
			return true
		}
	}
	return false
}

func discoverProcesses(root string) ([]processTarget, error) {
	app := configuredSvelteApp(root)
	rows, err := queryProcessRows(root, app)
	if err != nil {
		return nil, err
	}
	targets := make([]processTarget, 0, len(rows))
	for _, row := range rows {
		if target, ok := classifyProcess(row, root, app); ok {
			targets = append(targets, target)
		}
	}
	return targets, nil
}

func stopOwnedProcesses(root string, out io.Writer) error {
	for pass := 0; pass < 3; pass++ {
		targets, err := discoverProcesses(root)
		if err != nil {
			return err
		}
		if len(targets) == 0 {
			return nil
		}
		for _, target := range targets {
			// Re-query just before acting, so a reused PID cannot inherit approval.
			current, err := discoverProcesses(root)
			if err != nil {
				return err
			}
			stillOwned := false
			for _, c := range current {
				if c.PID == target.PID && strings.EqualFold(c.Executable, target.Executable) && c.Command == target.Command && c.Name == target.Name {
					stillOwned = true
					break
				}
			}
			if !stillOwned {
				continue
			}
			if err := terminateProcess(target.PID); err != nil {
				latest, queryErr := discoverProcesses(root)
				if queryErr != nil {
					return queryErr
				}
				stillThere := false
				for _, c := range latest {
					if c.PID == target.PID && strings.EqualFold(c.Executable, target.Executable) {
						stillThere = true
						break
					}
				}
				if stillThere {
					return fmt.Errorf("detener %s (PID %d): %w", target.Name, target.PID, err)
				}
				continue
			}
			fmt.Fprintf(out, "%s detenido (PID %d).\n", target.Name, target.PID)
		}
		time.Sleep(300 * time.Millisecond)
	}
	remaining, err := discoverProcesses(root)
	if err != nil {
		return err
	}
	if len(remaining) > 0 {
		return errors.New("quedan procesos asociados a Bloom; no se borrará la instalación")
	}
	return nil
}
