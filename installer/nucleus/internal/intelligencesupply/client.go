package intelligencesupply

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
)

const maxCLIOutput = 1 << 20

var ErrAssignmentsUnavailable = errors.New("INTENT_SUPPLY_ASSIGNMENTS_UNAVAILABLE")
var ErrStateDirUnavailable = errors.New("AITAP_STATE_DIR_UNAVAILABLE")

type Runner func(context.Context, string, []string, []byte) ([]byte, []byte, int, error)

type Client struct {
	Binary string
	// StateDir is the canonical AITAP state root resolved by the Nucleus
	// caller. It is always passed explicitly; this client never inherits an
	// ambient AITAP_STATE_DIR as authority.
	StateDir string
	Run      Runner
}

type successEnvelope struct {
	Status    string          `json:"status"`
	Operation string          `json:"operation"`
	Data      json.RawMessage `json:"data"`
}

// ResolveStateDir applies the already-established Nucleus convention without
// reading ambient process state: an explicit configured override wins;
// otherwise the product root is <AppData>/aitap. The directory must already
// exist because read-only listing must not create AITAP state.
func ResolveStateDir(appDataDir, configured string) (string, error) {
	candidate := configured
	if candidate == "" && appDataDir != "" {
		candidate = filepath.Join(appDataDir, "aitap")
	}
	if !validStateDir(candidate) {
		return "", ErrStateDirUnavailable
	}
	return candidate, nil
}

// Assignments invokes AITAP's approved read-only operation. It returns only
// the sanitized data payload and never propagates stderr or arbitrary error
// messages across the Nucleus boundary.
func (c Client) Assignments(ctx context.Context, mode string, request []byte, policyPath, registryPath string) (json.RawMessage, error) {
	if ctx == nil || (mode != "list" && mode != "validate") || len(request) == 0 || !filepath.IsAbs(policyPath) || !filepath.IsAbs(registryPath) || !validStateDir(c.StateDir) {
		return nil, ErrAssignmentsUnavailable
	}
	runner := c.Run
	if runner == nil {
		runner = runCommand
	}
	binary := c.Binary
	if binary == "" {
		binary = os.Getenv("AITAP_BIN")
	}
	if binary == "" {
		binary = "aitap"
	}
	args := []string{"--json", "route", "assignments", "--mode", mode, "--request", "-", "--policy", policyPath, "--registry", registryPath, "--state-dir", c.StateDir}
	stdout, _, exitCode, err := runner(ctx, binary, args, request)
	if err != nil || exitCode != 0 || len(stdout) == 0 || len(stdout) > maxCLIOutput {
		return nil, ErrAssignmentsUnavailable
	}
	decoder := json.NewDecoder(bytes.NewReader(stdout))
	decoder.DisallowUnknownFields()
	var envelope successEnvelope
	if decoder.Decode(&envelope) != nil || decoder.Decode(new(any)) != io.EOF || envelope.Status != "success" || envelope.Operation != "route.assignments" || len(envelope.Data) == 0 {
		return nil, ErrAssignmentsUnavailable
	}
	var data any
	if json.Unmarshal(envelope.Data, &data) != nil || containsForbiddenField(data) {
		return nil, ErrAssignmentsUnavailable
	}
	return append(json.RawMessage(nil), envelope.Data...), nil
}

func validStateDir(path string) bool {
	if path == "" || !filepath.IsAbs(path) {
		return false
	}
	info, err := os.Lstat(path)
	return err == nil && info.IsDir() && info.Mode()&os.ModeSymlink == 0
}

func runCommand(ctx context.Context, binary string, args []string, input []byte) ([]byte, []byte, int, error) {
	command := exec.CommandContext(ctx, binary, args...)
	command.Stdin = bytes.NewReader(input)
	var stdout, stderr bytes.Buffer
	command.Stdout = &limitedBuffer{buffer: &stdout, remaining: maxCLIOutput + 1}
	command.Stderr = &limitedBuffer{buffer: &stderr, remaining: 64 << 10}
	err := command.Run()
	exitCode := 0
	if err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			exitCode = exitErr.ExitCode()
		} else {
			exitCode = -1
		}
	}
	return stdout.Bytes(), stderr.Bytes(), exitCode, err
}

type limitedBuffer struct {
	buffer    *bytes.Buffer
	remaining int
}

func (w *limitedBuffer) Write(value []byte) (int, error) {
	original := len(value)
	if w.remaining <= 0 {
		return original, nil
	}
	if len(value) > w.remaining {
		value = value[:w.remaining]
	}
	_, _ = w.buffer.Write(value)
	w.remaining -= len(value)
	return original, nil
}

func containsForbiddenField(value any) bool {
	forbidden := map[string]bool{
		"credential_ref": true, "grant_id": true, "principal_id": true, "membership_id": true,
		"key_id": true, "secret": true, "signature": true, "nonce": true, "token": true,
	}
	switch typed := value.(type) {
	case map[string]any:
		for key, child := range typed {
			if forbidden[key] || containsForbiddenField(child) {
				return true
			}
		}
	case []any:
		for _, child := range typed {
			if containsForbiddenField(child) {
				return true
			}
		}
	}
	return false
}
