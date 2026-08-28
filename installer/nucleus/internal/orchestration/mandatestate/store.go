package mandatestate

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// Mutate serializa todos los escritores Go de mandate_state.json. El callback
// devuelve changed=false cuando un retry ya encuentra aplicada la transición;
// en ese caso no hay escritura ni incremento de versión.
func Mutate(path string, mutate func(map[string]interface{}) (bool, error)) (uint64, error) {
	lock, err := acquireFileLock(path + ".lock")
	if err != nil {
		return 0, fmt.Errorf("no pude bloquear %s: %w", path, err)
	}
	defer lock.release()

	raw, err := os.ReadFile(path)
	if err != nil {
		return 0, err
	}
	var state map[string]interface{}
	if err := json.Unmarshal(raw, &state); err != nil {
		return 0, fmt.Errorf("mandate_state.json inválido: %w", err)
	}
	current, err := versionOf(state)
	if err != nil {
		return 0, err
	}
	changed, err := mutate(state)
	if err != nil {
		return 0, err
	}
	if !changed {
		return current, nil
	}
	next := current + 1
	state["stateVersion"] = next
	state["updatedAt"] = time.Now().UTC().Format(time.RFC3339Nano)
	if err := atomicWriteJSON(path, state); err != nil {
		return 0, err
	}
	return next, nil
}

func versionOf(state map[string]interface{}) (uint64, error) {
	value, ok := state["stateVersion"]
	if !ok || value == nil {
		return 0, nil
	}
	switch n := value.(type) {
	case float64:
		if n < 0 || n != float64(uint64(n)) {
			return 0, fmt.Errorf("stateVersion inválido: %v", n)
		}
		return uint64(n), nil
	case uint64:
		return n, nil
	case int:
		if n < 0 {
			return 0, fmt.Errorf("stateVersion inválido: %d", n)
		}
		return uint64(n), nil
	default:
		return 0, fmt.Errorf("stateVersion tiene tipo inválido %T", value)
	}
}

func atomicWriteJSON(path string, state map[string]interface{}) error {
	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return fmt.Errorf("no pude serializar mandate_state.json: %w", err)
	}
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, ".mandate_state.*.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	cleanup := func() { _ = os.Remove(tmpPath) }
	defer cleanup()
	if _, err := tmp.Write(append(data, '\n')); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := replaceFile(tmpPath, path); err != nil {
		return fmt.Errorf("no pude reemplazar mandate_state.json: %w", err)
	}
	return nil
}
