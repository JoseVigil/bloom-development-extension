// internal/governance/org_switch_guard_test.go
//
// Cubre la lógica de G4 (DrainingState) y la rama pura de G2 (CanSwitchOrg
// con tc=nil, es decir, sin consultar Temporal) sin necesitar un Temporal
// Server local. La rama que sí consulta Temporal (tc != nil, vía
// HasNonTerminalMandateWork) ya tiene su propio test de integración real
// en internal/orchestration/temporal/temporal_client_test.go (Etapa 3) —
// no se duplica acá.
package governance

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

// withOrgOverride fuerza a core.ResolveNucleusRoot("") a resolver a un
// directorio temporal aislado, vía BLOOM_NUCLEUS_ROOT — mismo mecanismo
// que ya usa internal/vault/vault_test.go (withOrgOverride) para no
// depender de HOME real ni de un workspace real durante el test.
func withOrgOverride(t *testing.T) string {
	t.Helper()
	tmp := t.TempDir()
	nucleusRoot := filepath.Join(tmp, ".bloom", ".nucleus-test-org")
	if err := os.MkdirAll(nucleusRoot, 0755); err != nil {
		t.Fatalf("failed to create fake nucleus root: %v", err)
	}
	t.Setenv("BLOOM_NUCLEUS_ROOT", nucleusRoot)
	return nucleusRoot
}

func TestDrainingState_AbsentIsNotDraining(t *testing.T) {
	withOrgOverride(t)

	state, err := LoadDrainingState()
	if err != nil {
		t.Fatalf("LoadDrainingState() con draining.json ausente: want nil error, got %v", err)
	}
	if state.Draining {
		t.Fatalf("LoadDrainingState() con archivo ausente = Draining:true, want false")
	}
}

func TestDrainingState_BeginEndRoundTrip(t *testing.T) {
	nucleusRoot := withOrgOverride(t)

	if err := BeginDraining("switch a org globex"); err != nil {
		t.Fatalf("BeginDraining() error: %v", err)
	}

	state, err := LoadDrainingState()
	if err != nil {
		t.Fatalf("LoadDrainingState() tras BeginDraining(): error %v", err)
	}
	if !state.Draining {
		t.Fatalf("LoadDrainingState() tras BeginDraining() = Draining:false, want true")
	}
	if state.Reason != "switch a org globex" {
		t.Fatalf("LoadDrainingState().Reason = %q, want %q", state.Reason, "switch a org globex")
	}
	if state.StartedAt.IsZero() {
		t.Fatalf("LoadDrainingState().StartedAt = zero, want timestamp real")
	}

	// El archivo debe existir físicamente en el nucleusRoot correcto — no
	// en un lugar distinto al de ownership.json/vault.json.
	if _, err := os.Stat(filepath.Join(nucleusRoot, "draining.json")); err != nil {
		t.Fatalf("draining.json no está en el nucleusRoot esperado: %v", err)
	}
	// No debe quedar el .tmp de la escritura atómica.
	if _, err := os.Stat(filepath.Join(nucleusRoot, "draining.json.tmp")); !os.IsNotExist(err) {
		t.Fatalf("draining.json.tmp no debería sobrevivir tras un Rename exitoso (err=%v)", err)
	}

	if err := EndDraining(); err != nil {
		t.Fatalf("EndDraining() error: %v", err)
	}

	state, err = LoadDrainingState()
	if err != nil {
		t.Fatalf("LoadDrainingState() tras EndDraining(): error %v", err)
	}
	if state.Draining {
		t.Fatalf("LoadDrainingState() tras EndDraining() = Draining:true, want false")
	}
}

func TestDrainingState_EndWithoutBeginIsNotAnError(t *testing.T) {
	withOrgOverride(t)

	if err := EndDraining(); err != nil {
		t.Fatalf("EndDraining() sin drenado previo: want nil error (idempotente), got %v", err)
	}
}

func TestCanSwitchOrg_NoTemporalClient_OnlyG4(t *testing.T) {
	withOrgOverride(t)
	ctx := context.Background()

	// Sin drenado en curso y sin cliente de Temporal (tc=nil): no hay
	// ninguna razón para bloquear.
	result, err := CanSwitchOrg(ctx, nil, "/no/existe/.mandates")
	if err != nil {
		t.Fatalf("CanSwitchOrg() error inesperado: %v", err)
	}
	if result.Blocked {
		t.Fatalf("CanSwitchOrg() = Blocked:true sin drenado ni Temporal, want false (reasons=%v)", result.Reasons)
	}
	if len(result.Reasons) != 0 {
		t.Fatalf("CanSwitchOrg() Reasons = %v, want vacío", result.Reasons)
	}

	// Con drenado en curso, debe bloquear incondicionalmente aunque no
	// haya forma de consultar Temporal — G2 nunca debe reportar
	// blocked:false por no poder verificar el estado real.
	if err := BeginDraining("test"); err != nil {
		t.Fatalf("BeginDraining() error: %v", err)
	}

	result, err = CanSwitchOrg(ctx, nil, "/no/existe/.mandates")
	if err != nil {
		t.Fatalf("CanSwitchOrg() error inesperado (con drenado activo): %v", err)
	}
	if !result.Blocked {
		t.Fatalf("CanSwitchOrg() con drenado activo = Blocked:false, want true")
	}
	if len(result.Reasons) != 1 {
		t.Fatalf("CanSwitchOrg() con drenado activo Reasons = %v, want exactamente 1 razón", result.Reasons)
	}
}
