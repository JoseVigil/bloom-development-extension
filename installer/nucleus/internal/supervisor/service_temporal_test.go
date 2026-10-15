package supervisor

import (
	"errors"
	"path/filepath"
	"reflect"
	"testing"
	"time"
)

func TestTemporalServerArgsUseDurableDatabase(t *testing.T) {
	logsDir := t.TempDir()
	want := []string{"server", "start-dev", "--db-filename", filepath.Join(logsDir, "temporal", "temporal.db"), "--ui-port", "8233", "--log-format", "pretty", "--log-level", "info"}
	if got := temporalServerArgs(logsDir); !reflect.DeepEqual(got, want) {
		t.Fatalf("temporalServerArgs() = %#v, want %#v", got, want)
	}
}

func TestUTCLogDateUsesUTCAtDayBoundary(t *testing.T) {
	local := time.Date(2026, time.October, 13, 23, 30, 0, 0, time.FixedZone("UTC-3", -3*60*60))
	if got := utcLogDate(local); got != "20261014" {
		t.Fatalf("utcLogDate() = %q, want 20261014", got)
	}
}

func TestSvelteTelemetryUsesApprovedCategories(t *testing.T) {
	want := []string{"nucleus", "conductor"}
	if got := svelteDevTelemetryCategories(); !reflect.DeepEqual(got, want) {
		t.Fatalf("svelteDevTelemetryCategories() = %#v, want %#v", got, want)
	}
}

func TestTelemetryRegistrationFailureIsNonFatal(t *testing.T) {
	previous := telemetryNucleusBinResolver
	telemetryNucleusBinResolver = func(string) (string, error) {
		return "", errors.New("synthetic resolver failure")
	}
	t.Cleanup(func() { telemetryNucleusBinResolver = previous })
	supervisor := NewSupervisor(t.TempDir(), t.TempDir())
	supervisor.registerStream("test_stream", "TEST", filepath.Join(t.TempDir(), "test.log"),
		"test stream", "nucleus", 3, []string{"nucleus"})
}

func TestTemporalServerArgsKeepDatabaseStableAcrossRestarts(t *testing.T) {
	logsDir := t.TempDir()
	first := temporalServerArgs(logsDir)
	second := temporalServerArgs(logsDir)
	if !reflect.DeepEqual(first, second) {
		t.Fatalf("Temporal database arguments changed across restart: first=%#v second=%#v", first, second)
	}
}
