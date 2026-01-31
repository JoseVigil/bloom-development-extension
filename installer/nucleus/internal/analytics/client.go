package analytics

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"time"
)

const (
	DefaultEndpoint = "https://api.bloom.ai/v1/analytics"
	Timeout         = 10 * time.Second
)

type Client struct {
	endpoint string
	orgID    string
	apiKey   string
	client   *http.Client
}

type Heartbeat struct {
	OrgID         string    `json:"org_id"`
	Timestamp     time.Time `json:"timestamp"`
	Version       string    `json:"version"`
	ActiveWorkers int       `json:"active_workers"`
	IntentVolume  int       `json:"intent_volume"`
	SystemHealth  string    `json:"system_health"`
}

type HeartbeatResponse struct {
	Status  string `json:"status"`
	Message string `json:"message"`
}

func NewClient(orgID, apiKey string) *Client {
	return &Client{
		endpoint: DefaultEndpoint,
		orgID:    orgID,
		apiKey:   apiKey,
		client: &http.Client{
			Timeout: Timeout,
		},
	}
}

func (c *Client) SendHeartbeat(hb *Heartbeat) error {
	hb.OrgID = c.orgID
	hb.Timestamp = time.Now()

	data, err := json.Marshal(hb)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", c.endpoint+"/heartbeat", bytes.NewBuffer(data))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return errors.New("heartbeat failed")
	}

	var response HeartbeatResponse
	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		return err
	}

	return nil
}

func (c *Client) PushState(state map[string]interface{}) error {
	data, err := json.Marshal(state)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", c.endpoint+"/state", bytes.NewBuffer(data))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return errors.New("state push failed")
	}

	return nil
}

func (c *Client) PullPermissions() (map[string]interface{}, error) {
	req, err := http.NewRequest("GET", c.endpoint+"/permissions", nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, errors.New("permissions pull failed")
	}

	var permissions map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&permissions); err != nil {
		return nil, err
	}

	return permissions, nil
}