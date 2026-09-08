//go:build windows

package mandatedelivery

import (
	"golang.org/x/sys/windows"
	"path/filepath"
	"runtime"
	"strings"
)

func lockStore(root string) (func(), error) {
	absolute, err := filepath.Abs(root)
	if err != nil {
		return nil, err
	}
	name, err := windows.UTF16PtrFromString("Local\\" + component("BloomMandateDelivery-", strings.ToLower(absolute)))
	if err != nil {
		return nil, err
	}
	handle, err := windows.CreateMutex(nil, false, name)
	if err != nil {
		return nil, err
	}
	// Windows mutex ownership belongs to the OS thread, not the goroutine.
	runtime.LockOSThread()
	_, err = windows.WaitForSingleObject(handle, windows.INFINITE)
	if err != nil {
		windows.CloseHandle(handle)
		runtime.UnlockOSThread()
		return nil, err
	}
	return func() { windows.ReleaseMutex(handle); windows.CloseHandle(handle); runtime.UnlockOSThread() }, nil
}
func publish(source, target string) error {
	a, err := windows.UTF16PtrFromString(source)
	if err != nil {
		return err
	}
	b, err := windows.UTF16PtrFromString(target)
	if err != nil {
		return err
	}
	return windows.MoveFileEx(a, b, windows.MOVEFILE_WRITE_THROUGH)
}
