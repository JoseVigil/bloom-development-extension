package gravity

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"nucleus/internal/core"
)

// TestLogPriorityCycleFindingsWritesToNucleusGravityStream exercises the
// real core.Logger/TelemetryManager machinery end to end (one test function,
// one shared logger instance): the telemetry manager is a process-wide
// singleton (core.GetTelemetryManager), so this package's test binary must
// not call core.InitLogger more than once against different directories —
// see internal/core/logger_test.go for the same constraint in core's own
// tests.
func TestLogPriorityCycleFindingsWritesToNucleusGravityStream(t *testing.T) {
	dir := t.TempDir()
	paths := &core.Paths{LogsDir: dir, TelemetryDir: dir}
	logger, err := core.InitLogger(paths, "GRAVITY", true)
	if err != nil {
		t.Fatal(err)
	}

	// No findings: this call must not write a confirmed-finding line.
	LogPriorityCycleFindings(logger, nil)

	findings := []PriorityCycleFinding{
		{
			Category:       PriorityCycleCategory,
			Subtype:        PriorityCycleSubtype,
			CollisionClass: strPtr("scope_x"),
			Cycle: []PriorityCycleEdge{
				{Higher: "alpha", Lower: "beta", PostureID: "r1", NodeID: "n1"},
				{Higher: "beta", Lower: "alpha", PostureID: "r2", NodeID: "n2"},
			},
			PostureIDs: []string{"r1", "r2"},
			NodeIDs:    []string{"n1", "n2"},
			DetectedAt: "2026-09-01T00:00:00Z",
		},
	}
	LogPriorityCycleFindings(logger, findings)

	if err := logger.Close(); err != nil {
		t.Fatal(err)
	}

	content := readSoleGravityLogFile(t, dir)

	if !strings.Contains(content, "PRIORITY_CYCLE confirmed:") {
		t.Fatalf("expected a confirmed-finding line, got:\n%s", content)
	}
	if !strings.Contains(content, `"category":"`+PriorityCycleCategory+`"`) {
		t.Fatalf("expected the category in the logged JSON, got:\n%s", content)
	}
	if !strings.Contains(content, `"subtype":"`+PriorityCycleSubtype+`"`) {
		t.Fatalf("expected the subtype in the logged JSON, got:\n%s", content)
	}
	if !strings.Contains(content, `"collisionClass":"scope_x"`) {
		t.Fatalf("expected the collision class in the logged JSON, got:\n%s", content)
	}
	if strings.Count(content, "PRIORITY_CYCLE confirmed:") != 1 {
		t.Fatalf("expected exactly one confirmed-finding line (the empty call must log nothing), got:\n%s", content)
	}
}

func strPtr(s string) *string { return &s }

// readSoleGravityLogFile locates the nucleus_gravity log file written during
// the test. Its filename carries the wall-clock UTC date (not a finding's
// DetectedAt), so it is found by globbing rather than by predicting the name.
func readSoleGravityLogFile(t *testing.T, dir string) string {
	t.Helper()
	matches, err := filepath.Glob(filepath.Join(dir, "nucleus", "nucleus_gravity_*.log"))
	if err != nil {
		t.Fatal(err)
	}
	if len(matches) != 1 {
		t.Fatalf("expected exactly one nucleus_gravity log file, found %v", matches)
	}
	data, err := os.ReadFile(matches[0])
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}
