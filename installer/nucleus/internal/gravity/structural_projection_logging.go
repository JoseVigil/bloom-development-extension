package gravity

import (
	"encoding/json"

	"nucleus/internal/core"
)

// LogStructuralProjectionEvents writes projection facts to the existing
// nucleus_gravity stream. It never opens or writes telemetry.json; stream
// registration remains the exclusive responsibility of core.InitLogger.
func LogStructuralProjectionEvents(logger *core.Logger, events []StructuralProjectionEvent) {
	for _, event := range events {
		raw, err := json.Marshal(event)
		if err != nil {
			logger.Error("STRUCTURAL_PROJECTION_FAILED: event encoding failed: %v", err)
			continue
		}
		switch event.EventType {
		case "STRUCTURAL_PROJECTION_RECONCILED", "STRUCTURAL_PROJECTION_REJECTED", "STRUCTURAL_PROJECTION_VERSION_CONFLICT":
			logger.Warning("%s: %s", event.EventType, raw)
		case "STRUCTURAL_PROJECTION_FAILED":
			logger.Error("%s: %s", event.EventType, raw)
		default:
			logger.Info("%s: %s", event.EventType, raw)
		}
	}
}
