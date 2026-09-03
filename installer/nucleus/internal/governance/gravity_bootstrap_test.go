package governance

import (
	"encoding/json"
	"nucleus/internal/gravity"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestInitializeOrganizationMasterBootstrapsAndConverges(t *testing.T) {
	root := t.TempDir()
	t.Setenv("BLOOM_NUCLEUS_ROOT", root)
	record, err := initializeOrganization("owner", "Owner", true)
	if err != nil {
		t.Fatal(err)
	}
	bp, err := LoadBlueprint()
	if err != nil || bp.OrgIdentity.OrgID != record.OrgID {
		t.Fatalf("blueprint org_id mismatch: bp=%+v err=%v", bp, err)
	}
	if _, err := initializeOrganization("owner", "Owner", true); err != nil {
		t.Fatalf("convergent retry failed: %v", err)
	}
	store, _ := gravity.NewStore(root)
	if _, err := store.ReadNode(filepath.Join(store.Root, "nucleus.node.json")); err != nil {
		t.Fatal(err)
	}
	if _, err := store.ReadNode(filepath.Join(store.Root, ".organization", record.OrgID, "node.json")); err != nil {
		t.Fatal(err)
	}
}

func TestInitializeOrganizationWithoutMasterStillRejectsRetry(t *testing.T) {
	t.Setenv("BLOOM_NUCLEUS_ROOT", t.TempDir())
	if _, err := initializeOrganization("owner", "Owner", false); err != nil {
		t.Fatal(err)
	}
	if _, err := initializeOrganization("owner", "Owner", false); err == nil {
		t.Fatal("expected non-master retry rejection")
	}
}

func TestBootstrapGravityRejectsIncompatibleNucleus(t *testing.T) {
	root := t.TempDir()
	t.Setenv("BLOOM_NUCLEUS_ROOT", root)
	store, _ := gravity.NewStore(root)
	_ = store.EnsureLayout()
	if err := store.CreateNode(filepath.Join(store.Root, "nucleus.node.json"), gravity.GravityNode{NodeID: "other", NodeType: gravity.NodeNucleus, Status: gravity.NodeActive}); err != nil {
		t.Fatal(err)
	}
	if err := bootstrapGravity("org"); err == nil {
		t.Fatal("expected incompatible NUCLEUS rejection")
	}
}

func TestInitializeOrganizationRejectsDivergentLegacyIDs(t *testing.T) {
	root := t.TempDir()
	t.Setenv("BLOOM_NUCLEUS_ROOT", root)
	ownership := OwnershipRecord{OrgID: "org-a", OwnerID: "owner"}
	if err := SaveOwnership(&ownership); err != nil {
		t.Fatal(err)
	}
	bp := Blueprint{OrgIdentity: OrgIdentity{OrgID: "org-b"}}
	if err := SaveBlueprint(&bp); err != nil {
		t.Fatal(err)
	}
	if _, err := initializeOrganization("owner", "Owner", true); err == nil {
		t.Fatal("expected divergent org_id rejection")
	}
}

func TestBootstrapGravityRejectsIncompatibleOrganization(t *testing.T) {
	root := t.TempDir()
	t.Setenv("BLOOM_NUCLEUS_ROOT", root)
	if err := os.WriteFile(filepath.Join(root, ".master"), []byte("master"), 0600); err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(OwnershipRecord{OrgID: "org", OwnerID: "owner", CreatedAt: testTime()})
	if err := os.WriteFile(filepath.Join(root, ".ownership.json"), raw, 0600); err != nil {
		t.Fatal(err)
	}
	store, _ := gravity.NewStore(root)
	_ = store.EnsureLayout()
	if err := store.CreateNode(filepath.Join(store.Root, "nucleus.node.json"), gravity.GravityNode{NodeID: "nucleus", NodeType: gravity.NodeNucleus, Status: gravity.NodeActive}); err != nil {
		t.Fatal(err)
	}
	badParent := "wrong"
	path := filepath.Join(store.Root, ".organization", "org", "node.json")
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		t.Fatal(err)
	}
	raw, _ = json.Marshal(gravity.GravityNode{NodeID: "org", NodeType: gravity.NodeOrganization, ParentID: &badParent, Status: gravity.NodeActive, NodeVersion: 1})
	if err := os.WriteFile(path, raw, 0644); err != nil {
		t.Fatal(err)
	}
	if err := bootstrapGravity("org"); err == nil {
		t.Fatal("expected incompatible ORGANIZATION rejection")
	}
}

func testTime() time.Time { return time.Date(2026, 9, 3, 0, 0, 0, 0, time.UTC) }
