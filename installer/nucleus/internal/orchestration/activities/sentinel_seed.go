// File: internal/orchestration/activities/sentinel_seed.go
// Activity for profile seeding via Sentinel (Brain)
package activities

import (
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"
	"time"

	"go.temporal.io/sdk/activity"
)

// SeedProfileInput represents input for profile seeding
type SeedProfileInput struct {
	Alias    string `json:"alias"`
	IsMaster bool   `json:"is_master"`
}

// SeedProfileResult represents the result of profile seeding
type SeedProfileResult struct {
	Success bool            `json:"success"`
	Data    SeedProfileData `json:"data"`
	Error   string          `json:"error,omitempty"`
}

// SeedProfileData contains profile creation details
type SeedProfileData struct {
	UUID     string `json:"uuid"`
	Alias    string `json:"alias"`
	Path     string `json:"path"`
	IsMaster bool   `json:"is_master"`
}

// extractJSONFromLogs extrae el JSON válido de un output mezclado con logs
// Busca desde el FINAL hacia atrás porque el JSON está al final del output
func extractJSONFromLogs(output string) (string, error) {
	lines := strings.Split(output, "\n")
	
	// Buscar desde el final hacia atrás
	for i := len(lines) - 1; i >= 0; i-- {
		trimmed := strings.TrimSpace(lines[i])
		
		// Si encontramos una línea que empiece con '{' y termine con '}'
		if strings.HasPrefix(trimmed, "{") && strings.HasSuffix(trimmed, "}") {
			return trimmed, nil
		}
		
		// Si encontramos un '}' (cierre de JSON multilínea)
		if strings.HasSuffix(trimmed, "}") && !strings.HasPrefix(trimmed, "{") {
			// Reconstruir hacia atrás hasta encontrar el '{'
			var jsonLines []string
			jsonLines = append(jsonLines, trimmed)
			
			for j := i - 1; j >= 0; j-- {
				line := strings.TrimSpace(lines[j])
				jsonLines = append([]string{line}, jsonLines...) // Prepend
				
				if strings.HasPrefix(line, "{") {
					// Encontramos el inicio, juntar todo
					return strings.Join(jsonLines, "\n"), nil
				}
			}
		}
	}
	
	return "", fmt.Errorf("no JSON found in output")
}

// SeedProfile creates a new profile by calling Sentinel
func (a *SentinelActivities) SeedProfile(ctx context.Context, input SeedProfileInput) (*SeedProfileResult, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("Starting profile seed activity", "alias", input.Alias, "is_master", input.IsMaster)

	// Usar sentinelPath del struct (ya existe en sentinel_launch.go)
	sentinelBin := a.sentinelPath
	if sentinelBin == "" {
		return nil, fmt.Errorf("sentinel binary path not configured")
	}

	// Build sentinel command: sentinel --json seed <alias> <is_master>
	// CRITICAL: --json flag MUST come first
	args := []string{"--json", "seed"}
	
	// Add alias as positional argument
	if input.Alias != "" {
		args = append(args, input.Alias)
	} else {
		return nil, fmt.Errorf("alias is required for seed command")
	}
	
	// Add is_master as positional boolean string
	if input.IsMaster {
		args = append(args, "true")
	} else {
		args = append(args, "false")
	}

	logger.Info("Executing sentinel command", "binary", sentinelBin, "args", args)

	// Execute sentinel with timeout
	cmdCtx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()

	cmd := exec.CommandContext(cmdCtx, sentinelBin, args...)
	output, err := cmd.CombinedOutput()

	if err != nil {
		logger.Error("Sentinel seed failed", "error", err, "output", string(output))
		return &SeedProfileResult{
			Success: false,
			Error:   fmt.Sprintf("sentinel seed failed: %v (output: %s)", err, string(output)),
		}, err
	}

	// Extract JSON from mixed log output
	jsonStr, extractErr := extractJSONFromLogs(string(output))
	if extractErr != nil {
		logger.Error("Failed to extract JSON from output", "error", extractErr, "output", string(output))
		return &SeedProfileResult{
			Success: false,
			Error:   fmt.Sprintf("JSON parse failed: %v", extractErr),
		}, fmt.Errorf("failed to extract JSON: %w", extractErr)
	}

	logger.Info("Extracted JSON from output", "json", jsonStr)

	// Parse extracted JSON
	var result SeedProfileResult
	if err := json.Unmarshal([]byte(jsonStr), &result); err != nil {
		logger.Error("Failed to parse JSON", "error", err, "json", jsonStr)
		return &SeedProfileResult{
			Success: false,
			Error:   fmt.Sprintf("invalid JSON response from sentinel: %v", err),
		}, fmt.Errorf("invalid JSON response: %w", err)
	}

	if !result.Success {
		logger.Error("Sentinel seed reported failure", "error", result.Error)
		return &result, fmt.Errorf("seed failed: %s", result.Error)
	}

	logger.Info("Profile seeded successfully", 
		"uuid", result.Data.UUID, 
		"alias", result.Data.Alias,
		"is_master", result.Data.IsMaster)

	return &result, nil
}