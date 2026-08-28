//go:build windows

package mandatestate

import (
	"os"

	"golang.org/x/sys/windows"
)

type fileLock struct {
	file       *os.File
	overlapped windows.Overlapped
}

func acquireFileLock(path string) (*fileLock, error) {
	f, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, err
	}
	lock := &fileLock{file: f}
	if err := windows.LockFileEx(windows.Handle(f.Fd()), windows.LOCKFILE_EXCLUSIVE_LOCK, 0, 1, 0, &lock.overlapped); err != nil {
		_ = f.Close()
		return nil, err
	}
	return lock, nil
}

func (l *fileLock) release() {
	_ = windows.UnlockFileEx(windows.Handle(l.file.Fd()), 0, 1, 0, &l.overlapped)
	_ = l.file.Close()
}

func replaceFile(source, target string) error {
	return windows.MoveFileEx(windows.StringToUTF16Ptr(source), windows.StringToUTF16Ptr(target), windows.MOVEFILE_REPLACE_EXISTING|windows.MOVEFILE_WRITE_THROUGH)
}
