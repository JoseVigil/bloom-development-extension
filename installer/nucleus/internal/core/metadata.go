package core

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"runtime"
	"time"
)

// SystemInfo contiene información completa del sistema
type SystemInfo struct {
	AppName           string `json:"app_name"`
	AppRelease        string `json:"app_release"`
	BuildCounter      int    `json:"build_counter"`
	CompileDate       string `json:"compile_date"`
	CompileTime       string `json:"compile_time"`
	CurrentTime       string `json:"current_time"`
	PlatformArch      string `json:"platform_arch"`
	PlatformOS        string `json:"platform_os"`
	RuntimeEngine     string `json:"runtime_engine"`
	RuntimeRelease    string `json:"runtime_release"`
	UserRole          string `json:"user_role"`
	ActiveCollaborators int  `json:"active_collaborators"`
	StateHash         string `json:"state_hash"`
}

// Role representa el nivel de autoridad en Nucleus
type Role int

const (
	RoleUnknown Role = iota
	RoleMaster       // Owner - Control total
	RoleSpecialist   // Team member - Ejecución limitada
)

// GetSystemInfo recopila información completa del sistema
func GetSystemInfo() SystemInfo {
	version := readVersionFile()
	role := detectUserRole()
	collaborators := countActiveCollaborators()
	stateHash := computeStateHash()

	return SystemInfo{
		AppName:             "nucleus",
		AppRelease:          version,
		BuildCounter:        BuildNumber,
		CompileDate:         BuildDate,
		CompileTime:         BuildTime,
		CurrentTime:         time.Now().Format("2006-01-02 15:04:05"),
		PlatformArch:        runtime.GOARCH,
		PlatformOS:          runtime.GOOS,
		RuntimeEngine:       "go",
		RuntimeRelease:      runtime.Version(),
		UserRole:            roleToString(role),
		ActiveCollaborators: collaborators,
		StateHash:           stateHash,
	}
}

// detectUserRole determina el rol del usuario actual
// En esta implementación base, detecta si es el propietario del directorio .bloom
func detectUserRole() Role {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return RoleUnknown
	}

	// Verificar si existe el marcador de Master
	masterFile := homeDir + "/.bloom/.nucleus/.master"
	if _, err := os.Stat(masterFile); err == nil {
		return RoleMaster
	}

	// Verificar si existe el marcador de Specialist
	specialistFile := homeDir + "/.bloom/.nucleus/.specialist"
	if _, err := os.Stat(specialistFile); err == nil {
		return RoleSpecialist
	}

	// Por defecto, el primer usuario que inicializa es Master
	return RoleMaster
}

// roleToString convierte Role a string
func roleToString(role Role) string {
	switch role {
	case RoleMaster:
		return "master"
	case RoleSpecialist:
		return "specialist"
	default:
		return "unknown"
	}
}

// GetUserRole obtiene el rol del usuario actual
func GetUserRole() Role {
	return detectUserRole()
}

// SetMasterRole marca al usuario como Master (Owner)
func SetMasterRole() error {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return err
	}

	masterFile := homeDir + "/.bloom/.nucleus/.master"
	return os.WriteFile(masterFile, []byte("master"), 0644)
}

// SetSpecialistRole marca al usuario como Specialist
func SetSpecialistRole() error {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return err
	}

	specialistFile := homeDir + "/.bloom/.nucleus/.specialist"
	return os.WriteFile(specialistFile, []byte("specialist"), 0644)
}

// countActiveCollaborators cuenta los colaboradores activos en el ownership
func countActiveCollaborators() int {
	homeDir, _ := os.UserHomeDir()
	ownershipPath := homeDir + "/.bloom/.nucleus/ownership.json"
	
	data, err := os.ReadFile(ownershipPath)
	if err != nil {
		return 0
	}

	var record struct {
		TeamMembers []struct {
			Active bool `json:"active"`
		} `json:"team_members"`
	}

	if err := json.Unmarshal(data, &record); err != nil {
		return 0
	}

	count := 0
	for _, member := range record.TeamMembers {
		if member.Active {
			count++
		}
	}

	return count
}

// computeStateHash genera un hash semántico del estado actual
func computeStateHash() string {
	homeDir, _ := os.UserHomeDir()
	nucleusRoot := homeDir + "/.bloom/.nucleus"
	
	// Hash combinado de ownership + blueprint
	ownershipData, _ := os.ReadFile(nucleusRoot + "/ownership.json")
	blueprintData, _ := os.ReadFile(nucleusRoot + "/nucleus-governance.json")
	
	combined := string(ownershipData) + string(blueprintData)
	if combined == "" {
		return "no-state"
	}
	
	hash := sha256.Sum256([]byte(combined))
	return hex.EncodeToString(hash[:8])
}