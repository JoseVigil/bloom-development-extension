package gravity

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func seedGovernedFixture(t *testing.T, path string, node GravityNode) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		t.Fatal(err)
	}
	node.NodeVersion = 1
	if err := atomicWriteNode(path, node); err != nil {
		t.Fatal(err)
	}
}

func createResolutionTree(t *testing.T) (*Store, map[string]string) {
	t.Helper()
	store, _ := NewStore(t.TempDir())
	if err := store.EnsureLayout(); err != nil {
		t.Fatal(err)
	}
	paths := map[string]string{
		"nucleus": filepath.Join(store.Root, "nucleus.node.json"),
		"org":     filepath.Join(store.Root, ".organization", "org", "node.json"),
		"project": filepath.Join(store.Root, ".organization", "org", ".project", "project", "node.json"),
		"mandate": filepath.Join(store.Root, ".organization", "org", ".project", "project", ".mandate", "mandate", "node.json"),
		"session": filepath.Join(store.Root, ".organization", "org", ".project", "project", ".mandate", "mandate", ".session", "session", "node.json"),
	}
	nodes := []GravityNode{testNode("nucleus", NodeNucleus, nil), testNode("org", NodeOrganization, ptr("nucleus")), testNode("project", NodeProject, ptr("org")), testNode("mandate", NodeMandate, ptr("project")), testNode("session", NodeSession, ptr("mandate"))}
	for i, key := range []string{"nucleus", "org", "project", "mandate", "session"} {
		nodes[i].GravityPostures = []GravityPosture{{PostureID: key, AppliesTo: []string{"mrg"}, Status: "active", Origin: []PostureOrigin{OriginNucleus, OriginOrganization, OriginProject, OriginMandateOwn, OriginSession}[i]}}
		if nodes[i].NodeType == NodeNucleus || nodes[i].NodeType == NodeOrganization {
			seedGovernedFixture(t, paths[key], nodes[i])
			continue
		}
		if err := store.CreateNode(paths[key], nodes[i]); err != nil {
			t.Fatal(err)
		}
	}
	return store, paths
}

func TestResolveActiveBuildsAndReusesSpineButReadsFreshContent(t *testing.T) {
	store, paths := createResolutionTree(t)
	first, err := store.ResolveActive(ResolveInput{MandateID: "mandate", SessionID: "session", IntentType: "mrg", Turn: 7})
	if err != nil {
		t.Fatal(err)
	}
	if len(first.Collected) != 5 || len(first.Cache.Spine) != 4 || first.Cache.CachedAtTurn != 7 {
		t.Fatalf("unexpected first result: %+v", first)
	}
	_, err = store.CompareAndSwap(paths["project"], 1, func(node *GravityNode) error { node.GravityPostures[0].Status = "superseded"; return nil })
	if err != nil {
		t.Fatal(err)
	}
	second, err := store.ResolveActive(ResolveInput{MandateID: "mandate", SessionID: "session", IntentType: "mrg", Turn: 8, Cache: first.Cache})
	if err != nil {
		t.Fatal(err)
	}
	if len(second.Collected) != 4 {
		t.Fatalf("fresh read collected=%d want 4", len(second.Collected))
	}
	if second.Cache.CachedAtTurn != 7 {
		t.Fatalf("cached_at_turn changed to %d", second.Cache.CachedAtTurn)
	}
}

func TestResolveActiveFiltersIntent(t *testing.T) {
	store, _ := createResolutionTree(t)
	result, err := store.ResolveActive(ResolveInput{MandateID: "mandate", SessionID: "session", IntentType: "tst", Turn: 1})
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Collected) != 0 {
		t.Fatalf("collected=%d want 0", len(result.Collected))
	}
}

func TestReadSpineRejectsStructuralNodeType(t *testing.T) {
	store, paths := createResolutionTree(t)
	node, err := store.ReadNode(paths["project"])
	if err != nil {
		t.Fatal(err)
	}
	node.NodeType = NodeDomain
	node.GravityPostures = []GravityPosture{}
	node.DomainRef = &DomainRef{SemanticIndexPath: ".cache/.semantic-index.json"}
	if err := atomicWriteNode(paths["project"], node); err != nil {
		t.Fatal(err)
	}
	_, err = store.ResolveActive(ResolveInput{MandateID: "mandate", SessionID: "session", IntentType: "mrg", Turn: 1})
	if err == nil || !strings.Contains(err.Error(), "integridad de espina") {
		t.Fatalf("expected structural spine rejection, got %v", err)
	}
}
