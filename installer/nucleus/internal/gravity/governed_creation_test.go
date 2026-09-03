package gravity

import (
	"errors"
	authoritydecision "nucleus/internal/governance/decision"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

func TestCreateGovernedNodeRejectsZeroDecision(t *testing.T) {
	store, _ := NewStore(t.TempDir())
	err := store.CreateGovernedNode(authoritydecision.GovernedCreationDecision{}, testNode("org", NodeOrganization, ptr("nucleus")))
	if !errors.Is(err, ErrInvalidGovernedDecision) {
		t.Fatalf("error = %v, want ErrInvalidGovernedDecision", err)
	}
}

func TestCreateGovernedNodeCreatesOrganizationAtCanonicalPath(t *testing.T) {
	store := governedStore(t)
	decision := authorizeOrganization(t, store, "org")
	if err := store.CreateGovernedNode(decision, testNode("org", NodeOrganization, ptr("nucleus"))); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(store.Root, ".organization", "org", "node.json")
	node, err := store.ReadNode(path)
	if err != nil {
		t.Fatal(err)
	}
	if node.NodeType != NodeOrganization || node.NodeVersion != 1 {
		t.Fatalf("persisted node = %+v", node)
	}

	duplicate := authorizeOrganization(t, store, "other-org")
	err = store.CreateGovernedNode(duplicate, testNode("other-org", NodeOrganization, ptr("nucleus")))
	if !errors.Is(err, ErrOrganizationExists) {
		t.Fatalf("duplicate error = %v, want ErrOrganizationExists", err)
	}
}

func TestCreateGovernedNodeCreatesProjectAndChecksParentVersion(t *testing.T) {
	store := governedStore(t)
	organizationDecision := authorizeOrganization(t, store, "org")
	if err := store.CreateGovernedNode(organizationDecision, testNode("org", NodeOrganization, ptr("nucleus"))); err != nil {
		t.Fatal(err)
	}

	projectDecision := authorizeProject(t, store, "project", "org", 1)
	project := testNode("project", NodeProject, ptr("org"))
	if err := store.CreateGovernedNode(projectDecision, project); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(store.Root, ".organization", "org", ".project", "project", "node.json")
	if _, err := store.ReadNode(path); err != nil {
		t.Fatal(err)
	}

	staleDecision := authorizeProject(t, store, "stale", "org", 1)
	organizationPath := filepath.Join(store.Root, ".organization", "org", "node.json")
	if _, err := store.CompareAndSwap(organizationPath, 1, func(node *GravityNode) error {
		node.CreatedAt = "2026-09-03T01:00:00Z"
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	err := store.CreateGovernedNode(staleDecision, testNode("stale", NodeProject, ptr("org")))
	if err == nil {
		t.Fatal("expected stale parent version rejection")
	}
}

func TestCreateGovernedNodeRejectsDecisionMismatchAndUnsupportedNode(t *testing.T) {
	store := governedStore(t)
	decision := authorizeOrganization(t, store, "org")
	tests := []GravityNode{
		testNode("different", NodeOrganization, ptr("nucleus")),
		testNode("org", NodeProject, ptr("nucleus")),
		testNode("org", NodeMandate, ptr("nucleus")),
	}
	for _, node := range tests {
		if err := store.CreateGovernedNode(decision, node); !errors.Is(err, ErrInvalidGovernedDecision) {
			t.Fatalf("node %+v error = %v, want ErrInvalidGovernedDecision", node, err)
		}
	}

	otherStore, _ := NewStore(t.TempDir())
	if err := otherStore.CreateGovernedNode(decision, testNode("org", NodeOrganization, ptr("nucleus"))); !errors.Is(err, ErrInvalidGovernedDecision) {
		t.Fatalf("root mismatch error = %v, want ErrInvalidGovernedDecision", err)
	}
}

func TestCreateGovernedNodeOrganizationIsSerializedAtTreeLevel(t *testing.T) {
	store := governedStore(t)
	decisions := []authoritydecision.GovernedCreationDecision{
		authorizeOrganization(t, store, "org-a"),
		authorizeOrganization(t, store, "org-b"),
	}
	nodes := []GravityNode{
		testNode("org-a", NodeOrganization, ptr("nucleus")),
		testNode("org-b", NodeOrganization, ptr("nucleus")),
	}
	errs := make(chan error, 2)
	var wg sync.WaitGroup
	for i := range decisions {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			errs <- store.CreateGovernedNode(decisions[i], nodes[i])
		}(i)
	}
	wg.Wait()
	close(errs)
	successes, duplicates := 0, 0
	for err := range errs {
		switch {
		case err == nil:
			successes++
		case errors.Is(err, ErrOrganizationExists):
			duplicates++
		default:
			t.Fatalf("unexpected concurrent error: %v", err)
		}
	}
	if successes != 1 || duplicates != 1 {
		t.Fatalf("successes=%d duplicates=%d, want 1 and 1", successes, duplicates)
	}
}

func governedStore(t *testing.T) *Store {
	t.Helper()
	nucleusRoot := t.TempDir()
	t.Setenv("BLOOM_NUCLEUS_ROOT", nucleusRoot)
	ownership := `{"org_id":"org","owner_id":"owner","owner_name":"Owner","created_at":"` + time.Now().UTC().Format(time.RFC3339Nano) + `","signed_hash":"","team_members":[]}`
	if err := os.WriteFile(filepath.Join(nucleusRoot, ".ownership.json"), []byte(ownership), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(nucleusRoot, ".master"), []byte("master"), 0600); err != nil {
		t.Fatal(err)
	}
	store, err := NewStore(nucleusRoot)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.EnsureLayout(); err != nil {
		t.Fatal(err)
	}
	if err := store.CreateNode(filepath.Join(store.Root, "nucleus.node.json"), testNode("nucleus", NodeNucleus, nil)); err != nil {
		t.Fatal(err)
	}
	return store
}

func authorizeOrganization(t *testing.T, store *Store, nodeID string) authoritydecision.GovernedCreationDecision {
	t.Helper()
	decision, err := authoritydecision.AuthorizeGravityNodeCreation(authoritydecision.OpCreateOrganization, nodeID, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if !sameGravityPath(decision.GravityRoot(), store.Root) {
		t.Fatalf("authorized root %q does not match store %q", decision.GravityRoot(), store.Root)
	}
	return decision
}

func authorizeProject(t *testing.T, store *Store, nodeID, parentID string, version uint64) authoritydecision.GovernedCreationDecision {
	t.Helper()
	decision, err := authoritydecision.AuthorizeGravityNodeCreation(authoritydecision.OpCreateProject, nodeID, &parentID, &version)
	if err != nil {
		t.Fatal(err)
	}
	return decision
}
