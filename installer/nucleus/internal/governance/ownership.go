package governance

import (
	"encoding/json"
	"errors"
	"fmt"
	"nucleus/internal/core"
	"os"
	"path/filepath"
	"time"

	"github.com/gofrs/flock"
	"github.com/spf13/cobra"
	ownershipcontract "nucleus/internal/governance/ownershipcontract"
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
	// FIX (auditoría multi-org): antes hardcodeaba ~/.bloom/.nucleus/ sin
	// sufijo de org. Ver core/org_context.go.
	nucleusRoot, err := core.ResolveNucleusRoot("")
	if err != nil {
		return "", err
	}
	return filepath.Join(nucleusRoot, ".ownership.json"), nil
}

// LoadOwnership carga el registro de propiedad
func LoadOwnership() (*OwnershipRecord, error) {
	path, err := GetOwnershipPath()
	if err != nil {
		return nil, err
	}

	canonical, err := LoadCanonicalOwnership(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil // No existe aún
		}
		return nil, err
	}
	if canonical.LegacyAuthority == nil {
		return nil, errors.New("ownership has no productive legacy authority in current mode")
	}
	orgID := ""
	if canonical.Organization.LegacyOrgID != nil {
		orgID = *canonical.Organization.LegacyOrgID
	} else if canonical.Organization.CanonicalID != nil {
		orgID = *canonical.Organization.CanonicalID
	}
	owner := canonical.LegacyAuthority.Owner
	name := ""
	if owner.DisplayName != nil {
		name = *owner.DisplayName
	}
	return &OwnershipRecord{OrgID: orgID, OwnerID: owner.Subject, OwnerName: name, CreatedAt: canonical.CreatedAt, TeamMembers: fromContractMembers(canonical.LegacyAuthority.TeamMembers)}, nil
}

// SaveOwnership guarda el registro de propiedad con escritura atómica
func SaveOwnership(record *OwnershipRecord) error {
	path, err := GetOwnershipPath()
	if err != nil {
		return err
	}

	canonical, err := LoadCanonicalOwnership(path)
	if err != nil {
		if !os.IsNotExist(err) {
			return err
		}
		legacyID := record.OrgID
		display := record.OwnerName
		now := record.CreatedAt.UTC()
		if now.IsZero() {
			now = time.Now().UTC()
		}
		canonical = &CanonicalOwnership{Schema: OwnershipSchema, SchemaVersion: OwnershipSchemaVersion, AuthorityMode: AuthorityLocalLegacy, Organization: OwnershipOrganization{LegacyOrgID: &legacyID}, Installation: OwnershipInstallation{InstallationID: randomID()}, Binding: OwnershipBinding{State: BindingUnbound}, LegacyAuthority: &LegacyAuthority{Owner: LegacyOwner{Source: "github_handle", Subject: record.OwnerID, DisplayName: &display}, TeamMembers: toContractMembers(record.TeamMembers), EffectiveMarkers: []string{}}, CreatedAt: now, UpdatedAt: now}
		return persistCanonicalOwnership(path, canonical)
	}
	if canonical.LegacyAuthority == nil || canonical.AuthorityMode == AuthorityRemoteEnforced {
		return errors.New("legacy ownership mutation forbidden in current authority mode")
	}
	canonical.LegacyAuthority.TeamMembers = toContractMembers(record.TeamMembers)
	canonical.LegacyAuthority.Owner.Subject = record.OwnerID
	canonical.LegacyAuthority.Owner.DisplayName = &record.OwnerName
	canonical.UpdatedAt = time.Now().UTC()
	return persistCanonicalOwnership(path, canonical)
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

	path, err := GetOwnershipPath()
	if err != nil {
		return nil, err
	}
	legacyID := record.OrgID
	display := record.OwnerName
	now := record.CreatedAt.UTC()
	canonical := &CanonicalOwnership{Schema: OwnershipSchema, SchemaVersion: OwnershipSchemaVersion, AuthorityMode: AuthorityLocalLegacy, Organization: OwnershipOrganization{LegacyOrgID: &legacyID}, Installation: OwnershipInstallation{InstallationID: randomID()}, Binding: OwnershipBinding{State: BindingUnbound}, LegacyAuthority: &LegacyAuthority{Owner: LegacyOwner{Source: "github_handle", Subject: record.OwnerID, DisplayName: &display}, TeamMembers: []ownershipcontract.LegacyMember{}, EffectiveMarkers: []string{}}, CreatedAt: now, UpdatedAt: now}
	if err := ValidateCanonicalOwnership(canonical); err != nil {
		return nil, err
	}
	if err := persistCanonicalOwnership(path, canonical); err != nil {
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
	// FIX (auditoría multi-org): mismo hardcodeo que GetOwnershipPath() —
	// los marcadores .master/.specialist vivían buscados en una carpeta sin
	// org, distinta de la que create.go realmente genera.
	nucleusRoot, err := core.ResolveNucleusRoot("")
	if err != nil {
		return "", err
	}
	canonical, err := LoadCanonicalOwnership(filepath.Join(nucleusRoot, ".ownership.json"))
	if err != nil {
		return "unknown", err
	}
	if canonical.AuthorityMode == AuthorityRemoteEnforced {
		return "unknown", nil
	}
	observed, err := observedEffectiveMarkers(nucleusRoot)
	if err != nil {
		return "unknown", err
	}
	declared := map[string]bool{}
	if canonical.LegacyAuthority != nil {
		for _, marker := range canonical.LegacyAuthority.EffectiveMarkers {
			declared[marker] = true
		}
	}
	for _, marker := range []string{"master", "specialist"} {
		if declared[marker] && containsString(observed, marker) {
			return marker, nil
		}
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
			Annotations: map[string]string{
				"category":      "GOVERNANCE",
				"json_response": `{"org_id":"org_123","owner_id":"owner","status":"initialized"}`,
			},
			Run: func(cmd *cobra.Command, args []string) {
				if githubID == "" {
					fmt.Println("Error: --github-id required")
					os.Exit(1)
				}

				if name == "" {
					name = githubID
				}

				record, err := initializeOrganization(githubID, name, masterFlag)
				if err != nil {
					fmt.Printf("Error: %v\n", err)
					return
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

func initializeOrganization(githubID, name string, master bool) (*OwnershipRecord, error) {
	record, err := LoadOwnership()
	if err != nil {
		return nil, fmt.Errorf("load ownership: %w", err)
	}
	bp, err := LoadBlueprint()
	if err != nil {
		return nil, fmt.Errorf("load blueprint: %w", err)
	}

	if record != nil {
		if !master {
			return nil, errors.New("Organization already initialized")
		}
		if bp == nil || bp.OrgIdentity.OrgID != record.OrgID {
			return nil, errors.New("ownership and blueprint are missing or have divergent org_id")
		}
	} else {
		if bp != nil {
			return nil, errors.New("blueprint exists without ownership")
		}
		record, err = CreateInitialOwnership(githubID, name)
		if err != nil {
			return nil, err
		}
		bp, err = CreateInitialBlueprint(record.OrgID, githubID, name)
		if err != nil {
			return nil, fmt.Errorf("create blueprint: %w", err)
		}
	}

	if master {
		if err := activateMasterMarkerAndOwnership(); err != nil {
			return nil, fmt.Errorf("activate master marker: %w", err)
		}
		if err := bootstrapGravity(record.OrgID); err != nil {
			return nil, fmt.Errorf("bootstrap Gravity: %w", err)
		}
	}
	return record, nil
}

func activateMasterMarkerAndOwnership() error {
	path, err := GetOwnershipPath()
	if err != nil {
		return err
	}
	lock := flock.New(path + ownershipTransitionLockSuffix)
	if err := lock.Lock(); err != nil {
		return err
	}
	defer func() { _ = lock.Unlock() }()
	raw, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	analysis, err := ownershipcontract.Analyze(raw)
	if err != nil || analysis.Canonical == nil {
		return errors.New("master activation requires canonical ownership")
	}
	document := analysis.Canonical
	if document.AuthorityMode == AuthorityRemoteEnforced || document.LegacyAuthority == nil {
		return ownershipcontract.ErrLegacyAuthorityForbidden
	}
	if err := createOrValidateMasterMarkerLocked(filepath.Dir(path)); err != nil {
		return err
	}
	markers, err := observedEffectiveMarkers(filepath.Dir(path))
	if err != nil {
		return err
	}
	document.LegacyAuthority.EffectiveMarkers = markers
	document.UpdatedAt = time.Now().UTC()
	return persistCanonicalOwnershipLocked(path, document)
}

// createOrValidateMasterMarkerLocked requires the ownership transition lock.
// It never acquires that lock, preventing recursive-lock deadlocks.
func createOrValidateMasterMarkerLocked(nucleusRoot string) error {
	path := filepath.Join(nucleusRoot, ".master")
	if info, err := os.Lstat(path); err == nil {
		if !info.Mode().IsRegular() {
			return errors.New(".master is not a regular file")
		}
		content, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		if string(content) != "master" {
			return errors.New(".master contains incompatible state")
		}
		return nil
	} else if !os.IsNotExist(err) {
		return err
	}
	if err := atomicReplace(path, []byte("master"), 0644, "before_master_rename"); err != nil {
		return err
	}
	info, err := os.Lstat(path)
	if err != nil || !info.Mode().IsRegular() {
		return errors.New(".master rename succeeded but verification failed")
	}
	content, err := os.ReadFile(path)
	if err != nil || string(content) != "master" {
		return errors.New(".master rename succeeded but content verification failed")
	}
	return nil
}

func toContractMembers(members []Member) []ownershipcontract.LegacyMember {
	out := make([]ownershipcontract.LegacyMember, len(members))
	for i, member := range members {
		out[i] = ownershipcontract.LegacyMember{ID: member.ID, Name: member.Name, Role: member.Role, AddedAt: member.AddedAt, Active: member.Active}
	}
	return out
}
func fromContractMembers(members []ownershipcontract.LegacyMember) []Member {
	out := make([]Member, len(members))
	for i, member := range members {
		out[i] = Member{ID: member.ID, Name: member.Name, Role: member.Role, AddedAt: member.AddedAt, Active: member.Active}
	}
	return out
}
func containsString(values []string, wanted string) bool {
	for _, value := range values {
		if value == wanted {
			return true
		}
	}
	return false
}
