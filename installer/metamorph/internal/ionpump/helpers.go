package ionpump

import (
	"encoding/json"
	"fmt"
	"os"
)

// atomicWriteJSON marshals v to JSON and writes it to path using an atomic
// write-then-rename pattern to avoid partial writes on crash.
func atomicWriteJSON(path string, v interface{}) error {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal JSON: %w", err)
	}

	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0644); err != nil {
		return fmt.Errorf("write tmp file: %w", err)
	}

	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("rename tmp → final: %w", err)
	}

	return nil
}
