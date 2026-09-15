// internal/mandateinstall/install.go
//
// Lógica pura de materialización de un mandate ya entregado y verificado como
// mandate.json local. Extraída de internal/orchestration/commands/mandate_install.go
// (ver Encargo_Implementacion_Materializacion_Mandate_Entregado_v1_0.md) a este paquete
// neutral porque internal/orchestration/commands ya importa internal/governance
// (requireMandateMaster → governance.RequireMaster) y por lo tanto internal/governance no
// puede importar internal/orchestration/commands sin crear un ciclo (governance → commands
// → governance). internal/mandateinstall no importa ni commands ni governance, así que
// ambos pueden importarlo sin ciclo — ver
// Encargo_Implementacion_AutoEncadenamiento_Sync_Install_y_Validacion_Backend_v1_0.md §2.1.
//
// Alcance (idéntico al del encargo original — esta mudanza no cambia comportamiento, sólo
// el paquete y la visibilidad de los símbolos):
//   - No re-verifica la firma Ed25519 del delivery — ya se verificó una vez, con éxito,
//     para que el recibo exista (mandatedelivery.Store.Accept sólo escribe tras Verify
//     exitoso). Esta materialización sólo recalcula sha256 del contenido decodificado
//     contra Envelope.Digest — chequeo de integridad barato, sin red, para descartar
//     corrupción en disco.
//   - No toca el recibo (mandatedelivery/ queda intacto), ni .ownership.json, ni ningún
//     camino de decisión/autorización — el mandate queda materializado en disco pero
//     INACTIVO: ningún motor de ejecución lo recoge todavía. Ese enganche es un encargo
//     aparte, deliberadamente separado, y no se abre acá.
//   - No sintetiza mandate_state.json — un mandate materializado desde delivery sólo
//     tiene mandate.json, a diferencia de uno construido localmente vía 'mandate build'.
package mandateinstall

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

	"nucleus/internal/mandatedelivery"
)

// sha256HexOf recalcula el sha256 de bytes ya en memoria — copia local de la misma
// fórmula que ya usa internal/orchestration/commands.sha256HexOf (mandate_publish.go); no
// es importable desde ahí sin crear el mismo ciclo que este paquete existe para evitar, así
// que se replica acá exactamente igual, sin lógica nueva.
func sha256HexOf(raw []byte) string {
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:])
}

// ── lectura del recibo (sólo lectura, sin red) ───────────────────────────────────────────

// mandateReceiptHashComponent replica el mismo esquema de hashing de paths que
// mandatedelivery.Store ya usa internamente (función privada "component" en store.go:
// prefix + hex(sha256(value))) — no es importable desde otro paquete al no estar
// exportada, así que se replica acá exactamente la misma fórmula sólo para poder ENUMERAR
// versiones ya aceptadas (mandatedelivery.Store no expone un método de listado). No se toca
// mandatedelivery/ ni se reimplementa nada de su lógica de verificación o escritura.
func mandateReceiptHashComponent(prefix, value string) string {
	sum := sha256.Sum256([]byte(value))
	return prefix + hex.EncodeToString(sum[:])
}

// mandateReceiptVersionsDir es {appDataDir}/authority/mandate-delivery/receipts/
// org-{hash}/installation-{hash}/mandate-{hash}/ — mismo Root que ya arma
// authority_command.go para mandatedelivery.Store (filepath.Join(appDataDir, "authority"))
// — el mandateID es fijo por parámetro, así que sólo falta enumerar los subdirectorios
// version-* de ese path para encontrar el recibo más reciente.
func mandateReceiptVersionsDir(appDataDir, organizationID, installationID, mandateID string) string {
	return filepath.Join(appDataDir, "authority", "mandate-delivery", "receipts",
		mandateReceiptHashComponent("org-", organizationID),
		mandateReceiptHashComponent("installation-", installationID),
		mandateReceiptHashComponent("mandate-", mandateID),
	)
}

// LoadLatestReceipt recorre mandate-{hash}/version-*/receipt.json y devuelve el de
// AcceptedAt más reciente (§1 del encargo original: "un solo recibo activo por mandateID,
// camino feliz — si hubiera más de una versión entregada, se toma la de AcceptedAt más
// reciente; no se diseña resolución de conflictos más allá de eso"). No re-verifica la
// firma del delivery (ya se verificó una vez, con éxito, en mandatedelivery.Store.Accept
// para que el recibo exista) — sólo decodifica el JSON ya escrito en disco.
func LoadLatestReceipt(appDataDir, organizationID, installationID, mandateID string) (mandatedelivery.Receipt, error) {
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

// ── extracción del contenido ──────────────────────────────────────────────────────────────

// ExtractContent decodifica receipt.Body (ya viene []byte decodificado del base64 por el
// tag json:"body_base64" de mandatedelivery.Receipt.Body) como mandatedelivery.Delivery,
// decodifica delivery.MandateBase64 y confirma sha256(content) contra
// delivery.Envelope.Digest — el único chequeo de integridad que hace esta materialización
// (sin red, sin re-verificación de firma).
func ExtractContent(receipt mandatedelivery.Receipt) (mandatedelivery.Delivery, []byte, error) {
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

// ── escritura (mismo criterio de inmutabilidad que SignMandateActivity) ─────────────────────

// MaterializeFile escribe {mandatesRoot}/{mandateID}/mandate.json si no existe todavía. Si
// ya existe, no se sobreescribe: mismo contenido → idempotente (alreadyInstalled=true,
// éxito sin tocar el archivo); contenido distinto → error duro (dos contenidos distintos
// reclamando el mismo mandateID no debería poder pasar — no se decide cuál gana).
func MaterializeFile(mandatesRoot, mandateID string, content []byte) (path string, alreadyInstalled bool, err error) {
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
