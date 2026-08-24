package core

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"time"
)

// SystemInfo contiene información completa del sistema
type SystemInfo struct {
	AppName             string `json:"app_name"`
	AppRelease          string `json:"app_release"`
	BuildCounter        int    `json:"build_counter"`
	CompileDate         string `json:"compile_date"`
	CompileTime         string `json:"compile_time"`
	CurrentTime         string `json:"current_time"`
	PlatformArch        string `json:"platform_arch"`
	PlatformOS          string `json:"platform_os"`
	RuntimeEngine       string `json:"runtime_engine"`
	RuntimeRelease      string `json:"runtime_release"`
	UserRole            string `json:"user_role"`
	ActiveCollaborators int    `json:"active_collaborators"`
	StateHash           string `json:"state_hash"`
}

// Role representa el nivel de autoridad en Nucleus
type Role int

const (
	RoleUnknown    Role = iota
	RoleMaster          // Owner - Control total
	RoleSpecialist      // Team member - Ejecución limitada
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
		BuildCounter:        BuildNumber(),
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
//
// FIX (auditoría multi-org, continuación — 2026-08-09): este archivo quedó
// fuera de la migración documentada en org_context.go (que sí cubrió
// vault.go, blueprint.go, ownership.go y alfred.go, todos en el paquete
// governance). metadata.go tiene su propia copia paralela de la misma
// lógica de detección de rol, en el paquete core, y seguía hardcodeando
// homeDir + "/.bloom/.nucleus/" sin sufijo de org — la misma clase de bug
// que ResolveNucleusRoot() ya resuelve. Confirmado en producción: en un
// workspace real (.bloom/.nucleus-{org}/ dentro del proyecto, no en
// ~/.bloom/.nucleus/), SetMasterRole() fallaba con "no such file or
// directory" porque esa carpeta vieja nunca se crea para instalaciones
// multi-org.
func detectUserRole() Role {
	nucleusRoot, err := ResolveNucleusRoot("")
	if err != nil {
		return RoleUnknown
	}

	// Verificar si existe el marcador de Master
	masterFile := filepath.Join(nucleusRoot, ".master")
	if _, err := os.Stat(masterFile); err == nil {
		return RoleMaster
	}

	// Verificar si existe el marcador de Specialist
	specialistFile := filepath.Join(nucleusRoot, ".specialist")
	if _, err := os.Stat(specialistFile); err == nil {
		return RoleSpecialist
	}

	// Fail closed: la ausencia de un marcador de rol no demuestra autoridad.
	return RoleUnknown
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
//
// FIX (mismo bug que detectUserRole — ver comentario arriba): antes escribía
// siempre en ~/.bloom/.nucleus/.master, path que no existe en instalaciones
// multi-org (el árbol real vive en <workspace>/.bloom/.nucleus-{org}/).
// Causaba exit 1 en "nucleus init --master" con
// "Error setting role: open .../.bloom/.nucleus/.master: no such file or directory"
// — el registro de ownership ya se había creado correctamente antes de este
// paso, así que el comando fallaba tarde, dejando ownership_init_status en
// "failed" pese a que .../ownership.json sí existía.
func SetMasterRole() error {
	nucleusRoot, err := ResolveNucleusRoot("")
	if err != nil {
		return err
	}

	masterFile := filepath.Join(nucleusRoot, ".master")
	return os.WriteFile(masterFile, []byte("master"), 0644)
}

// SetSpecialistRole marca al usuario como Specialist
//
// FIX: mismo hardcodeo que SetMasterRole — no confirmado como causa de
// ningún incidente todavía (no se auditó ningún log donde se dispare), pero
// es el mismo bug y hubiera fallado igual apenas se usara.
func SetSpecialistRole() error {
	nucleusRoot, err := ResolveNucleusRoot("")
	if err != nil {
		return err
	}

	specialistFile := filepath.Join(nucleusRoot, ".specialist")
	return os.WriteFile(specialistFile, []byte("specialist"), 0644)
}

// countActiveCollaborators cuenta los colaboradores activos en el ownership
//
// FIX: mismo hardcodeo — leía ownership.json de ~/.bloom/.nucleus/, nunca
// del workspace real. Sin esta corrección, GetSystemInfo() siempre reporta
// 0 colaboradores fuera del path viejo, aunque team_members[] tenga datos
// reales en el ownership.json del workspace activo.
//
// FIX (auditoría dot-naming): faltaba el punto inicial — ver
// governance.GetOwnershipPath(), la fuente de verdad real del nombre.
func countActiveCollaborators() int {
	nucleusRoot, err := ResolveNucleusRoot("")
	if err != nil {
		return 0
	}
	ownershipPath := filepath.Join(nucleusRoot, ".ownership.json")

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
//
// FIX: mismo hardcodeo — hasheaba ownership.json/nucleus-governance.json de
// ~/.bloom/.nucleus/, que en instalaciones multi-org no existe. Sin esta
// corrección, GetSystemInfo() siempre reporta StateHash "no-state" fuera
// del path viejo, sin reflejar el estado real del workspace activo.
//
// FIX (auditoría dot-naming): a ambos nombres les faltaba el punto inicial —
// ver governance.GetOwnershipPath() y governance.GetBlueprintPath().
func computeStateHash() string {
	nucleusRoot, err := ResolveNucleusRoot("")
	if err != nil {
		return "no-state"
	}

	// Hash combinado de ownership + blueprint
	ownershipData, _ := os.ReadFile(filepath.Join(nucleusRoot, ".ownership.json"))
	blueprintData, _ := os.ReadFile(filepath.Join(nucleusRoot, ".nucleus-governance.json"))

	combined := string(ownershipData) + string(blueprintData)
	if combined == "" {
		return "no-state"
	}

	hash := sha256.Sum256([]byte(combined))
	return hex.EncodeToString(hash[:8])
}
