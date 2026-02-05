package synapse

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"go.temporal.io/sdk/activity"
)

// ============================================
// ACTIVITY: ValidateSentinelBinary
// ============================================

// ValidateSentinelBinary checks if Sentinel executable exists
func ValidateSentinelBinary(ctx context.Context) (bool, error) {
	logger := activity.GetLogger(ctx)

	sentinelPath, err := resolveSentinelPath()
	if err != nil {
		logger.Error("Failed to resolve Sentinel path", "error", err)
		return false, err
	}

	logger.Info("Checking Sentinel binary", "path", sentinelPath)

	// Check if file exists
	if _, err := os.Stat(sentinelPath); os.IsNotExist(err) {
		return false, fmt.Errorf("sentinel binary not found at: %s", sentinelPath)
	}

	logger.Info("Sentinel binary validated successfully", "path", sentinelPath)
	return true, nil
}

// ============================================
// ACTIVITY: PrepareSentinelCommand
// ============================================

// PrepareSentinelCommand builds the Sentinel command with all flags
func PrepareSentinelCommand(ctx context.Context, config *LaunchConfig) (string, error) {
	logger := activity.GetLogger(ctx)

	sentinelPath, err := resolveSentinelPath()
	if err != nil {
		return "", err
	}

	// Build command with mapped flags
	args := []string{
		"launch",
	}

	// Add profile ID as first argument if provided
	if config.ProfileID != "" {
		args = append(args, config.ProfileID)
	}

	// Map simplified flags to Sentinel overrides
	flagMappings := map[string]string{
		"account":   "override_account",
		"email":     "override_email",
		"alias":     "override_alias",
		"extension": "override_extension",
		"mode":      "override_mode",
		"role":      "override_role",
		"service":   "override_service",
		"step":      "override_step",
	}

	// Apply string flags
	configMap := map[string]string{
		"account":   config.Account,
		"email":     config.Email,
		"alias":     config.Alias,
		"extension": config.Extension,
		"mode":      config.Mode,
		"role":      config.Role,
		"service":   config.Service,
		"step":      config.Step,
	}

	for userFlag, value := range configMap {
		if value != "" {
			sentinelFlag := flagMappings[userFlag]
			args = append(args, fmt.Sprintf("--%s=%s", sentinelFlag, value))
		}
	}

	// Apply boolean flags
	if config.Heartbeat {
		args = append(args, "--heartbeat")
	}
	if config.Register {
		args = append(args, "--register")
	}
	if config.Save {
		args = append(args, "--save")
	}

	// Apply config file
	if config.ConfigFile != "" {
		args = append(args, fmt.Sprintf("--config=%s", config.ConfigFile))
	}

	cmdStr := fmt.Sprintf("%s %s", sentinelPath, strings.Join(args, " "))
	logger.Info("Prepared Sentinel command", "command", cmdStr)

	return cmdStr, nil
}

// ============================================
// ACTIVITY: ExecuteSentinel
// ============================================

// ExecuteSentinel executes Sentinel as an external process
func ExecuteSentinel(ctx context.Context, cmdStr string, config *LaunchConfig) (*SentinelExecutionResult, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("Executing Sentinel", "command", cmdStr)

	// Parse command
	parts := strings.Fields(cmdStr)
	if len(parts) == 0 {
		return nil, fmt.Errorf("empty command")
	}

	sentinelPath := parts[0]
	args := parts[1:]

	// Create command
	cmd := exec.CommandContext(ctx, sentinelPath, args...)

	// Set up output capture
	var stdout, stderr strings.Builder
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	// Send heartbeat periodically
	heartbeatTicker := time.NewTicker(10 * time.Second)
	defer heartbeatTicker.Stop()

	go func() {
		for range heartbeatTicker.C {
			activity.RecordHeartbeat(ctx, "executing")
		}
	}()

	// Execute command
	startTime := time.Now()
	err := cmd.Run()
	duration := time.Since(startTime)

	logger.Info("Sentinel execution completed",
		"duration_seconds", duration.Seconds(),
		"exit_code", cmd.ProcessState.ExitCode())

	// Build result
	result := &SentinelExecutionResult{
		Success:   err == nil,
		ExitCode:  cmd.ProcessState.ExitCode(),
		ProfileID: config.ProfileID,
	}

	if err != nil {
		result.Message = fmt.Sprintf("execution failed: %v\nstderr: %s", err, stderr.String())
		logger.Error("Sentinel execution error", "error", err, "stderr", stderr.String())
		return result, nil // Return result even on error for workflow to handle
	}

	result.Message = "execution successful"
	logger.Info("Sentinel execution successful", "stdout", stdout.String())

	return result, nil
}

// ============================================
// ACTIVITY: TrackLifecycleEvent
// ============================================

// TrackLifecycleEvent records lifecycle events for monitoring
func TrackLifecycleEvent(ctx context.Context, profileID, eventType string) error {
	logger := activity.GetLogger(ctx)
	logger.Info("Tracking lifecycle event",
		"profile_id", profileID,
		"event_type", eventType,
		"timestamp", time.Now().Unix())

	// TODO: Emit to telemetry system
	// This would integrate with core.GetTelemetryManager()

	return nil
}

// ============================================
// UTILITIES
// ============================================

// resolveSentinelPath dynamically resolves the Sentinel executable path
func resolveSentinelPath() (string, error) {
	// Get AppData directory
	var appData string

	if runtime.GOOS == "windows" {
		appData = os.Getenv("LOCALAPPDATA")
		if appData == "" {
			return "", fmt.Errorf("LOCALAPPDATA environment variable not set")
		}
	} else {
		// For non-Windows, use home directory equivalent
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("failed to get home directory: %w", err)
		}
		appData = filepath.Join(homeDir, ".local", "share")
	}

	// Build Sentinel path
	sentinelPath := filepath.Join(appData, "BloomNucleus", "bin", "sentinel", "sentinel.exe")

	// On non-Windows, remove .exe extension
	if runtime.GOOS != "windows" {
		sentinelPath = strings.TrimSuffix(sentinelPath, ".exe")
	}

	return sentinelPath, nil
}