// internal/orchestration/commands/mandate_install.go
//
// Implementa Encargo_Implementacion_Materializacion_Mandate_Entregado_v1_0.md.
//
// Cierra el tramo entre "mandate entregado y verificado" (recibo en
// AppDataDir/authority/mandate-delivery/receipts/..., escrito por
// mandatedelivery.Store.Accept — ver authority_command.go, caso "sync", sin cambios) y
// "mandate.json local legible por 'mandate status' o un futuro motor de ejecución" — el
// mismo layout que ya produce SignMandateActivity para un mandate construido localmente.
//
// Alcance (§1 del encargo, explícito y no reabierto acá):
//   - No re-verifica la firma Ed25519 del delivery — ya se verificó una vez, con éxito,
//     para que el recibo exista (mandatedelivery.Store.Accept sólo escribe tras Verify
//     exitoso). Esta materialización sólo recalcula sha256 del contenido decodificado
//     contra Envelope.Digest — chequeo de integridad barato, sin red, para descartar
//     corrupción en disco.
//   - No toca el recibo (mandatedelivery/ queda intacto), ni .ownership.json, ni
//     authority_command.go, ni ningún camino de decisión/autorización — el mandate queda
//     materializado en disco pero INACTIVO: ningún motor de ejecución lo recoge todavía.
//     Ese enganche es un encargo aparte, deliberadamente separado, y no se abre acá.
//   - No sintetiza mandate_state.json — un mandate materializado desde delivery sólo
//     tiene mandate.json, a diferencia de uno construido localmente vía 'mandate build'.
package commands

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"nucleus/internal/authority"
	"nucleus/internal/core"
	"nucleus/internal/mandatedelivery"
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
// no hace falta logger ni categoría nueva.
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

	receipt, err := loadLatestMandateReceipt(c.Paths.AppDataDir, active.OrganizationID, identity.InstallationID, mandateID)
	if err != nil {
		logger.Error("%v", err)
		return InstallMandateResult{Success: false, MandateID: mandateID, Error: err.Error()}
	}

	delivery, content, err := extractMandateContent(receipt)
	if err != nil {
		logger.Error("%v", err)
		return InstallMandateResult{Success: false, MandateID: mandateID, Error: err.Error()}
	}

	path, alreadyInstalled, err := materializeMandateFile(cfg.MandatesRoot(), delivery.Envelope.MandateID, content)
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

// ── lectura del recibo (sólo lectura, sin red — §2.1 del encargo) ───────────────────────

// mandateReceiptHashComponent replica el mismo esquema de hashing de paths que
// mandatedelivery.Store ya usa internamente (función privada "component" en store.go:
// prefix + hex(sha256(value))) — no es importable desde otro paquete al no estar
// exportada, así que se replica acá exactamente la misma fórmula sólo para poder ENUMERAR
// versiones ya aceptadas (mandatedelivery.Store no expone un método de listado). No se
// toca mandatedelivery/ ni se reimplementa nada de su lógica de verificación o escritura.
func mandateReceiptHashComponent(prefix, value string) string {
	sum := sha256.Sum256([]byte(value))
	return prefix + hex.EncodeToString(sum[:])
}

// mandateReceiptVersionsDir es {AppDataDir}/authority/mandate-delivery/receipts/
// org-{hash}/installation-{hash}/mandate-{hash}/ — mismo Root que ya arma
// authority_command.go para mandatedelivery.Store (filepath.Join(dir, "mandate-delivery"),
// dir = AppDataDir/authority) — el mandateID es fijo por --id, así que sólo falta
// enumerar los subdirectorios version-* de ese path para encontrar el recibo más reciente.
func mandateReceiptVersionsDir(appDataDir, organizationID, installationID, mandateID string) string {
	return filepath.Join(appDataDir, "authority", "mandate-delivery", "receipts",
		mandateReceiptHashComponent("org-", organizationID),
		mandateReceiptHashComponent("installation-", installationID),
		mandateReceiptHashComponent("mandate-", mandateID),
	)
}

// loadLatestMandateReceipt recorre mandate-{hash}/version-*/receipt.json y devuelve el de
// AcceptedAt más reciente (§1 del encargo: "un solo recibo activo por mandateID, camino
// feliz — si hubiera más de una versión entregada, se toma la de AcceptedAt más reciente;
// no se diseña resolución de conflictos más allá de eso"). No re-verifica la firma del
// delivery (ya se verificó una vez, con éxito, en mandatedelivery.Store.Accept para que el
// recibo exista) — sólo decodifica el JSON ya escrito en disco.
func loadLatestMandateReceipt(appDataDir, organizationID, installationID, mandateID string) (mandatedelivery.Receipt, error) {
	dir := mandateReceiptVersionsDir(appDataDir, organizationID, installationID, mandateID)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return mandatedelivery.Receipt{}, fmt.Errorf("no hay una entrega verificada para %s — corré 'nucleus authority sync' primero", mandateID)
		}
		return mandatedelivery.Receipt{}, fmt.Errorf("no pude leer %s: %w", dir, err)
	}

	var versionDirs []string
	for _, e := range entries {
		if e.IsDir() && strings.HasPrefix(e.Name(), "version-") {
			versionDirs = append(versionDirs, e.Name())
		}
	}
	if len(versionDirs) == 0 {
		return mandatedelivery.Receipt{}, fmt.Errorf("no hay una entrega verificada para %s — corré 'nucleus authority sync' primero", mandateID)
	}

	var receipts []mandatedelivery.Receipt
	for _, name := range versionDirs {
		raw, err := os.ReadFile(filepath.Join(dir, name, "receipt.json"))
		if err != nil {
			return mandatedelivery.Receipt{}, fmt.Errorf("no pude leer el recibo de %s en %s: %w", mandateID, name, err)
		}
		var receipt mandatedelivery.Receipt
		if err := json.Unmarshal(raw, &receipt); err != nil {
			return mandatedelivery.Receipt{}, fmt.Errorf("recibo de %s en %s no es JSON válido: %w", mandateID, name, err)
		}
		receipts = append(receipts, receipt)
	}

	sort.Slice(receipts, func(i, j int) bool { return receipts[i].AcceptedAt.After(receipts[j].AcceptedAt) })
	return receipts[0], nil
}

// ── extracción del contenido (§2.2 del encargo) ─────────────────────────────────────────

// extractMandateContent decodifica receipt.Body (ya viene []byte decodificado del
// base64 por el tag json:"body_base64" de mandatedelivery.Receipt.Body) como
// mandatedelivery.Delivery, decodifica delivery.MandateBase64 y confirma sha256(content)
// contra delivery.Envelope.Digest — el único chequeo de integridad que hace esta
// materialización (sin red, sin re-verificación de firma).
func extractMandateContent(receipt mandatedelivery.Receipt) (mandatedelivery.Delivery, []byte, error) {
	var delivery mandatedelivery.Delivery
	if err := json.Unmarshal(receipt.Body, &delivery); err != nil {
		return mandatedelivery.Delivery{}, nil, fmt.Errorf("el recibo de %s está corrupto en disco, no se materializa: %w", receipt.MandateID, err)
	}
	content, err := base64.StdEncoding.DecodeString(delivery.MandateBase64)
	if err != nil {
		return mandatedelivery.Delivery{}, nil, fmt.Errorf("el recibo de %s está corrupto en disco, no se materializa: %w", receipt.MandateID, err)
	}
	if sha256HexOf(content) != delivery.Envelope.Digest {
		return mandatedelivery.Delivery{}, nil, fmt.Errorf("el recibo de %s está corrupto en disco, no se materializa", receipt.MandateID)
	}
	return delivery, content, nil
}

// ── escritura (§2.3 del encargo — mismo criterio de inmutabilidad que SignMandateActivity) ──

// materializeMandateFile escribe {mandatesRoot}/{mandateID}/mandate.json si no existe
// todavía. Si ya existe, no se sobreescribe: mismo contenido → idempotente
// (alreadyInstalled=true, éxito sin tocar el archivo); contenido distinto → error duro (dos
// contenidos distintos reclamando el mismo mandateID no debería poder pasar — no se decide
// cuál gana, ver §2.3/§5 del encargo).
func materializeMandateFile(mandatesRoot, mandateID string, content []byte) (path string, alreadyInstalled bool, err error) {
	dir := filepath.Join(mandatesRoot, mandateID)
	path = filepath.Join(dir, "mandate.json")

	existing, readErr := os.ReadFile(path)
	if readErr == nil {
		if sha256HexOf(existing) == sha256HexOf(content) {
			return path, true, nil
		}
		return "", false, fmt.Errorf("%s ya existe con contenido distinto al del recibo — no se pisa (mandateID %s)", path, mandateID)
	}
	if !os.IsNotExist(readErr) {
		return "", false, fmt.Errorf("no pude leer %s: %w", path, readErr)
	}

	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", false, fmt.Errorf("no pude crear %s: %w", dir, err)
	}
	if err := os.WriteFile(path, content, 0644); err != nil {
		return "", false, fmt.Errorf("no pude escribir %s: %w", path, err)
	}
	return path, false, nil
}
