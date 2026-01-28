package health

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"sentinel/internal/core"
	"sentinel/internal/eventbus"
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
	Logger      *log.Logger
	LogFile     *os.File
	Failures    int
	Mu          sync.Mutex
	ctx         context.Context
	cancel      context.CancelFunc
	eventClient *eventbus.SentinelClient  // Cliente para emitir eventos
}

func NewGuardian(c *core.Core, profileID string, launchID string, brainPID int) (*GuardianInstance, error) {
	logDir := filepath.Join(c.Paths.AppDataDir, "logs", "profiles", profileID)
	_ = os.MkdirAll(logDir, 0755)

	logPath := filepath.Join(logDir, fmt.Sprintf("guardian_%s.log", launchID))
	f, err := os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithCancel(context.Background())
	
	// Crear cliente de eventos (opcional, solo si se necesita emitir eventos)
	var eventClient *eventbus.SentinelClient
	if brainAddr := os.Getenv("BRAIN_ADDR"); brainAddr != "" {
		eventClient = eventbus.NewSentinelClient(brainAddr)
		// Intentar conectar en background
		go func() {
			if err := eventClient.Connect(); err != nil {
				log.Printf("[Guardian] No se pudo conectar EventClient: %v", err)
			}
		}()
	}
	
	g := &GuardianInstance{
		ProfileID:   profileID,
		LaunchID:    launchID,
		BrainPID:    brainPID,
		Core:        c,
		Logger:      log.New(f, "", log.LstdFlags),
		LogFile:     f,
		ctx:         ctx,
		cancel:      cancel,
		eventClient: eventClient,
	}

	g.logInfo(fmt.Sprintf("🛡️ Guardian Activo | Perfil: %s | Launch: %s | PID: %d", profileID, launchID, brainPID))
	return g, nil
}

func (g *GuardianInstance) logInfo(msg string) { g.Logger.Printf("[INFO] %s", msg) }
func (g *GuardianInstance) logWarn(msg string, data any) { g.Logger.Printf("[WARN] %s | Data: %v", msg, data) }
func (g *GuardianInstance) logError(msg string, err error) { g.Logger.Printf("[ERROR] %s | Error: %v", msg, err) }

func (g *GuardianInstance) Start() {
	ticker := time.NewTicker(10 * time.Second)
	go func() {
		defer ticker.Stop()
		for {
			select {
			case <-g.ctx.Done():
				g.logInfo("Cerrando loop del Guardian.")
				g.LogFile.Close()
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
		g.logWarn(fmt.Sprintf("Heartbeat fallido (%d/3)", g.Failures), err)
		
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
			g.logInfo("Heartbeat recuperado")
			g.emitEvent("HEARTBEAT_RECOVERED", nil)
		}
		g.Failures = 0
	}

	if !g.checkResources() {
		g.logWarn("Anomalía de recursos detectada.", nil)
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
	g.logError("Iniciando recuperación quirúrgica...", nil)
	
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
		g.logInfo(fmt.Sprintf("Brain Service relanzado (PID: %d)", g.BrainPID))
		
		// Emitir evento de recuperación exitosa
		g.emitEvent("SERVICE_RECOVERY_COMPLETE", map[string]interface{}{
			"new_brain_pid": g.BrainPID,
		})
	} else {
		g.logError("Fallo al relanzar Brain Service", err)
		
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
		g.logWarn("No se pudo emitir evento al EventBus", err)
	}
}

func (g *GuardianInstance) Stop() {
	g.cancel()
}