package governance

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// OwnershipRecord representa el registro de propiedad
type OwnershipRecord struct {
	OrgID        string    `json:"org_id"`
	OwnerID      string    `json:"owner_id"`
	OwnerName    string    `json:"owner_name"`
	CreatedAt    time.Time `json:"created_at"`
	SignedHash   string    `json:"signed_hash"`
	TeamMembers  []Member  `json:"team_members"`
}

// Member representa un miembro del equipo
type Member struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Role      string    `json:"role"`
	AddedAt   time.Time `json:"added_at"`
	Active    bool      `json:"active"`
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