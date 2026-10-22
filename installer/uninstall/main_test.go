package main

import (
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

func TestCancellationPreservesInstallation(t *testing.T) {
	root := disposableRoot(t)
	workspace, bloom := disposableWorkspace(t)
	path := filepath.Join(root, "bin", "brain.exe")
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("fixture"), 0600); err != nil {
		t.Fatal(err)
	}
	var out bytes.Buffer
	if err := run(nil, strings.NewReader(workspace+"\nNO\n"), &out); err != nil {
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
	cmd.Stdin = strings.NewReader(workspace + "\nSI\n")
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
