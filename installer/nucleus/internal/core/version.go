package core

import (
	"os"
	"path/filepath"
	"strings"
)

// VersionInfo contiene información de versión
type VersionInfo struct {
	Version     string `json:"version"`
	BuildNumber int    `json:"build_number"`
	BuildDate   string `json:"build_date"`
	BuildTime   string `json:"build_time"`
}

// GetVersionInfo obtiene la información de versión
func GetVersionInfo() VersionInfo {
	version := readVersionFile()
	
	return VersionInfo{
		Version:     version,
		BuildNumber: BuildNumber(),
		BuildDate:   BuildDate,
		BuildTime:   BuildTime,
	}
}

// readVersionFile lee el archivo VERSION
func readVersionFile() string {
	exePath, err := os.Executable()
	if err != nil {
		return "unknown"
	}

	exeDir := filepath.Dir(exePath)
	versionPath := filepath.Join(exeDir, "..", "VERSION")

	data, err := os.ReadFile(versionPath)
	if err != nil {
		return "1.0.0"
	}

	return strings.TrimSpace(string(data))
}