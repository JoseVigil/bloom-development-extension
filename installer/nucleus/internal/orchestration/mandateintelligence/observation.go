package mandateintelligence

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"
)

// Runner permits contract tests without starting AITAP or contacting Ollama.
type Runner func(context.Context, ...string) ([]byte, error)

func DefaultRunner(ctx context.Context, args ...string) ([]byte, error) {
	path := os.Getenv("AITAP_BIN")
	if path == "" {
		path = "aitap"
	}
	return exec.CommandContext(ctx, path, append([]string{"--json"}, args...)...).Output()
}

type Observation struct {
	Model          string
	ManifestSHA256 string
	ObservedAt     time.Time
	ExpiresAt      time.Time
}

func hexDigest(value string) bool {
	if len(value) != 64 {
		return false
	}
	for _, c := range value {
		if c < '0' || c > '9' && c < 'a' || c > 'f' {
			return false
		}
	}
	return true
}

func call(ctx context.Context, run Runner, operation string, args ...string) (json.RawMessage, error) {
	if run == nil {
		run = DefaultRunner
	}
	raw, err := run(ctx, args...)
	if err != nil {
		return nil, fmt.Errorf("AITAP %s unavailable: %w", operation, err)
	}
	var envelope struct {
		Status    string          `json:"status"`
		Operation string          `json:"operation"`
		Data      json.RawMessage `json:"data"`
	}
	if json.Unmarshal(raw, &envelope) != nil || envelope.Status != "success" || envelope.Operation != operation || len(envelope.Data) == 0 {
		return nil, errors.New("AITAP observation envelope invalid")
	}
	return envelope.Data, nil
}

// Observe requires a fresh, complete /api/tags observation for the selected catalog model.
func Observe(ctx context.Context, run Runner, modelID, expectedModel string, now time.Time) (Observation, error) {
	if modelID == "" || expectedModel == "" {
		return Observation{}, errors.New("local model identity missing")
	}
	data, err := call(ctx, run, "local.preflight", "local", "preflight", "--model", modelID)
	if err != nil {
		return Observation{}, err
	}
	var body struct {
		Readiness struct {
			ObservedAt string `json:"observed_at"`
			TTLSeconds int    `json:"ttl_seconds"`
			Models     map[string]struct {
				Model          string `json:"model"`
				Installed      *bool  `json:"installed"`
				Available      *bool  `json:"available"`
				ManifestSHA256 string `json:"manifest_sha256"`
			} `json:"models"`
		} `json:"readiness"`
	}
	if json.Unmarshal(data, &body) != nil {
		return Observation{}, errors.New("AITAP preflight invalid")
	}
	model, found := body.Readiness.Models[modelID]
	observed, parseErr := time.Parse(time.RFC3339Nano, body.Readiness.ObservedAt)
	expires := observed.Add(time.Duration(body.Readiness.TTLSeconds) * time.Second)
	if !found || model.Model != expectedModel || model.Installed == nil || !*model.Installed || model.Available == nil || !*model.Available ||
		!hexDigest(model.ManifestSHA256) || parseErr != nil || body.Readiness.TTLSeconds < 1 || body.Readiness.TTLSeconds > 60 ||
		observed.After(now) || !now.Before(expires) {
		return Observation{}, errors.New("local model not freshly available with a verified digest")
	}
	return Observation{Model: model.Model, ManifestSHA256: model.ManifestSHA256, ObservedAt: observed, ExpiresAt: expires}, nil
}

// PolicyFingerprint reads AITAP's applied access policy. It never permits a
// disabled policy or an unpinned file to authorize a Mandate.
func PolicyFingerprint(ctx context.Context, run Runner) (string, string, error) {
	data, err := call(ctx, run, "route.policy", "route", "policy")
	if err != nil {
		return "", "", err
	}
	var body struct {
		PolicyVersion string `json:"policy_version"`
		FileSHA256    string `json:"file_sha256"`
		Enforced      bool   `json:"enforced"`
		Policy        struct {
			DefaultDecision string `json:"default_decision"`
		} `json:"policy"`
	}
	if json.Unmarshal(data, &body) != nil || !body.Enforced || body.PolicyVersion == "" || !hexDigest(body.FileSHA256) || body.Policy.DefaultDecision != "deny" {
		return "", "", errors.New("AITAP local access policy not verifiable or enforced")
	}
	return body.PolicyVersion, body.FileSHA256, nil
}

func FileSHA256(path string) (string, error) {
	if strings.TrimSpace(path) == "" {
		return "", errors.New("resource path missing")
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:]), nil
}
