package commands

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"nucleus/internal/core"
	"nucleus/internal/orchestration/genesisrecovery"
	ntemporal "nucleus/internal/orchestration/temporal"
	"nucleus/internal/supervisor"

	"github.com/spf13/cobra"
)

func createGenesisRecoverySubcommand(c *core.Core) *cobra.Command {
	genesis := &cobra.Command{Use: "genesis", Short: "Gestiona la continuidad Genesis por proyecto",
		Long:        "Consulta y mantiene la relación durable entre un proyecto y sus Mandates Genesis.",
		Annotations: map[string]string{"category": "MANDATES", "json_response": `{"command":"genesis","subcommands":["recover","project-status","adopt"]}`},
		Example:     "  nucleus mandate genesis project-status --project-id PROJECT_ID\n  nucleus --json mandate genesis project-status --project-id PROJECT_ID"}
	recoverCmd := &cobra.Command{Use: "recover", Short: "Prepara y confirma reintentos Genesis",
		Long:        "Prepara una recuperación idempotente y confirma el Mandate correlacionado una vez creado.",
		Annotations: map[string]string{"category": "MANDATES", "json_response": `{"command":"recover","subcommands":["prepare","acknowledge"]}`},
		Example:     "  nucleus mandate genesis recover prepare --help\n  nucleus --json mandate genesis recover prepare --help"}
	recoverCmd.AddCommand(genesisRecoveryPrepareCommand(c), genesisRecoveryAcknowledgeCommand(c))
	genesis.AddCommand(recoverCmd, genesisProjectStatusCommand(c), genesisProjectAdoptCommand(c))
	return genesis
}

func genesisProjectAdoptCommand(c *core.Core) *cobra.Command {
	var projectID, projectName, launchID, mandateID string
	cmd := &cobra.Command{Use: "adopt", Short: "Adopta el primer Mandate Genesis de un proyecto", Args: cobra.NoArgs,
		Long:        "Registra de forma durable un Mandate Genesis ya creado como relación inicial del proyecto.",
		Annotations: map[string]string{"category": "MANDATES", "json_response": `{"success":true,"projectId":"PROJECT_ID","currentMandateId":"MANDATE_ID"}`},
		Example:     "  nucleus mandate genesis adopt --project-id PROJECT_ID --project PROJECT --genesis-launch-id LAUNCH_ID --mandate-id MANDATE_ID\n  nucleus --json mandate genesis adopt --project-id PROJECT_ID --project PROJECT --genesis-launch-id LAUNCH_ID --mandate-id MANDATE_ID",
		RunE: func(cmd *cobra.Command, _ []string) error {
			svc, err := recoveryStoreService()
			if err != nil {
				printRecoveryResult(c, nil, err)
				return err
			}
			result, err := svc.AdoptInitial(projectID, projectName, launchID, mandateID)
			printRecoveryResult(c, result, err)
			return err
		}}
	cmd.Flags().StringVar(&projectID, "project-id", "", "Proyecto")
	cmd.Flags().StringVar(&projectName, "project", "", "Nombre")
	cmd.Flags().StringVar(&launchID, "genesis-launch-id", "", "Genesis launch")
	cmd.Flags().StringVar(&mandateID, "mandate-id", "", "Mandate creado")
	for _, name := range []string{"project-id", "project", "genesis-launch-id", "mandate-id"} {
		_ = cmd.MarkFlagRequired(name)
	}
	return cmd
}

func recoveryStoreService() (*genesisrecovery.Service, error) {
	cfg, err := supervisor.LoadNucleusConfig()
	if err != nil {
		return nil, err
	}
	nucleusRoot := filepath.Join(cfg.WorkspacePath, core.BloomDirName, core.NucleusPrefix+cfg.Slug)
	return &genesisrecovery.Service{Store: genesisrecovery.NewStore(nucleusRoot), MandatesRoot: cfg.MandatesRoot()}, nil
}

func recoveryService(c *core.Core) (*genesisrecovery.Service, func(), error) {
	cfg, err := supervisor.LoadNucleusConfig()
	if err != nil {
		return nil, nil, err
	}
	nucleusRoot := filepath.Join(cfg.WorkspacePath, core.BloomDirName, core.NucleusPrefix+cfg.Slug)
	tc, err := ntemporal.NewClient(context.Background(), &c.Paths, c.IsJSON)
	if err != nil {
		return nil, nil, err
	}
	return &genesisrecovery.Service{Store: genesisrecovery.NewStore(nucleusRoot), MandatesRoot: cfg.MandatesRoot(), Workflows: recoveryWorkflowAdapter{tc}}, tc.Close, nil
}

type recoveryWorkflowAdapter struct{ client *ntemporal.Client }

func (a recoveryWorkflowAdapter) GetMandateWorkflowStates(ctx context.Context, mandateID string) (map[string]genesisrecovery.WorkflowState, error) {
	states, err := a.client.GetMandateWorkflowStates(ctx, mandateID)
	if err != nil {
		return nil, err
	}
	converted := make(map[string]genesisrecovery.WorkflowState, len(states))
	for id, state := range states {
		converted[id] = genesisrecovery.WorkflowState(state)
	}
	return converted, nil
}

func printRecoveryResult(c *core.Core, value any, err error) {
	if err != nil {
		payload := map[string]any{"success": false, "error": genesisrecovery.ErrorCode(err), "detail": err.Error()}
		if c.IsJSON {
			raw, _ := json.Marshal(payload)
			fmt.Println(string(raw))
		} else {
			c.Logger.Printf("[ERROR] Genesis: %s (%s)", err, genesisrecovery.ErrorCode(err))
		}
		return
	}
	raw, _ := json.Marshal(value)
	if c.IsJSON {
		fmt.Println(string(raw))
	} else {
		c.Logger.Printf("[SUCCESS] Genesis: %s", string(raw))
	}
}

func genesisRecoveryPrepareCommand(c *core.Core) *cobra.Command {
	var in genesisrecovery.PrepareInput
	cmd := &cobra.Command{Use: "prepare", Short: "Prepara una recuperación Genesis idempotente", Args: cobra.NoArgs,
		Long:        "Valida el estado previo del proyecto y prepara un nuevo lanzamiento sin reconocer todavía un Mandate.",
		Annotations: map[string]string{"category": "MANDATES", "json_response": `{"success":true,"projectId":"PROJECT_ID","recoveryRequestId":"REQUEST_ID","mandateLaunchId":"LAUNCH_ID"}`},
		Example:     "  nucleus mandate genesis recover prepare --project-id PROJECT_ID --project PROJECT --expected-previous-mandate-id MANDATE_ID --recovery-request-id REQUEST_ID\n  nucleus --json mandate genesis recover prepare --project-id PROJECT_ID --project PROJECT --expected-previous-mandate-id MANDATE_ID --recovery-request-id REQUEST_ID",
		RunE: func(cmd *cobra.Command, _ []string) error {
			svc, closeFn, err := recoveryService(c)
			if err != nil {
				printRecoveryResult(c, nil, err)
				return err
			}
			defer closeFn()
			result, err := svc.Prepare(cmd.Context(), in)
			printRecoveryResult(c, result, err)
			return err
		}}
	cmd.Flags().StringVar(&in.ProjectID, "project-id", "", "Identidad durable del proyecto")
	cmd.Flags().StringVar(&in.ProjectName, "project", "", "Nombre del proyecto")
	cmd.Flags().StringVar(&in.Source, "source", "core-recovery", "Origen del lanzamiento")
	cmd.Flags().StringVar(&in.ExpectedPreviousMandateID, "expected-previous-mandate-id", "", "Mandate Genesis vigente esperado")
	cmd.Flags().StringVar(&in.RecoveryRequestID, "recovery-request-id", "", "Idempotency key UUID")
	_ = cmd.MarkFlagRequired("project-id")
	_ = cmd.MarkFlagRequired("project")
	_ = cmd.MarkFlagRequired("expected-previous-mandate-id")
	_ = cmd.MarkFlagRequired("recovery-request-id")
	return cmd
}

func genesisRecoveryAcknowledgeCommand(c *core.Core) *cobra.Command {
	var projectID, requestID, launchID, mandateID string
	cmd := &cobra.Command{Use: "acknowledge", Short: "Confirma el Mandate creado por una recuperación", Args: cobra.NoArgs,
		Long:        "Correlaciona el lanzamiento preparado con el Mandate efectivamente creado y actualiza la relación durable.",
		Annotations: map[string]string{"category": "MANDATES", "json_response": `{"success":true,"projectId":"PROJECT_ID","currentMandateId":"MANDATE_ID","recoveryRequestId":"REQUEST_ID"}`},
		Example:     "  nucleus mandate genesis recover acknowledge --project-id PROJECT_ID --recovery-request-id REQUEST_ID --genesis-launch-id LAUNCH_ID --mandate-id MANDATE_ID\n  nucleus --json mandate genesis recover acknowledge --project-id PROJECT_ID --recovery-request-id REQUEST_ID --genesis-launch-id LAUNCH_ID --mandate-id MANDATE_ID",
		RunE: func(cmd *cobra.Command, _ []string) error {
			svc, err := recoveryStoreService()
			if err != nil {
				printRecoveryResult(c, nil, err)
				return err
			}
			result, err := svc.Acknowledge(projectID, requestID, launchID, mandateID)
			printRecoveryResult(c, result, err)
			return err
		}}
	cmd.Flags().StringVar(&projectID, "project-id", "", "Proyecto")
	cmd.Flags().StringVar(&requestID, "recovery-request-id", "", "Recovery request")
	cmd.Flags().StringVar(&launchID, "genesis-launch-id", "", "Genesis launch")
	cmd.Flags().StringVar(&mandateID, "mandate-id", "", "Mandate creado")
	for _, name := range []string{"project-id", "recovery-request-id", "genesis-launch-id", "mandate-id"} {
		_ = cmd.MarkFlagRequired(name)
	}
	return cmd
}

func genesisProjectStatusCommand(c *core.Core) *cobra.Command {
	var projectID string
	cmd := &cobra.Command{Use: "project-status", Short: "Consulta la continuidad Genesis de un proyecto", Args: cobra.NoArgs,
		Long:        "Devuelve la relación Genesis durable vigente para el proyecto sin modificarla.",
		Annotations: map[string]string{"category": "MANDATES", "json_response": `{"success":true,"projectId":"PROJECT_ID","record":null}`},
		Example:     "  nucleus mandate genesis project-status --project-id PROJECT_ID\n  nucleus --json mandate genesis project-status --project-id PROJECT_ID",
		RunE: func(cmd *cobra.Command, _ []string) error {
			cfg, err := supervisor.LoadNucleusConfig()
			if err != nil {
				return err
			}
			root := filepath.Join(cfg.WorkspacePath, core.BloomDirName, core.NucleusPrefix+cfg.Slug)
			record, err := genesisrecovery.NewStore(root).Load(projectID)
			if os.IsNotExist(err) {
				printRecoveryResult(c, map[string]any{"success": true, "projectId": projectID, "record": nil}, nil)
				return nil
			}
			printRecoveryResult(c, map[string]any{"success": true, "projectId": projectID, "record": record}, err)
			return err
		}}
	cmd.Flags().StringVar(&projectID, "project-id", "", "Proyecto")
	_ = cmd.MarkFlagRequired("project-id")
	return cmd
}
