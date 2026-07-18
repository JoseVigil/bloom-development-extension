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

	"github.com/google/uuid"
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
//
// NOTA 2 (sin resolver todavía, señalado y no tocado en esta pasada): este
// flujo escribe mandate.json con status "signed" directo, sin pasar por
// "draft" — distinto del flujo de create-mandate.handler.ts (TS), que
// escribe mandate_draft.json con status "draft" y espera confirmación
// aparte. Son dos comportamientos distintos para "crear standard" y no se
// tocó acá porque no fue parte de la decisión que se cerró en este turno
// (solo formato de ID + gen_state.json → mandate_state.json). Queda
// pendiente de decisión explícita aparte.
func createStandardMandate(project string) (*StandardMandateResult, error) {
	if project == "" {
		return nil, fmt.Errorf("--project es requerido")
	}

	cfg, err := supervisor.LoadNucleusConfig()
	if err != nil {
		return nil, fmt.Errorf("no pude leer nucleus.json: %w", err)
	}

	// UUID v4 plano — mismo formato que randomUUID() del lado TS
	// (create-mandate.handler.ts). Ver RESOLUCIÓN v1.1: "UUID plano, carpeta
	// sin prefijo ni punto".
	mandateID := uuid.New().String()
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
		Short: "Crea un mandate de tipo genesis (escribe mandate_state.json — el watcher dispara el build)",
		Args:  cobra.NoArgs,
		Annotations: map[string]string{
			"category": "MANDATES",
			"json_response": `{
  "success": true,
  "mandate_id": "3f9c1a2e-8b7d-4c1a-9e2f-1a2b3c4d5e6f",
  "status": "building",
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
				c.Logger.Printf("[SUCCESS] ✅ Mandate genesis en 'building': %s (el watcher lo toma automáticamente)", result.MandateID)
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

	// CAMBIO esta sesión: wiring de `domains` (list/confirm/reject) como
	// subcomando de `genesis` — ver mandate_genesis_domains_cmd.go.
	// createDomainsSubcommand no se auto-registra (Sección 9 regla 6 de la
	// Guía Maestra: los subcomandos anidados no llaman
	// core.RegisterCommand por su cuenta, solo el padre de tope lo hace,
	// que en este archivo ya es `mandate` vía init()). Sin esta línea, el
	// código de domains compila igual (Go no marca error por función de
	// paquete no invocada) pero queda inalcanzable desde el CLI — así
	// pasó en el build anterior: compiló y no apareció en `nucleus help`.
	cmd.AddCommand(createDomainsSubcommand(c))

	return cmd
}

// createGenesisMandate NO llama a Temporal directamente — escribe
// mandate_state.json y es mandate_watcher.go (fsnotify sobre
// mandate_state.json, ya no gen_state.json — ver decisión de unificación)
// quien dispara StartMandateGenesisBuildWorkflow. Esto mantiene desacoplado
// el CLI del cliente Temporal, y además hace que el CLI y la API
// (create-mandate.handler.ts) escriban exactamente el mismo archivo con la
// misma forma — ambos son entradas válidas al mismo mecanismo.
//
// gen_state.json queda deprecado — no se escribe más desde acá.
//
// NOTA sobre campos: el handler TS (create-mandate.handler.ts) escribe hoy
// un mandate_state.json más chico, solo {status, currentPhase, phases} —
// sin mandateType/project/source embebidos. Ese archivo no le alcanza al
// watcher de Go para armar GenesisBuildInput (necesita mandateType, source,
// project). Acá SÍ los embebemos. Hay que aplicar el mismo agregado del
// lado TS para que ambas entradas (CLI y API) produzcan un archivo
// consistente — lo dejo señalado, y también lo aplico en el handler TS en
// este mismo turno para no dejar la inconsistencia a mitad de camino.
func createGenesisMandate(project, source, baseGenesisID string) (*GenesisMandateResult, error) {
	if project == "" {
		return nil, fmt.Errorf("--project es requerido")
	}
	if source == "" {
		return nil, fmt.Errorf("--source es requerido")
	}

	cfg, err := supervisor.LoadNucleusConfig()
	if err != nil {
		return nil, fmt.Errorf("no pude leer nucleus.json: %w", err)
	}

	// UUID v4 plano — mismo formato que randomUUID() del lado TS.
	mandateID := uuid.New().String()
	dir := filepath.Join(cfg.MandatesRoot(), mandateID)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("no pude crear %s: %w", dir, err)
	}

	statePath := filepath.Join(dir, "mandate_state.json")
	if _, err := os.Stat(statePath); err == nil {
		// No debería poder pasar con un UUID recién generado, pero si pasa
		// es colisión real, no un mandate "ya existente" legítimo — mismo
		// criterio que MANDATE_ID_COLLISION en create-mandate.handler.ts.
		return nil, fmt.Errorf("mandate_state.json ya existe en %s — colisión de mandateId", dir)
	}

	mandateType := "genesis"
	if baseGenesisID != "" {
		mandateType = "domain_expansion"
	}

	mandateState := map[string]interface{}{
		"mandateId":     mandateID,
		"mandateType":   mandateType,
		"project":       project,
		"source":        source,
		"baseGenesisId": baseGenesisID,
		"status":        "building",
		"currentPhase":  "ingest",
		"phases": map[string]interface{}{
			"ingest":  map[string]interface{}{"status": "pending"},
			"cluster": map[string]interface{}{"status": "pending"},
			"validate": map[string]interface{}{
				"status":    "pending",
				"humanSync": map[string]interface{}{"candidateDomains": []string{}},
			},
		},
		"createdAt": time.Now().Format(time.RFC3339),
	}
	data, _ := json.MarshalIndent(mandateState, "", "  ")

	// 'wx' equivalente en Go: O_CREATE|O_EXCL falla si el archivo ya existe.
	// No debería disparar dado el chequeo de arriba, pero es la misma
	// defensa en profundidad que usa el handler TS (flag: 'wx').
	f, err := os.OpenFile(statePath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0644)
	if err != nil {
		return nil, fmt.Errorf("no pude inicializar mandate_state.json para %s: %w", mandateID, err)
	}
	defer f.Close()
	if _, err := f.Write(data); err != nil {
		return nil, fmt.Errorf("no pude escribir mandate_state.json para %s: %w", mandateID, err)
	}

	// El watcher recoge este archivo por fsnotify y dispara el workflow —
	// no hace falta notificar nada más desde acá. Si en algún momento se
	// necesita feedback inmediato hacia :4124 desde el CLI (hoy solo lo hace
	// la API vía publishMandateEvent), es una decisión aparte.

	return &GenesisMandateResult{
		Success:   true,
		MandateID: mandateID,
		Status:    "building",
		Project:   project,
	}, nil
}

// ── mandate status ───────────────────────────────────────────────────────

func mandateStatusSubcommand(c *core.Core) *cobra.Command {
	var mandateID string

	cmd := &cobra.Command{
		Use:   "status",
		Short: "Muestra el estado actual de un mandate (lee mandate.json o mandate_state.json)",
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
			// Orden: mandate.json (firmado) primero — si existe, el mandate
			// ya salió de building y ese es el estado más relevante.
			// mandate_state.json cubre building y post-firma por igual.
			// gen_state.json queda solo como fallback para mandates viejos
			// creados antes de esta migración — no se escribe más.
			for _, fname := range []string{"mandate.json", "mandate_state.json", "gen_state.json"} {
				if b, e := os.ReadFile(filepath.Join(dir, fname)); e == nil {
					if fname == "gen_state.json" {
						c.Logger.Printf("[WARN] %s usa gen_state.json (formato legado) — no se escribe más desde esta versión", mandateID)
					}
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