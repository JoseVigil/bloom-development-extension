package authority

import (
	"context"
	"crypto/ed25519"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"time"
)

func FetchAndVerifyTrustManifest(ctx context.Context, baseURL string, binding Binding, privateKey ed25519.PrivateKey, roots map[string]ed25519.PublicKey, httpClient *http.Client, now time.Time) (*VerifiedTrustManifest, TrustBundle, error) {
	client := &SyncClient{BaseURL: baseURL, Binding: binding, InstallationPrivateKey: privateKey, HTTP: httpClient, Now: func() time.Time { return now }}
	req, err := client.signedRequest(ctx, http.MethodGet, "/v1/authority/trust-manifest", url.Values{"org": {binding.OrganizationID}})
	if err != nil {
		return nil, nil, err
	}
	response, err := client.client().Do(req)
	if err != nil {
		return nil, nil, err
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(response.Body, (4<<20)+1))
	if err != nil {
		return nil, nil, err
	}
	if response.StatusCode/100 != 2 {
		return nil, nil, errors.New("trust manifest transport failed")
	}
	if len(raw) > 4<<20 {
		return nil, nil, errors.New("trust manifest response too large")
	}
	var probe struct {
		Payload struct {
			Issuer string `json:"issuer"`
		} `json:"payload"`
	}
	if rejectDuplicateKeys(raw) != nil || json.Unmarshal(raw, &probe) != nil || probe.Payload.Issuer == "" {
		return nil, nil, errors.New("invalid trust manifest response")
	}
	binding.Issuer = probe.Payload.Issuer
	manifest, err := ParseAndVerifyTrustManifest(raw, roots, binding, now.UTC())
	if err != nil {
		return nil, nil, err
	}
	trust, err := manifest.SnapshotTrust(now.UTC())
	if err != nil {
		return nil, nil, err
	}
	return manifest, trust, nil
}
