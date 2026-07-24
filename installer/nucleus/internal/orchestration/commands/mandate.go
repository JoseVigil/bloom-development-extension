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
	var docs []string

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
  nucleus mandate create --project my-app --docs ./README.md --docs ./docs/architecture.md
  nucleus --json mandate create --project my-app`,

		Run: func(cmd *cobra.Command, args []string) {
			result, err := createStandardMandate(project, docs)
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
	cmd.Flags().StringSliceVar(&docs, "docs", nil, "Path a un archivo o carpeta de documentación (repetible) — Capa 0 del Bootstrap Strategy")
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
//
// NOTA 3 — CAMBIO esta sesión (Tarea 3, Capa 0 del Bootstrap Strategy):
// docs es la lista de paths que vino de --docs (repetible, aprobado). Cada
// path puede ser un archivo o una carpeta — si es carpeta, se copian todos
// los archivos regulares de primer nivel (no recursivo: no hay decisión
// tomada sobre si subcarpetas de docs/ deberían aplanarse o preservarse, y
// no la invento acá). Se persisten en {mandatesRoot}/{mandateID}/docs/, y
// los nombres resultantes (no los paths originales del filesystem del
// usuario, que pueden no tener sentido para Capa 1) quedan en
// mandate.json como "docsProvided" — el campo nuevo que pediste, para que
// Capa 1 lo pueda leer el día que exista, sin acoplarla a rutas absolutas
// del cliente que la creó.
func createStandardMandate(project string, docs []string) (*StandardMandateResult, error) {
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

	docsProvided, err := copyDocsInto(dir, docs)
	if err != nil {
		// Falla dura, no silenciosa: si el usuario pidió --docs y no se
		// pudieron copiar, mejor que el mandate no se cree a que se cree
		// silenciosamente sin la documentación que se supone que lo
		// alimenta (mismo criterio que ya usamos contra degradar sin
		// avisar en otras partes de esta sesión).
		return nil, fmt.Errorf("no pude persistir la documentación de --docs: %w", err)
	}

	payload := map[string]interface{}{
		"mandateId":    mandateID,
		"type":         "standard",
		"project":      project,
		"status":       "signed",
		"signedAt":     time.Now().Format(time.RFC3339),
		"docsProvided": docsProvided, // CAMPO NUEVO esta sesión — [] si no se pasó --docs
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

// copyDocsInto copia cada path de docs (archivo o carpeta, primer nivel
// solamente) a {dir}/docs/, y devuelve los nombres de archivo resultantes
// (relativos a docs/, no los paths originales). Ruta aprobada esta sesión:
// {mandatesRoot}/{mandateID}/docs/ — layout plano, mismo criterio que
// mandate.json/mandate_state.json/domain_proposal.json.
func copyDocsInto(mandateDir string, docs []string) ([]string, error) {
	if len(docs) == 0 {
		return []string{}, nil
	}

	docsDir := filepath.Join(mandateDir, "docs")
	if err := os.MkdirAll(docsDir, 0755); err != nil {
		return nil, fmt.Errorf("no pude crear %s: %w", docsDir, err)
	}

	var copied []string
	seen := make(map[string]bool) // detecta colisión de nombre de archivo

	copyOne := func(srcPath string) error {
		info, err := os.Stat(srcPath)
		if err != nil {
			return fmt.Errorf("no pude leer %s: %w", srcPath, err)
		}
		name := filepath.Base(srcPath)
		if seen[name] {
			// Colisión explícita, no silenciosa — dos archivos de origen
			// distinto con el mismo nombre base (p. ej. dos README.md de
			// carpetas distintas pasados como --docs separados). No se
			// inventa un esquema de renombrado automático acá.
			return fmt.Errorf("colisión de nombre de archivo en --docs: %q ya fue copiado desde otro path", name)
		}

		data, err := os.ReadFile(srcPath)
		if err != nil {
			return fmt.Errorf("no pude leer %s: %w", srcPath, err)
		}
		if err := os.WriteFile(filepath.Join(docsDir, name), data, 0644); err != nil {
			return fmt.Errorf("no pude escribir %s en docs/: %w", name, err)
		}
		seen[name] = true
		copied = append(copied, name)
		_ = info
		return nil
	}

	for _, path := range docs {
		info, err := os.Stat(path)
		if err != nil {
			return nil, fmt.Errorf("--docs %q no existe o no es accesible: %w", path, err)
		}
		if !info.IsDir() {
			if err := copyOne(path); err != nil {
				return nil, err
			}
			continue
		}
		// Carpeta: solo primer nivel, solo archivos regulares — ver NOTA 3
		// arriba sobre por qué no es recursivo.
		entries, err := os.ReadDir(path)
		if err != nil {
			return nil, fmt.Errorf("no pude leer carpeta --docs %q: %w", path, err)
		}
		for _, e := range entries {
			if e.IsDir() {
				continue
			}
			if err := copyOne(filepath.Join(path, e.Name())); err != nil {
				return nil, err
			}
		}
	}

	if copied == nil {
		copied = []string{}
	}
	return copied, nil
}

// ── mandate genesis create ───────────────────────────────────────────────

func createGenesisMandateSubcommand(c *core.Core) *cobra.Command {
	var project, source, baseGenesisID string
	var docs []string

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
  nucleus mandate genesis --project my-app --source cli --docs ./README.md --docs ./docs/architecture.md
  nucleus --json mandate genesis --project my-app --source cli`,

		Run: func(cmd *cobra.Command, args []string) {
			result, err := createGenesisMandate(project, source, baseGenesisID, docs)
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
	cmd.Flags().StringSliceVar(&docs, "docs", nil, "Path a un archivo o carpeta de documentación (repetible) — Capa 0 del Bootstrap Strategy")
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
//
// CAMBIO esta sesión (corrección de turno anterior): --docs vive ACÁ, no en
// mandate create (standard). Confirmado por Preludio §2.2: onboarding pega
// contra este comando — mandate genesis, no mandate create. Reusa
// copyDocsInto, ya definida en este mismo archivo para mandate create; el
// turno anterior la implementó ahí por una identificación incorrecta de
// cuál comando invoca onboarding, corregida ahora.
func createGenesisMandate(project, source, baseGenesisID string, docs []string) (*GenesisMandateResult, error) {
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

	docsProvided, err := copyDocsInto(dir, docs)
	if err != nil {
		// Mismo criterio que en mandate create: falla dura, no silenciosa.
		// Si --docs se pidió y no se pudo persistir, mejor no crear el
		// genesis a que arranque Fase 1 sin la documentación que se
		// supone que la alimenta el día que Capa 1 exista.
		return nil, fmt.Errorf("no pude persistir la documentación de --docs: %w", err)
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
		"createdAt":    time.Now().Format(time.RFC3339),
		"docsProvided": docsProvided, // CAMPO NUEVO esta sesión — [] si no se pasó --docs
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