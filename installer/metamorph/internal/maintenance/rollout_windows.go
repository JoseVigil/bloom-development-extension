//go:build windows

package maintenance

import (
	"bufio"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
	"unsafe"

	"metamorph/internal/core"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/svc"
	"golang.org/x/sys/windows/svc/mgr"
)

func scheduleMetamorphSelfRollout(
	c *core.Core,
	repoRoot, src, dst string,
) (*rolloutHandoff, error) {
	currentExe, err := os.Executable()
	if err != nil {
		return nil, fmt.Errorf("resolve current executable: %w", err)
	}
	currentExe, err = filepath.Abs(currentExe)
	if err != nil {
		return nil, fmt.Errorf("resolve current executable path: %w", err)
	}

	expectedSourceDir := nativeBin(repoRoot, "metamorph")
	expectedSourceExe := filepath.Join(expectedSourceDir, "metamorph.exe")
	expectedDestinationDir := filepath.Join(core.GetBaseAppDataPath(), "bin", "metamorph")
	expectedDestinationExe := filepath.Join(expectedDestinationDir, "metamorph.exe")

	if !sameWindowsPath(src, expectedSourceDir) {
		return nil, fmt.Errorf("unexpected Metamorph source %s; expected %s", src, expectedSourceDir)
	}
	if !sameWindowsPath(dst, expectedDestinationDir) {
		return nil, fmt.Errorf("unexpected Metamorph destination %s; expected %s", dst, expectedDestinationDir)
	}
	if !sameWindowsPath(currentExe, expectedDestinationExe) {
		return nil, nil
	}

	sourceInfo, err := os.Stat(expectedSourceExe)
	if err != nil {
		return nil, fmt.Errorf("candidate executable unavailable: %w", err)
	}
	if sourceInfo.IsDir() {
		return nil, fmt.Errorf("candidate executable is a directory: %s", expectedSourceExe)
	}

	sourceHash, err := sha256File(expectedSourceExe)
	if err != nil {
		return nil, fmt.Errorf("hash candidate executable: %w", err)
	}

	rolloutID, err := newMetamorphRolloutID()
	if err != nil {
		return nil, fmt.Errorf("create rollout ID: %w", err)
	}

	basePath := core.GetBaseAppDataPath()
	runPath := filepath.Join(basePath, "run")
	binPath := filepath.Join(basePath, "bin")
	stagePath := filepath.Join(binPath, ".metamorph-rollout-"+rolloutID)
	backupPath := filepath.Join(binPath, ".metamorph-backup-"+rolloutID)
	requestPath := filepath.Join(runPath, "metamorph-rollout-"+rolloutID+".request.json")
	receiptPath := filepath.Join(runPath, "metamorph-rollout-"+rolloutID+".json")
	relayLogPath := filepath.Join(runPath, "metamorph-rollout-"+rolloutID+".log")

	if err := os.MkdirAll(runPath, 0o755); err != nil {
		return nil, fmt.Errorf("create run directory: %w", err)
	}
	if err := os.RemoveAll(stagePath); err != nil {
		return nil, fmt.Errorf("clean staging directory: %w", err)
	}
	if err := os.RemoveAll(backupPath); err != nil {
		return nil, fmt.Errorf("clean backup directory: %w", err)
	}
	if err := os.MkdirAll(stagePath, 0o755); err != nil {
		return nil, fmt.Errorf("create staging directory: %w", err)
	}

	filesCopied, err := copyDir(expectedSourceDir, stagePath)
	if err != nil {
		_ = os.RemoveAll(stagePath)
		return nil, fmt.Errorf("stage Metamorph candidate: %w", err)
	}
	if filesCopied == 0 {
		_ = os.RemoveAll(stagePath)
		return nil, fmt.Errorf("staged Metamorph candidate is empty")
	}

	stagedHash, err := sha256File(filepath.Join(stagePath, "metamorph.exe"))
	if err != nil {
		_ = os.RemoveAll(stagePath)
		return nil, fmt.Errorf("hash staged executable: %w", err)
	}
	if !strings.EqualFold(stagedHash, sourceHash) {
		_ = os.RemoveAll(stagePath)
		return nil, fmt.Errorf("staged executable hash mismatch: source %s, staged %s", sourceHash, stagedHash)
	}

	// Open a real inheritable handle before starting the relay. The inherited
	// handle remains valid after this process exits, so the relay never needs
	// to race an OpenProcess call against parent shutdown.
	parentHandle, err := windows.OpenProcess(
		windows.SYNCHRONIZE|windows.PROCESS_QUERY_LIMITED_INFORMATION,
		true,
		uint32(os.Getpid()),
	)
	if err != nil {
		_ = os.RemoveAll(stagePath)
		return nil, fmt.Errorf("open inheritable parent handle: %w", err)
	}
	defer windows.CloseHandle(parentHandle)

	request := metamorphRelayRequest{
		RolloutID: rolloutID, ParentPID: os.Getpid(), ParentHandle: uint64(parentHandle), ParentExe: expectedDestinationExe,
		RepoRoot: repoRoot, SourceDir: expectedSourceDir, SourceExe: expectedSourceExe,
		SourceSHA256: sourceHash, DestinationDir: expectedDestinationDir,
		DestinationExe: expectedDestinationExe, StageDir: stagePath, BackupDir: backupPath,
		ReceiptPath: receiptPath, RelayLogPath: relayLogPath,
	}
	if err := writeJSONFile(requestPath, request); err != nil {
		_ = os.RemoveAll(stagePath)
		return nil, fmt.Errorf("write relay request: %w", err)
	}

	pendingReceipt := metamorphRelayReceipt{
		RolloutID: rolloutID, Component: "metamorph", Status: "pending",
		SourceSHA256: sourceHash, Destination: expectedDestinationDir,
	}
	if err := writeJSONFile(receiptPath, pendingReceipt); err != nil {
		_ = os.Remove(requestPath)
		_ = os.RemoveAll(stagePath)
		return nil, fmt.Errorf("write pending receipt: %w", err)
	}

	logFile, err := os.OpenFile(relayLogPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		_ = os.Remove(requestPath)
		_ = os.Remove(receiptPath)
		_ = os.RemoveAll(stagePath)
		return nil, fmt.Errorf("open relay log: %w", err)
	}
	relay := exec.Command(expectedSourceExe, "__rollout-relay", "--request", requestPath)
	relay.Stdout = logFile
	relay.Stderr = logFile
	relay.SysProcAttr = &syscall.SysProcAttr{
		CreationFlags: windows.CREATE_NEW_PROCESS_GROUP | windows.DETACHED_PROCESS,
		HideWindow:    true,
		AdditionalInheritedHandles: []syscall.Handle{
			syscall.Handle(parentHandle),
		},
	}
	if err := relay.Start(); err != nil {
		logFile.Close()
		_ = os.Remove(requestPath)
		_ = os.Remove(receiptPath)
		_ = os.RemoveAll(stagePath)
		return nil, fmt.Errorf("start Metamorph relay: %w", err)
	}
	logFile.Close()
	if err := relay.Process.Release(); err != nil {
		return nil, fmt.Errorf("release Metamorph relay process: %w", err)
	}

	c.Logger.Info("Metamorph self-rollout handed to candidate %s", expectedSourceExe)
	return &rolloutHandoff{
		Component: "metamorph", RolloutID: rolloutID, Status: "pending",
		Source: expectedSourceDir, Destination: expectedDestinationDir, ReceiptPath: receiptPath,
	}, nil
}

func runMetamorphRelay(c *core.Core, requestPath string) error {
	request, err := readMetamorphRelayRequest(requestPath)
	if err != nil {
		return err
	}
	defer os.Remove(requestPath)
	receipt := metamorphRelayReceipt{
		RolloutID: request.RolloutID, Component: "metamorph", Status: "error",
		SourceSHA256: request.SourceSHA256, Destination: request.DestinationDir,
	}
	installedHash, rollbackPerformed, relayErr := executeMetamorphRelay(request)
	receipt.RollbackPerformed = rollbackPerformed
	receipt.CompletedAt = time.Now().UTC().Format(time.RFC3339Nano)
	if relayErr != nil {
		// If the relay failed before activation, staging is no longer useful.
		// executeMetamorphRelay performs its own destination rollback whenever
		// the swap had already begun; the diagnostic receipt/log are retained.
		_ = os.RemoveAll(request.StageDir)
		receipt.Error = relayErr.Error()
		if writeErr := writeJSONFile(request.ReceiptPath, receipt); writeErr != nil {
			return fmt.Errorf("%v; additionally failed to write relay receipt: %w", relayErr, writeErr)
		}
		return relayErr
	}
	receipt.Status = "success"
	receipt.InstalledSHA256 = installedHash
	if err := writeJSONFile(request.ReceiptPath, receipt); err != nil {
		return fmt.Errorf("write successful relay receipt: %w", err)
	}
	return nil
}

func executeMetamorphRelay(request metamorphRelayRequest) (installedHash string, rollbackPerformed bool, err error) {
	if err := validateMetamorphRelayRequest(request); err != nil {
		return "", false, err
	}
	parentHandle := windows.Handle(request.ParentHandle)
	if parentHandle == 0 {
		return "", false, fmt.Errorf("relay request has invalid inherited parent handle")
	}
	defer windows.CloseHandle(parentHandle)
	parentPID, err := windows.GetProcessId(parentHandle)
	if err != nil {
		return "", false, fmt.Errorf("inspect inherited parent handle: %w", err)
	}
	if parentPID != uint32(request.ParentPID) {
		return "", false, fmt.Errorf("inherited parent handle PID mismatch: expected %d, got %d", request.ParentPID, parentPID)
	}
	sourceHash, err := sha256File(request.SourceExe)
	if err != nil {
		return "", false, fmt.Errorf("rehash source candidate: %w", err)
	}
	if !strings.EqualFold(sourceHash, request.SourceSHA256) {
		return "", false, fmt.Errorf("source candidate changed after handoff: expected %s, got %s", request.SourceSHA256, sourceHash)
	}
	waitResult, err := windows.WaitForSingleObject(parentHandle, windows.INFINITE)
	if err != nil {
		return "", false, fmt.Errorf("wait for parent exit: %w", err)
	}
	if waitResult != windows.WAIT_OBJECT_0 {
		return "", false, fmt.Errorf("unexpected parent wait result: %d", waitResult)
	}

	if _, err := os.Stat(request.BackupDir); err == nil {
		return "", false, fmt.Errorf("backup path already exists: %s", request.BackupDir)
	} else if !os.IsNotExist(err) {
		return "", false, fmt.Errorf("inspect backup path: %w", err)
	}
	destinationExisted := false
	if _, err := os.Stat(request.DestinationDir); err == nil {
		destinationExisted = true
		if err := os.MkdirAll(request.BackupDir, 0o755); err != nil {
			return "", false, fmt.Errorf("create Metamorph backup directory: %w", err)
		}
		if _, err := copyDir(request.DestinationDir, request.BackupDir); err != nil {
			_ = os.RemoveAll(request.BackupDir)
			return "", false, fmt.Errorf("copy installed Metamorph to backup: %w", err)
		}
	} else if !os.IsNotExist(err) {
		return "", false, fmt.Errorf("inspect destination: %w", err)
	}

	restoreBackup := func(cause error) (string, bool, error) {
		if !destinationExisted {
			_ = os.RemoveAll(request.DestinationDir)
			return "", false, cause
		}
		if _, restoreErr := copyDir(request.BackupDir, request.DestinationDir); restoreErr != nil {
			return "", true, fmt.Errorf("%v; rollback failed: %w", cause, restoreErr)
		}
		return "", true, cause
	}
	if err := os.MkdirAll(request.DestinationDir, 0o755); err != nil {
		return restoreBackup(fmt.Errorf("create Metamorph destination: %w", err))
	}
	if _, err := copyDir(request.StageDir, request.DestinationDir); err != nil {
		return restoreBackup(fmt.Errorf("activate staged Metamorph files: %w", err))
	}
	installedHash, err = sha256File(request.DestinationExe)
	if err != nil {
		return restoreBackup(fmt.Errorf("hash installed Metamorph: %w", err))
	}
	if !strings.EqualFold(installedHash, request.SourceSHA256) {
		return restoreBackup(fmt.Errorf("installed hash mismatch: expected %s, got %s", request.SourceSHA256, installedHash))
	}
	verifyCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	output, verifyErr := exec.CommandContext(verifyCtx, request.DestinationExe, "version").CombinedOutput()
	if verifyErr != nil {
		return restoreBackup(fmt.Errorf("new Metamorph failed startup verification: %w (%s)", verifyErr, strings.TrimSpace(string(output))))
	}
	if destinationExisted {
		if err := os.RemoveAll(request.BackupDir); err != nil {
			return installedHash, false, fmt.Errorf("deployment succeeded but backup cleanup failed: %w", err)
		}
	}
	if err := os.RemoveAll(request.StageDir); err != nil {
		return installedHash, false, fmt.Errorf("deployment succeeded but staging cleanup failed: %w", err)
	}
	return installedHash, false, nil
}

func validateMetamorphRelayRequest(request metamorphRelayRequest) error {
	if request.RolloutID == "" {
		return fmt.Errorf("relay request has no rollout ID")
	}
	if request.ParentPID <= 0 {
		return fmt.Errorf("relay request has invalid parent PID")
	}
	if request.ParentHandle == 0 {
		return fmt.Errorf("relay request has invalid parent handle")
	}
	basePath := core.GetBaseAppDataPath()
	expectedDestinationDir := filepath.Join(basePath, "bin", "metamorph")
	expectedDestinationExe := filepath.Join(expectedDestinationDir, "metamorph.exe")
	expectedSourceDir := nativeBin(request.RepoRoot, "metamorph")
	expectedSourceExe := filepath.Join(expectedSourceDir, "metamorph.exe")
	expectedRunDir := filepath.Join(basePath, "run")
	expectedBinDir := filepath.Join(basePath, "bin")
	if !sameWindowsPath(request.ParentExe, expectedDestinationExe) {
		return fmt.Errorf("relay parent path is outside installed Metamorph")
	}
	if !sameWindowsPath(request.SourceDir, expectedSourceDir) || !sameWindowsPath(request.SourceExe, expectedSourceExe) {
		return fmt.Errorf("relay source does not match repository build output")
	}
	if !sameWindowsPath(request.DestinationDir, expectedDestinationDir) || !sameWindowsPath(request.DestinationExe, expectedDestinationExe) {
		return fmt.Errorf("relay destination does not match installed Metamorph")
	}
	if !sameWindowsPath(filepath.Dir(request.StageDir), expectedBinDir) || filepath.Base(request.StageDir) != ".metamorph-rollout-"+request.RolloutID {
		return fmt.Errorf("invalid Metamorph staging path")
	}
	if !sameWindowsPath(filepath.Dir(request.BackupDir), expectedBinDir) || filepath.Base(request.BackupDir) != ".metamorph-backup-"+request.RolloutID {
		return fmt.Errorf("invalid Metamorph backup path")
	}
	if !sameWindowsPath(filepath.Dir(request.ReceiptPath), expectedRunDir) {
		return fmt.Errorf("invalid Metamorph receipt path")
	}
	if !sameWindowsPath(filepath.Dir(request.RelayLogPath), expectedRunDir) {
		return fmt.Errorf("invalid Metamorph relay log path")
	}
	relayExe, err := os.Executable()
	if err != nil {
		return fmt.Errorf("resolve relay executable: %w", err)
	}
	if !sameWindowsPath(relayExe, expectedSourceExe) {
		return fmt.Errorf("relay is not running from candidate executable: %s", relayExe)
	}
	stageHash, err := sha256File(filepath.Join(request.StageDir, "metamorph.exe"))
	if err != nil {
		return fmt.Errorf("hash staged executable: %w", err)
	}
	if !strings.EqualFold(stageHash, request.SourceSHA256) {
		return fmt.Errorf("staged executable hash mismatch: expected %s, got %s", request.SourceSHA256, stageHash)
	}
	return nil
}

func readMetamorphRelayRequest(path string) (metamorphRelayRequest, error) {
	var request metamorphRelayRequest
	data, err := os.ReadFile(path)
	if err != nil {
		return request, fmt.Errorf("read relay request: %w", err)
	}
	if err := json.Unmarshal(data, &request); err != nil {
		return request, fmt.Errorf("decode relay request: %w", err)
	}
	return request, nil
}

func writeJSONFile(path string, value any) error {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, ".metamorph-json-*")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	oldPtr, err := windows.UTF16PtrFromString(tmpPath)
	if err != nil {
		return err
	}
	newPtr, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return err
	}
	return windows.MoveFileEx(oldPtr, newPtr, windows.MOVEFILE_REPLACE_EXISTING|windows.MOVEFILE_WRITE_THROUGH)
}

func sha256File(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:]), nil
}

func newMetamorphRolloutID() (string, error) {
	var value [16]byte
	if _, err := rand.Read(value[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(value[:]), nil
}

type windowsProcessInfo struct {
	PID       uint32
	ParentPID uint32
	ImagePath string
}

// stopOwnedNucleusProcesses removes a Control Plane left behind by an older
// Nucleus generation. It never terminates a process merely because it owns
// port 48215 or is named node.exe: the listener image must be the exact Node
// binary in this Bloom installation. When its live ancestry also contains the
// exact installed nucleus.exe, the complete old generation is terminated;
// otherwise only the verified Bloom Node listener is targeted.
func stopOwnedNucleusProcesses(basePath string) error {
	pid, err := windowsListenerPID(48215)
	if err != nil {
		return err
	}

	expectedNode := filepath.Join(basePath, "bin", "node", "node.exe")
	expectedNucleus := filepath.Join(basePath, "bin", "nucleus", "nucleus.exe")
	if pid != 0 {
		targetPID, tree, selectErr := selectOwnedNucleusTermination(pid, expectedNode, expectedNucleus, inspectWindowsProcess)
		if selectErr != nil {
			return selectErr
		}
		// Close the PID-reuse race between discovery and termination. The port
		// must still belong to the same PID, and the selected target must still
		// resolve to the exact Bloom executable used to authorize the action.
		currentListener, listenerErr := windowsListenerPID(48215)
		if listenerErr != nil {
			return listenerErr
		}
		if currentListener != pid {
			return fmt.Errorf("port 48215 owner changed during verification (was PID %d, now PID %d); refusing termination", pid, currentListener)
		}
		expectedTarget := expectedNode
		if tree {
			expectedTarget = expectedNucleus
		}
		if err := validateWindowsTerminationTarget(targetPID, expectedTarget, inspectWindowsProcess); err != nil {
			return err
		}
		if err := taskkillVerifiedPID(targetPID, tree); err != nil {
			return err
		}
		if err := waitForWindowsPIDExit(targetPID, 10*time.Second); err != nil {
			return err
		}
	}

	// A previous Nucleus generation may no longer own the Control Plane port
	// but still keep nucleus.exe mapped, which prevents Windows from replacing
	// the binary. After SCM is stopped, terminate every remaining generation
	// whose full executable path exactly matches this Bloom installation.
	return stopInstalledNucleusGenerations(expectedNucleus)
}

func stopInstalledNucleusGenerations(expectedNucleus string) error {
	processes, err := inspectWindowsProcessesNamed("nucleus.exe")
	if err != nil {
		return fmt.Errorf("could not inspect remaining Nucleus generations: %w", err)
	}
	for _, proc := range processes {
		if !sameWindowsPath(proc.ImagePath, expectedNucleus) {
			continue
		}
		if err := validateWindowsTerminationTarget(proc.PID, expectedNucleus, inspectWindowsProcess); err != nil {
			// An ancestor killed earlier in this loop may already have removed
			// this child. A disappeared PID is therefore an idempotent success.
			if _, inspectErr := inspectWindowsProcess(proc.PID); inspectErr != nil {
				continue
			}
			return err
		}
		if err := taskkillVerifiedPID(proc.PID, true); err != nil {
			return err
		}
		if err := waitForWindowsPIDExit(proc.PID, 10*time.Second); err != nil {
			return err
		}
	}
	return nil
}

func validateWindowsTerminationTarget(pid uint32, expectedPath string, lookup func(uint32) (windowsProcessInfo, error)) error {
	proc, err := lookup(pid)
	if err != nil {
		return fmt.Errorf("verified Bloom PID %d disappeared before termination: %w", pid, err)
	}
	if !sameWindowsPath(proc.ImagePath, expectedPath) {
		return fmt.Errorf("PID %d changed identity before termination (%s, expected %s); refusing termination", pid, proc.ImagePath, expectedPath)
	}
	return nil
}

func selectOwnedNucleusTermination(listenerPID uint32, expectedNode, expectedNucleus string, lookup func(uint32) (windowsProcessInfo, error)) (uint32, bool, error) {
	listener, err := lookup(listenerPID)
	if err != nil {
		return 0, false, fmt.Errorf("port 48215 owner PID %d could not be inspected: %w", listenerPID, err)
	}
	if !sameWindowsPath(listener.ImagePath, expectedNode) {
		return 0, false, fmt.Errorf("port 48215 is owned by unverified PID %d (%s); expected Bloom Node at %s", listenerPID, listener.ImagePath, expectedNode)
	}

	seen := map[uint32]bool{listener.PID: true}
	parentPID := listener.ParentPID
	for depth := 0; parentPID != 0 && depth < 64 && !seen[parentPID]; depth++ {
		seen[parentPID] = true
		parent, parentErr := lookup(parentPID)
		if parentErr != nil {
			break
		}
		if sameWindowsPath(parent.ImagePath, expectedNucleus) {
			return parent.PID, true, nil
		}
		parentPID = parent.ParentPID
	}

	// The exact installed Node path is independently verifiable ownership.
	// If its parent already exited, limit the blast radius to the listener.
	return listener.PID, false, nil
}

func sameWindowsPath(a, b string) bool {
	a = strings.TrimPrefix(filepath.Clean(a), `\\?\`)
	b = strings.TrimPrefix(filepath.Clean(b), `\\?\`)
	return strings.EqualFold(a, b)
}

func windowsListenerPID(port int) (uint32, error) {
	out, err := exec.Command("netstat", "-ano", "-p", "tcp").Output()
	if err != nil {
		return 0, fmt.Errorf("could not inspect TCP listeners: %w", err)
	}
	wanted := ":" + strconv.Itoa(port)
	scanner := bufio.NewScanner(strings.NewReader(string(out)))
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) < 5 || !strings.EqualFold(fields[0], "TCP") || !strings.EqualFold(fields[3], "LISTENING") {
			continue
		}
		if !strings.HasSuffix(fields[1], wanted) {
			continue
		}
		pid, parseErr := strconv.ParseUint(fields[4], 10, 32)
		if parseErr != nil {
			return 0, fmt.Errorf("invalid listener PID %q for port %d: %w", fields[4], port, parseErr)
		}
		return uint32(pid), nil
	}
	if err := scanner.Err(); err != nil {
		return 0, fmt.Errorf("could not parse TCP listeners: %w", err)
	}
	return 0, nil
}

func inspectWindowsProcess(pid uint32) (windowsProcessInfo, error) {
	snapshot, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return windowsProcessInfo{}, err
	}
	defer windows.CloseHandle(snapshot)

	entry := windows.ProcessEntry32{Size: uint32(unsafe.Sizeof(windows.ProcessEntry32{}))}
	if err := windows.Process32First(snapshot, &entry); err != nil {
		return windowsProcessInfo{}, err
	}
	for {
		if entry.ProcessID == pid {
			imagePath, pathErr := windowsProcessImagePath(pid)
			if pathErr != nil {
				return windowsProcessInfo{}, pathErr
			}
			return windowsProcessInfo{PID: pid, ParentPID: entry.ParentProcessID, ImagePath: imagePath}, nil
		}
		if err := windows.Process32Next(snapshot, &entry); err != nil {
			break
		}
	}
	return windowsProcessInfo{}, fmt.Errorf("PID %d no longer exists", pid)
}

func inspectWindowsProcessesNamed(name string) ([]windowsProcessInfo, error) {
	snapshot, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return nil, err
	}
	defer windows.CloseHandle(snapshot)

	entry := windows.ProcessEntry32{Size: uint32(unsafe.Sizeof(windows.ProcessEntry32{}))}
	if err := windows.Process32First(snapshot, &entry); err != nil {
		return nil, err
	}
	var result []windowsProcessInfo
	for {
		if strings.EqualFold(windows.UTF16ToString(entry.ExeFile[:]), name) {
			imagePath, pathErr := windowsProcessImagePath(entry.ProcessID)
			if pathErr != nil {
				return nil, fmt.Errorf("could not verify %s PID %d: %w", name, entry.ProcessID, pathErr)
			}
			result = append(result, windowsProcessInfo{
				PID:       entry.ProcessID,
				ParentPID: entry.ParentProcessID,
				ImagePath: imagePath,
			})
		}
		if err := windows.Process32Next(snapshot, &entry); err != nil {
			break
		}
	}
	return result, nil
}

func windowsProcessImagePath(pid uint32) (string, error) {
	h, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
	if err != nil {
		return "", err
	}
	defer windows.CloseHandle(h)
	return windowsProcessImagePathFromHandle(h)
}

func windowsProcessImagePathFromHandle(h windows.Handle) (string, error) {
	buf := make([]uint16, 32768)
	size := uint32(len(buf))
	if err := windows.QueryFullProcessImageName(h, 0, &buf[0], &size); err != nil {
		return "", err
	}
	return windows.UTF16ToString(buf[:size]), nil
}

func taskkillVerifiedPID(pid uint32, tree bool) error {
	args := []string{"/PID", strconv.FormatUint(uint64(pid), 10), "/F"}
	if tree {
		args = append(args, "/T")
	}
	out, err := exec.Command("taskkill", args...).CombinedOutput()
	if err != nil {
		if _, inspectErr := inspectWindowsProcess(pid); inspectErr != nil {
			return nil
		}
		return fmt.Errorf("could not terminate verified Bloom PID %d: %w (%s)", pid, err, strings.TrimSpace(string(out)))
	}
	return nil
}

func waitForWindowsPIDExit(pid uint32, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if _, err := inspectWindowsProcess(pid); err != nil {
			return nil
		}
		time.Sleep(100 * time.Millisecond)
	}
	return fmt.Errorf("verified Bloom PID %d is still running after termination", pid)
}

// ensureElevated checks if the process is running as administrator.
// If not, it re-launches itself with UAC elevation and exits the current process.
func ensureElevated() error {
	elevated, err := isElevated()
	if err != nil {
		return fmt.Errorf("could not check elevation status: %w", err)
	}
	if elevated {
		return nil
	}

	// Re-launch with elevation via ShellExecuteW "runas".
	exe, err := os.Executable()
	if err != nil {
		return fmt.Errorf("could not determine executable path: %w", err)
	}

	// Build the original args string to pass through.
	args := strings.Join(os.Args[1:], " ")

	verbPtr, _ := windows.UTF16PtrFromString("runas")
	exePtr, _ := windows.UTF16PtrFromString(exe)
	argsPtr, _ := windows.UTF16PtrFromString(args)
	cwdPtr, _ := windows.UTF16PtrFromString(".")

	err = windows.ShellExecute(0, verbPtr, exePtr, argsPtr, cwdPtr, windows.SW_NORMAL)
	if err != nil {
		return fmt.Errorf("UAC elevation failed: %w", err)
	}

	// The elevated process is now running — exit this non-elevated instance.
	os.Exit(0)
	return nil
}

func sensorStop(dst string, dryRun bool) (bool, error) {
	if dryRun {
		return false, nil
	}
	out, _ := exec.Command("tasklist", "/FI", "IMAGENAME eq bloom-sensor.exe", "/NH").CombinedOutput()
	wasActive := strings.Contains(strings.ToLower(string(out)), "bloom-sensor.exe")
	if !wasActive {
		return false, nil
	}
	if out, err := exec.Command("taskkill", "/IM", "bloom-sensor.exe", "/T", "/F").CombinedOutput(); err != nil {
		return true, fmt.Errorf("taskkill bloom-sensor.exe: %w (%s)", err, strings.TrimSpace(string(out)))
	}
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		out, _ := exec.Command("tasklist", "/FI", "IMAGENAME eq bloom-sensor.exe", "/NH").CombinedOutput()
		if !strings.Contains(strings.ToLower(string(out)), "bloom-sensor.exe") {
			return true, nil
		}
		time.Sleep(250 * time.Millisecond)
	}
	return true, fmt.Errorf("bloom-sensor.exe is still running after stop")
}

func sensorStart(dst string) error {
	cmd := exec.Command(filepath.Join(dst, "bloom-sensor.exe"), "serve")
	cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: windows.CREATE_NEW_PROCESS_GROUP | windows.DETACHED_PROCESS, HideWindow: true}
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start bloom-sensor.exe serve: %w", err)
	}
	return cmd.Process.Release()
}

// isElevated returns true if the current process has administrator privileges.
func isElevated() (bool, error) {
	token := windows.Token(0)
	if err := windows.OpenProcessToken(windows.CurrentProcess(), windows.TOKEN_QUERY, &token); err != nil {
		return false, err
	}
	defer token.Close()

	var elevation uint32
	var size uint32
	err := windows.GetTokenInformation(token, windows.TokenElevation,
		(*byte)(unsafe.Pointer(&elevation)), uint32(unsafe.Sizeof(elevation)), &size)
	if err != nil {
		return false, err
	}

	return elevation != 0, nil
}

// controlService stops (start=false) or starts (start=true) a Windows service
// using the Service Control Manager. Waits up to 10 seconds for the
// transition.
//
// Returns (wasNoop, err): wasNoop is true when there was nothing to do
// (service not installed, already stopped when asked to stop, already
// running when asked to start) so callers can log the idempotent case
// explicitly instead of implying an action that didn't happen — same
// contract as controlService in rollout_other.go.
func controlService(name string, start bool) (bool, error) {
	m, err := mgr.Connect()
	if err != nil {
		return false, fmt.Errorf("could not connect to SCM: %w", err)
	}
	defer m.Disconnect()

	s, err := m.OpenService(name)
	if err != nil {
		// Service not found is not an error — it may not be installed yet.
		return true, nil
	}
	defer s.Close()

	status, err := s.Query()
	if err != nil {
		return false, fmt.Errorf("could not query service: %w", err)
	}

	if start {
		if status.State == svc.Running {
			return true, nil // already running
		}
		if err := s.Start(); err != nil {
			return false, fmt.Errorf("could not start: %w", err)
		}
		return false, waitForServiceState(s, svc.Running, 10*time.Second)
	}

	// Stop
	if status.State == svc.Stopped {
		return true, nil // already stopped
	}
	if _, err := s.Control(svc.Stop); err != nil {
		return false, fmt.Errorf("could not send stop: %w", err)
	}
	if err := waitForServiceState(s, svc.Stopped, 10*time.Second); err != nil {
		return false, err
	}
	// Same socket-release race flagged for Linux/macOS: SERVICE_STOPPED
	// confirms the process exited, but the kernel can still hold the port
	// briefly afterward. Give it a beat before the caller re-binds it.
	time.Sleep(2 * time.Second)
	return false, nil
}

// waitForServiceState polls until the service reaches the desired state or times out.
func waitForServiceState(s *mgr.Service, desired svc.State, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		status, err := s.Query()
		if err != nil {
			return err
		}
		if status.State == desired {
			return nil
		}
		time.Sleep(300 * time.Millisecond)
	}
	return fmt.Errorf("timed out waiting for service state %v", desired)
}
