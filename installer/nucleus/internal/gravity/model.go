package gravity

import "encoding/json"

type NodeType string

const (
	NodeNucleus      NodeType = "NUCLEUS"
	NodeOrganization NodeType = "ORGANIZATION"
	NodeProject      NodeType = "PROJECT"
	NodeMandate      NodeType = "MANDATE"
	NodeSession      NodeType = "SESSION"
	NodeDomain       NodeType = "DOMAIN"
	NodeGene         NodeType = "GENE"
)

type NodeStatus string

const (
	NodeActive     NodeStatus = "active"
	NodeSuperseded NodeStatus = "superseded"
)

type PostureOrigin string

const (
	OriginNucleus          PostureOrigin = "nucleus"
	OriginOrganization     PostureOrigin = "organization"
	OriginProject          PostureOrigin = "project"
	OriginMandateOwn       PostureOrigin = "mandate_own"
	OriginMandateInherited PostureOrigin = "mandate_inherited"
	OriginSession          PostureOrigin = "session"
)

type SignedBy struct {
	ActorID   string `json:"actorId"`
	Role      string `json:"role"`
	RoleBasis string `json:"roleBasis"`
}

type PromotedFrom struct {
	FromPostureID string `json:"fromPostureId"`
	FromNodeID    string `json:"fromNodeId"`
	PromotedVia   string `json:"promotedVia"`
	OccurredAt    string `json:"occurredAt"`
}

// DomainRef points to the canonical semantic index. It never duplicates
// Domain semantic content inside Gravity.
type DomainRef struct {
	SemanticIndexPath string `json:"semanticIndexPath"`
}

// GeneRef points to the canonical Gene and records its immutable origin
// Mandate. ParentID must equal MandateID.
type GeneRef struct {
	MandateID string `json:"mandateId"`
	GenePath  string `json:"genePath"`
}

// GravityPosture models the fields with defined runtime semantics. Extra keeps
// forward-compatible fields from the still-open expression grammar available
// to consumers without making this package their owner.
type GravityPosture struct {
	PostureID       string          `json:"postureId"`
	SourceMandateID string          `json:"sourceMandateId,omitempty"`
	Primitive       string          `json:"primitive"`
	Expression      json.RawMessage `json:"expression,omitempty"`
	AppliesTo       []string        `json:"appliesTo"`
	Status          string          `json:"status"`
	Origin          PostureOrigin   `json:"origin"`
	Verifiable      bool            `json:"verifiable"`
	Promotable      bool            `json:"promotable"`
	PromotedTo      json.RawMessage `json:"promotedTo,omitempty"`
	PromotedFrom    *PromotedFrom   `json:"promotedFrom"`
}

type GravityNode struct {
	NodeID          string           `json:"nodeId"`
	NodeType        NodeType         `json:"nodeType"`
	ParentID        *string          `json:"parentId"`
	GravityPostures []GravityPosture `json:"gravityPostures"`
	Status          NodeStatus       `json:"status"`
	CreatedAt       string           `json:"createdAt"`
	SignedBy        *SignedBy        `json:"signedBy,omitempty"`
	NodeVersion     uint64           `json:"nodeVersion"`
	DomainRef       *DomainRef       `json:"domainRef,omitempty"`
	GeneRef         *GeneRef         `json:"geneRef,omitempty"`
}

type StructuralEdgeType string

const (
	EdgeDomainGene    StructuralEdgeType = "DOMAIN_GENE"
	EdgeDomainMandate StructuralEdgeType = "DOMAIN_MANDATE"
)

type CanonicalSource struct {
	Path        string `json:"path"`
	Selector    string `json:"selector"`
	Fingerprint string `json:"fingerprint"`
}

type StructuralEdge struct {
	EdgeID          string             `json:"edgeId"`
	EdgeType        StructuralEdgeType `json:"edgeType"`
	FromNodeID      string             `json:"fromNodeId"`
	ToNodeID        string             `json:"toNodeId"`
	Status          NodeStatus         `json:"status"`
	CanonicalSource CanonicalSource    `json:"canonicalSource"`
	MaterializedAt  string             `json:"materializedAt"`
	EdgeVersion     uint64             `json:"edgeVersion"`
}

type ResolutionCache struct {
	Spine        []string `json:"spine"`
	CachedAtTurn uint64   `json:"cached_at_turn"`
}

type ResolvedPosture struct {
	GravityPosture
	NodeType NodeType `json:"nodeType"`
	NodeID   string   `json:"nodeId"`
	Masa     int      `json:"masa"`
}
