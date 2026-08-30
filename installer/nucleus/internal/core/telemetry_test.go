package core

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestStreamInfoMigratesLegacyPathAndEmitsDualContract(t *testing.T) {
	raw := []byte(`{"label":"legacy","path":"C:/logs/legacy.log","priority":2,"categories":["nucleus"],"description":"legacy","first_seen":"2026-08-29T00:00:00Z","last_update":"2026-08-29T01:00:00Z","active":true}`)
	var stream StreamInfo
	if err := json.Unmarshal(raw, &stream); err != nil {
		t.Fatal(err)
	}
	if len(stream.Paths) != 1 || stream.Paths[0].State != ManagedFileActive {
		t.Fatalf("unexpected migrated paths: %#v", stream.Paths)
	}
	out, err := json.Marshal(stream)
	if err != nil {
		t.Fatal(err)
	}
	var wire map[string]json.RawMessage
	if err := json.Unmarshal(out, &wire); err != nil {
		t.Fatal(err)
	}
	if _, ok := wire["paths"]; !ok {
		t.Fatal("new paths contract was not emitted")
	}
	if _, ok := wire["path"]; !ok {
		t.Fatal("legacy path compatibility view was not emitted")
	}
}

func TestRegisterStreamAtomicRollsManagedInventory(t *testing.T) {
	dir := t.TempDir()
	telemetryPath := filepath.Join(dir, "telemetry.json")
	oldPath := filepath.Join(dir, "nucleus_temporal_20260829.log")
	newPath := filepath.Join(dir, "nucleus_temporal_20260830.log")
	if err := os.WriteFile(oldPath, []byte("old-data"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := registerStreamAtomic(telemetryPath, "nucleus_temporal", "TEMPORAL", []string{oldPath}, "test", "nucleus", 2, []string{"nucleus"}, false, false); err != nil {
		t.Fatal(err)
	}
	var first TelemetryData
	readTelemetryForTest(t, telemetryPath, &first)
	firstSeen := first.Streams["nucleus_temporal"].FirstSeen
	if err := os.WriteFile(newPath, []byte("new"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := registerStreamAtomic(telemetryPath, "nucleus_temporal", "TEMPORAL", []string{newPath}, "test", "nucleus", 2, []string{"nucleus"}, false, false); err != nil {
		t.Fatal(err)
	}
	var got TelemetryData
	readTelemetryForTest(t, telemetryPath, &got)
	stream := got.Streams["nucleus_temporal"]
	if stream.FirstSeen != firstSeen {
		t.Fatalf("first_seen changed: %s != %s", stream.FirstSeen, firstSeen)
	}
	if len(stream.Paths) != 2 {
		t.Fatalf("expected two managed files, got %#v", stream.Paths)
	}
	active := 0
	for _, file := range stream.Paths {
		if file.State == ManagedFileActive {
			active++
			if filepath.FromSlash(file.Path) != newPath {
				t.Fatalf("wrong active path: %s", file.Path)
			}
		}
		if file.State == ManagedFileClosed && (file.ClosedAt == "" || file.SizeBytes != int64(len("old-data"))) {
			t.Fatalf("closed metadata incomplete: %#v", file)
		}
	}
	if active != 1 {
		t.Fatalf("expected exactly one active file, got %d", active)
	}
}

func readTelemetryForTest(t *testing.T, path string, target *TelemetryData) {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(raw, target); err != nil {
		t.Fatal(err)
	}
}
