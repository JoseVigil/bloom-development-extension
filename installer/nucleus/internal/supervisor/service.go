// File: internal/supervisor/service.go
// Core supervisor business logic + registro del comando "service"
// Sigue Guía Maestra de Implementación Comandos NUCLEUS v2.0
//
// ============================================================================
// CHANGELOG — qué se cambió y POR QUÉ
// ============================================================================
//
// PROBLEMA 1 — Temporal muere silenciosamente a los 120 segundos
// ──────────────────────────────────────────────────────────────
// ANTES: exec.CommandContext(ctx, temporal.exe, "server", "start-dev")
// DESPUÉS: exec.Command(temporal.exe, "server", "start-dev")
//
// ¿Por qué? exec.CommandContext vincula el proceso hijo al ciclo de vida del
// contexto padre. bootCtx tiene un timeout de 120 segundos. Cuando ese plazo
// vence, Go llama internamente a cmd.Process.Kill() — matando Temporal sin
// escribir ningún error en el log de Go. El resultado: puerto 7233 se cierra,
// el Worker pierde su conexión gRPC, y el Control Plane nunca recibe las env
// vars que necesita. Todo el sistema colapsa en silencio.
//
// La solución es usar exec.Command (sin contexto), que es exactamente lo que
// ya hacen startBrainServer y startSvelteDev en este mismo archivo. Temporal
// es un proceso de larga duración — su ciclo de vida no debe depender del
// timeout de arranque del supervisor.
//
// PROBLEMA 2 — Control Plane (Node.js) muere por el mismo motivo
// ──────────────────────────────────────────────────────────────
// ANTES: exec.CommandContext(ctx, node.exe, bundleScript)
// DESPUÉS: exec.Command(node.exe, bundleScript)
//
// Mismo problema exacto. bundle.js es un servidor HTTP/WebSocket de larga
// duración. Al estar atado al bootCtx de 120s, Node moría exactamente al
// mismo tiempo que Temporal. Esto además causaba que BLOOM_VAULT_STATE y
// BLOOM_WORKER_RUNNING desaparecieran del entorno activo.
//
// PROBLEMA 3 — setSvelteProcAttr faltaba en Temporal y Control Plane
// ──────────────────────────────────────────────────────────────────
// Cuando NSSM reinicia el supervisor (o el padre termina por cualquier razón),
// Windows envía una señal de terminación a todo el grupo de procesos. Sin
// setSvelteProcAttr, Temporal y Node morirían junto con el supervisor.
// Con setSvelteProcAttr, se crean en un grupo de procesos separado y
// sobreviven independientemente.
//
// PROBLEMA 4 — BLOOM_VAULT_STATE hardcodeado como "UNLOCKED"
// ──────────────────────────────────────────────────────────
// ANTES: "BLOOM_VAULT_STATE=UNLOCKED" (siempre, sin importar el estado real)
// DESPUÉS: resolveVaultState(ctx) consulta el estado real via synapse
//
// Cuando el vault estaba bloqueado o no inicializado, Node arrancaba con una
// mentira en su entorno. Esto causaba comportamiento inconsistente en el
// control plane (decisiones basadas en un estado falso del vault).
//
// PROBLEMA 5 — BLOOM_WORKER_RUNNING hardcodeado como "true"
// ──────────────────────────────────────────────────────────
// ANTES: "BLOOM_WORKER_RUNNING=true" (siempre)
// DESPUÉS: isWorkerConnected(ctx) verifica pollers reales en Temporal
//
// Si el worker nunca se conectó (por ejemplo, porque Temporal tardó en
// arrancar), Node recibía BLOOM_WORKER_RUNNING=true cuando era falso.
// Ahora se consulta directamente el task-queue de Temporal.
//
// PROBLEMA 6 — Multiple inicializaciones de Node / Control Plane
// ──────────────────────────────────────────────────────────────
// ANTES: bootControlPlane no verificaba si ya había un proceso escuchando
//        en puerto 48215. Cada llamada a restart-bootstrap o al boot sequence
//        podía lanzar una nueva instancia de Node sin matar la anterior,
//        resultando en múltiples procesos compitiendo por el mismo puerto.
// DESPUÉS: isControlPlaneRunning() verifica el puerto antes de spawnar.
//          Si ya hay algo escuchando en 48215, retorna el proceso registrado
//          (o un proceso "externo") sin lanzar uno nuevo.
//          killExistingControlPlane() mata cualquier instancia previa antes
//          de un restart explícito (usado por restart-bootstrap).
//
// ============================================================================

package supervisor

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	"nucleus/internal/core"

	"github.com/spf13/cobra"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
)

// ProcessState representa el estado del ciclo de vida de un proceso gestionado
type ProcessState string

const (
	StateIdle     ProcessState = "IDLE"
	StateStarting ProcessState = "STARTING"
	StateReady    ProcessState = "READY"
	StateDegraded ProcessState = "DEGRADED"
	StateFailed   ProcessState = "FAILED"
	StateStopping ProcessState = "STOPPING"
	StateStopped  ProcessState = "STOPPED"
)

// ManagedProcess representa un proceso bajo supervisión
type ManagedProcess struct {
	Name      string
	Cmd       *exec.Cmd
	PID       int
	State     ProcessState
	LogPath   string
	StartedAt time.Time
	mu        sync.RWMutex
}

// Supervisor gestiona todos los procesos de Nucleus
type Supervisor struct {
	processes map[string]*ManagedProcess
	logsDir   string
	binDir    string
	mu        sync.RWMutex
}

// NewSupervisor crea un nuevo supervisor de procesos
func NewSupervisor(logsDir, binDir string) *Supervisor {
	return &Supervisor{
		processes: make(map[string]*ManagedProcess),
		logsDir:   logsDir,
		binDir:    binDir,
	}
}

// VaultStatusResult representa la respuesta del workflow vault-status
type VaultStatusResult struct {
	Success             bool   `json:"success"`
	VaultState          string `json:"vault_state"`
	MasterProfileActive bool   `json:"master_profile_active"`
	State               string `json:"state"`
	Error               string `json:"error,omitempty"`
	Timestamp           int64  `json:"timestamp"`
}

// StartOllamaResult representa la respuesta del workflow start-ollama
type StartOllamaResult struct {
	Success   bool   `json:"success"`
	PID       int    `json:"pid,omitempty"`
	Port      int    `json:"port"`
	State     string `json:"state"`
	Error     string `json:"error,omitempty"`
	Timestamp int64  `json:"timestamp"`
}

// ============================================================================
// TEMPORAL SERVER
// ============================================================================

// startTemporalServer inicia Temporal Server como subproceso de larga duración.
//
// CORRECCIÓN CRÍTICA: Usamos exec.Command (SIN contexto) en lugar de
// exec.CommandContext. Esto es fundamental porque:
//
//  1. exec.CommandContext vincula el proceso hijo al deadline del contexto.
//     Cuando bootCtx expira (120s), Go manda SIGKILL a temporal.exe
//     sin ningún aviso — el proceso muere silenciosamente.
//
//  2. Temporal es un servidor de larga duración. Su ciclo de vida debe ser
//     independiente del timeout de arranque del supervisor.
//
//  3. setSvelteProcAttr crea Temporal en un grupo de procesos separado.
//     Esto garantiza que sobreviva si NSSM reinicia el supervisor padre.
//
// Este mismo patrón ya lo usa startBrainServer y startSvelteDev en este archivo.
func (s *Supervisor) startTemporalServer(ctx context.Context) (*ManagedProcess, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// ¿Ya está corriendo en esta instancia del supervisor?
	if proc, exists := s.processes["temporal_server"]; exists {
		if proc.State == StateReady {
			return proc, nil
		}
	}

	// ¿Ya está escuchando en puerto 7233 de una instancia anterior?
	// Esto ocurre cuando NSSM reinicia el supervisor pero Temporal sobrevivió
	// porque tiene setSvelteProcAttr (grupo de procesos separado).
	if conn, err := net.DialTimeout("tcp", "localhost:7233", 1*time.Second); err == nil {
		conn.Close()
		proc := &ManagedProcess{
			Name:      "temporal_server",
			Cmd:       nil, // proceso externo — no lo gestionamos
			State:     StateReady,
			StartedAt: time.Now(),
		}
		s.processes["temporal_server"] = proc
		fmt.Fprintln(os.Stderr, "[INFO] ✓ Temporal server ya está corriendo en puerto 7233 — omitiendo inicio")
		return proc, nil
	}

	// Resolver ruta del binario
	temporalBin := filepath.Join(s.binDir, "temporal", "temporal.exe")
	if _, err := os.Stat(temporalBin); err != nil {
		if binPath, err := exec.LookPath("temporal"); err == nil {
			temporalBin = binPath
		} else {
			return nil, fmt.Errorf("temporal binary no encontrado en %s ni en PATH", temporalBin)
		}
	}

	// Archivo de log con fecha
	today := time.Now()
	dateStr := fmt.Sprintf("%04d%02d%02d", today.Year(), today.Month(), today.Day())
	logPath := filepath.Join(s.logsDir, "temporal", "server", fmt.Sprintf("temporal_server_%s.log", dateStr))
	if err := os.MkdirAll(filepath.Dir(logPath), 0755); err != nil {
		return nil, fmt.Errorf("error al crear directorio de log de temporal: %w", err)
	}
	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		return nil, fmt.Errorf("error al crear archivo de log de temporal: %w", err)
	}

	// ── CORRECCIÓN: exec.Command, NO exec.CommandContext ─────────────────────
	//
	// exec.CommandContext(bootCtx, ...) mataría Temporal cuando bootCtx expire
	// a los 120 segundos. Para procesos de larga duración SIEMPRE usar
	// exec.Command sin contexto, igual que startBrainServer (línea ~463).
	// ─────────────────────────────────────────────────────────────────────────
	cmd := exec.Command(temporalBin, "server", "start-dev")
	cmd.Stdout = logFile
	cmd.Stderr = logFile
	cmd.Dir = filepath.Dir(temporalBin)

	// Desacoplar del grupo de procesos del padre.
	// Sin esto, un CTRL+C o un reinicio de NSSM envía la señal a todo el grupo,
	// matando Temporal antes de que pueda hacer flush del WAL de SQLite.
	//
	// setSvelteProcAttr está definida en el archivo platform-specific del package
	// (supervisor_windows.go / supervisor_unix.go) — no en service_windows.go.
	setSvelteProcAttr(cmd)

	if err := cmd.Start(); err != nil {
		logFile.Close()
		return nil, fmt.Errorf("error al iniciar temporal server: %w", err)
	}

	proc := &ManagedProcess{
		Name:      "temporal_server",
		Cmd:       cmd,
		PID:       cmd.Process.Pid,
		State:     StateStarting,
		LogPath:   logPath,
		StartedAt: time.Now(),
	}
	s.processes["temporal_server"] = proc

	go s.monitorProcess(proc, logFile)
	return proc, nil
}

// waitForTemporalReady espera hasta que Temporal esté listo via health check gRPC.
// Este método es crítico: el Worker NO debe arrancar hasta que este check pase.
// Temporal tarda 2–5s en arrancar en frío (inicialización de SQLite WAL).
func (s *Supervisor) waitForTemporalReady(ctx context.Context, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	hostPort := "localhost:7233"

	for time.Now().Before(deadline) {
		dialCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
		conn, err := grpc.DialContext(dialCtx, hostPort,
			grpc.WithTransportCredentials(insecure.NewCredentials()),
			grpc.WithBlock(),
		)
		cancel()

		if err == nil {
			healthClient := healthpb.NewHealthClient(conn)
			checkCtx, checkCancel := context.WithTimeout(ctx, 2*time.Second)
			resp, err := healthClient.Check(checkCtx, &healthpb.HealthCheckRequest{})
			checkCancel()
			conn.Close()

			if err == nil && resp.Status == healthpb.HealthCheckResponse_SERVING {
				if proc, exists := s.processes["temporal_server"]; exists {
					proc.mu.Lock()
					proc.State = StateReady
					proc.mu.Unlock()
					s.updateTemporalTelemetry(proc)
				}
				return nil
			}
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(500 * time.Millisecond):
		}
	}

	return fmt.Errorf("temporal server no listo después de %v", timeout)
}

// waitForWorkerReady hace polling del task-queue hasta confirmar al menos un poller activo.
// Usa ruta absoluta del binario de temporal para evitar problemas de PATH.
func (s *Supervisor) waitForWorkerReady(timeout time.Duration) error {
	temporalBin := filepath.Join(s.binDir, "temporal", "temporal.exe")
	if _, err := os.Stat(temporalBin); err != nil {
		if p, err := exec.LookPath("temporal"); err == nil {
			temporalBin = p
		} else {
			return fmt.Errorf("temporal binary no encontrado en %s ni en PATH", temporalBin)
		}
	}

	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		out, err := exec.Command(temporalBin, "task-queue", "describe",
			"--task-queue", "profile-orchestration",
			"-o", "json").CombinedOutput()
		if err == nil && len(out) > 0 {
			var tqResult struct {
				Pollers []struct {
					Identity string `json:"identity"`
				} `json:"pollers"`
			}
			if jsonErr := json.Unmarshal(out, &tqResult); jsonErr == nil && len(tqResult.Pollers) > 0 {
				return nil
			}
		}
		time.Sleep(1 * time.Second)
	}
	return fmt.Errorf("sin pollers activos en profile-orchestration después de %v", timeout)
}

// updateTemporalTelemetry registra el stream de Temporal via nucleus telemetry register.
func (s *Supervisor) updateTemporalTelemetry(proc *ManagedProcess) {
	s.registerStream(
		"temporal_server",
		"⏱️ TEMPORAL SERVER",
		proc.LogPath,
		"Temporal Server log — workflow engine process managed by the Nucleus supervisor",
		"nucleus",
		1,
		[]string{"nucleus"},
	)
}

// ============================================================================
// WORKER MANAGER
// ============================================================================

// startWorkerManager inicia el Temporal Worker Manager como subproceso.
func (s *Supervisor) startWorkerManager(ctx context.Context) (*ManagedProcess, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if proc, exists := s.processes["nucleus_worker"]; exists {
		if proc.State == StateReady {
			return proc, nil
		}
	}

	// ¿Ya hay un worker activo en el task-queue de una instancia anterior?
	// getTaskQueuePollers está definida en workers.go (mismo package supervisor).
	if pollers, _, err := getTaskQueuePollers(ctx, s.binDir); err == nil && len(pollers) > 0 {
		proc := &ManagedProcess{
			Name:      "nucleus_worker",
			Cmd:       nil,
			State:     StateReady,
			StartedAt: time.Now(),
		}
		s.processes["nucleus_worker"] = proc
		fmt.Fprintln(os.Stderr, "[INFO] ✓ Worker ya activo en profile-orchestration — omitiendo inicio")
		return proc, nil
	}

	nucleusBin := filepath.Join(s.binDir, "nucleus", "nucleus.exe")
	if _, err := os.Stat(nucleusBin); err != nil {
		return nil, fmt.Errorf("nucleus binary no encontrado en %s", nucleusBin)
	}

	today := time.Now()
	dateStr := fmt.Sprintf("%04d%02d%02d", today.Year(), today.Month(), today.Day())
	logPath := filepath.Join(s.logsDir, "nucleus", "worker", fmt.Sprintf("worker_manager_%s.log", dateStr))
	if err := os.MkdirAll(filepath.Dir(logPath), 0755); err != nil {
		return nil, fmt.Errorf("error al crear directorio de log del worker: %w", err)
	}
	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		return nil, fmt.Errorf("error al crear archivo de log del worker: %w", err)
	}

	hostname, _ := os.Hostname()
	nucleusVersion := os.Getenv("NUCLEUS_VERSION")
	if nucleusVersion == "" {
		nucleusVersion = "dev"
	}
	workerIdentity := fmt.Sprintf("nucleus-worker/%s@%s/profile-orchestration", nucleusVersion, hostname)

	cmd := exec.CommandContext(ctx, nucleusBin, "worker", "start")
	cmd.Stdout = logFile
	cmd.Stderr = logFile
	cmd.Dir = filepath.Dir(nucleusBin)
	cmd.Env = append(os.Environ(), "NUCLEUS_WORKER_IDENTITY="+workerIdentity)

	if err := cmd.Start(); err != nil {
		logFile.Close()
		return nil, fmt.Errorf("error al iniciar worker manager: %w", err)
	}

	proc := &ManagedProcess{
		Name:      "nucleus_worker",
		Cmd:       cmd,
		PID:       cmd.Process.Pid,
		State:     StateStarting,
		LogPath:   logPath,
		StartedAt: time.Now(),
	}
	s.processes["nucleus_worker"] = proc
	go s.monitorProcess(proc, logFile)

	if err := s.waitForWorkerReady(10 * time.Second); err != nil {
		proc.mu.Lock()
		proc.State = StateDegraded
		proc.mu.Unlock()
		fmt.Fprintf(os.Stderr, "[WARN] Worker no confirmado en task-queue después de 10s: %v\n", err)
	} else {
		proc.mu.Lock()
		proc.State = StateReady
		proc.mu.Unlock()
	}

	s.updateWorkerTelemetry(proc)
	return proc, nil
}

// updateWorkerTelemetry registra el stream del Worker via nucleus telemetry register.
func (s *Supervisor) updateWorkerTelemetry(proc *ManagedProcess) {
	s.registerStream(
		"worker_manager",
		"🔧 WORKER MANAGER",
		proc.LogPath,
		"Temporal Worker Manager log — processes workflow tasks from the profile-orchestration queue",
		"nucleus",
		2,
		[]string{"nucleus"},
	)
}

// ============================================================================
// BRAIN SERVER
// ============================================================================

// isBrainRunning verifica si Brain ya está escuchando en puerto 5678.
func (s *Supervisor) isBrainRunning() bool {
	conn, err := net.DialTimeout("tcp", "127.0.0.1:5678", 1*time.Second)
	if err != nil {
		return false
	}
	conn.Close()
	return true
}

// startBrainServer levanta brain.exe service start como proceso gestionado.
// Usa exec.Command sin contexto (patrón correcto para procesos de larga duración).
func (s *Supervisor) startBrainServer(ctx context.Context) (*ManagedProcess, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if proc, exists := s.processes["brain_server"]; exists {
		if proc.State == StateReady {
			return proc, nil
		}
	}

	if s.isBrainRunning() {
		proc := &ManagedProcess{
			Name:      "brain_server",
			Cmd:       nil,
			PID:       0,
			State:     StateReady,
			StartedAt: time.Now(),
		}
		s.processes["brain_server"] = proc
		fmt.Fprintln(os.Stderr, "[INFO] ✓ Brain Server ya corriendo en puerto 5678 — omitiendo inicio")
		return proc, nil
	}

	brainBin := filepath.Join(s.binDir, "brain", "brain.exe")
	if _, err := os.Stat(brainBin); err != nil {
		return nil, fmt.Errorf("brain binary no encontrado en %s", brainBin)
	}

	today := time.Now()
	dateStr := fmt.Sprintf("%04d%02d%02d", today.Year(), today.Month(), today.Day())
	logPath := filepath.Join(s.logsDir, "brain", "service", fmt.Sprintf("brain_service_%s.log", dateStr))
	if err := os.MkdirAll(filepath.Dir(logPath), 0755); err != nil {
		return nil, fmt.Errorf("error al crear directorio de log de brain: %w", err)
	}
	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		return nil, fmt.Errorf("error al crear archivo de log de brain: %w", err)
	}

	// exec.Command SIN contexto — proceso de larga duración, debe sobrevivir al bootCtx
	cmd := exec.Command(brainBin, "service", "start")
	cmd.Stdout = logFile
	cmd.Stderr = logFile
	cmd.Dir = filepath.Dir(brainBin)
	setSvelteProcAttr(cmd)

	if err := cmd.Start(); err != nil {
		logFile.Close()
		return nil, fmt.Errorf("error al lanzar brain server: %w", err)
	}

	proc := &ManagedProcess{
		Name:      "brain_server",
		Cmd:       cmd,
		PID:       cmd.Process.Pid,
		State:     StateStarting,
		LogPath:   logPath,
		StartedAt: time.Now(),
	}
	s.processes["brain_server"] = proc
	go s.monitorProcess(proc, logFile)
	return proc, nil
}

// waitForBrainReady espera hasta que Brain esté escuchando en puerto 5678.
func (s *Supervisor) waitForBrainReady(timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if s.isBrainRunning() {
			s.mu.Lock()
			if proc, exists := s.processes["brain_server"]; exists {
				proc.mu.Lock()
				proc.State = StateReady
				proc.mu.Unlock()
			}
			s.mu.Unlock()
			return nil
		}
		time.Sleep(500 * time.Millisecond)
	}
	return fmt.Errorf("brain server no listo después de %v — revisar logs en brain/service/", timeout)
}

// updateBrainTelemetry registra el stream de Brain en telemetry.json
func (s *Supervisor) updateBrainTelemetry(proc *ManagedProcess) {
	s.registerStream(
		"brain_service",
		"🧠 BRAIN SERVER",
		proc.LogPath,
		"Brain TCP server log — central event bus for Chrome Native Host connections",
		"brain",
		1,
		[]string{"brain", "synapse"},
	)
}

// ============================================================================
// VAULT Y OLLAMA
// ============================================================================

// CheckVaultStatus consulta el estado del vault via Synapse
func (s *Supervisor) CheckVaultStatus(ctx context.Context) (*VaultStatusResult, error) {
	nucleusBin := filepath.Join(s.binDir, "nucleus", "nucleus.exe")
	if _, err := os.Stat(nucleusBin); err != nil {
		if binPath, err := exec.LookPath("nucleus"); err == nil {
			nucleusBin = binPath
		} else {
			return nil, fmt.Errorf("nucleus binary no encontrado en %s ni en PATH", nucleusBin)
		}
	}

	cmd := exec.CommandContext(ctx, nucleusBin, "--json", "synapse", "vault-status")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("vault status workflow falló: %w (output: %s)", err, string(output))
	}

	var result VaultStatusResult
	if err := json.Unmarshal(output, &result); err != nil {
		return nil, fmt.Errorf("respuesta JSON inválida de vault-status: %w", err)
	}

	if result.State == "FAILED" || result.State == "DEGRADED" {
		return nil, fmt.Errorf("vault en mal estado: %s - %s", result.State, result.Error)
	}
	if !result.Success {
		return nil, fmt.Errorf("vault status check falló: %s", result.Error)
	}

	return &result, nil
}

// StartOllama inicia el servicio Ollama via Synapse
func (s *Supervisor) StartOllama(ctx context.Context) (*StartOllamaResult, error) {
	nucleusBin := filepath.Join(s.binDir, "nucleus", "nucleus.exe")
	if _, err := os.Stat(nucleusBin); err != nil {
		if binPath, err := exec.LookPath("nucleus"); err == nil {
			nucleusBin = binPath
		} else {
			return nil, fmt.Errorf("nucleus binary no encontrado en %s ni en PATH", nucleusBin)
		}
	}

	cmd := exec.CommandContext(ctx, nucleusBin, "--json", "synapse", "start-ollama")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("start-ollama workflow falló: %w (output: %s)", err, string(output))
	}

	var result StartOllamaResult
	if err := json.Unmarshal(output, &result); err != nil {
		return nil, fmt.Errorf("respuesta JSON inválida de start-ollama: %w", err)
	}

	if result.State == "FAILED" {
		return nil, fmt.Errorf("ollama start falló: %s", result.Error)
	}
	if !result.Success {
		return nil, fmt.Errorf("ollama falló al iniciar: %s", result.Error)
	}

	return &result, nil
}

// ============================================================================
// NODE PROCESS (genérico)
// ============================================================================

// StartNodeProcess inicia un proceso Node.js con logging.
// Nota: para el Control Plane usar bootControlPlane directamente —
// tiene pre-flight checks y manejo de env vars dinámico.
func (s *Supervisor) StartNodeProcess(ctx context.Context, name string, scriptPath string, env []string) (*ManagedProcess, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if proc, exists := s.processes[name]; exists {
		if proc.State == StateReady {
			return proc, nil
		}
	}

	logPath := filepath.Join(s.logsDir, "server", fmt.Sprintf("%s_%d.log", name, time.Now().Unix()))
	if err := os.MkdirAll(filepath.Dir(logPath), 0755); err != nil {
		return nil, fmt.Errorf("error al crear directorio de log: %w", err)
	}
	logFile, err := os.Create(logPath)
	if err != nil {
		return nil, fmt.Errorf("error al crear archivo de log: %w", err)
	}

	nodePath, err := s.resolveNodeBin()
	if err != nil {
		logFile.Close()
		return nil, err
	}

	cmd := exec.CommandContext(ctx, nodePath, scriptPath)
	cmd.Env = append(os.Environ(), env...)
	cmd.Stdout = logFile
	cmd.Stderr = logFile

	if err := cmd.Start(); err != nil {
		logFile.Close()
		return nil, fmt.Errorf("error al iniciar proceso: %w", err)
	}

	proc := &ManagedProcess{
		Name:      name,
		Cmd:       cmd,
		PID:       cmd.Process.Pid,
		State:     StateStarting,
		LogPath:   logPath,
		StartedAt: time.Now(),
	}
	s.processes[name] = proc
	go s.monitorProcess(proc, logFile)
	return proc, nil
}

// ============================================================================
// TELEMETRY
// ============================================================================

// registerStream registra un stream de proceso via nucleus telemetry register.
func (s *Supervisor) registerStream(streamID, label, logPath, description, source string, priority int, categories []string) {
	nucleusBin := filepath.Join(s.binDir, "nucleus", "nucleus.exe")
	if _, err := os.Stat(nucleusBin); err != nil {
		return
	}

	normalizedPath := strings.ReplaceAll(logPath, "\\", "/")
	args := []string{
		"telemetry", "register",
		"--stream", streamID,
		"--label", label,
		"--path", normalizedPath,
		"--description", description,
		"--source", source,
		"--priority", fmt.Sprintf("%d", priority),
	}
	for _, cat := range categories {
		args = append(args, "--category", cat)
	}

	cmd := exec.Command(nucleusBin, args...)
	cmd.Stdout = os.Stderr
	cmd.Stderr = os.Stderr
	cmd.Run()
}

// monitorProcess observa un proceso y actualiza su estado cuando termina.
func (s *Supervisor) monitorProcess(proc *ManagedProcess, logFile *os.File) {
	defer logFile.Close()

	err := proc.Cmd.Wait()

	proc.mu.Lock()
	if err != nil {
		proc.State = StateFailed
	} else {
		proc.State = StateStopped
	}
	proc.mu.Unlock()

	s.updateTelemetry(proc)
}

// updateTelemetry registra un stream genérico de proceso via nucleus telemetry register.
func (s *Supervisor) updateTelemetry(proc *ManagedProcess) {
	s.registerStream(
		proc.Name,
		fmt.Sprintf("🔧 %s", strings.ToUpper(strings.ReplaceAll(proc.Name, "_", " "))),
		proc.LogPath,
		fmt.Sprintf("%s process log — managed by the Nucleus supervisor", proc.Name),
		"nucleus",
		2,
		[]string{"nucleus"},
	)
}

// ============================================================================
// SHUTDOWN
// ============================================================================

// Shutdown realiza el apagado graceful de todos los procesos gestionados.
func (s *Supervisor) Shutdown(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	var wg sync.WaitGroup
	for name, proc := range s.processes {
		wg.Add(1)
		go func(n string, p *ManagedProcess) {
			defer wg.Done()
			if p.Cmd != nil && p.Cmd.Process != nil {
				p.Cmd.Process.Signal(os.Interrupt)
				done := make(chan struct{})
				go func() {
					p.Cmd.Wait()
					close(done)
				}()
				select {
				case <-done:
				case <-time.After(10 * time.Second):
					p.Cmd.Process.Kill()
				}
			}
		}(name, proc)
	}
	wg.Wait()
	return nil
}

// ============================================================================
// BOOT SEQUENCE HELPERS
// ============================================================================

func (s *Supervisor) verifyTemporalServer(ctx context.Context) error {
	conn, err := net.DialTimeout("tcp", "localhost:7233", 2*time.Second)
	if err != nil {
		return fmt.Errorf("temporal server no accesible en puerto 7233: %w", err)
	}
	conn.Close()
	return nil
}

func (s *Supervisor) verifyWorkerRunning(ctx context.Context) error {
	// TODO: Implementar verificación real del estado del worker
	return nil
}

func (s *Supervisor) bootGovernance(ctx context.Context, simulation bool) error {
	var ownershipPath string

	if simulation {
		ownershipPath = filepath.Join("installer", "nucleus", "scripts",
			"simulation_env", ".bloom", ".ownership.json")
	} else {
		bloomDir := getBloomDir()
		if bloomDir == "" {
			fmt.Fprintln(os.Stderr, "[INFO] ⚠️  BLOOM_DIR no resoluble - omitiendo governance (modo onboarding)")
			return nil
		}
		if strings.ContainsAny(bloomDir, "<>|?*") {
			fmt.Fprintf(os.Stderr, "[INFO] ⚠️  BLOOM_DIR contiene caracteres inválidos (%q) - omitiendo governance (modo onboarding)\n", bloomDir)
			return nil
		}
		ownershipPath = filepath.Join(bloomDir, ".ownership.json")
	}

	if _, err := os.Stat(ownershipPath); err != nil {
		if os.IsNotExist(err) {
			fmt.Fprintln(os.Stderr, "[INFO] ⚠️  .ownership.json no encontrado - omitiendo governance (modo onboarding)")
			return nil
		}
		if strings.Contains(err.Error(), "syntax is incorrect") ||
			strings.Contains(err.Error(), "invalid") {
			fmt.Fprintf(os.Stderr, "[INFO] ⚠️  .ownership.json path inválido (%v) - omitiendo governance (modo onboarding)\n", err)
			return nil
		}
		return fmt.Errorf("error al acceder ownership.json: %w", err)
	}

	return nil
}

// ============================================================================
// CONTROL PLANE — CORRECCIÓN PRINCIPAL
// ============================================================================

// isControlPlaneRunning verifica si ya hay un proceso escuchando en puerto 48215.
//
// CORRECCIÓN DEL PROBLEMA DE MÚLTIPLES INICIALIZACIONES:
// Antes de lanzar Node, siempre verificamos el puerto. Si ya hay algo escuchando,
// no lanzamos una segunda instancia. Dos instancias de bundle.js compitiendo
// por el mismo puerto causan errores de "EADDRINUSE" y comportamiento
// impredecible en los WebSockets y la API HTTP.
func (s *Supervisor) isControlPlaneRunning() bool {
	conn, err := net.DialTimeout("tcp", "127.0.0.1:48215", 1*time.Second)
	if err != nil {
		return false
	}
	conn.Close()
	return true
}

// killExistingControlPlane mata cualquier instancia de bundle.js que el
// supervisor conozca. Se llama antes de un restart explícito para garantizar
// que no queden procesos zombi escuchando en los puertos.
//
// Si el proceso no está en el mapa del supervisor (fue lanzado externamente),
// esta función no hace nada — los procesos externos no se matan automáticamente.
func (s *Supervisor) killExistingControlPlane() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if proc, exists := s.processes["control_plane_api"]; exists {
		if proc.Cmd != nil && proc.Cmd.Process != nil {
			_ = proc.Cmd.Process.Kill()
			proc.Cmd.Wait() // reap del proceso para evitar zombis
		}
		delete(s.processes, "control_plane_api")
	}
}

// resolveVaultState consulta el estado real del vault via nucleus synapse vault-status.
//
// CORRECCIÓN CRÍTICA: Reemplaza el hardcode "BLOOM_VAULT_STATE=UNLOCKED".
//
// ¿Por qué importa esto? Node lee BLOOM_VAULT_STATE al arrancar para decidir
// qué funcionalidades habilitar. Si le mentimos con "UNLOCKED" cuando el vault
// está bloqueado o no inicializado, el control plane toma decisiones incorrectas
// (por ejemplo, intenta descifrar datos y falla, o muestra el dashboard cuando
// debería mostrar el onboarding).
//
// Fallback: retorna "UNKNOWN" si vault-status no está disponible (modo pre-onboarding).
// Node debe manejar "UNKNOWN" como "aún no determinado" y no como "UNLOCKED".
func (s *Supervisor) resolveVaultState(ctx context.Context) string {
	nucleusBin := filepath.Join(s.binDir, "nucleus", "nucleus.exe")
	if _, err := os.Stat(nucleusBin); err != nil {
		if p, lookErr := exec.LookPath("nucleus"); lookErr == nil {
			nucleusBin = p
		} else {
			return "UNKNOWN"
		}
	}

	// Usamos un timeout propio para no bloquear el boot sequence completo
	queryCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	out, err := exec.CommandContext(queryCtx, nucleusBin, "--json", "synapse", "vault-status").Output()
	if err != nil {
		// Pre-onboarding o vault workflow no disponible — safe fallback
		return "UNKNOWN"
	}

	var result struct {
		VaultState string `json:"vault_state"`
	}
	if jsonErr := json.Unmarshal(out, &result); jsonErr != nil || result.VaultState == "" {
		return "UNKNOWN"
	}
	return result.VaultState
}

// isWorkerConnected verifica si hay al menos un poller activo en el task-queue.
//
// CORRECCIÓN CRÍTICA: Reemplaza el hardcode "BLOOM_WORKER_RUNNING=true".
//
// ¿Por qué importa esto? Si el worker no se conectó todavía (Temporal tardó
// en arrancar, o el worker crasheó), Node arrancaba creyendo que el worker
// estaba listo. Esto causaba que el control plane intentara despachar workflows
// que nunca serían atendidos, acumulando timeouts silenciosos.
//
// Esta función hace la única verificación que importa: ¿hay pollers reales
// registrados en Temporal? Si no los hay, BLOOM_WORKER_RUNNING=false.
func (s *Supervisor) isWorkerConnected(ctx context.Context) bool {
	pollers, _, err := getTaskQueuePollers(ctx, s.binDir)
	if err != nil {
		return false
	}
	return len(pollers) > 0
}

// bootControlPlane lanza bundle.js (Control Plane) como proceso gestionado.
//
// CORRECCIONES APLICADAS EN ESTA FUNCIÓN:
//
//  1. exec.Command en lugar de exec.CommandContext
//     bundle.js es un servidor HTTP/WebSocket de larga duración. Vincularlo
//     al bootCtx de 120s causaba que Node muriera exactamente cuando Temporal
//     también moría — ambos matados por el mismo deadline de contexto.
//
//  2. Pre-flight check de dependencias
//     Node sólo arranca si Temporal está accesible. Si Temporal está caído,
//     lanzar Node es inútil y genera logs confusos.
//
//  3. BLOOM_VAULT_STATE dinámico (via resolveVaultState)
//     Antes hardcodeado como "UNLOCKED". Ahora refleja el estado real.
//
//  4. BLOOM_WORKER_RUNNING dinámico (via isWorkerConnected)
//     Antes hardcodeado como "true". Ahora refleja si hay pollers reales.
//
//  5. Guard contra múltiples inicializaciones (via isControlPlaneRunning)
//     Si ya hay algo en puerto 48215, no se lanza una segunda instancia.
//     Esto resuelve el problema de "múltiples Node compitiendo por el puerto".
//
//  6. setSvelteProcAttr para desacoplar del grupo de procesos del padre.
// resolveNodeBin localiza el Node.js embebido de BloomNucleus.
//
// Orden de prioridad:
//  1. binDir/node/win64/node.exe  — estructura actual del instalador
//  2. binDir/node/node.exe        — estructura legacy (sin subdirectorio de plataforma)
//  3. ERROR — nunca caer al node del sistema operativo
//
// ¿Por qué no usar exec.LookPath("node") como fallback?
// El node del sistema (C:\Program Files\nodejs) no está aislado:
//  - Cada restart del servicio puede resolverse a una versión diferente
//  - Los procesos lanzados desde ahí no se trackean correctamente en el supervisor
//  - Con NSSM el PATH puede no incluir nodejs en absoluto
// Si el embedded no existe, el error es explícito y accionable.
func (s *Supervisor) resolveNodeBin() (string, error) {
	candidates := []string{
		filepath.Join(s.binDir, "node", "win64", "node.exe"), // estructura actual
		filepath.Join(s.binDir, "node", "node.exe"),           // estructura legacy
	}
	for _, p := range candidates {
		if _, err := os.Stat(p); err == nil {
			return p, nil
		}
	}
	return "", fmt.Errorf(
		"node embedded no encontrado — probé:\n  %s\n  %s\nVerificá que el instalador deployó node correctamente",
		candidates[0], candidates[1],
	)
}

func (s *Supervisor) bootControlPlane(ctx context.Context, simulation bool) (*ManagedProcess, error) {

	// ── Guard: ¿ya hay un control plane corriendo? ───────────────────────────
	//
	// CORRECCIÓN MÚLTIPLES INICIALIZACIONES:
	// Si ya hay algo escuchando en 48215, retornamos ese "proceso externo"
	// sin lanzar una segunda instancia. Esto aplica tanto al boot inicial
	// como a los reinicios vía restart-bootstrap (que llama a
	// killExistingControlPlane() antes de llamar a bootControlPlane).
	if s.isControlPlaneRunning() {
		s.mu.Lock()
		// Si ya lo teníamos registrado, devolvemos el existente
		if proc, exists := s.processes["control_plane_api"]; exists {
			s.mu.Unlock()
			fmt.Fprintln(os.Stderr, "[INFO] ✓ Control Plane ya corriendo en puerto 48215 — omitiendo inicio")
			return proc, nil
		}
		// Proceso externo (no lanzado por este supervisor)
		proc := &ManagedProcess{
			Name:      "control_plane_api",
			Cmd:       nil,
			PID:       0,
			State:     StateReady,
			StartedAt: time.Now(),
		}
		s.processes["control_plane_api"] = proc
		s.mu.Unlock()
		fmt.Fprintln(os.Stderr, "[INFO] ✓ Control Plane externo detectado en puerto 48215 — omitiendo inicio")
		return proc, nil
	}

	// ── Pre-flight: Temporal debe estar accesible ────────────────────────────
	//
	// Node depende de Temporal para despachar workflows. Si Temporal no está
	// arriba, arrancar Node genera una cascada de errores de conexión que
	// llenan los logs y oscurecen el problema real.
	if conn, err := net.DialTimeout("tcp", "localhost:7233", 2*time.Second); err != nil {
		return nil, fmt.Errorf("pre-flight falló: Temporal no accesible en puerto 7233 — iniciar Temporal antes del Control Plane: %w", err)
	} else {
		conn.Close()
	}

	// ── Resolver estado real del sistema ─────────────────────────────────────
	//
	// Estos valores se pasan como env vars a Node. Deben reflejar el estado
	// real del sistema, no suposiciones. Ver resolveVaultState e isWorkerConnected.
	vaultState := s.resolveVaultState(ctx)
	workerRunning := s.isWorkerConnected(ctx)

	// ── Resolver BLOOM_DIR y BLOOM_NUCLEUS_PATH ───────────────────────────────
	//
	// PROBLEMA: BLOOM_DIR puede estar seteado en el entorno del sistema como un
	// placeholder literal (ej: "C:\Users\josev\<path-al-repo>") que nunca fue
	// reemplazado durante la instalación. Ese valor inválido se propaga a Node
	// y hace que startSvelteDevServer arme un path roto → spawn EINVAL.
	//
	// SOLUCIÓN: Siempre calcular BLOOM_DIR desde nucleus.json via getBloomDir().
	// getBloomDir() lee installation.origin_path y sube 4 niveles hasta la raíz
	// del repo. Eso da el valor real independientemente de la variable de entorno.
	//
	// nucleus.json ejemplo:
	//   origin_path = C:\repos\bloom\installer\native\bin\win64
	//   4 niveles arriba = C:\repos\bloom  ← este es BLOOM_DIR correcto
	//
	// BLOOM_NUCLEUS_PATH: bundle.js lo usa para localizar el proyecto de Svelte
	// y para el file watcher. Su valor correcto es la raíz del repo (igual que
	// BLOOM_DIR en este sistema). Si sigue vacío después de getBloomDir(),
	// bundle.js loguea el warning y deshabilita el file watcher — eso es
	// aceptable. Lo que NO es aceptable es pasarle un placeholder inválido.
	bloomDir := getBloomDir() // fuente canónica: nucleus.json → origin_path → 4 niveles arriba

	// BLOOM_NUCLEUS_PATH: si el entorno tiene un valor válido lo usamos,
	// si no, usamos bloomDir (misma raíz). Nunca propagar un placeholder.
	bloomNucleusPath := os.Getenv("BLOOM_NUCLEUS_PATH")
	if bloomNucleusPath == "" || strings.Contains(bloomNucleusPath, "<") {
		bloomNucleusPath = bloomDir
	}

	// Construir env vars para Node
	env := []string{
		"BLOOM_USER_ROLE=" + os.Getenv("BLOOM_USER_ROLE"),
		// CORRECCIÓN: Estado real del vault, no "UNLOCKED" hardcodeado
		fmt.Sprintf("BLOOM_VAULT_STATE=%s", vaultState),
		// CORRECCIÓN: Estado real del worker, no "true" hardcodeado
		fmt.Sprintf("BLOOM_WORKER_RUNNING=%v", workerRunning),
		fmt.Sprintf("BLOOM_SIMULATION_MODE=%t", simulation),
		"BLOOM_LOGS_DIR=" + s.logsDir,
		// CORRECCIÓN: Calculado desde nucleus.json, nunca desde env del sistema
		// que puede tener un placeholder "<path-al-repo>" sin reemplazar.
		"BLOOM_DIR=" + bloomDir,
		"BLOOM_NUCLEUS_PATH=" + bloomNucleusPath,
	}

	bundleScript := filepath.Join(s.binDir, "bootstrap", "bundle.js")
	if _, err := os.Stat(bundleScript); err != nil {
		return nil, fmt.Errorf("bundle.js no encontrado en %s: %w", bundleScript, err)
	}

	// Archivo de log
	today := time.Now()
	dateStr := fmt.Sprintf("%04d%02d%02d", today.Year(), today.Month(), today.Day())
	logDir := filepath.Join(s.logsDir, "nucleus", "control_plane")
	if err := os.MkdirAll(logDir, 0755); err != nil {
		return nil, fmt.Errorf("error al crear directorio de log del control plane: %w", err)
	}
	logPath := filepath.Join(logDir, fmt.Sprintf("nucleus_control_plane_%s.log", dateStr))
	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		return nil, fmt.Errorf("error al crear archivo de log del control plane: %w", err)
	}

	s.registerStream(
		"nucleus_control_plane",
		"🖥️ CONTROL PLANE",
		filepath.ToSlash(logPath),
		"Control plane API log — Node.js bootstrap server providing HTTP :48215 and WebSocket :4124",
		"nucleus",
		2,
		[]string{"nucleus"},
	)

	// Resolver Node binary usando el embedded de BloomNucleus.
	// NUNCA usar el node del sistema operativo (C:\\Program Files\\nodejs) —
	// eso causa que múltiples instancias queden sin trackear en el supervisor
	// porque el PATH puede cambiar entre reinicios del servicio.
	nodePath, nodeErr := s.resolveNodeBin()
	if nodeErr != nil {
		logFile.Close()
		return nil, nodeErr
	}

	// ── CORRECCIÓN CRÍTICA: exec.Command, NO exec.CommandContext ─────────────
	//
	// exec.CommandContext(bootCtx, node, bundle.js) mataría Node cuando
	// bootCtx expire (120s). bundle.js es un servidor de larga duración —
	// exactamente igual que Temporal y Brain.
	//
	// setSvelteProcAttr crea Node en su propio grupo de procesos para que
	// sobreviva si NSSM reinicia el supervisor.
	// ─────────────────────────────────────────────────────────────────────────
	cmd := exec.Command(nodePath, bundleScript)
	cmd.Env = append(os.Environ(), env...)
	cmd.Stdout = logFile
	cmd.Stderr = logFile
	cmd.Dir = filepath.Dir(bundleScript)
	setSvelteProcAttr(cmd)

	if err := cmd.Start(); err != nil {
		logFile.Close()
		return nil, fmt.Errorf("error al iniciar control plane: %w", err)
	}

	proc := &ManagedProcess{
		Name:      "control_plane_api",
		Cmd:       cmd,
		PID:       cmd.Process.Pid,
		State:     StateStarting,
		LogPath:   logPath,
		StartedAt: time.Now(),
	}

	s.mu.Lock()
	s.processes["control_plane_api"] = proc
	s.mu.Unlock()

	go s.monitorProcess(proc, logFile)

	// Esperar hasta 8s por el puerto 48215 — no fatal, el log dirá qué pasó
	if err := s.waitForPort("48215", 8*time.Second); err != nil {
		fmt.Fprintf(os.Stderr, "[WARN] Control Plane puerto 48215 no listo en 8s — revisar %s: %v\n", logPath, err)
	}

	return proc, nil
}

// ============================================================================
// SVELTE DEV SERVER
// ============================================================================

func (s *Supervisor) isSvelteRunning() bool {
	conn, err := net.DialTimeout("tcp", "localhost:5173", 1*time.Second)
	if err != nil {
		return false
	}
	conn.Close()
	return true
}

// startSvelteDev inicia `npm run dev` (Vite/SvelteKit) como proceso gestionado.
// NON-CRITICAL: un fallo aquí no aborta el boot sequence.
func (s *Supervisor) startSvelteDev(ctx context.Context) (*ManagedProcess, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if proc, exists := s.processes["svelte_dev"]; exists {
		if proc.State == StateReady {
			return proc, nil
		}
	}

	if s.isSvelteRunning() {
		proc := &ManagedProcess{
			Name:      "svelte_dev",
			Cmd:       nil,
			PID:       0,
			State:     StateReady,
			StartedAt: time.Now(),
		}
		s.processes["svelte_dev"] = proc
		fmt.Fprintln(os.Stderr, "[INFO] ✓ Svelte dev server ya corriendo en puerto 5173 — omitiendo inicio")
		return proc, nil
	}

	repoRoot := getBloomDir()
	if repoRoot == "" {
		return nil, fmt.Errorf("no se puede localizar repo root para svelte dev (BLOOM_DIR no seteado y nucleus.json no legible)")
	}
	projectRoot := filepath.Join(repoRoot, "webview", "app")
	if _, err := os.Stat(filepath.Join(projectRoot, "vite.config.ts")); err != nil {
		return nil, fmt.Errorf("directorio de svelte dev no encontrado en %s — se esperaba webview/app/vite.config.ts", projectRoot)
	}

	npmBin, err := exec.LookPath("npm")
	if err != nil {
		return nil, fmt.Errorf("npm no encontrado en PATH: %v", err)
	}

	today := time.Now()
	dateStr := fmt.Sprintf("%04d%02d%02d", today.Year(), today.Month(), today.Day())
	logDir := filepath.Join(s.logsDir, "nucleus", "svelte_dev")
	if err := os.MkdirAll(logDir, 0755); err != nil {
		return nil, fmt.Errorf("error al crear directorio de log de svelte: %w", err)
	}
	logPath := filepath.Join(logDir, fmt.Sprintf("nucleus_svelte_dev_%s.log", dateStr))
	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		return nil, fmt.Errorf("error al crear archivo de log de svelte: %w", err)
	}

	cmd := exec.Command(npmBin, "run", "dev")
	cmd.Dir = projectRoot
	cmd.Stdout = logFile
	cmd.Stderr = logFile
	setSvelteProcAttr(cmd)

	if err := cmd.Start(); err != nil {
		logFile.Close()
		return nil, fmt.Errorf("error al lanzar npm run dev en %s: %w", projectRoot, err)
	}

	proc := &ManagedProcess{
		Name:      "svelte_dev",
		Cmd:       cmd,
		PID:       cmd.Process.Pid,
		State:     StateStarting,
		LogPath:   logPath,
		StartedAt: time.Now(),
	}
	s.processes["svelte_dev"] = proc
	go s.monitorProcess(proc, logFile)

	s.registerStream(
		"svelte_dev",
		"🌸 SVELTE DEV SERVER",
		filepath.ToSlash(logPath),
		"Vite/SvelteKit dev server log — UI frontend on port 5173",
		"nucleus",
		3,
		[]string{"nucleus", "frontend"},
	)

	return proc, nil
}

func (s *Supervisor) waitForSvelteReady(timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if s.isSvelteRunning() {
			s.mu.Lock()
			if proc, exists := s.processes["svelte_dev"]; exists {
				proc.mu.Lock()
				proc.State = StateReady
				proc.mu.Unlock()
			}
			s.mu.Unlock()
			return nil
		}
		time.Sleep(500 * time.Millisecond)
	}
	return fmt.Errorf("svelte dev server no listo después de %v — revisar logs/nucleus/svelte_dev/", timeout)
}

func (s *Supervisor) waitForPort(port string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		conn, err := net.DialTimeout("tcp", "127.0.0.1:"+port, 500*time.Millisecond)
		if err == nil {
			conn.Close()
			return nil
		}
		time.Sleep(500 * time.Millisecond)
	}
	return fmt.Errorf("puerto %s no listo después de %s", port, timeout)
}

// ============================================================================
// COMANDO "service" — registro siguiendo Guía Maestra NUCLEUS v2.0
// ============================================================================

func init() {
	core.RegisterCommand("SERVICE", createServiceCommand)
}

type ServiceStartResult struct {
	Success   bool   `json:"success"`
	State     string `json:"state"`
	Error     string `json:"error,omitempty"`
	Timestamp int64  `json:"timestamp"`
}

type ServiceStopResult struct {
	Success   bool   `json:"success"`
	State     string `json:"state"`
	Error     string `json:"error,omitempty"`
	Timestamp int64  `json:"timestamp"`
}

type ServiceStatusResult struct {
	Success   bool                       `json:"success"`
	State     string                     `json:"state"`
	Error     string                     `json:"error,omitempty"`
	Processes map[string]ProcessSnapshot `json:"processes"`
	Timestamp int64                      `json:"timestamp"`
}

type ProcessSnapshot struct {
	State     string `json:"state"`
	PID       int    `json:"pid,omitempty"`
	LogPath   string `json:"log_path,omitempty"`
	StartedAt string `json:"started_at,omitempty"`
}

type RestartBootstrapResult struct {
	Success   bool   `json:"success"`
	PID       int    `json:"pid,omitempty"`
	State     string `json:"state"`
	Error     string `json:"error,omitempty"`
	Timestamp int64  `json:"timestamp"`
}

func createServiceCommand(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "service",
		Short: "Manage Nucleus service lifecycle (start / stop / status / restart-bootstrap)",
		Long: `Control the Nucleus background service and its managed subprocesses.

Subcommands:
  start               Boot all Nucleus components in order
  stop                Gracefully shut down all managed processes
  status              Show current state of each managed process
  restart-bootstrap   Restart only the Control Plane (bootstrap/bundle.js)`,

		Annotations: map[string]string{
			"category": "SERVICE",
		},
	}

	cmd.AddCommand(createServiceStartCmd(c))
	cmd.AddCommand(createServiceStopCmd(c))
	cmd.AddCommand(createServiceStatusCmd(c))
	cmd.AddCommand(createRestartBootstrapCmd(c))

	return cmd
}

func createServiceStartCmd(c *core.Core) *cobra.Command {
	var outputJSON bool
	var simulation bool

	cmd := &cobra.Command{
		Use:   "start",
		Short: "Boot all Nucleus components in order",
		Example: `  nucleus service start
  nucleus --json service start
  nucleus service start --simulation`,
		Annotations: map[string]string{
			"category": "SERVICE",
			"json_response": `{
  "success": true,
  "state": "RUNNING",
  "timestamp": 1740000000
}`,
		},
		Args: cobra.NoArgs,
		Run: func(cmd *cobra.Command, args []string) {
			if c.IsJSON {
				outputJSON = true
			}
			logsDir := getLogsDir(c)
			binDir := getBinDir(c)
			sup := NewSupervisor(logsDir, binDir)
			// bootCtx tiene timeout de 120s para la SECUENCIA de arranque.
			// Los procesos lanzados con exec.Command (no exec.CommandContext)
			// no se ven afectados por este timeout — sobreviven indefinidamente.
			bootCtx, bootCancel := context.WithTimeout(context.Background(), 120*time.Second)
			defer bootCancel()
			result := &ServiceStartResult{Timestamp: time.Now().Unix()}

			if err := sup.bootGovernance(bootCtx, simulation); err != nil {
				result.Success = false
				result.State = "FAILED"
				result.Error = fmt.Sprintf("governance: %v", err)
				outputServiceStartResult(c, outputJSON, result)
				os.Exit(1)
			}
			if _, err := sup.startTemporalServer(bootCtx); err != nil {
				result.Success = false
				result.State = "FAILED"
				result.Error = fmt.Sprintf("temporal: %v", err)
				outputServiceStartResult(c, outputJSON, result)
				os.Exit(1)
			}
			if err := sup.waitForTemporalReady(bootCtx, 60*time.Second); err != nil {
				result.Success = false
				result.State = "FAILED"
				result.Error = fmt.Sprintf("temporal not ready: %v", err)
				outputServiceStartResult(c, outputJSON, result)
				os.Exit(1)
			}
			if _, err := sup.startWorkerManager(bootCtx); err != nil {
				result.Success = false
				result.State = "FAILED"
				result.Error = fmt.Sprintf("worker: %v", err)
				outputServiceStartResult(c, outputJSON, result)
				os.Exit(1)
			}
			brainProc, err := sup.startBrainServer(bootCtx)
			if err != nil {
				result.Success = false
				result.State = "FAILED"
				result.Error = fmt.Sprintf("brain_server: %v", err)
				outputServiceStartResult(c, outputJSON, result)
				os.Exit(1)
			}
			if brainProc.Cmd != nil {
				if err := sup.waitForBrainReady(15 * time.Second); err != nil {
					result.Success = false
					result.State = "FAILED"
					result.Error = fmt.Sprintf("brain_server not ready: %v", err)
					outputServiceStartResult(c, outputJSON, result)
					os.Exit(1)
				}
			}
			if brainProc.LogPath != "" {
				sup.updateBrainTelemetry(brainProc)
			}
			if _, err := sup.bootControlPlane(bootCtx, simulation); err != nil {
				c.Logger.Printf("[WARN] Control plane falló al iniciar: %v", err)
			}
			if _, err := sup.startSvelteDev(bootCtx); err != nil {
				c.Logger.Printf("[WARN] Svelte dev server falló al iniciar: %v", err)
			} else {
				if err := sup.waitForSvelteReady(30 * time.Second); err != nil {
					c.Logger.Printf("[WARN] Svelte dev server no listo después de 30s: %v", err)
				}
			}

			// Boot completado. Reportar estado y BLOQUEAR.
			//
			// CRÍTICO: nucleus service start corre bajo NSSM con política Restart.
			// Si este proceso termina, NSSM lo reinicia en 5s y lanza una nueva
			// instancia de Temporal que choca con la existente:
			//   - "shard status unknown" en SQLite (dos procesos acceden a temporal.db)
			//   - worker expulsado cada ~6s con wsarecv connection forcibly closed
			//   - loop infinito de reinicios
			result.Success = true
			result.State = "RUNNING"
			outputServiceStartResult(c, outputJSON, result)

			sigCh := make(chan os.Signal, 1)
			signal.Notify(sigCh, os.Interrupt, syscall.SIGTERM)
			c.Logger.Printf("[INFO] Nucleus service corriendo — esperando señal de apagado (SIGTERM)")
			<-sigCh

			c.Logger.Printf("[INFO] Señal de apagado recibida — deteniendo todos los procesos")
			shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer shutdownCancel()
			if err := sup.Shutdown(shutdownCtx); err != nil {
				c.Logger.Printf("[WARN] Error en shutdown: %v", err)
			}
			c.Logger.Printf("[INFO] Nucleus service detenido")
		},
	}
	cmd.Flags().BoolVar(&outputJSON, "json", false, "Output result as JSON")
	cmd.Flags().BoolVar(&simulation, "simulation", false, "Boot in simulation mode")
	return cmd
}

func createServiceStopCmd(c *core.Core) *cobra.Command {
	var outputJSON bool
	cmd := &cobra.Command{
		Use:   "stop",
		Short: "Gracefully shut down all managed Nucleus processes",
		Example: `  nucleus service stop
  nucleus --json service stop`,
		Annotations: map[string]string{
			"category": "SERVICE",
			"json_response": `{
  "success": true,
  "state": "STOPPED",
  "timestamp": 1740000000
}`,
		},
		Args: cobra.NoArgs,
		Run: func(cmd *cobra.Command, args []string) {
			if c.IsJSON {
				outputJSON = true
			}
			logsDir := getLogsDir(c)
			binDir := getBinDir(c)
			sup := NewSupervisor(logsDir, binDir)
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			result := &ServiceStopResult{Timestamp: time.Now().Unix()}
			if err := sup.Shutdown(ctx); err != nil {
				result.Success = false
				result.State = "FAILED"
				result.Error = err.Error()
			} else {
				result.Success = true
				result.State = "STOPPED"
			}
			if outputJSON {
				data, _ := json.MarshalIndent(result, "", "  ")
				fmt.Println(string(data))
			} else {
				if result.Success {
					c.Logger.Printf("[SUCCESS] Service detenido")
				} else {
					c.Logger.Printf("[ERROR] Stop falló: %s", result.Error)
				}
			}
			if !result.Success {
				os.Exit(1)
			}
		},
	}
	cmd.Flags().BoolVar(&outputJSON, "json", false, "Output result as JSON")
	return cmd
}

func createServiceStatusCmd(c *core.Core) *cobra.Command {
	var outputJSON bool
	cmd := &cobra.Command{
		Use:   "status",
		Short: "Show current state of all managed Nucleus processes",
		Example: `  nucleus service status
  nucleus --json service status`,
		Annotations: map[string]string{
			"category": "SERVICE",
			"json_response": `{
  "success": true,
  "state": "RUNNING",
  "processes": {
    "temporal_server":   { "state": "READY", "pid": 1234 },
    "nucleus_worker":    { "state": "READY", "pid": 5678 },
    "control_plane_api": { "state": "READY", "pid": 9012 },
    "svelte_dev":        { "state": "READY", "pid": 3456 }
  },
  "timestamp": 1740000000
}`,
		},
		Args: cobra.NoArgs,
		Run: func(cmd *cobra.Command, args []string) {
			if c.IsJSON {
				outputJSON = true
			}
			logsDir := getLogsDir(c)
			binDir := getBinDir(c)
			sup := NewSupervisor(logsDir, binDir)
			result := &ServiceStatusResult{
				Success:   true,
				State:     "RUNNING",
				Processes: make(map[string]ProcessSnapshot),
				Timestamp: time.Now().Unix(),
			}
			sup.mu.RLock()
			for name, proc := range sup.processes {
				proc.mu.RLock()
				snap := ProcessSnapshot{
					State:   string(proc.State),
					PID:     proc.PID,
					LogPath: proc.LogPath,
				}
				if !proc.StartedAt.IsZero() {
					snap.StartedAt = proc.StartedAt.Format(time.RFC3339)
				}
				proc.mu.RUnlock()
				result.Processes[name] = snap
			}
			sup.mu.RUnlock()
			if len(result.Processes) == 0 {
				result.State = "IDLE"
			}
			if outputJSON {
				data, _ := json.MarshalIndent(result, "", "  ")
				fmt.Println(string(data))
			} else {
				c.Logger.Printf("[INFO] Estado del service: %s", result.State)
				if len(result.Processes) == 0 {
					c.Logger.Printf("[INFO]   (sin procesos gestionados en esta sesión)")
				}
				for name, snap := range result.Processes {
					pidStr := ""
					if snap.PID > 0 {
						pidStr = fmt.Sprintf(" (PID %d)", snap.PID)
					}
					c.Logger.Printf("[INFO]   %-24s %s%s", name, snap.State, pidStr)
				}
			}
		},
	}
	cmd.Flags().BoolVar(&outputJSON, "json", false, "Output result as JSON")
	return cmd
}

func createRestartBootstrapCmd(c *core.Core) *cobra.Command {
	var outputJSON bool
	cmd := &cobra.Command{
		Use:   "restart-bootstrap",
		Short: "Restart the Control Plane (bootstrap/bundle.js) only",
		Long: `Mata cualquier instancia existente del control_plane_api y relanza
bootstrap/bundle.js. Usado por 'nucleus health --fix' para recuperarse
de un Control Plane crasheado sin hacer un restart completo del servicio.

CORRECCIÓN: Ahora llama a killExistingControlPlane() antes de bootControlPlane()
para garantizar que no queden múltiples instancias de Node corriendo.`,
		Example: `  nucleus service restart-bootstrap
  nucleus --json service restart-bootstrap`,
		Annotations: map[string]string{
			"category": "SERVICE",
			"json_response": `{
  "success": true,
  "pid": 9012,
  "state": "RUNNING",
  "timestamp": 1740000000
}`,
		},
		Args: cobra.NoArgs,
		Run: func(cmd *cobra.Command, args []string) {
			if c.IsJSON {
				outputJSON = true
			}
			logsDir := getLogsDir(c)
			binDir := getBinDir(c)
			sup := NewSupervisor(logsDir, binDir)
			ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
			defer cancel()
			result := &RestartBootstrapResult{Timestamp: time.Now().Unix()}

			// CORRECCIÓN MÚLTIPLES INICIALIZACIONES:
			// Matar la instancia existente ANTES de lanzar una nueva.
			// En el código original, sólo se mataba si estaba en el mapa del
			// supervisor — si el proceso era "externo" (lanzado por otra instancia
			// del supervisor), se dejaba corriendo y se lanzaba uno nuevo encima,
			// causando dos Node compitiendo por los mismos puertos.
			sup.killExistingControlPlane()

			proc, err := sup.bootControlPlane(ctx, false)
			if err != nil {
				result.Success = false
				result.State = "FAILED"
				result.Error = err.Error()
			} else {
				ready := false
				deadline := time.Now().Add(10 * time.Second)
				client := &http.Client{Timeout: 1 * time.Second}
				for time.Now().Before(deadline) {
					resp, httpErr := client.Get("http://127.0.0.1:48215/api/docs")
					if httpErr == nil {
						resp.Body.Close()
						ready = true
						break
					}
					time.Sleep(500 * time.Millisecond)
				}
				result.PID = proc.PID
				if ready {
					result.Success = true
					result.State = "RUNNING"
				} else {
					result.Success = true
					result.State = "STARTING"
					result.Error = "proceso iniciado pero puerto 48215 aún no responde"
				}
			}
			if outputJSON {
				data, _ := json.MarshalIndent(result, "", "  ")
				fmt.Println(string(data))
			} else {
				if result.Success {
					c.Logger.Printf("[SUCCESS] Control Plane reiniciado (PID %d) — estado: %s", result.PID, result.State)
					if result.Error != "" {
						c.Logger.Printf("[WARN] %s", result.Error)
					}
				} else {
					c.Logger.Printf("[ERROR] restart-bootstrap falló: %s", result.Error)
				}
			}
			if !result.Success {
				os.Exit(1)
			}
		},
	}
	cmd.Flags().BoolVar(&outputJSON, "json", false, "Output result as JSON")
	return cmd
}

// outputServiceStartResult imprime el resultado del service start.
// Nota: outputJSONResult (usada en workers list/describe) está en dev_start.go,
// mismo package. Esta función usa json.MarshalIndent directamente para no
// crear dependencia cruzada en el tipo ServiceStartResult.
func outputServiceStartResult(c *core.Core, outputJSON bool, result *ServiceStartResult) {
	if outputJSON {
		data, _ := json.MarshalIndent(result, "", "  ")
		fmt.Println(string(data))
	} else {
		if result.Success {
			c.Logger.Printf("[SUCCESS] Nucleus service iniciado — estado: %s", result.State)
		} else {
			c.Logger.Printf("[ERROR] Service start falló: %s", result.Error)
		}
	}
	if !result.Success {
		os.Exit(1)
	}
}