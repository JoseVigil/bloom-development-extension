// internal/info/version.go

package info

import (
	"encoding/json"
	"fmt"
	"os"

	"bloom-launcher/internal/buildinfo"
)

// VersionData es la estructura que se serializa en modo --json.
type VersionData struct {
	Name        string `json:"name"`
	Version     string `json:"version"`
	BuildNumber string `json:"build_number"`
	BuildDate   string `json:"build_date"`
	BuildTime   string `json:"build_time"`
	FullVersion string `json:"full_version"`
	Channel     string `json:"channel"`
}

// PrintVersion imprime la versión en texto plano o JSON según el flag.
func PrintVersion(jsonMode bool) {
	data := VersionData{
		Name:        buildinfo.AppName,
		Version:     buildinfo.Version,
		BuildNumber: buildinfo.BuildNumber,
		BuildDate:   buildinfo.BuildDate,
		BuildTime:   buildinfo.BuildTime,
		FullVersion: fmt.Sprintf("v%s-build.%s", buildinfo.Version, buildinfo.BuildNumber),
		Channel:     buildinfo.Channel,
	}

	if jsonMode {
		printJSON(data)
	} else {
		printVersionText(data)
	}
}

func printVersionText(d VersionData) {
	fmt.Printf("%s %s\n", d.Name, d.FullVersion)
	fmt.Printf("Build:   %s\n", d.BuildNumber)
	fmt.Printf("Date:    %s\n", d.BuildDate)
	fmt.Printf("Time:    %s\n", d.BuildTime)
	fmt.Printf("Channel: %s\n", d.Channel)
}

func printJSON(v interface{}) {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	enc.Encode(v) //nolint:errcheck
}