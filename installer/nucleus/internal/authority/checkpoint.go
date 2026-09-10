package authority

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

var ErrRecoveryRequired = errors.New("authority checkpoint evidence incomplete or contradictory; explicit recovery required")
var checkpointHook func(stage string) error

type Checkpoint struct {
	Schema          string  `json:"schema"`
	Binding         Binding `json:"binding"`
	HighWaterMark   string  `json:"high_water_mark"`
	PayloadDigest   string  `json:"payload_digest"`
	StateDigest     string  `json:"state_digest"`
	CutoverFloor    string  `json:"cutover_floor"`
	StoreDigest     string  `json:"store_digest"`
	ManifestVersion string  `json:"manifest_version"`
	ManifestDigest  string  `json:"manifest_digest"`
}
type CheckpointStore struct{ Path string }
type checkpointTxn struct {
	StoreExists      bool   `json:"store_exists"`
	Store            []byte `json:"store"`
	CheckpointExists bool   `json:"checkpoint_exists"`
	Checkpoint       []byte `json:"checkpoint"`
}

func atomicFile(path string, raw []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".authority-checkpoint.*.tmp")
	if err != nil {
		return err
	}
	name := tmp.Name()
	defer os.Remove(name)
	if _, err = tmp.Write(raw); err == nil {
		err = tmp.Sync()
	}
	if closeErr := tmp.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	return os.Rename(name, path)
}
func readOptional(path string) ([]byte, bool, error) {
	raw, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return nil, false, nil
	}
	return raw, err == nil, err
}
func (c *CheckpointStore) txnPath() string { return c.Path + ".txn" }
func (c *CheckpointStore) recoverLocked(store *Store) error {
	if c == nil || c.Path == "" {
		return errors.New("checkpoint required")
	}
	raw, exists, err := readOptional(c.txnPath())
	if err != nil {
		return err
	}
	if !exists {
		return nil
	}
	var tx checkpointTxn
	if rejectDuplicateKeys(raw) != nil || decodeStrict(raw, &tx) != nil {
		return ErrRecoveryRequired
	}
	restore := func(path string, data []byte, exists bool) error {
		if exists {
			return atomicFile(path, data)
		}
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			return err
		}
		return nil
	}
	if err = restore(store.Path, tx.Store, tx.StoreExists); err != nil {
		return err
	}
	if err = restore(c.Path, tx.Checkpoint, tx.CheckpointExists); err != nil {
		return err
	}
	if err = os.Remove(c.txnPath()); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}
func (c *CheckpointStore) validateLocked(store *Store, state *DurableState, manifest *VerifiedTrustManifest) (*Checkpoint, error) {
	stateRaw, stateExists, err := readOptional(store.Path)
	if err != nil {
		return nil, err
	}
	cpRaw, cpExists, err := readOptional(c.Path)
	if err != nil {
		return nil, err
	}
	if !stateExists && !cpExists {
		return nil, nil
	}
	if stateExists != cpExists {
		return nil, ErrRecoveryRequired
	}
	var cp Checkpoint
	if rejectDuplicateKeys(cpRaw) != nil || decodeStrict(cpRaw, &cp) != nil || cp.Schema != "bloom.authority.checkpoint/v1" {
		return nil, ErrRecoveryRequired
	}
	sum := sha256.Sum256(stateRaw)
	if cp.StoreDigest != base64.RawURLEncoding.EncodeToString(sum[:]) || state == nil || cp.Binding != state.Binding || cp.HighWaterMark != state.Monotonic.HighWaterMark || cp.PayloadDigest != state.Monotonic.Digest || cp.StateDigest != state.Monotonic.StateDigest || cp.CutoverFloor != state.Monotonic.CutoverFloor {
		return nil, ErrRecoveryRequired
	}
	if manifest != nil {
		mv, err := strictVersion(manifest.Payload.ManifestVersion)
		if err != nil {
			return nil, err
		}
		old, err := strictVersion(cp.ManifestVersion)
		if err != nil {
			return nil, ErrRecoveryRequired
		}
		if mv < old || (mv == old && cp.ManifestDigest != manifest.Digest) {
			return nil, errors.New("trust manifest rollback or conflict")
		}
	}
	return &cp, nil
}
func (c *CheckpointStore) commitLocked(store *Store, state *DurableState, manifest *VerifiedTrustManifest) error {
	oldStore, se, err := readOptional(store.Path)
	if err != nil {
		return err
	}
	oldCP, ce, err := readOptional(c.Path)
	if err != nil {
		return err
	}
	txRaw, _ := json.Marshal(checkpointTxn{se, oldStore, ce, oldCP})
	if err = atomicFile(c.txnPath(), txRaw); err != nil {
		return err
	}
	if checkpointHook != nil {
		if err = checkpointHook("after_journal"); err != nil {
			return err
		}
	}
	if err = store.saveLocked(state); err != nil {
		return err
	}
	if checkpointHook != nil {
		if err = checkpointHook("after_state"); err != nil {
			return err
		}
	}
	stateRaw, err := os.ReadFile(store.Path)
	if err != nil {
		return err
	}
	sum := sha256.Sum256(stateRaw)
	cp := Checkpoint{Schema: "bloom.authority.checkpoint/v1", Binding: state.Binding, HighWaterMark: state.Monotonic.HighWaterMark, PayloadDigest: state.Monotonic.Digest, StateDigest: state.Monotonic.StateDigest, CutoverFloor: state.Monotonic.CutoverFloor, StoreDigest: base64.RawURLEncoding.EncodeToString(sum[:])}
	if manifest != nil {
		cp.ManifestVersion = manifest.Payload.ManifestVersion
		cp.ManifestDigest = manifest.Digest
	}
	raw, err := json.MarshalIndent(cp, "", "  ")
	if err != nil {
		return err
	}
	if err = atomicFile(c.Path, append(raw, '\n')); err != nil {
		return err
	}
	if checkpointHook != nil {
		if err = checkpointHook("after_checkpoint"); err != nil {
			return err
		}
	}
	if err = os.Remove(c.txnPath()); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove checkpoint transaction: %w", err)
	}
	return nil
}
