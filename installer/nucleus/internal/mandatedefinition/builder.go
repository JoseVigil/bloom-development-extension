package mandatedefinition

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
)

var genesisIntelligenceByAction = map[string]bool{
	"ing-1": true, "dis-2": true,
	"doc-3": false, "exp-4": false, "dev-5": false, "exp-6": false,
}

// HasApprovedGenesisIntelligenceRequirements binds the reviewed 1.2.0
// classification to exact Action IDs. Future versions require a new review.
func HasApprovedGenesisIntelligenceRequirements(p Payload) bool {
	if p.Version != "1.2.0" || len(p.Plan.Actions) != len(genesisIntelligenceByAction) {
		return false
	}
	seen := make(map[string]bool, len(p.Plan.Actions))
	for _, action := range p.Plan.Actions {
		want, known := genesisIntelligenceByAction[action.ActionID]
		if !known || seen[action.ActionID] || action.RequiresIntelligence == nil || *action.RequiresIntelligence != want {
			return false
		}
		if want {
			if len(action.RequiredCapabilities) != 1 || action.RequiredCapabilities[0] != "text.generate" {
				return false
			}
		} else if len(action.RequiredCapabilities) != 0 {
			return false
		}
		seen[action.ActionID] = true
	}
	return true
}

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
	if in.Version != "1.2.0" && in.Version != "1.3.0" {
		return Payload{}, errors.New("unsupported preparable Genesis version")
	}
	p, err := BuildInitialOfferPayload(in)
	if err != nil {
		return Payload{}, err
	}
	p.SchemaVersion = PreparableSchemaVersion
	// Genesis 1.2.0 classifies only the Intelligence Supply calls observed today.
	// A run_intent action is not, by itself, evidence of provider consumption.
	for i := range p.Plan.Actions {
		required, known := genesisIntelligenceByAction[p.Plan.Actions[i].ActionID]
		if !known {
			return Payload{}, errors.New("Genesis Intelligence Supply classification missing for Action")
		}
		p.Plan.Actions[i].RequiresIntelligence = &required
		if required {
			p.Plan.Actions[i].RequiredCapabilities = []string{"text.generate"}
		}
	}
	if in.Version == "1.3.0" {
		actions := make([]PlanAction, 0, 8)
		for _, action := range p.Plan.Actions {
			if action.ActionID == "doc-3" {
				continue
			}
			if len(actions) > 0 {
				action.DependsOn = []string{actions[len(actions)-1].ActionID}
			}
			actions = append(actions, action)
			switch action.IntentType {
			case "ing", "dis", "dev":
				required := false
				actions = append(actions, PlanAction{
					ActionID: "doc-after-" + action.ActionID, Type: "run_intent",
					IntentType: "doc", DependsOn: []string{action.ActionID},
					RequiresIntelligence: &required,
				})
			}
		}
		p.Plan.Actions = actions
	}
	p.Preparation = Preparation{Status: PreparationDefined, DomainRule: PreparationDomainProject,
		InputRequirements: &InputRequirements{Source: PreparationSourceProjectFiles, MinFiles: 1}}
	return p, p.Validate()
}
