package maintenance

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"metamorph/internal/core"
)

func writeTestJSON(t *testing.T, path string, value any) {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatal(err)
	}
}

func makeOrganizationFixture(t *testing.T, org string) (string, string) {
	t.Helper()
	workspace := t.TempDir()
	nucleus := filepath.Join(workspace, ".bloom", ".nucleus-"+org)
	if err := os.MkdirAll(filepath.Join(nucleus, ".core"), 0o755); err != nil {
		t.Fatal(err)
	}
	writeTestJSON(t, filepath.Join(nucleus, ".ownership.json"), map[string]any{"org_id": "org_1", "owner_id": "owner", "created_at": "2026-01-01T00:00:00Z"})
	writeTestJSON(t, filepath.Join(nucleus, ".core", ".nucleus-config.json"), map[string]any{
		"organization": map[string]any{"slug": org},
		"nucleus":      map[string]any{"path": nucleus, "rootPath": workspace},
	})
	return workspace, nucleus
}

func makeArtifactFixture(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	files := map[string][]byte{"main.js": []byte("console.log('ok')\n"), "main.js.map": []byte("{}\n")}
	manifestFiles := map[string]batcaveArtifactFile{}
	for name, data := range files {
		if err := os.WriteFile(filepath.Join(root, name), data, 0o644); err != nil {
			t.Fatal(err)
		}
		hash := sha256.Sum256(data)
		manifestFiles[name] = batcaveArtifactFile{SHA256: hex.EncodeToString(hash[:]), Size: int64(len(data))}
	}
	writeTestJSON(t, filepath.Join(root, "artifact-manifest.json"), batcaveArtifactManifest{
		SchemaVersion: 1, Component: "batcave", Version: "1.0.0", Build: 7,
		NodeTarget: "node24", ModuleFormat: "esm", PrimaryEntrypoint: "main",
		Entrypoints: map[string]string{"main": "main.js"}, Files: manifestFiles,
	})
	return root
}

func TestValidateBatcaveOrganization(t *testing.T) {
	workspace, nucleus := makeOrganizationFixture(t, "eias-repos")
	resolved, resolvedNucleus, batcave, err := validateBatcaveOrganization(workspace, "eias-repos")
	if err != nil {
		t.Fatal(err)
	}
	if !sameCleanPath(resolved, workspace) || !sameCleanPath(resolvedNucleus, nucleus) || !sameCleanPath(batcave, filepath.Join(nucleus, ".batcave")) {
		t.Fatal("unexpected resolved paths")
	}

	for name, tc := range map[string]struct{ workspace, org, want string }{
		"missing workspace":  {"", "eias-repos", "--workspace"},
		"missing org":        {workspace, "", "--org"},
		"relative workspace": {"relative", "eias-repos", "absolute"},
		"invalid org":        {workspace, "../escape", "invalid organization"},
	} {
		t.Run(name, func(t *testing.T) {
			_, _, _, err := validateBatcaveOrganization(tc.workspace, tc.org)
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("got %v, want %q", err, tc.want)
			}
		})
	}

	writeTestJSON(t, filepath.Join(nucleus, ".core", ".nucleus-config.json"), map[string]any{"organization": map[string]any{"slug": "other"}, "nucleus": map[string]any{"path": nucleus, "rootPath": workspace}})
	if _, _, _, err := validateBatcaveOrganization(workspace, "eias-repos"); err == nil || !strings.Contains(err.Error(), "slug mismatch") {
		t.Fatalf("expected mismatch, got %v", err)
	}
}

func TestValidateBatcaveArtifact(t *testing.T) {
	root := makeArtifactFixture(t)
	manifest, _, err := validateBatcaveArtifact(root, false)
	if err != nil || manifest.Build != 7 {
		t.Fatalf("valid artifact rejected: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "main.js"), []byte("changed"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, _, err := validateBatcaveArtifact(root, false); err == nil || !strings.Contains(err.Error(), "mismatch") {
		t.Fatalf("expected integrity error, got %v", err)
	}
}

func TestValidateBatcaveArtifactRejectsTraversalAndExtraFiles(t *testing.T) {
	root := makeArtifactFixture(t)
	data, _ := os.ReadFile(filepath.Join(root, "artifact-manifest.json"))
	var manifest batcaveArtifactManifest
	_ = json.Unmarshal(data, &manifest)
	manifest.Files["../escape"] = batcaveArtifactFile{SHA256: strings.Repeat("0", 64), Size: 0}
	writeTestJSON(t, filepath.Join(root, "artifact-manifest.json"), manifest)
	if _, _, err := validateBatcaveArtifact(root, false); err == nil || !strings.Contains(err.Error(), "unsafe") {
		t.Fatalf("expected unsafe path error, got %v", err)
	}

	root = makeArtifactFixture(t)
	if err := os.WriteFile(filepath.Join(root, "extra"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, _, err := validateBatcaveArtifact(root, false); err == nil || !strings.Contains(err.Error(), "undeclared") {
		t.Fatalf("expected undeclared error, got %v", err)
	}
}

func TestLegacyLayoutIsPreserved(t *testing.T) {
	root := t.TempDir()
	for _, name := range []string{"main.ts", "README.md", "unknown.user"} {
		if err := os.WriteFile(filepath.Join(root, name), []byte{}, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	legacy := detectBatcaveLegacyLayout(root)
	if !legacy.Detected || len(legacy.Paths) != 2 {
		t.Fatalf("unexpected legacy result: %#v", legacy)
	}
	if _, err := os.Stat(filepath.Join(root, "unknown.user")); err != nil {
		t.Fatal("unknown file was modified")
	}
}

func TestCreateRolloutCommandBatcaveContract(t *testing.T) {
	c, err := core.NewCoreSilent()
	if err != nil {
		t.Fatal(err)
	}
	cmd := createRolloutCommand(c)
	if cmd.Annotations["category"] != "MAINTENANCE" {
		t.Fatal("rollout category changed")
	}
	for _, flag := range []string{"workspace", "org"} {
		if cmd.Flags().Lookup(flag) == nil {
			t.Fatalf("missing --%s", flag)
		}
	}
	if !strings.Contains(cmd.Long, "excluded from a general") || !strings.Contains(cmd.Example, "--only batcave") {
		t.Fatal("Batcave help contract missing")
	}
	if !json.Valid([]byte(cmd.Annotations["json_response"])) {
		t.Fatal("json_response is invalid JSON")
	}
	if err := cmd.Args(cmd, []string{"unexpected"}); err == nil {
		t.Fatal("unexpected positional argument accepted")
	}
}
