package governance

import (
	"encoding/json"
	"fmt"
	"nucleus/internal/core"
	"os"
	"path/filepath"
	"time"

	"github.com/spf13/cobra"
)

// ============================================
// BUSINESS LOGIC (Ownership & Roles)
// ============================================

// OwnershipRecord representa el registro de propiedad
type OwnershipRecord struct {
	OrgID       string    `json:"org_id"`
	OwnerID     string    `json:"owner_id"`
	OwnerName   string    `json:"owner_name"`
	CreatedAt   time.Time `json:"created_at"`
	SignedHash  string    `json:"signed_hash"`
	TeamMembers []Member  `json:"team_members"`
}

// Member representa un miembro del equipo
type Member struct {
	ID      string    `json:"id"`
	Name    string    `json:"name"`
	Role    string    `json:"role"`
	AddedAt time.Time `json:"added_at"`
	Active  bool      `json:"active"`
}

// GetOwnershipPath retorna la ruta del archivo de propiedad
func GetOwnershipPath() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}

	nucleusRoot := filepath.Join(homeDir, ".bloom", ".nucleus")
	return filepath.Join(nucleusRoot, "ownership.json"), nil
}

// LoadOwnership carga el registro de propiedad
func LoadOwnership() (*OwnershipRecord, error) {
	path, err := GetOwnershipPath()
	if err != nil {
		return nil, err
	}

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil // No existe aún
		}
		return nil, err
	}

	var record OwnershipRecord
	if err := json.Unmarshal(data, &record); err != nil {
		return nil, err
	}

	return &record, nil
}

// SaveOwnership guarda el registro de propiedad con escritura atómica
func SaveOwnership(record *OwnershipRecord) error {
	path, err := GetOwnershipPath()
	if err != nil {
		return err
	}

	data, err := json.MarshalIndent(record, "", "  ")
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

// CreateInitialOwnership crea el registro inicial de propiedad
func CreateInitialOwnership(ownerID, ownerName string) (*OwnershipRecord, error) {
	record := &OwnershipRecord{
		OrgID:       generateOrgID(),
		OwnerID:     ownerID,
		OwnerName:   ownerName,
		CreatedAt:   time.Now(),
		SignedHash:  "", // Se generará después
		TeamMembers: []Member{},
	}

	if err := SaveOwnership(record); err != nil {
		return nil, err
	}

	return record, nil
}

// AddTeamMember agrega un miembro al equipo
func AddTeamMember(record *OwnershipRecord, memberID, memberName, role string) error {
	member := Member{
		ID:      memberID,
		Name:    memberName,
		Role:    role,
		AddedAt: time.Now(),
		Active:  true,
	}

	record.TeamMembers = append(record.TeamMembers, member)
	return SaveOwnership(record)
}

// generateOrgID genera un ID único para la organización
func generateOrgID() string {
	return fmt.Sprintf("org_%d", time.Now().Unix())
}

// GetEffectiveRole determina el rol efectivo cruzando marcador local con blueprint
func GetEffectiveRole() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}

	nucleusRoot := filepath.Join(homeDir, ".bloom", ".nucleus")

	// Verificar marcador .master
	masterFile := filepath.Join(nucleusRoot, ".master")
	if _, err := os.Stat(masterFile); err == nil {
		// Verificar que coincida con owner_github_id del blueprint
		bp, err := LoadBlueprint()
		if err != nil {
			return "master", nil // Si no hay blueprint, confiar en marcador
		}
		if bp != nil {
			return "master", nil
		}
	}

	// Verificar marcador .specialist
	specialistFile := filepath.Join(nucleusRoot, ".specialist")
	if _, err := os.Stat(specialistFile); err == nil {
		return "specialist", nil
	}

	return "unknown", nil
}

// ============================================
// CLI COMMAND (Auto-registration via init())
// ============================================

func init() {
	core.RegisterCommand("GOVERNANCE", func(c *core.Core) *cobra.Command {
		var masterFlag bool
		var githubID string
		var name string

		cmd := &cobra.Command{
			Use:   "init",
			Short: "Initialize Nucleus organization",
			Args:  cobra.NoArgs,
			Run: func(cmd *cobra.Command, args []string) {
				existing, _ := LoadOwnership()
				if existing != nil {
					fmt.Println("Organization already initialized")
					os.Exit(1)
				}

				if githubID == "" {
					fmt.Println("Error: --github-id required")
					os.Exit(1)
				}

				if name == "" {
					name = githubID
				}

				// Crear ownership record
				record, err := CreateInitialOwnership(githubID, name)
				if err != nil {
					fmt.Printf("Error: %v\n", err)
					os.Exit(1)
				}

				// Crear nucleus-governance.json
				_, err = CreateInitialBlueprint(githubID, name)
				if err != nil {
					fmt.Printf("Error creating blueprint: %v\n", err)
					os.Exit(1)
				}

				if masterFlag {
					if err := core.SetMasterRole(); err != nil {
						fmt.Printf("Error setting role: %v\n", err)
						os.Exit(1)
					}
				}

				if c.IsJSON {
					fmt.Printf("{\"org_id\":\"%s\",\"owner_id\":\"%s\",\"status\":\"initialized\"}\n",
						record.OrgID, record.OwnerID)
				} else {
					fmt.Printf("✅ Organization initialized\n")
					fmt.Printf("Org ID: %s\n", record.OrgID)
					fmt.Printf("Owner: %s\n", record.OwnerName)
					fmt.Printf("Blueprint: created\n")
				}
			},
		}

		cmd.Flags().BoolVar(&masterFlag, "master", false, "Initialize as master")
		cmd.Flags().StringVar(&githubID, "github-id", "", "GitHub username")
		cmd.Flags().StringVar(&name, "name", "", "Display name")

		return cmd
	})

	// ============================================
	// TEAM COMMANDS
	// ============================================

	// Command: add
	core.RegisterCommand("TEAM", func(c *core.Core) *cobra.Command {
		var name string
		var role string

		cmd := &cobra.Command{
			Use:   "add <github-id>",
			Short: "Add team member",
			Args:  cobra.ExactArgs(1),
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

				githubID := args[0]
				if name == "" {
					name = githubID
				}
				if role == "" {
					role = "specialist"
				}

				err = AddTeamMember(record, githubID, name, role)
				if err != nil {
					fmt.Printf("Error: %v\n", err)
					os.Exit(1)
				}

				if c.IsJSON {
					fmt.Printf("{\"member_id\":\"%s\",\"role\":\"%s\",\"status\":\"added\"}\n", githubID, role)
				} else {
					fmt.Printf("✅ Member added: %s (%s)\n", name, role)
				}
			},
		}

		cmd.Flags().StringVar(&name, "name", "", "Display name")
		cmd.Flags().StringVar(&role, "role", "specialist", "Role")

		return cmd
	})

	// Command: list
	core.RegisterCommand("TEAM", func(c *core.Core) *cobra.Command {
		cmd := &cobra.Command{
			Use:   "list",
			Short: "List team members",
			Args:  cobra.NoArgs,
			Run: func(cmd *cobra.Command, args []string) {
				record, err := LoadOwnership()
				if err != nil || record == nil {
					fmt.Println("Error: organization not initialized")
					os.Exit(1)
				}

				if c.IsJSON {
					data, _ := json.MarshalIndent(record.TeamMembers, "", "  ")
					fmt.Println(string(data))
				} else {
					fmt.Printf("Owner: %s (%s)\n\n", record.OwnerName, record.OwnerID)
					if len(record.TeamMembers) == 0 {
						fmt.Println("No team members")
					} else {
						fmt.Println("Team Members:")
						for _, m := range record.TeamMembers {
							status := "active"
							if !m.Active {
								status = "inactive"
							}
							fmt.Printf("  %s (%s) - %s [%s]\n", m.Name, m.ID, m.Role, status)
						}
					}
				}
			},
		}

		return cmd
	})

	// Command: remove
	core.RegisterCommand("TEAM", func(c *core.Core) *cobra.Command {
		cmd := &cobra.Command{
			Use:   "remove <github-id>",
			Short: "Remove team member",
			Args:  cobra.ExactArgs(1),
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

				githubID := args[0]
				found := false

				for i := range record.TeamMembers {
					if record.TeamMembers[i].ID == githubID {
						record.TeamMembers[i].Active = false
						found = true
						break
					}
				}

				if !found {
					fmt.Printf("Error: member not found: %s\n", githubID)
					os.Exit(1)
				}

				err = SaveOwnership(record)
				if err != nil {
					fmt.Printf("Error: %v\n", err)
					os.Exit(1)
				}

				if c.IsJSON {
					fmt.Printf("{\"member_id\":\"%s\",\"status\":\"removed\"}\n", githubID)
				} else {
					fmt.Printf("✅ Member removed: %s\n", githubID)
				}
			},
		}

		return cmd
	})
}