package persistence

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sentinel/internal/health"
)

type NucleusState struct {
	LastScan            string                 `json:"last_scan"`
	Paths               interface{}            `json:"paths"`
	Services            []health.ServiceStatus `json:"services"`
	OnboardingCompleted bool                   `json:"onboarding_completed"`
}

func SaveNucleusState(appDataDir string, report *health.HealthReport) error {
	configDir := filepath.Join(appDataDir, "config")
	os.MkdirAll(configDir, 0755)

	state := NucleusState{
		LastScan:            report.Timestamp,
		Paths:               report.SystemMap,
		Services:            report.Services,
		OnboardingCompleted: report.OnboardingCompleted,
	}

	data, _ := json.MarshalIndent(state, "", "  ")
	return os.WriteFile(filepath.Join(configDir, "nucleus.json"), data, 0644)
}