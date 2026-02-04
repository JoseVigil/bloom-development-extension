// internal/governance/ollama_client.go
package governance

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// OllamaClient cliente para Ollama
type OllamaClient struct {
	baseURL string
	client  *http.Client
}

// OllamaRequest estructura de solicitud
type OllamaRequest struct {
	Model  string `json:"model"`
	Prompt string `json:"prompt"`
	Stream bool   `json:"stream"`
}

// OllamaResponse estructura de respuesta
type OllamaResponse struct {
	Model     string    `json:"model"`
	CreatedAt time.Time `json:"created_at"`
	Response  string    `json:"response"`
	Done      bool      `json:"done"`
}

// AuditDecision decisión del motor de auditoría
type AuditDecision struct {
	Verdict      string `json:"verdict"` // APPROVED | DENIED
	Confidence   string `json:"confidence"`
	Reasoning    string `json:"reasoning"`
	RuleViolated string `json:"rule_violated,omitempty"`
}

// NewOllamaClient crea un nuevo cliente
func NewOllamaClient(baseURL string) *OllamaClient {
	if baseURL == "" {
		baseURL = "http://localhost:11434"
	}

	return &OllamaClient{
		baseURL: baseURL,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// AnalyzeIntent analiza un intent contra la constitución
func (c *OllamaClient) AnalyzeIntent(intent Intent, constitution string) (*AuditDecision, error) {
	// Construir prompt para Ollama
	prompt := c.buildAuditPrompt(intent, constitution)

	// Hacer request a Ollama
	req := OllamaRequest{
		Model:  "llama2", // Usar modelo disponible
		Prompt: prompt,
		Stream: false,
	}

	reqBody, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	resp, err := c.client.Post(
		c.baseURL+"/api/generate",
		"application/json",
		bytes.NewBuffer(reqBody),
	)
	if err != nil {
		return nil, fmt.Errorf("ollama request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("ollama error (%d): %s", resp.StatusCode, string(body))
	}

	var ollamaResp OllamaResponse
	if err := json.NewDecoder(resp.Body).Decode(&ollamaResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	// Parsear la decisión del LLM
	decision := c.parseDecision(ollamaResp.Response)
	return decision, nil
}

// buildAuditPrompt construye el prompt para el LLM
func (c *OllamaClient) buildAuditPrompt(intent Intent, constitution string) string {
	return fmt.Sprintf(`You are Alfred, the Administrative Custodian of the Bloom organization.

CONSTITUTION:
%s

INTENT TO VERIFY:
- Requester: %s
- Role: %s
- Action: %s
- Target: %s
- Payload: %s

INSTRUCTIONS:
Analyze this intent against the constitution above. Your verdict must be binary: APPROVED or DENIED.

Respond ONLY in the following JSON format:
{
  "verdict": "APPROVED" or "DENIED",
  "confidence": "HIGH" or "MEDIUM" or "LOW",
  "reasoning": "Brief explanation of your decision",
  "rule_violated": "Rule ID if denied, empty if approved"
}

Your response:`,
		constitution,
		intent.Requester,
		intent.RequesterRole,
		intent.Action,
		intent.Target,
		intent.Payload,
	)
}

// parseDecision parsea la respuesta del LLM
func (c *OllamaClient) parseDecision(response string) *AuditDecision {
	// Intentar parsear como JSON
	var decision AuditDecision
	err := json.Unmarshal([]byte(response), &decision)
	if err == nil {
		return &decision
	}

	// Si falla, usar heurística simple
	verdict := "DENIED" // Default a deny por seguridad
	if contains(response, "APPROVED") || contains(response, "approved") {
		verdict = "APPROVED"
	}

	return &AuditDecision{
		Verdict:    verdict,
		Confidence: "LOW",
		Reasoning:  "Failed to parse LLM response properly",
	}
}

// CheckHealth verifica si Ollama está disponible
func (c *OllamaClient) CheckHealth() error {
	resp, err := c.client.Get(c.baseURL + "/api/tags")
	if err != nil {
		return fmt.Errorf("ollama not reachable: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("ollama returned status %d", resp.StatusCode)
	}

	return nil
}

// Helper function
func contains(s, substr string) bool {
	return len(s) >= len(substr) && 
		(s == substr || len(s) > len(substr) && (s[:len(substr)] == substr || s[len(s)-len(substr):] == substr || 
		findInString(s, substr)))
}

func findInString(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}