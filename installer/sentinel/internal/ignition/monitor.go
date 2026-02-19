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

type MonitorHub struct {
	Core        *core.Core
	NativeLog   string
	SuccessChan chan bool
	done        chan bool
}

func NewMonitorHub(c *core.Core) *MonitorHub {
	return &MonitorHub{
		Core:        c,
		NativeLog:   filepath.Join(c.Paths.LogsDir, "profiles", "synapse_native.log"),
		SuccessChan: make(chan bool, 1),
		done:        make(chan bool),
	}
}

func (th *MonitorHub) StartGranularTelemetry(profileID, launchID string) {
	th.Core.Logger.Info("[MONITOR] Activando flujos de minería para %s", profileID)

	logDir := filepath.Join(th.Core.Paths.LogsDir, "profiles", profileID)
	_ = os.MkdirAll(logDir, 0755)

	miningLog := filepath.Join(logDir, "engine_mining.log")
	readLog := filepath.Join(logDir, "engine_read.log")

	// Tocar archivos
	_ = os.WriteFile(miningLog, []byte(""), 0644)
	_ = os.WriteFile(readLog, []byte(""), 0644)

	// Registrar streams via Nucleus CLI — escritor único de telemetry.json.
	// NUNCA usar GetTelemetryManager ni RegisterStream directamente.
	shortID := profileID
	if len(profileID) > 8 {
		shortID = profileID[:8]
	}
	core.RegisterTelemetryStream(
		th.Core.Paths.NucleusBin,
		"mining_"+shortID,
		"📦 MINING ENGINE",
		miningLog,
		4,
	)
	core.RegisterTelemetryStream(
		th.Core.Paths.NucleusBin,
		"reader_"+shortID,
		"📖 MINING READER",
		readLog,
		4,
	)

	th.runLogMiner("mining-log", profileID, launchID)
	th.runLogMiner("read-log", profileID, launchID)

	go th.tailFile(miningLog, "[BROWSER-MINING]", true)
}

func (th *MonitorHub) Setup() error {
	os.MkdirAll(filepath.Join(th.Core.Paths.LogsDir, "profiles"), 0755)
	f, _ := os.OpenFile(th.NativeLog, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0644)
	if f != nil {
		f.Close()
	}
	return nil
}

func (th *MonitorHub) StartHandshakeMonitor(profileID, launchID string) {
	// FIX: el log de handshake debe vivir en logs/sentinel/profiles/<profileID>/
	// NO en logs/sentinel/ directamente (raíz del LogsDir de sentinel).
	nativeLogName := fmt.Sprintf("synapse_native_%s.log", launchID)
	logDir := filepath.Join(th.Core.Paths.LogsDir, "profiles", profileID)
	_ = os.MkdirAll(logDir, 0755)
	nativePath := filepath.Join(logDir, nativeLogName)
	th.Core.Logger.Info("[MONITOR] Vigilando Handshake: %s", nativePath)
	go th.tailFile(nativePath, "[NATIVE]", false)
}

func (th *MonitorHub) runLogMiner(commandType string, profileID string, launchID string) {
	brainPath := filepath.Join(th.Core.Paths.BinDir, "brain.exe")
	args := []string{"--json", "chrome", commandType, profileID, "--launch-id", launchID}
	cmd := exec.Command(brainPath, args...)
	cmd.Env = append(os.Environ(), "PYTHONIOENCODING=utf-8", "PYTHONUTF8=1")
	if err := cmd.Start(); err != nil {
		th.Core.Logger.Error("[MONITOR] Fallo al iniciar %s: %v", commandType, err)
	} else {
		go func() { _ = cmd.Wait() }()
	}
}

func (th *MonitorHub) tailFile(path string, prefix string, filter bool) {
	found := false
	for i := 0; i < 20; i++ {
		if _, err := os.Stat(path); err == nil {
			found = true
			break
		}
		time.Sleep(500 * time.Millisecond)
	}
	if !found {
		return
	}

	file, err := os.OpenFile(path, os.O_RDONLY, 0)
	if err != nil {
		return
	}
	defer file.Close()
	if prefix == "[BRAIN]" {
		file.Seek(0, io.SeekEnd)
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
			if strings.Contains(cleanLine, "LATE_BINDING_SUCCESS") {
				select {
				case th.SuccessChan <- true:
				default:
				}
			}
			th.Core.Logger.Info("%s %s", prefix, cleanLine)
		}
	}
}

func (th *MonitorHub) Close() { close(th.done) }