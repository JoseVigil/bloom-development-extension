// One-time recovery signer for the already confirmed initial Mandate.
// The installation identity signs only the frozen project inputs and the
// approved six-Action graph. No workflow or principal approval is inferred.
package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"nucleus/internal/authority"
	"nucleus/internal/mandatedelivery"
	"nucleus/internal/mandateinstall"
	"nucleus/internal/orchestration/mandatecontract"
)

const (
	mandateID      = "4e028a82-3f94-48ab-957d-116340dbcc7f"
	organizationID = "52e6b64e-2237-4860-8763-e8119885e559"
	projectID      = "68d989e9-c51a-4d05-bf35-3a5912e32579"
	mandateDir     = `C:\repos\eias-repos\.bloom\.nucleus-eias-repos\.mandates\4e028a82-3f94-48ab-957d-116340dbcc7f`
	identityPath   = `C:\Users\josev\AppData\Local\BloomNucleus\authority\identity.json`
	bindingPath    = `C:\Users\josev\AppData\Local\BloomNucleus\authority\project-bindings.json`
	policyPath     = `C:\repos\bloom-development-extension\installer\aitap\policies\initial-mandate-v1.json`
	registryPath   = `C:\repos\bloom-development-extension\installer\aitap\registry\initial-mandate-v1.json`
	appDataDir     = `C:\Users\josev\AppData\Local\BloomNucleus`
	backendURL     = "http://localhost:8787"
)

// The delivery client owns S2S authentication and durable receipt storage.
// This transport gates its response before Store.Accept can write anything.
type matchingTransport struct {
	base       http.RoundTripper
	context    mandatedelivery.Context
	wantDigest string
	wantBytes  []byte
}

type statusTransport struct{ base http.RoundTripper }

func (t statusTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	response, err := t.base.RoundTrip(request)
	if err == nil && response.StatusCode/100 != 2 {
		fmt.Fprintf(os.Stderr, "%s HTTP %d\n", request.URL.Path, response.StatusCode)
	}
	return response, err
}

func (t matchingTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	response, err := t.base.RoundTrip(request)
	if err != nil || response.StatusCode != http.StatusOK {
		return response, err
	}
	raw, err := io.ReadAll(io.LimitReader(response.Body, (16<<20)+1))
	_ = response.Body.Close()
	if err != nil {
		return nil, err
	}
	delivery, content, err := mandatedelivery.Verify(raw, t.context)
	if err != nil {
		return nil, err
	}
	if delivery.Envelope.MandateID != mandateID || delivery.Envelope.Version != "1.0.0" ||
		delivery.Envelope.Digest != t.wantDigest || !bytes.Equal(content, t.wantBytes) {
		return nil, errors.New("Backend delivery differs from the signed local Mandate")
	}
	response.Body = io.NopCloser(bytes.NewReader(raw))
	response.ContentLength = int64(len(raw))
	return response, nil
}

func receive() error {
	identity, err := authority.LoadExistingLocalIdentity(identityPath)
	if err != nil {
		return err
	}
	verified, err := mandatecontract.LoadVerified(mandateDir, identityPath)
	if err != nil {
		return err
	}
	if verified.Contract.MandateID != mandateID || verified.Contract.OrganizationID != organizationID || verified.Contract.ContractVersion != 4 {
		return errors.New("local v4 Mandate identity mismatch")
	}
	content, err := os.ReadFile(filepath.Join(mandateDir, "mandate.json"))
	if err != nil {
		return err
	}
	digest, err := fileDigest(filepath.Join(mandateDir, "mandate.json"))
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	provisional := authority.Binding{OrganizationID: organizationID, InstallationID: identity.InstallationID}
	client := &http.Client{Timeout: 30 * time.Second, Transport: statusTransport{base: http.DefaultTransport}}
	manifest, trust, err := authority.FetchAndVerifyTrustManifest(context.Background(), backendURL,
		provisional, identity.PrivateKey, authority.DevelopmentPinnedRoots(), client, now)
	if err != nil {
		return err
	}
	ctx := mandatedelivery.Context{OrganizationID: organizationID, InstallationID: identity.InstallationID,
		Issuer: manifest.Payload.Issuer, Trust: trust, Now: time.Now}
	client.Transport = matchingTransport{base: http.DefaultTransport, context: ctx, wantDigest: digest, wantBytes: content}
	deliveryClient := mandatedelivery.Client{BaseURL: backendURL, HTTP: client, Signer: identity.PrivateKey,
		Context: ctx, Store: &mandatedelivery.Store{Root: filepath.Join(appDataDir, "authority", "mandate-delivery")}}
	outcome, err := deliveryClient.Receive(context.Background())
	if err != nil {
		return err
	}
	if outcome.Status != "accepted" && outcome.Status != "replay" {
		return errors.New("Backend delivery is pending")
	}
	if outcome.MandateID != mandateID {
		return errors.New("received Mandate ID mismatch")
	}
	receipt, err := mandateinstall.LoadLatestReceipt(appDataDir, organizationID, identity.InstallationID, mandateID)
	if err != nil {
		return err
	}
	if receipt.MandateID != mandateID || receipt.Digest != digest || receipt.Version != "1.0.0" {
		return errors.New("durable receipt differs from signed local Mandate")
	}
	if _, _, err = mandatedelivery.Verify(receipt.Body, ctx); err != nil {
		return err
	}
	fmt.Printf("status=%s mandateId=%s artifactSha256=%s contractDigest=%s\n", outcome.Status, mandateID, digest, verified.ContractDigest)
	return nil
}

func fileDigest(path string) (string, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:]), nil
}

func run() error {
	var state struct {
		MandateID string `json:"mandateId"`
		ProjectID string `json:"projectId"`
		Project   string `json:"project"`
		Signature struct {
			Status string `json:"status"`
		} `json:"signature"`
		Phases struct {
			Validate struct {
				HumanSync struct {
					ConfirmedDomainIDs []string `json:"confirmedDomainIds"`
					CandidateDomains   []struct {
						DomainID string `json:"domainId"`
						Name     string `json:"name"`
					} `json:"candidateDomains"`
					Files []mandatecontract.Input `json:"files"`
				} `json:"humanSync"`
			} `json:"validate"`
		} `json:"phases"`
	}
	raw, err := os.ReadFile(filepath.Join(mandateDir, "mandate_state.json"))
	if err != nil {
		return err
	}
	if err = json.Unmarshal(raw, &state); err != nil {
		return err
	}
	if state.MandateID != mandateID || state.ProjectID != projectID || state.Signature.Status != "pending" ||
		len(state.Phases.Validate.HumanSync.ConfirmedDomainIDs) != 1 || len(state.Phases.Validate.HumanSync.Files) == 0 {
		return errors.New("confirmed Mandate state does not match recovery target")
	}
	domainID := state.Phases.Validate.HumanSync.ConfirmedDomainIDs[0]
	name := ""
	for _, candidate := range state.Phases.Validate.HumanSync.CandidateDomains {
		if candidate.DomainID == domainID {
			name = candidate.Name
		}
	}
	if name != state.Project || name == "" {
		return errors.New("confirmed domain mismatch")
	}
	for _, input := range state.Phases.Validate.HumanSync.Files {
		if !strings.HasPrefix(input.Ref, "inputs/") || filepath.Base(input.Ref) == "." || strings.Contains(input.Ref, "\\") {
			return errors.New("unsafe frozen input")
		}
		path := filepath.Join(mandateDir, filepath.FromSlash(input.Ref))
		info, statErr := os.Lstat(path)
		if statErr != nil || !info.Mode().IsRegular() || info.Size() != input.Size {
			return errors.New("frozen input missing or changed")
		}
		digest, digestErr := fileDigest(path)
		if digestErr != nil || digest != input.SHA256 {
			return errors.New("frozen input digest mismatch")
		}
	}
	bindings, err := (&authority.ProjectBindingStore{Path: bindingPath}).Load()
	if err != nil {
		return err
	}
	binding := ""
	for _, receipt := range bindings {
		if receipt.OrganizationID == organizationID && receipt.ProjectID == projectID && receipt.EvidenceKind == "canonical" && receipt.Revision != "" {
			binding = receipt.Revision
		}
	}
	if binding == "" {
		return errors.New("canonical project binding unavailable")
	}
	policyDigest, err := fileDigest(policyPath)
	if err != nil {
		return err
	}
	registryDigest, err := fileDigest(registryPath)
	if err != nil {
		return err
	}
	var policy struct {
		PolicyVersion string                     `json:"policy_version"`
		Stages        map[string]json.RawMessage `json:"stages"`
	}
	policyRaw, err := os.ReadFile(policyPath)
	if err != nil {
		return err
	}
	if json.Unmarshal(policyRaw, &policy) != nil || policy.PolicyVersion != "initial-mandate/v1" {
		return errors.New("policy version mismatch")
	}
	for _, stage := range []string{"ing", "dis", "doc", "exp", "dev"} {
		if len(policy.Stages[stage]) == 0 {
			return fmt.Errorf("policy missing stage %s", stage)
		}
	}
	var registry struct {
		SnapshotID string `json:"snapshot_id"`
		Runtimes   []struct {
			RuntimeID string   `json:"runtime_id"`
			Supported []string `json:"supported_backend_ids"`
		} `json:"runtimes"`
		Backends []struct {
			BackendID string `json:"backend_id"`
		} `json:"intelligence_backends"`
	}
	registryRaw, err := os.ReadFile(registryPath)
	if err != nil {
		return err
	}
	if json.Unmarshal(registryRaw, &registry) != nil || registry.SnapshotID != "initial-mandate/v1" {
		return errors.New("registry snapshot mismatch")
	}
	for _, stage := range []string{"ing", "dis", "doc", "dev"} {
		var route struct {
			RuntimeID string `json:"runtime_id"`
			BackendID string `json:"backend_id"`
		}
		if json.Unmarshal(policy.Stages[stage], &route) != nil || route.RuntimeID == "" || route.BackendID == "" {
			return fmt.Errorf("invalid %s route", stage)
		}
		backendFound, pairFound := false, false
		for _, backend := range registry.Backends {
			if backend.BackendID == route.BackendID {
				backendFound = true
			}
		}
		for _, runtime := range registry.Runtimes {
			if runtime.RuntimeID == route.RuntimeID {
				for _, supported := range runtime.Supported {
					if supported == route.BackendID {
						pairFound = true
					}
				}
			}
		}
		if !backendFound || !pairFound {
			return fmt.Errorf("%s route absent from registry", stage)
		}
	}
	var exp struct {
		Evaluator string `json:"evaluator"`
		Execution string `json:"execution"`
	}
	if json.Unmarshal(policy.Stages["exp"], &exp) != nil || exp.Evaluator != "exp-ready" || exp.Execution != "nucleus-local" {
		return errors.New("EXP must use the approved local evaluator")
	}
	actions := make([]mandatecontract.Action, 0, 6)
	for i, intentType := range []string{"ing", "dis", "doc", "exp", "dev", "exp"} {
		id := fmt.Sprintf("%s-%d", intentType, i+1)
		action := mandatecontract.Action{ActionID: id, Type: "run_intent", IntentType: intentType,
			DomainID: domainID, IdempotencyKey: mandateID + ":" + id}
		if i > 0 {
			action.DependsOn = []string{actions[i-1].ActionID}
		}
		if intentType == "dev" {
			action.WhenResult = "remediation_required"
		}
		actions = append(actions, action)
	}
	contract := mandatecontract.Contract{MandateID: mandateID, ContractVersion: 4, OrganizationID: organizationID,
		ProjectID: projectID, ProjectBinding: binding, Objective: "Estructuración semántica inicial de sample_project",
		Domain: mandatecontract.Domain{ID: domainID, Name: name}, Actions: actions,
		Intelligence: &mandatecontract.Intelligence{PolicyRef: policyPath, PolicyVersion: policy.PolicyVersion,
			PolicySHA256: policyDigest, RegistryRef: registryPath, RegistrySHA256: registryDigest,
			RegistrySnapshotID: registry.SnapshotID, MaxTotalTokens: 50000, MaxOutputTokens: 4096},
		Inputs:      state.Phases.Validate.HumanSync.Files,
		Fulfillment: mandatecontract.Fulfillment{Evaluator: "exp-ready", EvaluatorVersion: "1", RequiredFields: []string{"ing", "dis", "doc", "exp"}}}
	identity, err := authority.LoadExistingLocalIdentity(identityPath)
	if err != nil {
		return err
	}
	envelope, err := mandatecontract.Sign(contract, identity)
	if err != nil {
		return err
	}
	if err = mandatecontract.Verify(envelope, identity.InstallationID, identity.PublicKey); err != nil {
		return err
	}
	encoded, err := json.MarshalIndent(envelope, "", "  ")
	if err != nil {
		return err
	}
	path := filepath.Join(mandateDir, "mandate.json")
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return err
	}
	if _, err = f.Write(append(encoded, '\n')); err != nil {
		f.Close()
		return err
	}
	if err = f.Sync(); err != nil {
		f.Close()
		return err
	}
	if err = f.Close(); err != nil {
		return err
	}
	if _, err = mandatecontract.LoadVerified(mandateDir, identityPath); err != nil {
		return err
	}
	digest, err := fileDigest(path)
	if err != nil {
		return err
	}
	fmt.Printf("mandateId=%s contractDigest=%s artifactSha256=%s\n", mandateID, envelope.ContractDigest, digest)
	return nil
}

func main() {
	var err error
	if len(os.Args) == 2 && os.Args[1] == "receive" {
		err = receive()
	} else if len(os.Args) == 1 {
		err = run()
	} else {
		err = errors.New("usage: mandate-v4-sign [receive]")
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
