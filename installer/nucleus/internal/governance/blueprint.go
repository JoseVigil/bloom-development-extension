package governance

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// Blueprint representa el ADN de la Organización
type Blueprint struct {
	OrgIdentity      OrgIdentity      `json:"org_identity"`
	GovernanceModel  GovernanceModel  `json:"governance_model"`
	VaultSnapshot    VaultSnapshot    `json:"vault_snapshot"`
	Manifest         Manifest         `json:"manifest"`
}

type OrgIdentity struct {
	OrgID         string    `json:"org_id"`
	Name          string    `json:"name"`
	OwnerGithubID string    `json:"owner_github_id"`
	CreatedAt     time.Time `json:"created_at"`
}

type GovernanceModel struct {
	EnforceStateSigning  bool   `json:"enforce_state_signing"`
	RequireMasterForKeys bool   `json:"require_master_for_keys"`
	MinRoleForCorMerge   string `json:"min_role_for_cor_merge"`
}

type VaultSnapshot struct {
	MasterProfileLinked bool      `json:"master_profile_linked"`
	ActiveServices      []string  `json:"active_services"`
	LastVaultAccess     time.Time `json:"last_vault_access"`
}

type Manifest struct {
	Projects              []string `json:"projects"`
	TotalIntentsProcessed int      `json:"total_intents_processed"`
	SystemVersion         string   `json:"system_version"`
}

// GetBlueprintPath retorna la ruta del blueprint.json
func GetBlueprintPath() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	nucleusRoot := filepath.Join(homeDir, ".bloom", ".nucleus")
	return filepath.Join(nucleusRoot, "blueprint.json"), nil
}

// LoadBlueprint carga el blueprint.json
func LoadBlueprint() (*Blueprint, error) {
	path, err := GetBlueprintPath()
	if err != nil {
		return nil, err
	}

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}

	var bp Blueprint
	if err := json.Unmarshal(data, &bp); err != nil {
		return nil, err
	}

	return &bp, nil
}

// SaveBlueprint guarda el blueprint.json con escritura atómica
func SaveBlueprint(bp *Blueprint) error {
	path, err := GetBlueprintPath()
	if err != nil {
		return err
	}

	data, err := json.MarshalIndent(bp, "", "  ")
	if err != nil {
		return err
	}

	// Escritura atómica usando archivo temporal
	tmpPath := path + ".tmp"
	
	if err := os.WriteFile(tmpPath, data, 0644); err != nil {
		return err
	}

	// Renombrado atómico
	if err := os.Rename(tmpPath, path); err != nil {
		os.Remove(tmpPath)
		return err
	}

	return nil
}

// CreateInitialBlueprint crea el blueprint inicial
func CreateInitialBlueprint(githubID, orgName string) (*Blueprint, error) {
	bp := &Blueprint{
		OrgIdentity: OrgIdentity{
			OrgID:         fmt.Sprintf("org_%d", time.Now().Unix()),
			Name:          orgName,
			OwnerGithubID: githubID,
			CreatedAt:     time.Now(),
		},
		GovernanceModel: GovernanceModel{
			EnforceStateSigning:  true,
			RequireMasterForKeys: true,
			MinRoleForCorMerge:   "Architect",
		},
		VaultSnapshot: VaultSnapshot{
			MasterProfileLinked: false,
			ActiveServices:      []string{},
			LastVaultAccess:     time.Time{},
		},
		Manifest: Manifest{
			Projects:              []string{},
			TotalIntentsProcessed: 0,
			SystemVersion:         "1.0.0",
		},
	}

	if err := SaveBlueprint(bp); err != nil {
		return nil, err
	}

	return bp, nil
}

// UpdateVaultSnapshot actualiza el snapshot del vault
func UpdateVaultSnapshot(bp *Blueprint, services []string) error {
	bp.VaultSnapshot.ActiveServices = services
	bp.VaultSnapshot.LastVaultAccess = time.Now()
	return SaveBlueprint(bp)
}

// IncrementIntents incrementa el contador de intents procesados
func IncrementIntents(bp *Blueprint) error {
	bp.Manifest.TotalIntentsProcessed++
	return SaveBlueprint(bp)
}