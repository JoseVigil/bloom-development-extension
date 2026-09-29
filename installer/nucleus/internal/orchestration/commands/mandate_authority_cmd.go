package commands

import (
	"bufio"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/spf13/cobra"
	"nucleus/internal/authority"
	"nucleus/internal/core"
	"nucleus/internal/orchestration/mandatecontract"
	"nucleus/internal/orchestration/mandateintelligence"
	"nucleus/internal/orchestration/mandatestate"
	"nucleus/internal/orchestration/temporal"
	"nucleus/internal/supervisor"
)

func createMandateActCommand(c *core.Core, operation string) *cobra.Command {
	var id string
	var model, modelID, supply, policyRef, registryRef, maxUSD string
	var maxTotalTokens, maxOutputTokens int
	short := "Aprueba el contrato exacto de un Mandate con consentimiento humano de Authority"
	if operation == "activate" {
		short = "Activa un Mandate firmado con un consentimiento humano distinto"
	}
	cmd := &cobra.Command{Use: operation, Short: short, Long: short + ". Abra la URL de Authority, confirme los datos mostrados y pegue aquí la atestación firmada. El acto se registra sólo tras verificar Authority, permisos y contrato persistido.",
		Example: "  nucleus mandate " + operation + " --id MANDATE_ID\n  nucleus --json mandate " + operation + " --id MANDATE_ID", Args: cobra.NoArgs,
		Annotations: map[string]string{"category": "MANDATES", "json_response": `{"success":true,"mandateId":"MANDATE_ID","operation":"` + operation + `","contractDigest":"SHA256","principalId":"AUTHORITY_PRINCIPAL"}`},
		RunE: func(cmd *cobra.Command, args []string) error {
			selection := &mandatecontract.Intelligence{Model: model, ModelID: modelID, PolicyRef: policyRef, RegistryRef: registryRef, MaxUSD: maxUSD, MaxTotalTokens: maxTotalTokens, MaxOutputTokens: maxOutputTokens}
			if operation == "approve" && supply == "local" {
				selection.Privacy = "local"
			} else if operation == "approve" && supply != "" && supply != "cloud" {
				return errors.New("unsupported Mandate intelligence supply")
			}
			result, err := runMandateAct(cmd, c, operation, id, selection)
			if err != nil {
				if c != nil && c.IsJSON {
					raw, _ := json.Marshal(map[string]any{"success": false, "mandateId": id, "operation": operation, "error": err.Error()})
					fmt.Fprintln(cmd.OutOrStdout(), string(raw))
				}
				return err
			}
			if c != nil && c.IsJSON {
				raw, _ := json.MarshalIndent(result, "", "  ")
				fmt.Fprintln(cmd.OutOrStdout(), string(raw))
			} else {
				fmt.Fprintf(cmd.OutOrStdout(), "Mandate %s: %s registrado para %s\n", id, operation, result.PrincipalID)
			}
			return nil
		},
	}
	if operation == "approve" {
		cmd.Long += " Requiere un modelo disponible, política y registro verificados y límites explícitos. Para suministro local comprueba AITAP preflight y la política de acceso antes de firmar; los valores quedan dentro del contrato."
		cmd.Example = "  nucleus mandate approve --id MANDATE_ID --model MODEL_ID --policy POLICY.json --registry REGISTRY.json --max-usd USD --max-total-tokens TOKENS --max-output-tokens TOKENS\n  nucleus --json mandate approve --id MANDATE_ID --model MODEL_ID --policy POLICY.json --registry REGISTRY.json --max-usd USD --max-total-tokens TOKENS --max-output-tokens TOKENS"
		cmd.Example += "\n  nucleus mandate approve --id MANDATE_ID --supply local --model-id CATALOG_MODEL_ID --policy LOCAL_POLICY.json --registry LOCAL_REGISTRY.json --max-usd 0 --max-total-tokens TOKENS --max-output-tokens TOKENS"
	}
	cmd.Flags().StringVar(&id, "id", "", "ID del Mandate (requerido)")
	if operation == "approve" {
		cmd.Flags().StringVar(&model, "model", "", "Modelo Anthropic elegido para este contrato")
		cmd.Flags().StringVar(&supply, "supply", "cloud", "Suministro de inteligencia: cloud o local")
		cmd.Flags().StringVar(&modelID, "model-id", "", "ID del modelo local en el catálogo AITAP")
		cmd.Flags().StringVar(&policyRef, "policy", "", "Política AITAP verificada que se firmará")
		cmd.Flags().StringVar(&registryRef, "registry", "", "Registro AITAP verificado del modelo")
		cmd.Flags().StringVar(&maxUSD, "max-usd", "", "Presupuesto máximo explícito en USD")
		cmd.Flags().IntVar(&maxTotalTokens, "max-total-tokens", 0, "Límite total explícito de tokens")
		cmd.Flags().IntVar(&maxOutputTokens, "max-output-tokens", 0, "Límite explícito de tokens de salida")
	}
	_ = cmd.MarkFlagRequired("id")
	return cmd
}

type mandateActResult struct {
	Success        bool   `json:"success"`
	MandateID      string `json:"mandateId"`
	Operation      string `json:"operation"`
	ContractDigest string `json:"contractDigest"`
	PrincipalID    string `json:"principalId"`
}

func runMandateAct(cmd *cobra.Command, c *core.Core, operation, id string, selected *mandatecontract.Intelligence) (mandateActResult, error) {
	var result mandateActResult
	if operation != "approve" && operation != "activate" || id == "" || filepath.Base(id) != id {
		return result, errors.New("Mandate act or ID invalid")
	}
	active, err := core.ResolveActiveOrgContext()
	if err != nil {
		return result, err
	}
	cfg, err := supervisor.LoadNucleusConfig()
	if err != nil {
		return result, err
	}
	if filepath.Clean(cfg.MandatesRoot()) != filepath.Join(active.NucleusRoot, ".mandates") {
		return result, errors.New("Mandate workspace differs from active organization")
	}
	dir := filepath.Join(cfg.MandatesRoot(), id)
	authorityDir := filepath.Join(core.ResolveAppDataDir(), "authority")
	identityPath := filepath.Join(authorityDir, "identity.json")
	identity, err := authority.LoadExistingLocalIdentity(identityPath)
	if err != nil {
		return result, err
	}
	if c == nil {
		return result, errors.New("Nucleus command context unavailable")
	}
	mandateLog, err := core.InitLogger(&c.Paths, "MANDATE", c.IsJSON)
	if err != nil {
		return result, err
	}
	defer mandateLog.Close()
	emit := func(event string, fields map[string]any) {
		fields["event"] = event
		fields["mandateId"] = id
		fields["operation"] = operation
		raw, _ := json.Marshal(fields)
		mandateLog.Info("%s", raw)
	}
	var contract mandatecontract.Contract
	var digest string
	if operation == "approve" {
		if recorded, receiptErr := mandatecontract.LoadActReceipt(dir, "approve"); receiptErr == nil {
			contract = recorded.Contract
			digest = recorded.ContractDigest
		} else if !os.IsNotExist(receiptErr) {
			return result, receiptErr
		} else {
			if _, statErr := os.Stat(filepath.Join(dir, "mandate.json")); statErr == nil {
				return result, errors.New("signed Mandate exists without a recorded human approval")
			} else if !os.IsNotExist(statErr) {
				return result, statErr
			}
			if selected != nil && selected.Privacy == "local" {
				prepared, prepareErr := prepareLocalSelection(context.Background(), *selected, nil)
				if prepareErr != nil {
					return result, recordLocalActDenial(mandateLog, id, operation, "selection", "", prepareErr)
				}
				selected = &prepared
			}
			contract, err = buildConfirmedContract(dir, id, active.OrganizationID, authorityDir, selected)
			if err != nil {
				return result, err
			}
			digest, err = mandatecontract.Digest(contract)
			if err != nil {
				return result, err
			}
		}
	}
	if operation == "activate" {
		envelope, loadErr := mandatecontract.LoadVerified(dir, identityPath)
		if loadErr != nil {
			return result, loadErr
		}
		contract = envelope.Contract
		digest = envelope.ContractDigest
		approval, loadErr := mandatecontract.LoadActReceipt(dir, "approve")
		if loadErr != nil {
			return result, loadErr
		}
		if err := mandatecontract.VerifyActReceipt(approval, identity, authority.DevelopmentPinnedRoots(), "approve", id, digest, contract.ProjectID); err != nil {
			return result, fmt.Errorf("approval receipt invalid: %w", err)
		}
	}
	if contract.OrganizationID != active.OrganizationID {
		return result, errors.New("Mandate organization differs from active Authority binding")
	}
	if (contract.ContractVersion != 2 && contract.ContractVersion != 3) || contract.Intelligence == nil {
		return result, errors.New("Mandate lacks signed intelligence policy, model or budget")
	}
	if _, err := verifyIntelligenceSelection(*contract.Intelligence); err != nil {
		return result, err
	}
	if operation == "approve" && contract.ContractVersion == 3 {
		if err := verifyLocalObservation(context.Background(), *contract.Intelligence, nil); err != nil {
			return result, recordLocalActDenial(mandateLog, id, operation, "before_consent", digest, err)
		}
	}
	if existing, loadErr := mandatecontract.LoadActReceipt(dir, operation); loadErr == nil {
		if err := mandatecontract.VerifyActReceipt(existing, identity, authority.DevelopmentPinnedRoots(), operation, id, digest, contract.ProjectID); err != nil {
			return result, fmt.Errorf("recorded Mandate act invalid: %w", err)
		}
		if operation == "approve" {
			if err := persistApprovedContract(dir, contract, identity); err != nil {
				return result, err
			}
			if err := persistSignedState(dir, digest); err != nil {
				return result, err
			}
		}
		if operation == "activate" {
			if err := persistActivationState(dir, digest); err != nil {
				return result, err
			}
		}
		if err := signalMandateAct(c, id, operation, digest); err != nil {
			return result, err
		}
		emit("mandate.act.recovered", map[string]any{"contractDigest": digest, "principalId": existing.Decision.PrincipalID})
		return mandateActResult{Success: true, MandateID: id, Operation: operation, ContractDigest: digest, PrincipalID: existing.Decision.PrincipalID}, nil
	} else if !os.IsNotExist(loadErr) {
		return result, loadErr
	}
	now := time.Now().UTC()
	binding := authority.Binding{OrganizationID: active.OrganizationID, InstallationID: identity.InstallationID}
	projectClient := &authority.SyncClient{BaseURL: active.AuthorityBaseURL, Binding: binding, InstallationPrivateKey: identity.PrivateKey}
	projectBinding, err := projectClient.GetProjectBinding(context.Background(), contract.ProjectID)
	if err != nil || projectBinding.Revision != contract.ProjectBinding {
		return result, errors.New("current governed project binding differs from Mandate contract")
	}
	manifestBytes, manifest, err := authority.FetchMandateTrustEnvelope(context.Background(), active.AuthorityBaseURL, binding, identity, authority.DevelopmentPinnedRoots(), now)
	if err != nil {
		return result, fmt.Errorf("Authority trust unavailable: %w", err)
	}
	binding.Issuer = manifest.Payload.Issuer
	client := authority.MandateConsentClient{BaseURL: active.AuthorityBaseURL, Binding: binding, InstallationPrivateKey: identity.PrivateKey}
	pending, err := client.Begin(context.Background(), operation, id, digest)
	if err != nil {
		return result, err
	}
	emit("mandate.act.requested", map[string]any{"contractDigest": digest})
	fmt.Fprintf(cmd.ErrOrStderr(), "Abra y confirme en Authority: %s\nPegue la atestación JSON que muestra Authority y pulse Enter: ", pending.URL)
	line, err := bufio.NewReaderSize(cmd.InOrStdin(), 1<<20).ReadString('\n')
	if err != nil && err != io.EOF {
		return result, err
	}
	raw := []byte(strings.TrimSpace(line))
	if len(raw) == 0 || len(raw) > 1<<20 {
		return result, errors.New("atestación ausente o demasiado grande")
	}
	manifestBytes, manifest, err = authority.FetchMandateTrustEnvelope(context.Background(), active.AuthorityBaseURL, binding, identity, authority.DevelopmentPinnedRoots(), time.Now().UTC())
	if err != nil {
		return result, fmt.Errorf("Authority trust changed or unavailable: %w", err)
	}
	attestation, err := pending.Verify(raw, manifest, time.Now().UTC())
	if err != nil {
		return result, fmt.Errorf("consentimiento humano inválido: %w", err)
	}
	permission := "mandate.sign"
	if operation == "activate" {
		permission = "mandate.install"
	}
	decision := (authority.DecisionEvaluator{Store: &authority.Store{Path: filepath.Join(authorityDir, "state.json")}, Checkpoint: &authority.CheckpointStore{Path: filepath.Join(authorityDir, "checkpoint.json")}, Manifest: manifest}).Evaluate(authority.DecisionRequest{Operation: permission, PrincipalID: attestation.PrincipalID, Scope: authority.Scope{Type: "project", ID: contract.ProjectID}, At: time.Now().UTC()})
	if decision.Outcome != authority.DecisionAllow {
		emit("mandate.act.denied", map[string]any{"contractDigest": digest, "reason": decision.Reason})
		return result, fmt.Errorf("Authority denegó %s: %s", permission, decision.Reason)
	}
	projectBinding, err = projectClient.GetProjectBinding(context.Background(), contract.ProjectID)
	if err != nil || projectBinding.Revision != contract.ProjectBinding {
		return result, errors.New("governed project binding changed during human consent")
	}
	emit("mandate.act.verified", map[string]any{"contractDigest": digest, "principalId": attestation.PrincipalID, "attestationId": attestation.AttestationID, "authorityVersion": decision.AuthorityVersion, "stateDigest": decision.StateDigest})
	// Both source selection and contract bytes must still match the human digest.
	if operation == "approve" {
		latest, buildErr := buildConfirmedContract(dir, id, active.OrganizationID, authorityDir, contract.Intelligence)
		if buildErr != nil {
			return result, buildErr
		}
		if current, _ := mandatecontract.Digest(latest); current != digest {
			return result, errors.New("Mandate candidate changed after human consent")
		}
		if contract.ContractVersion == 3 {
			if err := verifyLocalObservation(context.Background(), *contract.Intelligence, nil); err != nil {
				return result, recordLocalActDenial(mandateLog, id, operation, "after_consent", digest, err)
			}
		}
	}
	if operation == "activate" {
		latest, loadErr := mandatecontract.LoadVerified(dir, identityPath)
		if loadErr != nil || latest.ContractDigest != digest {
			return result, errors.New("signed Mandate changed after human consent")
		}
	}
	// Persist the original signed trust envelope, not the parsed manifest struct.
	receipt, err := mandatecontract.SignActReceipt(mandatecontract.ActReceipt{Operation: operation, MandateID: id, ContractDigest: digest, Contract: contract, OrganizationID: active.OrganizationID, Attestation: raw, Manifest: manifestBytes, ActorChallenge: pending.Challenge, ActorPublicKey: attestation.ActorPublicKey, Decision: decision, RecordedAt: time.Now().UTC()}, identity)
	if err != nil {
		return result, err
	}
	if err := mandatecontract.VerifyActReceipt(receipt, identity, authority.DevelopmentPinnedRoots(), operation, id, digest, contract.ProjectID); err != nil {
		return result, err
	}
	if err := mandatecontract.SaveActReceipt(dir, receipt); err != nil {
		return result, err
	}
	emit("mandate.act.recorded", map[string]any{"contractDigest": digest, "principalId": attestation.PrincipalID, "attestationId": attestation.AttestationID})
	if operation == "approve" {
		if err := persistApprovedContract(dir, contract, identity); err != nil {
			return result, err
		}
		if err := persistSignedState(dir, digest); err != nil {
			return result, err
		}
	}
	if operation == "activate" {
		if err := persistActivationState(dir, digest); err != nil {
			return result, err
		}
	}
	if err := signalMandateAct(c, id, operation, digest); err != nil {
		emit("mandate.act.signal_failed", map[string]any{"contractDigest": digest, "reason": err.Error()})
		return result, fmt.Errorf("acto persistido; reintente la señal tras recuperar Temporal: %w", err)
	}
	return mandateActResult{Success: true, MandateID: id, Operation: operation, ContractDigest: digest, PrincipalID: attestation.PrincipalID}, nil
}

func recordLocalActDenial(log *core.Logger, mandateID, operation, stage, digest string, cause error) error {
	fields := map[string]string{
		"event": "mandate.act.denied", "mandateId": mandateID,
		"operation": operation, "stage": stage, "reason": cause.Error(),
	}
	if digest != "" {
		fields["contractDigest"] = digest
	}
	raw, _ := json.Marshal(fields)
	log.Warning("%s", raw)
	return cause
}

func persistSignedState(dir, digest string) error {
	_, err := mandatestate.Mutate(filepath.Join(dir, "mandate_state.json"), func(state map[string]interface{}) (bool, error) {
		signature, ok := state["signature"].(map[string]interface{})
		if !ok {
			return false, errors.New("signature state missing")
		}
		if signature["status"] == "signed" && signature["contractDigest"] == digest {
			return false, nil
		}
		if signature["status"] != "pending" {
			return false, errors.New("signature transition invalid")
		}
		signature["status"] = "signed"
		signature["contractDigest"] = digest
		signature["signedAt"] = time.Now().UTC().Format(time.RFC3339Nano)
		state["signature"] = signature
		return true, nil
	})
	return err
}

func persistActivationState(dir, digest string) error {
	_, err := mandatestate.Mutate(filepath.Join(dir, "mandate_state.json"), func(state map[string]interface{}) (bool, error) {
		if active, ok := state["activation"].(map[string]interface{}); ok && active["status"] == "active" && active["contractDigest"] == digest {
			return false, nil
		}
		if _, exists := state["activation"]; exists {
			return false, errors.New("conflicting activation state")
		}
		state["activation"] = map[string]interface{}{"status": "active", "contractDigest": digest}
		return true, nil
	})
	return err
}

func buildConfirmedContract(dir, id, org, authorityDir string, selection ...*mandatecontract.Intelligence) (mandatecontract.Contract, error) {
	var state struct {
		MandateID string `json:"mandateId"`
		Project   string `json:"project"`
		ProjectID string `json:"projectId"`
		Signature struct {
			Status string `json:"status"`
		} `json:"signature"`
		Phases struct {
			Validate struct {
				HumanSync struct {
					CandidateDomains []struct {
						DomainID string `json:"domainId"`
						Name     string `json:"name"`
					} `json:"candidateDomains"`
					ConfirmedDomainIds []string                `json:"confirmedDomainIds"`
					Files              []mandatecontract.Input `json:"files"`
				} `json:"humanSync"`
			} `json:"validate"`
		} `json:"phases"`
	}
	raw, err := os.ReadFile(filepath.Join(dir, "mandate_state.json"))
	if err != nil {
		return mandatecontract.Contract{}, err
	}
	if err := json.Unmarshal(raw, &state); err != nil {
		return mandatecontract.Contract{}, err
	}
	if state.MandateID != id || state.ProjectID == "" || (state.Signature.Status != "pending" && state.Signature.Status != "signed") || len(state.Phases.Validate.HumanSync.ConfirmedDomainIds) != 1 || len(state.Phases.Validate.HumanSync.Files) == 0 {
		return mandatecontract.Contract{}, errors.New("Mandate confirmation or governed project incomplete")
	}
	domainID := state.Phases.Validate.HumanSync.ConfirmedDomainIds[0]
	name := ""
	for _, candidate := range state.Phases.Validate.HumanSync.CandidateDomains {
		if candidate.DomainID == domainID {
			name = candidate.Name
		}
	}
	if name == "" {
		return mandatecontract.Contract{}, errors.New("confirmed domain candidate missing")
	}
	receipts, err := (&authority.ProjectBindingStore{Path: filepath.Join(authorityDir, "project-bindings.json")}).Load()
	if err != nil {
		return mandatecontract.Contract{}, err
	}
	binding := ""
	for _, receipt := range receipts {
		if receipt.OrganizationID == org && receipt.ProjectID == state.ProjectID && receipt.TenantID != "" && receipt.SourceRef != "" && receipt.EvidenceKind == "canonical" && receipt.Revision != "" && !receipt.ConfirmedAt.IsZero() && (receipt.ValidUntil.IsZero() || time.Now().Before(receipt.ValidUntil)) {
			binding = receipt.Revision
		}
	}
	if binding == "" {
		return mandatecontract.Contract{}, errors.New("confirmed project binding unavailable")
	}
	for _, input := range state.Phases.Validate.HumanSync.Files {
		parts := strings.Split(input.Ref, "/")
		if len(parts) != 2 || parts[0] != "inputs" || parts[1] == "" || parts[1] == "." || parts[1] == ".." || strings.ContainsAny(parts[1], "\\:") || path.Clean(input.Ref) != input.Ref {
			return mandatecontract.Contract{}, errors.New("unsigned File reference")
		}
		for _, relative := range []string{"inputs", input.Ref} {
			info, statErr := os.Lstat(filepath.Join(dir, filepath.FromSlash(relative)))
			if statErr != nil || info.Mode()&os.ModeSymlink != 0 || relative == "inputs" && !info.IsDir() || relative == input.Ref && !info.Mode().IsRegular() {
				return mandatecontract.Contract{}, errors.New("frozen File path invalid")
			}
		}
		content, readErr := os.ReadFile(filepath.Join(dir, filepath.FromSlash(input.Ref)))
		if readErr != nil {
			return mandatecontract.Contract{}, readErr
		}
		sum := sha256.Sum256(content)
		if int64(len(content)) != input.Size || hex.EncodeToString(sum[:]) != input.SHA256 {
			return mandatecontract.Contract{}, errors.New("frozen File altered")
		}
	}
	contract := mandatecontract.Contract{MandateID: id, ContractVersion: 1, OrganizationID: org, ProjectID: state.ProjectID, ProjectBinding: binding, Objective: "Definir el dominio " + name + " desde las entradas congeladas del proyecto " + state.Project, Domain: mandatecontract.Domain{ID: domainID, Name: name}, Action: mandatecontract.Action{ActionID: "gen-" + domainID, Type: "run_intent", IntentType: "gen", DomainID: domainID, ArtifactRef: "domain_definition.json", IdempotencyKey: id + ":gen:" + domainID}, Inputs: state.Phases.Validate.HumanSync.Files, Fulfillment: mandatecontract.Fulfillment{Evaluator: "domain-definition-structure", EvaluatorVersion: "1", RequiredFields: []string{"domainId", "purpose", "boundaries", "concepts", "decisions", "sources"}}}
	if len(selection) > 0 && selection[0] != nil {
		verified, verifyErr := verifyIntelligenceSelection(*selection[0])
		if verifyErr != nil {
			return mandatecontract.Contract{}, verifyErr
		}
		contract.ContractVersion = 2
		if verified.Privacy == "local" {
			contract.ContractVersion = 3
		}
		contract.Intelligence = &verified
	}
	return contract, contract.Validate()
}

func verifyIntelligenceSelection(selected mandatecontract.Intelligence) (mandatecontract.Intelligence, error) {
	if selected.Model == "" || selected.MaxUSD == "" || selected.MaxTotalTokens < 1 || selected.MaxOutputTokens < 1 || selected.PolicyRef == "" || selected.RegistryRef == "" {
		return selected, errors.New("model, verified policy, registry and explicit budget are required before approval")
	}
	usd, err := strconv.ParseFloat(selected.MaxUSD, 64)
	if err != nil || math.IsNaN(usd) || (selected.Privacy == "local" && usd != 0) || (selected.Privacy != "local" && (usd <= 0 || usd > 1)) {
		return selected, errors.New("invalid explicit USD ceiling")
	}
	if selected.Privacy != "local" {
		credential := "credential-ref://anthropic/default"
		selected.Provider, selected.BackendID, selected.CredentialRef, selected.PolicyVersion = "anthropic", "anthropic_api", &credential, "mandate-gen/v1"
	}
	for _, file := range []struct {
		ref    *string
		digest *string
	}{{&selected.PolicyRef, &selected.PolicySHA256}, {&selected.RegistryRef, &selected.RegistrySHA256}} {
		absolute, pathErr := filepath.Abs(*file.ref)
		if pathErr != nil {
			return selected, pathErr
		}
		content, readErr := os.ReadFile(absolute)
		if readErr != nil {
			return selected, readErr
		}
		*file.ref = absolute
		sum := sha256.Sum256(content)
		computed := hex.EncodeToString(sum[:])
		if *file.digest != "" && *file.digest != computed {
			return selected, errors.New("AITAP policy or registry changed")
		}
		*file.digest = computed
	}
	var policy struct {
		PolicyVersion string `json:"policy_version"`
		Supply        struct {
			BackendID       string   `json:"backend_id"`
			Fallback        []string `json:"fallback"`
			MaxAttempts     int      `json:"max_attempts"`
			MaxOutputTokens int      `json:"max_output_tokens"`
			Budget          struct {
				PerMandate     bool   `json:"per_mandate"`
				MaxUSD         string `json:"max_usd"`
				MaxTotalTokens int    `json:"max_total_tokens"`
				MaxInferences  int    `json:"max_inferences"`
			} `json:"budget"`
		} `json:"intelligence_supply"`
	}
	policyBytes, _ := os.ReadFile(selected.PolicyRef)
	if json.Unmarshal(policyBytes, &policy) != nil || policy.PolicyVersion != selected.PolicyVersion || policy.Supply.BackendID != selected.BackendID || len(policy.Supply.Fallback) != 0 || policy.Supply.MaxAttempts != 1 || policy.Supply.MaxOutputTokens != selected.MaxOutputTokens || !policy.Supply.Budget.PerMandate || (selected.Privacy != "local" && policy.Supply.Budget.MaxUSD != selected.MaxUSD) || policy.Supply.Budget.MaxTotalTokens != selected.MaxTotalTokens || policy.Supply.Budget.MaxInferences != 1 {
		return selected, errors.New("AITAP policy does not match the explicit signed budget")
	}
	var registry struct {
		SnapshotID string `json:"snapshot_id"`
		Backends   []struct {
			BackendID     string  `json:"backend_id"`
			Provider      string  `json:"provider"`
			Model         string  `json:"model"`
			ModelDigest   string  `json:"model_digest"`
			CredentialRef *string `json:"credential_ref"`
			Privacy       string  `json:"privacy"`
			Health        string  `json:"health"`
			Enabled       bool    `json:"supply_enabled"`
		} `json:"intelligence_backends"`
	}
	registryBytes, _ := os.ReadFile(selected.RegistryRef)
	if json.Unmarshal(registryBytes, &registry) != nil {
		return selected, errors.New("AITAP registry invalid")
	}
	if selected.Privacy == "local" && registry.SnapshotID != selected.RegistrySnapshotID {
		return selected, errors.New("local registry snapshot changed")
	}
	for _, backend := range registry.Backends {
		credentialMatches := backend.CredentialRef == nil && selected.CredentialRef == nil || backend.CredentialRef != nil && selected.CredentialRef != nil && *backend.CredentialRef == *selected.CredentialRef
		if backend.BackendID == selected.BackendID && backend.Provider == selected.Provider && backend.Model == selected.Model && credentialMatches && backend.Health == "healthy" && backend.Enabled && (selected.Privacy != "local" || backend.Privacy == "local" && backend.ModelDigest == selected.ModelManifestSHA256) {
			return selected, nil
		}
	}
	return selected, errors.New("selected model is not marked available in verified AITAP registry")
}

func prepareLocalSelection(ctx context.Context, selected mandatecontract.Intelligence, run mandateintelligence.Runner) (mandatecontract.Intelligence, error) {
	if selected.Privacy != "local" || selected.ModelID == "" || selected.Model != "" || selected.MaxUSD != "0" ||
		selected.MaxTotalTokens < 1 || selected.MaxOutputTokens < 1 || selected.PolicyRef == "" || selected.RegistryRef == "" {
		return selected, errors.New("local model, policy, registry and explicit limits required")
	}
	var err error
	selected.PolicyRef, err = filepath.Abs(selected.PolicyRef)
	if err != nil {
		return selected, err
	}
	selected.RegistryRef, err = filepath.Abs(selected.RegistryRef)
	if err != nil {
		return selected, err
	}
	selected.PolicySHA256, err = mandateintelligence.FileSHA256(selected.PolicyRef)
	if err != nil {
		return selected, err
	}
	selected.RegistrySHA256, err = mandateintelligence.FileSHA256(selected.RegistryRef)
	if err != nil {
		return selected, err
	}
	policyBytes, err := os.ReadFile(selected.PolicyRef)
	if err != nil {
		return selected, err
	}
	var policy struct {
		PolicyVersion string `json:"policy_version"`
		Supply        struct {
			BackendID       string   `json:"backend_id"`
			Fallback        []string `json:"fallback"`
			MaxAttempts     int      `json:"max_attempts"`
			MaxOutputTokens int      `json:"max_output_tokens"`
			Budget          struct {
				PerMandate     bool `json:"per_mandate"`
				MaxTotalTokens int  `json:"max_total_tokens"`
				MaxInferences  int  `json:"max_inferences"`
			} `json:"budget"`
		} `json:"intelligence_supply"`
	}
	if json.Unmarshal(policyBytes, &policy) != nil || policy.PolicyVersion != "mandate-gen-local/v1" || len(policy.Supply.Fallback) != 0 || policy.Supply.MaxAttempts != 1 || policy.Supply.MaxOutputTokens != selected.MaxOutputTokens || !policy.Supply.Budget.PerMandate || policy.Supply.Budget.MaxTotalTokens != selected.MaxTotalTokens || policy.Supply.Budget.MaxInferences != 1 {
		return selected, errors.New("local supply policy does not match explicit limits")
	}
	registryBytes, err := os.ReadFile(selected.RegistryRef)
	if err != nil {
		return selected, err
	}
	var registry struct {
		SnapshotID string `json:"snapshot_id"`
		Backends   []struct {
			BackendID     string          `json:"backend_id"`
			Provider      string          `json:"provider"`
			Model         string          `json:"model"`
			ModelDigest   string          `json:"model_digest"`
			CredentialRef json.RawMessage `json:"credential_ref"`
			Privacy       string          `json:"privacy"`
			Health        string          `json:"health"`
			Enabled       bool            `json:"supply_enabled"`
		} `json:"intelligence_backends"`
	}
	if json.Unmarshal(registryBytes, &registry) != nil || registry.SnapshotID == "" {
		return selected, errors.New("local registry invalid")
	}
	for _, backend := range registry.Backends {
		if backend.BackendID != policy.Supply.BackendID || backend.BackendID != "local.ollama."+selected.ModelID {
			continue
		}
		if backend.Provider != "ollama" || backend.Model == "" || len(backend.ModelDigest) != 64 || string(backend.CredentialRef) != "null" || backend.Privacy != "local" || backend.Health != "healthy" || !backend.Enabled {
			return selected, errors.New("local registry backend is not eligible")
		}
		selected.Provider, selected.BackendID, selected.Model = backend.Provider, backend.BackendID, backend.Model
		selected.ModelManifestSHA256, selected.RegistrySnapshotID = backend.ModelDigest, registry.SnapshotID
		selected.PolicyVersion = policy.PolicyVersion
		selected.AccessPolicyVersion, selected.AccessPolicySHA256, err = mandateintelligence.PolicyFingerprint(ctx, run)
		if err != nil {
			return selected, err
		}
		if err = verifyLocalObservation(ctx, selected, run); err != nil {
			return selected, err
		}
		return verifyIntelligenceSelection(selected)
	}
	return selected, errors.New("selected local model absent from verified registry")
}

func verifyLocalObservation(ctx context.Context, selected mandatecontract.Intelligence, run mandateintelligence.Runner) error {
	version, digest, err := mandateintelligence.PolicyFingerprint(ctx, run)
	if err != nil {
		return err
	}
	if version != selected.AccessPolicyVersion || digest != selected.AccessPolicySHA256 {
		return errors.New("local access policy changed")
	}
	observation, err := mandateintelligence.Observe(ctx, run, selected.ModelID, selected.Model, time.Now().UTC())
	if err != nil {
		return err
	}
	if observation.ManifestSHA256 != selected.ModelManifestSHA256 {
		return errors.New("observed local model digest differs from signed registry")
	}
	return nil
}

func persistApprovedContract(dir string, contract mandatecontract.Contract, identity *authority.LocalIdentity) error {
	path := filepath.Join(dir, "mandate.json")
	if existing, err := os.ReadFile(path); err == nil {
		var envelope mandatecontract.Envelope
		if json.Unmarshal(existing, &envelope) != nil || mandatecontract.Verify(envelope, identity.InstallationID, identity.PublicKey) != nil {
			return errors.New("existing signed Mandate invalid")
		}
		expected, _ := mandatecontract.Digest(contract)
		if envelope.ContractDigest != expected {
			return errors.New("existing Mandate has another digest")
		}
		return nil
	} else if !os.IsNotExist(err) {
		return err
	}
	envelope, err := mandatecontract.Sign(contract, identity)
	if err != nil {
		return err
	}
	raw, err := json.MarshalIndent(envelope, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, ".mandate-contract-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.Write(append(raw, '\n')); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), path)
}

func signalMandateAct(c *core.Core, id, operation, digest string) error {
	if c == nil {
		return errors.New("Nucleus context unavailable")
	}
	client, err := temporal.NewClient(context.Background(), &c.Paths, c.IsJSON)
	if err != nil {
		return err
	}
	defer client.Close()
	return client.SignalWorkflow(context.Background(), "mandate_build_"+id, "", "mandate:build:"+operation, digest)
}
