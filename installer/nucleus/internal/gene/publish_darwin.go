//go:build darwin

package gene

import (
	"errors"
	"os"
	"syscall"
)

type projectLock struct{ file *os.File }

func acquireProjectLock(path string) (*projectLock, error) {
	f, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, err
	}
	if err = syscall.Flock(int(f.Fd()), syscall.LOCK_EX); err != nil {
		f.Close()
		return nil, err
	}
	return &projectLock{file: f}, nil
}
func (l *projectLock) release() error {
	_ = syscall.Flock(int(l.file.Fd()), syscall.LOCK_UN)
	return l.file.Close()
}
func replaceDurable(source, target string) (bool, error) {
	if err := os.Rename(source, target); err != nil {
		return false, err
	}
	return false, syncDirectory(parentDir(target))
}
func syncDirectory(path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	return f.Sync()
}
func fullSync(f *os.File) (bool, error) {
	_, _, errno := syscall.Syscall(syscall.SYS_FCNTL, f.Fd(), uintptr(51), 0)
	if errno == 0 {
		return false, nil
	}
	if err := f.Sync(); err != nil {
		return true, errors.Join(errno, err)
	}
	return true, nil
}
func syncDurableFile(f *os.File) (bool, error) { return fullSync(f) }
