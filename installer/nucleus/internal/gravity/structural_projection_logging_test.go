package gravity

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"nucleus/internal/core"
)

func TestStructuralProjectionEventsUseGravityLogNotTelemetryPayload(t *testing.T) {
	dir := t.TempDir()
	logger, err := core.InitLogger(&core.Paths{LogsDir: dir, TelemetryDir: dir}, "GRAVITY", true)
	if err != nil {
		t.Fatal(err)
	}
	LogStructuralProjectionEvents(logger, []StructuralProjectionEvent{{EventType: "STRUCTURAL_PROJECTION_CREATED", ObjectID: "domain", ObjectType: "DOMAIN", Status: "active", Version: 1}})
	if err := logger.Close(); err != nil {
		t.Fatal(err)
	}
	logs, err := filepath.Glob(filepath.Join(dir, "nucleus", "nucleus_gravity_*.log"))
	if err != nil || len(logs) != 1 {
		t.Fatalf("gravity logs=%v err=%v", logs, err)
	}
	logData, err := os.ReadFile(logs[0])
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(logData), "STRUCTURAL_PROJECTION_CREATED") {
		t.Fatalf("event missing from gravity log: %s", logData)
	}
	telemetryData, err := os.ReadFile(filepath.Join(dir, "telemetry.json"))
	if err != nil && !os.IsNotExist(err) {
		t.Fatal(err)
	}
	if strings.Contains(string(telemetryData), "STRUCTURAL_PROJECTION_CREATED") {
		t.Fatal("event payload was written directly to telemetry.json")
	}
	if err == nil && !strings.Contains(string(telemetryData), "nucleus_gravity") {
		t.Fatal("gravity stream was not registered")
	}
}
