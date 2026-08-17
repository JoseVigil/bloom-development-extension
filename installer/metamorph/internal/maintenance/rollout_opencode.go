package maintenance

// ─────────────────────────────────────────────────────────────────────────────
// OpenCode component — registers `opencode` into Metamorph's rollout pipeline.
//
// Deliberately kept in its own file and wired in via init() rather than
// editing allComponents directly in rollout.go, so this can be dropped in or
// reverted as a single unit.
//
// Mirrors the JS installer's installer.js / pre-install-cleanup.js /
// service-installer-opencode*.js, adapted to the component shape rollout.go
// already uses for brain/nucleus/bootstrap:
//
//   - Source/Dest resolution reuses nativeBin()/exe() as-is — no new path
//     convention needed. nativeBin(r, "opencode") already resolves to
//     installer/native/bin/{platform}/opencode/, matching the table in the
//     REQ doc, and it copies the whole directory (via copyDir, same as
//     "sensor"), so extra assets dropped in later need no code change.
//   - PreDeployFn: elevate (no-op on darwin/linux), kill any running
//     `opencode serve` process, remove any existing service registration —
//     so the binary isn't locked and re-deploys don't leave duplicates.
//   - PostDeployFn: chmod 0755 on unix, (re)install the service pointing at
//     the freshly-copied binary, start it, then poll the port. The port
//     check is logged as a warning on failure, never returned as an error —
//     matching brain/bootstrap's existing "don't fail the whole rollout"
//     convention for non-critical health checks.
//
// No milestone/certification hook: rollout.go has no such concept today
// (that's an Electron-installer/nucleus.json idea, not something this Go
// command tracks). If/when Metamorph gains one, opencode should report into
// it the same way every other component would.
// ─────────────────────────────────────────────────────────────────────────────

import (
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"metamorph/internal/core"
)

func init() {
	allComponents = append(allComponents, component{
		Key:          "opencode",
		SourceFn:     opencodeSourcePath,
		DestFn:       func(b string) string { return filepath.Join(b, "bin", "opencode") },
		PreDeployFn:  opencodePreDeploy,
		PostDeployFn: opencodePostDeploy,
		// No Platforms restriction: opencode is supported on all three,
		// same as bootstrap.
	})
}

// opencodeSourcePath resolves the binary directly, matching the
// "generic component" convention already used by ollama/temporal/node
// (own top-level installer/<name>/ folder, per-platform subdir, points at
// the file itself) rather than the brain/sentinel/nucleus convention
// (installer/native/bin/{platform}/{comp}/, points at a directory).
// Confirmed against the real repo layout:
//
//	installer/opencode/linux_x64/opencode
//
// nativePlatformDir() already returns the right subdir name for all 5
// combos (win64, darwin_arm64, darwin_x64, linux_x64, linux_arm64) — reused
// as-is, only the base path differs from nativeBin().
func opencodeSourcePath(r string) string {
	return filepath.Join(r, "installer", "opencode", nativePlatformDir(), exe("opencode"))
}

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const opencodeDefaultPort = "4096"

// opencodePort mirrors nucleusServiceName()'s override convention.
func opencodePort() string {
	if v := strings.TrimSpace(os.Getenv("BLOOM_OPENCODE_PORT")); v != "" {
		return v
	}
	return opencodeDefaultPort
}

// opencodeServiceName returns the platform-specific service identifier.
// Windows: NSSM service name. macOS: launchd label. Linux: systemd --user
// unit name. Override with BLOOM_OPENCODE_SERVICE_NAME if these ever
// diverge from what the JS installer used.
func opencodeServiceName() string {
	if v := strings.TrimSpace(os.Getenv("BLOOM_OPENCODE_SERVICE_NAME")); v != "" {
		return v
	}
	switch runtime.GOOS {
	case "windows":
		return "BloomOpencodeService"
	case "darwin":
		return "com.bloom.opencode"
	default: // linux
		return "com.bloom.opencode.service"
	}
}

// opencodeExePath returns the deployed binary's path given dst (the
// component's DestFn result, {baseDir}/bin/opencode).
func opencodeExePath(dst string) string {
	return filepath.Join(dst, exe("opencode"))
}

// opencodeBasePath recovers {baseDir} from dst the same way brainPidFile
// recovers basePath from the brain component's dst: dst is always
// {baseDir}/bin/opencode (see DestFn above), so walking up two levels
// works without threading an extra parameter through the fixed
// PreDeployFn/PostDeployFn signature. If DestFn's shape ever changes, this
// needs to change with it.
func opencodeBasePath(dst string) string {
	return filepath.Dir(filepath.Dir(dst))
}

func opencodeLogDir(dst string) string {
	return filepath.Join(opencodeBasePath(dst), "logs", "opencode", "service")
}

func opencodeServiceLogPath(dst string) string {
	return filepath.Join(opencodeLogDir(dst), "opencode_service.log")
}

// nssmExePath returns the nssm.exe deployed by the existing "nssm"
// component (installer/native/bin/win64/nssm/nssm.exe → {baseDir}/bin/nssm/nssm.exe).
// Reused as-is — no second copy of nssm for opencode.
func nssmExePath(dst string) string {
	return filepath.Join(opencodeBasePath(dst), "bin", "nssm", exe("nssm"))
}

// ─────────────────────────────────────────────────────────────────────────────
// PreDeployFn — cleanup before the binary is overwritten
// ─────────────────────────────────────────────────────────────────────────────

func opencodePreDeploy(c *core.Core, repoRoot, dst string, dryRun bool) error {
	if dryRun {
		c.Logger.Info("🔍 [dry-run] opencode: would stop any running process, remove existing service %q, before copying the binary", opencodeServiceName())
		return nil
	}

	// Elevation is a no-op on darwin/linux (see ensureElevated in
	// rollout_other.go); on Windows it's required to install/remove an
	// NSSM-wrapped service, same requirement as nucleus's own SCM control.
	if err := ensureElevated(); err != nil {
		return fmt.Errorf("opencode: elevation required to manage service %q: %w", opencodeServiceName(), err)
	}

	// Kill any running opencode process first, so the binary isn't locked
	// when we try to copy over it. Scoped to "opencode serve" where
	// possible (unix) to avoid matching an unrelated process that happens
	// to contain "opencode" in its command line.
	opencodeKillProcess(c)

	// Remove any existing service registration. This is cleanup, not the
	// (re)install — that happens in PostDeployFn once the new binary is on
	// disk. Errors here are logged, not returned: a missing/never-installed
	// service is the common case (first rollout) and must not be treated
	// as a failure.
	if err := opencodeRemoveService(c, dst); err != nil {
		c.Logger.Warning("⚠️  opencode: could not fully remove existing service (continuing): %v", err)
	}

	return nil
}

// opencodeKillProcess is best-effort: a non-zero exit from taskkill/pkill
// most commonly means "nothing was running", which is not an error worth
// surfacing.
func opencodeKillProcess(c *core.Core) {
	c.Logger.Info("🛑 Stopping any running opencode process...")
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command("taskkill", "/F", "/IM", "opencode.exe", "/T")
	} else {
		// Scoped to "opencode serve" specifically, not a bare "opencode"
		// substring match, so we don't kill an unrelated process that
		// happens to have "opencode" somewhere in its command line.
		cmd = exec.Command("pkill", "-9", "-f", "opencode serve")
	}
	_ = cmd.Run()
}

// opencodeRemoveService stops and removes/unloads the service, dispatching
// per-OS. Safe to call when no service is installed.
func opencodeRemoveService(c *core.Core, dst string) error {
	switch runtime.GOOS {
	case "windows":
		return opencodeRemoveServiceWindows(c, dst)
	case "darwin":
		return opencodeRemoveServiceDarwin(c)
	default: // linux
		return opencodeRemoveServiceLinux(c)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// PostDeployFn — install/start the service once the new binary is in place
// ─────────────────────────────────────────────────────────────────────────────

func opencodePostDeploy(c *core.Core, repoRoot, dst string, dryRun bool) error {
	exePath := opencodeExePath(dst)

	if dryRun {
		c.Logger.Info("🔍 [dry-run] opencode: would chmod 0755, install+start service %q on port %s, then poll 127.0.0.1:%s",
			opencodeServiceName(), opencodePort(), opencodePort())
		return nil
	}

	if runtime.GOOS != "windows" {
		if err := os.Chmod(exePath, 0o755); err != nil {
			return fmt.Errorf("opencode: chmod: %w", err)
		}
	}

	if err := os.MkdirAll(opencodeLogDir(dst), 0o755); err != nil {
		return fmt.Errorf("opencode: could not create log dir: %w", err)
	}

	c.Logger.Info("🚀 Installing opencode service %q...", opencodeServiceName())
	if err := opencodeInstallService(c, dst); err != nil {
		return fmt.Errorf("opencode: service install failed: %w", err)
	}
	c.Logger.Success("✓ opencode service installed and started")

	c.Logger.Info("🔎 Waiting for opencode to come up on 127.0.0.1:%s ...", opencodePort())
	if err := opencodeWaitReady(30 * time.Second); err != nil {
		// Non-critical by design (REQ §6/§7): a slow or failed opencode
		// start must not fail the overall rollout. It gets re-checked by
		// whatever runs general rollout certification.
		c.Logger.Warning("⚠️  opencode: %v — check %s for details", err, opencodeServiceLogPath(dst))
		return nil
	}
	c.Logger.Success("✅ opencode healthy on 127.0.0.1:%s", opencodePort())
	return nil
}

func opencodeInstallService(c *core.Core, dst string) error {
	switch runtime.GOOS {
	case "windows":
		return opencodeInstallServiceWindows(c, dst)
	case "darwin":
		return opencodeInstallServiceDarwin(c, dst)
	default: // linux
		return opencodeInstallServiceLinux(c, dst)
	}
}

// opencodeWaitReady is the Go equivalent of isPortOpen()/waitForOpencodeReady()
// in the JS installer (identical across all 3 platform variants there):
// TCP-dial with a 2s per-attempt timeout, retried every 2s until timeout.
func opencodeWaitReady(timeout time.Duration) error {
	addr := "127.0.0.1:" + opencodePort()
	deadline := time.Now().Add(timeout)
	var lastErr error
	for time.Now().Before(deadline) {
		conn, err := net.DialTimeout("tcp", addr, 2*time.Second)
		if err == nil {
			conn.Close()
			return nil
		}
		lastErr = err
		time.Sleep(2 * time.Second)
	}
	return fmt.Errorf("opencode did not respond on %s within %s: %w", addr, timeout, lastErr)
}

// ─────────────────────────────────────────────────────────────────────────────
// Windows — NSSM
// ─────────────────────────────────────────────────────────────────────────────

func opencodeRemoveServiceWindows(c *core.Core, dst string) error {
	nssm := nssmExePath(dst)
	if _, err := os.Stat(nssm); err != nil {
		// nssm not deployed yet (e.g. `--only opencode` before the "nssm"
		// component has ever run) — nothing we can do, not fatal.
		return nil
	}
	name := opencodeServiceName()

	_ = exec.Command(nssm, "stop", name).Run() // best-effort; may not exist

	// Up to 5 attempts with backoff if the service is stuck "marked for
	// deletion" — same retry budget the JS installer used.
	var lastErr error
	for attempt := 1; attempt <= 5; attempt++ {
		out, err := exec.Command(nssm, "remove", name, "confirm").CombinedOutput()
		if err == nil {
			return nil
		}
		lastErr = fmt.Errorf("nssm remove: %v (%s)", err, strings.TrimSpace(string(out)))
		if !strings.Contains(strings.ToLower(string(out)), "marked for deletion") {
			// Some other failure (e.g. service simply doesn't exist) —
			// don't keep retrying pointlessly.
			return nil
		}
		time.Sleep(time.Duration(attempt) * time.Second)
	}
	return lastErr
}

func opencodeInstallServiceWindows(c *core.Core, dst string) error {
	nssm := nssmExePath(dst)
	if _, err := os.Stat(nssm); err != nil {
		return fmt.Errorf("nssm.exe not found at %s — run `rollout --only nssm` first", nssm)
	}
	name := opencodeServiceName()
	exePath := opencodeExePath(dst)
	logPath := opencodeServiceLogPath(dst)

	if err := exec.Command(nssm, "install", name, exePath).Run(); err != nil {
		return fmt.Errorf("nssm install: %w", err)
	}

	// ASSUMPTION carried over from the JS installer, not yet confirmed
	// against `opencode serve --help` — see REQ §5.1. If the real flag
	// differs, only this one line needs to change.
	appParams := fmt.Sprintf("serve --port %s", opencodePort())

	steps := [][]string{
		{"set", name, "AppParameters", appParams},
		{"set", name, "AppDirectory", filepath.Dir(exePath)},
		{"set", name, "AppStdout", logPath},
		{"set", name, "AppStderr", logPath},
		{"set", name, "Start", "SERVICE_AUTO_START"},
		{"set", name, "AppExit", "Default", "Restart"},
	}
	for _, args := range steps {
		if out, err := exec.Command(nssm, args...).CombinedOutput(); err != nil {
			return fmt.Errorf("nssm %s: %v (%s)", strings.Join(args, " "), err, strings.TrimSpace(string(out)))
		}
	}

	if out, err := exec.Command(nssm, "start", name).CombinedOutput(); err != nil {
		return fmt.Errorf("nssm start: %v (%s)", err, strings.TrimSpace(string(out)))
	}
	return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// macOS — LaunchAgent
// ─────────────────────────────────────────────────────────────────────────────

func opencodePlistPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, "Library", "LaunchAgents", opencodeServiceName()+".plist"), nil
}

func opencodeRemoveServiceDarwin(c *core.Core) error {
	plistPath, err := opencodePlistPath()
	if err != nil {
		return err
	}
	if _, statErr := os.Stat(plistPath); statErr != nil {
		return nil // nothing to remove
	}
	_ = exec.Command("launchctl", "unload", plistPath).Run()
	return os.Remove(plistPath)
}

func opencodeInstallServiceDarwin(c *core.Core, dst string) error {
	plistPath, err := opencodePlistPath()
	if err != nil {
		return err
	}
	exePath := opencodeExePath(dst)
	logPath := opencodeServiceLogPath(dst)

	plist := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>%s</string>
	<key>ProgramArguments</key>
	<array>
		<string>%s</string>
		<string>serve</string>
		<string>--port</string>
		<string>%s</string>
	</array>
	<key>RunAtLoad</key>
	<true/>
	<key>KeepAlive</key>
	<dict>
		<key>SuccessfulExit</key>
		<false/>
	</dict>
	<key>ThrottleInterval</key>
	<integer>10</integer>
	<key>StandardOutPath</key>
	<string>%s</string>
	<key>StandardErrorPath</key>
	<string>%s</string>
</dict>
</plist>
`, opencodeServiceName(), exePath, opencodePort(), logPath, logPath)

	if err := os.MkdirAll(filepath.Dir(plistPath), 0o755); err != nil {
		return err
	}
	if err := os.WriteFile(plistPath, []byte(plist), 0o644); err != nil {
		return err
	}

	if out, err := exec.Command("launchctl", "load", plistPath).CombinedOutput(); err != nil {
		return fmt.Errorf("launchctl load: %v (%s)", err, strings.TrimSpace(string(out)))
	}
	return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// Linux — systemd --user + linger
// ─────────────────────────────────────────────────────────────────────────────

func opencodeUnitPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".config", "systemd", "user", opencodeServiceName()), nil
}

func opencodeRemoveServiceLinux(c *core.Core) error {
	name := opencodeServiceName()
	_ = exec.Command("systemctl", "--user", "stop", name).Run()
	_ = exec.Command("systemctl", "--user", "disable", name).Run()

	unitPath, err := opencodeUnitPath()
	if err != nil {
		return err
	}
	if _, statErr := os.Stat(unitPath); statErr != nil {
		return nil
	}
	return os.Remove(unitPath)
}

func opencodeInstallServiceLinux(c *core.Core, dst string) error {
	unitPath, err := opencodeUnitPath()
	if err != nil {
		return err
	}
	exePath := opencodeExePath(dst)

	unit := fmt.Sprintf(`[Unit]
Description=Bloom OpenCode service

[Service]
ExecStart=%s serve --port %s
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
`, exePath, opencodePort())

	if err := os.MkdirAll(filepath.Dir(unitPath), 0o755); err != nil {
		return err
	}
	if err := os.WriteFile(unitPath, []byte(unit), 0o644); err != nil {
		return err
	}

	name := opencodeServiceName()
	if out, err := exec.Command("systemctl", "--user", "daemon-reload").CombinedOutput(); err != nil {
		return fmt.Errorf("systemctl --user daemon-reload: %v (%s)", err, strings.TrimSpace(string(out)))
	}
	if out, err := exec.Command("systemctl", "--user", "enable", name).CombinedOutput(); err != nil {
		return fmt.Errorf("systemctl --user enable %s: %v (%s)", name, err, strings.TrimSpace(string(out)))
	}
	if out, err := exec.Command("systemctl", "--user", "start", name).CombinedOutput(); err != nil {
		return fmt.Errorf("systemctl --user start %s: %v (%s)", name, err, strings.TrimSpace(string(out)))
	}

	opencodeEnsureLinger(c)
	return nil
}

// opencodeEnsureLinger enables linger only if it isn't already on, so the
// service survives without an open session, without repeating the enable
// call every rollout. Best-effort: linger requires privileges some
// environments won't have (e.g. sandboxed CI), so failures are logged, not
// returned.
func opencodeEnsureLinger(c *core.Core) {
	user := os.Getenv("USER")
	if user == "" {
		if u, err := exec.Command("whoami").Output(); err == nil {
			user = strings.TrimSpace(string(u))
		}
	}
	if user == "" {
		c.Logger.Warning("⚠️  opencode: could not determine current user — skipping linger check")
		return
	}

	out, err := exec.Command("loginctl", "show-user", user, "--property=Linger").Output()
	if err == nil && strings.TrimSpace(string(out)) == "Linger=yes" {
		return // already enabled
	}

	if out, err := exec.Command("loginctl", "enable-linger", user).CombinedOutput(); err != nil {
		c.Logger.Warning("⚠️  opencode: could not enable linger for %s (service may not survive logout): %v (%s)",
			user, err, strings.TrimSpace(string(out)))
	}
}
