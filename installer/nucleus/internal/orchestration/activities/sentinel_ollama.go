// File: internal/orchestration/temporal/activities/sentinel_ollama.go
package activities

import (
	"os"
    "path/filepath"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"time"
)

// StartOllamaInput representa los parámetros para iniciar Ollama
type StartOllamaInput struct {
	SimulationMode bool `json:"simulation_mode"`
}

// StartOllamaResult representa el resultado de iniciar Ollama
type StartOllamaResult struct {
	Success   bool   `json:"success"`
	PID       int    `json:"pid,omitempty"`
	Port      int    `json:"port"`
	State     string `json:"state"`
	Error     string `json:"error,omitempty"`
	Timestamp int64  `json:"timestamp"`
}

// StartOllama activity para iniciar Ollama via Sentinel
func (a *SentinelActivities) StartOllama(ctx context.Context, input StartOllamaInput) (*StartOllamaResult, error) {
	eventID := fmt.Sprintf("ollama_start_%d", time.Now().UnixNano())
	
	a.logEvent(eventID, "ollama_start", "started", map[string]interface{}{
		"simulation_mode": input.SimulationMode,
	})

	// Ejecutar: sentinel --json ollama start
	sentinelPath := filepath.Join(os.Getenv("BLOOM_BIN_DIR"), "sentinel", "sentinel.exe")
	cmd := exec.CommandContext(ctx, sentinelPath, "--json", "ollama", "start")
	
	output, err := cmd.CombinedOutput()
	if err != nil {
		errorMsg := fmt.Sprintf("failed to start ollama: %v, output: %s", err, string(output))
		a.logEvent(eventID, "ollama_start", "failed", map[string]interface{}{
			"error": errorMsg,
		})
		return &StartOllamaResult{
			Success:   false,
			State:     "FAILED",
			Error:     errorMsg,
			Timestamp: time.Now().Unix(),
		}, fmt.Errorf(errorMsg)
	}

	// Parsear respuesta JSON de Sentinel
	var result StartOllamaResult
	if err := json.Unmarshal(output, &result); err != nil {
		errorMsg := fmt.Sprintf("failed to parse sentinel response: %v, output: %s", err, string(output))
		a.logEvent(eventID, "ollama_start", "failed", map[string]interface{}{
			"error": errorMsg,
		})
		return &StartOllamaResult{
			Success:   false,
			State:     "FAILED",
			Error:     errorMsg,
			Timestamp: time.Now().Unix(),
		}, fmt.Errorf(errorMsg)
	}

	result.Timestamp = time.Now().Unix()

	a.logEvent(eventID, "ollama_start", "completed", map[string]interface{}{
		"success": result.Success,
		"pid":     result.PID,
		"port":    result.Port,
		"state":   result.State,
	})

	if !result.Success {
		return &result, fmt.Errorf("ollama start failed: %s", result.Error)
	}

	return &result, nil
}