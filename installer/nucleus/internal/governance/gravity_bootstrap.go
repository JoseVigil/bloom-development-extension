package governance

import (
	"errors"
	"fmt"
	"nucleus/internal/core"
	"nucleus/internal/gravity"
	"os"
	"path/filepath"
	"time"
)

const canonicalNucleusID = "nucleus"

func bootstrapGravity(orgID string) error {
	if orgID == "" {
		return errors.New("org_id canónico obligatorio")
	}
	nucleusRoot, err := core.ResolveNucleusRoot("")
	if err != nil {
		return err
	}
	store, err := gravity.NewStore(nucleusRoot)
	if err != nil {
		return err
	}
	if err := store.EnsureLayout(); err != nil {
		return err
	}

	nucleusPath := filepath.Join(store.Root, "nucleus.node.json")
	nucleus, err := store.ReadNode(nucleusPath)
	if os.IsNotExist(err) {
		wanted := gravity.GravityNode{NodeID: canonicalNucleusID, NodeType: gravity.NodeNucleus, Status: gravity.NodeActive, GravityPostures: []gravity.GravityPosture{}, CreatedAt: time.Now().UTC().Format(time.RFC3339Nano)}
		if createErr := store.CreateNode(nucleusPath, wanted); createErr != nil && !errors.Is(createErr, gravity.ErrNucleusAlreadyExists) {
			return fmt.Errorf("create canonical NUCLEUS: %w", createErr)
		}
		nucleus, err = store.ReadNode(nucleusPath)
	}
	if err != nil {
		return fmt.Errorf("read canonical NUCLEUS: %w", err)
	}
	if nucleus.NodeID != canonicalNucleusID || nucleus.NodeType != gravity.NodeNucleus || nucleus.Status != gravity.NodeActive || nucleus.ParentID != nil {
		return errors.New("canonical NUCLEUS is incompatible")
	}

	orgPath := filepath.Join(store.Root, ".organization", orgID, "node.json")
	if existing, readErr := store.ReadNode(orgPath); readErr == nil {
		return validateBootstrapOrganization(existing, orgID)
	} else if !os.IsNotExist(readErr) {
		return readErr
	}

	decision, err := AuthorizeGravityNodeCreation(OpCreateOrganization, orgID, nil, nil)
	if err != nil {
		return fmt.Errorf("authorize ORGANIZATION creation: %w", err)
	}
	parentID := nucleus.NodeID
	wanted := gravity.GravityNode{NodeID: orgID, NodeType: gravity.NodeOrganization, ParentID: &parentID, Status: gravity.NodeActive, GravityPostures: []gravity.GravityPosture{}, CreatedAt: time.Now().UTC().Format(time.RFC3339Nano)}
	if err := store.CreateGovernedNode(decision, wanted); err != nil {
		if !errors.Is(err, gravity.ErrOrganizationExists) {
			return fmt.Errorf("create ORGANIZATION: %w", err)
		}
	}
	existing, err := store.ReadNode(orgPath)
	if err != nil {
		return fmt.Errorf("read canonical ORGANIZATION: %w", err)
	}
	return validateBootstrapOrganization(existing, orgID)
}

func validateBootstrapOrganization(node gravity.GravityNode, orgID string) error {
	if node.NodeID != orgID || node.NodeType != gravity.NodeOrganization || node.Status != gravity.NodeActive || node.ParentID == nil || *node.ParentID != canonicalNucleusID {
		return errors.New("canonical ORGANIZATION is incompatible")
	}
	return nil
}
