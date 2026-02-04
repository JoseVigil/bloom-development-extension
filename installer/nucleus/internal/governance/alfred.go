package governance

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"nucleus/internal/core"
	"github.com/spf13/cobra"
)

// Alfred - El Custodio Administrativo de Nucleus
type Alfred struct {
	constitutionPath string
	rulesPath        string
	sovereignPath    string
	goldenKey        string
	extensionID      string

	constitution string
	rulesHash    string
	isLocked     bool

	auditLog *AuditLogger
	server   *AlfredServer

	mu sync.RWMutex
}

// GovernanceConfig estructura del nucleus-governance.json
type GovernanceConfig struct {
	Version      string `json:"version"`
	Provisioning struct {
		GoldenKey   string `json:"golden_key"`
		ExtensionID string `json:"extension_id"`
	} `json:"provisioning"`
}

// NewAlfred inicializa Alfred
func NewAlfred() (*Alfred, error) {
	// 1. Verificar BLOOM_NUCLEUS_ROOT
	nucleusRoot := os.Getenv("BLOOM_NUCLEUS_ROOT")
	if nucleusRoot == "" {
		// Fallback a simulation_env si no está configurado
		nucleusRoot = "scripts/simulation_env/.bloom/.nucleus-bloom-labs"
	}

	// 2. Verificar que exista el directorio
	if _, err := os.Stat(nucleusRoot); os.IsNotExist(err) {
		return nil, fmt.Errorf("CRITICAL: Constitution files missing. Run simulation script first")
	}

	// 3. Cargar nucleus-governance.json
	govConfig, err := loadGovernanceConfig()
	if err != nil {
		return nil, fmt.Errorf("failed to load governance config: %w", err)
	}

	alfred := &Alfred{
		constitutionPath: filepath.Join(nucleusRoot, ".core"),
		rulesPath:        filepath.Join(nucleusRoot, ".core", ".rules.bl"),
		sovereignPath:    filepath.Join(nucleusRoot, ".core", ".ai_bot.sovereign.bl"),
		goldenKey:        govConfig.Provisioning.GoldenKey,
		extensionID:      govConfig.Provisioning.ExtensionID,
		isLocked:         true, // Vault inicia bloqueado
	}

	// 4. Cargar constitución
	if err := alfred.LoadConstitution(); err != nil {
		return nil, err
	}

	// 5. Inicializar Audit Logger
	alfred.auditLog = NewAuditLogger("workers/nucleus/audit.log")

	// 6. Calcular hash inicial de rules
	alfred.rulesHash, _ = alfred.calculateRulesHash()

	return alfred, nil
}

// LoadConstitution carga y concatena todos los archivos .bl
func (a *Alfred) LoadConstitution() error {
	var constitution strings.Builder

	// Cargar .rules.bl
	rulesContent, err := os.ReadFile(a.rulesPath)
	if err != nil {
		return fmt.Errorf("CRITICAL: Cannot load .rules.bl: %w", err)
	}
	constitution.WriteString("=== BLOOM SECURITY RULES ===\n")
	constitution.Write(rulesContent)
	constitution.WriteString("\n\n")

	// Cargar .ai_bot.sovereign.bl
	sovereignContent, err := os.ReadFile(a.sovereignPath)
	if err != nil {
		return fmt.Errorf("CRITICAL: Cannot load .ai_bot.sovereign.bl: %w", err)
	}
	constitution.WriteString("=== AI BOT SOVEREIGN CONTRACT ===\n")
	constitution.Write(sovereignContent)
	constitution.WriteString("\n\n")

	// Cargar archivos de governance
	govPaths := []string{
		".governance/architecture/.principles.bl",
		".governance/quality/.code-standards.bl",
		".governance/security/.security-standards.bl",
	}

	for _, relPath := range govPaths {
		fullPath := filepath.Join(a.constitutionPath, "..", relPath)
		if content, err := os.ReadFile(fullPath); err == nil {
			constitution.WriteString(fmt.Sprintf("=== %s ===\n", relPath))
			constitution.Write(content)
			constitution.WriteString("\n\n")
		}
	}

	a.mu.Lock()
	a.constitution = constitution.String()
	a.mu.Unlock()

	return nil
}

// calculateRulesHash calcula SHA-256 del archivo .rules.bl
func (a *Alfred) calculateRulesHash() (string, error) {
	content, err := os.ReadFile(a.rulesPath)
	if err != nil {
		return "", err
	}

	hash := sha256.Sum256(content)
	return hex.EncodeToString(hash[:]), nil
}

// GetStatus retorna el estado actual del Vault
func (a *Alfred) GetStatus() VaultStatus {
	a.mu.RLock()
	defer a.mu.RUnlock()

	return VaultStatus{
		Locked:      a.isLocked,
		GoldenKey:   a.goldenKey[:20] + "...", // Mostrar solo primeros 20 chars
		ExtensionID: a.extensionID,
		RulesHash:   a.rulesHash,
		Timestamp:   time.Now().Unix(),
	}
}

// VerifyIntent verifica un intent contra la constitución
func (a *Alfred) VerifyIntent(intent Intent) VerifyResult {
	a.mu.RLock()
	constitution := a.constitution
	a.mu.RUnlock()

	// Inicializar Ollama client
	ollama := NewOllamaClient("")

	// Analizar con LLM
	decision, err := ollama.AnalyzeIntent(intent, constitution)
	if err != nil {
		return VerifyResult{
			Approved:  false,
			Reason:    fmt.Sprintf("Audit engine failure: %v", err),
			Timestamp: time.Now().Unix(),
			RulesHash: a.rulesHash,
		}
	}

	approved := decision.Verdict == "APPROVED"
	reason := decision.Reasoning
	if !approved {
		reason = fmt.Sprintf("%s (Rule: %s)", reason, decision.RuleViolated)
	}

	// Verificación adicional manual para reglas críticas
	if intent.Action == "modify_constitution" && intent.RequesterRole != "master" {
		approved = false
		reason = "Constitution changes require Master role"
	}

	// Log del veredicto
	verdict := "APPROVED"
	if !approved {
		verdict = "DENIED"
	}

	a.auditLog.Log(AuditEvent{
		Timestamp: time.Now(),
		EventType: "INTENT_VERIFICATION",
		Actor:     intent.Requester,
		Action:    intent.Action,
		Result:    verdict,
		Details:   reason,
	})

	return VerifyResult{
		Approved:  approved,
		Reason:    reason,
		Timestamp: time.Now().Unix(),
		RulesHash: a.rulesHash,
	}
}

// CheckIntegrity verifica la integridad de los archivos
func (a *Alfred) CheckIntegrity() IntegrityReport {
	currentHash, err := a.calculateRulesHash()
	if err != nil {
		return IntegrityReport{
			Valid:     false,
			Message:   fmt.Sprintf("Failed to calculate hash: %v", err),
			Timestamp: time.Now().Unix(),
		}
	}

	a.mu.RLock()
	originalHash := a.rulesHash
	a.mu.RUnlock()

	if currentHash != originalHash {
		// SECURITY BREACH DETECTADO
		a.auditLog.Log(AuditEvent{
			Timestamp: time.Now(),
			EventType: "SECURITY_BREACH",
			Actor:     "SYSTEM",
			Action:    "INTEGRITY_CHECK",
			Result:    "FAILED",
			Details:   fmt.Sprintf("Rules hash changed: %s -> %s", originalHash[:16], currentHash[:16]),
		})

		// Bloquear el sistema
		a.mu.Lock()
		a.isLocked = true
		a.mu.Unlock()

		return IntegrityReport{
			Valid:        false,
			Message:      "SECURITY BREACH: Rules file modified without authorization",
			OriginalHash: originalHash,
			CurrentHash:  currentHash,
			Timestamp:    time.Now().Unix(),
		}
	}

	return IntegrityReport{
		Valid:        true,
		Message:      "Integrity check passed",
		OriginalHash: originalHash,
		CurrentHash:  currentHash,
		Timestamp:    time.Now().Unix(),
	}
}

// StartServer inicia el servidor de autoridad
func (a *Alfred) StartServer() error {
	a.server = NewAlfredServer(a)
	
	// Administrative Hello
	a.SendAdministrativeHello()
	
	return a.server.Start()
}

// SendAdministrativeHello envía mensaje de inicio
func (a *Alfred) SendAdministrativeHello() {
	a.auditLog.Log(AuditEvent{
		Timestamp: time.Now(),
		EventType: "ALFRED_STARTUP",
		Actor:     "ALFRED",
		Action:    "INITIALIZATION",
		Result:    "SUCCESS",
		Details:   fmt.Sprintf("Constitution loaded: %d bytes, Rules hash: %s", len(a.constitution), a.rulesHash[:16]),
	})

	fmt.Printf("\n=== ALFRED: Administrative Custodian Online ===\n")
	fmt.Printf("Constitution loaded: %d bytes\n", len(a.constitution))
	fmt.Printf("Rules hash: %s\n", a.rulesHash[:16])
	fmt.Printf("Golden key: %s...\n", a.goldenKey[:20])
	fmt.Printf("Extension ID: %s\n", a.extensionID)
	fmt.Printf("Vault status: LOCKED\n")
	fmt.Printf("REST API: http://localhost:48216\n")
	fmt.Printf("WebSocket: ws://localhost:48217\n")
	fmt.Printf("==============================================\n\n")
}

// loadGovernanceConfig carga nucleus-governance.json
func loadGovernanceConfig() (*GovernanceConfig, error) {
	configPath := "nucleus-governance.json"
	
	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil, err
	}

	var config GovernanceConfig
	if err := json.Unmarshal(data, &config); err != nil {
		return nil, err
	}

	return &config, nil
}

// Estructuras de datos

type VaultStatus struct {
	Locked      bool   `json:"locked"`
	GoldenKey   string `json:"golden_key"`
	ExtensionID string `json:"extension_id"`
	RulesHash   string `json:"rules_hash"`
	Timestamp   int64  `json:"timestamp"`
}

type Intent struct {
	Requester     string `json:"requester"`
	RequesterRole string `json:"requester_role"`
	Action        string `json:"action"`
	Target        string `json:"target"`
	Payload       string `json:"payload"`
}

type VerifyResult struct {
	Approved  bool   `json:"approved"`
	Reason    string `json:"reason"`
	Timestamp int64  `json:"timestamp"`
	RulesHash string `json:"rules_hash"`
}

type IntegrityReport struct {
	Valid        bool   `json:"valid"`
	Message      string `json:"message"`
	OriginalHash string `json:"original_hash,omitempty"`
	CurrentHash  string `json:"current_hash,omitempty"`
	Timestamp    int64  `json:"timestamp"`
}

// ────────────────────────────────────────────────
// CLI: nucleus alfred status
// ────────────────────────────────────────────────

func init() {
	core.RegisterCommand("GOVERNANCE", alfredStatusCmd)
}

func alfredStatusCmd(c *core.Core) *cobra.Command {
	var jsonOutput bool

	cmd := &cobra.Command{
		Use:   "alfred status",
		Short: "Muestra el reporte de salud administrativa y estado de la Bóveda",
		Run: func(cmd *cobra.Command, args []string) {
			alfred, err := NewAlfred()
			if err != nil {
				fmt.Fprintf(os.Stderr, "Error inicializando Alfred: %v\n", err)
				os.Exit(1)
			}

			status := alfred.GetStatus()

			if jsonOutput {
				data, _ := json.MarshalIndent(status, "", "  ")
				fmt.Println(string(data))
				return
			}

			// Salida humana legible
			fmt.Println("Estado de Alfred (Custodio Administrativo)")
			fmt.Println("──────────────────────────────────────────")
			fmt.Printf("  Bóveda:          %s\n", tern(status.Locked, "LOCKED", "UNLOCKED"))
			fmt.Printf("  Rules hash:      %s\n", status.RulesHash)
			fmt.Printf("  Golden key:      %s...\n", status.GoldenKey)
			fmt.Printf("  Extension ID:    %s\n", status.ExtensionID)
			fmt.Printf("  Última verificación: %s\n", time.Unix(status.Timestamp, 0).Format(time.RFC3339))
			fmt.Println()
		},
	}

	cmd.Flags().BoolVar(&jsonOutput, "json", false, "Salida en formato JSON (para Conductor u otras herramientas)")

	return cmd
}

// Helper pequeño
func tern(cond bool, vtrue, vfalse string) string {
	if cond {
		return vtrue
	}
	return vfalse
}
