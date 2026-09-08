//go:build !windows

package mandatedelivery

import (
	"os"
	"path/filepath"
	"syscall"
)

// Lock the filesystem root directory, which exists before and after publication.
// This deliberately serializes stores on this host without creating lock files.
func lockStore(root string) (func(), error) {
	path, err := filepath.Abs(root)
	if err != nil {
		return nil, err
	}
	for {
		parent := filepath.Dir(path)
		if parent == path {
			break
		}
		path = parent
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	if err = syscall.Flock(int(f.Fd()), syscall.LOCK_EX); err != nil {
		f.Close()
		return nil, err
	}
	return func() { syscall.Flock(int(f.Fd()), syscall.LOCK_UN); f.Close() }, nil
}
func publish(source, target string) error {
	if err := os.Rename(source, target); err != nil {
		return err
	}
	for dir := filepath.Dir(target); ; dir = filepath.Dir(dir) {
		f, err := os.Open(dir)
		if err != nil {
			return err
		}
		err = f.Sync()
		f.Close()
		if err != nil {
			return err
		}
		if filepath.Dir(dir) == dir {
			return nil
		}
	}
}
