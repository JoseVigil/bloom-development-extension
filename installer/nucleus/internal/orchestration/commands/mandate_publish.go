// internal/orchestration/commands/mandate_publish.go
//
// Implementa Encargo_Implementacion_Publicacion_Mandate_Bootstrap_v1_0.md §2.2.
//
// Cierra el tramo entre "mandate firmado en disco" (mandate.json escrito por
// SignMandateActivity, ver mandate_genesis_sign_activity.go — sin cambios) y "fila en
// Backend" (POST /v1/mandate/publish, ver mandate-publish.ts) — publica el artefacto ya
// firmado hacia el Marketplace de Backend y, opcionalmente, lo asigna como bootstrap de
// la organización activa.
//
// Alcance de esta ronda (§1 del encargo): sólo el camino feliz de "primer mandate de una
// organización nueva" (mandateType genesis), sin body-binding en la firma S2S (reusa
// BLOOM-INSTALLATION-AUTH-v1, mismo criterio que mandatedelivery.Client.Receive), y
// metadata mínima (description default cadena vacía, pillar/origin_type no se exponen).
//
// GAP DE DISEÑO señalado (no resuelto acá, ver cierre): el encargo lista los flags de
// este comando en §2.2 (--id, --authority-url, --slug, --visibility, --description,
// --bootstrap) pero NO incluye --version — y sin embargo el contrato de Backend
// (PublishMandateBody en mandate-publish.ts, §2.1) exige `version` como campo
// obligatorio, y mandate.json (MandateJSON en mandate_genesis_sign_activity.go) no tiene
// ningún campo de versión: sólo mandateId/mandateType/project/status/signedAt/operational.
// Se agrega acá un flag --version con default "1.0.0" (primera publicación de un mandate
// genesis recién nacido) para poder cumplir el contrato de Backend — no es parte de la
// tabla de archivos/flags que cerró el encargo, así que se señala explícitamente en vez
// de asumirlo en silencio.
//
// EXTRACCIÓN DE FIRMA (§2.2 paso 4): el encargo pide extraer la construcción de firma
// BLOOM-INSTALLATION-AUTH-v1 a una función compartida en internal/authority si no existe
// ya una reutilizable. Se confirmó (grep) que NO existe: authority.SyncClient.signedRequest
// (sync.go) es un método privado atado a Binding/SyncClient, y mandatedelivery.Client.Receive
// (client.go) la repite inline — ninguna de las dos está exportada de forma reusable desde
// otro paquete. Extraerla a internal/authority requeriría tocar un archivo fuera de la
// tabla exacta de §3 de este encargo ("no agregues ni saques nada de ahí sin avisar"), así
// que se prioriza la tabla de archivos y esta construcción queda inline acá (privada a
// este archivo, no en mandatedelivery ni sync.go — cero cambios ahí, igual que pide §2.3).
// Señalado en el cierre para que se decida aparte si vale la pena esa extracción.
package commands

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"nucleus/internal/authority"
	"nucleus/internal/core"
	"nucleus/internal/supervisor"

	"github.com/spf13/cobra"
)

// sha256HexOf recalcula el sha256 del mandate leído del disco — nunca se confía en un
// digest ya guardado en otro lado, mismo criterio de integridad que
// resolveMandateDelivery (Backend) usa del lado de lectura.
func sha256HexOf(raw []byte) string {
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:])
}

const mandatePublishInstallationAuthDomain = "BLOOM-INSTALLATION-AUTH-v1"

// mandateJSONStatus es la forma mínima de mandate.json que este comando necesita leer —
// sólo status, para el chequeo de precondición. No reimplementa MandateJSON (definida en
// mandate_genesis_sign_activity.go, package orchestration/activities, no importable acá
// sin crear un acoplamiento nuevo entre commands y activities que el encargo no pidió) —
// decodifica sólo el campo que necesita, igual que ya hace mandateStatusSubcommand más
// arriba en este mismo paquete (mandate.go) al mostrar mandate.json crudo.
type mandateJSONStatus struct {
	Status string `json:"status"`
}

// publishMandateRequestBody espeja PublishMandateBody de mandate-publish.ts (Backend,
// §2.1 del encargo) — mismos nombres de campo, mismo criterio de obligatoriedad.
type publishMandateRequestBody struct {
	Slug          string `json:"slug"`
	Version       string `json:"version"`
	Description   string `json:"description,omitempty"`
	Visibility    string `json:"visibility"`
	MandateBase64 string `json:"mandate_base64"`
	SHA256        string `json:"sha256"`
	Bootstrap     bool   `json:"bootstrap"`
}

type publishMandateResponseBody struct {
	MandateID         string `json:"mandate_id"`
	MandateVersionID  string `json:"mandate_version_id"`
	BootstrapAssigned bool   `json:"bootstrap_assigned"`
}

// PublishMandateResult es lo que imprime el comando (--json o interactivo).
type PublishMandateResult struct {
	Success           bool   `json:"success"`
	MandateID         string `json:"mandate_id"`
	MandateVersionID  string `json:"mandate_version_id,omitempty"`
	BootstrapAssigned bool   `json:"bootstrap_assigned,omitempty"`
	Error             string `json:"error,omitempty"`
}

var mandatePublishHTTPClient *http.Client
var mandatePublishNow = func() time.Time { return time.Now().UTC() }

func createPublishMandateSubcommand(c *core.Core) *cobra.Command {
	var mandateID, authorityURL, slug, visibility, description, version string
	var bootstrap bool

	cmd := &cobra.Command{
		Use:   "publish",
		Short: "Publica un mandate firmado (mandate.json) hacia Backend y, opcionalmente, lo asigna como bootstrap de la organización",
		Long: `Sube el mandate ya firmado en {mandatesRoot}/{mandateID}/mandate.json a Backend
(POST /v1/mandate/publish) — recalcula su sha256, firma el request S2S con la identidad de
instalación de esta org activa (mismo dominio BLOOM-INSTALLATION-AUTH-v1 que 'nucleus
authority sync'), y publica. Con --bootstrap=true (default) esa versión queda asignada como
el mandate de bootstrap de la organización: una instalación nueva que llame a
GET /v1/mandate/bootstrap la recibe.

Requiere que 'nucleus auth link' (o 'nucleus authority sync') ya haya corrido antes — la
instalación necesita estar registrada contra Authority.`,
		Args: cobra.NoArgs,
		Annotations: map[string]string{
			"category": "MANDATES",
			"json_response": `{
  "success": true,
  "mandate_id": "3f9c1a2e-8b7d-4c1a-9e2f-1a2b3c4d5e6f",
  "mandate_version_id": "a1b2c3d4-...",
  "bootstrap_assigned": true
}`,
		},
		Example: `  nucleus mandate publish --id 3f9c1a2e-8b7d-4c1a-9e2f-1a2b3c4d5e6f --authority-url https://authority.bloom.dev --slug genesis-bootstrap
  nucleus mandate publish --id 3f9c1a2e-... --authority-url https://authority.bloom.dev --slug genesis-bootstrap --bootstrap=false
  nucleus --json mandate publish --id 3f9c1a2e-... --authority-url https://authority.bloom.dev --slug genesis-bootstrap`,
		PreRun: func(cmd *cobra.Command, args []string) {
			if err := requireMandateMaster(c); err != nil {
				fmt.Printf("Error: %v\n", err)
				os.Exit(1)
			}
		},

		Run: func(cmd *cobra.Command, args []string) {
			result := runPublishMandate(c, mandateID, authorityURL, slug, visibility, description, version, bootstrap)
			if c.IsJSON {
				data, _ := json.MarshalIndent(result, "", "  ")
				fmt.Println(string(data))
			} else if result.Success {
				c.Logger.Printf("[SUCCESS] ✅ Mandate publicado: %s (versión %s, bootstrap_assigned=%t)", result.MandateID, result.MandateVersionID, result.BootstrapAssigned)
			} else {
				c.Logger.Printf("[ERROR] ❌ No se pudo publicar el mandate: %s", result.Error)
			}
			if !result.Success {
				os.Exit(1)
			}
		},
	}
	cmd.Flags().StringVar(&mandateID, "id", "", "ID del mandate ya construido y firmado (requerido)")
	cmd.Flags().StringVar(&authorityURL, "authority-url", "", "URL base del backend de Authority (requerido)")
	cmd.Flags().StringVar(&slug, "slug", "", "Slug del mandate en el Marketplace (requerido)")
	cmd.Flags().StringVar(&visibility, "visibility", "private", "Visibilidad del mandate ('private' o 'public')")
	cmd.Flags().StringVar(&description, "description", "", "Descripción del mandate (opcional)")
	// Ver GAP DE DISEÑO en el comentario de cabecera del archivo: no estaba en la lista
	// de flags de §2.2, se agrega para poder cumplir el campo obligatorio `version` del
	// contrato de Backend (§2.1).
	cmd.Flags().StringVar(&version, "version", "1.0.0", "Versión publicada del mandate — GAP: no especificada por §2.2, ver comentario de cabecera del archivo")
	cmd.Flags().BoolVar(&bootstrap, "bootstrap", true, "Asigna esta versión como el mandate de bootstrap de la organización activa")
	_ = cmd.MarkFlagRequired("id")
	_ = cmd.MarkFlagRequired("authority-url")
	_ = cmd.MarkFlagRequired("slug")
	return cmd
}

// runPublishMandate hace el trabajo real; separado de Run para que sea testeable sin
// pasar por cobra. Logging estructurado vía core.InitLogger(&c.Paths, "MANDATE", c.IsJSON)
// — mismo mecanismo que 'nucleus auth link' (ver auth_link.go, corregido en
// Encargo_Correccion_Nucleus_Comando_Vinculacion_Organizacion_v2_0.md §2.2) y que ya
// cumple la Guía Maestra de Comandos y la spec de Telemetría — "MANDATE" ya es una
// categoría de primera clase en internal/core/logger.go (icono 📋 y descripción propios)
// antes de este cambio, así que no hace falta un logger ni una categoría nueva.
func runPublishMandate(c *core.Core, mandateID, authorityURL, slug, visibility, description, version string, bootstrap bool) PublishMandateResult {
	logger, err := core.InitLogger(&c.Paths, "MANDATE", c.IsJSON)
	if err != nil {
		return PublishMandateResult{Success: false, Error: fmt.Sprintf("no pude inicializar el logger de MANDATE: %v", err)}
	}
	defer logger.Close()

	if mandateID == "" || authorityURL == "" || slug == "" {
		return PublishMandateResult{Success: false, Error: "--id, --authority-url y --slug son requeridos"}
	}
	if visibility != "private" && visibility != "public" {
		return PublishMandateResult{Success: false, Error: fmt.Sprintf("--visibility inválido: %q (esperaba 'private' o 'public')", visibility)}
	}

	cfg, err := supervisor.LoadNucleusConfig()
	if err != nil {
		logger.Error("no pude leer nucleus.json: %v", err)
		return PublishMandateResult{Success: false, Error: fmt.Sprintf("no pude leer nucleus.json: %v", err)}
	}

	mandateBytes, err := readSignedMandateFile(cfg.MandatesRoot(), mandateID)
	if err != nil {
		logger.Error("%v", err)
		return PublishMandateResult{Success: false, Error: err.Error()}
	}

	active, err := core.ResolveActiveOrgContext()
	if err != nil {
		logger.Error("no pude resolver la organización activa: %v", err)
		return PublishMandateResult{Success: false, Error: fmt.Sprintf("no pude resolver la organización activa: %v", err)}
	}

	identityPath := filepath.Join(c.Paths.AppDataDir, "authority", "identity.json")
	identity, err := authority.LoadOrCreateLocalIdentity(identityPath)
	if err != nil {
		logger.Error("no pude cargar la identidad de instalación: %v", err)
		return PublishMandateResult{Success: false, Error: fmt.Sprintf("no pude cargar la identidad de instalación: %v", err)}
	}

	digest := sha256HexOf(mandateBytes)
	requestBody := publishMandateRequestBody{
		Slug:          slug,
		Version:       version,
		Description:   description,
		Visibility:    visibility,
		MandateBase64: base64.StdEncoding.EncodeToString(mandateBytes),
		SHA256:        digest,
		Bootstrap:     bootstrap,
	}

	logger.Info("Publicando mandate %s (slug=%s, versión=%s) contra %s", mandateID, slug, version, authorityURL)
	response, err := postMandatePublish(context.Background(), authorityURL, active.OrganizationID, identity, requestBody, mandatePublishNow())
	if err != nil {
		logger.Error("publicación fallida: %v", err)
		return PublishMandateResult{Success: false, Error: err.Error()}
	}

	logger.Success("mandate publicado: %s (versión %s, bootstrap_assigned=%t)", response.MandateID, response.MandateVersionID, response.BootstrapAssigned)
	return PublishMandateResult{
		Success:           true,
		MandateID:         response.MandateID,
		MandateVersionID:  response.MandateVersionID,
		BootstrapAssigned: response.BootstrapAssigned,
	}
}

// readSignedMandateFile lee {mandatesRoot}/{mandateID}/mandate.json, falla claro si no
// existe o si su status no es "signed" — sin llamar a Backend en ningún caso de error
// (§4 del encargo: "mandate no encontrado o no firmado → error claro sin llamar al
// Backend").
func readSignedMandateFile(mandatesRoot, mandateID string) ([]byte, error) {
	path := filepath.Join(mandatesRoot, mandateID, "mandate.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("mandate no encontrado: no existe %s — ¿corriste 'nucleus mandate build --id %s' hasta que termine?", path, mandateID)
		}
		return nil, fmt.Errorf("no pude leer %s: %w", path, err)
	}
	var status mandateJSONStatus
	if err := json.Unmarshal(raw, &status); err != nil {
		return nil, fmt.Errorf("%s no es JSON válido: %w", path, err)
	}
	if status.Status != "signed" {
		return nil, fmt.Errorf("mandate %s no está firmado todavía (status=%q en %s) — esperá a que 'mandate build' termine", mandateID, status.Status, path)
	}
	return raw, nil
}

// postMandatePublish firma y envía el POST a /v1/mandate/publish. Mismo dominio, mismo
// canonical y mismos headers que mandatedelivery.Client.Receive (client.go) y
// authority.SyncClient.signedRequest (sync.go) — ver nota de "EXTRACCIÓN DE FIRMA" en la
// cabecera del archivo sobre por qué esta construcción queda inline acá en vez de
// reexportada desde internal/authority.
func postMandatePublish(ctx context.Context, authorityURL, organizationID string, identity *authority.LocalIdentity, body publishMandateRequestBody, now time.Time) (publishMandateResponseBody, error) {
	if len(identity.PrivateKey) != ed25519.PrivateKeySize {
		return publishMandateResponseBody{}, fmt.Errorf("clave privada de instalación inválida")
	}
	const path = "/v1/mandate/publish"
	url := strings.TrimRight(authorityURL, "/") + path + "?org=" + organizationID

	timestamp := now.UTC().Format(time.RFC3339Nano)
	authPayload, _ := json.Marshal(map[string]string{
		"installation_id": identity.InstallationID,
		"organization_id": organizationID,
		"method":          http.MethodPost,
		"path":            path,
		"timestamp":       timestamp,
	})
	canonical, err := authority.Canonicalize(authPayload)
	if err != nil {
		return publishMandateResponseBody{}, fmt.Errorf("no pude canonicalizar el payload de firma: %w", err)
	}
	signature := ed25519.Sign(identity.PrivateKey, append(append([]byte(mandatePublishInstallationAuthDomain), 0), canonical...))

	encodedBody, err := json.Marshal(body)
	if err != nil {
		return publishMandateResponseBody{}, fmt.Errorf("no pude serializar el body de publish: %w", err)
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(encodedBody))
	if err != nil {
		return publishMandateResponseBody{}, err
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Bloom-Installation-Id", identity.InstallationID)
	request.Header.Set("X-Bloom-Timestamp", timestamp)
	request.Header.Set("X-Bloom-Signature", base64.StdEncoding.EncodeToString(signature))

	client := mandatePublishHTTPClient
	if client == nil {
		client = &http.Client{Timeout: 30 * time.Second}
	}
	response, err := client.Do(request)
	if err != nil {
		return publishMandateResponseBody{}, fmt.Errorf("request a %s falló: %w", url, err)
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return publishMandateResponseBody{}, fmt.Errorf("no pude leer la respuesta de %s: %w", url, err)
	}
	if response.StatusCode != http.StatusOK {
		return publishMandateResponseBody{}, fmt.Errorf("publish HTTP %d: %s", response.StatusCode, strings.TrimSpace(string(raw)))
	}
	var parsed publishMandateResponseBody
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return publishMandateResponseBody{}, fmt.Errorf("respuesta de publish no es JSON válido: %w", err)
	}
	return parsed, nil
}
