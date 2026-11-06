package governance

import (
	"bufio"
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"path/filepath"
	"strings"
	"time"

	"nucleus/internal/authority"
	"nucleus/internal/core"
	"nucleus/internal/intelligencesupply"
	"nucleus/internal/orchestration/mandatecontract"
)

const maxIntentSupplySessionLine = 1 << 20

type intentSupplySessionRequest struct {
	Schema                 string          `json:"schema"`
	RequestID              string          `json:"request_id"`
	MandateID              string          `json:"mandate_id"`
	PreparedContractDigest string          `json:"prepared_contract_digest"`
	Mode                   string          `json:"mode"`
	Assignments            json.RawMessage `json:"assignments,omitempty"`
}

type intentSupplySessionResponse struct {
	Schema      string          `json:"schema"`
	RequestID   string          `json:"request_id,omitempty"`
	Event       string          `json:"event"`
	OK          bool            `json:"ok"`
	ErrorCode   string          `json:"error_code,omitempty"`
	ApprovalURL string          `json:"approval_url,omitempty"`
	Data        json.RawMessage `json:"data,omitempty"`
}

// runIntentSupplySession installs the approved JSON Lines transport but does
// not weaken actor identity. Until Authority exposes the authenticated human
// approval page for local-actor, every well-formed operation fails before
// Authority/Vault/AITAP evaluation.
func runIntentSupplySession(input io.Reader, output io.Writer) error {
	return runIntentSupplySessionWithCore(context.Background(), nil, input, output)
}

func runIntentSupplySessionWithCore(ctx context.Context, nucleus *core.Core, input io.Reader, output io.Writer) error {
	if input == nil || output == nil {
		return errors.New("intent supply session streams required")
	}
	scanner := bufio.NewScanner(input)
	scanner.Buffer(make([]byte, 4096), maxIntentSupplySessionLine)
	encoder := json.NewEncoder(output)
	for scanner.Scan() {
		request, err := decodeIntentSupplySessionRequest(scanner.Bytes())
		response := intentSupplySessionResponse{Schema: "bloom.intent-supply-session/v1", RequestID: request.RequestID, Event: "result", OK: false, ErrorCode: "intent_supply_unavailable"}
		if err != nil {
			response.ErrorCode = "invalid_request"
		} else if nucleus == nil {
			response.ErrorCode = "actor_human_approval_unavailable"
		} else {
			if err := executeIntentSupplySessionRequest(ctx, nucleus, request, encoder); err == nil {
				continue
			}
		}
		if err := encoder.Encode(response); err != nil {
			return err
		}
	}
	return scanner.Err()
}

func executeIntentSupplySessionRequest(ctx context.Context, nucleus *core.Core, request intentSupplySessionRequest, encoder *json.Encoder) error {
	active, err := core.ResolveActiveOrgContext()
	if err != nil || active == nil {
		return errIntentSupplyBridgeDenied
	}
	identityPath := filepath.Join(nucleus.Paths.AppDataDir, "authority", "identity.json")
	identity, err := authority.LoadExistingLocalIdentity(identityPath)
	if err != nil {
		return errIntentSupplyBridgeDenied
	}
	mandatesRoot := filepath.Join(active.NucleusRoot, ".mandates")
	envelope, err := mandatecontract.LoadVerified(filepath.Join(mandatesRoot, request.MandateID), identityPath)
	if err != nil || request.PreparedContractDigest != "sha256:"+envelope.ContractDigest || envelope.Contract.OrganizationID != active.OrganizationID {
		return errIntentSupplyBridgeDenied
	}
	now := authorityCommandNow().UTC()
	client := authority.LocalActorClient{BaseURL: active.AuthorityBaseURL, Binding: authority.Binding{OrganizationID: active.OrganizationID, InstallationID: identity.InstallationID}, InstallationPrivateKey: identity.PrivateKey, HTTP: authorityCommandHTTPClient, Now: func() time.Time { return authorityCommandNow().UTC() }}
	pending, err := client.Begin(ctx, request.Mode, request.MandateID, request.PreparedContractDigest)
	if err != nil {
		return errIntentSupplyBridgeDenied
	}
	if err := encoder.Encode(intentSupplySessionResponse{Schema: "bloom.intent-supply-session/v1", RequestID: request.RequestID, Event: "approval_required", OK: false, ErrorCode: "actor_human_approval_required", ApprovalURL: pending.ConsentURL}); err != nil {
		return err
	}

	var attestation []byte
	for {
		if !authorityCommandNow().UTC().Before(pending.ExpiresAt) {
			return errIntentSupplyBridgeDenied
		}
		raw, waiting, pollErr := client.Poll(ctx, pending)
		if pollErr != nil {
			return errIntentSupplyBridgeDenied
		}
		if !waiting {
			attestation = raw
			break
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(250 * time.Millisecond):
		}
	}
	_, manifest, err := authority.FetchMandateTrustEnvelope(ctx, active.AuthorityBaseURL, authority.Binding{OrganizationID: active.OrganizationID, InstallationID: identity.InstallationID}, identity, authorityCommandRoots(), now)
	if err != nil {
		return errIntentSupplyBridgeDenied
	}
	if _, err := pending.Verify(attestation, manifest, authorityCommandNow().UTC()); err != nil {
		return errIntentSupplyBridgeDenied
	}
	stateDir, err := intelligencesupply.ResolveStateDir(nucleus.Paths.AppDataDir, "")
	if err != nil {
		return errIntentSupplyBridgeDenied
	}
	bridge := IntentSupplyBridge{
		Store: &authority.Store{Path: filepath.Join(nucleus.Paths.AppDataDir, "authority", "state.json")}, Checkpoint: &authority.CheckpointStore{Path: filepath.Join(nucleus.Paths.AppDataDir, "authority", "checkpoint.json")},
		ProjectBindings: &authority.ProjectBindingStore{Path: filepath.Join(nucleus.Paths.AppDataDir, "authority", "project-bindings.json")}, AITAP: intelligencesupply.Client{StateDir: stateDir},
		VaultStatusPath: filepath.Join(active.NucleusRoot, "vault.json"), MandatesRoot: mandatesRoot, IdentityPath: identityPath, Now: func() time.Time { return authorityCommandNow().UTC() },
	}
	result, err := bridge.Assignments(ctx, IntentSupplyRequest{Mode: request.Mode, RequestID: request.RequestID, OrganizationID: active.OrganizationID, InstallationID: identity.InstallationID, ProjectID: envelope.Contract.ProjectID, MandateID: request.MandateID, ExpectedDigest: strings.TrimPrefix(request.PreparedContractDigest, "sha256:"), ActorAttestation: attestation, TrustManifest: manifest, ActorProof: pending.Proof, ActorChallenge: pending.Challenge, Assignments: request.Assignments})
	if err != nil {
		return errIntentSupplyBridgeDenied
	}
	return encoder.Encode(intentSupplySessionResponse{Schema: "bloom.intent-supply-session/v1", RequestID: request.RequestID, Event: "result", OK: true, Data: result})
}

func decodeIntentSupplySessionRequest(raw []byte) (intentSupplySessionRequest, error) {
	var request intentSupplySessionRequest
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&request) != nil || decoder.Decode(new(any)) != io.EOF || request.Schema != "bloom.intent-supply-session/v1" || request.RequestID == "" || request.MandateID == "" ||
		!validIntentSupplyMandateID(request.MandateID) ||
		len(request.PreparedContractDigest) != 71 || !strings.HasPrefix(request.PreparedContractDigest, "sha256:") || !validIntentSupplyDigest(request.PreparedContractDigest[7:]) ||
		(request.Mode != "list" && request.Mode != "validate") {
		return request, errors.New("invalid request")
	}
	if request.Mode == "list" && len(request.Assignments) != 0 || request.Mode == "validate" && len(request.Assignments) == 0 {
		return request, errors.New("invalid assignments")
	}
	return request, nil
}

func validIntentSupplyMandateID(value string) bool {
	if len(value) == 0 || len(value) > 128 || filepath.Base(value) != value {
		return false
	}
	for _, c := range value {
		if c < 'a' || c > 'z' {
			if c < 'A' || c > 'Z' {
				if c < '0' || c > '9' {
					if c != '-' {
						return false
					}
				}
			}
		}
	}
	return true
}

func validIntentSupplyDigest(value string) bool {
	decoded, err := hex.DecodeString(value)
	if err != nil || len(decoded) != 32 {
		return false
	}
	return value == strings.ToLower(value)
}
