package mandatedelivery

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"sync"
	"testing"
)

func TestProcessInterruption(t *testing.T) {
	if stage := os.Getenv("MANDATE_DELIVERY_TEST_CRASH_STAGE"); stage != "" {
		_, body, ctx := vector(t)
		store := &Store{Root: os.Getenv("MANDATE_DELIVERY_TEST_ROOT"), hook: func(at string) error {
			if at == stage {
				os.Exit(73)
			}
			return nil
		}}
		if _, err := store.Accept(body, ctx); err != nil {
			t.Fatal(err)
		}
		t.Fatal("crash boundary not reached")
	}
	for _, stage := range []string{"before_rename", "after_rename"} {
		t.Run(stage, func(t *testing.T) {
			_, body, ctx := vector(t)
			root := t.TempDir()
			child := exec.Command(os.Args[0], "-test.run=^TestProcessInterruption$")
			child.Env = append(os.Environ(), "MANDATE_DELIVERY_TEST_CRASH_STAGE="+stage, "MANDATE_DELIVERY_TEST_ROOT="+root)
			err := child.Run()
			var exit *exec.ExitError
			if !errors.As(err, &exit) || exit.ExitCode() != 73 {
				t.Fatalf("expected process interruption, got %v", err)
			}
			store := &Store{Root: root}
			result, err := store.Accept(body, ctx)
			want := "accepted"
			if stage == "after_rename" {
				want = "replay"
			}
			if err != nil || result != want {
				t.Fatalf("recovery: %s %v", result, err)
			}
		})
	}
}

func tree(t *testing.T, root string) map[string]string {
	t.Helper()
	out := map[string]string{}
	err := filepath.WalkDir(root, func(p string, e os.DirEntry, err error) error {
		if os.IsNotExist(err) {
			return nil
		}
		if err != nil {
			return err
		}
		if e.IsDir() {
			out[p] = "directory"
		} else {
			b, err := os.ReadFile(p)
			if err != nil {
				return err
			}
			out[p] = string(b)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return out
}
func TestStoreRejectsWithoutMutation(t *testing.T) {
	_, body, ctx := vector(t)
	root := filepath.Join(t.TempDir(), "absent")
	s := &Store{Root: root}
	invalid := body[:len(body)-1]
	before := tree(t, root)
	if _, err := s.Accept(invalid, ctx); err == nil {
		t.Fatal("accepted partial")
	}
	if !reflect.DeepEqual(before, tree(t, root)) {
		t.Fatal("invalid input mutated store")
	}
	if _, err := s.Accept(body, ctx); err != nil {
		t.Fatal(err)
	}
	before = tree(t, root)
	conflict := mutate(t, body, changedBytes, Domain)
	if _, err := s.Accept(conflict, ctx); err == nil {
		t.Fatal("accepted conflicting digest")
	}
	if !reflect.DeepEqual(before, tree(t, root)) {
		t.Fatal("conflict mutated store")
	}
	other := ctx
	other.InstallationID = "second"
	conflict = mutate(t, body, func(d *Delivery) { d.Envelope.InstallationID = "second"; changedBytes(d) }, Domain)
	if _, err := s.Accept(conflict, other); err == nil {
		t.Fatal("accepted cross-installation conflict")
	}
	if !reflect.DeepEqual(before, tree(t, root)) {
		t.Fatal("cross-installation conflict mutated store")
	}
}
func TestSeparateInstallationsAndReissue(t *testing.T) {
	_, body, ctx := vector(t)
	s := &Store{Root: t.TempDir()}
	if _, err := s.Accept(body, ctx); err != nil {
		t.Fatal(err)
	}
	second := mutate(t, body, func(d *Delivery) { d.Envelope.InstallationID = "second" }, Domain)
	other := ctx
	other.InstallationID = "second"
	if result, err := s.Accept(second, other); err != nil || result != "accepted" {
		t.Fatalf("%s %v", result, err)
	}
	reissued := mutate(t, body, func(d *Delivery) { d.Envelope.IssuedAt = "2026-09-07T12:00:01Z" }, Domain)
	before := tree(t, s.Root)
	if result, err := s.Accept(reissued, ctx); err != nil || result != "replay" {
		t.Fatalf("%s %v", result, err)
	}
	if !reflect.DeepEqual(before, tree(t, s.Root)) {
		t.Fatal("reissue mutated store")
	}
}
func TestRecoveryAtPublicationBoundary(t *testing.T) {
	for _, stage := range []string{"before_rename", "after_rename"} {
		t.Run(stage, func(t *testing.T) {
			_, body, ctx := vector(t)
			s := &Store{Root: t.TempDir(), hook: func(s string) error {
				if s == stage {
					return errors.New("simulated interruption")
				}
				return nil
			}}
			if _, err := s.Accept(body, ctx); err == nil {
				t.Fatal("hook not reached")
			}
			restarted := &Store{Root: s.Root}
			result, err := restarted.Accept(body, ctx)
			if err != nil {
				t.Fatal(err)
			}
			expected := "accepted"
			if stage == "after_rename" {
				expected = "replay"
			}
			if result != expected {
				t.Fatal(result)
			}
		})
	}
}
func TestConcurrentAccept(t *testing.T) {
	_, body, ctx := vector(t)
	s := &Store{Root: t.TempDir()}
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := s.Accept(body, ctx); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
}
