package gravity

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func projectionStore(t *testing.T) (*Store, string) {
	t.Helper()
	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if err := store.EnsureLayout(); err != nil {
		t.Fatal(err)
	}
	mandatePath := filepath.Join(store.Root, ".organization", "org", ".project", "project", ".mandate", "mandate", "node.json")
	seedGovernedFixture(t, mandatePath, testNode("mandate", NodeMandate, ptr("project")))
	return store, mandatePath
}

func TestStructuralProjectionCreatesNodesAndEdgesIdempotently(t *testing.T) {
	store, mandatePath := projectionStore(t)
	input := StructuralProjectionInput{
		MaterializedAt: "2026-09-02T10:00:00Z",
		Domains:        []DomainProjection{{DomainID: "domain", OriginMandateID: "mandate"}},
		Genes:          []GeneProjection{{GeneID: "gene", MandateID: "mandate", GenePath: ".mandates/mandate/.genes/gene/gen.json"}},
		Edges:          []EdgeProjection{{EdgeType: EdgeDomainGene, DomainID: "domain", TargetID: "gene", Present: true}, {EdgeType: EdgeDomainMandate, DomainID: "domain", TargetID: "mandate", Present: true}},
	}
	first, err := store.reconcileStructuralProjection(input)
	if err != nil {
		t.Fatal(err)
	}
	if len(first.Events) != 4 {
		t.Fatalf("events=%d want 4", len(first.Events))
	}
	domainPath := filepath.Join(filepath.Dir(mandatePath), ".domain", "domain", "node.json")
	genePath := filepath.Join(filepath.Dir(mandatePath), ".gene", "gene", "node.json")
	domain, err := store.ReadNode(domainPath)
	if err != nil {
		t.Fatal(err)
	}
	gene, err := store.ReadNode(genePath)
	if err != nil {
		t.Fatal(err)
	}
	if domain.ParentID == nil || *domain.ParentID != "mandate" || domain.NodeVersion != 1 {
		t.Fatalf("domain=%+v", domain)
	}
	if gene.ParentID == nil || *gene.ParentID != gene.GeneRef.MandateID || gene.NodeVersion != 1 {
		t.Fatalf("gene=%+v", gene)
	}
	edgePath := filepath.Join(store.Root, ".edges", "domain_gene", "domain__gene.json")
	edge, err := readStructuralEdge(edgePath)
	if err != nil {
		t.Fatal(err)
	}
	if edge.EdgeVersion != 1 || edge.MaterializedAt != input.MaterializedAt || edge.CanonicalSource.Selector != "domains/domain/genes/gene" {
		t.Fatalf("edge=%+v", edge)
	}

	infoBefore, err := os.Stat(edgePath)
	if err != nil {
		t.Fatal(err)
	}
	second := input
	second.MaterializedAt = "2026-09-02T11:00:00Z"
	result, err := store.reconcileStructuralProjection(second)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Events) != 0 {
		t.Fatalf("retry emitted events: %+v", result.Events)
	}
	edgeAfter, err := readStructuralEdge(edgePath)
	if err != nil {
		t.Fatal(err)
	}
	infoAfter, err := os.Stat(edgePath)
	if err != nil {
		t.Fatal(err)
	}
	if edgeAfter.EdgeVersion != 1 || edgeAfter.MaterializedAt != input.MaterializedAt || !infoAfter.ModTime().Equal(infoBefore.ModTime()) {
		t.Fatalf("no-op retry mutated edge: before=%v after=%+v", infoBefore.ModTime(), edgeAfter)
	}
	domainAfter, _ := store.ReadNode(domainPath)
	if domainAfter.NodeVersion != 1 || domainAfter.CreatedAt != input.MaterializedAt {
		t.Fatalf("no-op retry mutated domain: %+v", domainAfter)
	}
}

func TestStructuralEdgeFingerprintIsScopedToFact(t *testing.T) {
	active := EdgeProjection{EdgeType: EdgeDomainGene, DomainID: "domain", TargetID: "gene", Present: true}
	same := EdgeProjection{EdgeType: EdgeDomainGene, DomainID: "domain", TargetID: "gene", Present: true}
	absent := EdgeProjection{EdgeType: EdgeDomainGene, DomainID: "domain", TargetID: "gene", Present: false}
	other := EdgeProjection{EdgeType: EdgeDomainGene, DomainID: "domain", TargetID: "other", Present: true}
	if fingerprintFact(active) != fingerprintFact(same) {
		t.Fatal("same fact changed fingerprint")
	}
	if got, want := fingerprintFact(active), "sha256:8de661309601811b76f995f5a6587041f04ae84a9475d88b056cd915eebb448b"; got != want {
		t.Fatalf("canonical fact fingerprint = %q, want %q", got, want)
	}
	if fingerprintFact(active) == fingerprintFact(absent) || fingerprintFact(active) == fingerprintFact(other) {
		t.Fatal("different fact reused fingerprint")
	}
}

func TestStructuralProjectionSupersedesMergeSourceAndEdges(t *testing.T) {
	store, _ := projectionStore(t)
	create := StructuralProjectionInput{MaterializedAt: "2026-09-02T10:00:00Z", Domains: []DomainProjection{{DomainID: "old", OriginMandateID: "mandate"}}, Edges: []EdgeProjection{{EdgeType: EdgeDomainMandate, DomainID: "old", TargetID: "mandate", Present: true}}}
	if _, err := store.reconcileStructuralProjection(create); err != nil {
		t.Fatal(err)
	}
	merge := StructuralProjectionInput{MaterializedAt: "2026-09-02T12:00:00Z", Domains: []DomainProjection{{DomainID: "new", OriginMandateID: "mandate"}}, SupersedeDomainIDs: []string{"old"}, Edges: []EdgeProjection{{EdgeType: EdgeDomainMandate, DomainID: "old", TargetID: "mandate", Present: false}, {EdgeType: EdgeDomainMandate, DomainID: "new", TargetID: "mandate", Present: true}}}
	if _, err := store.reconcileStructuralProjection(merge); err != nil {
		t.Fatal(err)
	}
	oldPath, err := store.findNodePath(NodeDomain, "old")
	if err != nil {
		t.Fatal(err)
	}
	old, _ := store.ReadNode(oldPath)
	if old.Status != NodeSuperseded || old.NodeVersion != 2 {
		t.Fatalf("old=%+v", old)
	}
	oldEdge, err := readStructuralEdge(filepath.Join(store.Root, ".edges", "domain_mandate", "old__mandate.json"))
	if err != nil {
		t.Fatal(err)
	}
	if oldEdge.Status != NodeSuperseded || oldEdge.EdgeVersion != 2 || oldEdge.MaterializedAt != merge.MaterializedAt {
		t.Fatalf("old edge=%+v", oldEdge)
	}
	if _, err := store.findNodePath(NodeDomain, "new"); err != nil {
		t.Fatal(err)
	}
}

func TestStructuralProjectionRejectsChangedOriginAndSemanticGeneStateIsAbsent(t *testing.T) {
	store, _ := projectionStore(t)
	input := StructuralProjectionInput{MaterializedAt: "2026-09-02T10:00:00Z", Domains: []DomainProjection{{DomainID: "domain", OriginMandateID: "mandate"}}}
	if _, err := store.reconcileStructuralProjection(input); err != nil {
		t.Fatal(err)
	}
	secondMandate := filepath.Join(store.Root, ".organization", "org", ".project", "project", ".mandate", "other", "node.json")
	seedGovernedFixture(t, secondMandate, testNode("other", NodeMandate, ptr("project")))
	input.Domains[0].OriginMandateID = "other"
	if _, err := store.reconcileStructuralProjection(input); err == nil {
		t.Fatal("changed origin should be rejected")
	}
	node := testNode("gene", NodeGene, ptr("mandate"))
	node.GeneRef = &GeneRef{MandateID: "mandate", GenePath: ".mandates/mandate/.genes/gene/gen.json"}
	raw, err := json.Marshal(node)
	if err != nil {
		t.Fatal(err)
	}
	for _, forbidden := range []string{"dormant", "orphan", "forked"} {
		if strings.Contains(string(raw), forbidden) {
			t.Fatalf("semantic state %q leaked into Gravity", forbidden)
		}
	}
}
