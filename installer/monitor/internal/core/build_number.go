package core

import "strconv"

// buildNumber, BuildDate y BuildTime se inyectan en link time via:
//
//	-ldflags "-X monitor/internal/core.buildNumber=N -X monitor/internal/core.BuildDate=... -X monitor/internal/core.BuildTime=..."
//
// desde build-component.bat (Windows) y build-component.sh (macOS/Linux).
// buildNumber, BuildDate y BuildTime ya están declarados en core.go — este
// archivo solo agrega el accessor numérico, mismo patrón que sentinel/metamorph.

// BuildNumber devuelve el build number numérico, o 0 si no fue inyectado
// o no se pudo parsear.
func BuildNumber() int {
	n, err := strconv.Atoi(buildNumber)
	if err != nil {
		return 0
	}
	return n
}
