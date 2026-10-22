//go:build windows

package maintenance

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"golang.org/x/sys/windows"
)

func TestUninstallLockedDestinationPreservesPrevious(t *testing.T) {
	fixture := uninstallBuildFixture(t)
	src := filepath.Join(t.TempDir(), "bloom-uninstall.exe")
	copyUninstallFixture(t, fixture, src)
	dst := filepath.Join(t.TempDir(), "uninstall", "bloom-uninstall.exe")
	if _, err := rolloutUninstall(src, dst, false); err != nil {
		t.Fatal(err)
	}
	previousHash, err := uninstallSHA256File(dst)
	if err != nil {
		t.Fatal(err)
	}
	f, err := os.OpenFile(src, os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.Write([]byte("new content")); err != nil {
		t.Fatal(err)
	}
	if err := f.Close(); err != nil {
		t.Fatal(err)
	}
	name, err := windows.UTF16PtrFromString(dst)
	if err != nil {
		t.Fatal(err)
	}
	handle, err := windows.CreateFile(name, windows.GENERIC_READ, windows.FILE_SHARE_READ, nil, windows.OPEN_EXISTING, windows.FILE_ATTRIBUTE_NORMAL, 0)
	if err != nil {
		t.Fatal(err)
	}
	_, rolloutErr := rolloutUninstall(src, dst, false)
	_ = windows.CloseHandle(handle)
	if rolloutErr == nil {
		t.Fatal("locked destination was replaced")
	}
	if !strings.Contains(rolloutErr.Error(), "in use or cannot be replaced") {
		t.Fatalf("unexpected lock error: %v", rolloutErr)
	}
	if got, err := uninstallSHA256File(dst); err != nil || got != previousHash {
		t.Fatalf("previous executable changed: hash %s, error %v", got, err)
	}
}
