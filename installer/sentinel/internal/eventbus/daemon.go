package eventbus

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"sentinel/internal/process"
	"sync"
	"syscall"
	"time"
)

// StdinCommand representa un comando recibido desde Electron vía Stdin
type StdinCommand struct {
	Command   string                 `json:"command"`
	ProfileID string                 `json:"profile_id,omitempty"`
	ID        string                 `json:"id"`
	Data      map[string]interface{} `json:"data,omitempty"`
}

// StdoutResponse representa una respuesta enviada a Electron vía Stdout
type StdoutResponse struct {
	Type      string                 `json:"type"`
	ID        string                 `json:"id,omitempty"`
	Status    string                 `json:"status,omitempty"`
	ProfileID string                 `json:"profile_id,omitempty"`
	Data      map[string]interface{} `json:"data,omitempty"`
	Error     string                 `json:"error,omitempty"`
	Timestamp int64                  `json:"timestamp"`
}

// DaemonMode gestiona el modo persistente de Sentinel
type DaemonMode struct {
	client         *SentinelClient
	stdinChan      chan StdinCommand
	shutdownChan   chan os.Signal
	ctx            context.Context
	cancel         context.CancelFunc
	logger         *log.Logger
	stdoutMu       sync.Mutex
	lastStateFile  string
	appDataDir     string
}

// NewDaemonMode crea una nueva instancia del modo daemon
func NewDaemonMode(brainAddr string) *DaemonMode {
	ctx, cancel := context.WithCancel(context.Background())
	
	// Obtener AppDataDir desde variable de entorno o default
	appDataDir := os.Getenv("LOCALAPPDATA")
	if appDataDir == "" {
		appDataDir = os.Getenv("HOME") // Fallback para Unix
	}
	if appDataDir != "" {
		appDataDir = filepath.Join(appDataDir, "BloomNucleus")
	} else {
		appDataDir = "/tmp/BloomNucleus" // Fallback final
	}
	
	return &DaemonMode{
		client:        NewSentinelClient(brainAddr),
		stdinChan:     make(chan StdinCommand, 10),
		shutdownChan:  make(chan os.Signal, 1),
		ctx:           ctx,
		cancel:        cancel,
		logger:        log.New(os.Stderr, "[Daemon] ", log.LstdFlags),
		lastStateFile: filepath.Join(appDataDir, "sentinel_last_event.txt"),
		appDataDir:    appDataDir,
	}
}

// Start inicia el modo daemon con todos los workers
func (dm *DaemonMode) Start() error {
	dm.logger.Printf("========================================")
	dm.logger.Printf("🚀 Sentinel - Modo Sidecar Persistente")
	dm.logger.Printf("========================================")
	
	// FASE 1: AUDITORÍA DE INICIO (Prompt B - Sección 1)
	dm.logger.Printf("🔍 Ejecutando auditoría de inicio (Reconciliation Logic)...")
	report, err := process.StartupAudit(dm.appDataDir, dm.client.addr)
	if err != nil {
		dm.logger.Printf("⚠️  Error en auditoría: %v", err)
	} else {
		dm.logger.Printf("✓ Auditoría completada:")
		dm.logger.Printf("  - Perfiles totales: %d", report.TotalProfiles)
		dm.logger.Printf("  - Perfiles abiertos: %d", report.OpenProfiles)
		dm.logger.Printf("  - Perfiles huérfanos detectados: %d", len(report.OrphanedProfiles))
		dm.logger.Printf("  - Correcciones aplicadas: %d", report.CorrectedCount)
		
		if len(report.OrphanedProfiles) > 0 {
			dm.logger.Printf("  - IDs huérfanos: %v", report.OrphanedProfiles)
		}
		
		// Emitir reporte como evento JSON en stdout
		dm.emitToElectron(StdoutResponse{
			Type:      "AUDIT_COMPLETED",
			Status:    "success",
			Timestamp: time.Now().UnixNano(),
			Data: map[string]interface{}{
				"total_profiles":    report.TotalProfiles,
				"open_profiles":     report.OpenProfiles,
				"orphaned_profiles": report.OrphanedProfiles,
				"corrected_count":   report.CorrectedCount,
				"errors":            report.Errors,
			},
		})
	}
	
	// FASE 2: CONECTAR CON EL BRAIN
	dm.logger.Printf("🔌 Conectando con Brain en %s...", dm.client.addr)
	if err := dm.client.Connect(); err != nil {
		return fmt.Errorf("no se pudo conectar con Brain: %w", err)
	}
	
	// Esperar a que la conexión esté activa
	if err := dm.client.WaitForConnection(10 * time.Second); err != nil {
		return fmt.Errorf("timeout conectando con Brain: %w", err)
	}
	
	dm.logger.Printf("✓ Conectado con Brain")
	
	// FASE 3: REHIDRATACIÓN
	dm.rehydrate()
	
	// Configurar manejo de señales
	signal.Notify(dm.shutdownChan, os.Interrupt, syscall.SIGTERM)
	
	// FASE 4: REGISTRAR HANDLERS
	dm.registerEventHandlers()
	
	// FASE 5: INICIAR WORKERS
	go dm.stdinWorker()
	go dm.controlWorker()
	go dm.zombieCleanupWorker() // Nuevo worker de limpieza
	
	// Enviar evento de inicio
	dm.emitToElectron(StdoutResponse{
		Type:      "DAEMON_READY",
		Status:    "running",
		Timestamp: time.Now().UnixNano(),
		Data: map[string]interface{}{
			"pid":     os.Getpid(),
			"version": "1.0.0",
			"audit":   report,
		},
	})
	
	dm.logger.Printf("✓ Todos los workers activos. Sentinel en modo escucha...")
	
	// Bloquear hasta recibir señal de shutdown
	<-dm.shutdownChan
	
	return dm.gracefulShutdown()
}

// stdinWorker escucha comandos desde Electron vía Stdin
func (dm *DaemonMode) stdinWorker() {
	dm.logger.Printf("Worker Stdin iniciado")
	scanner := bufio.NewScanner(os.Stdin)
	
	for scanner.Scan() {
		line := scanner.Text()
		
		var cmd StdinCommand
		if err := json.Unmarshal([]byte(line), &cmd); err != nil {
			dm.logger.Printf("Error parseando comando stdin: %v", err)
			dm.emitError("", "PARSE_ERROR", fmt.Sprintf("JSON inválido: %v", err))
			continue
		}
		
		// Enviar comando al canal de control
		select {
		case dm.stdinChan <- cmd:
		case <-dm.ctx.Done():
			return
		}
	}
	
	if err := scanner.Err(); err != nil {
		dm.logger.Printf("Error leyendo stdin: %v", err)
	}
}

// controlWorker procesa comandos y eventos
func (dm *DaemonMode) controlWorker() {
	dm.logger.Printf("Worker de Control iniciado")
	
	for {
		select {
		case <-dm.ctx.Done():
			dm.logger.Printf("Cerrando worker de control")
			return
			
		case cmd := <-dm.stdinChan:
			dm.handleStdinCommand(cmd)
		}
	}
}

// zombieCleanupWorker ejecuta limpieza periódica de procesos zombies (Prompt B - Sección 2)
func (dm *DaemonMode) zombieCleanupWorker() {
	dm.logger.Printf("Worker de Limpieza de Zombies iniciado (cada 2 minutos)")
	ticker := time.NewTicker(2 * time.Minute)
	defer ticker.Stop()
	
	for {
		select {
		case <-dm.ctx.Done():
			dm.logger.Printf("Cerrando worker de limpieza")
			return
			
		case <-ticker.C:
			dm.executeZombieCleanup()
		}
	}
}

// executeZombieCleanup ejecuta la limpieza de zombies
func (dm *DaemonMode) executeZombieCleanup() {
	dm.logger.Printf("🧹 Iniciando limpieza de zombies...")
	
	// Obtener PIDs activos desde profiles.json
	activePIDs := dm.getActivePIDs()
	dm.logger.Printf("PIDs activos registrados: %v", activePIDs)
	
	// Ejecutar limpieza
	if err := process.SafeCleanup(dm.appDataDir, activePIDs); err != nil {
		dm.logger.Printf("⚠️  Error en limpieza de zombies: %v", err)
		
		dm.emitToElectron(StdoutResponse{
			Type:      "ZOMBIE_CLEANUP_ERROR",
			Status:    "error",
			Error:     err.Error(),
			Timestamp: time.Now().UnixNano(),
		})
	} else {
		dm.logger.Printf("✓ Limpieza de zombies completada")
		
		dm.emitToElectron(StdoutResponse{
			Type:      "ZOMBIE_CLEANUP_COMPLETED",
			Status:    "success",
			Timestamp: time.Now().UnixNano(),
		})
	}
}

// getActivePIDs obtiene los PIDs activos desde profiles.json
func (dm *DaemonMode) getActivePIDs() []int {
	profilesPath := filepath.Join(dm.appDataDir, "config", "profiles.json")
	data, err := os.ReadFile(profilesPath)
	if err != nil {
		dm.logger.Printf("Error leyendo profiles.json: %v", err)
		return []int{}
	}

	var registry process.ProfileRegistry
	if err := json.Unmarshal(data, &registry); err != nil {
		dm.logger.Printf("Error parseando profiles.json: %v", err)
		return []int{}
	}

	var pids []int
	for _, profile := range registry.Profiles {
		if profile.Status == "open" && profile.PID > 0 {
			pids = append(pids, profile.PID)
		}
	}

	return pids
}

// handleStdinCommand procesa un comando recibido desde Electron
func (dm *DaemonMode) handleStdinCommand(cmd StdinCommand) {
	dm.logger.Printf("Procesando comando: %s (ID: %s)", cmd.Command, cmd.ID)
	
	// Enviar ACK inmediato
	dm.emitToElectron(StdoutResponse{
		Type:      "ACK",
		ID:        cmd.ID,
		Status:    "processing",
		Timestamp: time.Now().UnixNano(),
	})
	
	// Procesar según el comando
	switch cmd.Command {
	case "launch":
		dm.handleLaunch(cmd)
		
	case "stop":
		dm.handleStop(cmd)
		
	case "status":
		dm.handleStatus(cmd)
		
	case "intent":
		dm.handleIntent(cmd)
		
	case "poll_events":
		dm.handlePollEvents(cmd)
		
	case "cleanup_zombies":
		dm.handleCleanupZombies(cmd)
		
	case "exit":
		dm.handleExit(cmd)
		
	default:
		dm.emitError(cmd.ID, "UNKNOWN_COMMAND", fmt.Sprintf("Comando desconocido: %s", cmd.Command))
	}
}

// handleLaunch procesa el comando de lanzamiento de perfil
func (dm *DaemonMode) handleLaunch(cmd StdinCommand) {
	if cmd.ProfileID == "" {
		dm.emitError(cmd.ID, "MISSING_PROFILE_ID", "profile_id es requerido")
		return
	}
	
	// Enviar comando al Brain
	if err := dm.client.LaunchProfile(cmd.ProfileID); err != nil {
		dm.emitError(cmd.ID, "LAUNCH_FAILED", err.Error())
		return
	}
	
	// Respuesta exitosa
	dm.emitToElectron(StdoutResponse{
		Type:      "COMMAND_RESULT",
		ID:        cmd.ID,
		Status:    "success",
		ProfileID: cmd.ProfileID,
		Timestamp: time.Now().UnixNano(),
		Data: map[string]interface{}{
			"message": "Perfil lanzado correctamente",
		},
	})
}

// handleStop procesa el comando de detención de perfil
func (dm *DaemonMode) handleStop(cmd StdinCommand) {
	if cmd.ProfileID == "" {
		dm.emitError(cmd.ID, "MISSING_PROFILE_ID", "profile_id es requerido")
		return
	}
	
	if err := dm.client.StopProfile(cmd.ProfileID); err != nil {
		dm.emitError(cmd.ID, "STOP_FAILED", err.Error())
		return
	}
	
	dm.emitToElectron(StdoutResponse{
		Type:      "COMMAND_RESULT",
		ID:        cmd.ID,
		Status:    "success",
		ProfileID: cmd.ProfileID,
		Timestamp: time.Now().UnixNano(),
	})
}

// handleStatus solicita el estado de un perfil
func (dm *DaemonMode) handleStatus(cmd StdinCommand) {
	if cmd.ProfileID == "" {
		dm.emitError(cmd.ID, "MISSING_PROFILE_ID", "profile_id es requerido")
		return
	}
	
	if err := dm.client.RequestProfileStatus(cmd.ProfileID); err != nil {
		dm.emitError(cmd.ID, "STATUS_FAILED", err.Error())
		return
	}
	
	dm.emitToElectron(StdoutResponse{
		Type:      "COMMAND_RESULT",
		ID:        cmd.ID,
		Status:    "success",
		Timestamp: time.Now().UnixNano(),
	})
}

// handleIntent envía una intención al Brain
func (dm *DaemonMode) handleIntent(cmd StdinCommand) {
	if cmd.ProfileID == "" {
		dm.emitError(cmd.ID, "MISSING_PROFILE_ID", "profile_id es requerido")
		return
	}
	
	intentType, ok := cmd.Data["intent_type"].(string)
	if !ok {
		dm.emitError(cmd.ID, "MISSING_INTENT_TYPE", "intent_type es requerido")
		return
	}
	
	payload, _ := cmd.Data["payload"].(map[string]interface{})
	
	if err := dm.client.SubmitIntent(cmd.ProfileID, intentType, payload); err != nil {
		dm.emitError(cmd.ID, "INTENT_FAILED", err.Error())
		return
	}
	
	dm.emitToElectron(StdoutResponse{
		Type:      "COMMAND_RESULT",
		ID:        cmd.ID,
		Status:    "success",
		Timestamp: time.Now().UnixNano(),
	})
}

// handlePollEvents solicita eventos históricos
func (dm *DaemonMode) handlePollEvents(cmd StdinCommand) {
	since := int64(0)
	if sinceVal, ok := cmd.Data["since"].(float64); ok {
		since = int64(sinceVal)
	}
	
	if err := dm.client.PollEvents(since); err != nil {
		dm.emitError(cmd.ID, "POLL_FAILED", err.Error())
		return
	}
	
	dm.emitToElectron(StdoutResponse{
		Type:      "COMMAND_RESULT",
		ID:        cmd.ID,
		Status:    "success",
		Timestamp: time.Now().UnixNano(),
	})
}

// handleCleanupZombies ejecuta limpieza manual de zombies
func (dm *DaemonMode) handleCleanupZombies(cmd StdinCommand) {
	dm.logger.Printf("Limpieza manual de zombies solicitada")
	dm.executeZombieCleanup()
	
	dm.emitToElectron(StdoutResponse{
		Type:      "COMMAND_RESULT",
		ID:        cmd.ID,
		Status:    "success",
		Timestamp: time.Now().UnixNano(),
		Data: map[string]interface{}{
			"message": "Limpieza de zombies ejecutada",
		},
	})
}

// handleExit inicia el shutdown graceful
func (dm *DaemonMode) handleExit(cmd StdinCommand) {
	dm.logger.Printf("Comando exit recibido, iniciando shutdown...")
	
	dm.emitToElectron(StdoutResponse{
		Type:      "COMMAND_RESULT",
		ID:        cmd.ID,
		Status:    "success",
		Timestamp: time.Now().UnixNano(),
		Data: map[string]interface{}{
			"message": "Iniciando shutdown...",
		},
	})
	
	// Señalizar shutdown
	dm.shutdownChan <- syscall.SIGTERM
}

// registerEventHandlers registra handlers para eventos del Brain
func (dm *DaemonMode) registerEventHandlers() {
	// Handler global que reenvía todos los eventos a Electron
	dm.client.On("*", func(event Event) {
		// Guardar timestamp del último evento
		dm.saveLastEventTimestamp(event.Timestamp)
		
		// Convertir el evento del Brain a formato de salida para Electron
		dm.emitToElectron(StdoutResponse{
			Type:      event.Type,
			ProfileID: event.ProfileID,
			Status:    event.Status,
			Data:      event.Data,
			Error:     event.Error,
			Timestamp: event.Timestamp,
		})
	})
	
	// Handler específico para EXTENSION_ERROR (integración con Guardian)
	dm.client.On("EXTENSION_ERROR", func(event Event) {
		dm.logger.Printf("⚠️  Error de extensión detectado: %s", event.ProfileID)
	})
	
	// Handler para ONBOARDING_COMPLETE
	dm.client.On("ONBOARDING_COMPLETE", func(event Event) {
		dm.logger.Printf("✓ Onboarding completado: %s", event.ProfileID)
	})
	
	// Handler para PROFILE_CONNECTED (Handshake de 3 fases confirmado)
	dm.client.On("PROFILE_CONNECTED", func(event Event) {
		dm.logger.Printf("✓ Perfil conectado (handshake confirmado): %s", event.ProfileID)
	})
	
	// Handler para PROFILE_DISCONNECTED
	dm.client.On("PROFILE_DISCONNECTED", func(event Event) {
		dm.logger.Printf("⚠️  Perfil desconectado: %s", event.ProfileID)
	})
}

// emitToElectron envía un mensaje a Electron vía Stdout (JSON)
func (dm *DaemonMode) emitToElectron(response StdoutResponse) {
	dm.stdoutMu.Lock()
	defer dm.stdoutMu.Unlock()
	
	data, err := json.Marshal(response)
	if err != nil {
		dm.logger.Printf("Error serializando respuesta: %v", err)
		return
	}
	
	// Escribir JSON seguido de newline
	fmt.Println(string(data))
}

// emitError envía un error a Electron
func (dm *DaemonMode) emitError(id, errorType, message string) {
	dm.emitToElectron(StdoutResponse{
		Type:      "ERROR",
		ID:        id,
		Status:    "error",
		Error:     fmt.Sprintf("[%s] %s", errorType, message),
		Timestamp: time.Now().UnixNano(),
	})
}

// rehydrate carga el último timestamp y solicita eventos perdidos
func (dm *DaemonMode) rehydrate() {
	data, err := os.ReadFile(dm.lastStateFile)
	if err != nil {
		dm.logger.Printf("No se encontró estado previo, iniciando desde cero")
		return
	}
	
	var lastTimestamp int64
	if _, err := fmt.Sscanf(string(data), "%d", &lastTimestamp); err != nil {
		dm.logger.Printf("Error parseando último timestamp: %v", err)
		return
	}
	
	dm.logger.Printf("Rehidratando desde timestamp: %d", lastTimestamp)
	
	if err := dm.client.PollEvents(lastTimestamp); err != nil {
		dm.logger.Printf("Error solicitando eventos históricos: %v", err)
	}
}

// saveLastEventTimestamp guarda el timestamp del último evento
func (dm *DaemonMode) saveLastEventTimestamp(timestamp int64) {
	data := fmt.Sprintf("%d", timestamp)
	if err := os.WriteFile(dm.lastStateFile, []byte(data), 0644); err != nil {
		dm.logger.Printf("Error guardando timestamp: %v", err)
	}
}

// gracefulShutdown cierra todos los recursos limpiamente
func (dm *DaemonMode) gracefulShutdown() error {
	dm.logger.Printf("Iniciando shutdown graceful...")
	
	// Emitir evento de shutdown a Electron
	dm.emitToElectron(StdoutResponse{
		Type:      "DAEMON_SHUTDOWN",
		Status:    "stopping",
		Timestamp: time.Now().UnixNano(),
	})
	
	// Cancelar contexto para detener workers
	dm.cancel()
	
	// Notificar al Brain antes de cerrar
	shutdownEvent := Event{
		Type:      "SENTINEL_SHUTDOWN",
		Timestamp: time.Now().UnixNano(),
		Data: map[string]interface{}{
			"reason": "graceful_shutdown",
		},
	}
	
	if err := dm.client.Send(shutdownEvent); err != nil {
		dm.logger.Printf("Error notificando shutdown al Brain: %v", err)
	}
	
	// Dar tiempo para que el mensaje llegue
	time.Sleep(500 * time.Millisecond)
	
	// Cerrar la conexión con el Brain
	if err := dm.client.Close(); err != nil {
		dm.logger.Printf("Error cerrando cliente: %v", err)
	}
	
	dm.logger.Printf("✓ Shutdown completado correctamente")
	
	return nil
}