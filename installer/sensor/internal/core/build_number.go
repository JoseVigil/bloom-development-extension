package core

import "strconv"

// buildNumber, BuildDate y BuildTime se inyectan en link time via:
//
//	-ldflags "-X bloom-sensor/internal/core.buildNumber=N -X bloom-sensor/internal/core.BuildDate=... -X bloom-sensor/internal/core.BuildTime=..."
//
// desde build-component.bat (Windows) y build-component.sh (macOS/Linux).
// Si no se inyectan (build local sin script), quedan vacíos y BuildNumber() devuelve 0.
var (
	buildNumber string
	BuildDate   string
	BuildTime   string
)

// BuildNumber devuelve el build number numérico, o 0 si no fue inyectado.
func BuildNumber() int {
	n, err := strconv.Atoi(buildNumber)
	if err != nil {
		return 0
	}
	return n
}
