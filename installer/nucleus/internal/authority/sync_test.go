package authority

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"
)

func signedCurrent(t *testing.T, p CurrentCheckPayload, private ed25519.PrivateKey, keyID string) Envelope {
	t.Helper()
	raw, _ := json.Marshal(p)
	canonical, err := Canonicalize(raw)
	if err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(canonical)
	sig := ed25519.Sign(private, append(append([]byte(currentCheckDomain), 0), canonical...))
	return Envelope{Payload: raw, Integrity: Integrity{"JCS-RFC8785", "SHA-256", base64.RawURLEncoding.EncodeToString(sum[:]), "Ed25519", keyID, base64.RawURLEncoding.EncodeToString(sig)}}
}
func syncFixture(t *testing.T, now time.Time) (*SyncClient, *atomic.Int32, *atomic.Int32) {
	t.Helper()
	snapshotPayload, pub, priv := fullFixture(t, "1")
	snapshotPayload.IssuedAt = now
	snapshotPayload.NotBefore = now
	snapshotPayload.ExpiresAt = now.Add(time.Hour)
	_, installationPriv, _ := ed25519.GenerateKey(rand.Reader)
	binding := Binding{"org", "issuer", "installation"}
	snapshot := signedFixture(t, snapshotPayload, priv, "issuer-key")
	env, _, _ := ParseAndVerifyEnvelope(snapshot, TrustBundle{"issuer": {"issuer-key": pub}})
	state := FullContent{}
	_ = json.Unmarshal(snapshotPayload.Content, &state)
	stateRaw, _ := json.Marshal(state)
	stateCanonical, _ := Canonicalize(stateRaw)
	stateSum := sha256.Sum256(stateCanonical)
	stateDigest := base64.RawURLEncoding.EncodeToString(stateSum[:])
	var challenges, pulls atomic.Int32
	issued := map[string]bool{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Bloom-Signature") == "" {
			http.Error(w, "auth", 401)
			return
		}
		if r.URL.Path == "/v1/authority/sync/challenge" {
			n := challenges.Add(1)
			challenge := "challenge-" + string(rune('0'+n))
			issued[challenge] = true
			json.NewEncoder(w).Encode(syncChallenge{challenge, "org", "installation", now, now.Add(2 * time.Minute)})
			return
		}
		if r.URL.Path == "/v1/authority/sync/notice" {
			n := SyncNotice{"org", "event", "installation", "1", "notice", "standard", now.Add(-12 * time.Second)}
			_ = json.NewEncoder(w).Encode(n)
			_ = json.NewEncoder(w).Encode(n)
			return
		}
		pulls.Add(1)
		challenge := r.URL.Query().Get("challenge")
		if !issued[challenge] {
			http.Error(w, "replay", 403)
			return
		}
		delete(issued, challenge)
		sum := sha256.Sum256([]byte(challenge))
		check := CurrentCheckPayload{"bloom.authority.current-check", "1.0", "check", "issuer", "org", "installation", hex.EncodeToString(sum[:]), "1", stateDigest, env.Integrity.Digest, now}
		json.NewEncoder(w).Encode(syncPull{snapshot, signedCurrent(t, check, priv, "issuer-key")})
	}))
	t.Cleanup(server.Close)
	dir := t.TempDir()
	verifier := &Verifier{Trust: TrustBundle{"issuer": {"issuer-key": pub}}, Binding: binding, Store: &Store{Path: filepath.Join(dir, "state.json")}, Checkpoint: &CheckpointStore{Path: filepath.Join(dir, "checkpoint.json")}, Now: func() time.Time { return now }}
	return &SyncClient{BaseURL: server.URL, Binding: binding, InstallationPrivateKey: installationPriv, Verifier: verifier, Now: func() time.Time { return now }}, &challenges, &pulls
}

func TestSyncLostNoticePollAndRestartUseFreshChallenges(t *testing.T) {
	now := time.Date(2026, 9, 9, 10, 0, 0, 0, time.UTC)
	client, challenges, pulls := syncFixture(t, now)
	result, err := client.Sync(context.Background(), "", nil)
	if err != nil {
		t.Fatal(err)
	}
	if result.State.Monotonic.HighWaterMark != "1" || challenges.Load() != 1 || pulls.Load() != 1 {
		t.Fatal("initial pull did not accept")
	}
	restarted := *client
	if _, err = restarted.Sync(context.Background(), "1", nil); err != nil {
		t.Fatal(err)
	}
	if challenges.Load() != 2 || pulls.Load() != 2 {
		t.Fatal("restart reused a challenge")
	}
}
func TestSyncDuplicateNoticeAndShadowMeasurementsNeverRenew(t *testing.T) {
	now := time.Date(2026, 9, 9, 10, 0, 12, 0, time.UTC)
	client, _, _ := syncFixture(t, now)
	notice := SyncNotice{"org", "event", "installation", "1", "correlation", "standard", now.Add(-12 * time.Second)}
	first, err := client.HandleNotice(context.Background(), notice)
	if err != nil {
		t.Fatal(err)
	}
	second, err := client.HandleNotice(context.Background(), notice)
	if err != nil {
		t.Fatal(err)
	}
	if first.Measurement.CommitToAcceptance != 12*time.Second || first.Measurement.CommitToHypotheticalRestriction != 50*time.Second || first.Measurement.WouldBlockAt == nil {
		t.Fatal("latencies not separated")
	}
	if second.State.Emission.ExpiresAt != first.State.Emission.ExpiresAt {
		t.Fatal("replay renewed evidence")
	}
	if len(second.State.Journal) != len(first.State.Journal) {
		t.Fatal("duplicate changed durable acceptance")
	}
}

func TestSyncConsumesNoticeStreamThroughAuthoritativePull(t *testing.T) {
	now := time.Date(2026, 9, 9, 10, 0, 12, 0, time.UTC)
	client, challenges, pulls := syncFixture(t, now)
	count, err := client.ConsumeNotices(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if count != 2 || challenges.Load() != 2 || pulls.Load() != 2 {
		t.Fatal("notice stream did not trigger challenged pulls")
	}
	state, err := client.Verifier.Store.Load()
	if err != nil || state == nil || len(state.Journal) != 1 {
		t.Fatalf("duplicate notice changed durable state: %v", err)
	}
}
func TestSyncDisconnectAndInvalidNoticeDoNotMutate(t *testing.T) {
	now := time.Date(2026, 9, 9, 10, 0, 0, 0, time.UTC)
	client, _, _ := syncFixture(t, now)
	client.BaseURL = "http://127.0.0.1:1"
	client.HTTP = &http.Client{Timeout: 50 * time.Millisecond}
	if _, err := client.Sync(context.Background(), "", nil); err == nil {
		t.Fatal("disconnect accepted")
	}
	if state, err := client.Verifier.Store.Load(); !os.IsNotExist(err) || state != nil {
		t.Fatalf("disconnect mutated store: %v", err)
	}
	bad := SyncNotice{OrganizationID: "other", InstallationID: "installation", AuthorityVersion: "1", Urgency: "critical"}
	if _, err := client.HandleNotice(context.Background(), bad); err == nil {
		t.Fatal("bad notice accepted")
	}
}
func TestSignedRequestDoesNotSignQuery(t *testing.T) {
	_, private, _ := ed25519.GenerateKey(rand.Reader)
	c := SyncClient{BaseURL: "https://example.test", Binding: Binding{"o", "issuer", "i"}, InstallationPrivateKey: private, Now: func() time.Time { return time.Unix(0, 0).UTC() }}
	req, err := c.signedRequest(context.Background(), "GET", "/p", url.Values{"challenge": {"secret"}})
	if err != nil {
		t.Fatal(err)
	}
	if req.URL.Query().Get("challenge") != "secret" || req.Header.Get("X-Bloom-Signature") == "" {
		t.Fatal("request missing query or signature")
	}
}

func TestSyncBackendArtifacts(t *testing.T) {
	path := os.Getenv("AUTHORITY_SYNC_ARTIFACT")
	if path == "" {
		t.Skip("backend sync artifact not supplied")
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var a struct {
		Challenge      string    `json:"challenge"`
		Response       syncPull  `json:"response"`
		PublicKey      string    `json:"public_key"`
		KeyID          string    `json:"key_id"`
		OrganizationID string    `json:"organization_id"`
		InstallationID string    `json:"installation_id"`
		Issuer         string    `json:"issuer"`
		Now            time.Time `json:"now"`
	}
	if err = decodeStrict(raw, &a); err != nil {
		t.Fatal(err)
	}
	public, err := base64.RawURLEncoding.DecodeString(a.PublicKey)
	if err != nil {
		t.Fatal(err)
	}
	binding := Binding{a.OrganizationID, a.Issuer, a.InstallationID}
	dir := t.TempDir()
	verifier := &Verifier{Trust: TrustBundle{a.Issuer: {a.KeyID: ed25519.PublicKey(public)}}, Binding: binding, Store: &Store{Path: filepath.Join(dir, "state.json")}, Checkpoint: &CheckpointStore{Path: filepath.Join(dir, "checkpoint.json")}, Now: func() time.Time { return a.Now }}
	client := SyncClient{Binding: binding, Verifier: verifier, Now: func() time.Time { return a.Now }}
	check, err := client.verifyCurrent(a.Response.CurrentCheck, a.Challenge, a.Response.Snapshot, a.Now)
	if err != nil {
		t.Fatal(err)
	}
	state, err := verifier.VerifyAndAccept(a.Response.Snapshot, "backend-sync")
	if err != nil {
		t.Fatal(err)
	}
	if state.Monotonic.HighWaterMark != check.AuthorityVersion || state.Monotonic.StateDigest != check.StateDigest {
		t.Fatal("backend pull did not survive Go verification and checkpoint")
	}
}
