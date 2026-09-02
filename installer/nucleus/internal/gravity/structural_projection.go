package gravity

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"github.com/gofrs/flock"
)

// StructuralProjectionInput is deliberately package-internal in use: there is
// no productive caller until ownership and authorization are ratified.
type StructuralProjectionInput struct {
	Domains            []DomainProjection
	Genes              []GeneProjection
	Edges              []EdgeProjection
	SupersedeDomainIDs []string
	MaterializedAt     string
}

type DomainProjection struct {
	DomainID        string
	OriginMandateID string
}

type GeneProjection struct {
	GeneID    string
	MandateID string
	GenePath  string
}

type EdgeProjection struct {
	EdgeType StructuralEdgeType
	DomainID string
	TargetID string
	Present  bool
}

type StructuralProjectionEvent struct {
	EventType  string `json:"eventType"`
	ObjectID   string `json:"objectId"`
	ObjectType string `json:"objectType"`
	Status     string `json:"status"`
	Version    uint64 `json:"version,omitempty"`
	Detail     string `json:"detail,omitempty"`
}

type StructuralProjectionResult struct {
	Events []StructuralProjectionEvent `json:"events"`
}

var errStructuralNodeNotFound = errors.New("gravity structural node not found")

// reconcileStructuralProjection materializes an already-confirmed canonical
// projection. It is intentionally unexported and has no Activity/CLI/worker
// caller. The future governed seam owns reading and confirming canonical data.
func (s *Store) reconcileStructuralProjection(input StructuralProjectionInput) (StructuralProjectionResult, error) {
	if input.MaterializedAt == "" {
		return StructuralProjectionResult{}, errors.New("materializedAt obligatorio")
	}
	result := StructuralProjectionResult{Events: []StructuralProjectionEvent{}}
	for _, domain := range input.Domains {
		if err := validateIdentifier(domain.DomainID); err != nil {
			return result, fmt.Errorf("domainId inválido: %w", err)
		}
		mandatePath, err := s.findNodePath(NodeMandate, domain.OriginMandateID)
		if err != nil {
			return result, fmt.Errorf("Mandate de origen %s: %w", domain.OriginMandateID, err)
		}
		node := GravityNode{NodeID: domain.DomainID, NodeType: NodeDomain, ParentID: ptrString(domain.OriginMandateID), GravityPostures: []GravityPosture{}, Status: NodeActive, CreatedAt: input.MaterializedAt, DomainRef: &DomainRef{SemanticIndexPath: ".cache/.semantic-index.json"}}
		path := filepath.Join(filepath.Dir(mandatePath), ".domain", domain.DomainID, "node.json")
		if existingPath, findErr := s.findNodePath(NodeDomain, domain.DomainID); findErr == nil {
			path = existingPath
		} else if !errors.Is(findErr, errStructuralNodeNotFound) {
			return result, findErr
		}
		event, err := s.reconcileStructuralNode(path, node)
		if err != nil {
			return result, err
		}
		if event != nil {
			result.Events = append(result.Events, *event)
		}
	}
	for _, gene := range input.Genes {
		if err := validateIdentifier(gene.GeneID); err != nil {
			return result, fmt.Errorf("geneId inválido: %w", err)
		}
		mandatePath, err := s.findNodePath(NodeMandate, gene.MandateID)
		if err != nil {
			return result, fmt.Errorf("Mandate de Gene %s: %w", gene.MandateID, err)
		}
		node := GravityNode{NodeID: gene.GeneID, NodeType: NodeGene, ParentID: ptrString(gene.MandateID), GravityPostures: []GravityPosture{}, Status: NodeActive, CreatedAt: input.MaterializedAt, GeneRef: &GeneRef{MandateID: gene.MandateID, GenePath: gene.GenePath}}
		path := filepath.Join(filepath.Dir(mandatePath), ".gene", gene.GeneID, "node.json")
		if existingPath, findErr := s.findNodePath(NodeGene, gene.GeneID); findErr == nil {
			path = existingPath
		} else if !errors.Is(findErr, errStructuralNodeNotFound) {
			return result, findErr
		}
		event, err := s.reconcileStructuralNode(path, node)
		if err != nil {
			return result, err
		}
		if event != nil {
			result.Events = append(result.Events, *event)
		}
	}
	for _, domainID := range input.SupersedeDomainIDs {
		path, err := s.findNodePath(NodeDomain, domainID)
		if err != nil {
			return result, err
		}
		node, err := s.ReadNode(path)
		if err != nil {
			return result, err
		}
		if node.Status == NodeSuperseded {
			continue
		}
		version, err := s.CompareAndSwap(path, node.NodeVersion, func(current *GravityNode) error { current.Status = NodeSuperseded; return nil })
		if err != nil {
			return result, err
		}
		result.Events = append(result.Events, StructuralProjectionEvent{EventType: "STRUCTURAL_PROJECTION_SUPERSEDED", ObjectID: domainID, ObjectType: string(NodeDomain), Status: string(NodeSuperseded), Version: version})
	}
	for _, edge := range input.Edges {
		event, err := s.reconcileStructuralEdge(edge, input.MaterializedAt)
		if err != nil {
			return result, err
		}
		if event != nil {
			result.Events = append(result.Events, *event)
		}
	}
	return result, nil
}

func (s *Store) reconcileStructuralNode(path string, desired GravityNode) (*StructuralProjectionEvent, error) {
	if err := validateNode(desired); err != nil {
		return nil, err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return nil, err
	}
	lock := flock.New(path + ".lock")
	if err := lock.Lock(); err != nil {
		return nil, err
	}
	defer func() { _ = lock.Unlock() }()
	existing, err := s.ReadNode(path)
	if errors.Is(err, os.ErrNotExist) {
		desired.NodeVersion = 1
		if err := atomicWriteNode(path, desired); err != nil {
			return nil, err
		}
		return &StructuralProjectionEvent{EventType: "STRUCTURAL_PROJECTION_CREATED", ObjectID: desired.NodeID, ObjectType: string(desired.NodeType), Status: string(desired.Status), Version: 1}, nil
	}
	if err != nil {
		return nil, err
	}
	if existing.NodeType != desired.NodeType || existing.NodeID != desired.NodeID || existing.ParentID == nil || desired.ParentID == nil || *existing.ParentID != *desired.ParentID {
		return nil, fmt.Errorf("proyección estructural existente contradice identidad o parent inmutable: %s", desired.NodeID)
	}
	if existing.Status == desired.Status && refsEqual(existing, desired) {
		return nil, nil
	}
	existing.Status = desired.Status
	existing.DomainRef = desired.DomainRef
	existing.GeneRef = desired.GeneRef
	existing.NodeVersion++
	if err := atomicWriteNode(path, existing); err != nil {
		return nil, err
	}
	return &StructuralProjectionEvent{EventType: "STRUCTURAL_PROJECTION_RECONCILED", ObjectID: desired.NodeID, ObjectType: string(desired.NodeType), Status: string(existing.Status), Version: existing.NodeVersion}, nil
}

func refsEqual(left, right GravityNode) bool {
	a, _ := json.Marshal(struct {
		Domain *DomainRef
		Gene   *GeneRef
	}{left.DomainRef, left.GeneRef})
	b, _ := json.Marshal(struct {
		Domain *DomainRef
		Gene   *GeneRef
	}{right.DomainRef, right.GeneRef})
	return string(a) == string(b)
}

func (s *Store) findNodePath(kind NodeType, id string) (string, error) {
	if err := validateIdentifier(id); err != nil {
		return "", err
	}
	var found string
	stop := errors.New("gravity structural node found")
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
		if node.NodeType == kind && node.NodeID == id {
			found = path
			return stop
		}
		return nil
	})
	if err != nil && !errors.Is(err, stop) {
		return "", err
	}
	if found == "" {
		return "", fmt.Errorf("%w: %s %s no existe bajo %s", errStructuralNodeNotFound, kind, id, s.Root)
	}
	return found, nil
}

func (s *Store) reconcileStructuralEdge(fact EdgeProjection, materializedAt string) (*StructuralProjectionEvent, error) {
	if fact.EdgeType != EdgeDomainGene && fact.EdgeType != EdgeDomainMandate {
		return nil, fmt.Errorf("edgeType inválido: %q", fact.EdgeType)
	}
	if err := validateIdentifier(fact.DomainID); err != nil {
		return nil, err
	}
	if err := validateIdentifier(fact.TargetID); err != nil {
		return nil, err
	}
	kind := "gene"
	if fact.EdgeType == EdgeDomainMandate {
		kind = "mandate"
	}
	edgeID := strings.ToLower(string(fact.EdgeType)) + ":" + fact.DomainID + ":" + fact.TargetID
	status := NodeSuperseded
	if fact.Present {
		status = NodeActive
	}
	edge := StructuralEdge{EdgeID: edgeID, EdgeType: fact.EdgeType, FromNodeID: fact.DomainID, ToNodeID: fact.TargetID, Status: status, CanonicalSource: CanonicalSource{Path: ".cache/.semantic-index.json", Selector: fmt.Sprintf("domains/%s/%ss/%s", fact.DomainID, kind, fact.TargetID), Fingerprint: fingerprintFact(fact)}, MaterializedAt: materializedAt, EdgeVersion: 1}
	dir := filepath.Join(s.Root, ".edges", strings.ToLower(string(fact.EdgeType)))
	file := filepath.Join(dir, fact.DomainID+"__"+fact.TargetID+".json")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, err
	}
	lock := flock.New(file + ".lock")
	if err := lock.Lock(); err != nil {
		return nil, err
	}
	defer func() { _ = lock.Unlock() }()
	existing, err := readStructuralEdge(file)
	if errors.Is(err, os.ErrNotExist) {
		if err := atomicWriteJSON(file, edge); err != nil {
			return nil, err
		}
		return &StructuralProjectionEvent{EventType: edgeEventType(edge.Status), ObjectID: edge.EdgeID, ObjectType: string(edge.EdgeType), Status: string(edge.Status), Version: 1}, nil
	}
	if err != nil {
		return nil, err
	}
	if existing.EdgeID != edge.EdgeID || existing.EdgeType != edge.EdgeType || existing.FromNodeID != edge.FromNodeID || existing.ToNodeID != edge.ToNodeID {
		return nil, errors.New("arista existente contradice identidad inmutable")
	}
	if existing.Status == edge.Status && existing.CanonicalSource == edge.CanonicalSource {
		return nil, nil
	}
	edge.EdgeVersion = existing.EdgeVersion + 1
	if err := atomicWriteJSON(file, edge); err != nil {
		return nil, err
	}
	return &StructuralProjectionEvent{EventType: edgeEventType(edge.Status), ObjectID: edge.EdgeID, ObjectType: string(edge.EdgeType), Status: string(edge.Status), Version: edge.EdgeVersion}, nil
}

func fingerprintFact(fact EdgeProjection) string {
	var canonical []byte
	if fact.EdgeType == EdgeDomainGene {
		canonical, _ = json.Marshal(struct {
			EdgeType StructuralEdgeType `json:"edgeType"`
			DomainID string             `json:"domainId"`
			GeneID   string             `json:"geneId"`
			Present  bool               `json:"present"`
		}{fact.EdgeType, fact.DomainID, fact.TargetID, fact.Present})
	} else {
		canonical, _ = json.Marshal(struct {
			EdgeType  StructuralEdgeType `json:"edgeType"`
			DomainID  string             `json:"domainId"`
			MandateID string             `json:"mandateId"`
			Present   bool               `json:"present"`
		}{fact.EdgeType, fact.DomainID, fact.TargetID, fact.Present})
	}
	sum := sha256.Sum256(canonical)
	return "sha256:" + hex.EncodeToString(sum[:])
}

func readStructuralEdge(path string) (StructuralEdge, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return StructuralEdge{}, err
	}
	var edge StructuralEdge
	if err := json.Unmarshal(raw, &edge); err != nil {
		return StructuralEdge{}, err
	}
	return edge, nil
}

func atomicWriteJSON(path string, value any) error {
	raw, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".gravity-projection.*.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer func() { _ = os.Remove(tmpPath) }()
	if _, err = tmp.Write(append(raw, '\n')); err == nil {
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

func edgeEventType(status NodeStatus) string {
	if status == NodeActive {
		return "STRUCTURAL_EDGE_ACTIVATED"
	}
	return "STRUCTURAL_EDGE_SUPERSEDED"
}

func validateIdentifier(value string) error {
	if value == "" || value == "." || value == ".." || strings.ContainsAny(value, `/\\:`) {
		return errors.New("identificador vacío o no controlado")
	}
	return nil
}

func ptrString(value string) *string { return &value }
