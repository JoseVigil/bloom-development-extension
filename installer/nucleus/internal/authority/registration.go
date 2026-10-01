package authority

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
)

func RegisterInstallation(ctx context.Context, baseURL, serviceToken, organizationID string, identity *LocalIdentity, httpClient *http.Client) error {
	if identity == nil || !validUUID(identity.InstallationID) || len(identity.PublicKey) != 32 || organizationID == "" || serviceToken == "" {
		return errors.New("installation registration inputs required")
	}
	u, err := authorityURL(baseURL, "/v1/authority/installations/register")
	if err != nil {
		return err
	}
	query := url.Values{"org": {organizationID}}
	u.RawQuery = query.Encode()
	body, _ := json.Marshal(struct {
		InstallationID                   string   `json:"installation_id"`
		PublicKeyRaw                     string   `json:"public_key_raw"`
		SupportedAuthoritySchemaVersions []string `json:"supported_authority_schema_versions"`
	}{identity.InstallationID, base64.StdEncoding.EncodeToString(identity.PublicKey), []string{"1.0", "1.1"}})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u.String(), bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+serviceToken)
	req.Header.Set("Content-Type", "application/json")
	client := httpClient
	if client == nil {
		client = &http.Client{}
	}
	response, err := client.Do(req)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return err
	}
	if response.StatusCode == http.StatusCreated {
		return nil
	}
	if response.StatusCode == http.StatusConflict {
		var problem struct {
			Error string `json:"error"`
		}
		if rejectDuplicateKeys(raw) == nil && decodeStrict(raw, &problem) == nil && problem.Error == "installation_conflict" {
			return nil
		}
	}
	return fmt.Errorf("installation registration HTTP %d", response.StatusCode)
}

func authorityURL(baseURL, path string) (*url.URL, error) {
	u, err := url.Parse(baseURL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || u.User != nil {
		return nil, errors.New("invalid authority base URL")
	}
	u.Path = path
	u.RawPath, u.RawQuery, u.Fragment = "", "", ""
	return u, nil
}
