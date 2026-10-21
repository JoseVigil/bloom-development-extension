// internal/orchestration/commands/mandate_offer_cmd.go
//
// 'nucleus mandate offer' — la oferta de Mandate que Wisdom muestra.
//
//	list       catálogo remoto de la organización activa (sin bytes)
//	installed  instalaciones locales (sin red)
//	install    instalación explícita de (definición, versión, digest) para un proyecto
//	prepare    preparación (T2): rechazada mientras la definición no la defina
//
// Instalar deja una instancia durable e inactiva: recibo, definición inmutable y
// mandate_state.json con status "installed". No escribe mandate.json, no adopta,
// no aprueba, no activa, no inicia workflows y no llama a AITAP. La autorización
// registrada es master_local: no afirma que Authority haya verificado al humano.
package commands

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"nucleus/internal/authority"
	"nucleus/internal/core"
	"nucleus/internal/governance"
	"nucleus/internal/mandatedefinition"
	"nucleus/internal/mandatedelivery"
	"nucleus/internal/mandateoffer"
	"nucleus/internal/supervisor"

	"github.com/spf13/cobra"
)

type offerCommandResult struct {
	Schema  string `json:"schema"`
	Command string `json:"command"`
	OK      bool   `json:"ok"`
	Result  any    `json:"result,omitempty"`
	Error   *struct {
		Code    string `json:"code"`
		Message string `json:"message"`
		Detail  any    `json:"detail,omitempty"`
	} `json:"error,omitempty"`
}

func offerFailure(command, code string, err error, detail any) offerCommandResult {
	r := offerCommandResult{Schema: "bloom.mandate-offer-cli/v1", Command: command}
	r.Error = &struct {
		Code    string `json:"code"`
		Message string `json:"message"`
		Detail  any    `json:"detail,omitempty"`
	}{Code: code, Message: err.Error(), Detail: detail}
	return r
}

func printOfferResult(c *core.Core, r offerCommandResult) {
	data, _ := json.MarshalIndent(r, "", "  ")
	fmt.Println(string(data))
	if !r.OK {
		os.Exit(1)
	}
}

func createMandateOfferCommand(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "offer",
		Short: "Oferta de Mandate de Wisdom: catálogo, instalación explícita e instalaciones locales",
		Long: `Oferta de Mandate que muestra Wisdom para la organización activa.

  list       lee el catálogo remoto habilitado (sin descargar bytes)
  installed  lista las instalaciones locales (sin red)
  install    instala exactamente (definición, versión, digest) para un proyecto elegible
  prepare    preparación (T2): rechazada mientras la definición no la defina

Instalar deja una instancia durable e inactiva (status "installed"): no adopta,
no aprueba, no activa ni inicia workflows. Todos los subcomandos responden JSON
con schema bloom.mandate-offer-cli/v1 y terminan con código 1 si ok=false.`,
		Example: `  nucleus mandate offer list
  nucleus mandate offer installed
  nucleus --json mandate offer list`,
		Annotations: map[string]string{
			"category":      "MANDATES",
			"json_response": `{"schema":"bloom.mandate-offer-cli/v1","command":"mandate offer","subcommands":["list","installed","install","prepare"]}`,
		},
	}
	cmd.AddCommand(createMandateOfferListCommand(c), createMandateOfferInstalledCommand(c),
		createMandateOfferInstallCommand(c), createMandateOfferPrepareCommand(c))
	return cmd
}

type offerEnv struct {
	active       *core.ActiveOrgContext
	identity     *authority.LocalIdentity
	mandatesRoot string
	client       *mandatedelivery.Client
}

func resolveOfferEnv(c *core.Core) (*offerEnv, string, error) {
	active, err := core.ResolveActiveOrgContext()
	if err != nil || active == nil {
		return nil, "active_organization_unavailable", fmt.Errorf("no pude resolver la organización activa: %v", err)
	}
	cfg, err := supervisor.LoadNucleusConfig()
	if err != nil {
		return nil, "nucleus_config_unavailable", fmt.Errorf("no pude leer nucleus.json: %v", err)
	}
	identity, err := authority.LoadExistingLocalIdentity(filepath.Join(c.Paths.AppDataDir, "authority", "identity.json"))
	if err != nil {
		return nil, "installation_identity_unavailable", err
	}
	client := &mandatedelivery.Client{BaseURL: active.AuthorityBaseURL, Signer: identity.PrivateKey,
		HTTP:    &http.Client{Timeout: 30 * time.Second},
		Store:   &mandatedelivery.Store{Root: filepath.Join(c.Paths.AppDataDir, "authority", "mandate-delivery")},
		Context: mandatedelivery.Context{OrganizationID: active.OrganizationID, InstallationID: identity.InstallationID}}
	return &offerEnv{active: active, identity: identity, mandatesRoot: cfg.MandatesRoot(), client: client}, "", nil
}

func createMandateOfferListCommand(c *core.Core) *cobra.Command {
	return &cobra.Command{
		Use:   "list",
		Short: "Lee el catálogo de ofertas habilitadas para la organización activa (sin descargar bytes)",
		Long: `Consulta GET /v1/mandate/offers firmado con la identidad de esta instalación y
devuelve el catálogo tal como lo publica Authority. No descarga definiciones ni
escribe estado local. Requiere organización activa e identidad de instalación existente.`,
		Example: `  nucleus mandate offer list
  nucleus --json mandate offer list`,
		Annotations: map[string]string{
			"category":      "MANDATES",
			"json_response": `{"schema":"bloom.mandate-offer-cli/v1","command":"mandate offer list","ok":true,"result":{"schema":"bloom.mandate-offers","schema_version":"1.0","organization_id":"ORGANIZATION_ID","offers":[{"definition_id":"DEFINITION_ID","version":"1.0.0","digest":"SHA256_HEX","label":"LABEL","purpose":"PURPOSE","publisher":{"publisher_id":"PUBLISHER_ID","key_id":"KEY_ID"},"published_at":"2026-10-19T00:00:00Z","size_bytes":1024,"requires":{"contract_version":4,"project":true},"preparation":{"status":"not_defined"}}]}}`,
		},
		Args: cobra.NoArgs,
		Run: func(cmd *cobra.Command, args []string) {
			const name = "mandate offer list"
			env, code, err := resolveOfferEnv(c)
			if err != nil {
				printOfferResult(c, offerFailure(name, code, err, nil))
				return
			}
			raw, err := env.client.ListOffers(context.Background())
			if err != nil {
				printOfferResult(c, offerFailure(name, offerErrorCode(err), err, nil))
				return
			}
			var catalog any
			if err := json.Unmarshal(raw, &catalog); err != nil {
				printOfferResult(c, offerFailure(name, "catalog_invalid", err, nil))
				return
			}
			printOfferResult(c, offerCommandResult{Schema: "bloom.mandate-offer-cli/v1", Command: name, OK: true, Result: catalog})
		},
	}
}

func createMandateOfferInstalledCommand(c *core.Core) *cobra.Command {
	return &cobra.Command{
		Use:   "installed",
		Short: "Lista las ofertas instaladas en esta máquina (sin red)",
		Long: `Lee las instancias bloom.mandate-instance bajo la carpeta .mandates de la
organización activa e informa si cada una es consistente con su definición
inmutable. Sólo lectura: no repara ni contacta Authority.`,
		Example: `  nucleus mandate offer installed
  nucleus --json mandate offer installed`,
		Annotations: map[string]string{
			"category":      "MANDATES",
			"json_response": `{"schema":"bloom.mandate-offer-cli/v1","command":"mandate offer installed","ok":true,"result":{"installations":[{"statePath":"PATH/mandate_state.json","instance":{"schema":"bloom.mandate-instance","schemaVersion":"1.0","mandateId":"MANDATE_ID","status":"installed","organizationId":"ORGANIZATION_ID","projectId":"PROJECT_ID","projectBinding":{"revision":"1","checkedAt":"2026-10-19T00:00:00Z"},"definition":{"definitionId":"DEFINITION_ID","version":"1.0.0","digest":"SHA256_HEX","label":"LABEL","publisherKeyId":"KEY_ID","preparation":"not_defined"},"receiptRef":"RECEIPT_REF","authorization":{"kind":"master_local","installationId":"INSTALLATION_ID"},"installedAt":"2026-10-19T00:00:00Z"},"consistent":true}]}}`,
		},
		Args: cobra.NoArgs,
		Run: func(cmd *cobra.Command, args []string) {
			const name = "mandate offer installed"
			cfg, err := supervisor.LoadNucleusConfig()
			if err != nil {
				printOfferResult(c, offerFailure(name, "nucleus_config_unavailable", err, nil))
				return
			}
			list, err := mandateoffer.Installations(c.Paths.AppDataDir, cfg.MandatesRoot())
			if err != nil {
				printOfferResult(c, offerFailure(name, "installations_unreadable", err, nil))
				return
			}
			if list == nil {
				list = []mandateoffer.InstalledInstance{}
			}
			printOfferResult(c, offerCommandResult{Schema: "bloom.mandate-offer-cli/v1", Command: name, OK: true,
				Result: map[string]any{"installations": list}})
		},
	}
}

func createMandateOfferInstallCommand(c *core.Core) *cobra.Command {
	var definitionID, version, digest, projectID string
	cmd := &cobra.Command{
		Use:   "install",
		Short: "Instala exactamente la versión seleccionada para un proyecto elegible (instalada e inactiva)",
		Long: `Requiere rol master local. Verifica el trust manifest, recibe la entrega firmada
de (definición, versión, digest), comprueba que el proyecto sea elegible
(binding "bound", ubicación "present", continuidad "matched") y deja recibo,
definición inmutable y mandate_state.json con status "installed". Repetir la
misma selección devuelve "already_installed". No adopta, no aprueba ni activa.`,
		Example: `  nucleus mandate offer install --definition DEFINITION_ID --version 1.0.0 --digest SHA256_HEX --project PROJECT_ID
  nucleus --json mandate offer install --definition DEFINITION_ID --version 1.0.0 --digest SHA256_HEX --project PROJECT_ID`,
		Annotations: map[string]string{
			"category":      "MANDATES",
			"json_response": `{"schema":"bloom.mandate-offer-cli/v1","command":"mandate offer install","ok":true,"result":{"status":"installed","mandateId":"MANDATE_ID","statePath":"PATH/mandate_state.json","definitionPath":"PATH/definition.json","receiptPath":"PATH/receipt.json","receiptStatus":"accepted","instance":{"schema":"bloom.mandate-instance","schemaVersion":"1.0","mandateId":"MANDATE_ID","status":"installed","organizationId":"ORGANIZATION_ID","projectId":"PROJECT_ID","definition":{"definitionId":"DEFINITION_ID","version":"1.0.0","digest":"SHA256_HEX"},"authorization":{"kind":"master_local","installationId":"INSTALLATION_ID"}}}}`,
		},
		Args: cobra.NoArgs,
		Run: func(cmd *cobra.Command, args []string) {
			const name = "mandate offer install"
			if err := requireMandateMaster(c); err != nil {
				printOfferResult(c, offerFailure(name, "master_required", err, nil))
				return
			}
			env, code, err := resolveOfferEnv(c)
			if err != nil {
				printOfferResult(c, offerFailure(name, code, err, nil))
				return
			}
			now := time.Now().UTC()
			binding := authority.Binding{OrganizationID: env.active.OrganizationID, InstallationID: env.identity.InstallationID}
			manifest, trust, err := authority.FetchAndVerifyTrustManifest(context.Background(), env.active.AuthorityBaseURL, binding,
				env.identity.PrivateKey, governance.AuthorityRoots(), &http.Client{Timeout: 30 * time.Second}, now)
			if err != nil {
				printOfferResult(c, offerFailure(name, "trust_manifest_invalid", err, nil))
				return
			}
			env.client.Context.Issuer = manifest.Payload.Issuer
			env.client.Context.Trust = trust
			installer := &mandateoffer.Installer{
				OrganizationID: env.active.OrganizationID, InstallationID: env.identity.InstallationID,
				AppDataDir: c.Paths.AppDataDir, MandatesRoot: env.mandatesRoot, Receiver: env.client,
				PublisherKeys: func() (map[string]ed25519.PublicKey, error) {
					return manifest.MandateDefinitionKeys(time.Now().UTC()), nil
				},
				Eligibility: func(project string) (mandateoffer.Eligibility, error) {
					return eligibilityFromContext(governance.ConfirmedContextEvidence(c.Paths.AppDataDir, env.active.OrgSlug, project)), nil
				},
				NewID: newUUID, Now: time.Now,
			}
			sel := mandatedelivery.OfferSelection{DefinitionID: definitionID, Version: version, Digest: digest}
			result, err := installer.Install(context.Background(), sel, projectID)
			if err != nil {
				var notEligible *mandateoffer.ProjectNotEligibleError
				if errors.As(err, &notEligible) {
					printOfferResult(c, offerFailure(name, "project_not_eligible", err, notEligible.Eligibility))
					return
				}
				printOfferResult(c, offerFailure(name, offerErrorCode(err), err, nil))
				return
			}
			printOfferResult(c, offerCommandResult{Schema: "bloom.mandate-offer-cli/v1", Command: name, OK: true, Result: result})
		},
	}
	cmd.Flags().StringVar(&definitionID, "definition", "", "definition_id de la oferta (requerido)")
	cmd.Flags().StringVar(&version, "version", "", "versión exacta mostrada en el catálogo (requerido)")
	cmd.Flags().StringVar(&digest, "digest", "", "digest exacto mostrado en el catálogo (requerido)")
	cmd.Flags().StringVar(&projectID, "project", "", "project_id elegible (requerido)")
	for _, f := range []string{"definition", "version", "digest", "project"} {
		_ = cmd.MarkFlagRequired(f)
	}
	return cmd
}

func createMandateOfferPrepareCommand(c *core.Core) *cobra.Command {
	var mandateID string
	cmd := &cobra.Command{
		Use:   "prepare",
		Short: "Preparación (T2) de una oferta instalada: rechazada mientras la definición no la defina",
		Long: `Punto de entrada de la preparación (T2) de una instancia instalada. Mientras la
definición declare preparation "not_defined", responde ok=false con
preparation_not_defined y no modifica la instancia.`,
		Example: `  nucleus mandate offer prepare --mandate-id MANDATE_ID
  nucleus --json mandate offer prepare --mandate-id MANDATE_ID`,
		Annotations: map[string]string{
			"category":      "MANDATES",
			"json_response": `{"schema":"bloom.mandate-offer-cli/v1","command":"mandate offer prepare","ok":false,"error":{"code":"preparation_not_defined","message":"mandate definition preparation is not defined: this version can be installed but not prepared"}}`,
		},
		Args: cobra.NoArgs,
		Run: func(cmd *cobra.Command, args []string) {
			const name = "mandate offer prepare"
			cfg, err := supervisor.LoadNucleusConfig()
			if err != nil {
				printOfferResult(c, offerFailure(name, "nucleus_config_unavailable", err, nil))
				return
			}
			err = mandateoffer.RefusePreparation(c.Paths.AppDataDir, cfg.MandatesRoot(), mandateID)
			if errors.Is(err, mandatedefinition.ErrNotPrepared) {
				printOfferResult(c, offerFailure(name, "preparation_not_defined", err, nil))
				return
			}
			if err == nil {
				err = errors.New("preparation is not implemented")
			}
			printOfferResult(c, offerFailure(name, "preparation_unavailable", err, nil))
		},
	}
	cmd.Flags().StringVar(&mandateID, "mandate-id", "", "mandateId de la instancia instalada (requerido)")
	_ = cmd.MarkFlagRequired("mandate-id")
	return cmd
}

func eligibilityFromContext(evidence map[string]any) mandateoffer.Eligibility {
	field := func(key, sub string) string {
		if m, ok := evidence[key].(map[string]any); ok {
			if v, ok := m[sub].(string); ok {
				return v
			}
			if v, ok := m[sub]; ok && v != nil {
				return fmt.Sprint(v)
			}
		}
		return ""
	}
	e := mandateoffer.Eligibility{
		BindingStatus: field("projectBinding", "status"), BindingRevision: field("projectBinding", "revision"),
		BindingCheckedAt: field("projectBinding", "checkedAt"),
		LocationStatus:   field("localLocation", "status"), ContinuityStatus: field("projectIdContinuity", "status"),
	}
	for _, key := range []string{"projectBinding", "localLocation", "projectIdContinuity"} {
		if r := field(key, "reason"); r != "" {
			e.Reason = r
			break
		}
	}
	return e
}

func offerErrorCode(err error) string {
	var httpErr *mandatedelivery.OfferHTTPError
	if errors.As(err, &httpErr) {
		if httpErr.Code != "" {
			return httpErr.Code
		}
		return fmt.Sprintf("backend_http_%d", httpErr.Status)
	}
	return "offer_install_failed"
}

func newUUID() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16]), nil
}
