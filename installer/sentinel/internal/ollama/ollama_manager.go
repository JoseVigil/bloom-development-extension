package ollama

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sentinel/internal/core"
	"sync"
	"time"
)

// Estados de la FSM
const (
	StateStopped      = "STOPPED"
	StateStarting     = "STARTING"
	StateRunning      = "RUNNING"
	StateUnresponsive = "UNRESPONSIVE"
	StateCrashed      = "CRASHED"
	StateDegraded     = "DEGRADED"
	StateDisabled     = "DISABLED"
)

type OllamaCheckResult struct {
	Reachable bool   `json:"reachable"`
	Version   string `json:"version"`
	Error     error  `json:"-"`
}

type StatusInfo struct {
	State        string `json:"state"`
	Reachable    bool   `json:"reachable"`
	Version      string `json:"version"`
	PID          int    `json:"pid"`
	RestartCount int    `json:"restart_count"`
}

type Supervisor struct {
	mu             sync.RWMutex
	state          string
	cmd            *exec.Cmd
	restartHistory []time.Time
	coreRef        *core.Core
	logger         *core.Logger
	binPath        string
	modelsPath     string
	stopChan       chan bool
}

func NewSupervisor(c *core.Core) *Supervisor {
	// Crear logger categorizado para Ollama
	ollamaLogger, err := core.InitLogger(
		c.Paths,
		"ollama_service", // ID del componente
		"OLLAMA ENGINE",  // Label descriptivo
		3,                // Priority (⚙️)
	)
	if err != nil {
		c.Logger.Error("Error creando logger de Ollama: %v", err)
		ollamaLogger = c.Logger // Fallback al logger genérico
	}

	// Localización del binario embebido
	binPath := filepath.Join(c.Paths.BinDir, "ollama.exe")
	// Ruta de modelos en AppData/Bloom
	modelsPath := filepath.Join(c.Paths.AppDataDir, "bin", "ollama", "models")

	return &Supervisor{
		state:      StateStopped,
		coreRef:    c,
		logger:     ollamaLogger,
		binPath:    binPath,
		modelsPath: modelsPath,
		stopChan:   make(chan bool),
	}
}

// 1️⃣ HEALTHCHECK PUNTUAL
func CheckOllamaOnce() OllamaCheckResult {
	client := http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get("http://127.0.0.1:11434/api/version")
	if err != nil {
		return OllamaCheckResult{Reachable: false, Error: err}
	}
	defer resp.Body.Close()

	var data struct {
		Version string `json:"version"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return OllamaCheckResult{Reachable: false, Error: err}
	}

	return OllamaCheckResult{Reachable: true, Version: data.Version}
}

// 2️⃣ HEARTBEAT OPERATIVO (Loop en goroutine)
func (s *Supervisor) StartSupervisor(interval time.Duration) {
	s.logger.Info("🤖 Supervisor iniciado (Intervalo: %v)", interval)

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			s.reconcile()
		case <-s.stopChan:
			s.logger.Info("⏹️ Supervisor detenido")
			return
		}
	}
}

func (s *Supervisor) reconcile() {
	s.mu.Lock()
	defer s.mu.Unlock()

	check := CheckOllamaOnce()

	if check.Reachable {
		if s.state != StateRunning {
			s.state = StateRunning
			s.logger.Success("Estado: RUNNING | Versión: %s", check.Version)
		}
		
		// Limpiar historial de reinicios si está estable
		if len(s.restartHistory) > 0 && time.Since(s.restartHistory[len(s.restartHistory)-1]) > 5*time.Minute {
			s.restartHistory = nil
		}
		return
	}

	// Si no es alcanzable, evaluar reinicio
	if s.state == StateDegraded {
		return // No reintentar si excedió límites
	}

	s.logger.Warning("⚠️ Ollama no responde. Intentando recuperación...")
	s.attemptRestart()
}

func (s *Supervisor) attemptRestart() {
	// Política de seguridad: 3 reinicios en 60 seg
	now := time.Now()
	var recentRestarts []time.Time
	for _, t := range s.restartHistory {
		if now.Sub(t) < 60*time.Second {
			recentRestarts = append(recentRestarts, t)
		}
	}
	s.restartHistory = recentRestarts

	if len(s.restartHistory) >= 3 {
		s.state = StateDegraded
		s.logger.Error("❌ Ollama entró en modo DEGRADED. Demasiados fallos.")
		return
	}

	s.state = StateStarting
	s.restartHistory = append(s.restartHistory, now)

	// Matar proceso anterior si existe
	if s.cmd != nil && s.cmd.Process != nil {
		_ = s.cmd.Process.Kill()
	}

	// Configurar Comando
	s.cmd = exec.Command(s.binPath, "serve")

	// Variables de Entorno Requeridas
	s.cmd.Env = append(os.Environ(),
		fmt.Sprintf("OLLAMA_MODELS=%s", s.modelsPath),
		"OLLAMA_HOST=127.0.0.1:11434",
	)

	// Asegurar creación de directorio de modelos
	_ = os.MkdirAll(s.modelsPath, 0755)

	if err := s.cmd.Start(); err != nil {
		s.state = StateCrashed
		s.logger.Error("❌ Error crítico iniciando Ollama: %v", err)
		return
	}

	s.logger.Success("🚀 Ollama spawn exitoso (PID: %d)", s.cmd.Process.Pid)
}

// 3️⃣ STOP - Detener supervisor y proceso
func (s *Supervisor) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Enviar señal de stop al heartbeat
	select {
	case s.stopChan <- true:
	default:
		// Canal ya cerrado o bloqueado
	}

	// Matar proceso si existe
	if s.cmd != nil && s.cmd.Process != nil {
		s.logger.Warning("Deteniendo proceso Ollama (PID: %d)", s.cmd.Process.Pid)
		_ = s.cmd.Process.Kill()
		s.cmd = nil
	}

	s.state = StateStopped
	s.logger.Info("Estado: STOPPED")
}

// 4️⃣ GET STATUS - Obtener estado completo
func (s *Supervisor) GetStatus() StatusInfo {
	s.mu.RLock()
	defer s.mu.RUnlock()

	check := CheckOllamaOnce()

	return StatusInfo{
		State:        s.state,
		Reachable:    check.Reachable,
		Version:      check.Version,
		PID:          s.getPID(),
		RestartCount: len(s.restartHistory),
	}
}

func (s *Supervisor) getPID() int {
	if s.cmd != nil && s.cmd.Process != nil {
		return s.cmd.Process.Pid
	}
	return 0
}

func (s *Supervisor) GetState() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.state
}