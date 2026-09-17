//go:build windows

package gene

import (
	"os"

	"golang.org/x/sys/windows"
)

type projectLock struct {
	file       *os.File
	overlapped windows.Overlapped
}

func acquireProjectLock(path string) (*projectLock, error) {
	f, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, err
	}
	l := &projectLock{file: f}
	if err = windows.LockFileEx(windows.Handle(f.Fd()), windows.LOCKFILE_EXCLUSIVE_LOCK, 0, 1, 0, &l.overlapped); err != nil {
		f.Close()
		return nil, err
	}
	return l, nil
}
func (l *projectLock) release() error {
	_ = windows.UnlockFileEx(windows.Handle(l.file.Fd()), 0, 1, 0, &l.overlapped)
	return l.file.Close()
}
func replaceDurable(source, target string) (bool, error) {
	a, err := windows.UTF16PtrFromString(source)
	if err != nil {
		return false, err
	}
	b, err := windows.UTF16PtrFromString(target)
	if err != nil {
		return false, err
	}
	return false, windows.MoveFileEx(a, b, windows.MOVEFILE_REPLACE_EXISTING|windows.MOVEFILE_WRITE_THROUGH)
}
func syncDirectory(string) error               { return nil }
func syncDurableFile(f *os.File) (bool, error) { return false, f.Sync() }
