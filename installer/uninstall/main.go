// Bloom's Windows uninstaller. No user-facing command or help tree is exposed.
package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

var services = []string{"BloomBrainService", "BloomNucleusService", "BloomOllamaService", "BloomOpencodeService"}
var registries = []string{
	`HKCU\Software\Microsoft\Windows\CurrentVersion\Run\BloomSensor`,
	`HKCU\Software\Microsoft\Windows\CurrentVersion\Run\BloomLauncher`,
	`HKCU\Software\Google\Chrome\NativeMessagingHosts\com.bloom.nucleus.bridge`,
	`HKLM\SOFTWARE\Google\Chrome\NativeMessagingHosts\com.bloom.nucleus.bridge`,
}
var registryParents = []string{
	`HKCU\Software\Google\Chrome\NativeMessagingHosts`,
	`HKLM\SOFTWARE\Google\Chrome\NativeMessagingHosts`,
	`HKCU\Software\Google\Chrome\Extensions`,
	`HKCU\Software\Policies\Google\Chrome\ExtensionSettings`,
}

type inventory struct {
	root      string
	test      bool
	entries   []string
	services  []string
	registry  []string
	workspace string
	bloomDir  string
}

func main() {
	if err := run(os.Args[1:], os.Stdin, os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, "Error:", err)
		os.Exit(1)
	}
}

func run(args []string, in io.Reader, out io.Writer) error {
	if len(args) == 1 && (args[0] == "version" || args[0] == "--version") {
		fmt.Fprintln(out, versionLine())
		return nil
	}
	root, test, err := installationRoot()
	if err != nil {
		return err
	}
	if len(args) == 4 && args[0] == "--internal-worker" {
		return removeInstallation(root, test, args[1], args[2], args[3], out)
	}
	if len(args) != 0 {
		return errors.New("argumentos no reconocidos")
	}
	reader := bufio.NewReader(in)
	fmt.Fprint(out, "Ruta absoluta del workspace cuya .bloom se eliminará: ")
	workspaceInput, err := reader.ReadString('\n')
	if err != nil && err != io.EOF {
		return err
	}
	workspace, bloomDir, err := validateWorkspace(strings.TrimSpace(workspaceInput), root)
	if err != nil {
		return err
	}
	inv, err := inspect(root, test)
	if err != nil {
		return err
	}
	inv.workspace, inv.bloomDir = workspace, bloomDir
	if !test {
		check := `if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { exit 1 }`
		if _, err := command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", check); err != nil {
			return errors.New("ejecutá bloom-uninstall.exe como administrador para retirar servicios")
		}
	}
	fmt.Fprintf(out, "Instalación: %s\n", root)
	for _, e := range inv.entries {
		fmt.Fprintln(out, "  Archivo/directorio:", e)
	}
	for _, s := range inv.services {
		fmt.Fprintln(out, "  Servicio:", s)
	}
	for _, r := range inv.registry {
		fmt.Fprintln(out, "  Registro:", r)
	}
	fmt.Fprintf(out, "Workspace seleccionado: %s\nSe eliminará COMPLETA: %s\n", workspace, bloomDir)
	fmt.Fprintln(out, "Se perderán la identidad local, los recibos y los Mandates allí guardados. Esta operación no es reversible; el backup/restore de Nucleus aún no está implementado ni verificado.")
	fmt.Fprintln(out, "Los archivos del proyecto fuera de .bloom y Backend/D1 no se tocarán.")
	fmt.Fprint(out, "Escribí SI para desinstalar: ")
	answer, _ := reader.ReadString('\n')
	if strings.TrimSpace(answer) != "SI" {
		fmt.Fprintln(out, "Cancelado.")
		return nil
	}
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	tmp, err := os.MkdirTemp("", "bloom-uninstall-")
	if err != nil {
		return err
	}
	worker := filepath.Join(tmp, "bloom-uninstall.exe")
	if err := copyFile(exe, worker); err != nil {
		os.RemoveAll(tmp)
		return err
	}
	cmd := exec.Command(worker, "--internal-worker", tmp, fmt.Sprint(os.Getpid()), workspace)
	cmd.Env = os.Environ()
	cmd.Stdin = in
	cmd.Stdout = out
	cmd.Stderr = os.Stderr
	// The parent exits before the worker attempts to delete bin/uninstall.
	if err := cmd.Start(); err != nil {
		os.RemoveAll(tmp)
		return err
	}
	fmt.Fprintf(out, "Limpieza iniciada (PID %d).\n", cmd.Process.Pid)
	return cmd.Process.Release()
}

func installationRoot() (string, bool, error) {
	if override := os.Getenv("BLOOM_UNINSTALL_TEST_ROOT"); override != "" {
		root, err := filepath.Abs(override)
		if err != nil {
			return "", false, err
		}
		temp := filepath.Clean(os.TempDir()) + string(os.PathSeparator)
		if !strings.HasPrefix(strings.ToLower(root), strings.ToLower(temp)) || !strings.HasPrefix(filepath.Base(root), "BloomUninstallTest-") {
			return "", false, errors.New("raíz de prueba fuera de TEMP o sin prefijo descartable")
		}
		if _, err := os.Stat(filepath.Join(root, ".bloom-uninstall-test")); err != nil {
			return "", false, errors.New("falta marcador de instalación descartable")
		}
		return root, true, nil
	}
	local := os.Getenv("LOCALAPPDATA")
	if local == "" {
		return "", false, errors.New("LOCALAPPDATA no definido")
	}
	root := filepath.Join(local, "BloomNucleus")
	if filepath.Base(root) != "BloomNucleus" {
		return "", false, errors.New("raíz inválida")
	}
	return root, false, nil
}

func inspect(root string, test bool) (inventory, error) {
	inv := inventory{root: root, test: test}
	info, err := os.Lstat(root)
	if err != nil {
		return inv, err
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return inv, errors.New("la raíz no es un directorio real")
	}
	entries, err := os.ReadDir(root)
	if err != nil {
		return inv, err
	}
	for _, e := range entries {
		inv.entries = append(inv.entries, filepath.Join(root, e.Name()))
	}
	if test {
		return inv, nil
	}
	for _, s := range services {
		if ownedService(s, root) {
			inv.services = append(inv.services, s)
		}
	}
	for _, key := range registries {
		if ownedRegistry(key, root) {
			inv.registry = append(inv.registry, key)
		}
	}
	for _, parent := range registryParents {
		v, err := command("reg.exe", "query", parent)
		if err != nil {
			continue
		}
		for _, line := range strings.Split(v, "\n") {
			key := strings.TrimSpace(line)
			if !strings.HasPrefix(strings.ToLower(key), strings.ToLower(parent+`\`)) || strings.Contains(strings.TrimPrefix(key, parent+`\`), `\`) {
				continue
			}
			if ownedRegistry(key, root) && !containsStringFold(inv.registry, key) {
				inv.registry = append(inv.registry, key)
			}
		}
	}
	// Chrome policies are shared. Select only values that contain this install path.
	for _, parent := range []string{`HKCU\Software\Policies\Google\Chrome\ExtensionInstallForcelist`, `HKCU\Software\Policies\Google\Chrome\ExtensionInstallAllowlist`} {
		v, err := command("reg.exe", "query", parent)
		if err != nil {
			continue
		}
		for _, line := range strings.Split(v, "\n") {
			fields := strings.Fields(strings.TrimSpace(line))
			if len(fields) >= 3 && strings.HasPrefix(fields[1], "REG_") && containsRoot(line, root) {
				inv.registry = append(inv.registry, parent+`\`+fields[0])
			}
		}
	}
	return inv, nil
}

func containsStringFold(values []string, needle string) bool {
	for _, v := range values {
		if strings.EqualFold(v, needle) {
			return true
		}
	}
	return false
}

func command(name string, args ...string) (string, error) {
	b, e := exec.Command(name, args...).CombinedOutput()
	return string(b), e
}
func containsRoot(value, root string) bool {
	return strings.Contains(strings.ToLower(value), strings.ToLower(filepath.Clean(root)+string(os.PathSeparator)))
}

// validateWorkspace requires Bloom's own Nucleus identity to name this exact
// workspace. A redirected .bloom or an unrelated directory is never accepted.
func validateWorkspace(input, installation string) (string, string, error) {
	if !filepath.IsAbs(input) {
		return "", "", errors.New("seleccioná una ruta absoluta de workspace")
	}
	workspace, err := filepath.EvalSymlinks(filepath.Clean(input))
	if err != nil {
		return "", "", err
	}
	if !strings.EqualFold(workspace, filepath.Clean(input)) {
		return "", "", errors.New("el workspace no debe redirigir a otra ruta")
	}
	if strings.EqualFold(workspace, filepath.VolumeName(workspace)+string(os.PathSeparator)) || strings.EqualFold(workspace, installation) {
		return "", "", errors.New("workspace inválido")
	}
	info, err := os.Stat(workspace)
	if err != nil || !info.IsDir() {
		return "", "", errors.New("workspace inexistente")
	}
	bloom := filepath.Join(workspace, ".bloom")
	info, err = os.Lstat(bloom)
	if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return "", "", errors.New(".bloom no es un directorio real")
	}
	resolvedBloom, err := filepath.EvalSymlinks(bloom)
	if err != nil || !strings.EqualFold(resolvedBloom, bloom) {
		return "", "", errors.New(".bloom redirige fuera del workspace")
	}
	entries, err := os.ReadDir(bloom)
	if err != nil {
		return "", "", err
	}
	matched := false
	for _, entry := range entries {
		if !entry.IsDir() || !strings.HasPrefix(entry.Name(), ".nucleus-") {
			continue
		}
		nucleus := filepath.Join(bloom, entry.Name())
		resolved, err := filepath.EvalSymlinks(nucleus)
		if err != nil || !strings.EqualFold(resolved, nucleus) {
			continue
		}
		data, err := os.ReadFile(filepath.Join(nucleus, ".core", ".nucleus-config.json"))
		if err != nil {
			continue
		}
		var identity struct {
			Nucleus struct {
				Path     string `json:"path"`
				RootPath string `json:"rootPath"`
			} `json:"nucleus"`
		}
		if json.Unmarshal(data, &identity) == nil && strings.EqualFold(filepath.Clean(identity.Nucleus.RootPath), workspace) && strings.EqualFold(filepath.Clean(identity.Nucleus.Path), nucleus) {
			matched = true
			break
		}
	}
	if !matched {
		return "", "", errors.New(".bloom no contiene una identidad Nucleus que corresponda exactamente a este workspace")
	}
	return workspace, bloom, nil
}
func ownedService(name, root string) bool {
	v, e := command("sc.exe", "qc", name)
	return e == nil && containsRoot(v, root)
}
func ownedRegistry(key, root string) bool {
	parts := strings.Split(key, `\`)
	value := parts[len(parts)-1]
	path := strings.Join(parts[:len(parts)-1], `\`)
	args := []string{"query", path}
	isKey := strings.Contains(strings.ToLower(key), `\nativemessaginghosts\`) || strings.Contains(strings.ToLower(key), `\chrome\extensions\`) || strings.Contains(strings.ToLower(key), `\extensionsettings\`)
	if isKey {
		args = []string{"query", key, "/ve"}
		if !strings.Contains(strings.ToLower(key), `\nativemessaginghosts\`) {
			args = []string{"query", key}
		}
	} else {
		args = append(args, "/v", value)
	}
	v, e := command("reg.exe", args...)
	return e == nil && containsRoot(v, root) && (!strings.Contains(strings.ToLower(key), `\nativemessaginghosts\`) || strings.HasPrefix(strings.ToLower(value), "com.bloom."))
}

func removeInstallation(root string, test bool, tempDir string, parentPID string, workspace string, out io.Writer) error {
	if filepath.Base(tempDir) == "" || !strings.HasPrefix(strings.ToLower(filepath.Clean(tempDir)), strings.ToLower(filepath.Clean(os.TempDir()))+string(os.PathSeparator)) {
		return errors.New("worker temporal inválido")
	}
	exe, _ := os.Executable()
	if !strings.EqualFold(filepath.Dir(exe), tempDir) {
		return errors.New("worker fuera del directorio temporal")
	}
	// Wait until the installed parent image has closed before deleting it.
	for i := 0; i < 50; i++ {
		v, _ := command("tasklist.exe", "/FI", "PID eq "+parentPID, "/FO", "CSV", "/NH")
		if !strings.Contains(v, `"`+parentPID+`"`) {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	inv, err := inspect(root, test)
	if err != nil {
		return err
	}
	_, bloomDir, err := validateWorkspace(workspace, root)
	if err != nil {
		return err
	}
	if !test {
		for _, s := range inv.services {
			_, _ = command("sc.exe", "stop", s)
			for i := 0; i < 20; i++ {
				v, _ := command("sc.exe", "query", s)
				if strings.Contains(v, "STOPPED") {
					break
				}
				time.Sleep(500 * time.Millisecond)
			}
			v, _ := command("sc.exe", "query", s)
			if !strings.Contains(v, "STOPPED") {
				return fmt.Errorf("servicio %s no se detuvo", s)
			}
			if _, e := command("sc.exe", "delete", s); e != nil {
				return fmt.Errorf("eliminar servicio %s: %w", s, e)
			}
			for i := 0; i < 20; i++ {
				if _, e := command("sc.exe", "query", s); e != nil {
					break
				}
				time.Sleep(500 * time.Millisecond)
			}
			if _, e := command("sc.exe", "query", s); e == nil {
				return fmt.Errorf("servicio %s continúa registrado", s)
			}
		}
		// Only processes whose ExecutablePath is inside this installation are terminated.
		ps := fmt.Sprintf(`$ErrorActionPreference='Stop'; $r='%s'; $owned={ Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($r+'\',[StringComparison]::OrdinalIgnoreCase) } }; & $owned | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop }; Start-Sleep -Milliseconds 300; if (@(& $owned).Count -gt 0) { throw 'Procesos Bloom restantes' }`, strings.ReplaceAll(root, "'", "''"))
		if _, e := command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", ps); e != nil {
			return fmt.Errorf("detener procesos Bloom: %w", e)
		}
		for _, key := range inv.registry {
			parts := strings.Split(key, `\`)
			value := parts[len(parts)-1]
			path := strings.Join(parts[:len(parts)-1], `\`)
			args := []string{"delete", path, "/v", value, "/f"}
			if strings.Contains(strings.ToLower(key), `\nativemessaginghosts\`) || strings.Contains(strings.ToLower(key), `\chrome\extensions\`) || strings.Contains(strings.ToLower(key), `\extensionsettings\`) {
				args = []string{"delete", key, "/f"}
			}
			if _, e := command("reg.exe", args...); e != nil {
				return fmt.Errorf("eliminar registro %s: %w", key, e)
			}
		}
	}
	if err := os.RemoveAll(root); err != nil {
		return fmt.Errorf("eliminar %s: %w", root, err)
	}
	// Recheck immediately before removing the selected workspace state.
	_, checkedBloomDir, err := validateWorkspace(workspace, root)
	if err != nil || !strings.EqualFold(checkedBloomDir, bloomDir) {
		return errors.New("la identidad del workspace cambió durante la desinstalación")
	}
	if err := os.RemoveAll(bloomDir); err != nil {
		return fmt.Errorf("eliminar %s: %w", bloomDir, err)
	}
	if _, err := os.Lstat(bloomDir); !os.IsNotExist(err) {
		return errors.New("quedan datos en .bloom")
	}
	if _, err := os.Lstat(root); !os.IsNotExist(err) {
		return errors.New("quedan archivos de la instalación")
	}
	if !test {
		for _, s := range inv.services {
			if ownedService(s, root) {
				return fmt.Errorf("servicio restante: %s", s)
			}
		}
		for _, k := range inv.registry {
			if ownedRegistry(k, root) {
				return fmt.Errorf("registro restante: %s", k)
			}
		}
	}
	fmt.Fprintln(out, "Instalación y .bloom del workspace eliminado; ausencia de restos administrados verificada.")
	// Windows cannot delete the running worker executable. This detached process
	// removes only the unique temp directory after the worker exits.
	cleanupScript := fmt.Sprintf(`Start-Sleep -Seconds 2; Remove-Item -LiteralPath '%s' -Recurse -Force`, strings.ReplaceAll(tempDir, "'", "''"))
	cleanup := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", cleanupScript)
	_ = cleanup.Start()
	if cleanup.Process != nil {
		_ = cleanup.Process.Release()
	}
	return nil
}

func copyFile(src, dst string) error {
	in, e := os.Open(src)
	if e != nil {
		return e
	}
	defer in.Close()
	out, e := os.OpenFile(dst, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0700)
	if e != nil {
		return e
	}
	defer out.Close()
	_, e = io.Copy(out, in)
	return e
}
