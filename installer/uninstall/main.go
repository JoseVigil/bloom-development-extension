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
	"strconv"
	"strings"
	"time"
)

// Stop the supervisor first; while running it may restart dependent services.
var services = []string{"BloomNucleusService", "BloomBrainService", "BloomOllamaService", "BloomOpencodeService"}
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
	config    []string
	warnings  []string
	processes []processTarget
}

type protectedPlan struct {
	Root     string   `json:"root"`
	Services []string `json:"services"`
	Registry []string `json:"registry"`
}

type configuredWorkspace struct {
	Org  string
	Path string
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
	if len(args) == 2 && args[0] == "--internal-elevated" {
		err := runProtectedPlan(args[1], out)
		result := "OK"
		if err != nil {
			result = err.Error()
		}
		_ = os.WriteFile(args[1]+".result", []byte(result), 0600)
		return err
	}
	root, test, err := installationRoot()
	if err != nil {
		return err
	}
	if len(args) == 4 && args[0] == "--internal-worker" {
		err := removeInstallation(root, test, args[1], args[2], args[3], out)
		result := "OK"
		if err != nil {
			result = err.Error()
		}
		_ = os.WriteFile(filepath.Join(args[1], "cleanup.result"), []byte(result), 0600)
		return err
	}
	if len(args) != 0 {
		return errors.New("argumentos no reconocidos")
	}
	reader := bufio.NewReader(in)
	inv, err := inspect(root, test)
	if err != nil {
		return err
	}
	workspace, bloomDir, err := selectConfiguredWorkspace(root, reader, out)
	if err != nil {
		return err
	}
	inv.workspace, inv.bloomDir = workspace, bloomDir
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
	for _, c := range inv.config {
		fmt.Fprintln(out, "  Configuración:", c)
	}
	for _, w := range inv.warnings {
		fmt.Fprintln(out, "  Aviso:", w)
	}
	if len(inv.processes) == 0 {
		fmt.Fprintln(out, "  Procesos asociados: ninguno en este momento.")
	}
	for _, p := range inv.processes {
		origin := "ejecutable instalado"
		if p.External {
			origin = "Node externo; ruta Vite del repositorio configurado"
		}
		fmt.Fprintf(out, "  Proceso: %s (PID %d, %s)\n", p.Name, p.PID, origin)
	}
	if bloomDir == "" {
		fmt.Fprintln(out, "Estado del workspace: no hay una carpeta .bloom configurada; se omitirá su eliminación.")
	} else {
		fmt.Fprintf(out, "Workspace seleccionado: %s\nSe eliminará COMPLETA: %s\n", workspace, bloomDir)
		fmt.Fprintln(out, "Se perderán la identidad local, los recibos y los Mandates allí guardados. Esta operación no es reversible; el backup/restore de Nucleus aún no está implementado ni verificado.")
	}
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
	if !test {
		if err := performProtectedStage(inv, worker, tmp, out); err != nil {
			_ = os.RemoveAll(tmp)
			return err
		}
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

func performProtectedStage(inv inventory, worker, tmp string, out io.Writer) error {
	plan := protectedPlan{Root: inv.root, Services: append([]string(nil), inv.services...)}
	for _, k := range inv.registry {
		if strings.HasPrefix(strings.ToUpper(k), "HKLM\\") {
			plan.Registry = append(plan.Registry, k)
		}
	}
	if len(plan.Services)+len(plan.Registry) == 0 {
		return nil
	}
	planPath := filepath.Join(tmp, "protected-plan.json")
	data, err := json.Marshal(plan)
	if err != nil {
		return err
	}
	if err := os.WriteFile(planPath, data, 0600); err != nil {
		return err
	}
	fmt.Fprintln(out, "Windows solicitará elevación solo para servicios y registro HKLM.")
	if err := elevate(worker, planPath); err != nil {
		detail, readErr := os.ReadFile(planPath + ".result")
		if readErr == nil && string(detail) != "OK" {
			return fmt.Errorf("limpieza protegida fallida; no se borraron archivos ni .bloom: %s: %w", strings.TrimSpace(string(detail)), err)
		}
		return fmt.Errorf("elevación cancelada o fallida; no se borraron archivos ni .bloom: %w", err)
	}
	return nil
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
	if err := validateInstallationDirectory(root); err != nil {
		return inv, err
	}
	entries, err := os.ReadDir(root)
	if err != nil {
		return inv, err
	}
	for _, e := range entries {
		inv.entries = append(inv.entries, filepath.Join(root, e.Name()))
	}
	for _, rel := range []string{"config/nucleus.json", "config/metamorph.json", "config/profiles.json"} {
		path := filepath.Join(root, filepath.FromSlash(rel))
		data, err := os.ReadFile(path)
		if os.IsNotExist(err) {
			inv.warnings = append(inv.warnings, rel+" ausente; se usará solo el inventario verificable")
			continue
		}
		if err != nil || !json.Valid(data) {
			inv.warnings = append(inv.warnings, rel+" ilegible o inválido; no se aceptarán rutas externas desde él")
			continue
		}
		inside, outside := countConfigPaths(data, root)
		itemCount, schemaOK := configItemCount(rel, data)
		if !schemaOK {
			inv.warnings = append(inv.warnings, rel+" tiene un esquema inesperado; no se usará para atribuir recursos")
		}
		inv.config = append(inv.config, fmt.Sprintf("%s (%d elementos, %d rutas dentro de la instalación, %d rutas externas solo como referencia)", rel, itemCount, inside, outside))
		if outside > 0 {
			inv.warnings = append(inv.warnings, rel+": las rutas externas no se borrarán sin prueba de pertenencia")
		}
	}
	if test {
		return inv, nil
	}
	inv.processes, err = discoverProcesses(root)
	if err != nil {
		return inv, fmt.Errorf("no se pudo verificar el inventario de procesos; se cancela antes de borrar: %w", err)
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

func validateInstallationDirectory(root string) error {
	info, err := os.Lstat(root)
	if err != nil {
		return err
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return errors.New("la raíz no es un directorio real")
	}
	resolved, err := filepath.EvalSymlinks(root)
	if err != nil || !strings.EqualFold(resolved, filepath.Clean(root)) {
		return errors.New("la raíz redirige a otra ruta")
	}
	return nil
}

func countConfigPaths(data []byte, root string) (int, int) {
	var value any
	if json.Unmarshal(data, &value) != nil {
		return 0, 0
	}
	inside, outside := 0, 0
	var walk func(any)
	walk = func(v any) {
		switch x := v.(type) {
		case map[string]any:
			for _, child := range x {
				walk(child)
			}
		case []any:
			for _, child := range x {
				walk(child)
			}
		case string:
			if !filepath.IsAbs(x) {
				return
			}
			clean := filepath.Clean(x)
			if strings.EqualFold(clean, root) || strings.HasPrefix(strings.ToLower(clean), strings.ToLower(filepath.Clean(root)+string(os.PathSeparator))) {
				inside++
			} else {
				outside++
			}
		}
	}
	walk(value)
	return inside, outside
}

func configItemCount(rel string, data []byte) (int, bool) {
	var object map[string]json.RawMessage
	if json.Unmarshal(data, &object) != nil {
		return 0, false
	}
	switch rel {
	case "config/nucleus.json":
		_, installation := object["installation"]
		_, system := object["system_map"]
		return 1, installation && system
	case "config/metamorph.json":
		var list []json.RawMessage
		if json.Unmarshal(object["managed_binaries"], &list) != nil {
			return 0, false
		}
		return len(list), true
	case "config/profiles.json":
		var list []json.RawMessage
		if json.Unmarshal(object["profiles"], &list) == nil {
			return len(list), true
		}
		var profiles map[string]json.RawMessage
		if json.Unmarshal(object["profiles"], &profiles) == nil {
			return len(profiles), true
		}
	}
	return 0, false
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
		if nucleusIdentityMatches(workspace, entry.Name()) {
			matched = true
			break
		}
	}
	if !matched {
		return "", "", errors.New(".bloom no contiene una identidad Nucleus que corresponda exactamente a este workspace")
	}
	return workspace, bloom, nil
}

func nucleusIdentityMatches(workspace, name string) bool {
	if !strings.HasPrefix(name, ".nucleus-") || name == ".nucleus-" || filepath.Base(name) != name || strings.ContainsAny(name, `/\`) {
		return false
	}
	nucleus := filepath.Join(workspace, ".bloom", name)
	resolved, err := filepath.EvalSymlinks(nucleus)
	if err != nil || !strings.EqualFold(resolved, nucleus) {
		return false
	}
	data, err := os.ReadFile(filepath.Join(nucleus, ".core", ".nucleus-config.json"))
	if err != nil {
		return false
	}
	var identity struct {
		Nucleus struct {
			Path     string `json:"path"`
			RootPath string `json:"rootPath"`
		} `json:"nucleus"`
	}
	return json.Unmarshal(data, &identity) == nil && strings.EqualFold(filepath.Clean(identity.Nucleus.RootPath), workspace) && strings.EqualFold(filepath.Clean(identity.Nucleus.Path), nucleus)
}

func readConfiguredWorkspaces(root string) (string, []configuredWorkspace, error) {
	data, err := os.ReadFile(filepath.Join(root, "config", "nucleus.json"))
	if os.IsNotExist(err) {
		return "", nil, nil
	}
	if err != nil {
		return "", nil, fmt.Errorf("leer config/nucleus.json: %w", err)
	}
	var cfg struct {
		Onboarding struct {
			ActiveOrgSlug string `json:"active_org_slug"`
			Organizations []struct {
				OrgSlug       string `json:"org_slug"`
				WorkspacePath string `json:"workspace_path"`
			} `json:"organizations"`
		} `json:"onboarding"`
	}
	if err := json.Unmarshal(data, &cfg); err != nil {
		return "", nil, fmt.Errorf("parsear onboarding en config/nucleus.json: %w", err)
	}
	var candidates []configuredWorkspace
	for _, org := range cfg.Onboarding.Organizations {
		if strings.TrimSpace(org.WorkspacePath) == "" || strings.TrimSpace(org.OrgSlug) == "" {
			continue
		}
		if !filepath.IsAbs(org.WorkspacePath) {
			return "", nil, fmt.Errorf("workspace_path no es absoluto para %s", org.OrgSlug)
		}
		bloom := filepath.Join(filepath.Clean(org.WorkspacePath), ".bloom")
		if _, err := os.Lstat(bloom); os.IsNotExist(err) {
			continue
		} else if err != nil {
			return "", nil, fmt.Errorf("inspeccionar %s: %w", bloom, err)
		}
		workspace, _, err := validateWorkspace(org.WorkspacePath, root)
		if err != nil {
			return "", nil, fmt.Errorf(".bloom existente no verificable para %s: %w", org.OrgSlug, err)
		}
		// The organizational Nucleus for this record must exist. This avoids
		// accepting a different organization's identity in the same workspace.
		if !nucleusIdentityMatches(workspace, ".nucleus-"+org.OrgSlug) {
			return "", nil, fmt.Errorf(".bloom existente no coincide con la organización %s", org.OrgSlug)
		}
		candidates = append(candidates, configuredWorkspace{Org: org.OrgSlug, Path: workspace})
	}
	return cfg.Onboarding.ActiveOrgSlug, candidates, nil
}

func configuredWorkspaceAllowed(root, workspace string) bool {
	active, candidates, err := readConfiguredWorkspaces(root)
	if err != nil {
		return false
	}
	for _, c := range candidates {
		if strings.EqualFold(c.Path, workspace) && (active == "" || c.Org == active) {
			return true
		}
	}
	return false
}

func selectConfiguredWorkspace(root string, reader *bufio.Reader, out io.Writer) (string, string, error) {
	active, candidates, err := readConfiguredWorkspaces(root)
	if err != nil {
		return "", "", err
	}
	if len(candidates) == 0 {
		fmt.Fprintln(out, "Onboarding sin .bloom: se omite la limpieza del workspace.")
		return "", "", nil
	}
	selected := -1
	for i, c := range candidates {
		if c.Org == active {
			selected = i
			break
		}
	}
	if active != "" && selected < 0 {
		return "", "", fmt.Errorf("la organización activa %q no tiene un workspace .bloom verificable", active)
	}
	if selected < 0 && len(candidates) == 1 {
		selected = 0
	}
	if selected < 0 {
		fmt.Fprintln(out, "Nucleus registra varios workspaces; elegí el número del que se quitará .bloom:")
		for i, c := range candidates {
			fmt.Fprintf(out, "  %d. %s (%s)\n", i+1, c.Path, c.Org)
		}
		fmt.Fprint(out, "Número: ")
		answer, err := reader.ReadString('\n')
		if err != nil && err != io.EOF {
			return "", "", err
		}
		n, err := strconv.Atoi(strings.TrimSpace(answer))
		if err != nil || n < 1 || n > len(candidates) {
			return "", "", errors.New("selección de workspace inválida")
		}
		selected = n - 1
	}
	workspace, bloom, err := validateWorkspace(candidates[selected].Path, root)
	if err != nil {
		return "", "", err
	}
	fmt.Fprintf(out, "Workspace obtenido de config/nucleus.json (organización %s): %s\n", candidates[selected].Org, workspace)
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

func requestElevation(worker, planPath string) error {
	// Start-Process keeps the original process (and its HKCU/LOCALAPPDATA)
	// alive while Windows prompts for an administrator account.
	q := func(s string) string { return strings.ReplaceAll(s, "'", "''") }
	ps := fmt.Sprintf(`$ErrorActionPreference='Stop'; $p=Start-Process -FilePath '%s' -ArgumentList '--internal-elevated "%s"' -Verb RunAs -Wait -PassThru; if ($p.ExitCode -ne 0) { exit $p.ExitCode }`, q(worker), q(planPath))
	v, err := command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", ps)
	if err != nil {
		return fmt.Errorf("UAC o proceso elevado: %s: %w", strings.TrimSpace(v), err)
	}
	return nil
}

var elevate = requestElevation

func runProtectedPlan(planPath string, out io.Writer) error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	dir := filepath.Dir(exe)
	if !strings.EqualFold(filepath.Dir(planPath), dir) || !strings.HasPrefix(strings.ToLower(filepath.Base(dir)), "bloom-uninstall-") {
		return errors.New("plan protegido fuera del worker temporal")
	}
	data, err := os.ReadFile(planPath)
	if err != nil {
		return err
	}
	var plan protectedPlan
	if err := json.Unmarshal(data, &plan); err != nil {
		return err
	}
	if filepath.Base(plan.Root) != "BloomNucleus" || !filepath.IsAbs(plan.Root) {
		return errors.New("raíz protegida inválida")
	}
	resolved, err := filepath.EvalSymlinks(plan.Root)
	if err != nil || !strings.EqualFold(resolved, filepath.Clean(plan.Root)) {
		return errors.New("raíz protegida redirigida")
	}
	for _, s := range plan.Services {
		if !containsStringFold(services, s) || !ownedService(s, plan.Root) {
			return fmt.Errorf("servicio no verificable: %s", s)
		}
	}
	for _, k := range plan.Registry {
		if !strings.HasPrefix(strings.ToUpper(k), "HKLM\\") || !allowedRegistryKey(k) || !ownedRegistry(k, plan.Root) {
			return fmt.Errorf("registro HKLM no verificable: %s", k)
		}
	}
	for _, s := range plan.Services {
		if !ownedService(s, plan.Root) {
			return fmt.Errorf("servicio cambió antes de retirarlo: %s", s)
		}
		// Nucleus detaches npm/Vite, so stopping the service alone can leave
		// descendants holding files under logs. Capture their identities while
		// the service parent still exists.
		children, err := captureServiceDescendants(s)
		if err != nil {
			return fmt.Errorf("inventariar hijos de %s: %w", s, err)
		}
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
		if err := stopCapturedDescendants(children, out); err != nil {
			return fmt.Errorf("detener hijos de %s: %w", s, err)
		}
		if v, err := command("sc.exe", "delete", s); err != nil {
			return fmt.Errorf("eliminar servicio %s: %s: %w", s, strings.TrimSpace(v), err)
		}
		for i := 0; i < 20; i++ {
			if _, err := command("sc.exe", "query", s); err != nil {
				break
			}
			time.Sleep(500 * time.Millisecond)
		}
		if _, err := command("sc.exe", "query", s); err == nil {
			return fmt.Errorf("servicio %s continúa registrado", s)
		}
		fmt.Fprintln(out, "Servicio retirado:", s)
	}
	for _, k := range plan.Registry {
		if !ownedRegistry(k, plan.Root) {
			return fmt.Errorf("registro HKLM cambió: %s", k)
		}
		if v, err := command("reg.exe", "delete", k, "/f"); err != nil {
			return fmt.Errorf("eliminar %s: %s: %w", k, strings.TrimSpace(v), err)
		}
		if ownedRegistry(k, plan.Root) {
			return fmt.Errorf("registro HKLM restante: %s", k)
		}
		fmt.Fprintln(out, "Registro HKLM retirado:", k)
	}
	return nil
}

func allowedRegistryKey(k string) bool {
	lower := strings.ToLower(k)
	return strings.HasPrefix(lower, `hklm\software\google\chrome\nativemessaginghosts\com.bloom.`) && !strings.Contains(strings.TrimPrefix(lower, `hklm\software\google\chrome\nativemessaginghosts\`), `\`)
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
	bloomDir := ""
	if workspace != "" {
		if _, statErr := os.Lstat(filepath.Join(workspace, ".bloom")); os.IsNotExist(statErr) {
			fmt.Fprintln(out, ".bloom desapareció antes de la limpieza; se omitirá.")
			workspace = ""
		} else if statErr != nil {
			return statErr
		}
	}
	if workspace == "" {
		_, candidates, err := readConfiguredWorkspaces(root)
		if err != nil {
			return err
		}
		if len(candidates) != 0 {
			return errors.New("apareció una .bloom configurada después de la confirmación")
		}
	} else {
		_, bloomDir, err = validateWorkspace(workspace, root)
		if err != nil {
			return err
		}
		if !configuredWorkspaceAllowed(root, workspace) {
			return errors.New("el workspace ya no figura en la configuración de Nucleus")
		}
	}
	if !test {
		if err := stopOwnedProcesses(root, out); err != nil {
			return err
		}
		for _, key := range inv.registry {
			if !strings.HasPrefix(strings.ToUpper(key), "HKCU\\") {
				continue
			}
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
	if err := validateInstallationDirectory(root); err != nil {
		return err
	}
	if workspace == "" {
		_, candidates, err := readConfiguredWorkspaces(root)
		if err != nil {
			return err
		}
		if len(candidates) != 0 {
			return errors.New("apareció una .bloom configurada durante la desinstalación")
		}
	}
	if err := os.RemoveAll(root); err != nil {
		return fmt.Errorf("eliminar %s: %w", root, err)
	}
	if bloomDir != "" {
		// Recheck immediately before removing the selected workspace state.
		if _, statErr := os.Lstat(bloomDir); os.IsNotExist(statErr) {
			fmt.Fprintln(out, ".bloom ya no existe; se omite su eliminación.")
			bloomDir = ""
		} else if statErr != nil {
			return statErr
		} else {
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
		}
	}
	if _, err := os.Lstat(root); !os.IsNotExist(err) {
		return errors.New("quedan archivos de la instalación")
	}
	if !test {
		for _, k := range inv.registry {
			if !strings.HasPrefix(strings.ToUpper(k), "HKCU\\") {
				continue
			}
			if ownedRegistry(k, root) {
				return fmt.Errorf("registro restante: %s", k)
			}
		}
	}
	if bloomDir == "" {
		fmt.Fprintln(out, "Instalación eliminada; .bloom no existía y se omitió.")
	} else {
		fmt.Fprintln(out, "Instalación y .bloom del workspace eliminadas; ausencia de restos administrados verificada.")
	}
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
