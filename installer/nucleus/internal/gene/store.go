package gene

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

var idPattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

type Store struct {
	Root   string
	hook   func(string) error
	Logger EventLogger
}

// EventLogger is the narrow contract implemented by core.Logger. G1 receives
// the logger from its caller so the existing Nucleus logging system remains
// the sole owner of stream registration, rollover and telemetry.json writes.
type EventLogger interface {
	Info(string, ...any)
	Warning(string, ...any)
	Error(string, ...any)
	Success(string, ...any)
}

func (s *Store) logEvent(level, event string, fields map[string]any) {
	if s == nil || s.Logger == nil {
		return
	}
	payload := map[string]any{"event": event, "component": "gene_canonical_store"}
	for key, value := range fields {
		payload[key] = value
	}
	raw, err := canonicalValue(payload)
	if err != nil {
		s.Logger.Error("GENE_TELEMETRY_ENCODING_FAILED: event=%s err=%v", event, err)
		return
	}
	switch level {
	case "SUCCESS":
		s.Logger.Success("%s: %s", event, raw)
	case "WARNING":
		s.Logger.Warning("%s: %s", event, raw)
	case "ERROR":
		s.Logger.Error("%s: %s", event, raw)
	default:
		s.Logger.Info("%s: %s", event, raw)
	}
}

func (s *Store) projectDir(projectID string) (string, error) {
	if projectID == "" {
		return "", ErrProjectIDRequired
	}
	if !idPattern.MatchString(projectID) {
		return "", fmt.Errorf("%w: invalid project_id", ErrProjectIDRequired)
	}
	if s == nil || s.Root == "" {
		return "", errors.New("nucleus root required")
	}
	return filepath.Join(s.Root, ".genes", "projects", projectID), nil
}

func (s *Store) initializeProject(projectID string) (string, error) {
	dir, err := s.projectDir(projectID)
	if err != nil {
		return "", err
	}
	for _, sub := range []string{"", "identities", "revisions", "contributions", "commits", filepath.Join("relations", "domain-gene"), "transactions"} {
		p := filepath.Join(dir, sub)
		_, statErr := os.Stat(p)
		if err = os.MkdirAll(p, 0700); err != nil {
			return "", err
		}
		if errors.Is(statErr, os.ErrNotExist) {
			if err = syncDirectory(filepath.Dir(p)); err != nil {
				return "", err
			}
		}
	}
	return dir, nil
}

func (s *Store) loadHead(projectID string) (Head, string, error) {
	dir, err := s.projectDir(projectID)
	if err != nil {
		return Head{}, "", err
	}
	raw, err := os.ReadFile(filepath.Join(dir, "head.json"))
	if errors.Is(err, os.ErrNotExist) {
		h := Head{SchemaVersion: SchemaVersion, ProjectID: projectID, Genes: map[string]GeneHead{}}
		d, _, e := digestValue(h)
		return h, d, e
	}
	if err != nil {
		return Head{}, "", err
	}
	var h Head
	if err = strictDecode(raw, &h); err != nil {
		return Head{}, "", errors.Join(ErrHeadCorrupt, err)
	}
	if h.SchemaVersion != SchemaVersion || h.ProjectID != projectID || h.Genes == nil {
		return Head{}, "", ErrHeadCorrupt
	}
	d, _, err := digestValue(h)
	if err != nil {
		return Head{}, "", err
	}
	if h.CanonicalCommitDigest != "" {
		if _, err = s.readCommit(projectID, h.CanonicalCommitDigest); err != nil {
			return Head{}, "", errors.Join(ErrHeadCorrupt, err)
		}
	}
	for id, g := range h.Genes {
		if !idPattern.MatchString(id) || g.IdentityRef != filepath.ToSlash(filepath.Join("identities", id+".json")) {
			return Head{}, "", ErrHeadCorrupt
		}
		if _, err = s.readRevision(projectID, g.CurrentRevisionDigest); err != nil {
			return Head{}, "", errors.Join(ErrHeadCorrupt, err)
		}
		identityRaw, readErr := os.ReadFile(filepath.Join(dir, filepath.FromSlash(g.IdentityRef)))
		if readErr != nil {
			return Head{}, "", errors.Join(ErrHeadCorrupt, ErrObjectMissing)
		}
		var identity Identity
		if readErr = strictDecode(identityRaw, &identity); readErr != nil || identity.ProjectID != projectID || identity.GeneID != id {
			return Head{}, "", ErrHeadCorrupt
		}
	}
	return h, d, nil
}

func (s *Store) immutablePath(projectID, collection, id string, contentAddressed bool) (string, error) {
	dir, err := s.projectDir(projectID)
	if err != nil {
		return "", err
	}
	name := id + ".json"
	if contentAddressed {
		name, err = digestFilename(id)
		if err != nil {
			return "", err
		}
	} else if !idPattern.MatchString(id) {
		return "", fmt.Errorf("invalid object id")
	}
	return filepath.Join(dir, collection, name), nil
}

func writeSyncedTemp(dir, pattern string, data []byte) (string, bool, error) {
	f, err := os.CreateTemp(dir, pattern)
	if err != nil {
		return "", false, err
	}
	name := f.Name()
	degraded := false
	if _, err = f.Write(data); err == nil {
		degraded, err = syncDurableFile(f)
	}
	if closeErr := f.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		os.Remove(name)
		return "", degraded, err
	}
	return name, degraded, nil
}

func writeImmutable(path string, data []byte) error {
	if old, err := os.ReadFile(path); err == nil {
		if bytes.Equal(old, data) {
			return nil
		}
		return fmt.Errorf("immutable object differs: %s", path)
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}
	tmp, _, err := writeSyncedTemp(filepath.Dir(path), ".object-*.tmp", data)
	if err != nil {
		return err
	}
	defer os.Remove(tmp)
	if err = os.Link(tmp, path); err != nil {
		if old, readErr := os.ReadFile(path); readErr == nil && bytes.Equal(old, data) {
			return nil
		}
		return err
	}
	return syncDirectory(filepath.Dir(path))
}

func (s *Store) writeObject(projectID, collection, id string, contentAddressed bool, value any) (string, error) {
	path, err := s.immutablePath(projectID, collection, id, contentAddressed)
	if err != nil {
		return "", err
	}
	data, err := canonicalValue(value)
	if err != nil {
		return "", err
	}
	if err = writeImmutable(path, data); err != nil {
		return "", err
	}
	return filepath.ToSlash(strings.TrimPrefix(path, filepath.Clean(filepath.Join(s.Root, ".genes", "projects", projectID))+string(filepath.Separator))), nil
}

func (s *Store) readRevision(projectID, digest string) (Revision, error) {
	path, err := s.immutablePath(projectID, "revisions", digest, true)
	if err != nil {
		return Revision{}, err
	}
	if fromName, e := digestFromFilename(filepath.Base(path)); e != nil || fromName != digest {
		return Revision{}, ErrDigestInvalid
	}
	raw, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return Revision{}, ErrObjectMissing
	}
	if err != nil {
		return Revision{}, err
	}
	var r Revision
	if err = strictDecode(raw, &r); err != nil {
		return Revision{}, err
	}
	payload, err := withoutField(r, "revision_digest")
	if err != nil {
		return Revision{}, err
	}
	actual, _, err := digestValue(payload)
	if err != nil || actual != digest || r.RevisionDigest != digest {
		return Revision{}, ErrRevisionCollision
	}
	return r, nil
}

func (s *Store) readCommit(projectID, digest string) (CanonicalCommit, error) {
	path, err := s.immutablePath(projectID, "commits", digest, true)
	if err != nil {
		return CanonicalCommit{}, err
	}
	if fromName, e := digestFromFilename(filepath.Base(path)); e != nil || fromName != digest {
		return CanonicalCommit{}, ErrDigestInvalid
	}
	raw, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return CanonicalCommit{}, ErrObjectMissing
	}
	if err != nil {
		return CanonicalCommit{}, err
	}
	var c CanonicalCommit
	if err = strictDecode(raw, &c); err != nil {
		return CanonicalCommit{}, err
	}
	payload, err := withoutField(c, "canonical_commit_digest")
	if err != nil {
		return CanonicalCommit{}, err
	}
	actual, _, err := digestValue(payload)
	if err != nil || actual != digest || c.CanonicalCommitDigest != digest {
		return CanonicalCommit{}, ErrObjectMissing
	}
	return c, nil
}

func (s *Store) publishHead(dir string, head Head) (bool, error) {
	data, err := canonicalValue(head)
	if err != nil {
		return false, err
	}
	tmp, degraded, err := writeSyncedTemp(dir, ".head-*.tmp", data)
	if err != nil {
		return degraded, err
	}
	defer os.Remove(tmp)
	if s.hook != nil {
		if err = s.hook("before_head_replace"); err != nil {
			return degraded, err
		}
	}
	if _, err = replaceDurable(tmp, filepath.Join(dir, "head.json")); err != nil {
		return degraded, err
	}
	if s.hook != nil {
		if err = s.hook("after_head_replace"); err != nil {
			return degraded, err
		}
	}
	read, _, err := s.loadHead(head.ProjectID)
	if err != nil {
		return degraded, err
	}
	if read.Generation != head.Generation || read.CanonicalCommitDigest != head.CanonicalCommitDigest {
		return degraded, ErrHeadCorrupt
	}
	return degraded, nil
}

func parentDir(path string) string { return filepath.Dir(path) }

func canonicalJSONLine(v any) ([]byte, error) {
	b, err := canonicalValue(v)
	if err != nil {
		return nil, err
	}
	return append(b, '\n'), nil
}

func cloneHead(h Head) Head {
	raw, _ := json.Marshal(h)
	var out Head
	_ = json.Unmarshal(raw, &out)
	return out
}
