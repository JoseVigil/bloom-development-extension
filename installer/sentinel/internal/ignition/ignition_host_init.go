package ignition

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)

func (ig *Ignition) initBloomHost(profileID string, launchID string) error {
	brainBin := filepath.Join(ig.Core.Paths.BinDir, "brain", "brain.exe")

	if _, err := os.Stat(brainBin); os.IsNotExist(err) {
		return fmt.Errorf("brain.exe no encontrado en %s — verificar instalación", brainBin)
	}

	ig.Core.Logger.Info("[HOST-INIT] Delegando inicialización a Brain (profile: %s, launch: %s)...", profileID, launchID)

	cmd := exec.Command(brainBin,
		"--json",
		"synapse", "host-init",
		"--profile-id", profileID,
		"--launch-id", launchID,
		"--bloom-root", ig.Core.Paths.AppDataDir,
	)
	cmd.Dir = ig.Core.Paths.AppDataDir

	ig.Core.Logger.Info("[HOST-INIT] CMD: %s --json synapse host-init --profile-id %s --launch-id %s", brainBin, profileID, launchID)
	ig.Core.Logger.Info("[HOST-INIT] CWD: %s", cmd.Dir)

	// stdout → JSON puro de Brain
	// stderr → logs de diagnóstico (Paths, logger) — no contaminan el parse
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()

	if stderr.Len() > 0 {
		ig.Core.Logger.Info("[HOST-INIT] Brain stderr: %s", stderr.String())
	}

	if err != nil {
		detail := ""
		if stdout.Len() > 0 {
			detail = fmt.Sprintf(" — stdout: %s", stdout.String())
		} else if stderr.Len() > 0 {
			detail = fmt.Sprintf(" — stderr: %s", stderr.String())
		}
		return fmt.Errorf("brain synapse host-init falló (profile: %s, launch: %s)%s: %v", profileID, launchID, detail, err)
	}

	ig.Core.Logger.Info("[HOST-INIT] Brain stdout: %s", stdout.String())

	hostInitResult, parseErr := parseHostInitOutput(stdout.Bytes())
	if parseErr != nil {
		ig.Core.Logger.Info("[HOST-INIT] [WARN] No se pudo parsear JSON de Brain: %v", parseErr)
	} else if hostInitResult.Status != "success" {
		return fmt.Errorf("brain synapse host-init reportó status=%s — %s", hostInitResult.Status, hostInitResult.Message)
	}

	logDir := filepath.Join(ig.Core.Paths.AppDataDir, "logs", "host", "profiles", profileID, launchID)
	today := time.Now().Format("20060102")
	expectedFiles := []string{
		filepath.Join(logDir, fmt.Sprintf("host_%s.log", today)),
		filepath.Join(logDir, fmt.Sprintf("cortex_extension_%s.log", today)),
	}

	for _, f := range expectedFiles {
		if _, statErr := os.Stat(f); os.IsNotExist(statErr) {
			ig.Core.Logger.Info("[HOST-INIT] [WARN] Archivo de log esperado no encontrado: %s", f)
		} else {
			ig.Core.Logger.Info("[HOST-INIT] ✅ Log verificado: %s", f)
		}
	}

	ig.Core.Logger.Info("[HOST-INIT] ✅ Inicialización completada via Brain — Chrome puede arrancar")
	return nil
}

type hostInitResponse struct {
	Status  string          `json:"status"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data"`
}

func parseHostInitOutput(output []byte) (*hostInitResponse, error) {
	lines := splitLines(output)
	for i := len(lines) - 1; i >= 0; i-- {
		line := lines[i]
		if len(line) == 0 || line[0] != '{' {
			continue
		}
		var r hostInitResponse
		if err := json.Unmarshal([]byte(line), &r); err == nil {
			return &r, nil
		}
	}
	return nil, fmt.Errorf("no se encontró JSON válido en stdout de Brain")
}