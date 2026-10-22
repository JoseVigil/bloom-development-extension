package maintenance

import (
	"context"
	"crypto/sha256"
	"debug/pe"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"
)

var uninstallVersionLine = regexp.MustCompile(`^Bloom Uninstall v([0-9]+\.[0-9]+\.[0-9]+)-build\.([0-9]+)(?:\s|$)`)

type uninstallVersion struct {
	version string
	build   int
}

type uninstallRolloutReport struct {
	Source      string `json:"source"`
	Destination string `json:"destination"`
	Version     string `json:"version,omitempty"`
	Build       int    `json:"build"`
	SHA256      string `json:"sha256,omitempty"`
	Result      string `json:"result"`
	Rollback    string `json:"rollback,omitempty"`
	Warning     string `json:"warning,omitempty"`
}

func probeUninstallVersion(path string) (uninstallVersion, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	// This is the only invocation of bloom-uninstall.exe in the rollout.
	output, err := exec.CommandContext(ctx, path, "--version").CombinedOutput()
	if err != nil {
		return uninstallVersion{}, fmt.Errorf("query --version: %w: %s", err, strings.TrimSpace(string(output)))
	}
	match := uninstallVersionLine.FindStringSubmatch(strings.TrimSpace(string(output)))
	if match == nil {
		return uninstallVersion{}, fmt.Errorf("unexpected --version output: %q", strings.TrimSpace(string(output)))
	}
	build, err := strconv.Atoi(match[2])
	if err != nil {
		return uninstallVersion{}, err
	}
	return uninstallVersion{version: match[1], build: build}, nil
}

func validateUninstallCandidate(path string, probe func(string) (uninstallVersion, error)) (uninstallVersion, string, error) {
	info, err := os.Stat(path)
	if err != nil {
		return uninstallVersion{}, "", fmt.Errorf("candidate %s: %w", path, err)
	}
	if !info.Mode().IsRegular() {
		return uninstallVersion{}, "", fmt.Errorf("candidate is not a regular file: %s", path)
	}
	image, err := pe.Open(path)
	if err != nil {
		return uninstallVersion{}, "", fmt.Errorf("candidate is not a Windows executable: %w", err)
	}
	machine := image.FileHeader.Machine
	image.Close()
	if machine != pe.IMAGE_FILE_MACHINE_AMD64 {
		return uninstallVersion{}, "", fmt.Errorf("candidate PE architecture %#x is not Windows AMD64", machine)
	}
	version, err := probe(path)
	if err != nil {
		return uninstallVersion{}, "", err
	}
	hash, err := uninstallSHA256File(path)
	return version, hash, err
}

func uninstallSHA256File(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err = io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

func rolloutUninstall(src, dst string, dryRun bool) (uninstallRolloutReport, error) {
	return rolloutUninstallWithProbe(src, dst, dryRun, probeUninstallVersion)
}

func rolloutUninstallWithProbe(src, dst string, dryRun bool, probe func(string) (uninstallVersion, error)) (report uninstallRolloutReport, err error) {
	report = uninstallRolloutReport{Source: src, Destination: dst, Result: "rejected"}
	if runtime.GOOS != "windows" {
		return report, fmt.Errorf("uninstall rollout is only supported on Windows")
	}
	candidate, hash, err := validateUninstallCandidate(src, probe)
	if err != nil {
		return report, err
	}
	report.Version, report.Build, report.SHA256 = candidate.version, candidate.build, hash
	if dryRun {
		report.Result = "dry_run"
		return report, nil
	}
	if err = os.MkdirAll(filepath.Dir(dst), 0755); err != nil {
		return report, err
	}
	previous := false
	if _, statErr := os.Stat(dst); statErr == nil {
		previous = true
		oldHash, hashErr := uninstallSHA256File(dst)
		if hashErr != nil {
			return report, fmt.Errorf("hash installed executable: %w", hashErr)
		}
		if oldHash == hash {
			installed, probeErr := probe(dst)
			if probeErr != nil {
				return report, fmt.Errorf("verify installed --version: %w", probeErr)
			}
			if installed != candidate {
				return report, fmt.Errorf("installed --version differs from candidate")
			}
			report.Result = "unchanged"
			return report, nil
		}
		if err = checkUninstallReplaceable(dst); err != nil {
			return report, fmt.Errorf("installed executable is in use or cannot be replaced: %w", err)
		}
	} else if !os.IsNotExist(statErr) {
		return report, statErr
	}
	stageFile, err := os.CreateTemp(filepath.Dir(dst), ".uninstall-stage-*.exe")
	if err != nil {
		return report, err
	}
	stage := stageFile.Name()
	if err = stageFile.Close(); err != nil {
		return report, err
	}
	_ = os.Remove(stage)
	defer os.Remove(stage)
	if err = copyFile(src, stage); err != nil {
		return report, fmt.Errorf("stage candidate: %w", err)
	}
	staged, stagedHash, err := validateUninstallCandidate(stage, probe)
	if err != nil || stagedHash != hash || staged != candidate {
		return report, fmt.Errorf("staged candidate differs or cannot run: %v", err)
	}
	backup := ""
	if previous {
		backupFile, backupErr := os.CreateTemp(filepath.Dir(dst), ".uninstall-previous-*.exe")
		if backupErr != nil {
			return report, backupErr
		}
		backup = backupFile.Name()
		if closeErr := backupFile.Close(); closeErr != nil {
			return report, closeErr
		}
		if removeErr := os.Remove(backup); removeErr != nil {
			return report, removeErr
		}
		if err = os.Rename(dst, backup); err != nil {
			return report, fmt.Errorf("preserve previous executable: %w", err)
		}
	}
	restore := func(cause error) (uninstallRolloutReport, error) {
		report.Result = "failed"
		if previous {
			failed := stage + ".failed"
			if _, statErr := os.Stat(dst); statErr == nil {
				if moveErr := os.Rename(dst, failed); moveErr != nil {
					report.Rollback = "failed"
					return report, fmt.Errorf("%v; rollback could not move candidate: %w", cause, moveErr)
				}
			}
			if restoreErr := os.Rename(backup, dst); restoreErr != nil {
				report.Rollback = "failed"
				return report, fmt.Errorf("%v; rollback could not restore previous executable at %s: %w", cause, backup, restoreErr)
			}
			report.Rollback = "restored"
			_ = os.Remove(failed)
		} else {
			if removeErr := os.Remove(dst); removeErr != nil && !os.IsNotExist(removeErr) {
				report.Rollback = "failed"
				return report, fmt.Errorf("%v; remove failed first install: %w", cause, removeErr)
			}
		}
		return report, cause
	}
	if err = os.Rename(stage, dst); err != nil {
		return restore(fmt.Errorf("activate candidate: %w", err))
	}
	installedHash, err := uninstallSHA256File(dst)
	if err != nil || installedHash != hash {
		return restore(fmt.Errorf("installed SHA-256 mismatch: %v", err))
	}
	installed, err := probe(dst)
	if err != nil || installed != candidate {
		return restore(fmt.Errorf("installed --version mismatch: %v", err))
	}
	report.Result = "deployed"
	if previous {
		if cleanupErr := os.Remove(backup); cleanupErr != nil {
			report.Warning = "validated deployment; previous executable retained at " + backup + ": " + cleanupErr.Error()
		}
	}
	return report, nil
}
