// internal/buildinfo/buildinfo.go

package buildinfo

// Estas variables se inyectan en build time via -ldflags:
//
//	go build -ldflags "-X bloom-sensor/internal/buildinfo.Version=1.0.0
//	                   -X bloom-sensor/internal/buildinfo.Commit=abc1234
//	                   -X bloom-sensor/internal/buildinfo.BuildNumber=42
//	                   -X bloom-sensor/internal/buildinfo.Channel=stable"

var (
	Version     = "dev"
	Commit      = "unknown"
	BuildNumber = "0"
	Channel     = "stable"
	BinaryName  = "bloom-sensor"
)
