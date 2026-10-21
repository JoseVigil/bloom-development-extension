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
	"regexp"
	"time"

	"nucleus/internal/authority"
)

// OfferSelection is exactly what the Paladín selected: the definition, its
// version and the digest shown in the catalog. Nothing else is requested.
type OfferSelection struct {
	DefinitionID string
	Version      string
	Digest       string
}

type OfferReceipt struct {
	Status      string // accepted | replay
	ReceiptPath string
	Envelope    Envelope
	Content     []byte
}

// OfferHTTPError carries the Backend status and error code of a rejected request.
type OfferHTTPError struct {
	Status int
	Code   string
}

func (e *OfferHTTPError) Error() string { return fmt.Sprintf("offer HTTP %d %s", e.Status, e.Code) }

var (
	selectionID      = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
	selectionVersion = regexp.MustCompile(`^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$`)
	selectionDigest  = regexp.MustCompile(`^[0-9a-f]{64}$`)
)

func (s OfferSelection) valid() error {
	if !selectionID.MatchString(s.DefinitionID) || !selectionVersion.MatchString(s.Version) || !selectionDigest.MatchString(s.Digest) {
		return errors.New("invalid offer selection")
	}
	return nil
}

// signedGet performs a GET authenticated with the installation identity.
func (c *Client) signedGet(ctx context.Context, path string, query url.Values) (int, []byte, error) {
	if c.Signer == nil || c.Context.OrganizationID == "" || c.Context.InstallationID == "" {
		return 0, nil, errors.New("injected dependencies required")
	}
	if _, ok := c.Signer.Public().(ed25519.PublicKey); !ok {
		return 0, nil, errors.New("Ed25519 installation signer required")
	}
	u, err := url.Parse(c.BaseURL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || u.User != nil {
		return 0, nil, errors.New("invalid transport URL")
	}
	u.Path = path
	u.RawPath = ""
	u.Fragment = ""
	u.RawQuery = query.Encode()
	now := time.Now().UTC()
	if c.Context.Now != nil {
		now = c.Context.Now().UTC()
	}
	stamp := now.Format(time.RFC3339Nano)
	raw, _ := json.Marshal(map[string]string{"installation_id": c.Context.InstallationID, "organization_id": c.Context.OrganizationID, "method": "GET", "path": u.Path, "timestamp": stamp})
	canonical, err := authority.Canonicalize(raw)
	if err != nil {
		return 0, nil, err
	}
	sig, err := c.Signer.Sign(nil, append(append([]byte("BLOOM-INSTALLATION-AUTH-v1"), 0), canonical...), crypto.Hash(0))
	if err != nil {
		return 0, nil, err
	}
	request, err := http.NewRequestWithContext(ctx, "GET", u.String(), nil)
	if err != nil {
		return 0, nil, err
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
		return 0, nil, err
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, maxBody+1))
	if err != nil {
		return 0, nil, err
	}
	if len(body) > maxBody {
		return 0, nil, errors.New("response too large")
	}
	return response.StatusCode, body, nil
}

func httpError(status int, body []byte) error {
	var e struct {
		Error string `json:"error"`
	}
	_ = json.Unmarshal(body, &e)
	return &OfferHTTPError{Status: status, Code: e.Error}
}

// ListOffers reads the catalog of the organization. It never downloads bytes.
func (c *Client) ListOffers(ctx context.Context) ([]byte, error) {
	status, body, err := c.signedGet(ctx, "/v1/mandate/offers", url.Values{"org": {c.Context.OrganizationID}})
	if err != nil {
		return nil, err
	}
	if status != 200 {
		return nil, httpError(status, body)
	}
	return body, nil
}

// ReceiveOffer downloads exactly the selected version and stores its receipt.
// Order, with no write before the last step:
//  1. Authority envelope verification (signature, recipient, digest of bytes);
//  2. envelope == selection (definition, version, digest);
//  3. verifyContent (publisher signature and schema of the definition);
//  4. Store.Accept (atomic, idempotent receipt).
func (c *Client) ReceiveOffer(ctx context.Context, sel OfferSelection, verifyContent func([]byte) error) (OfferReceipt, error) {
	if err := sel.valid(); err != nil {
		return OfferReceipt{}, err
	}
	if c.Store == nil || verifyContent == nil {
		return OfferReceipt{}, errors.New("injected dependencies required")
	}
	path := "/v1/mandate/offers/" + sel.DefinitionID + "/versions/" + sel.Version
	status, body, err := c.signedGet(ctx, path, url.Values{"org": {c.Context.OrganizationID}, "installation_id": {c.Context.InstallationID}, "digest": {sel.Digest}})
	if err != nil {
		return OfferReceipt{}, err
	}
	if status != 200 {
		return OfferReceipt{}, httpError(status, body)
	}
	d, content, err := Verify(body, c.Context)
	if err != nil {
		return OfferReceipt{}, err
	}
	e := d.Envelope
	if e.MandateID != sel.DefinitionID || e.Version != sel.Version || e.Digest != sel.Digest {
		return OfferReceipt{}, errors.New("delivered offer differs from the selection")
	}
	if err := verifyContent(content); err != nil {
		return OfferReceipt{}, err
	}
	outcome, err := c.Store.Accept(body, c.Context)
	if err != nil {
		return OfferReceipt{}, err
	}
	return OfferReceipt{Status: outcome.Status, ReceiptPath: c.Store.ReceiptPath(e), Envelope: e, Content: content}, nil
}
