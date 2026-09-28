package mandatecontract

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"reflect"
	"sort"
	"strconv"
	"strings"
)

// Contract is the immutable, locally adopted plan for the first Mandate vertical.
// Lifecycle records and observations are deliberately kept outside this value.
type Contract struct {
	MandateID       string        `json:"mandateId"`
	ContractVersion uint64        `json:"contractVersion"`
	OrganizationID  string        `json:"organizationId"`
	ProjectID       string        `json:"projectId"`
	ProjectBinding  string        `json:"projectBinding"`
	Objective       string        `json:"objective"`
	Domain          Domain        `json:"domain"`
	Action          Action        `json:"action"`
	Intelligence    *Intelligence `json:"intelligence,omitempty"`
	Inputs          []Input       `json:"inputs"`
	Gravity         []GravityRef  `json:"gravity"`
	Fulfillment     Fulfillment   `json:"fulfillment"`
}

// Intelligence is fixed before human approval. Paths select local, read-only
// resources; their hashes, model and spend ceiling are part of the signature.
type Intelligence struct {
	Provider        string `json:"provider"`
	BackendID       string `json:"backendId"`
	Model           string `json:"model"`
	CredentialRef   string `json:"credentialRef"`
	PolicyRef       string `json:"policyRef"`
	PolicyVersion   string `json:"policyVersion"`
	PolicySHA256    string `json:"policySha256"`
	RegistryRef     string `json:"registryRef"`
	RegistrySHA256  string `json:"registrySha256"`
	MaxUSD          string `json:"maxUsd"`
	MaxTotalTokens  int    `json:"maxTotalTokens"`
	MaxOutputTokens int    `json:"maxOutputTokens"`
}

type Domain struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type Input struct {
	Ref    string `json:"ref"`
	SHA256 string `json:"sha256"`
	Size   int64  `json:"size"`
}

type GravityRef struct {
	NodeID   string `json:"nodeId"`
	Revision string `json:"revision"`
	SHA256   string `json:"sha256"`
}

type Action struct {
	ActionID       string `json:"actionId"`
	Type           string `json:"type"`
	IntentType     string `json:"intentType"`
	DomainID       string `json:"domainId"`
	ArtifactRef    string `json:"artifactRef"`
	IdempotencyKey string `json:"idempotencyKey"`
}

type Fulfillment struct {
	Evaluator        string   `json:"evaluator"`
	EvaluatorVersion string   `json:"evaluatorVersion"`
	RequiredFields   []string `json:"requiredFields"`
}

// Validate rejects underspecified or externally directed effects. It does not
// authorize signing, activation, filesystem writes, or the human approver.
func (c Contract) Validate() error {
	if c.ContractVersion != 1 && c.ContractVersion != 2 {
		return errors.New("unsupported Mandate contract version")
	}
	if c.MandateID == "" || c.ContractVersion == 0 || c.OrganizationID == "" || c.ProjectID == "" || c.ProjectBinding == "" || c.Objective == "" || c.Domain.ID == "" || c.Domain.Name == "" {
		return errors.New("Mandate identity, governed project, objective and domain are required")
	}
	if c.Action.ActionID == "" || c.Action.Type != "run_intent" || c.Action.IntentType != "gen" || c.Action.DomainID != c.Domain.ID || c.Action.IdempotencyKey == "" {
		return errors.New("exactly one bound gen Action is required")
	}
	if c.Action.ArtifactRef != "domain_definition.json" {
		return errors.New("first vertical requires domain_definition.json")
	}
	if c.ContractVersion >= 2 {
		i := c.Intelligence
		if i == nil || i.Provider != "anthropic" || i.BackendID != "anthropic_api" || i.Model == "" ||
			i.CredentialRef != "credential-ref://anthropic/default" || i.PolicyVersion != "mandate-gen/v1" ||
			!filepath.IsAbs(i.PolicyRef) || !hexDigest(i.PolicySHA256) || !filepath.IsAbs(i.RegistryRef) ||
			!hexDigest(i.RegistrySHA256) || i.MaxUSD == "" || i.MaxTotalTokens < 1 || i.MaxOutputTokens < 1 {
			return errors.New("Mandate intelligence selection or explicit budget missing")
		}
		usd, parseErr := strconv.ParseFloat(i.MaxUSD, 64)
		if parseErr != nil || !(usd > 0 && usd <= 1) {
			return errors.New("Mandate intelligence USD ceiling invalid")
		}
	}
	if c.Fulfillment.Evaluator != "domain-definition-structure" || c.Fulfillment.EvaluatorVersion != "1" ||
		!reflect.DeepEqual(c.Fulfillment.RequiredFields, []string{"domainId", "purpose", "boundaries", "concepts", "decisions", "sources"}) {
		return errors.New("unsupported fulfillment evaluator for first local vertical")
	}
	if len(c.Inputs) == 0 {
		return errors.New("at least one frozen input is required")
	}
	seen := make(map[string]bool, len(c.Inputs))
	for _, input := range c.Inputs {
		if !safeRef(input.Ref) || !hexDigest(input.SHA256) || input.Size < 0 || seen[input.Ref] {
			return fmt.Errorf("invalid or duplicate input %q", input.Ref)
		}
		seen[input.Ref] = true
	}
	for _, posture := range c.Gravity {
		if posture.NodeID == "" || posture.Revision == "" || !hexDigest(posture.SHA256) {
			return errors.New("invalid Gravity reference")
		}
	}
	return nil
}

func safeRef(ref string) bool {
	return ref != "" && !filepath.IsAbs(ref) && !strings.Contains(ref, "\\") &&
		path.Clean(ref) == ref && ref != ".." && !strings.HasPrefix(ref, "../") && !strings.Contains(ref, "/../")
}

func hexDigest(value string) bool {
	if len(value) != 64 {
		return false
	}
	for _, r := range value {
		if r < '0' || r > '9' {
			if r < 'a' || r > 'f' {
				return false
			}
		}
	}
	return true
}

// FreezeFiles snapshots every document copied by build before approval or
// signing. The returned refs point only to those immutable candidate bytes;
// workflow signals cannot append files to this set.
func FreezeFiles(mandateDir string, documentNames []string) ([]Input, error) {
	if len(documentNames) == 0 {
		return nil, errors.New("Mandate requires at least one document to freeze")
	}
	names := append([]string(nil), documentNames...)
	sort.Strings(names)
	docsDir := filepath.Join(mandateDir, "docs")
	info, err := os.Lstat(docsDir)
	if err != nil {
		return nil, err
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return nil, errors.New("Mandate docs directory is not a regular directory")
	}
	inputDir := filepath.Join(mandateDir, "inputs")
	if err := os.MkdirAll(inputDir, 0700); err != nil {
		return nil, err
	}
	inputInfo, err := os.Lstat(inputDir)
	if err != nil {
		return nil, err
	}
	if !inputInfo.IsDir() || inputInfo.Mode()&os.ModeSymlink != 0 {
		return nil, errors.New("Mandate input directory is not a regular directory")
	}
	result := make([]Input, 0, len(names))
	for index, name := range names {
		if name == "" || name == "." || name == ".." || strings.ContainsAny(name, "/\\:") || strings.HasSuffix(name, ".") || strings.HasSuffix(name, " ") || (index > 0 && name == names[index-1]) {
			return nil, fmt.Errorf("invalid or duplicate document name %q", name)
		}
		sourcePath := filepath.Join(docsDir, name)
		info, err := os.Lstat(sourcePath)
		if err != nil {
			return nil, err
		}
		if !info.Mode().IsRegular() {
			return nil, fmt.Errorf("document %q is not a regular file", name)
		}
		content, err := os.ReadFile(sourcePath)
		if err != nil {
			return nil, err
		}
		sum := sha256.Sum256(content)
		dest := filepath.Join(inputDir, name)
		if existingInfo, statErr := os.Lstat(dest); statErr == nil {
			if !existingInfo.Mode().IsRegular() {
				return nil, fmt.Errorf("frozen input %q is not a regular file", name)
			}
			existing, readErr := os.ReadFile(dest)
			if readErr != nil {
				return nil, readErr
			}
			if !reflect.DeepEqual(existing, content) {
				return nil, fmt.Errorf("frozen input %q conflicts with current document", name)
			}
		} else if !os.IsNotExist(statErr) {
			return nil, statErr
		} else {
			tmp, createErr := os.CreateTemp(inputDir, ".freeze-*")
			if createErr != nil {
				return nil, createErr
			}
			tmpName := tmp.Name()
			if _, err := tmp.Write(content); err != nil {
				tmp.Close()
				os.Remove(tmpName)
				return nil, err
			}
			if err := tmp.Sync(); err != nil {
				tmp.Close()
				os.Remove(tmpName)
				return nil, err
			}
			if err := tmp.Close(); err != nil {
				os.Remove(tmpName)
				return nil, err
			}
			if err := os.Rename(tmpName, dest); err != nil {
				os.Remove(tmpName)
				return nil, err
			}
		}
		result = append(result, Input{Ref: "inputs/" + name, SHA256: hex.EncodeToString(sum[:]), Size: int64(len(content))})
	}
	return result, nil
}
