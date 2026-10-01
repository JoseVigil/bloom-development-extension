package authority

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

const installationCapabilityDomain = "BLOOM-AUTHORITY-INSTALLATION-CAPABILITY-v1"
const installationCapabilityPath = "/v1/authority/installations/capabilities"

var ErrInstallationCapabilityUnavailable = errors.New("authority installation capability unavailable")

type InstallationCapabilityDeclaration struct {
	OrganizationID                   string    `json:"organizationId"`
	InstallationID                   string    `json:"installationId"`
	Revision                         string    `json:"revision"`
	SupportedAuthoritySchemaVersions []string  `json:"supportedAuthoritySchemaVersions"`
	Source                           string    `json:"source"`
	DeclaredAt                       time.Time `json:"declaredAt"`
}

type installationCapabilityBootstrap struct {
	Error                     string `json:"error"`
	BootstrapExpectedRevision string `json:"bootstrapExpectedRevision"`
}

type installationCapabilityUpdate struct {
	OrganizationID                   string   `json:"organizationId"`
	InstallationID                   string   `json:"installationId"`
	RequestID                        string   `json:"requestId"`
	ExpectedRevision                 string   `json:"expectedRevision"`
	SupportedAuthoritySchemaVersions []string `json:"supportedAuthoritySchemaVersions"`
	Timestamp                        string   `json:"timestamp"`
	Signature                        string   `json:"signature"`
}

type installationCapabilityUpdateResponse struct {
	InstallationID                   string   `json:"installationId"`
	Revision                         string   `json:"revision"`
	SupportedAuthoritySchemaVersions []string `json:"supportedAuthoritySchemaVersions"`
}

type InstallationCapabilityClient struct {
	BaseURL        string
	OrganizationID string
	Identity       *LocalIdentity
	HTTP           *http.Client
	Now            func() time.Time
}

func (c *InstallationCapabilityClient) now() time.Time {
	if c.Now != nil {
		return c.Now().UTC()
	}
	return time.Now().UTC()
}

func (c *InstallationCapabilityClient) client() *http.Client {
	if c.HTTP != nil {
		return c.HTTP
	}
	return &http.Client{Timeout: 15 * time.Second}
}

func (c *InstallationCapabilityClient) validate() error {
	if c.OrganizationID == "" || c.Identity == nil || !validUUID(c.Identity.InstallationID) || len(c.Identity.PrivateKey) != ed25519.PrivateKeySize {
		return ErrInstallationCapabilityUnavailable
	}
	return nil
}

func (c *InstallationCapabilityClient) signedRequest(ctx context.Context, method string, body []byte, timestamp time.Time) (*http.Request, error) {
	if err := c.validate(); err != nil {
		return nil, err
	}
	u, err := authorityURL(c.BaseURL, installationCapabilityPath)
	if err != nil {
		return nil, err
	}
	u.RawQuery = url.Values{"org": {c.OrganizationID}}.Encode()
	var reader io.Reader
	if body != nil {
		reader = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, u.String(), reader)
	if err != nil {
		return nil, err
	}
	stamp := timestamp.UTC().Format(time.RFC3339Nano)
	authPayload, _ := json.Marshal(map[string]string{"installation_id": c.Identity.InstallationID, "organization_id": c.OrganizationID, "method": method, "path": installationCapabilityPath, "timestamp": stamp})
	canonical, err := Canonicalize(authPayload)
	if err != nil {
		return nil, err
	}
	signature := ed25519.Sign(c.Identity.PrivateKey, append(append([]byte(installationAuthDomain), 0), canonical...))
	req.Header.Set("X-Bloom-Installation-Id", c.Identity.InstallationID)
	req.Header.Set("X-Bloom-Timestamp", stamp)
	req.Header.Set("X-Bloom-Signature", base64.StdEncoding.EncodeToString(signature))
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	return req, nil
}

func (c *InstallationCapabilityClient) Get(ctx context.Context) (*InstallationCapabilityDeclaration, string, error) {
	now := c.now()
	req, err := c.signedRequest(ctx, http.MethodGet, nil, now)
	if err != nil {
		return nil, "", err
	}
	response, err := c.client().Do(req)
	if err != nil {
		return nil, "", err
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(response.Body, (1<<20)+1))
	if err != nil || len(raw) > 1<<20 || rejectDuplicateKeys(raw) != nil {
		return nil, "", ErrInstallationCapabilityUnavailable
	}
	if response.StatusCode == http.StatusNotFound {
		var bootstrap installationCapabilityBootstrap
		if decodeStrict(raw, &bootstrap) != nil || bootstrap.Error != "authority_installation_capability_unavailable" || bootstrap.BootstrapExpectedRevision != "0" {
			return nil, "", ErrInstallationCapabilityUnavailable
		}
		return nil, "0", nil
	}
	if response.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("installation capability GET HTTP %d", response.StatusCode)
	}
	var declaration InstallationCapabilityDeclaration
	if decodeStrict(raw, &declaration) != nil || declaration.OrganizationID != c.OrganizationID || declaration.InstallationID != c.Identity.InstallationID || declaration.Revision == "" || declaration.DeclaredAt.IsZero() || (declaration.Source != "registration" && declaration.Source != "signed_update") || !validCapabilityVersions(declaration.SupportedAuthoritySchemaVersions) {
		return nil, "", ErrInstallationCapabilityUnavailable
	}
	if _, err := strictVersion(declaration.Revision); err != nil {
		return nil, "", ErrInstallationCapabilityUnavailable
	}
	return &declaration, declaration.Revision, nil
}

func (c *InstallationCapabilityClient) put(ctx context.Context, expectedRevision string, attempt int) error {
	expected, err := strictCapabilityRevision(expectedRevision)
	if err != nil {
		return ErrInstallationCapabilityUnavailable
	}
	timestamp := c.now()
	stamp := timestamp.Format(time.RFC3339Nano)
	nonce := make([]byte, 16)
	if _, err := rand.Read(nonce); err != nil {
		return err
	}
	requestID := fmt.Sprintf("nucleus-capability-1.1:%s:%s:%d:%s", c.Identity.InstallationID, expectedRevision, attempt, hex.EncodeToString(nonce))
	payload := struct {
		OrganizationID                   string   `json:"organization_id"`
		InstallationID                   string   `json:"installation_id"`
		RequestID                        string   `json:"request_id"`
		ExpectedRevision                 string   `json:"expected_revision"`
		SupportedAuthoritySchemaVersions []string `json:"supported_authority_schema_versions"`
		Timestamp                        string   `json:"timestamp"`
	}{c.OrganizationID, c.Identity.InstallationID, requestID, expectedRevision, []string{"1.0", "1.1"}, stamp}
	rawPayload, _ := json.Marshal(payload)
	canonical, err := Canonicalize(rawPayload)
	if err != nil {
		return err
	}
	signature := ed25519.Sign(c.Identity.PrivateKey, append(append([]byte(installationCapabilityDomain), 0), canonical...))
	body, _ := json.Marshal(installationCapabilityUpdate{c.OrganizationID, c.Identity.InstallationID, requestID, expectedRevision, []string{"1.0", "1.1"}, stamp, base64.StdEncoding.EncodeToString(signature)})
	req, err := c.signedRequest(ctx, http.MethodPut, body, timestamp)
	if err != nil {
		return err
	}
	response, err := c.client().Do(req)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(response.Body, (1<<20)+1))
	if err != nil || len(raw) > 1<<20 || rejectDuplicateKeys(raw) != nil {
		return ErrInstallationCapabilityUnavailable
	}
	if response.StatusCode == http.StatusConflict {
		var problem struct {
			Error string `json:"error"`
		}
		if decodeStrict(raw, &problem) == nil && problem.Error == "authority_installation_capability_revision_conflict" {
			return errInstallationCapabilityCAS
		}
		return ErrInstallationCapabilityUnavailable
	}
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("installation capability PUT HTTP %d", response.StatusCode)
	}
	var result installationCapabilityUpdateResponse
	if decodeStrict(raw, &result) != nil || result.InstallationID != c.Identity.InstallationID || result.Revision != strconv.FormatUint(expected+1, 10) || !sameCapabilityVersions(result.SupportedAuthoritySchemaVersions, []string{"1.0", "1.1"}) {
		return ErrInstallationCapabilityUnavailable
	}
	return nil
}

var errInstallationCapabilityCAS = errors.New("authority installation capability revision conflict")

func (c *InstallationCapabilityClient) Ensure11(ctx context.Context) (*InstallationCapabilityDeclaration, error) {
	declaration, expected, err := c.Get(ctx)
	if err != nil {
		return nil, err
	}
	if declaration != nil && supportsAuthority11(declaration.SupportedAuthoritySchemaVersions) {
		return declaration, nil
	}
	for attempt := 0; attempt < 2; attempt++ {
		putErr := c.put(ctx, expected, attempt)
		if putErr != nil && !errors.Is(putErr, errInstallationCapabilityCAS) {
			return nil, putErr
		}
		declaration, expected, err = c.Get(ctx)
		if err != nil {
			return nil, err
		}
		if declaration != nil && supportsAuthority11(declaration.SupportedAuthoritySchemaVersions) {
			return declaration, nil
		}
		if attempt == 0 && errors.Is(putErr, errInstallationCapabilityCAS) {
			continue
		}
		return nil, ErrInstallationCapabilityUnavailable
	}
	return nil, ErrInstallationCapabilityUnavailable
}

func sameCapabilityVersions(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func supportsAuthority11(versions []string) bool {
	for _, version := range versions {
		if version == "1.1" {
			return true
		}
	}
	return false
}

func validCapabilityVersions(versions []string) bool {
	if len(versions) == 0 || len(versions) > 2 {
		return false
	}
	seen := map[string]bool{}
	for _, version := range versions {
		if (version != "1.0" && version != "1.1") || seen[version] {
			return false
		}
		seen[version] = true
	}
	return true
}

func strictCapabilityRevision(value string) (uint64, error) {
	if value == "0" {
		return 0, nil
	}
	return strictVersion(value)
}
