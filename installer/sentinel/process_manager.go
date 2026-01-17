package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"
	"syscall"
	"time"
)

// ProcessManager gestiona el ciclo de vida de todos los procesos
type ProcessManager struct {
	ctx       context.Context
	mu        sync.Mutex
	processes map[string]*ManagedProcess
	paths     *PathResolver
}

// ManagedProcess representa un proceso supervisado
type ManagedProcess struct {
	Name string
	Cmd  *exec.Cmd
	PID  int
}

// LaunchSpec especifica cómo lanzar Chromium
type LaunchSpec struct {
	ProfileID string
	URL       string
	Flags     []string
}

// NewProcessManager crea un nuevo gestor de procesos
func NewProcessManager(ctx context.Context, paths *PathResolver) *ProcessManager {
	return &ProcessManager{
		ctx:       ctx,
		processes: make(map[string]*ManagedProcess),
		paths:     paths,
	}
}

// PreflightChecks ejecuta las verificaciones previas al lanzamiento
func (pm *ProcessManager) PreflightChecks(profileID string) error {
	log.Println("[PREFLIGHT] Starting preflight checks...")

	// Check 1: Verificar puerto 5678
	if pm.isPortInUse(5678) {
		log.Println("[PREFLIGHT] Port 5678 is in use. Attempting to kill owner...")
		if err := pm.killPortOwner(5678); err != nil {
			return fmt.Errorf("cannot free port 5678: %w", err)
		}
	}

	// Check 2: Limpiar archivos de bloqueo
	userDataDir := pm.getUserDataDir(profileID)
	if err := pm.cleanLockFiles(userDataDir); err != nil {
		log.Printf("[PREFLIGHT] Warning: Could not clean locks: %v", err)
	}

	log.Println("[PREFLIGHT] All checks passed ✓")
	return nil
}

// StartBrainService inicia el servicio Brain y espera el handshake
func (pm *ProcessManager) StartBrainService() error {
	log.Println("[BRAIN] Starting Brain service...")

	// Usar ruta resuelta del PathResolver
	brainPath := pm.paths.GetBrainPath()

	cmd := exec.CommandContext(pm.ctx, brainPath, "service", "start")
	
	// En Windows, ocultar ventana de consola
	if runtime.GOOS == "windows" {
		cmd.SysProcAttr = getWindowsHiddenProcAttr()
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start brain: %w", err)
	}

	pm.registerProcess("brain_service", cmd)

	// Esperar handshake en puerto 5678
	if err := pm.waitForPort(5678, 30*time.Second); err != nil {
		return fmt.Errorf("brain service handshake failed: %w", err)
	}

	log.Println("[BRAIN] Service ready on port 5678 ✓")
	return nil
}

// LaunchChromium lanza Chromium con la spec proporcionada
func (pm *ProcessManager) LaunchChromium(spec *LaunchSpec) error {
	log.Printf("[CHROMIUM] Launching profile: %s", spec.ProfileID)

	// Usar ruta resuelta del PathResolver
	brainPath := pm.paths.GetBrainPath()

	// Construir comando para brain.exe profile launch
	args := []string{"profile", "launch", "--profile-id", spec.ProfileID}
	
	// Pasar flags como JSON para evitar parsing complejo
	flagsJSON := pm.buildFlagsJSON(spec)
	args = append(args, "--chromium-flags", flagsJSON)
	args = append(args, "--url", spec.URL)

	cmd := exec.CommandContext(pm.ctx, brainPath, args...)
	
	if runtime.GOOS == "windows" {
		cmd.SysProcAttr = getWindowsHiddenProcAttr()
	}

	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to launch chromium: %w", err)
	}

	pm.registerProcess("chromium_"+spec.ProfileID, cmd)
	log.Printf("[CHROMIUM] Launched with PID: %d", cmd.Process.Pid)

	return nil
}

// StopAll mata todos los procesos supervisados (REAPER)
func (pm *ProcessManager) StopAll() {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	log.Println("[REAPER] Terminating all managed processes...")

	for name, proc := range pm.processes {
		if proc.Cmd.Process != nil {
			log.Printf("[REAPER] Killing %s (PID: %d)", name, proc.PID)
			proc.Cmd.Process.Kill()
		}
	}

	pm.processes = make(map[string]*ManagedProcess)
	log.Println("[REAPER] Cleanup complete")
}

// GetStatus retorna el estado de los procesos
func (pm *ProcessManager) GetStatus() map[string]interface{} {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	running := make([]string, 0)
	for name := range pm.processes {
		running = append(running, name)
	}

	return map[string]interface{}{
		"running_processes": running,
		"port_5678_open":    pm.isPortInUse(5678),
	}
}

// Utilidades internas

func (pm *ProcessManager) registerProcess(name string, cmd *exec.Cmd) {
	pm.mu.Lock()
	defer pm.mu.Unlock()
	pm.processes[name] = &ManagedProcess{
		Name: name,
		Cmd:  cmd,
		PID:  cmd.Process.Pid,
	}
}

func (pm *ProcessManager) isPortInUse(port int) bool {
	addr := fmt.Sprintf("localhost:%d", port)
	conn, err := net.DialTimeout("tcp", addr, 1*time.Second)
	if err != nil {
		return false
	}
	conn.Close()
	return true
}

func (pm *ProcessManager) waitForPort(port int, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if pm.isPortInUse(port) {
			return nil
		}
		time.Sleep(500 * time.Millisecond)
	}
	return fmt.Errorf("timeout waiting for port %d", port)
}

func (pm *ProcessManager) killPortOwner(port int) error {
	// TODO: Implementar lógica específica por OS para matar proceso que posee el puerto
	// En Windows: netstat -ano | findstr :5678 y taskkill /PID
	// En macOS/Linux: lsof -ti:5678 | xargs kill -9
	log.Printf("[PREFLIGHT] Port killing not implemented yet for %s", runtime.GOOS)
	return nil
}

func (pm *ProcessManager) getUserDataDir(profileID string) string {
	// TODO: Obtener desde configuración
	if runtime.GOOS == "windows" {
		return filepath.Join(os.Getenv("APPDATA"), "Synapse", "Profiles", profileID)
	}
	return filepath.Join(os.Getenv("HOME"), ".synapse", "profiles", profileID)
}

func (pm *ProcessManager) cleanLockFiles(userDataDir string) error {
	lockFiles := []string{"SingletonLock", "LOCK"}
	
	for _, lockFile := range lockFiles {
		path := filepath.Join(userDataDir, lockFile)
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			return err
		}
	}
	
	return nil
}

func (pm *ProcessManager) buildFlagsJSON(spec *LaunchSpec) string {
	// Asegurar que todos los flags del blueprint estén incluidos
	allFlags := make([]string, len(spec.Flags))
	copy(allFlags, spec.Flags)
	
	// Log para debugging: ver qué flags se están enviando
	log.Printf("[CHROMIUM] Injecting %d flags from blueprint", len(allFlags))
	for _, flag := range allFlags {
		log.Printf("[CHROMIUM]   → %s", flag)
	}
	
	// Convertir flags a JSON para pasarle a Brain
	data := map[string]interface{}{
		"flags": allFlags,
	}
	jsonData, _ := json.Marshal(data)
	return string(jsonData)
}

// getWindowsHiddenProcAttr retorna atributos para ocultar ventanas en Windows
func getWindowsHiddenProcAttr() *syscall.SysProcAttr {
	if runtime.GOOS != "windows" {
		return nil
	}
	return &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: 0x08000000, // CREATE_NO_WINDOW
	}
}