// internal/orchestration/commands/mandate_genesis_domains_cmd.go
package commands

import (
	"encoding/json"
	"fmt"
	"os"
	"os/user"
	"path/filepath"
	"time"

	"nucleus/internal/core"
	"nucleus/internal/governance"
	"nucleus/internal/supervisor"

	"github.com/spf13/cobra"
)

// ─────────────────────────────────────────────────────────────────────────
// CAMBIO esta sesión: homologación contra Guía Maestra de Implementación
// Comandos NUCLEUS v2.0, variante ANIDADA confirmada (no comando de
// tope). Reemplaza el turno anterior en cuatro puntos:
//
// 1) REGISTRO: `domains` es subcomando de `mandate genesis`, no de tope
//    — por Sección 9 regla 6 ("NO registrar subcomandos individualmente
//    en init()"), este archivo NO tiene init()/RegisterCommand. Se
//    acepta el acoplamiento de una línea en mandate.go (patrón normal de
//    la Sección 9 para subcomandos anidados, confirmado explícitamente
//    esta sesión — no es la dependencia cruzada que prohíbe la Sección
//    4.5, porque no es configuración externa: es el mismo padre
//    agregando su propio hijo). Wiring exacto requerido, sin cambios
//    respecto al turno original:
//
//      cmd.AddCommand(createDomainsSubcommand(c))
//
//    dentro de createGenesisMandateSubcommand en mandate.go, después de
//    los StringVar de flags y antes de `return cmd`.
//
// 2) ANNOTATIONS: category + json_response en cada subcomando
//    (list/confirm/reject), más category en el padre (Sección 9 reglas
//    2 y 3). Se agregan Long y Example (checklist 8.2).
//
// 3) CONVENCIÓN JSON/LOGGING — CORREGIDO esta sesión tras build real
//    (nucleus_build.log, build #48, 2026-07-17): el turno anterior siguió
//    al pie de la letra la Sección 5.2/8.5 de la guía (`c.Config.OutputJSON`,
//    `c.OutputJSON(...)`, `c.Logger.Success/Info/Warn`) y NO COMPILÓ —
//    el compilador confirma que `core.Core` real no tiene esos miembros:
//
//      c.Config es map[string]interface{} (sin campo OutputJSON)
//      core.Core no tiene método OutputJSON(...)
//      c.Logger es *log.Logger de la librería estándar (solo
//        Printf/Print/Println/Fatal/Panic — sin niveles Info/Warn/Success/Error)
//
//    Es decir: la Sección 5.2/8.5 de la guía documenta una API
//    aspiracional que no coincide con el core.Core real de este build.
//    Se revierte a lo que el compilador confirma que existe — mismo
//    patrón que ya usaba el archivo original antes de esta ronda de
//    cambios: `c.IsJSON` (bool) y `c.Logger.Printf("[NIVEL] ...")`. El
//    struct `Response` se mantiene como forma estándar de payload JSON
//    (esa parte no depende de métodos de core.Core, solo de
//    json.MarshalIndent + fmt.Println, que sí compilan). ESTO ES UN GAP
//    EN LA GUÍA, no en este archivo — Sección 5.2/8.5 deberían
//    corregirse para reflejar la firma real de core.Core, o core.Core
//    debería implementarse como la guía dice. No se decide acá cuál de
//    las dos partes está "mal" — se documenta la discrepancia y se
//    prioriza que el código compile contra la realidad del repo.
//
// 4) AUTORIZACIÓN (Sección 7.1: "Verificar roles antes de ejecutar
//    operaciones sensibles — governance.RequireMaster() al inicio del
//    Run"): se agrega a `confirm`, por default, porque es la operación
//    que efectivamente destraba Fase 4 (scaffold real) al escribir
//    confirmedDomainIds — es la acción "sensible" del grupo. `list` es
//    de solo lectura y no la requiere. `reject` hoy no persiste ningún
//    efecto real (ver su propio comentario más abajo), así que tampoco
//    se le exige rol. NO CONFIRMADO contra build real (el log de errores
//    no llega a esa línea — "too many errors" corta antes) — si
//    `governance.RequireMaster` tampoco existe con esa firma, va a
//    aparecer en el próximo build y hay que corregirlo igual que los
//    puntos de arriba.
// ─────────────────────────────────────────────────────────────────────────

// Response es la forma estándar de salida JSON documentada en la Sección
// 5.2 de la guía. Se declara acá porque no está confirmado que
// core.Response ya exista como tipo compartido — si existe, este tipo
// debe eliminarse y reemplazarse por el de core para no duplicar shape.
type Response struct {
	Success bool        `json:"success"`
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}

// domainCandidateJSON espeja DomainCandidate (gen-state.types.ts) para
// lectura/escritura desde este comando. Mismo shape que
// activities.DomainCandidateState (mandate_genesis_activities.go) —
// duplicado deliberadamente acá para no crear una dependencia cruzada
// entre el paquete commands y el paquete activities solo por un struct de
// datos; si en algún momento se decide compartirlo, hay que moverlo a un
// paquete común (p. ej. internal/mandates) y actualizar ambos imports.
type domainCandidateJSON struct {
	DomainID             string   `json:"domainId"`
	Name                 string   `json:"name"`
	CohesionScore        float64  `json:"cohesionScore"`
	SuggestedActionCount int      `json:"suggestedActionCount"`
	OverlapsWithExisting string   `json:"overlapsWithExisting,omitempty"`
	DependsOn            []string `json:"dependsOn,omitempty"` // D-3
}

type humanSyncJSON struct {
	CandidateDomains   []domainCandidateJSON `json:"candidateDomains"`
	ConfirmedDomainIds []string              `json:"confirmedDomainIds,omitempty"`
	ConfirmedAt        string                `json:"confirmedAt,omitempty"`
	ConfirmedBy        string                `json:"confirmedBy,omitempty"` // D-9
}

type validatePhaseJSON struct {
	Status    string        `json:"status"`
	HumanSync humanSyncJSON `json:"humanSync"`
}

// mandateStateDoc es la porción de mandate_state.json que este comando
// necesita leer/escribir. Se preserva el resto del documento tal cual
// (ver readRawState/writeRawState) para no pisar campos que otros
// escritores (mandate_watcher.go, Brain) ya hayan puesto ahí.
type mandateStateDoc struct {
	MandateID    string `json:"mandateId"`
	CurrentPhase string `json:"currentPhase"`
	Phases       struct {
		Validate validatePhaseJSON `json:"validate"`
	} `json:"phases"`
}

// createDomainsSubcommand NO se auto-registra (sin init()/RegisterCommand)
// — es subcomando de `mandate genesis`, ver nota (1) en la cabecera del
// archivo sobre el wiring de una línea requerido en mandate.go.
func createDomainsSubcommand(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "domains",
		Short: "Gestiona el Human Sync Point de un mandate genesis (list/confirm/reject)",
		Long: `Gestiona la Fase 3 (Human Sync Point) del pipeline de mandate genesis.

Después de que Brain propone dominios candidatos en Fase 2 (dry_run,
domain_proposal.json), un humano debe revisar y confirmar cuáles pasan a
Fase 4 (scaffold real). Este comando expone esa revisión desde CLI:

  list     Lista los dominios candidatos guardados en mandate_state.json
  confirm  Confirma los dominios que avanzan a Fase 4
  reject   Marca un dominio como no incluido (informativo, ver su --help)

Todas las subacciones leen/escriben phases.validate.humanSync dentro de
mandate_state.json, preservando el resto del documento intacto.`,
		Annotations: map[string]string{
			"category": "MANDATES",
		},
	}
	cmd.AddCommand(createDomainsListSubcommand(c))
	cmd.AddCommand(createDomainsConfirmSubcommand(c))
	cmd.AddCommand(createDomainsRejectSubcommand(c))
	return cmd
}

func createDomainsListSubcommand(c *core.Core) *cobra.Command {
	var mandateID string
	cmd := &cobra.Command{
		Use:   "list",
		Short: "Lista los dominios candidatos detectados por Brain (Fase 2)",
		Long: `Lee phases.validate.humanSync.candidateDomains de mandate_state.json
y muestra cada dominio candidato con su domainId, nombre, score de
cohesión y dependencias (si Brain las detectó vía D-3).

No modifica estado — es una operación de solo lectura.`,
		Args: cobra.NoArgs,
		Annotations: map[string]string{
			"category": "MANDATES",
			"json_response": `{
  "success": true,
  "data": [
    {
      "domainId": "dom_billing_a3f1",
      "name": "Billing",
      "cohesionScore": 1.0,
      "suggestedActionCount": 1,
      "dependsOn": []
    }
  ]
}`,
		},
		Example: `  nucleus mandate genesis domains list --id mnd_abc123
  nucleus --json mandate genesis domains list --id mnd_abc123`,
		Run: func(cmd *cobra.Command, args []string) {
			state, _, err := readMandateState(mandateID)
			if err != nil {
				fail(c, err)
				return
			}
			out := state.Phases.Validate.HumanSync.CandidateDomains

			if c.IsJSON {
				data, _ := json.MarshalIndent(Response{Success: true, Data: out}, "", "  ")
				fmt.Println(string(data))
				return
			}

			for _, cand := range out {
				dep := ""
				if len(cand.DependsOn) > 0 {
					dep = fmt.Sprintf(" (depende de: %v)", cand.DependsOn)
				}
				c.Logger.Printf("[INFO] %s — %s (cohesión %.2f)%s", cand.DomainID, cand.Name, cand.CohesionScore, dep)
			}
		},
	}
	cmd.Flags().StringVar(&mandateID, "id", "", "ID del mandate (requerido)")
	return cmd
}

func createDomainsConfirmSubcommand(c *core.Core) *cobra.Command {
	var mandateID string
	var domainIDs []string
	cmd := &cobra.Command{
		Use:   "confirm",
		Short: "Confirma los dominios candidatos que pasan a Fase 4 (Human Sync Point)",
		Long: `Marca uno o más domainId como confirmados en
phases.validate.humanSync dentro de mandate_state.json: escribe
confirmedDomainIds, confirmedAt y confirmedBy (D-9).

Requiere que el mandate esté en currentPhase="validate" — falla explícito
si no lo está, en vez de sobrescribir un estado inconsistente.

confirmedBy usa la identidad del usuario del sistema operativo
(os/user.Current()) como fuente de "quién confirmó" — cubre el path CLI
únicamente. El path HTTP/API tiene su propio mecanismo de sesión
pendiente, no compartido con este comando.`,
		Args: cobra.NoArgs,
		Annotations: map[string]string{
			"category": "MANDATES",
			"json_response": `{
  "success": true,
  "data": {
    "mandateId": "mnd_abc123",
    "confirmedDomainIds": ["dom_billing_a3f1"],
    "confirmedBy": "jdoe"
  }
}`,
		},
		Example: `  nucleus mandate genesis domains confirm --id mnd_abc123 --domain-id dom_billing_a3f1
  nucleus mandate genesis domains confirm --id mnd_abc123 --domain-id dom_billing_a3f1 --domain-id dom_auth_7c2e
  nucleus --json mandate genesis domains confirm --id mnd_abc123 --domain-id dom_billing_a3f1`,
		Run: func(cmd *cobra.Command, args []string) {
			// Sección 7.1: operación sensible — destraba Fase 4 (scaffold
			// real) al escribir confirmedDomainIds. Se exige rol Master
			// antes de cualquier lectura/escritura.
			if err := governance.RequireMaster(c); err != nil {
				fail(c, fmt.Errorf("mandate genesis domains confirm requiere rol Master: %w", err))
				return
			}

			state, raw, err := readMandateState(mandateID)
			if err != nil {
				fail(c, err)
				return
			}
			if state.CurrentPhase != "validate" {
				fail(c, fmt.Errorf("mandate %s no está en fase 'validate' (está en %q) — nada que confirmar", mandateID, state.CurrentPhase))
				return
			}

			byID := make(map[string]domainCandidateJSON, len(state.Phases.Validate.HumanSync.CandidateDomains))
			for _, cand := range state.Phases.Validate.HumanSync.CandidateDomains {
				byID[cand.DomainID] = cand
			}
			for _, id := range domainIDs {
				if _, ok := byID[id]; !ok {
					fail(c, fmt.Errorf("domainId %q no existe entre los candidatos de %s", id, mandateID))
					return
				}
			}
			if len(domainIDs) == 0 {
				fail(c, fmt.Errorf("--domain-id es requerido (al menos uno)"))
				return
			}

			// D-9: identidad interina vía usuario del SO. Ver nota de
			// alcance al inicio del archivo — esto NO cubre el path HTTP.
			confirmedBy := "unknown"
			if u, err := user.Current(); err == nil && u.Username != "" {
				confirmedBy = u.Username
			} else {
				c.Logger.Printf("[WARN] no pude resolver el usuario del SO (%v) — confirmedBy queda como %q", err, confirmedBy)
			}

			state.Phases.Validate.HumanSync.ConfirmedDomainIds = domainIDs
			state.Phases.Validate.HumanSync.ConfirmedAt = time.Now().Format(time.RFC3339)
			state.Phases.Validate.HumanSync.ConfirmedBy = confirmedBy

			if err := writeMandateStateValidate(mandateID, raw, state.Phases.Validate); err != nil {
				fail(c, err)
				return
			}

			data := map[string]interface{}{
				"mandateId":          mandateID,
				"confirmedDomainIds": domainIDs,
				"confirmedBy":        confirmedBy,
			}

			if c.IsJSON {
				out, _ := json.MarshalIndent(Response{Success: true, Data: data}, "", "  ")
				fmt.Println(string(out))
				return
			}

			c.Logger.Printf("[SUCCESS] ✅ %d dominio(s) confirmado(s) por %s para mandate %s", len(domainIDs), confirmedBy, mandateID)
		},
	}
	cmd.Flags().StringVar(&mandateID, "id", "", "ID del mandate (requerido)")
	cmd.Flags().StringSliceVar(&domainIDs, "domain-id", nil, "domainId a confirmar (repetible)")
	return cmd
}

func createDomainsRejectSubcommand(c *core.Core) *cobra.Command {
	var mandateID string
	var domainID string
	cmd := &cobra.Command{
		Use:   "reject",
		Short: "Rechaza un dominio candidato (no pasa a Fase 4)",
		Long: `Implementación deliberadamente mínima: hoy "rechazar" solo significa
"no incluir ese domainId en el próximo 'confirm'" — no existe todavía un
estado persistido de "rechazado" distinto de "nunca confirmado", porque
eso depende de decisiones de UI que no están cerradas (ver
BTIPS_UI_Contract). El subcomando queda registrado para que la superficie
de CLI coincida con el contrato (§4), pero no simula un efecto que no
tiene: no escribe nada en mandate_state.json.`,
		Args: cobra.NoArgs,
		Annotations: map[string]string{
			"category": "MANDATES",
			"json_response": `{
  "success": true,
  "message": "'reject' no persiste estado propio todavía — simplemente no incluyas ese domainId en 'confirm'"
}`,
		},
		Example: `  nucleus mandate genesis domains reject --id mnd_abc123 --domain-id dom_billing_a3f1
  nucleus --json mandate genesis domains reject --id mnd_abc123 --domain-id dom_billing_a3f1`,
		Run: func(cmd *cobra.Command, args []string) {
			msg := fmt.Sprintf("'reject' no persiste estado propio todavía — simplemente no incluyas %q en 'mandate genesis domains confirm'", domainID)

			if c.IsJSON {
				data, _ := json.MarshalIndent(Response{Success: true, Message: msg}, "", "  ")
				fmt.Println(string(data))
				return
			}

			c.Logger.Printf("[INFO] %s", msg)
			_ = mandateID
		},
	}
	cmd.Flags().StringVar(&mandateID, "id", "", "ID del mandate (requerido)")
	cmd.Flags().StringVar(&domainID, "domain-id", "", "domainId a rechazar (informativo)")
	return cmd
}

// readMandateState lee mandate_state.json y devuelve tanto el struct
// tipado (para lo que este comando necesita) como el mapa crudo completo
// (para preservar campos que no modelamos acá al reescribir).
func readMandateState(mandateID string) (mandateStateDoc, map[string]interface{}, error) {
	if mandateID == "" {
		return mandateStateDoc{}, nil, fmt.Errorf("--id es requerido")
	}
	cfg, err := supervisor.LoadNucleusConfig()
	if err != nil {
		return mandateStateDoc{}, nil, fmt.Errorf("no pude leer nucleus.json: %w", err)
	}
	path := filepath.Join(cfg.MandatesRoot(), mandateID, "mandate_state.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		return mandateStateDoc{}, nil, fmt.Errorf("no pude leer mandate_state.json de %s: %w", mandateID, err)
	}

	var typed mandateStateDoc
	if err := json.Unmarshal(raw, &typed); err != nil {
		return mandateStateDoc{}, nil, fmt.Errorf("mandate_state.json inválido para %s: %w", mandateID, err)
	}

	var rawMap map[string]interface{}
	if err := json.Unmarshal(raw, &rawMap); err != nil {
		return mandateStateDoc{}, nil, fmt.Errorf("mandate_state.json inválido para %s: %w", mandateID, err)
	}

	return typed, rawMap, nil
}

// writeMandateStateValidate reescribe solo phases.validate.humanSync dentro
// del documento crudo ya leído, preservando todo lo demás tal cual estaba
// (ingest/cluster, mandateType, source, etc. — este comando no es dueño de
// esos campos).
func writeMandateStateValidate(mandateID string, rawMap map[string]interface{}, validate validatePhaseJSON) error {
	cfg, err := supervisor.LoadNucleusConfig()
	if err != nil {
		return fmt.Errorf("no pude leer nucleus.json: %w", err)
	}

	validateBytes, err := json.Marshal(validate)
	if err != nil {
		return fmt.Errorf("no pude serializar phases.validate: %w", err)
	}
	var validateMap map[string]interface{}
	if err := json.Unmarshal(validateBytes, &validateMap); err != nil {
		return err
	}

	phases, ok := rawMap["phases"].(map[string]interface{})
	if !ok {
		phases = map[string]interface{}{}
	}
	phases["validate"] = validateMap
	rawMap["phases"] = phases

	data, err := json.MarshalIndent(rawMap, "", "  ")
	if err != nil {
		return fmt.Errorf("no pude serializar mandate_state.json: %w", err)
	}

	path := filepath.Join(cfg.MandatesRoot(), mandateID, "mandate_state.json")
	if err := os.WriteFile(path, data, 0644); err != nil {
		return fmt.Errorf("no pude escribir mandate_state.json de %s: %w", mandateID, err)
	}
	return nil
}

// fail centraliza el camino de error: responde en el formato estándar
// (Response{Success:false, Error:...}) si --json está activo, o loguea
// vía c.Logger.Printf si no, y termina el proceso con código 1.
func fail(c *core.Core, err error) {
	if c.IsJSON {
		data, _ := json.MarshalIndent(Response{Success: false, Error: err.Error()}, "", "  ")
		fmt.Println(string(data))
	} else {
		c.Logger.Printf("[ERROR] %v", err)
	}
	os.Exit(1)
}
