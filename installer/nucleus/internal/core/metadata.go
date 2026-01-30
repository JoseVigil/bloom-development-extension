package core

import (
	"os"
	"runtime"
	"time"
)

// SystemInfo contiene información completa del sistema
type SystemInfo struct {
	AppName        string `json:"app_name"`
	AppRelease     string `json:"app_release"`
	BuildCounter   int    `json:"build_counter"`
	CompileDate    string `json:"compile_date"`
	CompileTime    string `json:"compile_time"`
	CurrentTime    string `json:"current_time"`
	PlatformArch   string `json:"platform_arch"`
	PlatformOS     string `json:"platform_os"`
	RuntimeEngine  string `json:"runtime_engine"`
	RuntimeRelease string `json:"runtime_release"`
	UserRole       string `json:"user_role"`
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

	return SystemInfo{
		AppName:        "nucleus",
		AppRelease:     version,
		BuildCounter:   BuildNumber,
		CompileDate:    BuildDate,
		CompileTime:    BuildTime,
		CurrentTime:    time.Now().Format("2006-01-02 15:04:05"),
		PlatformArch:   runtime.GOARCH,
		PlatformOS:     runtime.GOOS,
		RuntimeEngine:  "go",
		RuntimeRelease: runtime.Version(),
		UserRole:       roleToString(role),
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
