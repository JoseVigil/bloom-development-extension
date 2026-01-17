package main

import (
	"encoding/json"
	"fmt"
	"os"
)

// BlueprintConfig representa el blueprint.json
type BlueprintConfig struct {
	Engine     EngineConfig     `json:"engine"`
	Navigation NavigationConfig `json:"navigation"`
}

type EngineConfig struct {
	Strategy string      `json:"strategy"`
	Flags    FlagsConfig `json:"flags"`
}

type FlagsConfig struct {
	Security  []string `json:"security"`
	Isolation []string `json:"isolation"`
	UX        []string `json:"ux"`
	Network   []string `json:"network"`
}

type NavigationConfig struct {
	DiscoveryURL string `json:"discovery_url"`
	LandingURL   string `json:"landing_url"`
}

// LoadBlueprint carga y valida el blueprint.json
func LoadBlueprint(path string) (*BlueprintConfig, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("cannot open blueprint: %w", err)
	}
	defer file.Close()

	var cfg BlueprintConfig
	decoder := json.NewDecoder(file)
	decoder.DisallowUnknownFields() // Validación estricta

	if err := decoder.Decode(&cfg); err != nil {
		return nil, fmt.Errorf("invalid blueprint JSON: %w", err)
	}

	// Validación de esquema básica
	if err := cfg.Validate(); err != nil {
		return nil, fmt.Errorf("blueprint validation failed: %w", err)
	}

	return &cfg, nil
}

// Validate verifica la integridad del blueprint
func (c *BlueprintConfig) Validate() error {
	if c.Engine.Strategy == "" {
		return fmt.Errorf("engine.strategy cannot be empty")
	}

	if c.Navigation.DiscoveryURL == "" {
		return fmt.Errorf("navigation.discovery_url cannot be empty")
	}

	if c.Navigation.LandingURL == "" {
		return fmt.Errorf("navigation.landing_url cannot be empty")
	}

	// Validar que al menos haya algunos flags de seguridad
	if len(c.Engine.Flags.Security) == 0 {
		return fmt.Errorf("engine.flags.security cannot be empty")
	}

	return nil
}

// GetAllFlags retorna todos los flags combinados
func (f *FlagsConfig) GetAllFlags() []string {
	flags := make([]string, 0)
	flags = append(flags, f.Security...)
	flags = append(flags, f.Isolation...)
	flags = append(flags, f.UX...)
	flags = append(flags, f.Network...)
	return flags
}