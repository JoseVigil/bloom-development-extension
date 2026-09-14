package core

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

type Registrar interface{ Register(string) error }
type NucleusRegistrar struct{ Paths Paths }

func (n NucleusRegistrar) Register(path string) error {
	if !filepath.IsAbs(path) || !filepath.IsAbs(n.Paths.NucleusBin) {
		return fmt.Errorf("telemetry requires absolute paths")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, n.Paths.NucleusBin, "--json", "telemetry", "register", "--stream", "impact_core", "--label", "IMPACT CORE", "--path", filepath.ToSlash(path), "--priority", "2", "--category", "impact", "--description", "Impact evaluation operations, results and errors; no request bodies or secrets", "--source", "impact")
	// Align the real Nucleus writer with the same installation, also in tests.
	env := []string{}
	for _, v := range os.Environ() {
		if !strings.HasPrefix(strings.ToUpper(v), "BLOOM_APPDATA_DIR=") {
			env = append(env, v)
		}
	}
	cmd.Env = append(env, "BLOOM_APPDATA_DIR="+n.Paths.AppDataDir)
	// Neither subprocess stdout nor error payloads can leak into command stdout.
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("nucleus telemetry register failed: %w", err)
	}
	return nil
}
