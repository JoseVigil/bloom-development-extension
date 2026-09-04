package governance

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"

	"github.com/gofrs/flock"
	ownershipcontract "nucleus/internal/governance/ownershipcontract"
)

const (
	FormatNucleusGoV0             = ownershipcontract.SourceNucleusGoV0
	FormatBatcaveTypeScriptV0     = ownershipcontract.SourceBatcaveTypeScriptV0
	FormatSupervisorOwnerV0       = ownershipcontract.SourceSupervisorOwnerV0
	FormatGovernanceSpecV2        = ownershipcontract.SourceGovernanceSpecV2Documented
	FormatBatcaveArchitectureV1   = ownershipcontract.SourceBatcaveArchitectureV1
	migrationEvidenceFileName     = ".ownership.migration-evidence.json"
	ownershipTransitionLockSuffix = ".migration.lock"
)

type migrationEvidence struct {
	SourceFormat       ownershipcontract.SourceFormat `json:"source_format"`
	SourceDigestSHA256 string                         `json:"source_digest_sha256"`
	MigrationID        string                         `json:"migration_id"`
	InstallationID     string                         `json:"installation_id"`
	MigratedAt         time.Time                      `json:"migrated_at"`
}

// ownershipTransitionHook is test-only injection. Production leaves it nil.
var ownershipTransitionHook func(stage string) error

func LoadCanonicalOwnership(path string) (*CanonicalOwnership, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	analysis, err := ownershipcontract.Analyze(raw)
	if err != nil {
		return nil, err
	}
	if analysis.Canonical == nil {
		return MigrateOwnership(path)
	}
	if err := verifyMigrationEvidence(path, analysis.Canonical); err != nil {
		return nil, err
	}
	return analysis.Canonical, nil
}

func ValidateOwnershipPath(path string) error {
	_, err := LoadCanonicalOwnership(path)
	return err
}

func MigrateOwnership(path string) (*CanonicalOwnership, error) {
	lock := flock.New(path + ownershipTransitionLockSuffix)
	if err := lock.Lock(); err != nil {
		return nil, err
	}
	defer func() { _ = lock.Unlock() }()
	return migrateOwnershipLocked(path)
}

// migrateOwnershipLocked requires the ownership transition lock to be held.
// It never attempts to acquire that lock itself.
func migrateOwnershipLocked(path string) (*CanonicalOwnership, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	analysis, err := ownershipcontract.Analyze(raw)
	if err != nil {
		return nil, err
	}
	if analysis.Canonical != nil {
		if err := verifyMigrationEvidence(path, analysis.Canonical); err != nil {
			return nil, err
		}
		return analysis.Canonical, nil
	}

	digest := sha256.Sum256(raw)
	digestText := base64.RawURLEncoding.EncodeToString(digest[:])
	evidence, err := loadOrPrepareEvidence(path, analysis.Source, digestText)
	if err != nil {
		return nil, err
	}
	markers, err := observedEffectiveMarkers(filepath.Dir(path))
	if err != nil {
		return nil, err
	}
	document, err := ownershipcontract.Normalize(analysis, ownershipcontract.NormalizationContext{
		InstallationID:   evidence.InstallationID,
		MigrationID:      evidence.MigrationID,
		SourceDigest:     evidence.SourceDigestSHA256,
		MigratedAt:       evidence.MigratedAt,
		EffectiveMarkers: markers,
	})
	if err != nil {
		return nil, err
	}
	if err := persistEvidenceLocked(path, evidence); err != nil {
		return nil, err
	}
	if err := callOwnershipHook("after_evidence_rename"); err != nil {
		return nil, err
	}
	if err := persistCanonicalOwnershipLocked(path, document); err != nil {
		return nil, err
	}
	if err := callOwnershipHook("after_ownership_rename"); err != nil {
		return nil, err
	}
	if err := verifyMigrationEvidence(path, document); err != nil {
		return nil, err
	}
	return document, nil
}

func persistCanonicalOwnership(path string, document *CanonicalOwnership) error {
	lock := flock.New(path + ownershipTransitionLockSuffix)
	if err := lock.Lock(); err != nil {
		return err
	}
	defer func() { _ = lock.Unlock() }()
	return persistCanonicalOwnershipLocked(path, document)
}

// persistCanonicalOwnershipLocked requires the transition lock to be held.
// It validates and persists but deliberately never locks again.
func persistCanonicalOwnershipLocked(path string, document *CanonicalOwnership) error {
	if err := ownershipcontract.Validate(document); err != nil {
		return err
	}
	data, err := json.MarshalIndent(document, "", "  ")
	if err != nil {
		return err
	}
	if err := atomicReplace(path, append(data, '\n'), 0600, "before_ownership_rename"); err != nil {
		return err
	}
	persisted, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("ownership persisted but unreadable: %w", err)
	}
	if _, err := ownershipcontract.DecodeCanonical(persisted); err != nil {
		return fmt.Errorf("ownership persisted but unverified: %w", err)
	}
	return nil
}

func persistEvidenceLocked(ownershipPath string, evidence migrationEvidence) error {
	data, err := json.MarshalIndent(evidence, "", "  ")
	if err != nil {
		return err
	}
	return atomicReplace(evidencePath(ownershipPath), append(data, '\n'), 0600, "before_evidence_rename")
}

func atomicReplace(path string, data []byte, mode os.FileMode, hookStage string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".ownership.*.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer func() { _ = os.Remove(tmpPath) }()
	if err := tmp.Chmod(mode); err != nil {
		_ = tmp.Close()
		return err
	}
	if _, err = tmp.Write(data); err == nil {
		err = tmp.Sync()
	}
	if closeErr := tmp.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	if err := callOwnershipHook(hookStage); err != nil {
		return err
	}
	if err := os.Rename(tmpPath, path); err != nil {
		return err
	}
	return syncParentDirectory(filepath.Dir(path))
}

func syncParentDirectory(dir string) error {
	handle, err := os.Open(dir)
	if err != nil {
		return nil // Platform does not expose directory handles here.
	}
	defer handle.Close()
	if err := handle.Sync(); err != nil {
		return nil // Best effort on platforms that reject directory fsync.
	}
	return nil
}

func loadOrPrepareEvidence(path string, format ownershipcontract.SourceFormat, digest string) (migrationEvidence, error) {
	raw, err := os.ReadFile(evidencePath(path))
	if err == nil {
		var evidence migrationEvidence
		if err := json.Unmarshal(raw, &evidence); err != nil {
			return migrationEvidence{}, fmt.Errorf("invalid migration evidence: %w", err)
		}
		if evidence.SourceFormat != format || evidence.SourceDigestSHA256 != digest || evidence.MigrationID == "" || evidence.InstallationID == "" || evidence.MigratedAt.IsZero() {
			return migrationEvidence{}, errors.New("migration evidence conflicts with ownership source")
		}
		return evidence, nil
	}
	if !os.IsNotExist(err) {
		return migrationEvidence{}, err
	}
	return migrationEvidence{SourceFormat: format, SourceDigestSHA256: digest, MigrationID: randomID(), InstallationID: randomID(), MigratedAt: time.Now().UTC()}, nil
}

func verifyMigrationEvidence(path string, document *CanonicalOwnership) error {
	if document.Migration == nil {
		return nil
	}
	raw, err := os.ReadFile(evidencePath(path))
	if err != nil {
		return fmt.Errorf("canonical ownership migration evidence unavailable: %w", err)
	}
	var evidence migrationEvidence
	if err := json.Unmarshal(raw, &evidence); err != nil {
		return fmt.Errorf("invalid migration evidence: %w", err)
	}
	if evidence.SourceFormat != document.Migration.SourceFormat || evidence.SourceDigestSHA256 != document.Migration.SourceDigestSHA256 || evidence.MigrationID != document.Migration.MigrationID || evidence.InstallationID != document.Installation.InstallationID || !evidence.MigratedAt.Equal(document.Migration.MigratedAt) {
		return errors.New("canonical ownership and migration evidence disagree")
	}
	return nil
}

func observedEffectiveMarkers(root string) ([]string, error) {
	markers := make([]string, 0, 2)
	for _, marker := range []string{"master", "specialist"} {
		path := filepath.Join(root, "."+marker)
		info, err := os.Lstat(path)
		if os.IsNotExist(err) {
			continue
		}
		if err != nil {
			return nil, err
		}
		if !info.Mode().IsRegular() {
			return nil, fmt.Errorf("legacy marker %s is not a regular file", path)
		}
		content, err := os.ReadFile(path)
		if err != nil {
			return nil, err
		}
		if string(content) != marker {
			return nil, fmt.Errorf("legacy marker %s contains incompatible state", path)
		}
		markers = append(markers, marker)
	}
	sort.Strings(markers)
	return markers, nil
}

func evidencePath(ownershipPath string) string {
	return filepath.Join(filepath.Dir(ownershipPath), migrationEvidenceFileName)
}

func callOwnershipHook(stage string) error {
	if ownershipTransitionHook != nil {
		return ownershipTransitionHook(stage)
	}
	return nil
}

func randomID() string {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err == nil {
		return hex.EncodeToString(bytes)
	}
	digest := sha256.Sum256([]byte(time.Now().UTC().Format(time.RFC3339Nano)))
	return hex.EncodeToString(digest[:16])
}
