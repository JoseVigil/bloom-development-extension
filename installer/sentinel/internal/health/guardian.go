package health

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sentinel/internal/core"
	"sentinel/internal/eventbus"
	"sentinel/internal/process"
	"strconv"
	"strings"
	"sync"
	"time"
)

// HeartbeatRequest define la estructura del ping hacia el Brain
type HeartbeatRequest struct {
	Type      string `json:"type"`
	Sequence  uint64 `json:"sequence"`
	Timestamp int64  `json:"timestamp"`
	ProfileID string `json:"profile_id"`
}

type GuardianInstance struct {
	ProfileID   string
	LaunchID    string
	BrainPID    int 
	Core        *core.Core
	Logger      *core.Logger  // Usar el Logger del sistema, no log.Logger
	Failures    int
	Mu          sync.Mutex
	ctx         context.Context
	cancel      context.CancelFunc
	eventClient *eventbus.SentinelClient
}

func NewGuardian(c *core.Core, profileID string, launchID string, brainPID int) (*GuardianInstance, error) {
	// 1. Crear directorio específico para logs de Guardian
	guardianLogDir := filepath.Join(c.Paths.AppDataDir, "logs", "sentinel", "guardian")
	if err := os.MkdirAll(guardianLogDir, 0755); err != nil {
		return nil, fmt.Errorf("error creando directorio de logs: %w", err)
	}

	// 2. Inicializar Logger usando el sistema de telemetría
	// ComponentID único por perfil para que cada Guardian tenga su entrada
	componentID := fmt.Sprintf("sentinel_guardian_%s", profileID)
	label := fmt.Sprintf("SENTINEL GUARDIAN [%s]", profileID)
	
	// Crear paths temporal con el directorio correcto
	guardianPaths := &core.Paths{
		LogsDir: guardianLogDir,
	}
	
	logger, err := core.InitLogger(guardianPaths, componentID, label, 6)
	if err != nil {
		return nil, fmt.Errorf("error inicializando logger: %w", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	
	// 3. Crear cliente de eventos con el logger correcto
	var eventClient *eventbus.SentinelClient
	if brainAddr := os.Getenv("BRAIN_ADDR"); brainAddr != "" {
		eventClient = eventbus.NewSentinelClient(brainAddr, logger)
		// Intentar conectar en background
		go func() {
			if err := eventClient.Connect(); err != nil {
				logger.Warning("No se pudo conectar EventClient: %v", err)
			}
		}()
	}
	
	g := &GuardianInstance{
		ProfileID:   profileID,
		LaunchID:    launchID,
		BrainPID:    brainPID,
		Core:        c,
		Logger:      logger,
		ctx:         ctx,
		cancel:      cancel,
		eventClient: eventClient,
	}

	g.Logger.Info("🛡️ Guardian Activo | Perfil: %s | Launch: %s | PID: %d", profileID, launchID, brainPID)
	return g, nil
}

func (g *GuardianInstance) Start() {
	ticker := time.NewTicker(10 * time.Second)
	go func() {
		defer ticker.Stop()
		for {
			select {
			case <-g.ctx.Done():
				g.Logger.Info("Cerrando loop del Guardian.")
				g.Logger.Close()
				if g.eventClient != nil {
					g.eventClient.Close()
				}
				return
			case <-ticker.C:
				g.performCheck()
			}
		}
	}()
}

func (g *GuardianInstance) performCheck() {
	g.Mu.Lock()
	defer g.Mu.Unlock()

	if err := g.checkHeartbeat(); err != nil {
		g.Failures++
		g.Logger.Warning("Heartbeat fallido (%d/3): %v", g.Failures, err)
		
		// Emitir evento de warning
		g.emitEvent("HEARTBEAT_FAILED", map[string]interface{}{
			"failures": g.Failures,
			"max":      3,
		})
		
		if g.Failures >= 3 {
			g.emitEvent("EXTENSION_ERROR", map[string]interface{}{
				"reason": "heartbeat_timeout",
				"consecutive_failures": g.Failures,
			})
			g.recoverService()
		}
	} else {
		if g.Failures > 0 {
			g.Logger.Info("Heartbeat recuperado")
			g.emitEvent("HEARTBEAT_RECOVERED", nil)
		}
		g.Failures = 0
	}

	if !g.checkResources() {
		g.Logger.Warning("Anomalía de recursos detectada")
		g.emitEvent("RESOURCE_ANOMALY", map[string]interface{}{
			"reason": "memory_threshold_exceeded",
		})
		g.recoverService()
	}
}

func (g *GuardianInstance) checkHeartbeat() error {
	conn, err := net.DialTimeout("tcp", "127.0.0.1:5678", 2*time.Second)
	if err != nil {
		return err
	}
	defer conn.Close()

	req := HeartbeatRequest{
		Type:      "PING",
		Sequence:  uint64(time.Now().Unix()),
		Timestamp: time.Now().UnixNano(),
		ProfileID: g.ProfileID,
	}

	// 1. Serializar
	payload, _ := json.Marshal(req)

	// 2. ENVIAR HEADER (4 bytes BigEndian con el tamaño)
	header := make([]byte, 4)
	binary.BigEndian.PutUint32(header, uint32(len(payload)))
	
	if _, err := conn.Write(header); err != nil { return err }
	if _, err := conn.Write(payload); err != nil { return err }

	// 3. Leer Respuesta
	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	var resp map[string]interface{}
	return json.NewDecoder(conn).Decode(&resp)
}

func (g *GuardianInstance) checkResources() bool {
	if g.BrainPID <= 0 { return true }
	cmd := exec.Command("tasklist", "/fi", fmt.Sprintf("PID eq %d", g.BrainPID), "/fo", "csv", "/nh")
	out, _ := cmd.Output()
	output := string(out)
	if strings.Contains(output, "no hay tareas") || output == "" { return false }
	fields := strings.Split(output, ",")
	if len(fields) < 5 { return true }
	memStr := fields[4]
	memStr = strings.ReplaceAll(memStr, "\"", "")
	memStr = strings.ReplaceAll(memStr, " K", "")
	memStr = strings.ReplaceAll(memStr, ".", "")
	memStr = strings.ReplaceAll(memStr, ",", "")
	memKB, _ := strconv.Atoi(strings.TrimSpace(memStr))
	return memKB < 500*1024
}

func (g *GuardianInstance) recoverService() {
	g.Logger.Info("Iniciando recuperación quirúrgica...")
	
	// Emitir evento de recuperación iniciada
	g.emitEvent("SERVICE_RECOVERY_STARTED", map[string]interface{}{
		"brain_pid": g.BrainPID,
	})
	
	if g.BrainPID > 0 {
		exec.Command("taskkill", "/F", "/T", "/PID", strconv.Itoa(g.BrainPID)).Run()
	}
	g.cleanupPort(5678)
	
	cmd := exec.Command("brain.exe", "service", "start")
	if err := cmd.Start(); err == nil {
		g.BrainPID = cmd.Process.Pid
		g.Logger.Success("Brain Service relanzado (PID: %d)", g.BrainPID)
		
		// Emitir evento de recuperación exitosa
		g.emitEvent("SERVICE_RECOVERY_COMPLETE", map[string]interface{}{
			"new_brain_pid": g.BrainPID,
		})
	} else {
		g.Logger.Error("Fallo al relanzar Brain Service: %v", err)
		
		// Emitir evento de recuperación fallida
		g.emitEvent("SERVICE_RECOVERY_FAILED", map[string]interface{}{
			"error": err.Error(),
		})
	}
	
	g.Failures = 0
}

func (g *GuardianInstance) cleanupPort(port int) {
	cmd := exec.Command("cmd", "/C", fmt.Sprintf("netstat -ano | findstr :%d", port))
	out, _ := cmd.Output()
	lines := strings.Split(string(out), "\r\n")
	for _, line := range lines {
		fields := strings.Fields(line)
		if len(fields) >= 5 && fields[4] != "0" {
			exec.Command("taskkill", "/F", "/PID", fields[4], "/T").Run()
		}
	}
}

// ========== FUNCIONES AGREGADAS DESDE health.go ==========

// killProcessTree mata el proceso y todo su árbol de hijos de forma segura
func (g *GuardianInstance) killProcessTree(pid int) error {
	// 1. Validar que el PID pertenece a BloomNucleus
	if !g.isBloomProcess(pid) {
		return fmt.Errorf("el PID %d no pertenece a BloomNucleus, abortando tree kill", pid)
	}

	// 2. Ejecutar tree kill usando el package process
	g.Logger.Info("Ejecutando tree kill en PID %d...", pid)
	return process.KillProcessTree(pid)
}

// isBloomProcess verifica que el PID pertenece a la ruta de Bloom
func (g *GuardianInstance) isBloomProcess(pid int) bool {
	if runtime.GOOS != "windows" {
		return true // Simplificado para Unix
	}

	cmd := exec.Command("wmic", "process", "where", fmt.Sprintf("ProcessId=%d", pid), 
		"get", "ExecutablePath", "/format:list")
	output, err := cmd.Output()
	if err != nil {
		g.Logger.Error("Error verificando ruta del proceso: %v", err)
		return false
	}

	path := string(output)
	bloomPath := filepath.Join(g.Core.Paths.AppDataDir, "bin", "chrome-win")
	
	isBloom := len(path) > 0 && filepath.IsAbs(path) && 
		(filepath.Dir(path) == bloomPath || strings.HasPrefix(path, bloomPath))
	
	if !isBloom {
		g.Logger.Warning("PID %d no pertenece a Bloom (ruta: %s)", pid, path)
	}
	
	return isBloom
}

// updateProfileStatus actualiza el estado en profiles.json
func (g *GuardianInstance) updateProfileStatus(newStatus string) {
	profilesPath := filepath.Join(g.Core.Paths.AppDataDir, "config", "profiles.json")
	
	data, err := os.ReadFile(profilesPath)
	if err != nil {
		g.Logger.Error("Error leyendo profiles.json: %v", err)
		return
	}

	var registry process.ProfileRegistry
	if err := json.Unmarshal(data, &registry); err != nil {
		g.Logger.Error("Error parseando profiles.json: %v", err)
		return
	}

	// Actualizar estado
	for i, profile := range registry.Profiles {
		if profile.ProfileID == g.ProfileID {
			registry.Profiles[i].Status = newStatus
			registry.Profiles[i].PID = 0
			break
		}
	}

	// Guardar
	updatedData, _ := json.MarshalIndent(registry, "", "  ")
	if err := os.WriteFile(profilesPath, updatedData, 0644); err != nil {
		g.Logger.Error("Error guardando profiles.json: %v", err)
	} else {
		g.Logger.Info("Estado actualizado a '%s' en profiles.json", newStatus)
	}
}

// cleanup ejecuta la limpieza completa cuando un proceso muere o se desconecta
func (g *GuardianInstance) cleanup(chromePID int) {
	g.Logger.Info("Iniciando limpieza para perfil %s (Chrome PID: %d)...", g.ProfileID, chromePID)

	// 1. Tree kill quirúrgico
	if err := g.killProcessTree(chromePID); err != nil {
		g.Logger.Error("Error en tree kill: %v", err)
	}

	// 2. Actualizar estado en profiles.json
	g.updateProfileStatus("closed")

	// 3. Notificar al Brain
	g.emitEvent("PROFILE_DISCONNECTED", map[string]interface{}{
		"chrome_pid": chromePID,
		"reason":     "process_died",
	})

	g.Logger.Success("Limpieza completada")
}

// ========== FIN FUNCIONES AGREGADAS ==========

// emitEvent envía un evento al EventBus si está disponible
func (g *GuardianInstance) emitEvent(eventType string, data map[string]interface{}) {
	if g.eventClient == nil || !g.eventClient.IsConnected() {
		return
	}
	
	event := eventbus.Event{
		Type:      eventType,
		ProfileID: g.ProfileID,
		Timestamp: time.Now().UnixNano(),
		Data:      data,
	}
	
	if err := g.eventClient.Send(event); err != nil {
		g.Logger.Warning("No se pudo emitir evento al EventBus: %v", err)
	}
}

func (g *GuardianInstance) Stop() {
	g.cancel()
}