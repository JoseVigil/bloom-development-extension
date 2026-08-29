package gravity

import "encoding/json"

type NodeType string

const (
	NodeNucleus      NodeType = "NUCLEUS"
	NodeOrganization NodeType = "ORGANIZATION"
	NodeProject      NodeType = "PROJECT"
	NodeMandate      NodeType = "MANDATE"
	NodeSession      NodeType = "SESSION"
)

type NodeStatus string

const (
	NodeActive     NodeStatus = "active"
	NodeSuperseded NodeStatus = "superseded"
)

type RuleOrigin string

const (
	OriginNucleus          RuleOrigin = "nucleus"
	OriginOrganization     RuleOrigin = "organization"
	OriginProject          RuleOrigin = "project"
	OriginMandateOwn       RuleOrigin = "mandate_own"
	OriginMandateInherited RuleOrigin = "mandate_inherited"
	OriginSession          RuleOrigin = "session"
)

type SignedBy struct {
	ActorID   string `json:"actorId"`
	Role      string `json:"role"`
	RoleBasis string `json:"roleBasis"`
}

type PromotedFrom struct {
	FromRuleID  string `json:"fromRuleId"`
	FromNodeID  string `json:"fromNodeId"`
	PromotedVia string `json:"promotedVia"`
	OccurredAt  string `json:"occurredAt"`
}

// GravityRule models the fields with defined runtime semantics. Extra keeps
// forward-compatible fields from the still-open expression grammar available
// to consumers without making this package their owner.
type GravityRule struct {
	RuleID          string          `json:"ruleId"`
	SourceMandateID string          `json:"sourceMandateId,omitempty"`
	Primitive       string          `json:"primitive"`
	Expression      json.RawMessage `json:"expression,omitempty"`
	AppliesTo       []string        `json:"appliesTo"`
	Status          string          `json:"status"`
	Origin          RuleOrigin      `json:"origin"`
	Verifiable      bool            `json:"verifiable"`
	Promotable      bool            `json:"promotable"`
	PromotedTo      json.RawMessage `json:"promotedTo,omitempty"`
	PromotedFrom    *PromotedFrom   `json:"promotedFrom"`
}

type GravityNode struct {
	NodeID       string        `json:"nodeId"`
	NodeType     NodeType      `json:"nodeType"`
	ParentID     *string       `json:"parentId"`
	GravityRules []GravityRule `json:"gravityRules"`
	Status       NodeStatus    `json:"status"`
	CreatedAt    string        `json:"createdAt"`
	SignedBy     *SignedBy     `json:"signedBy,omitempty"`
	NodeVersion  uint64        `json:"nodeVersion"`
}

type ResolutionCache struct {
	Spine        []string `json:"spine"`
	CachedAtTurn uint64   `json:"cached_at_turn"`
}

type ResolvedPosture struct {
	GravityRule
	NodeType NodeType `json:"nodeType"`
	NodeID   string   `json:"nodeId"`
	Masa     int      `json:"masa"`
}
