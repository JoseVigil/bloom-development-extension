package core

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// VersionInfo contiene información de versión del ejecutable
type VersionInfo struct {
	Version     string `json:"version"`
	BuildNumber int    `json:"build"`
	FullRelease string `json:"full_release"`
}

// SystemInfo contiene metadatos técnicos completos del sistema
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
}

// GetVersionInfo retorna información de versión consolidada
func GetVersionInfo() VersionInfo {
	version := ReadVersionFromFile()
	buildNum := BuildNumber
	
	info := VersionInfo{
		Version:     version,
		BuildNumber: buildNum,
		FullRelease: getAppName() + " release " + version + " build " + intToString(buildNum),
	}
	
	return info
}

// GetSystemInfo retorna metadatos técnicos completos
func GetSystemInfo() SystemInfo {
	version := ReadVersionFromFile()
	now := time.Now()
	
	info := SystemInfo{
		AppName:        getAppName(),
		AppRelease:     version,
		BuildCounter:   BuildNumber,
		CompileDate:    BuildDate,
		CompileTime:    BuildTime,
		CurrentTime:    now.Format("2006-01-02 15:04:05"),
		PlatformArch:   runtime.GOARCH,
		PlatformOS:     runtime.GOOS,
		RuntimeEngine:  "Go",
		RuntimeRelease: runtime.Version(),
	}
	
	return info
}

// getAppName extrae el nombre del ejecutable sin extensión
func getAppName() string {
	base := filepath.Base(os.Args[0])
	// Quitar extensión (.exe en Windows)
	name := strings.TrimSuffix(base, filepath.Ext(base))
	return name
}

// intToString convierte int a string (helper simple)
func intToString(n int) string {
	if n == 0 {
		return "0"
	}
	
	negative := n < 0
	if negative {
		n = -n
	}
	
	var digits []byte
	for n > 0 {
		digits = append([]byte{byte('0' + n%10)}, digits...)
		n /= 10
	}
	
	if negative {
		digits = append([]byte{'-'}, digits...)
	}
	
	return string(digits)
}