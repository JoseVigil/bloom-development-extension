package core

import (
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestLoggerUsesUTCAndRollsAtUTCMidnight(t *testing.T) {
	dir := t.TempDir()
	resetTelemetryForLoggerTest(dir)
	originalNow := loggerNow
	defer func() { loggerNow = originalNow }()
	current := time.Date(2026, 8, 29, 23, 59, 58, 0, time.FixedZone("local", -3*60*60))
	loggerNow = func() time.Time { return current }
	paths := &Paths{LogsDir: dir, TelemetryDir: dir}
	logger, err := InitLogger(paths, "TEMPORAL", true)
	if err != nil {
		t.Fatal(err)
	}
	logger.Info("before midnight")
	current = time.Date(2026, 8, 30, 0, 0, 1, 0, time.UTC)
	logger.Info("after midnight")
	if err := logger.Close(); err != nil {
		t.Fatal(err)
	}
	oldPath := filepath.Join(dir, "nucleus", "nucleus_temporal_20260830.log")
	// 23:59:58 at UTC-3 is already 2026-08-30 UTC; prove naming follows UTC.
	if _, err := os.Stat(oldPath); err != nil {
		t.Fatalf("UTC-dated file missing: %v", err)
	}
	content, err := os.ReadFile(oldPath)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(content), "2026/08/30 02:59:58") {
		t.Fatalf("UTC timestamp missing: %s", content)
	}

	current = time.Date(2026, 8, 31, 0, 0, 1, 0, time.UTC)
	loggerNow = func() time.Time { return current }
	logger2, err := InitLogger(paths, "ORCHESTRATION", true)
	if err != nil {
		t.Fatal(err)
	}
	current = time.Date(2026, 9, 1, 0, 0, 1, 0, time.UTC)
	logger2.Info("roll")
	if err := logger2.Close(); err != nil {
		t.Fatal(err)
	}
	var data TelemetryData
	readTelemetryForTest(t, filepath.Join(dir, "telemetry.json"), &data)
	stream := data.Streams["nucleus_orchestration"]
	if len(stream.Paths) != 2 {
		t.Fatalf("rollover inventory mismatch: %#v", stream.Paths)
	}
	for _, file := range stream.Paths {
		if file.State == ManagedFileActive || file.ClosedAt == "" {
			t.Fatalf("Close did not finalize managed file: %#v", file)
		}
	}
}

func resetTelemetryForLoggerTest(dir string) {
	telemetryInstance = nil
	once = sync.Once{}
}
