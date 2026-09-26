package vault

import (
	"bytes"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"io"
	"net"
	"nucleus/internal/authority"
	"nucleus/internal/governance/ownershipcontract"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestServiceRequestDeliversOnlyThroughLocalChannelAndRejectsReplay(t *testing.T) {
	dir := t.TempDir()
	app := filepath.Join(dir, "app")
	workspace := filepath.Join(dir, "workspace")
	root := filepath.Join(workspace, ".bloom", ".nucleus-org")
	for _, path := range []string{filepath.Join(app, "config"), filepath.Join(app, "authority"), filepath.Join(root, ".core")} {
		if err := os.MkdirAll(path, 0700); err != nil {
			t.Fatal(err)
		}
	}
	t.Setenv("BLOOM_APPDATA_DIR", app)
	t.Setenv("BLOOM_NUCLEUS_ROOT", root)
	config := map[string]any{"authority_base_url": "https://authority.test", "onboarding": map[string]any{"active_org_slug": "org",
		"organizations": []any{map[string]string{"org_slug": "org", "organization_id": "canonical-org", "workspace_path": workspace}}}}
	raw, _ := json.Marshal(config)
	if err := os.WriteFile(filepath.Join(app, "config", "nucleus.json"), raw, 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, ".core", ".nucleus-config.json"), []byte("{}"), 0600); err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC().Truncate(time.Second)
	org := "canonical-org"
	installation := "installation-1"
	issuer := "issuer"
	ownership := ownershipcontract.Document{Schema: ownershipcontract.SchemaName, SchemaVersion: ownershipcontract.SchemaVersion,
		AuthorityMode: ownershipcontract.AuthorityModeRemoteEnforced,
		Organization:  ownershipcontract.Organization{CanonicalID: &org, TenantID: &org}, Installation: ownershipcontract.Installation{InstallationID: installation},
		Binding:      ownershipcontract.Binding{State: ownershipcontract.BindingStateRemoteLocked, IssuerID: &issuer, AcceptedAt: &now, RemoteLockedAt: &now},
		TrustBinding: &ownershipcontract.TrustBinding{IssuerID: issuer, TrustAnchorID: "root", TrustAnchorFingerprintSHA256: "fingerprint", BoundOrganizationID: org, BoundInstallationID: installation, AcceptedAt: now},
		CreatedAt:    now, UpdatedAt: now}
	raw, _ = json.Marshal(ownership)
	if err := os.WriteFile(filepath.Join(root, ".ownership.json"), raw, 0600); err != nil {
		t.Fatal(err)
	}
	if !remoteEnforcedAt(root) {
		t.Fatal("remote ownership fixture invalid")
	}
	if legacyVaultAllowed() {
		t.Fatal("remote_enforced fell back to local master marker")
	}
	otherRoot := t.TempDir()
	t.Setenv("BLOOM_NUCLEUS_ROOT", otherRoot)
	if legacyVaultAllowed() {
		t.Fatal("environment override bypassed remote_enforced")
	}
	t.Setenv("BLOOM_NUCLEUS_ROOT", root)
	authorityPublic, authorityPrivate, _ := ed25519.GenerateKey(rand.Reader)
	servicePublic, servicePrivate, _ := ed25519.GenerateKey(rand.Reader)
	state := authority.FullContent{Principals: []authority.Principal{{PrincipalID: "human", PrincipalType: "human", Status: "active", ExternalIdentities: []authority.ExternalIdentity{}}},
		Memberships: []authority.Membership{}, RoleDefinitions: []authority.RoleDefinition{}, RoleAssignments: []authority.RoleAssignment{}, Revocations: []authority.Revocation{},
		VaultServiceGrants: []authority.VaultServiceGrant{{GrantID: "grant", OrganizationID: org, InstallationID: installation, Consumer: "aitap", Permission: "vault.key.read",
			KeyID: "anthropic-key:default", Purpose: servicePurpose, ServicePublicKey: base64.RawURLEncoding.EncodeToString(servicePublic), IssuedByPrincipalID: "human",
			ValidFrom: now.Add(-time.Minute), ValidUntil: now.Add(time.Hour)}}}
	content, _ := json.Marshal(state)
	payload := authority.SnapshotPayload{Schema: "bloom.authority.snapshot", SchemaVersion: "1.0", Kind: "full", SnapshotID: "snapshot", Issuer: issuer, OrganizationID: org,
		AuthorityVersion: "1", IssuedAt: now.Add(-time.Minute), NotBefore: now.Add(-time.Minute), ExpiresAt: now.Add(4 * time.Minute), Audience: authority.Audience{OrganizationID: org, InstallationIDs: []string{installation}}, Content: content}
	payloadRaw, _ := json.Marshal(payload)
	canonical, err := authority.Canonicalize(payloadRaw)
	if err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256(canonical)
	signature := ed25519.Sign(authorityPrivate, append([]byte("BLOOM-AUTHORITY-SNAPSHOT-v1\x00"), canonical...))
	envelope, _ := json.Marshal(authority.Envelope{Payload: payloadRaw, Integrity: authority.Integrity{Canonicalization: "JCS-RFC8785", DigestAlgorithm: "SHA-256",
		Digest: base64.RawURLEncoding.EncodeToString(digest[:]), SignatureAlgorithm: "Ed25519", KeyID: "key", Signature: base64.RawURLEncoding.EncodeToString(signature)}})
	verifier := &authority.Verifier{Trust: authority.TrustBundle{issuer: {"key": authorityPublic}}, Binding: authority.Binding{OrganizationID: org, Issuer: issuer, InstallationID: installation},
		Store: &authority.Store{Path: filepath.Join(app, "authority", "state.json")}, Checkpoint: &authority.CheckpointStore{Path: filepath.Join(app, "authority", "checkpoint.json")}, Now: func() time.Time { return now }}
	if _, err = verifier.VerifyAndAccept(envelope, "test"); err != nil {
		t.Fatal(err)
	}
	writeVaultStatus(t, false)
	fake := withFakeKeyring(t)
	const secret = "sensitive-fixture-secret"
	fake.store[vaultServiceName()+"/anthropic-key:default"] = secret
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	nonce := base64.RawURLEncoding.EncodeToString(bytes.Repeat([]byte{3}, 32))
	token := base64.RawURLEncoding.EncodeToString(bytes.Repeat([]byte{4}, 32))
	request := ServiceRequest{GrantID: "grant", OrganizationID: org, InstallationID: installation, KeyID: "anthropic-key:default", Purpose: servicePurpose,
		Timestamp: time.Now().UTC().Format(time.RFC3339Nano), Nonce: nonce, ChannelPort: listener.Addr().(*net.TCPAddr).Port, ChannelToken: token}
	request.Signature = base64.RawURLEncoding.EncodeToString(ed25519.Sign(servicePrivate, serviceMessage(request)))
	encoded, _ := json.Marshal(request)
	received := make(chan string, 1)
	go func() {
		conn, acceptErr := listener.Accept()
		if acceptErr != nil {
			received <- ""
			return
		}
		defer conn.Close()
		body, _ := io.ReadAll(conn)
		received <- string(body)
	}()
	if err = RunServiceRequest(bytes.NewReader(encoded), app); err != nil {
		t.Fatal(err)
	}
	body := <-received
	if !strings.Contains(body, secret) || !strings.Contains(body, token) {
		t.Fatal("local delivery missing authenticated secret")
	}
	calls := len(fake.calls)
	if err = RunServiceRequest(bytes.NewReader(encoded), app); err == nil || len(fake.calls) != calls {
		t.Fatal("replay reached keyring")
	}
	request.Nonce = base64.RawURLEncoding.EncodeToString(bytes.Repeat([]byte{5}, 32))
	request.Signature = base64.RawURLEncoding.EncodeToString(ed25519.Sign(servicePrivate, serviceMessage(request)))
	request.Signature = "invalid"
	encoded, _ = json.Marshal(request)
	if err = RunServiceRequest(bytes.NewReader(encoded), app); err == nil || len(fake.calls) != calls {
		t.Fatal("invalid signature reached keyring")
	}
	request.Timestamp = time.Now().UTC().Add(time.Minute).Format(time.RFC3339Nano)
	request.Signature = base64.RawURLEncoding.EncodeToString(ed25519.Sign(servicePrivate, serviceMessage(request)))
	encoded, _ = json.Marshal(request)
	if err = RunServiceRequest(bytes.NewReader(encoded), app); err == nil || len(fake.calls) != calls {
		t.Fatal("future timestamp reached keyring")
	}
}
