package inspection

import (
	"runtime"

	"github.com/bloom/metamorph/internal/core"
)

// managedBinaryDef describes a managed binary in a platform-agnostic way.
type managedBinaryDef struct {
	Name    string
	SubDir  string // relative to basePath/bin/
	BinName string // without extension — use core.ExeName() to get the real name
}

// managedBinaryDefs returns the list of managed binaries for the current
// platform. Some components (e.g. cortex .crx, host Mach-O) have different
// file extensions or layouts depending on the OS.
func managedBinaryDefs() []managedBinaryDef {
	// cortex: on all platforms it's a .crx Chrome extension package
	cortexBin := "bloom-cortex.crx" // not an executable — no ExeName() needed

	// host: C++ bridge — no .exe on macOS/Linux
	hostBin := core.ExeName("bloom-host")

	// conductor: Electron app
	conductorBin := core.ExeName("bloom-conductor")

	defs := []managedBinaryDef{
		{Name: "Brain", SubDir: "brain", BinName: core.ExeName("brain")},
		{Name: "Nucleus", SubDir: "nucleus", BinName: core.ExeName("nucleus")},
		{Name: "Sentinel", SubDir: "sentinel", BinName: core.ExeName("sentinel")},
		{Name: "Host", SubDir: "native", BinName: hostBin},
		{Name: "Conductor", SubDir: "conductor", BinName: conductorBin},
		{Name: "Cortex", SubDir: "cortex", BinName: cortexBin},
		{Name: "Metamorph", SubDir: "metamorph", BinName: core.ExeName("metamorph")},
	}

	// On macOS, Conductor ships as a .app bundle. Adjust the path so inspect
	// can find it. The .app is a directory, so inspection will stat the bundle
	// root rather than an inner executable.
	if runtime.GOOS == "darwin" {
		for i, d := range defs {
			if d.Name == "Conductor" {
				defs[i].BinName = "Bloom Conductor.app"
			}
		}
	}

	return defs
}

// externalBinaryDefs returns the external (non-managed) binaries for the
// current platform.
func externalBinaryDefs() []struct {
	Name, SubDir, BinName, Source, UpdateMethod string
} {
	switch runtime.GOOS {
	case "darwin":
		return []struct {
			Name, SubDir, BinName, Source, UpdateMethod string
		}{
			{"Temporal", "temporal", "temporal", "temporal.io", "nucleus_download"},
			{"Ollama", "ollama", "ollama", "ollama.ai", "external_installer"},
			// Chromium on macOS lives inside a .app bundle
			{"Chromium", "chrome-mac", "Chromium.app", "chromium.org", "nucleus_download"},
			{"Node", "node", "node", "nodejs.org", "nucleus_download"},
		}
	case "linux":
		return []struct {
			Name, SubDir, BinName, Source, UpdateMethod string
		}{
			{"Temporal", "temporal", "temporal", "temporal.io", "nucleus_download"},
			{"Ollama", "ollama", "ollama", "ollama.ai", "external_installer"},
			{"Chromium", "chrome-linux", "chrome", "chromium.org", "nucleus_download"},
			{"Node", "node", "node", "nodejs.org", "nucleus_download"},
		}
	default: // windows
		return []struct {
			Name, SubDir, BinName, Source, UpdateMethod string
		}{
			{"Temporal", "temporal", "temporal.exe", "temporal.io", "nucleus_download"},
			{"Ollama", "ollama", "ollama.exe", "ollama.ai", "external_installer"},
			{"Chromium", "chrome-win", "chrome.exe", "chromium.org", "nucleus_download"},
			{"Node", "node", "node.exe", "nodejs.org", "nucleus_download"},
		}
	}
}
