// internal/buildinfo/buildinfo.go
//
// Los valores BuildNumber, BuildDate y BuildTime son sobreescritos en cada
// compilación por el script build.bat mediante -ldflags.
// El resto son constantes fijas del proyecto.

package buildinfo

const (
	AppName  = "bloom-launcher"
	Version  = "1.0.0"
	Channel  = "stable"
	PipeName = `\\.\pipe\bloom-launcher`

	// Sobreescritos por build.bat via -ldflags "-X buildinfo.BuildNumber=N ..."
	BuildNumber = "0"
	BuildDate   = "dev"
	BuildTime   = "dev"
)