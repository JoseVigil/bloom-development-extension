package gravity

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func ptr(value string) *string { return &value }

func testNode(id string, kind NodeType, parent *string) GravityNode {
	return GravityNode{NodeID: id, NodeType: kind, ParentID: parent, GravityPostures: []GravityPosture{}, Status: NodeActive, CreatedAt: "2026-08-29T00:00:00Z"}
}

func TestStoreLayoutCreateAndCAS(t *testing.T) {
	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if err := store.EnsureLayout(); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(store.Root, ".organization", "org", ".project", "project", "node.json")
	if err := store.CreateNode(path, testNode("project", NodeProject, ptr("org"))); err != nil {
		t.Fatal(err)
	}
	version, err := store.CompareAndSwap(path, 1, func(node *GravityNode) error { node.Status = NodeSuperseded; return nil })
	if err != nil {
		t.Fatal(err)
	}
	if version != 2 {
		t.Fatalf("version=%d want 2", version)
	}
	if _, err := store.CompareAndSwap(path, 1, func(*GravityNode) error { return nil }); !errors.Is(err, ErrVersionConflict) {
		t.Fatalf("expected ErrVersionConflict, got %v", err)
	}
}

func TestStoreRejectsPathOutsideGravity(t *testing.T) {
	base := t.TempDir()
	store, _ := NewStore(base)
	if err := store.CreateNode(filepath.Join(base, "outside.json"), testNode("project", NodeProject, ptr("org"))); err == nil {
		t.Fatal("expected path rejection")
	}
}

func TestStoreCreateNodeRejectsOrganizationAndNucleus(t *testing.T) {
	store, _ := NewStore(t.TempDir())
	if err := store.EnsureLayout(); err != nil {
		t.Fatal(err)
	}
	tests := []struct {
		name string
		node GravityNode
		path string
	}{
		{"NUCLEUS", testNode("nucleus", NodeNucleus, nil), filepath.Join(store.Root, "nucleus.node.json")},
		{"ORGANIZATION", testNode("org", NodeOrganization, ptr("nucleus")), filepath.Join(store.Root, ".organization", "org", "node.json")},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := store.CreateNode(tt.path, tt.node)
			if !errors.Is(err, ErrGovernedNodeCreation) {
				t.Fatalf("CreateNode() error = %v, want ErrGovernedNodeCreation", err)
			}
			if got, want := err.Error(), "ORGANIZATION/NUCLEUS node creation requires a governed authorization decision — not yet wired; rejecting by design"; got != want {
				t.Fatalf("error = %q, want %q", got, want)
			}
			if _, statErr := os.Stat(tt.path); !os.IsNotExist(statErr) {
				t.Fatalf("rejected node was persisted: stat error = %v", statErr)
			}
		})
	}
}

func TestStoreCreateNodeRejectsDomainAndGene(t *testing.T) {
	store, _ := NewStore(t.TempDir())
	if err := store.EnsureLayout(); err != nil {
		t.Fatal(err)
	}
	domain := testNode("domain", NodeDomain, ptr("mandate"))
	domain.DomainRef = &DomainRef{SemanticIndexPath: ".cache/.semantic-index.json"}
	gene := testNode("gene", NodeGene, ptr("mandate"))
	gene.GeneRef = &GeneRef{MandateID: "mandate", GenePath: ".mandates/mandate/.genes/gene/gen.json"}
	for _, node := range []GravityNode{domain, gene} {
		err := store.CreateNode(filepath.Join(store.Root, ".test", string(node.NodeType), "node.json"), node)
		if !errors.Is(err, ErrStructuralNodeCreation) {
			t.Fatalf("CreateNode(%s) error = %v", node.NodeType, err)
		}
		if got, want := err.Error(), "DOMAIN/GENE node creation requires a governed structural projection operation — not yet authorized or wired; rejecting by design"; got != want {
			t.Fatalf("error = %q, want %q", got, want)
		}
	}
}

func TestStructuralNodeValidation(t *testing.T) {
	domain := testNode("domain", NodeDomain, ptr("mandate"))
	domain.DomainRef = &DomainRef{SemanticIndexPath: ".cache/.semantic-index.json"}
	if err := validateNode(domain); err != nil {
		t.Fatal(err)
	}
	domain.GravityPostures = []GravityPosture{{PostureID: "forbidden"}}
	if err := validateNode(domain); err == nil {
		t.Fatal("DOMAIN posture should be rejected")
	}

	gene := testNode("gene", NodeGene, ptr("mandate"))
	gene.GeneRef = &GeneRef{MandateID: "other", GenePath: ".mandates/other/.genes/gene/gen.json"}
	if err := validateNode(gene); err == nil {
		t.Fatal("GENE parent mismatch should be rejected")
	}
	gene.GeneRef = &GeneRef{MandateID: "mandate", GenePath: "../escape/gen.json"}
	if err := validateNode(gene); err == nil {
		t.Fatal("GENE escaping path should be rejected")
	}
}

func TestStoreCreateNodeKeepsProjectMandateAndSessionBehavior(t *testing.T) {
	store, _ := NewStore(t.TempDir())
	if err := store.EnsureLayout(); err != nil {
		t.Fatal(err)
	}
	tests := []struct {
		name   string
		parent string
		kind   NodeType
	}{
		{"PROJECT", "org", NodeProject},
		{"MANDATE", "project", NodeMandate},
		{"SESSION", "mandate", NodeSession},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			path := filepath.Join(store.Root, ".test", tt.name, "node.json")
			if err := store.CreateNode(path, testNode(tt.name, tt.kind, ptr(tt.parent))); err != nil {
				t.Fatalf("CreateNode() unexpected error: %v", err)
			}
			node, err := store.ReadNode(path)
			if err != nil {
				t.Fatal(err)
			}
			if node.NodeType != tt.kind || node.NodeVersion != 1 {
				t.Fatalf("persisted node = %+v", node)
			}
		})
	}
}
