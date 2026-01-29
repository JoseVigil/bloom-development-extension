package core

import (
	"os"
	"path/filepath"
	"strings"
)

// VERSION es la versión semántica de Sentinel (fallback si no existe VERSION file)
const VERSION = "2.1.0"

// ReadVersionFromFile intenta leer la versión desde el archivo VERSION
// Si falla, retorna la constante VERSION como fallback
func ReadVersionFromFile() string {
	// Obtener el directorio del ejecutable
	exePath, err := os.Executable()
	if err != nil {
		return VERSION
	}
	
	// Buscar VERSION en el directorio del ejecutable
	versionPath := filepath.Join(filepath.Dir(exePath), "VERSION")
	
	// Intentar leer el archivo
	content, err := os.ReadFile(versionPath)
	if err != nil {
		// Si no existe, usar constante
		return VERSION
	}
	
	// Limpiar el contenido (quitar espacios y saltos de línea)
	version := strings.TrimSpace(string(content))
	if version == "" {
		return VERSION
	}
	
	return version
}