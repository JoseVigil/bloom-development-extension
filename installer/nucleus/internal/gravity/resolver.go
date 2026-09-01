package gravity

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
)

type ResolveInput struct {
	MandateID  string
	SessionID  string
	IntentType string
	Turn       uint64
	Cache      ResolutionCache
}

type ResolveResult struct {
	Collected []ResolvedPosture `json:"collected"`
	Cache     ResolutionCache   `json:"cache"`
}

func (s *Store) ResolveActive(input ResolveInput) (ResolveResult, error) {
	if input.MandateID == "" || input.SessionID == "" || input.IntentType == "" {
		return ResolveResult{}, errors.New("mandate_id, session_id e intent_type son obligatorios")
	}
	cache := input.Cache
	if len(cache.Spine) == 0 || cache.Spine[len(cache.Spine)-1] != input.MandateID {
		spine, err := s.buildSpine(input.MandateID)
		if err != nil {
			return ResolveResult{}, err
		}
		cache = ResolutionCache{Spine: spine, CachedAtTurn: input.Turn}
	}
	paths, nodes, err := s.readSpine(cache.Spine)
	if err != nil {
		return ResolveResult{}, err
	}
	mandatePath := paths[len(paths)-1]
	sessionPath := filepath.Join(filepath.Dir(mandatePath), ".session", input.SessionID, "node.json")
	session, err := s.ReadNode(sessionPath)
	if err != nil {
		return ResolveResult{}, fmt.Errorf("no pude leer SESSION %s: %w", input.SessionID, err)
	}
	if session.NodeType != NodeSession || session.NodeID != input.SessionID || session.ParentID == nil || *session.ParentID != input.MandateID {
		return ResolveResult{}, fmt.Errorf("SESSION %s no pertenece a MANDATE %s", input.SessionID, input.MandateID)
	}
	nodes = append(nodes, session)
	result := ResolveResult{Cache: cache, Collected: []ResolvedPosture{}}
	for _, node := range nodes {
		if node.Status != NodeActive {
			continue
		}
		for _, posture := range node.GravityPostures {
			if posture.Status != "active" || !applies(posture.AppliesTo, input.IntentType) {
				continue
			}
			result.Collected = append(result.Collected, ResolvedPosture{
				GravityPosture: posture, NodeType: node.NodeType, NodeID: node.NodeID, Masa: ComputeMasa(posture),
			})
		}
	}
	return result, nil
}

func applies(types []string, current string) bool {
	for _, intentType := range types {
		if intentType == current || intentType == "*" {
			return true
		}
	}
	return false
}

func (s *Store) buildSpine(mandateID string) ([]string, error) {
	var found string
	errFound := errors.New("gravity mandate found")
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
		if node.NodeType == NodeMandate && node.NodeID == mandateID {
			found = path
			return errFound
		}
		return nil
	})
	if err != nil && !errors.Is(err, errFound) {
		return nil, err
	}
	if found == "" {
		return nil, fmt.Errorf("MANDATE %s no existe bajo %s", mandateID, s.Root)
	}

	paths := []string{found}
	for dir := filepath.Dir(filepath.Dir(found)); dir != s.Root && dir != filepath.Dir(dir); dir = filepath.Dir(dir) {
		candidate := filepath.Join(dir, "node.json")
		if _, err := os.Stat(candidate); err == nil {
			paths = append(paths, candidate)
		}
	}
	paths = append(paths, filepath.Join(s.Root, "nucleus.node.json"))
	spine := make([]string, 0, len(paths))
	for i := len(paths) - 1; i >= 0; i-- {
		node, err := s.ReadNode(paths[i])
		if err != nil {
			return nil, err
		}
		spine = append(spine, node.NodeID)
	}
	return spine, nil
}

func (s *Store) readSpine(spine []string) ([]string, []GravityNode, error) {
	if len(spine) < 4 {
		return nil, nil, fmt.Errorf("espina inválida: esperaba al menos 4 nodos, recibí %d", len(spine))
	}
	paths := make([]string, len(spine))
	paths[0] = filepath.Join(s.Root, "nucleus.node.json")
	paths[1] = filepath.Join(s.Root, ".organization", spine[1], "node.json")
	paths[2] = filepath.Join(filepath.Dir(paths[1]), ".project", spine[2], "node.json")
	paths[3] = filepath.Join(filepath.Dir(paths[2]), ".mandate", spine[3], "node.json")
	for i := 4; i < len(spine); i++ {
		paths[i] = filepath.Join(filepath.Dir(paths[i-1]), ".submandate", spine[i], "node.json")
	}
	nodes := make([]GravityNode, len(paths))
	for i, path := range paths {
		node, err := s.ReadNode(path)
		if err != nil {
			return nil, nil, err
		}
		if node.NodeID != spine[i] {
			return nil, nil, fmt.Errorf("integridad de espina: path de %s contiene %s", spine[i], node.NodeID)
		}
		if i > 0 && (node.ParentID == nil || *node.ParentID != spine[i-1]) {
			return nil, nil, fmt.Errorf("integridad de espina: parentId de %s no es %s", node.NodeID, spine[i-1])
		}
		nodes[i] = node
	}
	return paths, nodes, nil
}
