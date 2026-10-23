package main

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestProcessAttribution(t *testing.T) {
	root := `C:\Users\person\AppData\Local\BloomNucleus`
	app := `C:\repos\bloom-development-extension\webview\app`
	cases := []struct {
		row      processRow
		name     string
		external bool
		owned    bool
	}{
		{processRow{PID: 11, Executable: root + `\bin\node\node.exe`, Command: `node.exe ` + root + `\bin\bootstrap\bundle.js`}, "Control Plane API", false, true},
		{processRow{PID: 12, Executable: root + `\bin\brain\brain.exe`, Command: `brain.exe service start`}, "Brain API", false, true},
		{processRow{PID: 13, Executable: `C:\Program Files\nodejs\node.exe`, Command: `node.exe ` + app + `\node_modules\vite\bin\vite.js`}, "Svelte/Vite del repositorio configurado", true, true},
		{processRow{PID: 16, Executable: `C:\Program Files\nodejs\node.exe`, Command: `node.exe ` + app + `\node_modules\.bin\..\vite\bin\vite.js`}, "Svelte/Vite del repositorio configurado", true, true},
		{processRow{PID: 14, Executable: `C:\Program Files\nodejs\node.exe`, Command: `node.exe C:\other\node_modules\vite\bin\vite.js`}, "", false, false},
		{processRow{PID: 15, Executable: root + `Other\node.exe`, Command: `node.exe`}, "", false, false},
	}
	for _, tc := range cases {
		got, ok := classifyProcess(tc.row, root, app)
		if ok != tc.owned || (ok && (got.Name != tc.name || got.External != tc.external)) {
			t.Fatalf("PID %d: target=%+v owned=%v", tc.row.PID, got, ok)
		}
	}
}

func TestProcessInventoryFailureIsNotZeroProcesses(t *testing.T) {
	root := disposableRoot(t)
	previous := queryProcessRows
	queryProcessRows = func(_, _ string) ([]processRow, error) { return nil, errors.New("access denied") }
	t.Cleanup(func() { queryProcessRows = previous })
	if _, err := inspect(root, false); err == nil || !strings.Contains(err.Error(), "access denied") {
		t.Fatalf("debió detenerse: %v", err)
	}
}

func TestStopReportsNamedProcessesAndChecksCompletion(t *testing.T) {
	root := disposableRoot(t)
	rows := []processRow{{PID: 123, Executable: filepath.Join(root, "bin", "node", "node.exe"), Command: "node.exe " + filepath.Join(root, "bin", "bootstrap", "bundle.js")}, {PID: 124, Executable: filepath.Join(root, "bin", "brain", "brain.exe"), Command: "brain.exe service start"}}
	oldQuery, oldKill := queryProcessRows, terminateProcess
	queryProcessRows = func(_, _ string) ([]processRow, error) { return append([]processRow(nil), rows...), nil }
	terminateProcess = func(pid int) error {
		for i, r := range rows {
			if r.PID == pid {
				rows = append(rows[:i], rows[i+1:]...)
				return nil
			}
		}
		return errors.New("wrong PID")
	}
	t.Cleanup(func() { queryProcessRows, terminateProcess = oldQuery, oldKill })
	var out bytes.Buffer
	if err := stopOwnedProcesses(root, &out); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), "Control Plane API detenido") || !strings.Contains(out.String(), "Brain API detenido") {
		t.Fatalf("avisos faltantes: %s", out.String())
	}
}

func TestSvelteConfigMustPointToExistingApp(t *testing.T) {
	root := disposableRoot(t)
	repo := t.TempDir()
	app := filepath.Join(repo, "webview", "app")
	if err := os.MkdirAll(app, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(app, "vite.config.ts"), nil, 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, "config"), 0700); err != nil {
		t.Fatal(err)
	}
	data := `{"installation":{"origin_path":"` + strings.ReplaceAll(repo, `\`, `\\`) + `"}}`
	if err := os.WriteFile(filepath.Join(root, "config", "nucleus.json"), []byte(data), 0600); err != nil {
		t.Fatal(err)
	}
	if got := configuredSvelteApp(root); !strings.EqualFold(got, app) {
		t.Fatalf("app=%q", got)
	}
}
