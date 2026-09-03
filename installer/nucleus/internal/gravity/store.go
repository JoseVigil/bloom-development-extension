package gravity

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"strings"

	"github.com/gofrs/flock"
)

var (
	ErrVersionConflict        = errors.New("gravity nodeVersion conflict")
	ErrGovernedNodeCreation   = errors.New("ORGANIZATION/PROJECT node creation requires a governed authorization decision — not yet wired; rejecting by design")
	ErrStructuralNodeCreation = errors.New("DOMAIN/GENE node creation requires a governed structural projection operation — not yet authorized or wired; rejecting by design")
	ErrNucleusAlreadyExists   = errors.New("NUCLEUS node already exists under this root — a Gravity tree admits exactly one NUCLEUS by structural invariant")
)

type Store struct{ Root string }

func NewStore(nucleusRoot string) (*Store, error) {
	if strings.TrimSpace(nucleusRoot) == "" {
		return nil, errors.New("gravity: nucleus root vacío")
	}
	root, err := filepath.Abs(filepath.Join(nucleusRoot, ".gravity"))
	if err != nil {
		return nil, err
	}
	return &Store{Root: root}, nil
}

func (s *Store) EnsureLayout() error {
	for _, dir := range []string{s.Root, filepath.Join(s.Root, ".edges"), filepath.Join(s.Root, ".index")} {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) ReadNode(path string) (GravityNode, error) {
	if err := s.requireInside(path); err != nil {
		return GravityNode{}, err
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return GravityNode{}, err
	}
	var node GravityNode
	if err := json.Unmarshal(raw, &node); err != nil {
		return GravityNode{}, fmt.Errorf("gravity node inválido %s: %w", path, err)
	}
	if err := validateNode(node); err != nil {
		return GravityNode{}, fmt.Errorf("gravity node inválido %s: %w", path, err)
	}
	return node, nil
}

// CreateNode writes a new entity with nodeVersion=1. Existing entities are
// never overwritten through this entry point.
func (s *Store) CreateNode(path string, node GravityNode) error {
	if node.NodeType == NodeOrganization || node.NodeType == NodeProject {
		return ErrGovernedNodeCreation
	}
	if node.NodeType == NodeDomain || node.NodeType == NodeGene {
		return ErrStructuralNodeCreation
	}
	if node.NodeType == NodeNucleus {
		exists, err := s.nucleusExists()
		if err != nil {
			return err
		}
		if exists {
			return ErrNucleusAlreadyExists
		}
	}
	if err := s.requireInside(path); err != nil {
		return err
	}
	if err := validateNode(node); err != nil {
		return err
	}
	if node.NodeVersion != 0 && node.NodeVersion != 1 {
		return fmt.Errorf("nodeVersion inicial debe ser 0 o 1")
	}
	node.NodeVersion = 1
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	lock := flock.New(path + ".lock")
	if err := lock.Lock(); err != nil {
		return err
	}
	defer func() { _ = lock.Unlock() }()
	if _, err := os.Stat(path); err == nil {
		return fmt.Errorf("gravity node ya existe: %s", path)
	} else if !os.IsNotExist(err) {
		return err
	}
	return atomicWriteNode(path, node)
}

func (s *Store) nucleusExists() (bool, error) {
	found := errors.New("gravity NUCLEUS node found")
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
		if node.NodeType == NodeNucleus {
			return found
		}
		return nil
	})
	if errors.Is(err, found) {
		return true, nil
	}
	if err != nil {
		return false, err
	}
	return false, nil
}

// CompareAndSwap serializes writers and rejects a stale expected version.
func (s *Store) CompareAndSwap(path string, expected uint64, mutate func(*GravityNode) error) (uint64, error) {
	if err := s.requireInside(path); err != nil {
		return 0, err
	}
	lock := flock.New(path + ".lock")
	if err := lock.Lock(); err != nil {
		return 0, err
	}
	defer func() { _ = lock.Unlock() }()
	node, err := s.ReadNode(path)
	if err != nil {
		return 0, err
	}
	if node.NodeVersion != expected {
		return node.NodeVersion, fmt.Errorf("%w: expected=%d actual=%d", ErrVersionConflict, expected, node.NodeVersion)
	}
	before, err := json.Marshal(node)
	if err != nil {
		return 0, err
	}
	if err := mutate(&node); err != nil {
		return 0, err
	}
	after, err := json.Marshal(node)
	if err != nil {
		return 0, err
	}
	if string(before) == string(after) {
		return expected, nil
	}
	node.NodeVersion = expected + 1
	if err := validateNode(node); err != nil {
		return 0, err
	}
	if err := atomicWriteNode(path, node); err != nil {
		return 0, err
	}
	return node.NodeVersion, nil
}

func (s *Store) requireInside(path string) error {
	abs, err := filepath.Abs(path)
	if err != nil {
		return err
	}
	rel, err := filepath.Rel(s.Root, abs)
	if err != nil {
		return err
	}
	if rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return fmt.Errorf("path fuera de .gravity: %s", path)
	}
	return nil
}

func validateNode(node GravityNode) error {
	if node.NodeID == "" {
		return errors.New("nodeId obligatorio")
	}
	switch node.NodeType {
	case NodeNucleus, NodeOrganization, NodeProject, NodeMandate, NodeSession, NodeDomain, NodeGene:
	default:
		return fmt.Errorf("nodeType inválido: %q", node.NodeType)
	}
	if node.NodeType == NodeNucleus && node.ParentID != nil {
		return errors.New("NUCLEUS debe tener parentId null")
	}
	if node.NodeType != NodeNucleus && (node.ParentID == nil || *node.ParentID == "") {
		return errors.New("parentId obligatorio fuera de NUCLEUS")
	}
	if node.Status != NodeActive && node.Status != NodeSuperseded {
		return fmt.Errorf("status inválido: %q", node.Status)
	}
	if node.NodeType == NodeDomain {
		if len(node.GravityPostures) != 0 {
			return errors.New("DOMAIN no admite gravityPostures")
		}
		if node.DomainRef == nil || node.DomainRef.SemanticIndexPath != ".cache/.semantic-index.json" {
			return errors.New("DOMAIN requiere domainRef.semanticIndexPath canónico")
		}
		if node.GeneRef != nil || node.SignedBy != nil {
			return errors.New("DOMAIN no admite geneRef ni signedBy")
		}
	}
	if node.NodeType == NodeGene {
		if len(node.GravityPostures) != 0 {
			return errors.New("GENE no admite gravityPostures")
		}
		if node.GeneRef == nil || node.GeneRef.MandateID == "" || node.GeneRef.GenePath == "" {
			return errors.New("GENE requiere geneRef completo")
		}
		if node.ParentID == nil || *node.ParentID != node.GeneRef.MandateID {
			return errors.New("GENE parentId debe coincidir con geneRef.mandateId")
		}
		if err := validateLogicalRelativePath(node.GeneRef.GenePath); err != nil {
			return fmt.Errorf("geneRef.genePath inválido: %w", err)
		}
		if node.DomainRef != nil || node.SignedBy != nil {
			return errors.New("GENE no admite domainRef ni signedBy")
		}
	}
	if node.NodeType != NodeDomain && node.DomainRef != nil {
		return errors.New("domainRef solo es válido para DOMAIN")
	}
	if node.NodeType != NodeGene && node.GeneRef != nil {
		return errors.New("geneRef solo es válido para GENE")
	}
	return nil
}

func validateLogicalRelativePath(value string) error {
	if value == "" || path.IsAbs(value) || strings.Contains(value, "\\") {
		return errors.New("la referencia debe ser relativa y usar separadores '/' controlados")
	}
	clean := path.Clean(value)
	if clean == "." || clean == ".." || strings.HasPrefix(clean, "../") || clean != value {
		return errors.New("la referencia escapa o no está normalizada")
	}
	return nil
}

func atomicWriteNode(path string, node GravityNode) error {
	data, err := json.MarshalIndent(node, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".gravity-node.*.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer func() { _ = os.Remove(tmpPath) }()
	if _, err = tmp.Write(append(data, '\n')); err == nil {
		err = tmp.Sync()
	}
	if closeErr := tmp.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	return os.Rename(tmpPath, path)
}
