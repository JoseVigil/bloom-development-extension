package inspection

import (
	"context"
	"os/exec"
	"regexp"
	"runtime"
	"strings"
	"time"
)

// versionCmd describes how to invoke an external binary to retrieve its version.
type versionCmd struct {
	Args   []string // arguments to pass (e.g. ["--version"])
	Regex  *regexp.Regexp
}

// externalVersionCmds maps binary names to how their version should be
// extracted. The regex must capture the bare version string in group 1.
var externalVersionCmds = map[string]versionCmd{
	"Temporal": {
		Args:  []string{"--version"},
		Regex: regexp.MustCompile(`(?i)temporal(?:\s+version)?\s+v?(\d+\.\d+[\.\d]*)`),
	},
	"Ollama": {
		Args:  []string{"--version"},
		Regex: regexp.MustCompile(`(?i)ollama(?:\s+version\s+is)?\s+v?(\d+\.\d+[\.\d]*)`),
	},
	"Chromium": {
		Args:  chromeVersionArgs(),
		Regex: regexp.MustCompile(`(?i)(?:google\s+chrome|chromium)\s+(\d+\.\d+[\.\d]*)`),
	},
	"Node": {
		Args:  []string{"--version"},
		Regex: regexp.MustCompile(`v(\d+\.\d+[\.\d]*)`),
	},
}

// chromeVersionArgs returns the correct flag to get the Chrome/Chromium
// version string on each platform.
func chromeVersionArgs() []string {
	if runtime.GOOS == "darwin" {
		// On macOS, --version works on the inner executable inside the .app.
		// The caller must resolve the real binary path (see external.go).
		return []string{"--version"}
	}
	return []string{"--version"}
}

// runWithVersion executes binaryPath with the given args and returns stdout+stderr
// combined, trimmed. The execution is bounded to 5 seconds.
func runWithVersion(binaryPath string, args []string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, binaryPath, args...)
	out, err := cmd.CombinedOutput()
	return strings.TrimSpace(string(out)), err
}

// extractVersion applies the binary-specific regex to raw output and returns
// the version string, or "unknown" if nothing matches.
func extractVersion(name, output string) string {
	vc, ok := externalVersionCmds[name]
	if !ok || vc.Regex == nil {
		// Generic fallback: grab first thing that looks like a semver.
		generic := regexp.MustCompile(`v?(\d+\.\d+[\.\d]*)`)
		if m := generic.FindStringSubmatch(output); len(m) > 1 {
			return m[1]
		}
		return "unknown"
	}
	if m := vc.Regex.FindStringSubmatch(output); len(m) > 1 {
		return m[1]
	}
	return "unknown"
}

// chromiumBinaryPath resolves the actual executable inside the Chromium .app
// bundle on macOS, or returns binaryPath unchanged on other platforms.
//
// macOS bundle layout:
//
//	<ionsites_base>/chrome-mac/Chromium.app/Contents/MacOS/Chromium
func chromiumBinaryPath(appOrExe string) string {
	if runtime.GOOS == "darwin" && strings.HasSuffix(appOrExe, ".app") {
		// Navigate into the .app bundle to find the real Mach-O.
		return appOrExe + "/Contents/MacOS/Chromium"
	}
	return appOrExe
}
