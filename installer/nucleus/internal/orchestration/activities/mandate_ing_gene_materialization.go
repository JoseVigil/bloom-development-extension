package activities

import (
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"

	"nucleus/internal/authority"
	"nucleus/internal/core"
	"nucleus/internal/gene"
	"nucleus/internal/orchestration/mandatecontract"
	"nucleus/internal/orchestration/mandatestate"
)

const geneMaterializationReceiptName = "gene-materialization.json"

type MandateINGGeneMaterializationResult struct {
	MandateID      string
	ActionID       string
	IntentID       string
	ContractDigest string
	ReceiptRef     string
	ReceiptDigest  string
	GeneIDs        []string
}

type MandateINGGeneMaterializationActivity struct {
	IdentityPath string
	AppDataDir   string
	Now          func() time.Time
}

type acceptedINGContribution struct {
	ClusterID      string            `json:"cluster_id"`
	ContributionID string            `json:"contribution_id"`
	DecisionID     string            `json:"decision_id"`
	GeneID         string            `json:"gene_id"`
	HumanDecision  string            `json:"human_decision"`
	ProjectID      string            `json:"project_id"`
	Contribution   gene.Contribution `json:"contribution"`
	Identity       gene.Identity     `json:"identity"`
}

type acceptedINGResult struct {
	SchemaVersion         string                    `json:"schema_version"`
	Status                string                    `json:"status"`
	MandateID             string                    `json:"mandate_id"`
	IntentID              string                    `json:"intent_id"`
	AcceptedContributions []acceptedINGContribution `json:"accepted_contributions"`
	RejectedClusters      []json.RawMessage         `json:"rejected_clusters"`
}

type ingDecisionJournal struct {
	ActionID             string `json:"actionId"`
	ContractDigest       string `json:"contractDigest"`
	IntentID             string `json:"intentId"`
	ClassificationDigest string `json:"classificationDigest"`
	DecisionDigest       string `json:"decisionDigest"`
	Decisions            []struct {
		ClusterID     string `json:"cluster_id"`
		HumanDecision string `json:"human_decision"`
	} `json:"decisions"`
}

type ingMaterializationAuthority struct {
	Identity *authority.LocalIdentity
	State    *authority.DurableState
	Decision authority.AuthorityDecision
}

// Run materializes only already accepted, human-ratified ING contributions.
// The local Authority identity signs the bridge because Backend currently has
// no remote gene-ratification endpoint; every signature is still checked by
// Gene's verifier and bound to the accepted, current Authority emission.
func (a *MandateINGGeneMaterializationActivity) Run(ctx context.Context, input MandateIntentInput) (MandateINGGeneMaterializationResult, error) {
	var result MandateINGGeneMaterializationResult
	if ctx == nil || ctx.Err() != nil || input.MandateID == "" || filepath.Base(input.MandateID) != input.MandateID || input.MandatesRoot == "" || a.IdentityPath == "" {
		return result, errors.New("invalid ING Gene materialization request")
	}
	appDataDir := a.AppDataDir
	if appDataDir == "" {
		appDataDir = core.ResolveAppDataDir()
	}
	mandateDir := filepath.Join(input.MandatesRoot, input.MandateID)
	envelope, err := mandatecontract.LoadVerified(mandateDir, a.IdentityPath)
	if err != nil || envelope.Contract.ContractVersion != 4 || envelope.Contract.MandateID != input.MandateID {
		return result, errors.New("signed ING Gene materialization contract invalid")
	}
	ingAction, actionIndex, err := uniqueSignedAction(envelope.Contract.Actions, "ing")
	if err != nil || (input.INGActionID != "" && input.INGActionID != ingAction.ActionID) || actionIndex+1 >= len(envelope.Contract.Actions) {
		return result, errors.New("signed ING Action invalid for Gene materialization")
	}
	docAction := envelope.Contract.Actions[actionIndex+1]
	if docAction.IntentType != "doc" || len(docAction.DependsOn) != 1 || docAction.DependsOn[0] != ingAction.ActionID ||
		(input.ActionID != "" && input.ActionID != docAction.ActionID) {
		return result, errors.New("signed DOC dependency invalid for Gene materialization")
	}
	identity, err := authority.LoadExistingLocalIdentity(a.IdentityPath)
	if err != nil {
		return result, fmt.Errorf("verified local Authority identity unavailable: %w", err)
	}
	roots := authority.DevelopmentPinnedRoots()
	var actorPrincipalID string
	for _, operation := range []string{"approve", "activate"} {
		receipt, loadErr := mandatecontract.LoadActReceipt(mandateDir, operation)
		if loadErr != nil {
			return result, fmt.Errorf("verified %s receipt required for Gene ratification: %w", operation, loadErr)
		}
		if verifyErr := mandatecontract.VerifyActReceipt(receipt, identity, roots, operation, input.MandateID, envelope.ContractDigest, envelope.Contract.ProjectID); verifyErr != nil || receipt.OrganizationID != envelope.Contract.OrganizationID {
			return result, fmt.Errorf("verified %s receipt invalid for Gene ratification", operation)
		}
		if actorPrincipalID != "" && actorPrincipalID != receipt.Decision.PrincipalID {
			return result, errors.New("Mandate approval and activation actors differ")
		}
		actorPrincipalID = receipt.Decision.PrincipalID
	}
	ctxAuthority, err := loadINGMaterializationAuthority(appDataDir, identity, actorPrincipalID, envelope.Contract.ProjectID, envelope.Contract.OrganizationID, a.now())
	if err != nil {
		return result, err
	}
	statePath := filepath.Join(mandateDir, "mandate_state.json")
	stateRaw, err := os.ReadFile(statePath)
	if err != nil {
		return result, err
	}
	var state struct {
		MandateID   string `json:"mandateId"`
		ProjectID   string `json:"projectId"`
		Preparation *struct {
			ContractDigest string   `json:"contractDigest"`
			SourceFiles    []string `json:"sourceFiles"`
		} `json:"preparation"`
		Adoption struct {
			ContractDigest string `json:"contractDigest"`
		} `json:"adoption"`
		Actions map[string]struct {
			IntentID              string `json:"intentId"`
			Status                string `json:"status"`
			ResultRef             string `json:"resultRef"`
			ResultSHA             string `json:"resultSha256"`
			LedgerRef             string `json:"ledgerRef"`
			LedgerSHA             string `json:"ledgerSha256"`
			DecisionDigest        string `json:"decisionDigest"`
			MaterializationRef    string `json:"geneMaterializationReceiptRef"`
			MaterializationDigest string `json:"geneMaterializationReceiptDigest"`
		} `json:"actions"`
		INGDecision ingDecisionJournal `json:"ingDecision"`
	}
	if json.Unmarshal(stateRaw, &state) != nil || state.MandateID != input.MandateID || state.ProjectID != envelope.Contract.ProjectID ||
		!boundJournal(stateRaw, envelope.ContractDigest) || state.Preparation == nil || state.Preparation.ContractDigest != envelope.ContractDigest || len(state.Preparation.SourceFiles) == 0 {
		return result, errors.New("prepared ING materialization journal binding invalid")
	}
	ing := state.Actions[ingAction.ActionID]
	if ing.Status != "completed" || ing.IntentID == "" || ing.ResultSHA == "" || ing.LedgerSHA == "" || ing.DecisionDigest == "" ||
		state.INGDecision.ActionID != ingAction.ActionID || state.INGDecision.ContractDigest != envelope.ContractDigest || state.INGDecision.IntentID != ing.IntentID ||
		state.INGDecision.DecisionDigest != ing.DecisionDigest {
		return result, errors.New("completed ING evidence is not bound to the signed Action")
	}
	nucleusRoot := resolveNucleusRootFromMandatesRoot(input.MandatesRoot)
	intentRoot, foundIntentID, err := findAdoptedING(nucleusRoot, input.MandateID)
	if err != nil || foundIntentID != ing.IntentID || intentRoot == "" {
		return result, errors.New("adopted ING Intent binding invalid")
	}
	if filepath.Clean(ing.ResultRef) != filepath.Join(intentRoot, "ing_result.json") || filepath.Clean(ing.LedgerRef) != filepath.Join(intentRoot, ".consolidation", ".turn_1", ".effect_ledger.json") {
		return result, errors.New("persisted ING result or ledger path is not canonical")
	}
	resultBytes, err := os.ReadFile(ing.ResultRef)
	if err != nil {
		return result, err
	}
	resultSum := sha256.Sum256(resultBytes)
	if hex.EncodeToString(resultSum[:]) != ing.ResultSHA {
		return result, errors.New("persisted ING result digest changed")
	}
	var ingResult acceptedINGResult
	if json.Unmarshal(resultBytes, &ingResult) != nil || ingResult.SchemaVersion != "bloom.ing-result/v1" || ingResult.Status != "done" ||
		ingResult.MandateID != input.MandateID || ingResult.IntentID != ing.IntentID || len(ingResult.AcceptedContributions) == 0 || len(ingResult.RejectedClusters) != 0 {
		return result, errors.New("completed ING accepted contributions invalid")
	}
	var checkedResult map[string]any
	if json.Unmarshal(resultBytes, &checkedResult) != nil {
		return result, errors.New("completed ING result invalid")
	}
	ledgerBytes, err := os.ReadFile(ing.LedgerRef)
	if err != nil {
		return result, err
	}
	ledgerSum := sha256.Sum256(ledgerBytes)
	if hex.EncodeToString(ledgerSum[:]) != ing.LedgerSHA || verifyINGEffectLedger(ledgerBytes, checkedResult, ing.IntentID) != nil {
		return result, errors.New("persisted ING effect ledger invalid")
	}
	decisionDigest, err := canonicalDecisionDigest(state.INGDecision.Decisions)
	if err != nil || decisionDigest != state.INGDecision.DecisionDigest {
		return result, errors.New("persisted ING human decision digest changed")
	}
	decisions := make(map[string]string, len(state.INGDecision.Decisions))
	for _, decision := range state.INGDecision.Decisions {
		if decision.ClusterID == "" || (decision.HumanDecision != "approved" && decision.HumanDecision != "overridden") || decisions[decision.ClusterID] != "" {
			return result, errors.New("persisted ING human decisions invalid")
		}
		decisions[decision.ClusterID] = decision.HumanDecision
	}
	projectPath, err := resolvePreparedProject(nucleusRoot, state.ProjectID, state.Preparation.SourceFiles, envelope.Contract.Inputs)
	if err != nil {
		return result, err
	}
	repositories := &authority.RepositoryBindingStore{Path: filepath.Join(core.ResolveAppDataDir(), "authority", "repository-bindings.json")}
	geneVerifier := authority.GeneRatificationVerifier{
		TrustedKeys: map[string]ed25519.PublicKey{identity.InstallationID: identity.PublicKey},
	}
	store := &gene.Store{Root: nucleusRoot, RepositoryResolver: repositories, RatificationVerifier: geneVerifier}
	inputs, err := prepareINGGeneMaterializationInputs(mandateDir, envelope.ContractDigest, envelope.Contract, ingAction.ActionID, ing.IntentID,
		state.INGDecision.DecisionDigest, ing.ResultSHA, ing.LedgerSHA, projectPath, ingResult, decisions, ctxAuthority, repositories, geneVerifier)
	if err != nil {
		return result, err
	}
	evidencePath := filepath.Join(mandateDir, "evidence", geneMaterializationReceiptName)
	batch, err := store.MaterializeRatifiedINGBatch(inputs, evidencePath)
	if err != nil {
		return result, fmt.Errorf("materialize ratified ING Gene batch: %w", err)
	}
	if batch.SchemaVersion != gene.INGMaterializationBatchReceiptSchema || len(batch.Materializations) != len(inputs) {
		return result, errors.New("ING Gene batch receipt incomplete")
	}
	if err = persistINGGeneMaterializationReceipt(statePath, envelope.ContractDigest, ingAction.ActionID, ing.ResultSHA, ing.LedgerSHA,
		state.INGDecision.DecisionDigest, ing.IntentID, evidencePath, batch.ReceiptDigest); err != nil {
		return result, err
	}
	geneIDs := make([]string, len(inputs))
	for i := range inputs {
		geneIDs[i] = inputs[i].Binding.GeneID
	}
	return MandateINGGeneMaterializationResult{MandateID: input.MandateID, ActionID: ingAction.ActionID, IntentID: ing.IntentID,
		ContractDigest: envelope.ContractDigest, ReceiptRef: evidencePath, ReceiptDigest: batch.ReceiptDigest, GeneIDs: geneIDs}, nil
}

func (a *MandateINGGeneMaterializationActivity) now() time.Time {
	if a.Now != nil {
		return a.Now().UTC()
	}
	return time.Now().UTC()
}

func loadINGMaterializationAuthority(appDataDir string, identity *authority.LocalIdentity, principalID, projectID, organizationID string, now time.Time) (ingMaterializationAuthority, error) {
	if identity == nil || appDataDir == "" || principalID == "" || projectID == "" || organizationID == "" || now.IsZero() {
		return ingMaterializationAuthority{}, errors.New("current Authority context required for Gene ratification")
	}
	authorityDir := filepath.Join(appDataDir, "authority")
	store := &authority.Store{Path: filepath.Join(authorityDir, "state.json")}
	checkpoint := &authority.CheckpointStore{Path: filepath.Join(authorityDir, "checkpoint.json")}
	state, err := store.Load()
	if err != nil || state.Binding.InstallationID != identity.InstallationID || state.Binding.OrganizationID != organizationID ||
		state.Emission == nil || now.Before(state.Emission.NotBefore) || !now.Before(state.Emission.ExpiresAt) {
		return ingMaterializationAuthority{}, errors.New("current accepted Authority state/emission unavailable")
	}
	if state.Monotonic.StateDigest == "" || state.Emission.AuthorityVersion != state.Monotonic.HighWaterMark {
		return ingMaterializationAuthority{}, errors.New("current Authority state/emission binding invalid")
	}
	decision := (authority.DecisionEvaluator{Store: store, Checkpoint: checkpoint}).Evaluate(authority.DecisionRequest{
		Operation: authority.PermissionGeneContributionRatify, PrincipalID: principalID, Scope: authority.Scope{Type: "project", ID: projectID}, At: now,
	})
	if decision.Outcome != authority.DecisionAllow || decision.Operation != authority.PermissionGeneContributionRatify || decision.PrincipalID != principalID ||
		decision.Scope != (authority.Scope{Type: "project", ID: projectID}) || decision.AuthorityVersion != state.Monotonic.HighWaterMark || decision.StateDigest != state.Monotonic.StateDigest {
		return ingMaterializationAuthority{}, fmt.Errorf("Authority denied Gene ratification: %s", decision.Reason)
	}
	digestBytes, err := base64.RawURLEncoding.DecodeString(state.Monotonic.StateDigest)
	if err != nil || len(digestBytes) != sha256.Size {
		return ingMaterializationAuthority{}, errors.New("accepted Authority state digest is invalid")
	}
	state.Monotonic.StateDigest = "sha256:" + hex.EncodeToString(digestBytes)
	return ingMaterializationAuthority{Identity: identity, State: state, Decision: decision}, nil
}

func prepareINGGeneMaterializationInputs(mandateDir, contractDigest string, contract mandatecontract.Contract, actionID, intentID, decisionDigest, resultDigest, ledgerDigest, projectPath string,
	result acceptedINGResult, decisions map[string]string, ctxAuthority ingMaterializationAuthority, repositories *authority.RepositoryBindingStore,
	verifier authority.GeneRatificationVerifier) ([]gene.INGMaterializationInput, error) {
	if repositories == nil || ctxAuthority.Identity == nil || ctxAuthority.State == nil || ctxAuthority.State.Emission == nil ||
		ctxAuthority.Decision.Outcome != authority.DecisionAllow || ctxAuthority.Decision.PrincipalID == "" ||
		contract.ProjectID == "" ||
		len(result.AcceptedContributions) == 0 || result.MandateID != contract.MandateID || result.IntentID == "" ||
		resultDigest == "" || ledgerDigest == "" || decisionDigest == "" || actionID == "" || intentID != result.IntentID || projectPath == "" {
		return nil, errors.New("ING Gene batch authority or contract binding invalid")
	}
	if contract.OrganizationID != ctxAuthority.State.Binding.OrganizationID || ctxAuthority.State.Emission.AuthorityVersion != ctxAuthority.State.Monotonic.HighWaterMark {
		return nil, errors.New("ING Gene batch Authority scope mismatch")
	}
	decisionByCluster := make(map[string]string, len(decisions))
	for cluster, decision := range decisions {
		if cluster == "" || (decision != "approved" && decision != "overridden") {
			return nil, errors.New("ING Gene batch human decision invalid")
		}
		decisionByCluster[cluster] = decision
	}
	inputsByRef := make(map[string]mandatecontract.Input, len(contract.Inputs))
	for _, input := range contract.Inputs {
		if !strings.HasPrefix(filepath.ToSlash(input.Ref), "inputs/") || input.SHA256 == "" || input.Size < 0 {
			return nil, errors.New("signed Mandate input reference invalid")
		}
		inputsByRef[filepath.Clean(filepath.Join(mandateDir, filepath.FromSlash(input.Ref)))] = input
	}
	inputs := make([]gene.INGMaterializationInput, 0, len(result.AcceptedContributions))
	seenContributions, seenGenes, seenClusters := map[string]bool{}, map[string]bool{}, map[string]bool{}
	for _, accepted := range result.AcceptedContributions {
		if accepted.ProjectID != contract.ProjectID || accepted.Contribution.ProjectID != contract.ProjectID || accepted.Identity.ProjectID != contract.ProjectID ||
			accepted.Contribution.MandateID != contract.MandateID || accepted.Contribution.IntentID != intentID || accepted.Identity.Origin.MandateID != contract.MandateID ||
			accepted.Identity.Origin.IntentID != intentID || accepted.ContributionID == "" || accepted.GeneID == "" || accepted.DecisionID == "" ||
			accepted.Contribution.ContributionID != accepted.ContributionID || accepted.Contribution.GeneID != accepted.GeneID || accepted.Identity.GeneID != accepted.GeneID ||
			accepted.Contribution.Ratification.DecisionID != accepted.DecisionID || accepted.Identity.Origin.DecisionID != accepted.DecisionID ||
			accepted.HumanDecision != decisionByCluster[accepted.ClusterID] || (accepted.HumanDecision != "approved" && accepted.HumanDecision != "overridden") ||
			seenContributions[accepted.ContributionID] || seenGenes[accepted.GeneID] || seenClusters[accepted.ClusterID] {
			return nil, errors.New("accepted ING contribution is not uniquely bound to human decision")
		}
		seenContributions[accepted.ContributionID], seenGenes[accepted.GeneID], seenClusters[accepted.ClusterID] = true, true, true
		contribution := accepted.Contribution
		contribution.SchemaVersion = gene.SchemaVersion
		contribution.DeclaredFunction = accepted.Identity.Function
		contribution.Ratification = gene.RatificationEvidence{Classification: "productive", Synthetic: false, Productive: true, DecisionID: accepted.DecisionID}
		if contribution.StableProvenance == nil {
			contribution.StableProvenance = map[string]string{}
		}
		contribution.StableProvenance["cluster_id"] = accepted.ClusterID
		contribution.StableProvenance["human_decision"] = accepted.HumanDecision
		if accepted.Identity.Function == "" || len(contribution.Assets) == 0 {
			return nil, errors.New("accepted ING contribution identity or assets missing")
		}
		for i := range contribution.Assets {
			asset := &contribution.Assets[i]
			if asset.ProjectID != contract.ProjectID || asset.RepositoryID == "" {
				return nil, errors.New("accepted ING asset project or repository binding missing")
			}
			frozenPath := filepath.Clean(asset.RepositoryRelativePath)
			contractInput, ok := inputsByRef[frozenPath]
			if !ok || !filepath.IsAbs(asset.RepositoryRelativePath) || !isWithin(filepath.Join(mandateDir, "inputs"), frozenPath) {
				return nil, errors.New("ING asset does not resolve to an exact signed frozen input")
			}
			relInput, relErr := filepath.Rel(mandateDir, frozenPath)
			if relErr != nil || filepath.ToSlash(relInput) != filepath.ToSlash(contractInput.Ref) || !strings.HasPrefix(filepath.ToSlash(relInput), "inputs/") {
				return nil, errors.New("ING frozen input path differs from signed Mandate input")
			}
			inputHash, inputSize, verifyErr := fileSHA256AndSize(frozenPath)
			if verifyErr != nil || inputHash != contractInput.SHA256 || inputSize != contractInput.Size {
				return nil, errors.New("frozen ING input does not match signed Mandate SHA-256")
			}
			canonicalRel := strings.TrimPrefix(filepath.ToSlash(contractInput.Ref), "inputs/")
			if canonicalRel == "" || canonicalRel == "." || strings.HasPrefix(canonicalRel, "../") || filepath.IsAbs(canonicalRel) {
				return nil, errors.New("signed input has no safe repository-relative path")
			}
			root, _, resolveErr := repositories.ResolveRepository(contract.ProjectID, asset.RepositoryID)
			if resolveErr != nil || !samePath(root, projectPath) {
				return nil, errors.New("Authority repository binding does not resolve to the prepared project")
			}
			actualPath := filepath.Join(root, filepath.FromSlash(canonicalRel))
			if !isWithin(root, actualPath) {
				return nil, errors.New("canonical repository asset escaped bound root")
			}
			actualHash, actualSize, actualErr := fileSHA256AndSize(actualPath)
			if actualErr != nil || actualHash != contractInput.SHA256 || actualSize != contractInput.Size || actualHash != inputHash || actualSize != inputSize {
				return nil, errors.New("repository asset does not match signed Mandate SHA-256")
			}
			asset.RepositoryRelativePath = filepath.ToSlash(canonicalRel)
			asset.Observed = gene.ObservedAsset{SHA256: "sha256:" + actualHash, SizeBytes: actualSize}
			asset.AssetID = ""
		}
		resolvedAssets, _, err := gene.ResolveAuthorizedAssets(contract.ProjectID, contribution.Assets, repositories)
		if err != nil {
			return nil, fmt.Errorf("resolve authorized ING assets: %w", err)
		}
		contribution.Assets = resolvedAssets
		sort.Slice(contribution.Assets, func(i, j int) bool { return contribution.Assets[i].AssetID < contribution.Assets[j].AssetID })
		contribution.ContributionDigest = ""
		contributionDigest, err := canonicalGeneContributionDigest(contribution)
		if err != nil {
			return nil, err
		}
		contribution.ContributionDigest = contributionDigest
		repositoryIDs := sortedUniqueAssetRepositoryIDs(contribution.Assets)
		if len(repositoryIDs) == 0 {
			return nil, errors.New("ING contribution repository ids are missing")
		}
		payload := authority.GeneRatificationPayload{SchemaVersion: "bloom.gene-ratification/v1", Issuer: ctxAuthority.State.Binding.Issuer,
			KeyID: ctxAuthority.Identity.InstallationID, Permission: authority.PermissionGeneContributionRatify, PrincipalID: ctxAuthority.Decision.PrincipalID,
			ProjectID: contract.ProjectID, GeneID: accepted.GeneID, ContributionID: accepted.ContributionID, ContributionDigest: contributionDigest,
			MandateID: contract.MandateID, IntentID: intentID, DecisionID: accepted.DecisionID, RepositoryIDs: repositoryIDs,
			AuthorityVersion: ctxAuthority.Decision.AuthorityVersion, AuthorityStateDigest: ctxAuthority.State.Monotonic.StateDigest,
			ControlRevisions: sortedUnique(ctxAuthority.Decision.ControlRevisions), Outcome: "ratified", DecidedAt: ctxAuthority.Decision.EvaluatedAt.UTC()}
		if payload.ControlRevisions == nil {
			payload.ControlRevisions = []string{}
		}
		envelopeRaw, signErr := authority.SignGeneRatification(payload, ctxAuthority.Identity.PrivateKey)
		if signErr != nil {
			return nil, fmt.Errorf("sign local Authority Gene ratification: %w", signErr)
		}
		if _, verifyErr := verifier.VerifyGeneRatification(envelopeRaw, contract.ProjectID, accepted.GeneID, accepted.ContributionID, contributionDigest,
			contract.MandateID, intentID, accepted.DecisionID, repositoryIDs); verifyErr != nil {
			return nil, fmt.Errorf("verify local Authority Gene ratification: %w", verifyErr)
		}
		binding := gene.INGMaterializationBinding{ProjectID: contract.ProjectID, GeneID: accepted.GeneID, ContributionID: accepted.ContributionID,
			MandateID: contract.MandateID, ContractDigest: strings.TrimPrefix(contractDigest, "sha256:"), INGActionID: actionID, IntentID: intentID,
			DecisionID: accepted.DecisionID, DecisionDigest: strings.TrimPrefix(decisionDigest, "sha256:"), HumanDecision: accepted.HumanDecision,
			INGResultDigest: strings.TrimPrefix(resultDigest, "sha256:"), INGLedgerDigest: strings.TrimPrefix(ledgerDigest, "sha256:")}
		inputs = append(inputs, gene.INGMaterializationInput{Binding: binding, Request: gene.MaterializeRequest{ProjectID: contract.ProjectID, Identity: accepted.Identity,
			Contribution: contribution, WorkspaceEffect: gene.WorkspaceEffectNone, RatificationEnvelope: envelopeRaw}})
	}
	if len(seenClusters) != len(decisionByCluster) {
		return nil, errors.New("ING accepted contributions do not cover the persisted human decisions")
	}
	return inputs, nil
}

func sortedUniqueAssetRepositoryIDs(assets []gene.AssetRef) []string {
	unique := make(map[string]struct{}, len(assets))
	for _, asset := range assets {
		if asset.RepositoryID != "" {
			unique[asset.RepositoryID] = struct{}{}
		}
	}
	repositoryIDs := make([]string, 0, len(unique))
	for repositoryID := range unique {
		repositoryIDs = append(repositoryIDs, repositoryID)
	}
	sort.Strings(repositoryIDs)
	return repositoryIDs
}

func canonicalGeneContributionDigest(contribution gene.Contribution) (string, error) {
	raw, err := json.Marshal(contribution)
	if err != nil {
		return "", err
	}
	var payload map[string]any
	if err = json.Unmarshal(raw, &payload); err != nil {
		return "", err
	}
	delete(payload, "contribution_digest")
	canonical, err := authority.Canonicalize(rawObject(payload))
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(canonical)
	return "sha256:" + hex.EncodeToString(sum[:]), nil
}

func rawObject(value any) []byte {
	raw, _ := json.Marshal(value)
	return raw
}

func fileSHA256AndSize(path string) (string, int64, error) {
	info, err := os.Lstat(path)
	if err != nil || !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 {
		return "", 0, errors.New("asset is not a regular file")
	}
	file, err := os.Open(path)
	if err != nil {
		return "", 0, err
	}
	hash := sha256.New()
	size, copyErr := io.Copy(hash, file)
	closeErr := file.Close()
	if copyErr != nil {
		return "", 0, copyErr
	}
	if closeErr != nil {
		return "", 0, closeErr
	}
	return hex.EncodeToString(hash.Sum(nil)), size, nil
}

func samePath(a, b string) bool {
	left, leftErr := filepath.Abs(filepath.Clean(a))
	right, rightErr := filepath.Abs(filepath.Clean(b))
	if leftErr != nil || rightErr != nil {
		return false
	}
	if runtime.GOOS == "windows" {
		return strings.EqualFold(left, right)
	}
	return left == right
}

func canonicalDecisionDigest(value any) (string, error) {
	raw, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	canonical, err := authority.Canonicalize(raw)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(canonical)
	return hex.EncodeToString(sum[:]), nil
}

func persistINGGeneMaterializationReceipt(statePath, contractDigest, actionID, resultDigest, ledgerDigest, decisionDigest, intentID, receiptRef, receiptDigest string) error {
	_, err := mandatestate.Mutate(statePath, func(state map[string]interface{}) (bool, error) {
		stateRaw, marshalErr := json.Marshal(state)
		if marshalErr != nil || !boundJournal(stateRaw, contractDigest) {
			return false, errors.New("ING Gene receipt journal binding changed")
		}
		actions, ok := state["actions"].(map[string]interface{})
		if !ok {
			return false, errors.New("Mandate action journal missing")
		}
		action, ok := actions[actionID].(map[string]interface{})
		if !ok || action["status"] != "completed" || action["intentId"] != intentID || action["resultSha256"] != resultDigest ||
			action["ledgerSha256"] != ledgerDigest || action["decisionDigest"] != decisionDigest {
			return false, errors.New("completed ING action changed before Gene receipt persistence")
		}
		if existingRef, exists := action["geneMaterializationReceiptRef"]; exists && existingRef != nil {
			if existingRef != receiptRef || action["geneMaterializationReceiptDigest"] != receiptDigest {
				return false, errors.New("ING Gene materialization receipt binding conflict")
			}
			return false, nil
		}
		action["geneMaterializationReceiptRef"] = receiptRef
		action["geneMaterializationReceiptDigest"] = receiptDigest
		return true, nil
	})
	return err
}

func sha256Prefixed(raw []byte) string {
	sum := sha256.Sum256(raw)
	return "sha256:" + hex.EncodeToString(sum[:])
}

func isWithin(root, candidate string) bool {
	rel, err := filepath.Rel(root, candidate)
	return err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) && !filepath.IsAbs(rel)
}

func sortedUnique(values []string) []string {
	copyValues := append([]string(nil), values...)
	sort.Strings(copyValues)
	for i := 1; i < len(copyValues); i++ {
		if copyValues[i] == copyValues[i-1] {
			return nil
		}
	}
	return copyValues
}
