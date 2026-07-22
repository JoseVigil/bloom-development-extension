// internal/orchestration/commands/mandate_genesis_domains_cmd.go
package commands

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/user"
	"path/filepath"
	"time"

	"nucleus/internal/core"
	"nucleus/internal/orchestration/temporal"
	"nucleus/internal/orchestration/temporal/workflows"
	"nucleus/internal/supervisor"

	"github.com/spf13/cobra"
)

// ─────────────────────────────────────────────────────────────────────────
// NOTA DE ALCANCE
//
// `nucleus mandate genesis domains {list,confirm,reject}` tampoco existía
// como código — no aparecía en mandate.go (que solo tiene create/genesis/
// status) ni en ningún otro archivo Go recibido. Es el comando descrito en
// el contrato §4 ("Qué escribe el comando en HumanSyncRecord:
// confirmedDomainIds, confirmedAt, confirmedBy"). Esta es la primera
// implementación real, y es acá — no en signMandateActivity — donde D-9
// se resuelve, porque confirmedBy se escribe en el momento del confirm,
// no en el de la firma.
//
// D-9 — ESTADO REAL DESPUÉS DE ESTE CAMBIO: sigue sin existir, en
// cualquier archivo revisado, un mecanismo de identidad de sesión (auth
// HTTP, JWT, usuario logueado en la UI, etc.). Lo que este archivo cierra
// es el path CLI: usa la identidad del usuario del sistema operativo
// (os/user.Current()) como fuente de "quién confirmó". Es una atribución
// real y verificable (no un placeholder inventado como "system" o
// string vacío), pero cubre solo invocaciones por CLI. El path
// create-mandate.handler.ts / API HTTP (§0, jerarquía de fuentes) NO se
// toca acá — necesita su propio mecanismo de sesión antes de poder
// poblar confirmedBy con el mismo nivel de certeza, y no se inventa uno
// a ciegas del lado TS sin ver ese subsistema de auth.
// ─────────────────────────────────────────────────────────────────────────

// WIRING REQUERIDO (una línea, en mandate.go, no incluida en este archivo
// para no reescribir un archivo completo por un solo agregado): dentro de
// createGenesisMandateSubcommand, después de `cmd.Flags().StringVar(...)`
// y antes de `return cmd`, agregar:
//
//   cmd.AddCommand(createDomainsSubcommand(c))
//
// Esto expone `nucleus mandate genesis domains {list,confirm,reject}` como
// subcomando de `mandate genesis`, coherente con como el contrato (§4) lo
// describe. No se usa core.RegisterCommand acá porque "domains" no es una
// categoría de tope nueva — es un subcomando de uno ya existente.

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

func createDomainsSubcommand(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "domains",
		Short: "Gestiona el Human Sync Point de un mandate genesis (list/confirm/reject)",
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
		Args:  cobra.NoArgs,
		Run: func(cmd *cobra.Command, args []string) {
			state, _, err := readMandateState(mandateID)
			if err != nil {
				fail(c, err)
				return
			}
			out := state.Phases.Validate.HumanSync.CandidateDomains
			if c.IsJSON {
				data, _ := json.MarshalIndent(out, "", "  ")
				fmt.Println(string(data))
			} else {
				for _, cand := range out {
					dep := ""
					if len(cand.DependsOn) > 0 {
						dep = fmt.Sprintf(" (depende de: %v)", cand.DependsOn)
					}
					c.Logger.Printf("[INFO] %s — %s (cohesión %.2f)%s", cand.DomainID, cand.Name, cand.CohesionScore, dep)
				}
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
		Args:  cobra.NoArgs,
		Run: func(cmd *cobra.Command, args []string) {
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

			// ─────────────────────────────────────────────────────────
			// FIX DEL BUG (esta sesión): hasta acá, este comando escribía
			// confirmedDomainIds en mandate_state.json pero NUNCA
			// señalizaba a MandateGenesisBuildWorkflow — que está
			// bloqueado indefinidamente en signalCh.Receive(ctx, &signal)
			// esperando "mandate:genesis:validate" (ver
			// mandate_genesis_build_workflow.go, Fase 3). Sin esto, un
			// mandate confirmado por CLI queda colgado para siempre.
			//
			// Se arma GenesisValidateSignal solo con ID+DomainName por
			// dominio — SIN Rename ni Files, porque este comando no los
			// recibe como input hoy (confirmado explícitamente, no
			// inventado: el flag --domain-id no tiene contraparte para
			// rename ni para lista de archivos). Si en el futuro CLI
			// necesita soportar rename, hace falta agregar un flag nuevo
			// acá — no se agrega uno a ciegas en este cambio.
			//
			// ASUNCIÓN RESUELTA (era una suposición sin confirmar, ahora
			// confirmada contra `go build` real, no contra código leído
			// directamente): *core.Core sí expone `Paths`, pero como
			// struct por valor (`core.Paths`), no puntero — temporal.NewClient
			// pide *core.Paths, así que hace falta `&c.Paths`. Sin el `&`
			// esto no compila (error de tipos, no de imports).
			// ─────────────────────────────────────────────────────────
			signalDomains := make([]workflows.DomainConfirmation, 0, len(domainIDs))
			for _, id := range domainIDs {
				cand := byID[id] // ya validado arriba que existe
				signalDomains = append(signalDomains, workflows.DomainConfirmation{
					ID:         cand.DomainID,
					DomainName: cand.Name,
				})
			}

			ctx := context.Background()
			tc, err := temporal.NewClient(ctx, &c.Paths, c.IsJSON)
			if err != nil {
				fail(c, fmt.Errorf("mandate_state.json quedó actualizado, pero no pude conectar a Temporal para señalizar: %w — el workflow sigue esperando la señal", err))
				return
			}
			defer tc.Close()

			workflowID := fmt.Sprintf("mandate_genesis_%s", mandateID) // mismo formato que StartMandateGenesisBuildWorkflow, temporal_client.go
			signalErr := tc.SignalWorkflow(ctx, workflowID, "", "mandate:genesis:validate", workflows.GenesisValidateSignal{
				Approved: true,
				Domains:  signalDomains,
			})
			if signalErr != nil {
				fail(c, fmt.Errorf("mandate_state.json quedó actualizado, pero no pude señalizar el workflow %s: %w — el workflow sigue esperando la señal", workflowID, signalErr))
				return
			}

			if c.IsJSON {
				data, _ := json.MarshalIndent(map[string]interface{}{
					"success":            true,
					"mandateId":          mandateID,
					"confirmedDomainIds": domainIDs,
					"confirmedBy":        confirmedBy,
					"workflowSignaled":   workflowID,
				}, "", "  ")
				fmt.Println(string(data))
			} else {
				c.Logger.Printf("[SUCCESS] ✅ %d dominio(s) confirmado(s) por %s para mandate %s — señal enviada a %s", len(domainIDs), confirmedBy, mandateID, workflowID)
			}
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
		Args:  cobra.NoArgs,
		Run: func(cmd *cobra.Command, args []string) {
			// Implementación deliberadamente mínima: rechazar hoy solo
			// significa "no incluirlo en el próximo confirm" — no hay
			// todavía un estado persistido de "rechazado" distinto de
			// "nunca confirmado", porque eso depende de decisiones de UI
			// (§ fuera del alcance de D-3/D-9, ver BTIPS_UI_Contract) que
			// no están cerradas. Se deja el subcomando registrado para
			// que la superficie de CLI coincida con el contrato §4, pero
			// avisa explícitamente en vez de fingir un efecto que no
			// tiene.
			c.Logger.Printf("[INFO] 'reject' no persiste estado propio todavía — simplemente no incluyas %q en 'domains confirm'", domainID)
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

func fail(c *core.Core, err error) {
	if c.IsJSON {
		data, _ := json.MarshalIndent(map[string]interface{}{"success": false, "error": err.Error()}, "", "  ")
		fmt.Println(string(data))
	} else {
		c.Logger.Printf("[ERROR] %v", err)
	}
	os.Exit(1)
}
