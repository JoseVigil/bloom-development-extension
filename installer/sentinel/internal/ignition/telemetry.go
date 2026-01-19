package ignition

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sentinel/internal/core"
	"strings"
	"time"
)

// TelemetryHub orquesta el log tailing y el mining de señales críticas
type TelemetryHub struct {
	Core        *core.Core
	NativeLog   string
	SuccessChan chan bool
	ErrorChan   chan string
	done        chan bool
}

// NewTelemetryHub construye el hub con las rutas de AppData resueltas
func NewTelemetryHub(c *core.Core) *TelemetryHub {
	logDir := filepath.Join(c.Paths.LogsDir)
	return &TelemetryHub{
		Core:        c,
		NativeLog:   filepath.Join(logDir, "synapse_native.log"),
		SuccessChan: make(chan bool, 1),
		ErrorChan:   make(chan string, 1),
		done:        make(chan bool),
	}
}

// Setup realiza la higiene pre-flight.
func (th *TelemetryHub) Setup() error {
	th.Core.Logger.Info("[TELEMETRY] Ejecutando higiene de logs profunda...")

	// 1. Asegurar directorios
	os.MkdirAll(filepath.Dir(th.NativeLog), 0755)
	
	// 2. Truncar log nativo (Handshake)
	f, _ := os.OpenFile(th.NativeLog, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0644)
	if f != nil { 
		f.Close() 
	}

	// 3. Limpiar logs de perfiles antiguos
	logBase := filepath.Join(th.Core.Paths.LogsDir, "profiles")
	os.RemoveAll(logBase)
	os.MkdirAll(logBase, 0755)

	th.Core.Logger.Success("[TELEMETRY] Zona de logs despejada y lista.")
	return nil
}

// StartTailing lanza los hilos de monitoreo
func (th *TelemetryHub) StartTailing(profileID string, launchID string) {
	// 1. Monitor Nativo
	go th.tailFile(th.NativeLog, "[NATIVE]", false)

	// 2. Monitor de Navegador
	miningLog := filepath.Join(th.Core.Paths.LogsDir, "profiles", profileID, "engine_mining.log")
	go th.tailFile(miningLog, "[BROWSER]", true) 

	// 3. Monitor de Brain
	today := time.Now().Format("20060102")
	brainLog := filepath.Join(th.Core.Paths.LogsDir, fmt.Sprintf("brain_core_%s.log", today))
	go th.tailFile(brainLog, "[BRAIN]", false)
}

// tailFile es el motor de lectura en tiempo real
func (th *TelemetryHub) tailFile(path string, prefix string, filter bool) {
	// A. Espera activa hasta que el archivo sea creado
	for i := 0; i < 30; i++ {
		if _, err := os.Stat(path); err == nil {
			break
		}
		time.Sleep(500 * time.Millisecond)
	}

	// B. Apertura compartida para Windows
	file, err := os.Open(path)
	if err != nil {
		return
	}
	defer file.Close()

	// C. Posicionamiento inicial
	if prefix == "[BRAIN]" {
		file.Seek(0, io.SeekEnd)
	} else {
		file.Seek(0, io.SeekStart)
	}

	reader := bufio.NewReader(file)
	for {
		select {
		case <-th.done:
			return
		default:
			line, err := reader.ReadString('\n')
			if err != nil {
				if err == io.EOF {
					time.Sleep(250 * time.Millisecond)
					continue
				}
				return
			}

			cleanLine := strings.TrimSpace(line)
			if cleanLine == "" {
				continue
			}

			if filter {
				isRelevant := strings.Contains(cleanLine, "Synapse") ||
					strings.Contains(cleanLine, "CONSOLE") ||
					strings.Contains(cleanLine, "ERROR")
				if !isRelevant {
					continue
				}
			}

			th.Core.Logger.Info("%s %s", prefix, cleanLine)

			if strings.Contains(cleanLine, "LATE_BINDING_SUCCESS") {
				select {
				case th.SuccessChan <- true:
				default:
				}
			}

			if strings.Contains(cleanLine, "Config timeout") {
				select {
				case th.ErrorChan <- cleanLine:
				default:
				}
			}
		}
	}
}

// Close cierra todos los procesos de tailing
func (th *TelemetryHub) Close() {
	close(th.done)
}