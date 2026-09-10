package authority

import (
	"bufio"
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

const currentCheckDomain = "BLOOM-AUTHORITY-CURRENT-PULL-v1"
const installationAuthDomain = "BLOOM-INSTALLATION-AUTH-v1"

type SyncNotice struct {
	OrganizationID   string    `json:"organization_id"`
	EventID          string    `json:"event_id"`
	InstallationID   string    `json:"installation_id"`
	AuthorityVersion string    `json:"authority_version"`
	CorrelationID    string    `json:"correlation_id"`
	Urgency          string    `json:"urgency"`
	CommittedAt      time.Time `json:"committed_at"`
}
type CurrentCheckPayload struct {
	Schema           string    `json:"schema"`
	SchemaVersion    string    `json:"schema_version"`
	CheckID          string    `json:"check_id"`
	Issuer           string    `json:"issuer"`
	OrganizationID   string    `json:"organization_id"`
	InstallationID   string    `json:"installation_id"`
	ChallengeDigest  string    `json:"challenge_digest"`
	AuthorityVersion string    `json:"authority_version"`
	StateDigest      string    `json:"state_digest"`
	SnapshotDigest   string    `json:"snapshot_digest"`
	CheckedAt        time.Time `json:"checked_at"`
}
type SyncMeasurement struct {
	AuthorityVersion                string
	Urgency                         string
	CommitToAcceptance              time.Duration
	CommitToHypotheticalRestriction time.Duration
	WouldBlockAt                    *time.Time
}
type SyncResult struct {
	State       *DurableState
	Measurement *SyncMeasurement
}
type syncChallenge struct {
	Challenge      string    `json:"challenge"`
	OrganizationID string    `json:"organization_id"`
	InstallationID string    `json:"installation_id"`
	IssuedAt       time.Time `json:"issued_at"`
	ExpiresAt      time.Time `json:"expires_at"`
}
type syncPull struct {
	Snapshot     json.RawMessage `json:"snapshot"`
	CurrentCheck Envelope        `json:"current_check"`
}

type SyncClient struct {
	BaseURL                string
	Binding                Binding
	InstallationPrivateKey ed25519.PrivateKey
	Verifier               *Verifier
	HTTP                   *http.Client
	Now                    func() time.Time
	PollInterval           time.Duration
}

func (c *SyncClient) now() time.Time {
	if c.Now != nil {
		return c.Now().UTC()
	}
	return time.Now().UTC()
}
func (c *SyncClient) client() *http.Client {
	if c.HTTP != nil {
		return c.HTTP
	}
	return &http.Client{Timeout: 15 * time.Second}
}
func (c *SyncClient) interval() time.Duration {
	if c.PollInterval > 0 {
		return c.PollInterval
	}
	return 20 * time.Second
}

func (c *SyncClient) signedRequest(ctx context.Context, method, path string, query url.Values) (*http.Request, error) {
	if len(c.InstallationPrivateKey) != ed25519.PrivateKeySize {
		return nil, errors.New("installation private key required")
	}
	base, err := url.Parse(c.BaseURL)
	if err != nil {
		return nil, err
	}
	base.Path = path
	base.RawQuery = query.Encode()
	timestamp := c.now().Format(time.RFC3339Nano)
	payload, _ := json.Marshal(map[string]string{"installation_id": c.Binding.InstallationID, "organization_id": c.Binding.OrganizationID, "method": method, "path": path, "timestamp": timestamp})
	canonical, err := Canonicalize(payload)
	if err != nil {
		return nil, err
	}
	sig := ed25519.Sign(c.InstallationPrivateKey, append(append([]byte(installationAuthDomain), 0), canonical...))
	req, err := http.NewRequestWithContext(ctx, method, base.String(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Bloom-Installation-Id", c.Binding.InstallationID)
	req.Header.Set("X-Bloom-Timestamp", timestamp)
	req.Header.Set("X-Bloom-Signature", base64.StdEncoding.EncodeToString(sig))
	return req, nil
}
func readResponse(response *http.Response, dst any) error {
	defer response.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(response.Body, (16<<20)+1))
	if err != nil {
		return err
	}
	if len(raw) > 16<<20 {
		return errors.New("authority sync response too large")
	}
	if response.StatusCode/100 != 2 {
		return fmt.Errorf("authority sync HTTP %d", response.StatusCode)
	}
	if rejectDuplicateKeys(raw) != nil {
		return errors.New("invalid authority sync JSON")
	}
	return decodeStrict(raw, dst)
}
func (c *SyncClient) challenge(ctx context.Context) (syncChallenge, error) {
	q := url.Values{"org": {c.Binding.OrganizationID}}
	req, err := c.signedRequest(ctx, http.MethodPost, "/v1/authority/sync/challenge", q)
	if err != nil {
		return syncChallenge{}, err
	}
	response, err := c.client().Do(req)
	if err != nil {
		return syncChallenge{}, err
	}
	var out syncChallenge
	if err = readResponse(response, &out); err != nil {
		return out, err
	}
	now := c.now()
	if out.Challenge == "" || out.OrganizationID != c.Binding.OrganizationID || out.InstallationID != c.Binding.InstallationID || out.IssuedAt.After(now.Add(2*time.Second)) || !now.Before(out.ExpiresAt) {
		return out, errors.New("invalid sync challenge")
	}
	return out, nil
}

func (c *SyncClient) verifyCurrent(raw Envelope, challenge string, snapshot []byte, now time.Time) (CurrentCheckPayload, error) {
	canonical, err := Canonicalize(raw.Payload)
	if err != nil {
		return CurrentCheckPayload{}, err
	}
	sum := sha256.Sum256(canonical)
	if raw.Integrity.Digest != base64.RawURLEncoding.EncodeToString(sum[:]) {
		return CurrentCheckPayload{}, errors.New("current check digest mismatch")
	}
	trust := c.Verifier.Trust
	if c.Verifier.Manifest != nil {
		trust, err = c.Verifier.Manifest.SnapshotTrust(now)
		if err != nil {
			return CurrentCheckPayload{}, err
		}
	}
	key := trust[c.Binding.Issuer][raw.Integrity.KeyID]
	sig, e := base64.RawURLEncoding.DecodeString(raw.Integrity.Signature)
	if e != nil || len(key) != ed25519.PublicKeySize || raw.Integrity.Canonicalization != "JCS-RFC8785" || raw.Integrity.DigestAlgorithm != "SHA-256" || raw.Integrity.SignatureAlgorithm != "Ed25519" || !ed25519.Verify(key, append(append([]byte(currentCheckDomain), 0), canonical...), sig) {
		return CurrentCheckPayload{}, errors.New("invalid current check signature")
	}
	var check CurrentCheckPayload
	if err = decodeWire(raw.Payload, &check); err != nil {
		return check, err
	}
	challengeSum := sha256.Sum256([]byte(challenge))
	if check.Schema != "bloom.authority.current-check" || check.SchemaVersion != "1.0" || check.CheckID == "" || check.Issuer != c.Binding.Issuer || check.OrganizationID != c.Binding.OrganizationID || check.InstallationID != c.Binding.InstallationID || check.ChallengeDigest != hex.EncodeToString(challengeSum[:]) || check.CheckedAt.After(now.Add(2*time.Second)) || now.Sub(check.CheckedAt) > 2*time.Minute {
		return check, errors.New("current check binding or freshness mismatch")
	}
	env, _, err := ParseAndVerifyEnvelope(snapshot, trust)
	if err != nil {
		return check, err
	}
	var payload SnapshotPayload
	if err = decodeWire(env.Payload, &payload); err != nil {
		return check, err
	}
	if check.AuthorityVersion != payload.AuthorityVersion || check.StateDigest == "" || check.SnapshotDigest != env.Integrity.Digest {
		return check, errors.New("current check does not match snapshot")
	}
	return check, nil
}

func (c *SyncClient) Sync(ctx context.Context, baseVersion string, notice *SyncNotice) (SyncResult, error) {
	if c.Verifier == nil || c.Verifier.Store == nil {
		return SyncResult{}, errors.New("authority verifier required")
	}
	challenge, err := c.challenge(ctx)
	if err != nil {
		return SyncResult{}, err
	}
	q := url.Values{"org": {c.Binding.OrganizationID}, "challenge": {challenge.Challenge}}
	if baseVersion != "" {
		q.Set("base_version", baseVersion)
	}
	req, err := c.signedRequest(ctx, http.MethodGet, "/v1/authority/sync/pull", q)
	if err != nil {
		return SyncResult{}, err
	}
	response, err := c.client().Do(req)
	if err != nil {
		return SyncResult{}, err
	}
	var pulled syncPull
	if err = readResponse(response, &pulled); err != nil {
		return SyncResult{}, err
	}
	now := c.now()
	check, err := c.verifyCurrent(pulled.CurrentCheck, challenge.Challenge, pulled.Snapshot, now)
	if err != nil {
		return SyncResult{}, err
	}
	state, err := c.Verifier.VerifyAndAccept(pulled.Snapshot, correlation(notice))
	if err != nil {
		return SyncResult{}, err
	}
	if state.Monotonic.HighWaterMark != check.AuthorityVersion || state.Monotonic.StateDigest != check.StateDigest {
		return SyncResult{}, errors.New("durable acceptance does not match current check")
	}
	result := SyncResult{State: state}
	if notice != nil {
		accepted := c.now()
		would := notice.CommittedAt.Add(50 * time.Second)
		result.Measurement = &SyncMeasurement{check.AuthorityVersion, notice.Urgency, accepted.Sub(notice.CommittedAt), 50 * time.Second, &would}
	}
	return result, nil
}
func correlation(n *SyncNotice) string {
	if n == nil {
		return "periodic-pull"
	}
	return n.CorrelationID
}
func (c *SyncClient) HandleNotice(ctx context.Context, n SyncNotice) (SyncResult, error) {
	if n.OrganizationID != c.Binding.OrganizationID || n.InstallationID != c.Binding.InstallationID || n.EventID == "" || (n.Urgency != "critical" && n.Urgency != "privileged" && n.Urgency != "standard") {
		return SyncResult{}, errors.New("invalid authority notice")
	}
	if _, err := strictVersion(n.AuthorityVersion); err != nil {
		return SyncResult{}, err
	}
	return c.Sync(ctx, c.baseVersion(), &n)
}

// ConsumeNotices reads disposable NDJSON hints. Every valid hint still performs a
// challenged authoritative pull; decoding a line can never mutate Authority state.
func (c *SyncClient) ConsumeNotices(ctx context.Context) (int, error) {
	query := url.Values{"org": {c.Binding.OrganizationID}}
	request, err := c.signedRequest(ctx, http.MethodGet, "/v1/authority/sync/notice", query)
	if err != nil {
		return 0, err
	}
	response, err := c.client().Do(request)
	if err != nil {
		return 0, err
	}
	defer response.Body.Close()
	if response.StatusCode/100 != 2 {
		return 0, fmt.Errorf("authority notice HTTP %d", response.StatusCode)
	}
	scanner := bufio.NewScanner(response.Body)
	scanner.Buffer(make([]byte, 4096), 1<<20)
	count := 0
	for scanner.Scan() {
		raw := append([]byte(nil), scanner.Bytes()...)
		var notice SyncNotice
		if err = decodeWire(raw, &notice); err != nil {
			return count, err
		}
		if _, err = c.HandleNotice(ctx, notice); err != nil {
			return count, err
		}
		count++
	}
	return count, scanner.Err()
}
func (c *SyncClient) baseVersion() string {
	if c.Verifier != nil && c.Verifier.Store != nil {
		if state, err := c.Verifier.Store.Load(); err == nil && state != nil {
			return state.Monotonic.HighWaterMark
		}
	}
	return ""
}
func (c *SyncClient) Poll(ctx context.Context) error {
	ticker := time.NewTicker(c.interval())
	defer ticker.Stop()
	for {
		if _, err := c.Sync(ctx, c.baseVersion(), nil); err != nil && ctx.Err() != nil {
			return ctx.Err()
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
		}
	}
}
