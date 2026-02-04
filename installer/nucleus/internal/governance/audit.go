// internal/governance/audit.go
package governance

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"nucleus/internal/core"
	"github.com/spf13/cobra"
)

// AuditLogger registra eventos de forma inmutable
type AuditLogger struct {
	logPath string
	file    *os.File
	mu      sync.Mutex
}

// AuditEvent representa un evento auditable
type AuditEvent struct {
	Timestamp time.Time `json:"timestamp"`
	EventType string    `json:"event_type"`
	Actor     string    `json:"actor"`
	Action    string    `json:"action"`
	Result    string    `json:"result"`
	Details   string    `json:"details"`
}

// NewAuditLogger crea un nuevo logger de auditoría
func NewAuditLogger(logPath string) *AuditLogger {
	logDir := filepath.Dir(logPath)
	os.MkdirAll(logDir, 0755)

	file, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		fmt.Printf("Warning: Failed to open audit log: %v\n", err)
		return &AuditLogger{logPath: logPath}
	}

	logger := &AuditLogger{
		logPath: logPath,
		file:    file,
	}

	info, _ := file.Stat()
	if info.Size() == 0 {
		logger.writeHeader()
	}

	return logger
}

func (a *AuditLogger) writeHeader() {
	header := fmt.Sprintf("# NUCLEUS AUDIT LOG\n# Created: %s\n# IMMUTABLE - DO NOT MODIFY\n\n",
		time.Now().Format(time.RFC3339))
	a.file.WriteString(header)
}

func (a *AuditLogger) Log(event AuditEvent) {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.file == nil {
		return
	}

	data, _ := json.Marshal(event)
	_, _ = a.file.WriteString(string(data) + "\n")
	a.file.Sync()
}

// IntegrityMonitor ejecuta verificaciones periódicas
type IntegrityMonitor struct {
	alfred   *Alfred
	interval time.Duration
	stopChan chan bool
}

func NewIntegrityMonitor(alfred *Alfred, interval time.Duration) *IntegrityMonitor {
	return &IntegrityMonitor{
		alfred:   alfred,
		interval: interval,
		stopChan: make(chan bool),
	}
}

func (m *IntegrityMonitor) Start() {
	ticker := time.NewTicker(m.interval)
	fmt.Printf("Integrity Monitor started (interval: %v)\n", m.interval)

	go func() {
		for {
			select {
			case <-ticker.C:
				report := m.alfred.CheckIntegrity()
				if !report.Valid {
					fmt.Printf("⚠️  SECURITY BREACH DETECTED: %s\n", report.Message)
				} else {
					fmt.Printf("✓ Integrity check passed [%s]\n", time.Now().Format("15:04:05"))
				}
			case <-m.stopChan:
				ticker.Stop()
				return
			}
		}
	}()
}

func (m *IntegrityMonitor) Stop() {
	m.stopChan <- true
}

// ────────────────────────────────────────────────
// CLI: nucleus alfred audit
// ────────────────────────────────────────────────

func init() {
	core.RegisterCommand("GOVERNANCE", alfredAuditCmd)
}

func alfredAuditCmd(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "alfred audit",
		Short: "Ejecuta una verificación de integridad manual sobre el sistema de archivos",
		Run: func(cmd *cobra.Command, args []string) {
			alfred, err := NewAlfred()
			if err != nil {
				fmt.Fprintf(os.Stderr, "Error inicializando Alfred: %v\n", err)
				os.Exit(1)
			}

			report := alfred.CheckIntegrity()

			if !report.Valid {
				fmt.Fprintf(os.Stderr, "ERROR DE INTEGRIDAD CRÍTICO\n")
				fmt.Fprintf(os.Stderr, "Mensaje:       %s\n", report.Message)
				fmt.Fprintf(os.Stderr, "Hash original: %s\n", report.OriginalHash)
				fmt.Fprintf(os.Stderr, "Hash actual:   %s\n", report.CurrentHash)
				fmt.Fprintf(os.Stderr, "Momento:       %s\n", time.Unix(report.Timestamp, 0).Format(time.RFC3339))
				os.Exit(1)
			}

			fmt.Println("✓ Verificación de integridad completada exitosamente")
			fmt.Printf("  Hash de .rules.bl: %s\n", report.CurrentHash)
		},
	}

	return cmd
}