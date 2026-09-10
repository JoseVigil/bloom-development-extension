package authority

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"sort"
	"time"

	"github.com/gofrs/flock"
)

type ObservationKind string

const (
	ObservationAcceptance   ObservationKind = "acceptance"
	ObservationDivergence   ObservationKind = "divergence"
	ObservationNotEvaluable ObservationKind = "not_evaluable"
	ObservationFreshness    ObservationKind = "freshness"
	ObservationFailure      ObservationKind = "failure"
	ObservationLatency      ObservationKind = "latency"
	ObservationShadow       ObservationKind = "shadow"
)

type ObservationEvent struct {
	EventID              string          `json:"event_id"`
	Kind                 ObservationKind `json:"kind"`
	OrganizationID       string          `json:"organization_id"`
	InstallationID       string          `json:"installation_id"`
	AuthorityVersion     string          `json:"authority_version,omitempty"`
	Operation            string          `json:"operation,omitempty"`
	Class                OperationClass  `json:"class,omitempty"`
	Outcome              DecisionOutcome `json:"outcome,omitempty"`
	Reason               string          `json:"reason,omitempty"`
	ObservedAt           time.Time       `json:"observed_at"`
	CommitToAcceptanceMS *int64          `json:"commit_to_acceptance_ms,omitempty"`
	CommitToWouldBlockMS *int64          `json:"commit_to_would_block_ms,omitempty"`
}
type observationDocument struct {
	Schema string             `json:"schema"`
	Events []ObservationEvent `json:"events"`
}
type ObservationStore struct {
	Path string
	Now  func() time.Time
}
type ObservationSummary struct {
	Schema                   string         `json:"schema"`
	From                     time.Time      `json:"from"`
	To                       time.Time      `json:"to"`
	DurationSeconds          int64          `json:"duration_seconds"`
	SimulatedTwentyFourHours bool           `json:"simulated_twenty_four_hours"`
	Total                    int            `json:"total"`
	Counts                   map[string]int `json:"counts"`
	MaxCommitToAcceptanceMS  *int64         `json:"max_commit_to_acceptance_ms,omitempty"`
	MaxCommitToWouldBlockMS  *int64         `json:"max_commit_to_would_block_ms,omitempty"`
}

func (s *ObservationStore) validate(e ObservationEvent) error {
	if s == nil || s.Path == "" {
		return errors.New("observation store required")
	}
	if e.EventID == "" || e.OrganizationID == "" || e.InstallationID == "" || e.ObservedAt.IsZero() {
		return errors.New("observation identity and time required")
	}
	switch e.Kind {
	case ObservationAcceptance, ObservationDivergence, ObservationNotEvaluable, ObservationFreshness, ObservationFailure, ObservationLatency, ObservationShadow:
	default:
		return errors.New("observation kind invalid")
	}
	return nil
}
func (s *ObservationStore) loadUnlocked() (observationDocument, error) {
	raw, err := os.ReadFile(s.Path)
	if os.IsNotExist(err) {
		return observationDocument{Schema: "bloom.authority.observation/v1", Events: []ObservationEvent{}}, nil
	}
	if err != nil {
		return observationDocument{}, err
	}
	var doc observationDocument
	if rejectDuplicateKeys(raw) != nil || decodeStrict(raw, &doc) != nil || doc.Schema != "bloom.authority.observation/v1" || doc.Events == nil {
		return observationDocument{}, errors.New("authority observation corrupt")
	}
	seen := map[string]bool{}
	for _, e := range doc.Events {
		if s.validate(e) != nil || seen[e.EventID] {
			return observationDocument{}, errors.New("authority observation corrupt")
		}
		seen[e.EventID] = true
	}
	return doc, nil
}
func (s *ObservationStore) Append(e ObservationEvent) error {
	if e.ObservedAt.IsZero() && s.Now != nil {
		e.ObservedAt = s.Now().UTC()
	}
	e.ObservedAt = e.ObservedAt.UTC()
	if err := s.validate(e); err != nil {
		return err
	}
	l := flock.New(s.Path + ".lock")
	if err := l.Lock(); err != nil {
		return err
	}
	defer l.Unlock()
	doc, err := s.loadUnlocked()
	if err != nil {
		return err
	}
	for _, old := range doc.Events {
		if old.EventID == e.EventID {
			a, _ := json.Marshal(old)
			b, _ := json.Marshal(e)
			if string(a) == string(b) {
				return nil
			}
			return errors.New("observation event conflict")
		}
	}
	doc.Events = append(doc.Events, e)
	sort.Slice(doc.Events, func(i, j int) bool {
		if doc.Events[i].ObservedAt.Equal(doc.Events[j].ObservedAt) {
			return doc.Events[i].EventID < doc.Events[j].EventID
		}
		return doc.Events[i].ObservedAt.Before(doc.Events[j].ObservedAt)
	})
	raw, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return err
	}
	return atomicFile(s.Path, append(raw, '\n'))
}
func (s *ObservationStore) Events() ([]ObservationEvent, error) {
	if s == nil || s.Path == "" {
		return nil, errors.New("observation store required")
	}
	l := flock.New(s.Path + ".lock")
	if err := l.RLock(); err != nil {
		return nil, err
	}
	defer l.Unlock()
	doc, err := s.loadUnlocked()
	if err != nil {
		return nil, err
	}
	return append([]ObservationEvent(nil), doc.Events...), nil
}
func (s *ObservationStore) Summarize(from, to time.Time) (ObservationSummary, error) {
	from = from.UTC()
	to = to.UTC()
	if from.IsZero() || !to.After(from) {
		return ObservationSummary{}, errors.New("observation window invalid")
	}
	events, err := s.Events()
	if err != nil {
		return ObservationSummary{}, err
	}
	r := ObservationSummary{Schema: "bloom.authority.observation-summary/v1", From: from, To: to, DurationSeconds: int64(to.Sub(from).Seconds()), SimulatedTwentyFourHours: to.Sub(from) == 24*time.Hour, Counts: map[string]int{}}
	for _, e := range events {
		if e.ObservedAt.Before(from) || !e.ObservedAt.Before(to) {
			continue
		}
		r.Total++
		r.Counts[string(e.Kind)]++
		if e.Outcome != "" {
			r.Counts["outcome:"+string(e.Outcome)]++
		}
		if e.Class != "" {
			r.Counts["class:"+string(e.Class)]++
		}
		max := func(target **int64, value *int64) {
			if value != nil && (*target == nil || *value > **target) {
				v := *value
				*target = &v
			}
		}
		max(&r.MaxCommitToAcceptanceMS, e.CommitToAcceptanceMS)
		max(&r.MaxCommitToWouldBlockMS, e.CommitToWouldBlockMS)
	}
	return r, nil
}
func (s *ObservationStore) RecordShadow(record ShadowRecord) error {
	id := fmt.Sprintf("shadow:%s:%s:%d", record.Operation, record.AuthorityVersion, record.ObservedAt.UnixNano())
	ms := record.WouldBlockAt.Sub(record.CommittedAt).Milliseconds()
	kind := ObservationShadow
	if record.RemoteOutcome == DecisionNotEvaluable {
		kind = ObservationNotEvaluable
	} else if record.WouldBlock {
		kind = ObservationDivergence
	}
	return s.Append(ObservationEvent{EventID: id, Kind: kind, Operation: record.Operation, Class: record.Class, Outcome: record.RemoteOutcome, Reason: record.RemoteReason, AuthorityVersion: record.AuthorityVersion, ObservedAt: record.ObservedAt, CommitToWouldBlockMS: &ms, OrganizationID: "local", InstallationID: "local"})
}
