package governance

import (
	"encoding/json"
	"fmt"
	"nucleus/internal/client"
	"nucleus/internal/core"
	"os"
	"path/filepath"
	"time"

	"github.com/spf13/cobra"
)

// Blueprint representa el ADN de la Organización
type Blueprint struct {
	OrgIdentity     OrgIdentity     `json:"org_identity"`
	GovernanceModel GovernanceModel `json:"governance_model"`
	VaultSnapshot   VaultSnapshot   `json:"vault_snapshot"`
	Manifest        Manifest        `json:"manifest"`
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

// GetBlueprintPath retorna la ruta del nucleus-governance.json
func GetBlueprintPath() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	nucleusRoot := filepath.Join(homeDir, ".bloom", ".nucleus")
	return filepath.Join(nucleusRoot, "nucleus-governance.json"), nil
}

// LoadBlueprint carga el nucleus-governance.json
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

// SaveBlueprint guarda el nucleus-governance.json con escritura atómica
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

// ============================================
// CLI COMMANDS - SYNC (Auto-registration via init())
// ============================================

func init() {
	// Command: sync-pull
	core.RegisterCommand("SYNC", func(c *core.Core) *cobra.Command {
		cmd := &cobra.Command{
			Use:   "sync-pull",
			Short: "Pull permissions from central server",
			Args:  cobra.NoArgs,
			Run: func(cmd *cobra.Command, args []string) {
				record, err := LoadOwnership()
				if err != nil || record == nil {
					fmt.Println("Error: organization not initialized")
					os.Exit(1)
				}

				// cl instead of client para no colisionar con el paquete
				cl := client.NewClient(record.OrgID, "demo-key")

				permissions, err := cl.PullPermissions()
				if err != nil {
					fmt.Printf("Error: %v\n", err)
					os.Exit(1)
				}

				if c.IsJSON {
					data, _ := json.MarshalIndent(permissions, "", "  ")
					fmt.Println(string(data))
				} else {
					fmt.Println("✅ Permissions pulled from central server")
					for k, v := range permissions {
						fmt.Printf("  %s: %v\n", k, v)
					}
				}
			},
		}

		return cmd
	})

	// Command: sync-push
	core.RegisterCommand("SYNC", func(c *core.Core) *cobra.Command {
		cmd := &cobra.Command{
			Use:   "sync-push",
			Short: "Push state to central server",
			Args:  cobra.NoArgs,
			Run: func(cmd *cobra.Command, args []string) {
				if core.GetUserRole() != core.RoleMaster {
					fmt.Println("Error: requires master role")
					os.Exit(1)
				}

				record, err := LoadOwnership()
				if err != nil || record == nil {
					fmt.Println("Error: organization not initialized")
					os.Exit(1)
				}

				cl := client.NewClient(record.OrgID, "demo-key")

				state := map[string]interface{}{
					"org_id":       record.OrgID,
					"owner_id":     record.OwnerID,
					"team_count":   len(record.TeamMembers),
					"system_info":  core.GetSystemInfo(),
					"version_info": core.GetVersionInfo(),
				}

				err = cl.PushState(state)
				if err != nil {
					fmt.Printf("Error: %v\n", err)
					os.Exit(1)
				}

				if c.IsJSON {
					fmt.Println("{\"status\":\"pushed\"}")
				} else {
					fmt.Println("✅ State pushed to central server")
				}
			},
		}

		return cmd
	})
}