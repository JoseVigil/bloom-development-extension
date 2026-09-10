package authority

import "time"

type OperationClass string

const (
	ClassCritical   OperationClass = "critical"
	ClassPrivileged OperationClass = "privileged"
	ClassStandard   OperationClass = "standard"
)

type ShadowRecord struct {
	Operation        string          `json:"operation"`
	Class            OperationClass  `json:"class"`
	RemoteOutcome    DecisionOutcome `json:"remote_outcome"`
	RemoteReason     string          `json:"remote_reason"`
	AuthorityVersion string          `json:"authority_version,omitempty"`
	StateDigest      string          `json:"state_digest,omitempty"`
	ObservedAt       time.Time       `json:"observed_at"`
	CommittedAt      time.Time       `json:"committed_at"`
	WouldBlockAt     time.Time       `json:"would_block_at"`
	WouldBlock       bool            `json:"would_block"`
	Connected        bool            `json:"connected"`
}
type ShadowSink interface{ RecordShadow(ShadowRecord) error }
type ShadowInput struct {
	Operation   string
	Class       OperationClass
	CommittedAt time.Time
	ObservedAt  time.Time
	Connected   bool
}

// PreserveShadow records the remote candidate but returns the exact local value and
// error supplied by the caller. Sink failures are evidence failures, never enforcement.
func PreserveShadow[T any](localValue T, localError error, remote AuthorityDecision, input ShadowInput, sink ShadowSink) (T, error, ShadowRecord) {
	at := input.ObservedAt.UTC()
	if at.IsZero() {
		at = time.Now().UTC()
	}
	committed := input.CommittedAt.UTC()
	if committed.IsZero() {
		committed = at
	}
	if remote.Outcome != DecisionAllow && remote.Outcome != DecisionDeny && remote.Outcome != DecisionNotEvaluable {
		remote.Outcome = DecisionNotEvaluable
		remote.Reason = "remote_decision_invalid"
	}
	wouldAt := committed.Add(50 * time.Second)
	eligible := input.Class == ClassCritical || input.Class == ClassPrivileged || input.Class == ClassStandard
	record := ShadowRecord{Operation: input.Operation, Class: input.Class, RemoteOutcome: remote.Outcome, RemoteReason: remote.Reason, AuthorityVersion: remote.AuthorityVersion, StateDigest: remote.StateDigest, ObservedAt: at, CommittedAt: committed, WouldBlockAt: wouldAt, WouldBlock: eligible && !at.Before(wouldAt) && remote.Outcome != DecisionAllow, Connected: input.Connected}
	if sink != nil {
		_ = sink.RecordShadow(record)
	}
	return localValue, localError, record
}
