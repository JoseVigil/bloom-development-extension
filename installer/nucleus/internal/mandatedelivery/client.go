package mandatedelivery

import (
	"context"
	"crypto"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"nucleus/internal/authority"
	"time"
)

type Client struct {
	BaseURL string
	HTTP    *http.Client
	Signer  crypto.Signer
	Context Context
	Store   *Store
}

// ReceiveOutcome es el resultado de Client.Receive — expone el MandateID que Verify ya
// conoce internamente apenas tiene éxito, para que un caller (authority_command.go) pueda
// encadenar la materialización sin necesitar abrir receipt.json a mano.
type ReceiveOutcome struct {
	Status    string // "pending" | "accepted" | "replay"
	MandateID string // vacío cuando Status == "pending"
}

func (c *Client) Receive(ctx context.Context) (ReceiveOutcome, error) {
	if c.Signer == nil || c.Store == nil || c.Context.OrganizationID == "" || c.Context.InstallationID == "" {
		return ReceiveOutcome{}, errors.New("injected dependencies required")
	}
	if _, ok := c.Signer.Public().(ed25519.PublicKey); !ok {
		return ReceiveOutcome{}, errors.New("Ed25519 installation signer required")
	}
	u, err := url.Parse(c.BaseURL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || u.User != nil {
		return ReceiveOutcome{}, errors.New("invalid transport URL")
	}
	u.Path = "/v1/mandate/bootstrap"
	u.RawPath = ""
	u.Fragment = ""
	q := url.Values{"org": {c.Context.OrganizationID}, "installation_id": {c.Context.InstallationID}}
	u.RawQuery = q.Encode()
	now := time.Now().UTC()
	if c.Context.Now != nil {
		now = c.Context.Now().UTC()
	}
	stamp := now.Format(time.RFC3339Nano)
	raw, _ := json.Marshal(map[string]string{"installation_id": c.Context.InstallationID, "organization_id": c.Context.OrganizationID, "method": "GET", "path": u.Path, "timestamp": stamp})
	canonical, err := authority.Canonicalize(raw)
	if err != nil {
		return ReceiveOutcome{}, err
	}
	sig, err := c.Signer.Sign(nil, append(append([]byte("BLOOM-INSTALLATION-AUTH-v1"), 0), canonical...), crypto.Hash(0))
	if err != nil {
		return ReceiveOutcome{}, err
	}
	request, err := http.NewRequestWithContext(ctx, "GET", u.String(), nil)
	if err != nil {
		return ReceiveOutcome{}, err
	}
	request.Header.Set("X-Bloom-Installation-Id", c.Context.InstallationID)
	request.Header.Set("X-Bloom-Timestamp", stamp)
	request.Header.Set("X-Bloom-Signature", base64.StdEncoding.EncodeToString(sig))
	transport := http.Client{Timeout: 30 * time.Second}
	if c.HTTP != nil {
		transport = *c.HTTP
	}
	transport.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	response, err := transport.Do(request)
	if err != nil {
		return ReceiveOutcome{}, err
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, maxBody+1))
	if err != nil {
		return ReceiveOutcome{}, err
	}
	if len(body) > maxBody {
		return ReceiveOutcome{}, errors.New("response too large")
	}
	if response.StatusCode == 404 {
		return ReceiveOutcome{Status: "pending"}, nil
	}
	if response.StatusCode != 200 {
		return ReceiveOutcome{}, fmt.Errorf("delivery HTTP %d", response.StatusCode)
	}
	outcome, err := c.Store.Accept(body, c.Context)
	if err != nil {
		return ReceiveOutcome{}, err
	}
	return ReceiveOutcome{Status: outcome.Status, MandateID: outcome.MandateID}, nil
}
