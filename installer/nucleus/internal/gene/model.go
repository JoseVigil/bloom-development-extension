package gene

import "errors"

const SchemaVersion = "gene-canonical-store/0.1"

var (
	ErrProjectIDRequired       = errors.New("PROJECT_ID_REQUIRED")
	ErrProjectMismatch         = errors.New("PROJECT_MISMATCH")
	ErrRepositoryIDRequired    = errors.New("REPOSITORY_ID_REQUIRED")
	ErrRepositoryUnresolved    = errors.New("REPOSITORY_UNRESOLVED")
	ErrAssetPathInvalid        = errors.New("ASSET_PATH_INVALID")
	ErrAssetOutsideRepository  = errors.New("ASSET_OUTSIDE_REPOSITORY")
	ErrAssetMissing            = errors.New("ASSET_MISSING")
	ErrAssetDigestChanged      = errors.New("ASSET_DIGEST_CHANGED_DURING_MATERIALIZATION")
	ErrContributionNotRatified = errors.New("CONTRIBUTION_NOT_RATIFIED")
	ErrContributionIDConflict  = errors.New("CONTRIBUTION_ID_CONFLICT")
	ErrBaseRevisionConflict    = errors.New("BASE_REVISION_CONFLICT")
	ErrProjectGeneration       = errors.New("PROJECT_GENERATION_CONFLICT")
	ErrRevisionCollision       = errors.New("REVISION_CONTENT_COLLISION")
	ErrVerificationFailed      = errors.New("VERIFICATION_FAILED")
	ErrHeadCorrupt             = errors.New("CANONICAL_HEAD_CORRUPT")
	ErrObjectMissing           = errors.New("CANONICAL_OBJECT_MISSING")
	ErrRecoveryRequired        = errors.New("RECOVERY_REQUIRED")
	ErrDigestInvalid           = errors.New("DIGEST_INVALID")
)

type Origin struct {
	MandateID  string `json:"mandate_id"`
	IntentID   string `json:"intent_id"`
	DecisionID string `json:"decision_id"`
}

type Identity struct {
	SchemaVersion string `json:"schema_version"`
	ProjectID     string `json:"project_id"`
	GeneID        string `json:"gene_id"`
	Function      string `json:"declared_function"`
	Origin        Origin `json:"origin"`
}

type ObservedAsset struct {
	SHA256    string `json:"sha256"`
	SizeBytes int64  `json:"size_bytes"`
}

type AssetRef struct {
	AssetID                string        `json:"asset_id"`
	ProjectID              string        `json:"project_id"`
	RepositoryID           string        `json:"repository_id"`
	Kind                   string        `json:"asset_kind"`
	RepositoryRelativePath string        `json:"repository_relative_path"`
	Observed               ObservedAsset `json:"observed"`
}

type RatificationEvidence struct {
	Classification string `json:"classification"`
	Synthetic      bool   `json:"synthetic"`
	Productive     bool   `json:"productive_authority"`
	DecisionID     string `json:"decision_id"`
}

type Contribution struct {
	SchemaVersion      string               `json:"schema_version"`
	ContributionID     string               `json:"contribution_id"`
	ProjectID          string               `json:"project_id"`
	GeneID             string               `json:"gene_id"`
	BaseRevisionDigest *string              `json:"base_revision_digest"`
	MandateID          string               `json:"mandate_id"`
	IntentID           string               `json:"intent_id"`
	DeclaredFunction   string               `json:"declared_function"`
	Assets             []AssetRef           `json:"assets"`
	Ratification       RatificationEvidence `json:"ratification"`
	StableProvenance   map[string]string    `json:"stable_provenance"`
	ContributionDigest string               `json:"contribution_digest"`
}

type Verification struct {
	EvidenceDigest string `json:"evidence_digest"`
	Verifier       string `json:"verifier"`
}

type Revision struct {
	SchemaVersion          string            `json:"schema_version"`
	ProjectID              string            `json:"project_id"`
	GeneID                 string            `json:"gene_id"`
	ParentRevisionDigest   *string           `json:"parent_revision_digest"`
	DeclaredFunction       string            `json:"declared_function"`
	ConstitutiveAssets     []AssetRef        `json:"constitutive_assets"`
	ProducedByContribution string            `json:"produced_by_contribution_id"`
	StableProvenance       map[string]string `json:"stable_provenance"`
	Verification           Verification      `json:"verification"`
	RevisionDigest         string            `json:"revision_digest"`
}

type GeneHead struct {
	IdentityRef           string `json:"identity_ref"`
	LifecycleStatus       string `json:"lifecycle_status"`
	CurrentRevisionDigest string `json:"current_revision_digest"`
}

type Head struct {
	SchemaVersion         string              `json:"schema_version"`
	ProjectID             string              `json:"project_id"`
	Generation            uint64              `json:"generation"`
	CanonicalCommitDigest string              `json:"canonical_commit_digest,omitempty"`
	Genes                 map[string]GeneHead `json:"genes"`
}

type ObjectRef struct {
	Kind   string `json:"kind"`
	ID     string `json:"id"`
	Digest string `json:"digest"`
	Ref    string `json:"ref"`
}

type RevisionTransition struct {
	GeneID string  `json:"gene_id"`
	From   *string `json:"from_revision_digest"`
	To     string  `json:"to_revision_digest"`
}

type CanonicalCommit struct {
	SchemaVersion         string               `json:"schema_version"`
	ProjectID             string               `json:"project_id"`
	ExpectedGeneration    uint64               `json:"expected_generation"`
	PublishedGeneration   uint64               `json:"published_generation"`
	PreviousCommitDigest  *string              `json:"previous_commit_digest"`
	Contributions         []ObjectRef          `json:"contributions"`
	CreatedGeneIDs        []string             `json:"created_gene_ids"`
	RevisionTransitions   []RevisionTransition `json:"revision_transitions"`
	InstalledObjects      []ObjectRef          `json:"installed_objects"`
	CanonicalCommitDigest string               `json:"canonical_commit_digest"`
}

type Transaction struct {
	SchemaVersion         string `json:"schema_version"`
	TransactionID         string `json:"transaction_id"`
	ProjectID             string `json:"project_id"`
	ContributionID        string `json:"contribution_id"`
	ContributionDigest    string `json:"contribution_digest"`
	ExpectedGeneration    uint64 `json:"expected_generation"`
	State                 string `json:"state"`
	CanonicalCommitDigest string `json:"canonical_commit_digest,omitempty"`
}

type MaterializeRequest struct {
	ProjectID          string
	ExpectedGeneration uint64
	ExpectedHeadDigest string
	Identity           Identity
	Contribution       Contribution
	Repositories       map[string]string
}

type Receipt struct {
	Status                string `json:"status"`
	ProjectID             string `json:"project_id"`
	ContributionID        string `json:"contribution_id"`
	ContributionDigest    string `json:"contribution_digest"`
	RevisionDigest        string `json:"revision_digest"`
	CanonicalCommitDigest string `json:"canonical_commit_digest"`
	PublishedGeneration   uint64 `json:"published_generation"`
	DurabilityCapability  string `json:"durability_capability"`
}
