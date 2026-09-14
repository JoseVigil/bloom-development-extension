package core

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

type recorder struct {
	paths []string
	fail  bool
}

func (r *recorder) Register(path string) error {
	r.paths = append(r.paths, path)
	if r.fail {
		return fmt.Errorf("registration unavailable")
	}
	return nil
}
func TestLogAppendUTCLevelsAndRotation(t *testing.T) {
	dir := t.TempDir()
	now := time.Date(2026, 9, 14, 23, 59, 0, 0, time.UTC)
	reg := &recorder{}
	var console, errors bytes.Buffer
	o := LoggerOptions{LogsDir: dir, Console: &console, Errors: &errors, Now: func() time.Time { return now }, Registrar: reg}
	l, e := NewLogger(o)
	if e != nil {
		t.Fatal(e)
	}
	_ = l.Debug("debug")
	_ = l.Info("info")
	_ = l.Warn("warn")
	_ = l.Error("error")
	_ = l.Success("success")
	now = now.Add(2 * time.Minute)
	if e = l.Info("next day"); e != nil {
		t.Fatal(e)
	}
	if e = l.Close(); e != nil {
		t.Fatal(e)
	}
	if len(reg.paths) != 3 || reg.paths[0] == reg.paths[1] {
		t.Fatal(reg.paths)
	}
	raw, _ := os.ReadFile(filepath.Join(dir, "impact", "impact_core_20260914.log"))
	for _, level := range []string{"DEBUG", "INFO", "WARNING", "ERROR", "SUCCESS"} {
		if !strings.Contains(string(raw), "["+level+"]") {
			t.Fatal(level)
		}
	}
	l, e = NewLogger(o)
	if e != nil {
		t.Fatal(e)
	}
	_ = l.Info("appended")
	_ = l.Close()
	raw, _ = os.ReadFile(filepath.Join(dir, "impact", "impact_core_20260915.log"))
	if !strings.Contains(string(raw), "next day") || !strings.Contains(string(raw), "appended") {
		t.Fatal(string(raw))
	}
}
func TestRegistrationFailureReportedAndRetried(t *testing.T) {
	var errors bytes.Buffer
	reg := &recorder{}
	now := time.Date(2026, 9, 14, 0, 0, 0, 0, time.UTC)
	l, e := NewLogger(LoggerOptions{LogsDir: t.TempDir(), Registrar: reg, Errors: &errors, Now: func() time.Time { return now }})
	if e != nil {
		t.Fatal(e)
	}
	reg.fail = true
	now = now.Add(24 * time.Hour)
	if l.Info("must survive") == nil {
		t.Fatal("failure hidden")
	}
	reg.fail = false
	if e = l.Info("retry"); e != nil {
		t.Fatal(e)
	}
	if errors.Len() == 0 {
		t.Fatal("no error reported")
	}
	_ = l.Close()
}
