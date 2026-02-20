// internal/info/info.go

package info

import (
	"fmt"
	"os"
	"runtime"

	"bloom-launcher/internal/buildinfo"
	"bloom-launcher/internal/pipe"
	"bloom-launcher/internal/startup"
)

// InfoData es la estructura que se serializa en modo --json.
type InfoData struct {
	Name        string            `json:"name"`
	Version     string            `json:"version"`
	BuildNumber string            `json:"build_number"`
	BuildDate   string            `json:"build_date"`
	FullVersion string            `json:"full_version"`
	Channel     string            `json:"channel"`
	Daemon      DaemonStatus      `json:"daemon"`
	Startup     StartupStatus     `json:"startup"`
	Runtime     map[string]string `json:"runtime"`
	Pipe        PipeInfo          `json:"pipe"`
}

type DaemonStatus struct {
	Running bool `json:"running"`
}

type StartupStatus struct {
	Registered bool `json:"registered"`
}

type PipeInfo struct {
	Name string `json:"name"`
}

// PrintInfo imprime la información del sistema en texto plano o JSON.
func PrintInfo(jsonMode bool) {
	exePath, _ := os.Executable()

	data := InfoData{
		Name:        buildinfo.AppName,
		Version:     buildinfo.Version,
		BuildNumber: buildinfo.BuildNumber,
		BuildDate:   buildinfo.BuildDate,
		FullVersion: fmt.Sprintf("v%s-build.%s", buildinfo.Version, buildinfo.BuildNumber),
		Channel:     buildinfo.Channel,
		Daemon: DaemonStatus{
			Running: pipe.IsRunning(),
		},
		Startup: StartupStatus{
			Registered: startup.IsRegistered(),
		},
		Runtime: map[string]string{
			"os":       runtime.GOOS,
			"arch":     runtime.GOARCH,
			"exe":      exePath,
			"go":       runtime.Version(),
		},
		Pipe: PipeInfo{
			Name: buildinfo.PipeName,
		},
	}

	if jsonMode {
		printJSON(data)
	} else {
		printInfoText(data)
	}
}

func printInfoText(d InfoData) {
	fmt.Println("Bloom Launcher — System Information")
	fmt.Println("=====================================")
	fmt.Printf("Version:    %s\n", d.FullVersion)
	fmt.Printf("Build:      %s\n", d.BuildNumber)
	fmt.Printf("Date:       %s\n", d.BuildDate)
	fmt.Printf("Channel:    %s\n", d.Channel)
	fmt.Println()
	fmt.Println("Daemon:")
	if d.Daemon.Running {
		fmt.Println("  Status:   RUNNING")
	} else {
		fmt.Println("  Status:   STOPPED")
	}
	fmt.Printf("  Pipe:     %s\n", d.Pipe.Name)
	fmt.Println()
	fmt.Println("Startup:")
	if d.Startup.Registered {
		fmt.Println("  HKCU\\Run: registered")
	} else {
		fmt.Println("  HKCU\\Run: not registered")
	}
	fmt.Println()
	fmt.Println("Runtime:")
	fmt.Printf("  OS:       %s\n", d.Runtime["os"])
	fmt.Printf("  Arch:     %s\n", d.Runtime["arch"])
	fmt.Printf("  Go:       %s\n", d.Runtime["go"])
	fmt.Printf("  Exe:      %s\n", d.Runtime["exe"])
}