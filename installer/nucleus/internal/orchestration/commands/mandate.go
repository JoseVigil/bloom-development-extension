// internal/orchestration/commands/mandate.go
package commands

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"nucleus/internal/core"
	"nucleus/internal/supervisor"

	"github.com/spf13/cobra"
)

func init() {
	core.RegisterCommand("MANDATES", createMandateCommand)
}

func createMandateCommand(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "mandate",
		Short: "Gestiona mandates (standard, genesis, domain_expansion)",
		Annotations: map[string]string{
			"category": "MANDATES",
		},
	}

	cmd.AddCommand(createStandardMandateSubcommand(c))
	cmd.AddCommand(createGenesisMandateSubcommand(c))
	cmd.AddCommand(mandateStatusSubcommand(c))

	return cmd
}

// ── tipos de resultado ──────────────────────────────────────────────────

type StandardMandateResult struct {
	Success   bool   `json:"success"`
	MandateID string `json:"mandate_id"`
	Status    string `json:"status"`
	Project   string `json:"project"`
	Error     string `json:"error,omitempty"`
}

type GenesisMandateResult struct {
	Success   bool   `json:"success"`
	MandateID string `json:"mandate_id"`
	Status    string `json:"status"`
	Project   string `json:"project"`
	Error     string `json:"error,omitempty"`
}

// ── mandate create (standard) ────────────────────────────────────────────

func createStandardMandateSubcommand(c *core.Core) *cobra.Command {
	var project string

	cmd := &cobra.Command{
		Use:   "create",
		Short: "Crea un mandate standard (draft → firmado por confirmación explícita)",
		Args:  cobra.NoArgs,
		Annotations: map[string]string{
			"category": "MANDATES",
			"json_response": `{
  "success": true,
  "mandate_id": "mandate_abc123",
  "status": "signed",
  "project": "example-project"
}`,
		},
		Example: `  nucleus mandate create --project my-app
  nucleus --json mandate create --project my-app`,

		Run: func(cmd *cobra.Command, args []string) {
			result, err := createStandardMandate(project)
			if err != nil {
				result = &StandardMandateResult{Success: false, Error: err.Error()}
			}

			if c.IsJSON {
				data, _ := json.MarshalIndent(result, "", "  ")
				fmt.Println(string(data))
			} else if result.Success {
				c.Logger.Printf("[SUCCESS] ✅ Mandate creado y firmado: %s", result.MandateID)
			} else {
				c.Logger.Printf("[ERROR] ❌ No se pudo crear el mandate: %s", result.Error)
			}
			if !result.Success {
				os.Exit(1)
			}
		},
	}
	cmd.Flags().StringVar(&project, "project", "", "Nombre del proyecto (requerido)")
	return cmd
}

// createStandardMandate escribe mandate.json firmado en .mandates/{id}/.
// NOTA: esto NO dispara MandateExecutionWorkflow todavía — esa fase (Fase 4)
// es un placeholder (ver mandate_execution_workflow.go). Cuando esté real,
// esta función debe instanciar temporal.Client y llamarlo acá.
func createStandardMandate(project string) (*StandardMandateResult, error) {
	if project == "" {
		return nil, fmt.Errorf("--project es requerido")
	}

	cfg, err := supervisor.LoadNucleusConfig()
	if err != nil {
		return nil, fmt.Errorf("no pude leer nucleus.json: %w", err)
	}

	mandateID := fmt.Sprintf("mandate_%d", time.Now().UnixNano())
	dir := filepath.Join(cfg.MandatesRoot(), mandateID)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("no pude crear %s: %w", dir, err)
	}

	payload := map[string]interface{}{
		"mandateId": mandateID,
		"type":      "standard",
		"project":   project,
		"status":    "signed",
		"signedAt":  time.Now().Format(time.RFC3339),
	}
	data, _ := json.MarshalIndent(payload, "", "  ")
	if err := os.WriteFile(filepath.Join(dir, "mandate.json"), data, 0644); err != nil {
		return nil, fmt.Errorf("no pude escribir mandate.json: %w", err)
	}

	return &StandardMandateResult{
		Success:   true,
		MandateID: mandateID,
		Status:    "signed",
		Project:   project,
	}, nil
}

// ── mandate genesis create ───────────────────────────────────────────────

func createGenesisMandateSubcommand(c *core.Core) *cobra.Command {
	var project, source, baseGenesisID string

	cmd := &cobra.Command{
		Use:   "genesis",
		Short: "Crea un mandate de tipo genesis (escribe gen_state.json — el watcher dispara el build)",
		Args:  cobra.NoArgs,
		Annotations: map[string]string{
			"category": "MANDATES",
			"json_response": `{
  "success": true,
  "mandate_id": "mandate_xyz789",
  "status": "queued",
  "project": "example-project"
}`,
		},
		Example: `  nucleus mandate genesis --project my-app --source cli
  nucleus --json mandate genesis --project my-app --source cli`,

		Run: func(cmd *cobra.Command, args []string) {
			result, err := createGenesisMandate(project, source, baseGenesisID)
			if err != nil {
				result = &GenesisMandateResult{Success: false, Error: err.Error()}
			}

			if c.IsJSON {
				data, _ := json.MarshalIndent(result, "", "  ")
				fmt.Println(string(data))
			} else if result.Success {
				c.Logger.Printf("[SUCCESS] ✅ Mandate genesis encolado: %s (el watcher lo toma automáticamente)", result.MandateID)
			} else {
				c.Logger.Printf("[ERROR] ❌ No se pudo crear el mandate genesis: %s", result.Error)
			}
			if !result.Success {
				os.Exit(1)
			}
		},
	}
	cmd.Flags().StringVar(&project, "project", "", "Nombre del proyecto (requerido)")
	cmd.Flags().StringVar(&source, "source", "cli", "Origen del mandate")
	cmd.Flags().StringVar(&baseGenesisID, "base-genesis-id", "", "ID de genesis base (opcional)")
	return cmd
}

// createGenesisMandate NO llama a Temporal directamente — escribe gen_state.json
// y es mandate_watcher.go (fsnotify) quien dispara StartMandateGenesisBuildWorkflow.
// Esto mantiene desacoplado el CLI del cliente Temporal, igual que el diseño
// original de la Guía (el "vigilante" es el único punto de entrada al workflow).
func createGenesisMandate(project, source, baseGenesisID string) (*GenesisMandateResult, error) {
	if project == "" {
		return nil, fmt.Errorf("--project es requerido")
	}

	cfg, err := supervisor.LoadNucleusConfig()
	if err != nil {
		return nil, fmt.Errorf("no pude leer nucleus.json: %w", err)
	}

	mandateID := fmt.Sprintf("mandate_%d", time.Now().UnixNano())
	dir := filepath.Join(cfg.MandatesRoot(), mandateID)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("no pude crear %s: %w", dir, err)
	}

	genState := map[string]interface{}{
		"mandateId":     mandateID,
		"mandateType":   "genesis",
		"baseGenesisId": baseGenesisID,
		"source":        source,
		"project":       project,
		"status":        "queued",
		"currentPhase":  "ingest",
	}
	data, _ := json.MarshalIndent(genState, "", "  ")
	if err := os.WriteFile(filepath.Join(dir, "gen_state.json"), data, 0644); err != nil {
		return nil, fmt.Errorf("no pude escribir gen_state.json: %w", err)
	}

	return &GenesisMandateResult{
		Success:   true,
		MandateID: mandateID,
		Status:    "queued",
		Project:   project,
	}, nil
}

// ── mandate status ───────────────────────────────────────────────────────

func mandateStatusSubcommand(c *core.Core) *cobra.Command {
	var mandateID string

	cmd := &cobra.Command{
		Use:   "status",
		Short: "Muestra el estado actual de un mandate (lee mandate.json o gen_state.json)",
		Args:  cobra.NoArgs,
		Annotations: map[string]string{
			"category": "MANDATES",
		},
		Example: `  nucleus mandate status --id mandate_abc123`,

		Run: func(cmd *cobra.Command, args []string) {
			if mandateID == "" {
				msg := "--id es requerido"
				if c.IsJSON {
					data, _ := json.MarshalIndent(map[string]interface{}{"success": false, "error": msg}, "", "  ")
					fmt.Println(string(data))
				} else {
					c.Logger.Printf("[ERROR] %s", msg)
				}
				os.Exit(1)
			}

			cfg, err := supervisor.LoadNucleusConfig()
			if err != nil {
				c.Logger.Printf("[ERROR] %v", err)
				os.Exit(1)
			}

			dir := filepath.Join(cfg.MandatesRoot(), mandateID)
			var raw []byte
			for _, fname := range []string{"gen_state.json", "mandate.json"} {
				if b, e := os.ReadFile(filepath.Join(dir, fname)); e == nil {
					raw = b
					break
				}
			}
			if raw == nil {
				msg := fmt.Sprintf("mandate no encontrado: %s", mandateID)
				if c.IsJSON {
					data, _ := json.MarshalIndent(map[string]interface{}{"success": false, "error": msg}, "", "  ")
					fmt.Println(string(data))
				} else {
					c.Logger.Printf("[ERROR] %s", msg)
				}
				os.Exit(1)
			}

			if c.IsJSON {
				fmt.Println(string(raw))
			} else {
				c.Logger.Printf("[INFO] %s", string(raw))
			}
		},
	}
	cmd.Flags().StringVar(&mandateID, "id", "", "ID del mandate (requerido)")
	return cmd
}