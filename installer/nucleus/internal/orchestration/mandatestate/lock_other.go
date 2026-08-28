//go:build !windows

package mandatestate

import (
	"os"
	"syscall"
)

type fileLock struct{ file *os.File }

func acquireFileLock(path string) (*fileLock, error) {
	f, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, err
	}
	if err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX); err != nil {
		_ = f.Close()
		return nil, err
	}
	return &fileLock{file: f}, nil
}

func (l *fileLock) release() {
	_ = syscall.Flock(int(l.file.Fd()), syscall.LOCK_UN)
	_ = l.file.Close()
}

func replaceFile(source, target string) error { return os.Rename(source, target) }
