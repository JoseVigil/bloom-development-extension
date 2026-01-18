package ignition

import (
	"bufio"
	"io"
	"os"
	"path/filepath"
	"sentinel/internal/core"
	"strings"
	"time"
)

type TelemetryHub struct {
	Core        *core.Core
	NativeLog   string
	BrowserLog  string
	SuccessChan chan bool
	ErrorChan   chan string
}

func NewTelemetryHub(c *core.Core) *TelemetryHub {
	logDir := filepath.Join(os.Getenv("LOCALAPPDATA"), "BloomNucleus", "logs")
	return &TelemetryHub{
		Core:        c,
		NativeLog:   filepath.Join(logDir, "synapse_native.log"),
		BrowserLog:  filepath.Join(logDir, "synapse_browser.log"),
		SuccessChan: make(chan bool),
		ErrorChan:   make(chan string),
	}
}

func (th *TelemetryHub) Setup() error {
	// Higiene: Truncar logs previos para evitar falsos positivos
	os.MkdirAll(filepath.Dir(th.NativeLog), 0755)
	
	f1, _ := os.OpenFile(th.NativeLog, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0644)
	f1.Close()
	f2, _ := os.OpenFile(th.BrowserLog, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0644)
	f2.Close()
	
	return nil
}

func (th *TelemetryHub) StartTailing() {
	go th.tailFile(th.NativeLog, "[NATIVE]")
	go th.tailFile(th.BrowserLog, "[BROWSER]")
}

func (th *TelemetryHub) tailFile(path string, prefix string) {
	file, err := os.Open(path)
	if err != nil {
		return
	}
	defer file.Close()

	reader := bufio.NewReader(file)
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			if err == io.EOF {
				time.Sleep(100 * time.Millisecond)
				continue
			}
			break
		}

		cleanLine := strings.TrimSpace(line)
		if cleanLine == "" {
			continue
		}

		// Reportar a stdout para Electron
		th.Core.Logger.Info("%s %s", prefix, cleanLine)

		// Lógica de Validación
		if strings.Contains(cleanLine, "LATE_BINDING_SUCCESS") {
			th.SuccessChan <- true
		}
		if strings.Contains(cleanLine, "Handshake confirmed") {
			th.Core.Logger.Success("[IGNITION] Ralentí estable: Handshake confirmado.")
		}
		if strings.Contains(cleanLine, "ERROR") || strings.Contains(cleanLine, "302") {
			th.ErrorChan <- cleanLine
		}
	}
}