package bootstrap 

import (
	"encoding/json"
	"fmt"
	"os"
	"time"

	"nucleus/internal/core"
	"github.com/spf13/cobra"
)

func init() {
	core.RegisterCommand("TEMPORAL_SERVER", createTemporalEnsureCommand)
}

// EnsureResponse define la respuesta JSON del comando ensure
type EnsureResponse struct {
	Success  bool   `json:"success"`
	State    string `json:"state"`
	Started  bool   `json:"started"`
	PID      int    `json:"pid,omitempty"`
	GRPCPort int    `json:"grpc_port"`
	UIPort   int    `json:"ui_port"`
	UIURL    string `json:"ui_url"`
	GRPCURL  string `json:"grpc_url"`
}

func createTemporalEnsureCommand(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "ensure",
		Short: "Ensure Temporal Server is running (non-interactive, automation-safe)",
		Long: `Ensure Temporal Server is running without blocking.

This command is designed for automation (Electron/installers):
- Checks if Temporal is already running
- Starts it in background if not running
- Returns immediately (never blocks)
- Always outputs JSON

Exit codes:
  0 - Success (Temporal is running)
  1 - Failure (could not ensure Temporal is running)`,
		Args: cobra.NoArgs,
		Annotations: map[string]string{
			"category": "TEMPORAL_SERVER",
			"json_response": `{
  "success": true,
  "state": "RUNNING",
  "started": true,
  "pid": 14192,
  "grpc_port": 7233,
  "ui_port": 8233,
  "ui_url": "http://localhost:8233",
  "grpc_url": "localhost:7233"
}`,
		},
		Example: `  nucleus temporal ensure`,
		Run: func(cmd *cobra.Command, args []string) {
			runEnsure(c)
		},
	}

	return cmd
}

func runEnsure(c *core.Core) {
	// 1. Verificar si Temporal ya está corriendo
	if isPortListening(7233) {
		// Ya está corriendo
		response := EnsureResponse{
			Success:  true,
			State:    "RUNNING",
			Started:  false,
			GRPCPort: 7233,
			UIPort:   8233,
			UIURL:    "http://localhost:8233",
			GRPCURL:  "localhost:7233",
		}
		outputJSON(response)
		os.Exit(ExitSuccess)
		return
	}

	// 2. Temporal no está corriendo, iniciar en background
	temporalPath, err := getTemporalExecutablePath()
	if err != nil {
		response := EnsureResponse{
			Success:  false,
			State:    "NOT_INSTALLED",
			Started:  false,
			GRPCPort: 7233,
			UIPort:   8233,
			UIURL:    "http://localhost:8233",
			GRPCURL:  "localhost:7233",
		}
		outputJSON(response)
		os.Exit(ExitNotInstalled)
		return
	}

	// 3. Iniciar proceso desacoplado
	pid, err := startTemporalBackground(c, temporalPath)
	if err != nil {
		response := EnsureResponse{
			Success:  false,
			State:    "START_FAILED",
			Started:  false,
			GRPCPort: 7233,
			UIPort:   8233,
			UIURL:    "http://localhost:8233",
			GRPCURL:  "localhost:7233",
		}
		outputJSON(response)
		os.Exit(ExitGeneralError)
		return
	}

	// 4. Esperar brevemente a que el servidor arranque (máximo 15 segundos)
	startTime := time.Now()
	timeout := 15 * time.Second
	
	for time.Since(startTime) < timeout {
		if isPortListening(8233) {
			// UI está lista, asumir que gRPC también
			break
		}
		time.Sleep(500 * time.Millisecond)
	}

	// 5. Responder inmediatamente (incluso si no está 100% listo)
	response := EnsureResponse{
		Success:  true,
		State:    "RUNNING",
		Started:  true,
		PID:      pid,
		GRPCPort: 7233,
		UIPort:   8233,
		UIURL:    "http://localhost:8233",
		GRPCURL:  "localhost:7233",
	}
	outputJSON(response)
	os.Exit(ExitSuccess)
}

func outputJSON(v interface{}) {
	data, _ := json.MarshalIndent(v, "", "  ")
	fmt.Println(string(data))
}