package temporal

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sentinel/internal/core"
	"sync"
	"time"

	"go.temporal.io/sdk/client"
	"go.temporal.io/sdk/worker"
)

// ══════════════════════════════════════════════════════════════
// ESTADOS DE LA FSM
// ══════════════════════════════════════════════════════════════

const (
	StateStopped      = "STOPPED"
	StateStarting     = "STARTING"
	StateRunning      = "RUNNING"
	StateUnresponsive = "UNRESPONSIVE"
	StateCrashed      = "CRASHED"
	StateDegraded     = "DEGRADED"
)

// ══════════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ══════════════════════════════════════════════════════════════

type Config struct {
	HostPort     string // "localhost:7233"
	Namespace    string // "bloom-default"
	TaskQueue    string // "bloom-task-queue"
	DatabaseType string // "sqlite" o "postgres"
	DatabasePath string // Ruta a SQLite en AppData
	DevMode      bool   // Modo desarrollo (servidor embebido)
}

type StatusInfo struct {
	State         string `json:"state"`
	Reachable     bool   `json:"reachable"`
	Namespace     string `json:"namespace"`
	TaskQueue     string `json:"task_queue"`
	WorkerCount   int    `json:"worker_count"`
	DatabaseType  string `json:"database_type"`
	ServerVersion string `json:"server_version,omitempty"`
}

// ══════════════════════════════════════════════════════════════
// MANAGER
// ══════════════════════════════════════════════════════════════

type Manager struct {
	mu           sync.RWMutex
	Config       *Config
	Client       client.Client
	Worker       worker.Worker
	Logger       *core.Logger
	state        string
	serverCmd    *exec.Cmd // Proceso del servidor embebido (solo dev mode)
	coreRef      *core.Core
	stopChan     chan bool
	workerCount  int
}

// ══════════════════════════════════════════════════════════════
// INICIALIZACIÓN
// ══════════════════════════════════════════════════════════════

func NewManager(c *core.Core) *Manager {
	// Logger categorizado para Temporal
	temporalLogger, err := core.InitLogger(
		c.Paths,
		"temporal_service",
		"TEMPORAL SERVER",
		3, // Priority ⚙️
	)
	if err != nil {
		c.Logger.Error("Error creando logger de Temporal: %v", err)
		temporalLogger = c.Logger // Fallback
	}

	config := &Config{
		HostPort:     "localhost:7233",
		Namespace:    "bloom-default",
		TaskQueue:    "bloom-task-queue",
		DatabaseType: "sqlite",
		DatabasePath: filepath.Join(c.Paths.AppDataDir, "temporal", "db.sqlite"),
		DevMode:      true,
	}

	return &Manager{
		Config:   config,
		Logger:   temporalLogger,
		state:    StateStopped,
		coreRef:  c,
		stopChan: make(chan bool),
	}
}

// ══════════════════════════════════════════════════════════════
// OPERACIONES PRINCIPALES
// ══════════════════════════════════════════════════════════════

func (m *Manager) Start(devMode bool, port int) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.state == StateRunning {
		m.Logger.Warning("Temporal ya está en ejecución")
		return nil
	}

	m.state = StateStarting
	m.Config.DevMode = devMode

	// Actualizar puerto si se especificó
	if port != 0 && port != 7233 {
		m.Config.HostPort = fmt.Sprintf("localhost:%d", port)
	}

	m.Logger.Info("🚀 Iniciando Temporal Server...")
	m.Logger.Info("   Modo: %s", m.getModeString())
	m.Logger.Info("   Namespace: %s", m.Config.Namespace)
	m.Logger.Info("   Task Queue: %s", m.Config.TaskQueue)

	// 1. Iniciar servidor embebido si es modo dev
	if devMode {
		if err := m.startEmbeddedServer(); err != nil {
			m.state = StateCrashed
			return fmt.Errorf("error iniciando servidor embebido: %w", err)
		}

		// Esperar a que el servidor esté listo
		m.Logger.Info("⏳ Esperando a que el servidor esté listo...")
		time.Sleep(3 * time.Second)
	}

	// 2. Crear cliente
	if err := m.createClient(); err != nil {
		m.state = StateDegraded
		return fmt.Errorf("error creando cliente: %w", err)
	}

	// 3. Registrar workers y workflows
	if err := m.registerWorkers(); err != nil {
		m.state = StateDegraded
		return fmt.Errorf("error registrando workers: %w", err)
	}

	m.state = StateRunning
	m.Logger.Success("✅ Temporal Server operativo")

	return nil
}

func (m *Manager) Stop() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.state == StateStopped {
		m.Logger.Warning("Temporal ya está detenido")
		return nil
	}

	m.Logger.Info("🛑 Deteniendo Temporal Server...")

	// 1. Detener worker
	if m.Worker != nil {
		m.Logger.Info("   Deteniendo worker...")
		m.Worker.Stop()
		m.Worker = nil
		m.workerCount = 0
	}

	// 2. Cerrar cliente
	if m.Client != nil {
		m.Logger.Info("   Cerrando cliente...")
		m.Client.Close()
		m.Client = nil
	}

	// 3. Detener servidor embebido
	if m.serverCmd != nil && m.serverCmd.Process != nil {
		m.Logger.Info("   Deteniendo servidor embebido (PID: %d)...", m.serverCmd.Process.Pid)
		if err := m.serverCmd.Process.Kill(); err != nil {
			m.Logger.Warning("Error matando proceso del servidor: %v", err)
		}
		m.serverCmd = nil
	}

	m.state = StateStopped
	m.Logger.Success("✅ Temporal Server detenido")

	return nil
}

func (m *Manager) GetStatus() StatusInfo {
	m.mu.RLock()
	defer m.mu.RUnlock()

	status := StatusInfo{
		State:        m.state,
		Namespace:    m.Config.Namespace,
		TaskQueue:    m.Config.TaskQueue,
		WorkerCount:  m.workerCount,
		DatabaseType: m.Config.DatabaseType,
		Reachable:    false,
	}

	// Verificar si el servidor responde
	if m.Client != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()

		_, err := m.Client.CheckHealth(ctx, &client.CheckHealthRequest{})
		status.Reachable = (err == nil)
	}

	return status
}

// ══════════════════════════════════════════════════════════════
// HEALTHCHECK PUNTUAL
// ══════════════════════════════════════════════════════════════

func (m *Manager) HealthCheck() (bool, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.Client == nil {
		return false, fmt.Errorf("cliente no inicializado")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	_, err := m.Client.CheckHealth(ctx, &client.CheckHealthRequest{})
	if err != nil {
		return false, fmt.Errorf("servidor no responde: %w", err)
	}

	return true, nil
}

// ══════════════════════════════════════════════════════════════
// HELPERS PRIVADOS
// ══════════════════════════════════════════════════════════════

func (m *Manager) startEmbeddedServer() error {
	// Asegurar que el directorio de base de datos existe
	dbDir := filepath.Dir(m.Config.DatabasePath)
	if err := os.MkdirAll(dbDir, 0755); err != nil {
		return fmt.Errorf("error creando directorio de BD: %w", err)
	}

	m.Logger.Info("   Base de datos: %s", m.Config.DatabasePath)

	// Comando para iniciar Temporal Server con SQLite
	// Nota: Esto requiere tener temporalite o temporal CLI instalado
	// Para Windows, podríamos usar temporalite.exe embebido en bin/
	temporalBin := filepath.Join(m.coreRef.Paths.BinDir, "temporalite.exe")
	
	// Verificar si existe el binario
	if _, err := os.Stat(temporalBin); os.IsNotExist(err) {
		return fmt.Errorf("temporalite.exe no encontrado en %s. Instalar desde: https://github.com/temporalio/temporalite", temporalBin)
	}

	// Configurar comando
	m.serverCmd = exec.Command(
		temporalBin,
		"start",
		"--ephemeral", // Modo efímero (no persistir entre reinicios en dev)
		"--namespace", m.Config.Namespace,
		"--port", "7233",
		"--db-filename", m.Config.DatabasePath,
	)

	// Redirigir logs a archivo
	logPath := filepath.Join(m.coreRef.Paths.LogsDir, "temporal", "server.log")
	if err := os.MkdirAll(filepath.Dir(logPath), 0755); err != nil {
		return fmt.Errorf("error creando directorio de logs: %w", err)
	}

	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return fmt.Errorf("error abriendo archivo de log: %w", err)
	}

	m.serverCmd.Stdout = logFile
	m.serverCmd.Stderr = logFile

	// Iniciar proceso
	if err := m.serverCmd.Start(); err != nil {
		return fmt.Errorf("error ejecutando temporalite: %w", err)
	}

	m.Logger.Success("   Servidor embebido iniciado (PID: %d)", m.serverCmd.Process.Pid)
	m.Logger.Info("   Logs: %s", logPath)

	return nil
}

func (m *Manager) createClient() error {
	var err error
	
	m.Logger.Info("   Conectando a %s...", m.Config.HostPort)
	
	m.Client, err = client.Dial(client.Options{
		HostPort:  m.Config.HostPort,
		Namespace: m.Config.Namespace,
		Logger:    NewTemporalLogger(m.Logger),
	})

	if err != nil {
		return err
	}

	m.Logger.Success("   Cliente conectado")
	return nil
}

func (m *Manager) registerWorkers() error {
	m.Logger.Info("   Registrando workers...")

	// Crear worker
	m.Worker = worker.New(m.Client, m.Config.TaskQueue, worker.Options{
		MaxConcurrentActivityExecutionSize: 10,
		MaxConcurrentWorkflowTaskExecutionSize: 10,
	})

	// TODO: Registrar workflows específicos de Bloom aquí
	// Ejemplo:
	// m.Worker.RegisterWorkflow(workflows.ProfileOnboarding)
	// m.Worker.RegisterActivity(activities.SendNotification)

	m.Logger.Info("   (No hay workflows registrados aún - implementar en workflows/)")

	// Iniciar worker en goroutine
	go func() {
		if err := m.Worker.Run(worker.InterruptCh()); err != nil {
			m.Logger.Error("Worker error: %v", err)
		}
	}()

	m.workerCount = 1
	m.Logger.Success("   Workers registrados: %d", m.workerCount)

	return nil
}

func (m *Manager) getModeString() string {
	if m.Config.DevMode {
		return "Desarrollo (SQLite embebido)"
	}
	return "Producción (servidor externo)"
}

func (m *Manager) GetState() string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.state
}

// ══════════════════════════════════════════════════════════════
// TEMPORAL LOGGER ADAPTER
// ══════════════════════════════════════════════════════════════

// Adapter para que el logger de Temporal use nuestro logger
type TemporalLogger struct {
	logger *core.Logger
}

func NewTemporalLogger(logger *core.Logger) *TemporalLogger {
	return &TemporalLogger{logger: logger}
}

func (tl *TemporalLogger) Debug(msg string, keyvals ...interface{}) {
	// Temporal genera mucho debug, lo silenciamos en modo normal
}

func (tl *TemporalLogger) Info(msg string, keyvals ...interface{}) {
	tl.logger.Info(msg)
}

func (tl *TemporalLogger) Warn(msg string, keyvals ...interface{}) {
	tl.logger.Warning(msg)
}

func (tl *TemporalLogger) Error(msg string, keyvals ...interface{}) {
	tl.logger.Error(msg)
}