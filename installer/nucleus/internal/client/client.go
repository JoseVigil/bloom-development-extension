package client

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

// ============================================
// Paquete client — infraestructura HTTP + resolución de OrgID.
// No importa governance. Lee el blueprint directamente del disco
// para evitar ciclos de dependencia.
// ============================================

const (
	DefaultEndpoint = "https://api.bloom.ai/v1/analytics"
	Timeout         = 10 * time.Second
)

// Client es el transportador HTTP genérico hacia la API de Bloom.
type Client struct {
	endpoint string
	OrgID    string
	apiKey   string
	http     *http.Client
}

// NewClient construye un Client listo para usar.
func NewClient(orgID, apiKey string) *Client {
	return &Client{
		endpoint: DefaultEndpoint,
		OrgID:    orgID,
		apiKey:   apiKey,
		http: &http.Client{
			Timeout: Timeout,
		},
	}
}

// SendHeartbeat POSTea un payload arbitrario al endpoint /heartbeat.
// El struct concreto (Heartbeat) se define en analytics; aquí solo nos
// importa que sea serializable a JSON.
func (c *Client) SendHeartbeat(payload interface{}) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", c.endpoint+"/heartbeat", bytes.NewBuffer(data))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return errors.New("heartbeat failed")
	}

	return nil
}

// PushState POSTea un mapa de estado al endpoint /state.
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

	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return errors.New("state push failed")
	}

	return nil
}

// PullPermissions hace GET al endpoint /permissions y retorna el mapa recibido.
func (c *Client) PullPermissions() (map[string]interface{}, error) {
	req, err := http.NewRequest("GET", c.endpoint+"/permissions", nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.http.Do(req)
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

// ============================================
// Resolución de contexto organizacional
// ============================================

// orgIdentity replica únicamente el campo que necesitamos del blueprint.
// No importamos governance para evitar ciclos; solo deserializamos lo mínimo.
type orgIdentity struct {
	OrgID string `json:"org_id"`
}

// blueprintMinimal es la forma mínima del blueprint, solo lo que falta para
// extraer el OrgID sin traer el paquete governance.
type blueprintMinimal struct {
	OrgIdentity orgIdentity `json:"org_identity"`
}

// GetOrgID lee nucleus-governance.json directamente y retorna el OrgID.
// Vive aquí (y no en core ni governance) para no formar ciclos.
// La ruta es la misma que usa governance.GetBlueprintPath():
//
//	~/.bloom/.nucleus/nucleus-governance.json
func GetOrgID() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}

	path := filepath.Join(homeDir, ".bloom", ".nucleus", "nucleus-governance.json")

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return "", errors.New("organization not initialized")
		}
		return "", err
	}

	var bp blueprintMinimal
	if err := json.Unmarshal(data, &bp); err != nil {
		return "", err
	}

	if bp.OrgIdentity.OrgID == "" {
		return "", errors.New("organization not initialized: org_id empty")
	}

	return bp.OrgIdentity.OrgID, nil
}