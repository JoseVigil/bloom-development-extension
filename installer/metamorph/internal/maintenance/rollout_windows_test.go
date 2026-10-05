//go:build windows

package maintenance

import (
	"path/filepath"
	"testing"
)

func TestSelectOwnedNucleusTermination(t *testing.T) {
	base := `C:\Users\test\AppData\Local\BloomNucleus`
	expectedNode := filepath.Join(base, "bin", "node", "node.exe")
	expectedNucleus := filepath.Join(base, "bin", "nucleus", "nucleus.exe")
	expectedBundle := filepath.Join(base, "bin", "bootstrap", "bundle.js")
	systemNode := `C:\Program Files\nodejs\node.exe`

	tests := []struct {
		name      string
		listener  windowsProcessInfo
		processes map[uint32]windowsProcessInfo
		wantPID   uint32
		wantTree  bool
		wantErr   bool
	}{
		{
			name:      "managed node with nucleus parent selects tree",
			listener:  windowsProcessInfo{PID: 10, ParentPID: 20, ImagePath: expectedNode, CommandLine: `"` + expectedNode + `" "` + expectedBundle + `"`},
			processes: map[uint32]windowsProcessInfo{20: {PID: 20, ImagePath: expectedNucleus}},
			wantPID:   20, wantTree: true,
		},
		{
			name:     "legacy system node with exact bundle selects listener",
			listener: windowsProcessInfo{PID: 10, ImagePath: systemNode, CommandLine: `"` + systemNode + `" "` + expectedBundle + `"`},
			wantPID:  10,
		},
		{
			name:     "unrelated system node rejected",
			listener: windowsProcessInfo{PID: 10, ImagePath: systemNode, CommandLine: `"` + systemNode + `" C:\other\bundle.js`},
			wantErr:  true,
		},
		{
			name:     "partial bundle match rejected",
			listener: windowsProcessInfo{PID: 10, ImagePath: systemNode, CommandLine: `"` + systemNode + `" "` + expectedBundle + `.old"`},
			wantErr:  true,
		},
		{
			name:     "changed executable rejected",
			listener: windowsProcessInfo{PID: 10, ImagePath: `C:\Windows\System32\cmd.exe`, CommandLine: `cmd.exe "` + expectedBundle + `"`},
			wantErr:  true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			lookup := func(pid uint32) (windowsProcessInfo, error) {
				if pid == tc.listener.PID {
					return tc.listener, nil
				}
				if process, ok := tc.processes[pid]; ok {
					return process, nil
				}
				return windowsProcessInfo{}, errTestProcessMissing
			}
			pid, tree, err := selectOwnedNucleusTermination(tc.listener.PID, expectedNode, expectedNucleus, expectedBundle, lookup)
			if tc.wantErr {
				if err == nil {
					t.Fatal("expected rejection")
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if pid != tc.wantPID || tree != tc.wantTree {
				t.Fatalf("selection=(%d,%t), want=(%d,%t)", pid, tree, tc.wantPID, tc.wantTree)
			}
		})
	}
}

var errTestProcessMissing = &testProcessMissingError{}

type testProcessMissingError struct{}

func (*testProcessMissingError) Error() string { return "process missing" }
