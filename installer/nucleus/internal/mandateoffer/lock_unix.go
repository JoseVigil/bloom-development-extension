//go:build !windows

package mandateoffer

import (
	"os"
	"syscall"
)

// lockDir serializes installs on one .mandates directory across processes.
// It locks the directory itself, never the filesystem root that the delivery
// store locks, so the receipt write inside the critical section cannot deadlock.
func lockDir(dir string) (func(), error) {
	f, err := os.Open(dir)
	if err != nil {
		return nil, err
	}
	if err = syscall.Flock(int(f.Fd()), syscall.LOCK_EX); err != nil {
		f.Close()
		return nil, err
	}
	return func() { syscall.Flock(int(f.Fd()), syscall.LOCK_UN); f.Close() }, nil
}
