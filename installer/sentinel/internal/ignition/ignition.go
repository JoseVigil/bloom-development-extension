package ignition

import (
	"encoding/json"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"sentinel/internal/core"
	"time"

	"github.com/google/uuid"
)

type IgnitionSpec struct {
	ExecutablePath string   `json:"executable_path"`
	UserDataDir    string   `json:"user_data_dir"`
	ExtensionPath  string   `json:"extension_path"`
	URL            string   `json:"url"`
	Flags          []string `json:"flags"`
}

type Ignition struct {
	Core      *core.Core
	Telemetry *TelemetryHub
	SpecPath  string
}

func New(c *core.Core) *Ignition {
	return &Ignition{
		Core:      c,
		Telemetry: NewTelemetryHub(c),
	}
}

// Launch orquesta la secuencia crítica de arranque
func (ig *Ignition) Launch(profileID string, mode string) error {
	ig.Core.Logger.Info("[IGNITION] Iniciando secuencia de ignición para: %s", profileID)

	// 1. Pre-flight
	if err := ig.preFlight(profileID); err != nil {
		return fmt.Errorf("pre-flight failed: %v", err)
	}

	// 2. Telemetry Init (Higiene y Tailing)
	if err := ig.Telemetry.Setup(); err != nil {
		return fmt.Errorf("telemetry setup failed: %v", err)
	}
	ig.Telemetry.StartTailing()

	// 3. Generación del Spec
	_, err := ig.generateSpec(profileID, mode)
	if err != nil {
		return err
	}
	ig.Core.Logger.Success("[IGNITION] Spec generated: %s", filepath.Base(ig.SpecPath))

	// 4. Brain Start (Presurización)
	if err := ig.startBrainService(); err != nil {
		return err
	}

	// 5. Execution (The Spark)
	if err := ig.execute(profileID); err != nil {
		return err
	}

	// 6. Validation (Wait for Late Binding)
	ig.Core.Logger.Info("[IGNITION] Esperando validación de enlace (Late Binding)...")
	select {
	case <-ig.Telemetry.SuccessChan:
		ig.Core.Logger.Success("[IGNITION] Ignición exitosa confirmada por Telemetría.")
		return nil
	case errStr := <-ig.Telemetry.ErrorChan:
		return fmt.Errorf("error detectado en telemetría: %s", errStr)
	case <-time.After(30 * time.Second):
		return fmt.Errorf("timeout esperando LATE_BINDING_SUCCESS")
	}
}

func (ig *Ignition) preFlight(profileID string) error {
	// Borrar SingletonLock
	lockPath := filepath.Join(ig.Core.Paths.AppDataDir, "profiles", profileID, "SingletonLock")
	os.Remove(lockPath)

	// Verificar puerto 5678
	conn, _ := net.DialTimeout("tcp", "127.0.0.1:5678", 500*time.Millisecond)
	if conn != nil {
		conn.Close()
		return fmt.Errorf("el puerto 5678 ya está ocupado. Cierra instancias previas del Brain")
	}
	return nil
}

func (ig *Ignition) generateSpec(profileID string, mode string) (*IgnitionSpec, error) {
	id := uuid.New().String()
	ig.SpecPath = filepath.Join(os.TempDir(), fmt.Sprintf("ignition_%s.json", id))

	profilePath := filepath.Join(ig.Core.Paths.AppDataDir, "profiles", profileID)
	
	// Determinamos URL
	url := "chrome-extension://jdfllfcmmcmm.../landing/index.html" // Cockpit por defecto
	if mode == "discovery" {
		url = "chrome-extension://jdfllfcmmcmm.../discovery/index.html"
	}

	spec := &IgnitionSpec{
		ExecutablePath: filepath.Join(ig.Core.Paths.BinDir, "chrome-win", "chrome.exe"),
		UserDataDir:    profilePath,
		ExtensionPath:  filepath.Join(profilePath, "extension"),
		URL:            url,
		Flags: []string{
			"--no-sandbox", "--test-type", "--disable-web-security",
			"--disable-features=IsolateOrigins,site-per-process",
			"--remote-debugging-port=0", "--no-first-run",
			"--no-default-browser-check", "--disable-sync",
		},
	}

	data, _ := json.MarshalIndent(spec, "", "  ")
	return spec, os.WriteFile(ig.SpecPath, data, 0644)
}

func (ig *Ignition) startBrainService() error {
	cmd := exec.Command("brain.exe", "service", "start")
	if err := cmd.Start(); err != nil {
		return err
	}

	// Bloquear hasta que el puerto responda
	for i := 0; i < 20; i++ {
		conn, _ := net.DialTimeout("tcp", "127.0.0.1:5678", 500*time.Millisecond)
		if conn != nil {
			conn.Close()
			ig.Core.Logger.Success("[IGNITION] Brain TCP Service confirmed on port 5678.")
			return nil
		}
		time.Sleep(500 * time.Millisecond)
	}
	return fmt.Errorf("brain service no respondió en el puerto 5678")
}

func (ig *Ignition) execute(profileID string) error {
	cmd := exec.Command("brain.exe", "profile", "launch", profileID, "--spec", ig.SpecPath)
	return cmd.Start()
}