// internal/orchestration/commands/mandate_install.go
//
// Wrapper delgado de 'nucleus mandate install' sobre internal/mandateinstall — la lógica de
// materialización pura se mudó ahí en
// Encargo_Implementacion_AutoEncadenamiento_Sync_Install_y_Validacion_Backend_v1_0.md §2.1
// porque internal/governance necesita invocarla también (para el auto-encadenamiento
// sync→install) y este paquete (commands) ya importa internal/governance
// (requireMandateMaster → governance.RequireMaster), así que governance no puede importar
// commands sin crear un ciclo. Este archivo conserva el comando cobra, los flags, el
// logging (core.InitLogger(&c.Paths, "MANDATE", c.IsJSON)) y el Annotations —
// comportamiento observable del comando CLI, idéntico a como era antes de la mudanza.
package commands

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"nucleus/internal/authority"
	"nucleus/internal/core"
	"nucleus/internal/mandateinstall"
	"nucleus/internal/supervisor"

	"github.com/spf13/cobra"
)

// InstallMandateResult es lo que imprime el comando (--json o interactivo).
type InstallMandateResult struct {
	Success          bool   `json:"success"`
	MandateID        string `json:"mandate_id,omitempty"`
	MandatePath      string `json:"mandate_path,omitempty"`
	AlreadyInstalled bool   `json:"already_installed,omitempty"`
	Error            string `json:"error,omitempty"`
}

func createInstallMandateSubcommand(c *core.Core) *cobra.Command {
	var mandateID string

	cmd := &cobra.Command{
		Use:   "install",
		Short: "Materializa un mandate ya entregado y verificado como mandate.json local",
		Long: `Lee el recibo ya verificado de un mandate entregado (ver 'nucleus authority sync')
desde AppDataDir/authority/mandate-delivery/receipts/..., extrae el contenido firmado
(MandateBase64), confirma su integridad (sha256 contra Envelope.Digest — la firma Ed25519
ya se verificó una vez, con éxito, para que el recibo exista) y lo escribe byte por byte
como {mandatesRoot}/{mandateID}/mandate.json — el mismo formato que ya produce 'nucleus
mandate build' para un mandate construido localmente.

El mandate queda materializado en disco pero INACTIVO: ningún motor de ejecución lo
recoge todavía — ese enganche con .ownership.json es un encargo aparte, deliberadamente
separado, y no se resuelve acá.

Requiere que 'nucleus authority sync' ya haya entregado el mandate (recibo verificado
presente) — este comando no llama a red ni re-verifica la firma Ed25519 del delivery.
Re-ejecutarlo con el mismo recibo es idempotente.`,
		Args: cobra.NoArgs,
		Annotations: map[string]string{
			"category": "MANDATES",
			"json_response": `{
  "success": true,
  "mandate_id": "3f9c1a2e-8b7d-4c1a-9e2f-1a2b3c4d5e6f",
  "mandate_path": "{MandatesRoot}/3f9c1a2e-8b7d-4c1a-9e2f-1a2b3c4d5e6f/mandate.json",
  "already_installed": false
}`,
		},
		Example: `  nucleus mandate install --id 3f9c1a2e-8b7d-4c1a-9e2f-1a2b3c4d5e6f
  nucleus --json mandate install --id 3f9c1a2e-8b7d-4c1a-9e2f-1a2b3c4d5e6f`,
		PreRun: func(cmd *cobra.Command, args []string) {
			if err := requireMandateMaster(c); err != nil {
				fmt.Printf("Error: %v\n", err)
				os.Exit(1)
			}
		},

		Run: func(cmd *cobra.Command, args []string) {
			result := runInstallMandate(c, mandateID)
			if c.IsJSON {
				data, _ := json.MarshalIndent(result, "", "  ")
				fmt.Println(string(data))
			} else if result.Success {
				if result.AlreadyInstalled {
					c.Logger.Printf("[SUCCESS] ✅ Mandate %s ya estaba materializado en %s (re-ejecución idempotente)", result.MandateID, result.MandatePath)
				} else {
					c.Logger.Printf("[SUCCESS] ✅ Mandate %s materializado en %s", result.MandateID, result.MandatePath)
				}
			} else {
				c.Logger.Printf("[ERROR] ❌ No se pudo materializar el mandate: %s", result.Error)
			}
			if !result.Success {
				os.Exit(1)
			}
		},
	}
	cmd.Flags().StringVar(&mandateID, "id", "", "ID del mandate ya entregado y verificado (requerido)")
	_ = cmd.MarkFlagRequired("id")
	return cmd
}

// runInstallMandate hace el trabajo real; separado de Run para que sea testeable sin pasar
// por cobra. Logging estructurado vía core.InitLogger(&c.Paths, "MANDATE", c.IsJSON) — misma
// categoría de primera clase que ya usa 'nucleus mandate publish' (ver mandate_publish.go),
// no hace falta logger ni categoría nueva. Delega toda la lógica de materialización a
// internal/mandateinstall (LoadLatestReceipt/ExtractContent/MaterializeFile) — ver el
// comentario de paquete más arriba sobre por qué esa lógica vive ahí y no acá.
func runInstallMandate(c *core.Core, mandateID string) InstallMandateResult {
	logger, err := core.InitLogger(&c.Paths, "MANDATE", c.IsJSON)
	if err != nil {
		return InstallMandateResult{Success: false, Error: fmt.Sprintf("no pude inicializar el logger de MANDATE: %v", err)}
	}
	defer logger.Close()

	if mandateID == "" {
		return InstallMandateResult{Success: false, Error: "--id es requerido"}
	}

	cfg, err := supervisor.LoadNucleusConfig()
	if err != nil {
		logger.Error("no pude leer nucleus.json: %v", err)
		return InstallMandateResult{Success: false, MandateID: mandateID, Error: fmt.Sprintf("no pude leer nucleus.json: %v", err)}
	}

	// Reusa la misma resolución que 'nucleus authority sync' / 'nucleus mandate publish' —
	// no se reimplementa la lectura de organización activa ni de identidad de instalación.
	active, err := core.ResolveActiveOrgContext()
	if err != nil {
		logger.Error("no pude resolver la organización activa: %v", err)
		return InstallMandateResult{Success: false, MandateID: mandateID, Error: fmt.Sprintf("no pude resolver la organización activa: %v", err)}
	}

	identityPath := filepath.Join(c.Paths.AppDataDir, "authority", "identity.json")
	identity, err := authority.LoadOrCreateLocalIdentity(identityPath)
	if err != nil {
		logger.Error("no pude cargar la identidad de instalación: %v", err)
		return InstallMandateResult{Success: false, MandateID: mandateID, Error: fmt.Sprintf("no pude cargar la identidad de instalación: %v", err)}
	}

	receipt, err := mandateinstall.LoadLatestReceipt(c.Paths.AppDataDir, active.OrganizationID, identity.InstallationID, mandateID)
	if err != nil {
		logger.Error("%v", err)
		return InstallMandateResult{Success: false, MandateID: mandateID, Error: err.Error()}
	}

	delivery, content, err := mandateinstall.ExtractContent(receipt)
	if err != nil {
		logger.Error("%v", err)
		return InstallMandateResult{Success: false, MandateID: mandateID, Error: err.Error()}
	}

	path, alreadyInstalled, err := mandateinstall.MaterializeFile(cfg.MandatesRoot(), delivery.Envelope.MandateID, content)
	if err != nil {
		logger.Error("%v", err)
		return InstallMandateResult{Success: false, MandateID: delivery.Envelope.MandateID, Error: err.Error()}
	}

	if alreadyInstalled {
		logger.Success("mandate %s ya estaba materializado en %s (idempotente)", delivery.Envelope.MandateID, path)
	} else {
		logger.Success("mandate %s materializado en %s", delivery.Envelope.MandateID, path)
	}
	return InstallMandateResult{
		Success:          true,
		MandateID:        delivery.Envelope.MandateID,
		MandatePath:      path,
		AlreadyInstalled: alreadyInstalled,
	}
}
