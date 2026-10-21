//go:build windows

package mandateoffer

import (
	"crypto/sha256"
	"encoding/hex"
	"path/filepath"
	"runtime"
	"strings"

	"golang.org/x/sys/windows"
)

func lockDir(dir string) (func(), error) {
	absolute, err := filepath.Abs(dir)
	if err != nil {
		return nil, err
	}
	sum := sha256.Sum256([]byte(strings.ToLower(absolute)))
	name, err := windows.UTF16PtrFromString("Local\\BloomMandateOffer-" + hex.EncodeToString(sum[:]))
	if err != nil {
		return nil, err
	}
	handle, err := windows.CreateMutex(nil, false, name)
	if err != nil {
		return nil, err
	}
	runtime.LockOSThread()
	if _, err = windows.WaitForSingleObject(handle, windows.INFINITE); err != nil {
		windows.CloseHandle(handle)
		runtime.UnlockOSThread()
		return nil, err
	}
	return func() { windows.ReleaseMutex(handle); windows.CloseHandle(handle); runtime.UnlockOSThread() }, nil
}
