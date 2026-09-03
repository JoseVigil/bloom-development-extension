package gravity

import (
	"errors"
	"fmt"
	"io/fs"
	authoritydecision "nucleus/internal/governance/decision"
	"os"
	"path/filepath"

	"github.com/gofrs/flock"
)

var (
	ErrInvalidGovernedDecision = errors.New("invalid governed creation decision")
	ErrOrganizationExists      = errors.New("ORGANIZATION node already exists under this root")
)

func (s *Store) CreateGovernedNode(decision authoritydecision.GovernedCreationDecision, node GravityNode) error {
	if decision.Basis() != authoritydecision.BasisLocalLegacy || decision.DecidedAt().IsZero() {
		return ErrInvalidGovernedDecision
	}
	if !sameGravityPath(decision.GravityRoot(), s.Root) {
		return fmt.Errorf("%w: Gravity root mismatch", ErrInvalidGovernedDecision)
	}
	if decision.NodeID() != node.NodeID {
		return fmt.Errorf("%w: node ID mismatch", ErrInvalidGovernedDecision)
	}
	if err := validateIdentifier(node.NodeID); err != nil {
		return fmt.Errorf("%w: node ID: %v", ErrInvalidGovernedDecision, err)
	}

	var targetPath string
	switch decision.Operation() {
	case authoritydecision.OpCreateOrganization:
		if node.NodeType != NodeOrganization || decision.ParentID() != nil || decision.ParentObservedVersion() != nil {
			return fmt.Errorf("%w: create_organization decision does not match node", ErrInvalidGovernedDecision)
		}
		targetPath = filepath.Join(s.Root, ".organization", node.NodeID, "node.json")
	case authoritydecision.OpCreateProject:
		parentID := decision.ParentID()
		if node.NodeType != NodeProject || parentID == nil || decision.ParentObservedVersion() == nil {
			return fmt.Errorf("%w: create_project decision does not match node", ErrInvalidGovernedDecision)
		}
		if err := validateIdentifier(*parentID); err != nil {
			return fmt.Errorf("%w: parent ID: %v", ErrInvalidGovernedDecision, err)
		}
		if node.ParentID == nil || *node.ParentID != *parentID {
			return fmt.Errorf("%w: parent ID mismatch", ErrInvalidGovernedDecision)
		}
		targetPath = filepath.Join(s.Root, ".organization", *parentID, ".project", node.NodeID, "node.json")
	default:
		return fmt.Errorf("%w: unsupported operation", ErrInvalidGovernedDecision)
	}

	if err := s.EnsureLayout(); err != nil {
		return err
	}
	treeLock := flock.New(filepath.Join(s.Root, ".governed-creation.lock"))
	if err := treeLock.Lock(); err != nil {
		return err
	}
	defer func() { _ = treeLock.Unlock() }()

	nucleus, err := s.readCanonicalNucleus()
	if err != nil {
		return err
	}

	switch decision.Operation() {
	case authoritydecision.OpCreateOrganization:
		if node.ParentID == nil || *node.ParentID != nucleus.NodeID {
			return fmt.Errorf("%w: ORGANIZATION parent must be the canonical NUCLEUS", ErrInvalidGovernedDecision)
		}
		exists, err := s.nodeTypeExists(NodeOrganization)
		if err != nil {
			return err
		}
		if exists {
			return ErrOrganizationExists
		}
	case authoritydecision.OpCreateProject:
		parentID := decision.ParentID()
		parentPath := filepath.Join(s.Root, ".organization", *parentID, "node.json")
		parent, err := s.ReadNode(parentPath)
		if err != nil {
			return fmt.Errorf("read governed PROJECT parent: %w", err)
		}
		if parent.NodeType != NodeOrganization || parent.NodeID != *parentID || parent.Status != NodeActive {
			return errors.New("governed PROJECT parent is not the referenced active ORGANIZATION")
		}
		observed := decision.ParentObservedVersion()
		if parent.NodeVersion != *observed {
			return fmt.Errorf("governed PROJECT parent version changed: observed=%d current=%d", *observed, parent.NodeVersion)
		}
	}

	if err := validateNode(node); err != nil {
		return err
	}
	if node.NodeVersion != 0 && node.NodeVersion != 1 {
		return errors.New("nodeVersion inicial debe ser 0 o 1")
	}
	if _, err := os.Stat(targetPath); err == nil {
		return fmt.Errorf("gravity node ya existe: %s", targetPath)
	} else if !os.IsNotExist(err) {
		return err
	}
	node.NodeVersion = 1
	if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
		return err
	}
	return atomicWriteNode(targetPath, node)
}

func (s *Store) readCanonicalNucleus() (GravityNode, error) {
	node, err := s.ReadNode(filepath.Join(s.Root, "nucleus.node.json"))
	if err != nil {
		return GravityNode{}, fmt.Errorf("read canonical NUCLEUS: %w", err)
	}
	if node.NodeType != NodeNucleus {
		return GravityNode{}, errors.New("canonical Gravity root node is not NUCLEUS")
	}
	return node, nil
}

func (s *Store) nodeTypeExists(kind NodeType) (bool, error) {
	found := errors.New("gravity node type found")
	err := filepath.WalkDir(s.Root, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() || entry.Name() != "node.json" {
			return nil
		}
		node, err := s.ReadNode(path)
		if err != nil {
			return err
		}
		if node.NodeType == kind {
			return found
		}
		return nil
	})
	if errors.Is(err, found) {
		return true, nil
	}
	return false, err
}

func sameGravityPath(left, right string) bool {
	left = filepath.Clean(left)
	right = filepath.Clean(right)
	if os.PathSeparator == '\\' {
		return filepath.IsAbs(left) && filepath.IsAbs(right) && equalFold(left, right)
	}
	return left == right
}

func equalFold(left, right string) bool {
	if len(left) != len(right) {
		return false
	}
	for i := range left {
		a, b := left[i], right[i]
		if a >= 'A' && a <= 'Z' {
			a += 'a' - 'A'
		}
		if b >= 'A' && b <= 'Z' {
			b += 'a' - 'A'
		}
		if a != b {
			return false
		}
	}
	return true
}
