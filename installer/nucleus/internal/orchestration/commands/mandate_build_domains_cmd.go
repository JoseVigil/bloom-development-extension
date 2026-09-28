// internal/orchestration/commands/mandate_build_domains_cmd.go
package commands

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"time"

	"nucleus/internal/core"
	"nucleus/internal/orchestration/mandatecontract"
	"nucleus/internal/orchestration/mandatestate"
	"nucleus/internal/orchestration/temporal"
	"nucleus/internal/orchestration/temporal/workflows"
	"nucleus/internal/supervisor"

	"github.com/spf13/cobra"
)

// Domain confirmation selects one candidate for a Mandate in preparation.
// It does not prove human approval, sign, activate, or add executable Files.

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
	CandidateDomains   []domainCandidateJSON   `json:"candidateDomains"`
	ConfirmedDomainIds []string                `json:"confirmedDomainIds,omitempty"`
	ConfirmedAt        string                  `json:"confirmedAt,omitempty"`
	ConfirmedBy        string                  `json:"confirmedBy,omitempty"` // D-9
	Files              []mandatecontract.Input `json:"files,omitempty"`
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
	MandateID    string   `json:"mandateId"`
	DocsProvided []string `json:"docsProvided"`
	CurrentPhase string   `json:"currentPhase"`
	Phases       struct {
		Validate validatePhaseJSON `json:"validate"`
	} `json:"phases"`
}

func createDomainsSubcommand(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "domains",
		Short: "Gestiona los dominios de un Mandate en preparación (list/confirm/reject)",
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
		Use:     "confirm",
		Short:   "Confirma un dominio y congela Files con hash y tamaño",
		Long:    "Selecciona un dominio candidato y congela los documentos de build como Files con hash y tamaño. Este acto no aprueba, firma ni activa el Mandate.",
		Example: "  nucleus mandate build domains confirm --id MANDATE_ID --domain-id DOMAIN_ID\n  nucleus --json mandate build domains confirm --id MANDATE_ID --domain-id DOMAIN_ID",
		Args:    cobra.NoArgs,
		Annotations: map[string]string{
			"category":      "MANDATES",
			"json_response": `{"success":true,"mandateId":"MANDATE_ID","confirmedDomainIds":["DOMAIN_ID"],"frozenFiles":[{"ref":"inputs/source.txt","sha256":"SHA256","size":12}],"workflowSignaled":"mandate_build_MANDATE_ID"}`,
		},
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
			if len(domainIDs) != 1 {
				fail(c, fmt.Errorf("el primer vertical requiere exactamente un --domain-id"))
				return
			}
			if len(state.Phases.Validate.HumanSync.ConfirmedDomainIds) > 0 && !reflect.DeepEqual(state.Phases.Validate.HumanSync.ConfirmedDomainIds, domainIDs) {
				fail(c, fmt.Errorf("la confirmación persistida no puede sustituirse"))
				return
			}
			cfg, err := supervisor.LoadNucleusConfig()
			if err != nil {
				fail(c, err)
				return
			}
			frozenFiles, err := mandatecontract.FreezeFiles(filepath.Join(cfg.MandatesRoot(), mandateID), state.DocsProvided)
			if err != nil {
				fail(c, fmt.Errorf("no pude congelar Files: %w", err))
				return
			}
			if len(state.Phases.Validate.HumanSync.Files) > 0 && !reflect.DeepEqual(state.Phases.Validate.HumanSync.Files, frozenFiles) {
				fail(c, fmt.Errorf("Files congelados difieren de la confirmación persistida"))
				return
			}

			// D-9: identidad interina vía usuario del SO. Ver nota de
			// alcance al inicio del archivo — esto NO cubre el path HTTP.
			// La confirmación del dominio no acredita al aprobador humano.
			// approve y activate requieren una prueba independiente del actor.
			confirmedBy := ""

			state.Phases.Validate.HumanSync.ConfirmedDomainIds = domainIDs
			if state.Phases.Validate.HumanSync.ConfirmedAt == "" {
				state.Phases.Validate.HumanSync.ConfirmedAt = time.Now().Format(time.RFC3339)
			}
			state.Phases.Validate.HumanSync.ConfirmedBy = confirmedBy
			state.Phases.Validate.HumanSync.Files = frozenFiles

			if err := writeMandateStateValidate(mandateID, raw, state.Phases.Validate); err != nil {
				fail(c, err)
				return
			}

			// ─────────────────────────────────────────────────────────
			// FIX DEL BUG (esta sesión): hasta acá, este comando escribía
			// confirmedDomainIds en mandate_state.json pero NUNCA
			// señalizaba a MandateBuildWorkflow — que está
			// bloqueado indefinidamente en signalCh.Receive(ctx, &signal)
			// esperando "mandate:build:validate" (ver
			// mandate_build_workflow.go, Fase 3). Sin esto, un
			// mandate confirmado por CLI queda colgado para siempre.
			//
			// Se arma MandateValidateSignal solo con ID+DomainName por
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

			workflowID := fmt.Sprintf("mandate_build_%s", mandateID) // mismo formato que StartMandateBuildWorkflow, temporal_client.go
			signalErr := tc.SignalWorkflow(ctx, workflowID, "", "mandate:build:validate", workflows.MandateValidateSignal{
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
					"frozenFiles":        frozenFiles,
					"workflowSignaled":   workflowID,
				}, "", "  ")
				fmt.Println(string(data))
			} else {
				c.Logger.Printf("[SUCCESS] ✅ %d dominio(s) confirmado(s) para mandate %s — señal enviada a %s", len(domainIDs), mandateID, workflowID)
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
func writeMandateStateValidate(mandateID string, _ map[string]interface{}, validate validatePhaseJSON) error {
	cfg, err := supervisor.LoadNucleusConfig()
	if err != nil {
		return fmt.Errorf("no pude leer nucleus.json: %w", err)
	}

	path := filepath.Join(cfg.MandatesRoot(), mandateID, "mandate_state.json")
	_, err = mutateMandateStateValidate(path, validate)
	if err != nil {
		return fmt.Errorf("no pude escribir mandate_state.json de %s: %w", mandateID, err)
	}
	return nil
}

func mutateMandateStateValidate(path string, validate validatePhaseJSON) (uint64, error) {
	validateBytes, err := json.Marshal(validate)
	if err != nil {
		return 0, fmt.Errorf("no pude serializar phases.validate: %w", err)
	}
	var validateMap map[string]interface{}
	if err := json.Unmarshal(validateBytes, &validateMap); err != nil {
		return 0, err
	}

	return mandatestate.Mutate(path, func(rawMap map[string]interface{}) (bool, error) {
		phases, ok := rawMap["phases"].(map[string]interface{})
		if !ok {
			phases = map[string]interface{}{}
		}
		current, _ := phases["validate"].(map[string]interface{})
		if current == nil {
			current = map[string]interface{}{}
		}
		desiredHumanSync := validateMap["humanSync"]
		if persisted, ok := current["humanSync"].(map[string]interface{}); ok {
			desired := desiredHumanSync.(map[string]interface{})
			for _, key := range []string{"confirmedDomainIds", "files"} {
				if prior, exists := persisted[key]; exists && !reflect.DeepEqual(prior, desired[key]) {
					return false, fmt.Errorf("%s ya confirmado no puede sustituirse", key)
				}
			}
		}
		if reflect.DeepEqual(current["humanSync"], desiredHumanSync) {
			return false, nil
		}
		current["humanSync"] = desiredHumanSync
		phases["validate"] = current
		rawMap["phases"] = phases
		return true, nil
	})
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
