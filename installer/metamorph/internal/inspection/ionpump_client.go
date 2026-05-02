package inspection

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// ─────────────────────────────────────────────────────────────────────────────
// HttpIonPumpClient — production implementation
// ─────────────────────────────────────────────────────────────────────────────

// HttpIonPumpClient talks to Brain's IonPump HTTP API.
// The port is read from Nucleus's shared config; the base URL is constructed once.
type HttpIonPumpClient struct {
	baseURL    string
	httpClient *http.Client
}

// NewHttpIonPumpClient constructs a production client.
// port is typically read from nucleus.json at startup.
func NewHttpIonPumpClient(port int) *HttpIonPumpClient {
	return &HttpIonPumpClient{
		baseURL: fmt.Sprintf("http://127.0.0.1:%d", port),
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

// QuiesceSite asks Brain to stop accepting new flows for the given site and
// wait until in-flight flows complete (or timeout elapses).
func (c *HttpIonPumpClient) QuiesceSite(site string, timeoutMs int) (QuiesceResult, error) {
	payload := map[string]interface{}{
		"site":       site,
		"timeout_ms": timeoutMs,
	}

	var result QuiesceResult
	if err := c.post("/ion/quiesce", payload, &result); err != nil {
		return QuiesceResult{}, err
	}

	return result, nil
}

// ReloadSite asks Brain to hot-reload the recipe for the given site after a swap.
func (c *HttpIonPumpClient) ReloadSite(site string, version string) (ReloadResult, error) {
	payload := map[string]interface{}{
		"site":    site,
		"version": version,
	}

	var result ReloadResult
	if err := c.post("/ion/reload", payload, &result); err != nil {
		return ReloadResult{}, err
	}

	return result, nil
}

// post is the shared HTTP helper — marshals payload, POSTs, and decodes the response.
func (c *HttpIonPumpClient) post(path string, payload interface{}, out interface{}) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("ionpump: failed to marshal request: %w", err)
	}

	resp, err := c.httpClient.Post(c.baseURL+path, "application/json", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("ionpump: request to %s failed: %w", path, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("ionpump: %s returned HTTP %d", path, resp.StatusCode)
	}

	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return fmt.Errorf("ionpump: failed to decode response from %s: %w", path, err)
	}

	return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// NoopIonPumpClient — test / dry-run implementation
// ─────────────────────────────────────────────────────────────────────────────

// NoopIonPumpClient always returns success without making any network calls.
// Used in unit tests and integration tests. Also used when --force-swap is set
// and we want to skip the Brain signal entirely.
type NoopIonPumpClient struct{}

func (n *NoopIonPumpClient) QuiesceSite(site string, timeoutMs int) (QuiesceResult, error) {
	return QuiesceResult{Status: "quiesced", ActiveFlows: 0}, nil
}

func (n *NoopIonPumpClient) ReloadSite(site string, version string) (ReloadResult, error) {
	return ReloadResult{Status: "reloaded", Version: version}, nil
}
