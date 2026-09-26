package vault

import (
	"bytes"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net"
	"nucleus/internal/authority"
	"nucleus/internal/core"
	"nucleus/internal/governance/ownershipcontract"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const servicePurpose = "mandate_genesis_intelligence"

var errServiceDenied = errors.New("VAULT_ACCESS_DENIED")

type ServiceRequest struct {
	GrantID        string `json:"grant_id"`
	OrganizationID string `json:"organization_id"`
	InstallationID string `json:"installation_id"`
	KeyID          string `json:"key_id"`
	Purpose        string `json:"purpose"`
	Timestamp      string `json:"timestamp"`
	Nonce          string `json:"nonce"`
	ChannelPort    int    `json:"channel_port"`
	ChannelToken   string `json:"channel_token"`
	Signature      string `json:"signature"`
}

func serviceMessage(r ServiceRequest) []byte {
	return []byte(strings.Join([]string{"BLOOM-AITAP-VAULT-REQUEST-v1", r.GrantID, r.OrganizationID, r.InstallationID, r.KeyID, r.Purpose, r.Timestamp, r.Nonce, strconv.Itoa(r.ChannelPort), r.ChannelToken}, "\n"))
}

func remoteEnforcedAt(nucleusRoot string) bool {
	raw, err := os.ReadFile(filepath.Join(nucleusRoot, ".ownership.json"))
	if err != nil {
		return false
	}
	analysis, err := ownershipcontract.Analyze(raw)
	return err == nil && analysis.Canonical != nil && analysis.Canonical.AuthorityMode == ownershipcontract.AuthorityModeRemoteEnforced
}

// Existing human commands are legacy-only. An unreadable or malformed
// ownership document cannot authorize a fallback to local role markers.
func legacyVaultAllowed() bool {
	root := ""
	if active, err := core.ResolveActiveOrgContext(); err == nil {
		root = active.NucleusRoot
	} else {
		if _, configErr := os.Stat(filepath.Join(core.ResolveAppDataDir(), "config", "nucleus.json")); !os.IsNotExist(configErr) {
			return false
		}
		resolved, resolveErr := core.ResolveNucleusRoot("")
		if resolveErr != nil {
			return false
		}
		root = resolved
	}
	raw, err := os.ReadFile(filepath.Join(root, ".ownership.json"))
	if os.IsNotExist(err) {
		return true
	}
	if err != nil {
		return false
	}
	analysis, err := ownershipcontract.Analyze(raw)
	return err == nil && (analysis.Canonical == nil || analysis.Canonical.AuthorityMode != ownershipcontract.AuthorityModeRemoteEnforced)
}

func RunServiceRequest(input io.Reader, appDataDir string) error {
	deny := func() error { return errServiceDenied }
	raw, readErr := io.ReadAll(io.LimitReader(input, 8193))
	if readErr != nil || len(raw) > 8192 {
		return deny()
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	var r ServiceRequest
	if decoder.Decode(&r) != nil || decoder.Decode(new(any)) != io.EOF {
		return deny()
	}
	fields := []string{r.GrantID, r.OrganizationID, r.InstallationID, r.KeyID, r.Purpose, r.Timestamp, r.Nonce, r.ChannelToken, r.Signature}
	for _, field := range fields {
		if field == "" || strings.ContainsAny(field, "\r\n") {
			return deny()
		}
	}
	if r.KeyID != "anthropic-key:default" || r.Purpose != servicePurpose || r.ChannelPort < 1 || r.ChannelPort > 65535 {
		return deny()
	}
	now := time.Now().UTC()
	timestamp, err := time.Parse(time.RFC3339Nano, r.Timestamp)
	if err != nil || timestamp.Before(now.Add(-30*time.Second)) || timestamp.After(now.Add(30*time.Second)) {
		return deny()
	}
	nonce, err := base64.RawURLEncoding.DecodeString(r.Nonce)
	if err != nil || len(nonce) != 32 || base64.RawURLEncoding.EncodeToString(nonce) != r.Nonce {
		return deny()
	}
	token, err := base64.RawURLEncoding.DecodeString(r.ChannelToken)
	if err != nil || len(token) != 32 || base64.RawURLEncoding.EncodeToString(token) != r.ChannelToken {
		return deny()
	}
	active, err := core.ResolveActiveOrgContext()
	if err != nil || active.OrganizationID != r.OrganizationID || !remoteEnforcedAt(active.NucleusRoot) {
		return deny()
	}
	statePath := filepath.Join(appDataDir, "authority", "state.json")
	checkpointPath := filepath.Join(appDataDir, "authority", "checkpoint.json")
	publicKey, err := authority.ResolveVaultServiceGrant(&authority.Store{Path: statePath}, &authority.CheckpointStore{Path: checkpointPath}, r.OrganizationID, r.InstallationID, r.GrantID, r.KeyID, r.Purpose, now)
	if err != nil {
		return deny()
	}
	signature, err := base64.RawURLEncoding.DecodeString(r.Signature)
	if err != nil || len(signature) != ed25519.SignatureSize || !ed25519.Verify(publicKey, serviceMessage(r), signature) {
		return deny()
	}
	if err = ClaimNonce(filepath.Join(appDataDir, "authority", "vault-service-replay.json"), r.GrantID, r.Nonce, now); err != nil {
		return deny()
	}
	status, err := GetVaultStatus()
	if err != nil || status.Locked {
		return deny()
	}
	secret, err := osKeyring.Get(vaultServiceName(), r.KeyID)
	if err != nil || secret == "" {
		return deny()
	}
	conn, err := net.DialTimeout("tcp", net.JoinHostPort("127.0.0.1", strconv.Itoa(r.ChannelPort)), 3*time.Second)
	if err != nil {
		return deny()
	}
	defer conn.Close()
	if err = conn.SetWriteDeadline(time.Now().Add(3 * time.Second)); err != nil {
		return deny()
	}
	if err = json.NewEncoder(conn).Encode(map[string]string{"token": r.ChannelToken, "key": secret}); err != nil {
		return deny()
	}
	return nil
}
