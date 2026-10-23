package main

import (
	"bufio"
	"bytes"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func disposableRoot(t *testing.T) string {
	t.Helper()
	root, err := os.MkdirTemp("", "BloomUninstallTest-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(root) })
	if err := os.WriteFile(filepath.Join(root, ".bloom-uninstall-test"), nil, 0600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("BLOOM_UNINSTALL_TEST_ROOT", root)
	return root
}

func TestConfigPathsAreReferencesOnly(t *testing.T) {
	root := `C:\Users\person\AppData\Local\BloomNucleus`
	data := []byte(`{"binary":"C:\\Users\\person\\AppData\\Local\\BloomNucleus\\bin\\brain.exe","profile":"D:\\another\\profile","token":"secret"}`)
	inside, outside := countConfigPaths(data, root)
	if inside != 1 || outside != 1 {
		t.Fatalf("rutas: internas=%d externas=%d", inside, outside)
	}
}

func TestConfigSummaryRejectsUnexpectedSchema(t *testing.T) {
	if count, ok := configItemCount("config/metamorph.json", []byte(`{"managed_binaries":[{},{}]}`)); !ok || count != 2 {
		t.Fatal("no contó binarios")
	}
	if _, ok := configItemCount("config/metamorph.json", []byte(`{"managed_binaries":"invalid"}`)); ok {
		t.Fatal("aceptó esquema inválido")
	}
}

func TestProtectedPlanOnlyAllowsBloomHKLMHost(t *testing.T) {
	if !allowedRegistryKey(`HKLM\SOFTWARE\Google\Chrome\NativeMessagingHosts\com.bloom.nucleus.bridge`) {
		t.Fatal("rechazó host Bloom")
	}
	for _, key := range []string{
		`HKCU\Software\Google\Chrome\NativeMessagingHosts\com.bloom.nucleus.bridge`,
		`HKLM\SOFTWARE\Google\Chrome\NativeMessagingHosts\com.other.host`,
		`HKLM\SOFTWARE\Google\Chrome\NativeMessagingHosts\com.bloom.host\other`,
	} {
		if allowedRegistryKey(key) {
			t.Fatalf("aceptó clave ajena: %s", key)
		}
	}
}

func TestCanceledElevationStopsBeforeUserCleanup(t *testing.T) {
	root := disposableRoot(t)
	workspace, bloom := disposableWorkspace(t)
	tmp := t.TempDir()
	previous := elevate
	elevate = func(_, _ string) error { return errors.New("cancelled") }
	t.Cleanup(func() { elevate = previous })
	inv := inventory{root: root, workspace: workspace, bloomDir: bloom, services: []string{"BloomNucleusService"}}
	if err := performProtectedStage(inv, filepath.Join(tmp, "worker.exe"), tmp, &bytes.Buffer{}); err == nil {
		t.Fatal("cancelación aceptada")
	}
	if _, err := os.Stat(root); err != nil {
		t.Fatal("borró instalación:", err)
	}
	if _, err := os.Stat(bloom); err != nil {
		t.Fatal("borró .bloom:", err)
	}
}

func disposableWorkspace(t *testing.T) (string, string) {
	t.Helper()
	workspace := t.TempDir()
	nucleus := filepath.Join(workspace, ".bloom", ".nucleus-test")
	if err := os.MkdirAll(filepath.Join(nucleus, ".core"), 0700); err != nil {
		t.Fatal(err)
	}
	identity := `{"nucleus":{"path":"` + strings.ReplaceAll(nucleus, `\`, `\\`) + `","rootPath":"` + strings.ReplaceAll(workspace, `\`, `\\`) + `"}}`
	if err := os.WriteFile(filepath.Join(nucleus, ".core", ".nucleus-config.json"), []byte(identity), 0600); err != nil {
		t.Fatal(err)
	}
	return workspace, filepath.Join(workspace, ".bloom")
}

func configureWorkspace(t *testing.T, root, workspace string) {
	t.Helper()
	configDir := filepath.Join(root, "config")
	if err := os.MkdirAll(configDir, 0700); err != nil {
		t.Fatal(err)
	}
	data := `{"onboarding":{"active_org_slug":"test","organizations":[{"org_slug":"test","workspace_path":"` + strings.ReplaceAll(workspace, `\`, `\\`) + `"}]}}`
	if err := os.WriteFile(filepath.Join(configDir, "nucleus.json"), []byte(data), 0600); err != nil {
		t.Fatal(err)
	}
}

func TestCancellationPreservesInstallation(t *testing.T) {
	root := disposableRoot(t)
	workspace, bloom := disposableWorkspace(t)
	configureWorkspace(t, root, workspace)
	path := filepath.Join(root, "bin", "brain.exe")
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("fixture"), 0600); err != nil {
		t.Fatal(err)
	}
	var out bytes.Buffer
	if err := run(nil, strings.NewReader("NO\n"), &out); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatal("cancelación borró archivo:", err)
	}
	if _, err := os.Stat(bloom); err != nil {
		t.Fatal("cancelación borró .bloom:", err)
	}
	if !strings.Contains(out.String(), filepath.Join(root, "bin")) {
		t.Fatal("faltó inventario")
	}
}

func TestVersionDoesNotRequireInstallation(t *testing.T) {
	t.Setenv("BLOOM_UNINSTALL_TEST_ROOT", "")
	t.Setenv("LOCALAPPDATA", "")
	var out bytes.Buffer
	if err := run([]string{"--version"}, strings.NewReader(""), &out); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), "v1.0.0-build.0") {
		t.Fatalf("versión inesperada: %q", out.String())
	}
}

func TestOwnershipRequiresPathBoundary(t *testing.T) {
	root := `C:\Users\example\AppData\Local\BloomNucleus`
	if !containsRoot(`C:\Users\example\AppData\Local\BloomNucleus\bin\nssm\nssm.exe`, root) {
		t.Fatal("service path inside installation not recognized")
	}
	if containsRoot(`C:\Users\example\AppData\Local\BloomNucleusOther\bin\nssm.exe`, root) {
		t.Fatal("neighbor installation treated as owned")
	}
}

func TestConfirmedDisposableInstallationIsRemoved(t *testing.T) {
	root := disposableRoot(t)
	workspace, bloom := disposableWorkspace(t)
	configureWorkspace(t, root, workspace)
	project := filepath.Join(workspace, "project.txt")
	if err := os.WriteFile(project, []byte("keep"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, "bin", "uninstall"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "bin", "uninstall", "example.dat"), []byte("fixture"), 0600); err != nil {
		t.Fatal(err)
	}
	exe := filepath.Join(t.TempDir(), "bloom-uninstall.exe")
	build := exec.Command("go", "build", "-buildvcs=false", "-o", exe, ".")
	if output, err := build.CombinedOutput(); err != nil {
		t.Fatalf("build: %v: %s", err, output)
	}
	cmd := exec.Command(exe)
	cmd.Stdin = strings.NewReader("SI\n")
	if output, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("uninstall: %v: %s", err, output)
	}
	deadline := time.Now().Add(12 * time.Second)
	for time.Now().Before(deadline) {
		if _, err := os.Lstat(root); os.IsNotExist(err) {
			if _, err := os.Lstat(bloom); os.IsNotExist(err) {
				if _, err := os.Stat(project); err != nil {
					t.Fatal("borró archivo de proyecto:", err)
				}
				return
			}
		}
		time.Sleep(100 * time.Millisecond)
	}
	t.Fatal("worker no eliminó la instalación descartable")
}

func TestWorkspaceIdentityMismatchIsRejected(t *testing.T) {
	workspace, _ := disposableWorkspace(t)
	identity := filepath.Join(workspace, ".bloom", ".nucleus-test", ".core", ".nucleus-config.json")
	if err := os.WriteFile(identity, []byte(`{"nucleus":{"path":"C:\\other","rootPath":"C:\\other"}}`), 0600); err != nil {
		t.Fatal(err)
	}
	if _, _, err := validateWorkspace(workspace, filepath.Join(workspace, "install")); err == nil {
		t.Fatal("aceptó identidad ajena")
	}
}

func TestWorkspaceComesFromNucleusOnboardingNotOriginPath(t *testing.T) {
	root := disposableRoot(t)
	workspace, _ := disposableWorkspace(t)
	configureWorkspace(t, root, workspace)
	data, err := os.ReadFile(filepath.Join(root, "config", "nucleus.json"))
	if err != nil {
		t.Fatal(err)
	}
	decoy := `{"installation":{"origin_path":"C:\\repos\\source-code"},` + strings.TrimPrefix(string(data), "{")
	if err := os.WriteFile(filepath.Join(root, "config", "nucleus.json"), []byte(decoy), 0600); err != nil {
		t.Fatal(err)
	}
	var out bytes.Buffer
	got, _, err := selectConfiguredWorkspace(root, bufio.NewReader(strings.NewReader("")), &out)
	if err != nil || !strings.EqualFold(got, workspace) {
		t.Fatalf("workspace=%q err=%v", got, err)
	}
	if !strings.Contains(out.String(), "config/nucleus.json") {
		t.Fatal("no informó procedencia")
	}
}

func TestMissingConfiguredWorkspaceStopsUninstall(t *testing.T) {
	root := disposableRoot(t)
	workspace, _ := disposableWorkspace(t)
	configureWorkspace(t, root, workspace)
	if err := os.WriteFile(filepath.Join(root, "config", "nucleus.json"), []byte(`{"installation":{"origin_path":"C:\\repos\\source-code"}}`), 0600); err != nil {
		t.Fatal(err)
	}
	if _, _, err := readConfiguredWorkspaces(root); err == nil {
		t.Fatal("aceptó origin_path como workspace")
	}
}

func TestInvalidActiveOrganizationDoesNotSelectAnotherWorkspace(t *testing.T) {
	root := disposableRoot(t)
	workspace, _ := disposableWorkspace(t)
	configureWorkspace(t, root, workspace)
	config := filepath.Join(root, "config", "nucleus.json")
	data, err := os.ReadFile(config)
	if err != nil {
		t.Fatal(err)
	}
	data = bytes.Replace(data, []byte(`"active_org_slug":"test"`), []byte(`"active_org_slug":"other"`), 1)
	if err := os.WriteFile(config, data, 0600); err != nil {
		t.Fatal(err)
	}
	if _, _, err := selectConfiguredWorkspace(root, bufio.NewReader(strings.NewReader("")), &bytes.Buffer{}); err == nil {
		t.Fatal("eligió otra organización")
	}
}
