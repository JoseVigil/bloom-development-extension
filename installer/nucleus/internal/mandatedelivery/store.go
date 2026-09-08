package mandatedelivery

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type Receipt struct {
	OrganizationID string    `json:"organization_id"`
	InstallationID string    `json:"installation_id"`
	MandateID      string    `json:"mandate_id"`
	Version        string    `json:"mandate_version"`
	Digest         string    `json:"digest"`
	KeyID          string    `json:"key_id"`
	Domain         string    `json:"domain"`
	AcceptedAt     time.Time `json:"accepted_at"`
	Body           []byte    `json:"body_base64"`
}
type Store struct {
	Root string
	hook func(string) error
}

var processLock sync.Mutex

func component(prefix, value string) string {
	sum := sha256.Sum256([]byte(value))
	return prefix + hex.EncodeToString(sum[:])
}
func (s *Store) path(e Envelope) string {
	return filepath.Join(s.Root, "receipts", component("org-", e.OrganizationID), component("installation-", e.InstallationID), component("mandate-", e.MandateID), component("version-", e.Version), "receipt.json")
}
func (s *Store) check(e Envelope, ctx Context) (bool, error) {
	org := filepath.Join(s.Root, "receipts", component("org-", e.OrganizationID))
	replay := false
	err := filepath.WalkDir(org, func(path string, entry os.DirEntry, err error) error {
		if errors.Is(err, os.ErrNotExist) && path == org {
			return nil
		}
		if err != nil {
			return err
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return errors.New("symlink in receipt store")
		}
		if entry.IsDir() || entry.Name() != "receipt.json" {
			return nil
		}
		raw, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		var r Receipt
		if err = strict(raw, &r); err != nil {
			return err
		}
		other := ctx
		other.InstallationID = r.InstallationID
		d, _, err := Verify(r.Body, other)
		if err != nil {
			return err
		}
		x := d.Envelope
		if s.path(x) != path || r.OrganizationID != x.OrganizationID || r.InstallationID != x.InstallationID || r.MandateID != x.MandateID || r.Version != x.Version || r.Digest != x.Digest || r.KeyID != x.KeyID || r.Domain != Domain || r.AcceptedAt.IsZero() {
			return errors.New("receipt identity mismatch")
		}
		if x.MandateID == e.MandateID && x.Version == e.Version {
			if x.Digest != e.Digest {
				return errors.New("conflicting mandate digest")
			}
			if x.InstallationID == e.InstallationID {
				replay = true
			}
		}
		return nil
	})
	return replay, err
}
func (s *Store) Accept(raw []byte, ctx Context) (string, error) {
	d, _, err := Verify(raw, ctx)
	if err != nil {
		return "", err
	}
	if s == nil || s.Root == "" {
		return "", errors.New("receipt root required")
	}
	processLock.Lock()
	defer processLock.Unlock()
	// Preliminary read prevents even directory/lock creation on known conflicts.
	if replay, err := s.check(d.Envelope, ctx); err != nil {
		return "", err
	} else if replay {
		return "replay", nil
	}
	// OS lock has no durable file; it also protects different processes.
	unlock, err := lockStore(s.Root)
	if err != nil {
		return "", err
	}
	defer unlock()
	if replay, err := s.check(d.Envelope, ctx); err != nil {
		return "", err
	} else if replay {
		return "replay", nil
	}
	e := d.Envelope
	now := time.Now().UTC()
	if ctx.Now != nil {
		now = ctx.Now().UTC()
	}
	receipt := Receipt{e.OrganizationID, e.InstallationID, e.MandateID, e.Version, e.Digest, e.KeyID, Domain, now, append([]byte(nil), raw...)}
	data, err := json.Marshal(receipt)
	if err != nil {
		return "", err
	}
	target := s.path(e)
	dir := filepath.Dir(target)
	if err = os.MkdirAll(dir, 0700); err != nil {
		return "", err
	}
	temp, err := os.CreateTemp(dir, ".delivery-*.tmp")
	if err != nil {
		return "", err
	}
	name := temp.Name()
	defer os.Remove(name)
	if _, err = temp.Write(data); err == nil {
		err = temp.Sync()
	}
	if closeErr := temp.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return "", err
	}
	if s.hook != nil {
		if err = s.hook("before_rename"); err != nil {
			return "", err
		}
	}
	if err = publish(name, target); err != nil {
		return "", err
	}
	if s.hook != nil {
		if err = s.hook("after_rename"); err != nil {
			return "", err
		}
	}
	return "accepted", nil
}
