package ignition

import (
	"encoding/json"
	"fmt"
	"os"
	"sentinel/internal/core"
	"sentinel/internal/health"
	"github.com/spf13/cobra"
)

func init() {
	core.RegisterCommand("RUNTIME", func(c *core.Core) *cobra.Command {
		var mode string
		var configOverride string
		cmd := &cobra.Command{
			Use:   "launch [profile_id]",
			Short: "Arranca una instancia de navegador para un perfil",
			Args:  cobra.ExactArgs(1),
			Example: `  sentinel launch profile_001 --mode landing
  sentinel --json launch profile_002 --mode discovery | jq .
  sentinel --json launch profile_003 --mode discovery --config-override '{"register":true,"email":"user@example.com"}'`,
			Run: func(cmd *cobra.Command, args []string) {
				profileID := args[0]
				ig := New(c)
				
				chromePID, port, extLoaded, effectiveConfig, err := ig.Launch(profileID, mode, configOverride)
				if err != nil {
					if c.IsJSON {
						outputLaunchError(err)
					} else {
						c.Logger.Error("Fallo de lanzamiento: %v", err)
					}
					os.Exit(1)
				}
				
				if c.IsJSON {
					outputLaunchJSON(profileID, chromePID, port, extLoaded, effectiveConfig)
					os.Exit(0)
				}
				select {}
			},
		}
		cmd.Flags().StringVar(&mode, "mode", "landing", "Modo de lanzamiento (landing o discovery)")
		cmd.Flags().StringVar(&configOverride, "config-override", "", "JSON para sobrescribir campos en synapse.config.js")

		if cmd.Annotations == nil {
			cmd.Annotations = make(map[string]string)
		}
		cmd.Annotations["requires"] = `  - El perfil debe existir (usar 'sentinel seed' primero)
  - brain.exe disponible y ejecutable
  - Puerto 5678 libre para servicio Brain
  - Extension ID válido en ignition_spec.json
  - bloom-host.exe en bin/native/ para Native Messaging`

		return cmd
	})
}

// ========== OUTPUT FUNCTIONS ==========

func outputLaunchJSON(profileID string, chromePID, port int, extLoaded bool, effectiveConfig map[string]interface{}) {
	result := map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"profile_id":       profileID,
			"chrome_pid":       chromePID,
			"port":             port,
			"extension_loaded": extLoaded,
			"effective_config": effectiveConfig,
		},
	}
	jsonBytes, _ := json.Marshal(result)
	fmt.Println(string(jsonBytes))
}

func outputLaunchError(err error) {
	result := map[string]interface{}{
		"success": false,
		"error":   err.Error(),
	}
	jsonBytes, _ := json.Marshal(result)
	fmt.Println(string(jsonBytes))
}

// ========== TYPE DEFINITIONS ==========

type IgnitionSpec struct {
	Engine struct {
		Executable string `json:"executable"`
		Type       string `json:"type"`
	} `json:"engine"`
	EngineFlags []string `json:"engine_flags"`
	Paths       struct {
		Extension string `json:"extension"`
		LogsBase  string `json:"logs_base"`
		UserData  string `json:"user_data"`
	} `json:"paths"`
	TargetURL   string   `json:"target_url"`
	CustomFlags []string `json:"custom_flags"`
	LaunchID    string   `json:"launch_id"`
	ProfileID   string   `json:"profile_id"`
}

type LaunchResponse struct {
	Status string `json:"status"`
	Data   struct {
		ProfileID string `json:"profile_id"`
		Launch struct {
			LaunchID string `json:"launch_id"`
			PID      int    `json:"pid"`
		} `json:"launch"`
		LogFiles struct {
			DebugLog string `json:"debug_log"`
			NetLog   string `json:"net_log"`
		} `json:"log_files"`
	} `json:"data"`
}

type Ignition struct {
	Core      *core.Core
	Guardians map[string]*health.GuardianInstance
	SpecPath  string
	Session   struct {
		ServicePID int
		BrowserPID int
		LaunchID   string
	}
}

func New(c *core.Core) *Ignition {
	return &Ignition{
		Core:      c,
		Guardians: make(map[string]*health.GuardianInstance),
	}
}