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

// PolicyPermission asks AITAP for its effective decision for the exact local
// Mandate supply tuple, then binds that decision to the selected model rule.
func PolicyPermission(ctx context.Context, run Runner, modelID, backendID, supplyPolicyVersion string) (string, string, error) {
	if modelID == "" || backendID == "" || supplyPolicyVersion == "" {
		return "", "", errors.New("local access query is incomplete")
	}
	data, err := call(ctx, run, "route.policy", "route", "policy", "--consumer", "brain", "--intent-type", "gen",
		"--policy-version", supplyPolicyVersion, "--model", modelID)
	if err != nil {
		return "", "", err
	}
	var body struct {
		PolicyVersion string `json:"policy_version"`
		FileSHA256    string `json:"file_sha256"`
		Enforced      bool   `json:"enforced"`
		Check         struct {
			Allowed       *bool  `json:"allowed"`
			ConsumerID    string `json:"consumer_id"`
			IntentType    string `json:"intent_type"`
			ModelID       string `json:"model_id"`
			PolicyVersion string `json:"policy_version"`
			Reason        string `json:"reason"`
			Grant         *struct {
				ConsumerID     string   `json:"consumer_id"`
				IntentTypes    []string `json:"intent_types"`
				PolicyVersions []string `json:"policy_versions"`
			} `json:"grant"`
		} `json:"check"`
		EffectiveGrants []struct {
			BackendID     string `json:"backend_id"`
			ConsumerID    string `json:"consumer_id"`
			IntentType    string `json:"intent_type"`
			ModelID       string `json:"model_id"`
			PolicyVersion string `json:"policy_version"`
		} `json:"effective_grants"`
		Policy struct {
			PolicyVersion   string `json:"policy_version"`
			DefaultDecision string `json:"default_decision"`
			Models          []struct {
				ModelID          string   `json:"model_id"`
				BackendID        string   `json:"backend_id"`
				Enabled          bool     `json:"enabled"`
				AllowedConsumers []string `json:"allowed_consumers"`
				Grants           []struct {
					ConsumerID     string   `json:"consumer_id"`
					IntentTypes    []string `json:"intent_types"`
					PolicyVersions []string `json:"policy_versions"`
				} `json:"grants"`
			} `json:"models"`
		} `json:"policy"`
	}
	if json.Unmarshal(data, &body) != nil || !body.Enforced || !hexDigest(body.FileSHA256) ||
		body.PolicyVersion == "" || body.Policy.PolicyVersion != body.PolicyVersion || body.Policy.DefaultDecision != "deny" ||
		body.Check.Allowed == nil || !*body.Check.Allowed || body.Check.Reason != "GRANTED" || body.Check.Grant == nil ||
		body.Check.ConsumerID != "brain" || body.Check.IntentType != "gen" || body.Check.ModelID != modelID ||
		body.Check.PolicyVersion != supplyPolicyVersion ||
		body.Check.Grant.ConsumerID != "brain" || !contains(body.Check.Grant.IntentTypes, "gen") ||
		!contains(body.Check.Grant.PolicyVersions, supplyPolicyVersion) {
		return "", "", errors.New("AITAP effective local access permission is absent or unverifiable")
	}
	matches := 0
	grantMatches := 0
	for _, model := range body.Policy.Models {
		if model.ModelID == modelID {
			matches++
			if model.BackendID != backendID || !model.Enabled || !contains(model.AllowedConsumers, "brain") {
				return "", "", errors.New("AITAP selected model is not permitted for Brain")
			}
			for _, grant := range model.Grants {
				if grant.ConsumerID == "brain" && contains(grant.IntentTypes, "gen") && contains(grant.PolicyVersions, supplyPolicyVersion) {
					grantMatches++
				}
			}
		}
	}
	effectiveMatches := 0
	for _, grant := range body.EffectiveGrants {
		if grant.ModelID == modelID && grant.BackendID == backendID && grant.ConsumerID == "brain" &&
			grant.IntentType == "gen" && grant.PolicyVersion == supplyPolicyVersion {
			effectiveMatches++
		}
	}
	if matches != 1 || grantMatches != 1 || effectiveMatches != 1 {
		return "", "", errors.New("AITAP selected model grant is missing or ambiguous")
	}
	return body.PolicyVersion, body.FileSHA256, nil
}

func contains(values []string, selected string) bool {
	for _, value := range values {
		if value == selected {
			return true
		}
	}
	return false
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
