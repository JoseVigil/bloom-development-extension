// internal/governance/org_switch_guard.go
//
// Etapa 4 (docs/GOVERNANCE/PROMPT-EJECUCION-synapse-switch-organization.md):
// G2 (`can-switch-org`) y G4 (lock de drenado), diseño detallado en
// docs/GOVERNANCE/G1-G8_multi-org-switch-design.md.
//
// Decisión de diseño confirmada con el usuario (ver AskUserQuestion de esta
// sesión) antes de escribir este archivo, tal como pide la Etapa 4:
//
//  1. G2 es una función Go síncrona, NO un workflow de Temporal montado
//     sobre SystemGateWorkflow. SystemGateWorkflow (orchestration/workflows/
//     system_gate.go) resuelve el patrón "bloqueame hasta que llegue una
//     señal" (lo usa WaitForSystemReady al boot) — G2 resuelve el patrón
//     opuesto: "decime ahora mismo si está bloqueado y por qué", para que
//     el Conductor lo consulte antes de mostrarle el switch al usuario
//     (G6). Levantar un child workflow de Temporal por cada consulta de
//     "¿puedo cambiar de org?" no tiene sentido para una lectura de estado
//     puntual. SystemGateWorkflow queda intacto.
//  2. G2/G4 viven en el paquete governance, no en core ni en
//     orchestration/workflows. core/org_context.go (Etapa 2) resuelve
//     "cuál es la org activa y dónde está su carpeta" — una pregunta de
//     resolución de ruta. G2/G4 resuelven "¿está permitido tocar ese
//     estado ahora?" — la misma familia de pregunta que ya resuelven
//     ownership.go (quién es dueño) y vault.go (quién puede leer un
//     secreto) en este mismo paquete. Reusan también el mismo patrón de
//     persistencia que ownership.go: JSON dentro de
//     core.ResolveNucleusRoot(""), escritura atómica con archivo temporal
//     + rename.
//
// G2 se construye sobre Etapa 3 (temporal.Client.HasNonTerminalMandateWork),
// exactamente como pedía el texto original de la Etapa 4 ("la condición
// real siendo 'Etapa 3 reporta todo terminal'") — no reinventa una segunda
// forma de listar workflows abiertos.
package governance

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/spf13/cobra"

	"nucleus/internal/core"
	"nucleus/internal/orchestration/temporal"
)

// ============================================
// G4 — lock de drenado persistido
// ============================================

// DrainingState es el flag persistido entre "empezó a drenar" y "terminó
// de drenar" (G4). Vive en el mismo nucleusRoot que ownership.json/
// vault.json — un tercer archivo, no un tercer mecanismo de resolución de
// estado: sigue usando core.ResolveNucleusRoot("") como todo lo demás en
// este paquete.
type DrainingState struct {
	Draining  bool      `json:"draining"`
	Reason    string    `json:"reason,omitempty"`
	StartedAt time.Time `json:"started_at,omitempty"`
}

// GetDrainingStatePath retorna la ruta del archivo de estado de drenado
// para la organización activa (misma resolución que GetOwnershipPath).
func GetDrainingStatePath() (string, error) {
	nucleusRoot, err := core.ResolveNucleusRoot("")
	if err != nil {
		return "", err
	}
	return filepath.Join(nucleusRoot, "draining.json"), nil
}

// LoadDrainingState carga el estado de drenado. Un archivo ausente es un
// estado válido — "nunca se inició un drenado" — no un error, mismo
// criterio que LoadOwnership().
func LoadDrainingState() (*DrainingState, error) {
	path, err := GetDrainingStatePath()
	if err != nil {
		return nil, err
	}

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return &DrainingState{Draining: false}, nil
		}
		return nil, err
	}

	var state DrainingState
	if err := json.Unmarshal(data, &state); err != nil {
		return nil, err
	}
	return &state, nil
}

// SaveDrainingState persiste el estado de drenado con escritura atómica
// (archivo temporal + rename) — mismo patrón que SaveOwnership(). La
// atomicidad importa acá específicamente: G4 existe para que un crash a
// mitad del drenado no deje al sistema en un estado ambiguo (ver nota en
// G1-G8_multi-org-switch-design.md sobre este mismo riesgo para G3).
func SaveDrainingState(state *DrainingState) error {
	path, err := GetDrainingStatePath()
	if err != nil {
		return err
	}

	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}

	tmpPath := path + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0644); err != nil {
		return err
	}
	if err := os.Rename(tmpPath, path); err != nil {
		os.Remove(tmpPath)
		return err
	}
	return nil
}

// BeginDraining marca el inicio de la ventana de drenado — a partir de
// acá y hasta EndDraining(), G2 debe reportar blocked:true
// incondicionalmente para esta organización, sin importar si Etapa 3
// todavía ve Mandates no-terminales o no (evita la carrera descrita en
// G4: alguien dispara un Mandate nuevo justo en el hueco entre "Etapa 3
// dice que ya terminó todo" y "el switch efectivamente se concretó").
func BeginDraining(reason string) error {
	return SaveDrainingState(&DrainingState{
		Draining:  true,
		Reason:    reason,
		StartedAt: time.Now(),
	})
}

// EndDraining limpia el flag de drenado. Idempotente: llamarlo sin un
// drenado en curso no es un error.
func EndDraining() error {
	return SaveDrainingState(&DrainingState{Draining: false})
}

// ============================================
// G2 — can-switch-org
// ============================================

// CanSwitchResult es la respuesta de CanSwitchOrg — nunca inferida
// implícitamente por el caller (Conductor), tal como pide G2 en el
// documento de diseño.
type CanSwitchResult struct {
	Blocked bool     `json:"blocked"`
	Reasons []string `json:"reasons"`
}

// CanSwitchOrg responde "¿puedo cambiar de organización activa ahora
// mismo?" combinando:
//   - G4: si ya hay un drenado en curso (disparado por un intento de
//     switch anterior), bloquea incondicionalmente — no se puede iniciar
//     un segundo switch mientras el primero no terminó.
//   - G3/Etapa 3: si Temporal reporta algún Mandate no-terminal para esta
//     organización (temporal.Client.HasNonTerminalMandateWork), bloquea.
//
// mandatesRoot debe venir ya resuelto por el caller para la organización
// activa — mismo contrato que HasNonTerminalMandateWork y mismo motivo:
// no inventar acá una segunda forma de encontrar la carpeta de Mandates
// cuando supervisor.Config.MandatesRoot() (Etapa 2) ya es la fuente de
// verdad para eso.
//
// tc puede ser nil solo si el caller ya sabe que Temporal no está
// disponible (ej. nunca se arrancó ningún Mandate en esta instalación) —
// en ese caso CanSwitchOrg no intenta la consulta y confía únicamente en
// G4. Cualquier otro caso de Temporal inalcanzable es un error real que
// se propaga: G2 nunca debe reportar blocked:false por no poder
// consultar el estado real, eso sería peor que bloquear de más.
func CanSwitchOrg(ctx context.Context, tc *temporal.Client, mandatesRoot string) (CanSwitchResult, error) {
	var reasons []string

	draining, err := LoadDrainingState()
	if err != nil {
		return CanSwitchResult{}, fmt.Errorf("no pude leer el estado de drenado (G4): %w", err)
	}
	if draining.Draining {
		reasons = append(reasons, fmt.Sprintf("ya hay un drenado en curso desde %s: %s",
			draining.StartedAt.Format(time.RFC3339), draining.Reason))
	}

	if tc != nil {
		nonTerminal, workflowIDs, err := tc.HasNonTerminalMandateWork(ctx, mandatesRoot)
		if err != nil {
			return CanSwitchResult{}, fmt.Errorf("no pude consultar Mandates en curso (G3/Etapa 3): %w", err)
		}
		if nonTerminal {
			reasons = append(reasons, fmt.Sprintf("%d Mandate(s) en ejecución: %v", len(workflowIDs), workflowIDs))
		}
	}

	return CanSwitchResult{
		Blocked: len(reasons) > 0,
		Reasons: reasons,
	}, nil
}

// ============================================
// CLI — Etapa 5 (docs/GOVERNANCE/PROMPT-EJECUCION-synapse-switch-organization.md)
//
// G2/G4 no tenían forma de invocarse desde fuera de Go hasta acá. Brain
// (brain/core/server/server_manager.py) no reimplementa esta lógica en
// Python — solo reenvía SWITCH_ORGANIZATION a los Sentinels (Conductor).
// Conductor (main_conductor.js#handleSwitchOrganization) es quien de verdad
// escribe active_org_slug (único dueño confirmado: getOrCreateOrg() en
// shared/onboarding-schema.js, G7), así que necesita poder invocar G2/G4
// como subprocess — mismo patrón que ya usa Conductor para todo lo demás
// (execNucleus(['--json', ...])). Estos tres comandos son la superficie
// mínima que ese wrapper necesita: consultar, y bracketar el drenado
// alrededor de la escritura real que hace Node.
// ============================================

func init() {
	core.RegisterCommand("GOVERNANCE", createCanSwitchOrgCommand)
	core.RegisterCommand("GOVERNANCE", createBeginDrainCommand)
	core.RegisterCommand("GOVERNANCE", createEndDrainCommand)
}

// resolveMandatesRootForActiveOrg replica la construcción de MandatesRoot()
// (supervisor.Config, Etapa 2) pero sin importar el paquete supervisor —
// governance no puede: supervisor ya importa governance (dev_start.go), así
// que la dirección inversa crearía un ciclo de imports. En vez de eso, se
// reusa core.ResolveNucleusRoot("") (la MISMA resolución que ya usa
// supervisor.LoadNucleusConfig() por debajo, vía core.ScanForNucleus) y se
// le agrega el sufijo ".mandates" acá — el mismo literal que ya usan
// supervisor/supervisor.go y supervisor/mandate_config.go. No es una
// segunda fuente de verdad: es la misma resolución de raíz, con el mismo
// sufijo fijo aplicado en un lugar distinto por una restricción de Go, no
// por una decisión de diseño.
func resolveMandatesRootForActiveOrg() (string, error) {
	nucleusRoot, err := core.ResolveNucleusRoot("")
	if err != nil {
		return "", err
	}
	return filepath.Join(nucleusRoot, ".mandates"), nil
}

// buildTemporalClientBestEffort intenta conectar a Temporal para que G2
// pueda consultar Etapa 3 (Mandates en curso). Si Temporal no está
// disponible, no es un error duro acá — CanSwitchOrg() documenta que con
// tc=nil sigue evaluando G4 igual, y el caller (este comando) lo señala
// explícitamente vía el campo "degraded" del JSON de salida en vez de
// fallar en silencio o bloquear el switch solo porque Temporal no
// respondió. La decisión de si "degraded" debe tratarse como bloqueante
// queda del lado de quien consuma este CLI (Conductor), no acá.
func buildTemporalClientBestEffort(ctx context.Context, jsonMode bool) (*temporal.Client, bool) {
	paths, err := core.InitPaths()
	if err != nil {
		fmt.Fprintf(os.Stderr, "aviso: no pude resolver Paths para Temporal: %v\n", err)
		return nil, true
	}
	tc, err := temporal.NewClient(ctx, paths, jsonMode)
	if err != nil {
		fmt.Fprintf(os.Stderr, "aviso: no pude conectar a Temporal (G3/Etapa 3 se omite, solo G4 aplica): %v\n", err)
		return nil, true
	}
	return tc, false
}

func createCanSwitchOrgCommand(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "can-switch-org",
		Short: "G2 — evalúa si la organización activa puede drenarse para un switch",
		Args:  cobra.NoArgs,
		Run: func(cmd *cobra.Command, args []string) {
			ctx := context.Background()

			mandatesRoot, err := resolveMandatesRootForActiveOrg()
			if err != nil {
				fmt.Printf("{\"success\":false,\"error\":%q}\n", err.Error())
				os.Exit(1)
			}

			tc, degraded := buildTemporalClientBestEffort(ctx, c.IsJSON)
			if tc != nil {
				defer tc.Close()
			}

			result, err := CanSwitchOrg(ctx, tc, mandatesRoot)
			if err != nil {
				fmt.Printf("{\"success\":false,\"error\":%q}\n", err.Error())
				os.Exit(1)
			}

			if c.IsJSON {
				reasonsJSON, _ := json.Marshal(result.Reasons)
				fmt.Printf(
					"{\"success\":true,\"blocked\":%t,\"reasons\":%s,\"degraded\":%t}\n",
					result.Blocked, reasonsJSON, degraded,
				)
			} else {
				fmt.Printf("blocked: %t\n", result.Blocked)
				for _, r := range result.Reasons {
					fmt.Printf("  - %s\n", r)
				}
				if degraded {
					fmt.Println("(degraded: no se pudo consultar Temporal — solo se evaluó G4)")
				}
			}
		},
	}
	return cmd
}

func createBeginDrainCommand(c *core.Core) *cobra.Command {
	var reason string

	cmd := &cobra.Command{
		Use:   "begin-drain",
		Short: "G4 — marca el inicio de la ventana de drenado para la organización activa",
		Args:  cobra.NoArgs,
		Run: func(cmd *cobra.Command, args []string) {
			if err := BeginDraining(reason); err != nil {
				fmt.Printf("{\"success\":false,\"error\":%q}\n", err.Error())
				os.Exit(1)
			}
			if c.IsJSON {
				fmt.Println("{\"success\":true}")
			} else {
				fmt.Println("draining: true")
			}
		},
	}
	cmd.Flags().StringVar(&reason, "reason", "", "Motivo del drenado (ej. 'switch a org X')")
	return cmd
}

func createEndDrainCommand(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "end-drain",
		Short: "G4 — limpia el flag de drenado (idempotente)",
		Args:  cobra.NoArgs,
		Run: func(cmd *cobra.Command, args []string) {
			if err := EndDraining(); err != nil {
				fmt.Printf("{\"success\":false,\"error\":%q}\n", err.Error())
				os.Exit(1)
			}
			if c.IsJSON {
				fmt.Println("{\"success\":true}")
			} else {
				fmt.Println("draining: false")
			}
		},
	}
	return cmd
}
