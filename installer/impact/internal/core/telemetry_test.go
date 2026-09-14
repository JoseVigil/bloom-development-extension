package core

import (
	"bytes"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"
	"time"
)

func TestRealNucleusRegistrationAndHistoricalRotation(t *testing.T) {
	dir := t.TempDir()
	name := "nucleus"
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	bin := filepath.Join(dir, name)
	build := exec.Command("go", "build", "-o", bin, ".")
	build.Dir = filepath.Join("..", "..", "..", "nucleus")
	if raw, e := build.CombinedOutput(); e != nil {
		t.Fatalf("build real Nucleus: %v\n%s", e, raw)
	}
	paths := Paths{AppDataDir: dir, LogsDir: filepath.Join(dir, "logs"), NucleusBin: bin}
	now := time.Date(2026, 9, 14, 23, 59, 0, 0, time.UTC)
	var stderr bytes.Buffer
	l, e := NewLogger(LoggerOptions{LogsDir: paths.LogsDir, Registrar: NucleusRegistrar{paths}, Errors: &stderr, Now: func() time.Time { return now }})
	if e != nil {
		t.Fatal(e)
	}
	read := func() map[string]any {
		raw, e := os.ReadFile(filepath.Join(paths.LogsDir, "telemetry.json"))
		if e != nil {
			t.Fatal(e)
		}
		var data map[string]any
		if e = json.Unmarshal(raw, &data); e != nil {
			t.Fatal(e)
		}
		return data["active_streams"].(map[string]any)["impact_core"].(map[string]any)
	}
	first := read()
	if first["source"] != "impact" || first["label"] != "IMPACT CORE" {
		t.Fatal(first)
	}
	now = now.Add(2 * time.Minute)
	if e = l.Info("rotated"); e != nil {
		t.Fatal(e)
	}
	if e = l.Close(); e != nil {
		t.Fatal(e)
	}
	stream := read()
	files := stream["paths"].([]any)
	if len(files) != 2 {
		t.Fatal(stream)
	}
	states := map[string]int{}
	for _, v := range files {
		f := v.(map[string]any)
		states[f["state"].(string)]++
		if !filepath.IsAbs(filepath.FromSlash(f["path"].(string))) {
			t.Fatal(f)
		}
		if f["size_bytes"].(float64) <= 0 {
			t.Fatal(f)
		}
	}
	if states["active"] != 1 || states["closed"] != 1 || stream["first_seen"] != first["first_seen"] {
		t.Fatal(stream)
	}
}
