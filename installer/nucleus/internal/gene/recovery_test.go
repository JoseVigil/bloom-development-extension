package gene

import (
	"errors"
	"testing"
)

func TestRecoveryBeforeAndAfterHeadReplace(t *testing.T) {
	for _, point := range []string{"objects_written", "after_head_replace"} {
		t.Run(point, func(t *testing.T) {
			root := t.TempDir()
			s := &Store{Root: root}
			req := fixtureRequest(t, root)
			injected := errors.New("synthetic crash")
			s.hook = func(at string) error {
				if at == point {
					return injected
				}
				return nil
			}
			if _, err := s.Materialize(req); !errors.Is(err, injected) {
				t.Fatalf("%v", err)
			}
			s.hook = nil
			r, err := s.Materialize(req)
			if err != nil {
				t.Fatal(err)
			}
			if point == "objects_written" && r.Status != "committed" {
				t.Fatalf("%#v", r)
			}
			if point == "after_head_replace" && r.Status != "replay" {
				t.Fatalf("%#v", r)
			}
			recovered, err := s.Recover(req.ProjectID)
			if err != nil {
				t.Fatal(err)
			}
			if len(recovered) != 1 || recovered[0].CanonicalCommitDigest != r.CanonicalCommitDigest {
				t.Fatalf("%#v", recovered)
			}
		})
	}
}

func TestProductiveRecoveryPreservesRatificationAndBindings(t *testing.T) {
	root := t.TempDir()
	s, req := productiveRequest(t, root)
	injected := errors.New("productive crash after publish")
	s.hook = func(at string) error {
		if at == "after_head_replace" {
			return injected
		}
		return nil
	}
	if _, err := s.Materialize(req); !errors.Is(err, injected) {
		t.Fatalf("%v", err)
	}
	s.hook = nil
	receipt, err := s.Materialize(req)
	if err != nil {
		t.Fatal(err)
	}
	if !receipt.Replay || receipt.RatificationDigest == "" || len(receipt.RepositoryBindings) != 1 {
		t.Fatalf("%+v", receipt)
	}
	if err = s.VerifyMaterializationReceipt(receipt); err != nil {
		t.Fatal(err)
	}
	recovered, err := s.Recover(req.ProjectID)
	if err != nil || len(recovered) != 1 || recovered[0].RatificationDigest != receipt.RatificationDigest || !equalStrings(recovered[0].RepositoryBindings, receipt.RepositoryBindings) {
		t.Fatalf("recovered=%+v err=%v", recovered, err)
	}
}
