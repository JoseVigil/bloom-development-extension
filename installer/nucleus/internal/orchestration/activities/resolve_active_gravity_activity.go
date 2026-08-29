package activities

import (
	"fmt"

	"nucleus/internal/gravity"
)

type ResolveActiveGravityInput struct {
	NucleusRoot string                  `json:"nucleus_root"`
	MandateID   string                  `json:"mandate_id"`
	SessionID   string                  `json:"session_id"`
	IntentType  string                  `json:"current_turn_intent_type"`
	Turn        uint64                  `json:"turn"`
	Cache       gravity.ResolutionCache `json:"cache"`
}

type ResolveActiveGravityResult = gravity.ResolveResult

// ResolveActiveGravityActivity owns all filesystem I/O so Workflow replay
// consumes Temporal's recorded result instead of reading mutable files.
func ResolveActiveGravityActivity(input ResolveActiveGravityInput) (ResolveActiveGravityResult, error) {
	store, err := gravity.NewStore(input.NucleusRoot)
	if err != nil {
		return ResolveActiveGravityResult{}, fmt.Errorf("resolveActiveGravityActivity: %w", err)
	}
	result, err := store.ResolveActive(gravity.ResolveInput{
		MandateID: input.MandateID, SessionID: input.SessionID, IntentType: input.IntentType,
		Turn: input.Turn, Cache: input.Cache,
	})
	if err != nil {
		return ResolveActiveGravityResult{}, fmt.Errorf("resolveActiveGravityActivity: %w", err)
	}
	return result, nil
}
