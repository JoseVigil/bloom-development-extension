package mandatedefinition

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
)

// InitialOfferInput are the publisher-chosen values of the initial offer.
// Everything else in the payload is the fixed initial-Mandate plan.
type InitialOfferInput struct {
	DefinitionID string
	Version      string
	Label        string
	Purpose      string
	PublisherID  string
	KeyID        string
	PublishedAt  string
	PolicyRaw    []byte
	RegistryRaw  []byte
}

// BuildInitialOfferPayload composes the payload of the initial Mandate offer:
// the six-Action plan, its fulfillment and ceilings, and the policy and
// registry bytes. It carries no organization, project, installation, path,
// domain rule or input requirement; preparation stays not_defined.
func BuildInitialOfferPayload(in InitialOfferInput) (Payload, error) {
	var policy struct {
		PolicyVersion string `json:"policy_version"`
	}
	var registry struct {
		SnapshotID string `json:"snapshot_id"`
	}
	if json.Unmarshal(in.PolicyRaw, &policy) != nil || policy.PolicyVersion == "" {
		return Payload{}, errors.New("policy must declare policy_version")
	}
	if json.Unmarshal(in.RegistryRaw, &registry) != nil || registry.SnapshotID == "" {
		return Payload{}, errors.New("registry must declare snapshot_id")
	}
	actions := make([]PlanAction, 0, 6)
	for i, intentType := range []string{"ing", "dis", "doc", "exp", "dev", "exp"} {
		action := PlanAction{ActionID: fmt.Sprintf("%s-%d", intentType, i+1), Type: "run_intent", IntentType: intentType, DependsOn: []string{}}
		if i > 0 {
			action.DependsOn = []string{actions[i-1].ActionID}
		}
		if intentType == "dev" {
			action.WhenResult = "remediation_required"
		}
		actions = append(actions, action)
	}
	p := Payload{
		Schema: Schema, SchemaVersion: SchemaVersion,
		DefinitionID: in.DefinitionID, Version: in.Version, Label: in.Label, Purpose: in.Purpose,
		Publisher:          Publisher{PublisherID: in.PublisherID, KeyID: in.KeyID},
		PublishedAt:        in.PublishedAt,
		Plan:               Plan{Actions: actions},
		Fulfillment:        Fulfillment{Evaluator: "exp-ready", EvaluatorVersion: "1", RequiredFields: []string{"ing", "dis", "doc", "exp"}},
		ObjectiveTemplate:  "Estructuración semántica inicial de {project_name}",
		IntelligenceLimits: IntelligenceLimits{MaxTotalTokens: 50000, MaxOutputTokens: 4096},
		Policy:             EmbeddedPolicy{PolicyVersion: policy.PolicyVersion, SHA256: FileDigest(in.PolicyRaw), ContentBase64: base64.StdEncoding.EncodeToString(in.PolicyRaw)},
		Registry:           EmbeddedRegistry{SnapshotID: registry.SnapshotID, SHA256: FileDigest(in.RegistryRaw), ContentBase64: base64.StdEncoding.EncodeToString(in.RegistryRaw)},
		Requires:           Requires{ContractVersion: 4, Project: true},
		Preparation:        Preparation{Status: PreparationNotDefined},
	}
	return p, p.Validate()
}

// BuildPreparableOfferPayload keeps the approved six-Action plan and signs the
// project-derived domain and minimum project-file input rule in schema 1.1.
func BuildPreparableOfferPayload(in InitialOfferInput) (Payload, error) {
	p, err := BuildInitialOfferPayload(in)
	if err != nil {
		return Payload{}, err
	}
	p.SchemaVersion = PreparableSchemaVersion
	p.Preparation = Preparation{Status: PreparationDefined, DomainRule: PreparationDomainProject,
		InputRequirements: &InputRequirements{Source: PreparationSourceProjectFiles, MinFiles: 1}}
	return p, p.Validate()
}
