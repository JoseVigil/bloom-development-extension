package ignition

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sentinel/internal/core"
	"strings"
	"time"
)

type TelemetryHub struct {
	Core        *core.Core
	NativeLog   string
	SuccessChan chan bool
	ErrorChan   chan string
	done        chan bool
}

func NewTelemetryHub(c *core.Core) *TelemetryHub {
	return &TelemetryHub{
		Core:        c,
		NativeLog:   filepath.Join(c.Paths.LogsDir, "synapse_native.log"),
		SuccessChan: make(chan bool, 1),
		ErrorChan:   make(chan string, 1),
		done:        make(chan bool),
	}
}

func (th *TelemetryHub) Setup() error {
	os.MkdirAll(filepath.Join(th.Core.Paths.LogsDir, "profiles"), 0755)
	f, _ := os.OpenFile(th.NativeLog, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0644)
	if f != nil { f.Close() }
	return nil
}

// StartHandshakeMonitor vigila el log nativo y el core de brain
func (th *TelemetryHub) StartHandshakeMonitor(profileID, launchID string) {
	// 1. Ahora buscamos el archivo dinámico que genera el Host (C++)
	nativeLogName := fmt.Sprintf("synapse_native_%s.log", launchID)
	nativePath := filepath.Join(th.Core.Paths.LogsDir, nativeLogName)
	
	th.Core.Logger.Info("[TELEMETRY] Monitoreando Handshake en: %s", nativeLogName)
	
	go th.tailFile(nativePath, "[NATIVE]", false)
	
	today := time.Now().Format("20060102")
	brainLog := filepath.Join(th.Core.Paths.LogsDir, fmt.Sprintf("brain_core_%s.log", today))
	go th.tailFile(brainLog, "[BRAIN]", false)
}
// StartGranularTelemetry activa los procesos mineros de Python
func (th *TelemetryHub) StartGranularTelemetry(profileID, launchID string) {
	th.Core.Logger.Info("[TELEMETRY] Activando procesos de minería granular...")

	// 1. Lanzar mineros
	th.runLogMiner("mining-log", profileID, launchID)
	th.runLogMiner("read-log", profileID, launchID)

	// 2. Tailing de los nuevos archivos
	miningLog := filepath.Join(th.Core.Paths.LogsDir, "profiles", profileID, "engine_mining.log")
	go th.tailFile(miningLog, "[BROWSER-MINING]", true)

	readLog := filepath.Join(th.Core.Paths.LogsDir, "profiles", profileID, "engine_read.log")
	go th.tailFile(readLog, "[BROWSER-READ]", true)
}

func (th *TelemetryHub) runLogMiner(commandType string, profileID string, launchID string) {
	brainPath := filepath.Join(th.Core.Paths.BinDir, "brain.exe")
	args := []string{"--json", "chrome", commandType, profileID, "--launch-id", launchID}
	
	cmd := exec.Command(brainPath, args...)
	cmd.Env = append(os.Environ(), "PYTHONIOENCODING=utf-8", "PYTHONUTF8=1")

	if err := cmd.Start(); err != nil {
		th.Core.Logger.Error("[TELEMETRY] No se pudo iniciar %s: %v", commandType, err)
	} else {
		go func() { _ = cmd.Wait() }()
	}
}

func (th *TelemetryHub) tailFile(path string, prefix string, filter bool) {
	found := false
	for i := 0; i < 20; i++ {
		if _, err := os.Stat(path); err == nil {
			found = true
			break
		}
		time.Sleep(500 * time.Millisecond)
	}

	if !found { return }

	file, err := os.OpenFile(path, os.O_RDONLY, 0)
	if err != nil { return }
	defer file.Close()

	if prefix == "[BRAIN]" { file.Seek(0, io.SeekEnd) }

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
			if cleanLine == "" { continue }

			if filter {
				isRelevant := strings.Contains(cleanLine, "Synapse") ||
					strings.Contains(cleanLine, "CONSOLE") ||
					strings.Contains(cleanLine, "ERROR")
				if !isRelevant { continue }
			}

			th.Core.Logger.Info("%s %s", prefix, cleanLine)

			if strings.Contains(cleanLine, "LATE_BINDING_SUCCESS") {
				select {
				case th.SuccessChan <- true:
				default:
				}
			}
		}
	}
}

func (th *TelemetryHub) Close() {
	close(th.done)
}