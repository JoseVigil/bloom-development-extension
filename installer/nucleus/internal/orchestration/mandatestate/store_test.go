package mandatestate

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"testing"
)

func writeFixture(t *testing.T, state map[string]interface{}) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "mandate_state.json")
	raw, _ := json.Marshal(state)
	if err := os.WriteFile(path, raw, 0600); err != nil {
		t.Fatal(err)
	}
	return path
}

func readFixture(t *testing.T, path string) map[string]interface{} {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var state map[string]interface{}
	if err := json.Unmarshal(raw, &state); err != nil {
		t.Fatal(err)
	}
	return state
}

func TestMutateInitializesLegacyVersionAndPreservesFields(t *testing.T) {
	path := writeFixture(t, map[string]interface{}{"mandateId": "m1", "foreign": "keep"})
	version, err := Mutate(path, func(state map[string]interface{}) (bool, error) {
		state["status"] = "pending"
		return true, nil
	})
	if err != nil || version != 1 {
		t.Fatalf("version=%d err=%v", version, err)
	}
	state := readFixture(t, path)
	if state["foreign"] != "keep" || state["updatedAt"] == nil || state["stateVersion"] != float64(1) {
		t.Fatalf("state=%#v", state)
	}
}

func TestMutateNoOpDoesNotIncrement(t *testing.T) {
	path := writeFixture(t, map[string]interface{}{"stateVersion": 4, "updatedAt": "before"})
	version, err := Mutate(path, func(map[string]interface{}) (bool, error) { return false, nil })
	if err != nil || version != 4 {
		t.Fatalf("version=%d err=%v", version, err)
	}
	state := readFixture(t, path)
	if state["stateVersion"] != float64(4) || state["updatedAt"] != "before" {
		t.Fatalf("state=%#v", state)
	}
}

func TestMutateSerializesConcurrentWriters(t *testing.T) {
	path := writeFixture(t, map[string]interface{}{"stateVersion": 1, "count": 0})
	const writers = 12
	var wg sync.WaitGroup
	errs := make(chan error, writers)
	for i := 0; i < writers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := Mutate(path, func(state map[string]interface{}) (bool, error) {
				state["count"] = state["count"].(float64) + 1
				return true, nil
			})
			errs <- err
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	state := readFixture(t, path)
	if state["stateVersion"] != float64(1+writers) || state["count"] != float64(writers) {
		t.Fatalf("state=%#v", state)
	}
}
