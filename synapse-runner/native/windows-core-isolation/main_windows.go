//go:build windows

// Windows CORE-00 probe plus functional-only supervisor. The supervisor accepts
// only a verified disposable Runner root, assigns each child to one Job before
// resuming it, and does not establish a filesystem security boundary.
package main

import (
	"bufio"
	"crypto/rand"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync/atomic"
	"syscall"
	"time"
	"unsafe"
)

const (
	tokenAssignPrimary   = 0x0001
	tokenDuplicate       = 0x0002
	tokenQuery           = 0x0008
	disableMaxPrivilege  = 0x00000001
	tokenGroupsClass     = 2
	tokenPrivilegesClass = 3
	tokenTypeClass       = 8
	tokenRestrictedClass = 11
)

type sidAndAttributes struct {
	sid        uintptr
	attributes uint32
}

type tokenAttempt struct {
	Name       string `json:"name"`
	Created    bool   `json:"created"`
	Win32Error uint32 `json:"win32_error,omitempty"`
}

type capabilityResult struct {
	SourceTokenType          string         `json:"source_token_type"`
	SourceTokenRestricted    bool           `json:"source_token_restricted"`
	SourceGroupCount         uint32         `json:"source_group_count"`
	SourcePrivilegeCount     uint32         `json:"source_privilege_count"`
	RestrictedPrivilegeCount uint32         `json:"restricted_privilege_count"`
	RestrictedTokenCreated   bool           `json:"restricted_token_created"`
	RestrictingSidPresent    bool           `json:"restricting_sid_present"`
	PrivilegesDisabled       bool           `json:"privileges_disabled"`
	IsolationDemonstrated    bool           `json:"isolation_demonstrated"`
	Code                     string         `json:"code"`
	Attempts                 []tokenAttempt `json:"attempts"`
}

var (
	advapi32                     = syscall.NewLazyDLL("advapi32.dll")
	kernel32                     = syscall.NewLazyDLL("kernel32.dll")
	openProcessToken             = advapi32.NewProc("OpenProcessToken")
	createRestrictedToken        = advapi32.NewProc("CreateRestrictedToken")
	getTokenInformation          = advapi32.NewProc("GetTokenInformation")
	isTokenRestricted            = advapi32.NewProc("IsTokenRestricted")
	convertStringSid             = advapi32.NewProc("ConvertStringSidToSidW")
	freeSid                      = kernel32.NewProc("LocalFree")
	getCurrentProcess            = kernel32.NewProc("GetCurrentProcess")
	closeHandle                  = kernel32.NewProc("CloseHandle")
	getFinalPath                 = kernel32.NewProc("GetFinalPathNameByHandleW")
	securityDescriptorFromString = advapi32.NewProc("ConvertStringSecurityDescriptorToSecurityDescriptorW")
	securityDescriptorToString   = advapi32.NewProc("ConvertSecurityDescriptorToStringSecurityDescriptorW")
	getSecurityDescriptorDacl    = advapi32.NewProc("GetSecurityDescriptorDacl")
	setSecurityInfo              = advapi32.NewProc("SetSecurityInfo")
	getSecurityInfo              = advapi32.NewProc("GetSecurityInfo")
	user32                       = syscall.NewLazyDLL("user32.dll")
	createDesktop                = user32.NewProc("CreateDesktopW")
	closeDesktop                 = user32.NewProc("CloseDesktop")
	getUserObjectSecurity        = user32.NewProc("GetUserObjectSecurity")
	openDesktop                  = user32.NewProc("OpenDesktopW")
	openWindowStation            = user32.NewProc("OpenWindowStationW")
	closeWindowStation           = user32.NewProc("CloseWindowStation")
	createJobObject              = kernel32.NewProc("CreateJobObjectW")
	setInformationJobObject      = kernel32.NewProc("SetInformationJobObject")
	assignProcessToJobObject     = kernel32.NewProc("AssignProcessToJobObject")
	isProcessInJob               = kernel32.NewProc("IsProcessInJob")
	createProcessAsUser          = advapi32.NewProc("CreateProcessAsUserW")
	createProcess                = kernel32.NewProc("CreateProcessW")
	resumeThread                 = kernel32.NewProc("ResumeThread")
	terminateProcess             = kernel32.NewProc("TerminateProcess")
	waitForSingleObject          = kernel32.NewProc("WaitForSingleObject")
	getProcessTimes              = kernel32.NewProc("GetProcessTimes")
	openProcess                  = kernel32.NewProc("OpenProcess")
	getExitCodeProcess           = kernel32.NewProc("GetExitCodeProcess")
)

func winCallError(name string, callErr error) error {
	if callErr == nil || errors.Is(callErr, syscall.Errno(0)) {
		return fmt.Errorf("%s_failed", name)
	}
	return fmt.Errorf("%s_failed: %w", name, callErr)
}

func tokenTypeName(value uint32) string {
	switch value {
	case 1:
		return "primary"
	case 2:
		return "impersonation"
	default:
		return fmt.Sprintf("unknown_%d", value)
	}
}

func restrictedTokenAttempt(source, flags, restrictSID uintptr, name string) (tokenAttempt, uintptr) {
	result := tokenAttempt{Name: name}
	var restrictingCount uintptr
	var restrictingPointer uintptr
	var restricting sidAndAttributes
	if restrictSID != 0 {
		restricting = sidAndAttributes{sid: restrictSID}
		restrictingCount = 1
		restrictingPointer = uintptr(unsafe.Pointer(&restricting))
	}
	var child uintptr
	ok, _, callErr := createRestrictedToken.Call(
		source, flags,
		0, 0,
		0, 0,
		restrictingCount, restrictingPointer,
		uintptr(unsafe.Pointer(&child)),
	)
	if ok == 0 {
		if errno, isErrno := callErr.(syscall.Errno); isErrno {
			result.Win32Error = uint32(errno)
		}
		return result, 0
	}
	result.Created = true
	return result, child
}

func tokenInformation(token uintptr, class uintptr) ([]byte, error) {
	var length uint32
	getTokenInformation.Call(token, class, 0, 0, uintptr(unsafe.Pointer(&length)))
	if length == 0 || length > 1<<20 {
		return nil, errors.New("token_information_length_invalid")
	}
	buf := make([]byte, length)
	r1, _, err := getTokenInformation.Call(token, class, uintptr(unsafe.Pointer(&buf[0])), uintptr(length), uintptr(unsafe.Pointer(&length)))
	if r1 == 0 {
		return nil, winCallError("GetTokenInformation", err)
	}
	return buf, nil
}

func sidFromString(value string) (uintptr, error) {
	p, err := syscall.UTF16PtrFromString(value)
	if err != nil {
		return 0, err
	}
	var sid uintptr
	r1, _, callErr := convertStringSid.Call(uintptr(unsafe.Pointer(p)), uintptr(unsafe.Pointer(&sid)))
	if r1 == 0 {
		return 0, winCallError("ConvertStringSidToSidW", callErr)
	}
	return sid, nil
}

func probeRestrictedToken() capabilityResult {
	result := capabilityResult{Code: "native_probe_failed"}
	current, _, _ := getCurrentProcess.Call()
	var source uintptr
	r1, _, _ := openProcessToken.Call(current, tokenDuplicate|tokenQuery, uintptr(unsafe.Pointer(&source)))
	if r1 == 0 {
		result.Code = "open_process_token_failed"
		return result
	}
	defer closeHandle.Call(source)
	typeBuf, err := tokenInformation(source, tokenTypeClass)
	if err != nil || len(typeBuf) < 4 {
		result.Code = "source_token_type_unavailable"
		return result
	}
	result.SourceTokenType = tokenTypeName(*(*uint32)(unsafe.Pointer(&typeBuf[0])))
	restrictedSource, _, _ := isTokenRestricted.Call(source)
	result.SourceTokenRestricted = restrictedSource != 0
	groupsBuf, err := tokenInformation(source, tokenGroupsClass)
	if err != nil || len(groupsBuf) < 4 {
		result.Code = "source_token_groups_unavailable"
		return result
	}
	result.SourceGroupCount = *(*uint32)(unsafe.Pointer(&groupsBuf[0]))
	privilegesBuf, err := tokenInformation(source, tokenPrivilegesClass)
	if err != nil || len(privilegesBuf) < 4 {
		result.Code = "source_token_privileges_unavailable"
		return result
	}
	result.SourcePrivilegeCount = *(*uint32)(unsafe.Pointer(&privilegesBuf[0]))
	// A fixture-only restricting SID. No process is launched and no DACL is
	// modified. The requested SID is intentionally distinct from the user SID.
	restrictSID, err := sidFromString("S-1-5-21-424242-424242-424242-424242")
	if err != nil {
		result.Code = "fixture_sid_unavailable"
		return result
	}
	defer freeSid.Call(restrictSID)
	primaryAttempt, child := restrictedTokenAttempt(source, disableMaxPrivilege, restrictSID, "restrictor_and_max_privilege")
	result.Attempts = append(result.Attempts, primaryAttempt)
	privilegeAttempt, privilegeChild := restrictedTokenAttempt(source, disableMaxPrivilege, 0, "max_privilege_only")
	result.Attempts = append(result.Attempts, privilegeAttempt)
	if privilegeChild != 0 {
		closeHandle.Call(privilegeChild)
	}
	plainAttempt, plainChild := restrictedTokenAttempt(source, 0, 0, "plain_duplicate")
	result.Attempts = append(result.Attempts, plainAttempt)
	if plainChild != 0 {
		closeHandle.Call(plainChild)
	}
	if child == 0 {
		result.Code = "create_restricted_token_failed"
		return result
	}
	defer closeHandle.Call(child)
	result.RestrictedTokenCreated = primaryAttempt.Created
	childPrivileges, err := tokenInformation(child, tokenPrivilegesClass)
	if err != nil || len(childPrivileges) < 4 {
		result.Code = "restricted_privileges_unavailable"
		return result
	}
	result.RestrictedPrivilegeCount = *(*uint32)(unsafe.Pointer(&childPrivileges[0]))
	result.PrivilegesDisabled = result.RestrictedPrivilegeCount < result.SourcePrivilegeCount
	// TokenRestrictedSids must be nonempty. This is a structural check only;
	// it does not prove that any DACL grants access to the fixture SID.
	restricted, err := tokenInformation(child, tokenRestrictedClass)
	if err == nil && len(restricted) >= 4 {
		result.RestrictingSidPresent = *(*uint32)(unsafe.Pointer(&restricted[0])) > 0
	}
	if _, err := tokenInformation(child, tokenGroupsClass); err != nil {
		result.Code = "restricted_groups_unavailable"
		return result
	}
	result.Code = "acl_desktop_job_network_unverified"
	result.IsolationDemonstrated = false
	return result
}

type rootMarker struct {
	RunID      string `json:"run_id"`
	Restrictor string `json:"restrictor"`
	User       string `json:"user"`
	Logon      string `json:"logon"`
}

type accessProbes struct {
	RootRead            bool `json:"root_read"`
	RootWrite           bool `json:"root_write"`
	ForbiddenRead       bool `json:"forbidden_read_denied"`
	ForbiddenWrite      bool `json:"forbidden_write_denied"`
	ForbiddenDelete     bool `json:"forbidden_delete_denied"`
	ForbiddenWriteDac   bool `json:"forbidden_write_dac_denied"`
	ForbiddenWriteOwner bool `json:"forbidden_write_owner_denied"`
}

type probeStageError struct {
	stage string
	err   error
}

func (e probeStageError) Error() string { return e.stage + ": " + e.err.Error() }
func (e probeStageError) Unwrap() error { return e.err }

func (p accessProbes) passed() bool {
	return p.RootRead && p.RootWrite && p.ForbiddenRead && p.ForbiddenWrite &&
		p.ForbiddenDelete && p.ForbiddenWriteDac && p.ForbiddenWriteOwner
}

func safeProbeError(err error) string {
	var errno syscall.Errno
	var staged probeStageError
	stage := ""
	if errors.As(err, &staged) {
		stage = "_" + staged.stage
	}
	if errors.As(err, &errno) {
		return fmt.Sprintf("access_probe%s_win32_%d", stage, uint32(errno))
	}
	switch err.Error() {
	case "probe_executable_missing", "probe_timeout":
		return err.Error()
	default:
		if strings.HasPrefix(err.Error(), "probe_child_exit_") {
			return err.Error()
		}
		return "access_probe_failed"
	}
}

type rootResult struct {
	Root            string       `json:"root"`
	RunID           string       `json:"run_id"`
	DACLReadback    bool         `json:"dacl_readback"`
	RootACLVerified bool         `json:"root_acl_verified"`
	AccessProbes    accessProbes `json:"access_probes"`
	Code            string       `json:"code"`
}

func randomRunID() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[:4], b[4:6], b[6:8], b[8:10], b[10:]), nil
}

func randomRestrictorSID() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	return fmt.Sprintf("S-1-5-21-%d-%d-%d-%d",
		binary.LittleEndian.Uint32(b[0:4]), binary.LittleEndian.Uint32(b[4:8]),
		binary.LittleEndian.Uint32(b[8:12]), binary.LittleEndian.Uint32(b[12:16])), nil
}

func controlledParent() (string, error) {
	parent := filepath.Join(os.TempDir(), "bloom-runner-core")
	if err := os.MkdirAll(parent, 0700); err != nil {
		return "", err
	}
	if err := assertNoReparseAncestors(parent); err != nil {
		return "", err
	}
	return parent, nil
}

func assertNoReparseAncestors(target string) error {
	for p := filepath.Clean(target); ; p = filepath.Dir(p) {
		name, err := syscall.UTF16PtrFromString(p)
		if err != nil {
			return err
		}
		attrs, err := syscall.GetFileAttributes(name)
		if err != nil {
			return errors.New("path_attributes_unavailable")
		}
		if attrs&syscall.FILE_ATTRIBUTE_REPARSE_POINT != 0 {
			return errors.New("path_reparse_point")
		}
		if filepath.Dir(p) == p {
			break
		}
	}
	return nil
}

func validateRoot(root string) error {
	parent, err := controlledParent()
	if err != nil {
		return err
	}
	if filepath.Base(root) == root || !strings.HasPrefix(filepath.Base(root), "rc-") ||
		!strings.EqualFold(filepath.Clean(filepath.Dir(root)), filepath.Clean(parent)) {
		return errors.New("root_outside_controlled_parent")
	}
	return assertNoReparseAncestors(root)
}

func tokenIdentity(token uintptr) (string, string, error) {
	u, err := syscall.Token(token).GetTokenUser()
	if err != nil {
		return "", "", err
	}
	user, err := u.User.Sid.String()
	if err != nil {
		return "", "", err
	}
	groups, err := tokenInformation(token, tokenGroupsClass)
	if err != nil || len(groups) < 8 {
		return "", "", errors.New("token_groups_unavailable")
	}
	count := *(*uint32)(unsafe.Pointer(&groups[0]))
	const logonAttrs = 0xc0000000
	stride := unsafe.Sizeof(sidAndAttributes{})
	if uint64(count) > uint64((len(groups)-8)/int(stride)) {
		return "", "", errors.New("token_groups_invalid")
	}
	for i := uint32(0); i < count; i++ {
		group := (*sidAndAttributes)(unsafe.Pointer(uintptr(unsafe.Pointer(&groups[0])) + 8 + uintptr(i)*stride))
		if group.attributes&logonAttrs == logonAttrs {
			logon, err := (*syscall.SID)(unsafe.Pointer(group.sid)).String()
			return user, logon, err
		}
	}
	return "", "", errors.New("logon_sid_unavailable")
}

func openRootHandle(root string) (syscall.Handle, error) {
	p, err := syscall.UTF16PtrFromString(root)
	if err != nil {
		return 0, err
	}
	const readControl = 0x00020000
	const writeDac = 0x00040000
	h, err := syscall.CreateFile(p, readControl|writeDac,
		syscall.FILE_SHARE_READ|syscall.FILE_SHARE_WRITE|syscall.FILE_SHARE_DELETE,
		nil, syscall.OPEN_EXISTING,
		syscall.FILE_FLAG_BACKUP_SEMANTICS|syscall.FILE_FLAG_OPEN_REPARSE_POINT, 0)
	if err != nil {
		return 0, err
	}
	buf := make([]uint16, 32768)
	n, _, _ := getFinalPath.Call(uintptr(h), uintptr(unsafe.Pointer(&buf[0])), uintptr(len(buf)), 0)
	if n == 0 || n >= uintptr(len(buf)) {
		syscall.CloseHandle(h)
		return 0, errors.New("root_final_path_unavailable")
	}
	final := strings.TrimPrefix(syscall.UTF16ToString(buf[:n]), `\\?\`)
	if !strings.EqualFold(filepath.Clean(final), filepath.Clean(root)) {
		syscall.CloseHandle(h)
		return 0, errors.New("root_handle_path_mismatch")
	}
	return h, nil
}

func expectedRootSDDL(m rootMarker) string {
	return fmt.Sprintf("D:P(A;OICI;FA;;;%s)(A;OICI;FA;;;%s)(A;OICI;FA;;;%s)", m.User, m.Logon, m.Restrictor)
}

func setRootDACL(handle syscall.Handle, m rootMarker) error {
	sddl, err := syscall.UTF16PtrFromString(expectedRootSDDL(m))
	if err != nil {
		return err
	}
	var sd uintptr
	r, _, callErr := securityDescriptorFromString.Call(uintptr(unsafe.Pointer(sddl)), 1, uintptr(unsafe.Pointer(&sd)), 0)
	if r == 0 {
		return winCallError("ConvertStringSecurityDescriptor", callErr)
	}
	defer freeSid.Call(sd)
	var present, defaulted int32
	var dacl uintptr
	r, _, callErr = getSecurityDescriptorDacl.Call(sd, uintptr(unsafe.Pointer(&present)), uintptr(unsafe.Pointer(&dacl)), uintptr(unsafe.Pointer(&defaulted)))
	if r == 0 || present == 0 || dacl == 0 {
		return winCallError("GetSecurityDescriptorDacl", callErr)
	}
	const seFileObject = 1
	const daclInfo = 0x00000004
	const protectedDaclInfo = 0x80000000
	code, _, _ := setSecurityInfo.Call(uintptr(handle), seFileObject, daclInfo|protectedDaclInfo, 0, 0, dacl, 0)
	if code != 0 {
		return fmt.Errorf("SetSecurityInfo_failed:%d", code)
	}
	return nil
}

func verifyRootDACL(handle syscall.Handle, m rootMarker) error {
	const seFileObject = 1
	const daclInfo = 0x00000004
	var sd uintptr
	code, _, _ := getSecurityInfo.Call(uintptr(handle), seFileObject, daclInfo, 0, 0, 0, 0, uintptr(unsafe.Pointer(&sd)))
	if code != 0 || sd == 0 {
		return fmt.Errorf("GetSecurityInfo_failed:%d", code)
	}
	defer freeSid.Call(sd)
	var sddlPtr uintptr
	r, _, callErr := securityDescriptorToString.Call(sd, 1, daclInfo, uintptr(unsafe.Pointer(&sddlPtr)), 0)
	if r == 0 || sddlPtr == 0 {
		return winCallError("ConvertSecurityDescriptorToString", callErr)
	}
	defer freeSid.Call(sddlPtr)
	var units []uint16
	for i := uintptr(0); i < 65536; i++ {
		v := *(*uint16)(unsafe.Pointer(sddlPtr + i*2))
		if v == 0 {
			break
		}
		units = append(units, v)
	}
	sddl := syscall.UTF16ToString(units)
	if !strings.HasPrefix(sddl, "D:P") || strings.Count(sddl, "(A;") != 3 {
		return errors.New("root_dacl_shape_mismatch")
	}
	for _, sid := range []string{m.User, m.Logon, m.Restrictor} {
		if !strings.Contains(sddl, sid) {
			return errors.New("root_dacl_sid_missing")
		}
	}
	return nil
}

func restrictedProbeToken(source uintptr, unique string) (uintptr, error) {
	return diagnosticRestrictedToken(source, unique, "baseline")
}

func diagnosticRestrictedToken(source uintptr, unique, variant string) (uintptr, error) {
	uniqueSID, err := sidFromString(unique)
	if err != nil {
		return 0, err
	}
	defer freeSid.Call(uniqueSID)
	// System binaries need their own read access in the second check. This
	// supplementary SID is not proof that productive paths are inaccessible.
	restrictedCodeSID, err := sidFromString("S-1-5-12")
	if err != nil {
		return 0, err
	}
	defer freeSid.Call(restrictedCodeSID)
	restricting := [2]sidAndAttributes{{sid: uniqueSID}, {sid: restrictedCodeSID}}
	flags := uintptr(disableMaxPrivilege)
	count := uintptr(2)
	if variant == "keep-privileges" {
		flags = 0
	}
	if variant == "no-restricting-sids" {
		count = 0
	}
	if variant == "restricted-code-only" {
		restricting[0] = restricting[1]
		count = 1
	}
	if variant == "run-sid-only" {
		count = 1
	}
	var child uintptr
	ok, _, callErr := createRestrictedToken.Call(source, flags,
		0, 0, 0, 0, count, uintptr(unsafe.Pointer(&restricting[0])),
		uintptr(unsafe.Pointer(&child)))
	if ok == 0 {
		return 0, winCallError("CreateRestrictedToken", callErr)
	}
	return child, nil
}

func denied(err error) bool { return errors.Is(err, syscall.ERROR_ACCESS_DENIED) }

func deniedOpen(file string, access uint32) bool {
	p, err := syscall.UTF16PtrFromString(file)
	if err != nil {
		return false
	}
	h, err := syscall.CreateFile(p, access,
		syscall.FILE_SHARE_READ|syscall.FILE_SHARE_WRITE|syscall.FILE_SHARE_DELETE,
		nil, syscall.OPEN_EXISTING, 0, 0)
	if err == nil {
		syscall.CloseHandle(h)
	}
	return denied(err)
}

func childProbe(runID string) error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	if !strings.EqualFold(filepath.Base(exe), "probe.exe") ||
		!strings.EqualFold(filepath.Base(filepath.Dir(exe)), ".runner-core") {
		return errors.New("probe_executable_not_staged")
	}
	root := filepath.Dir(filepath.Dir(exe))
	if !strings.HasPrefix(filepath.Base(root), "rc-") || !strings.EqualFold(filepath.Base(filepath.Dir(root)), "bloom-runner-core") {
		return errors.New("probe_root_invalid")
	}
	markerBytes, err := os.ReadFile(filepath.Join(root, ".runner-core", "root.json"))
	if err != nil {
		return probeStageError{stage: "marker_read", err: err}
	}
	var m rootMarker
	if json.Unmarshal(markerBytes, &m) != nil || m.RunID != runID {
		return probeStageError{stage: "marker_parse", err: errors.New("probe_run_mismatch")}
	}
	forbidden := filepath.Join(filepath.Dir(root), "forbidden-"+runID)
	var result accessProbes
	_, err = os.ReadFile(filepath.Join(root, ".runner-core", "allow.txt"))
	result.RootRead = err == nil
	err = os.WriteFile(filepath.Join(root, "workspace", "positive.txt"), []byte("fixture"), 0600)
	result.RootWrite = err == nil
	_, err = os.ReadFile(filepath.Join(forbidden, "forbidden.txt"))
	result.ForbiddenRead = denied(err)
	err = os.WriteFile(filepath.Join(forbidden, "new.txt"), []byte("fixture"), 0600)
	result.ForbiddenWrite = denied(err)
	err = os.Remove(filepath.Join(forbidden, "forbidden.txt"))
	result.ForbiddenDelete = denied(err)
	const writeDac = 0x00040000
	const writeOwner = 0x00080000
	result.ForbiddenWriteDac = deniedOpen(filepath.Join(forbidden, "forbidden.txt"), writeDac)
	result.ForbiddenWriteOwner = deniedOpen(filepath.Join(forbidden, "forbidden.txt"), writeOwner)
	encoded, err := json.Marshal(result)
	if err != nil {
		return probeStageError{stage: "result_marshal", err: err}
	}
	if err := os.WriteFile(filepath.Join(root, ".runner-core", "probe-result.json"), encoded, 0600); err != nil {
		return probeStageError{stage: "result_write", err: err}
	}
	return nil
}

func childProbeExitCode(err error) int {
	var staged probeStageError
	if !errors.As(err, &staged) {
		return 3
	}
	switch staged.stage {
	case "marker_read":
		return 11
	case "marker_parse":
		return 12
	case "result_marshal":
		return 13
	case "result_write":
		return 14
	default:
		return 3
	}
}

func runAccessProbe(root string, m rootMarker) (accessProbes, error) {
	var result accessProbes
	current, _, _ := getCurrentProcess.Call()
	var source uintptr
	ok, _, callErr := openProcessToken.Call(current, tokenAssignPrimary|tokenDuplicate|tokenQuery, uintptr(unsafe.Pointer(&source)))
	if ok == 0 {
		return result, winCallError("OpenProcessToken", callErr)
	}
	defer closeHandle.Call(source)
	child, err := restrictedProbeToken(source, m.Restrictor)
	if err != nil {
		return result, probeStageError{stage: "token", err: err}
	}
	defer closeHandle.Call(child)
	resultPath := filepath.Join(root, ".runner-core", "probe-result.json")
	if err := os.Remove(resultPath); err != nil && !os.IsNotExist(err) {
		return result, err
	}
	probeExe := filepath.Join(root, ".runner-core", "probe.exe")
	if info, err := os.Lstat(probeExe); err != nil || !info.Mode().IsRegular() {
		return result, errors.New("probe_executable_missing")
	}
	systemRoot := os.Getenv("SystemRoot")
	if systemRoot == "" {
		return result, errors.New("system_root_unavailable")
	}
	nullFile, err := os.OpenFile(os.DevNull, os.O_RDWR, 0)
	if err != nil {
		return result, probeStageError{stage: "start_process", err: err}
	}
	defer nullFile.Close()
	process, err := os.StartProcess(probeExe, []string{probeExe, "child-probe", m.RunID}, &os.ProcAttr{
		Dir: root,
		// CreateProcessAsUser receives STARTF_USESTDHANDLES from Go. Supply
		// valid, non-productive handles rather than NULL standard handles.
		Files: []*os.File{nullFile, nullFile, nullFile},
		Env: []string{"SystemRoot=" + systemRoot, "WINDIR=" + systemRoot,
			"PATH=" + filepath.Join(systemRoot, "System32"),
			"TEMP=" + filepath.Join(root, "tmp"), "TMP=" + filepath.Join(root, "tmp"),
			"USERPROFILE=" + filepath.Join(root, "home")},
		Sys: &syscall.SysProcAttr{Token: syscall.Token(child), HideWindow: true},
	})
	if err != nil {
		return result, probeStageError{stage: "start_process", err: err}
	}
	type waitResult struct {
		state *os.ProcessState
		err   error
	}
	done := make(chan waitResult, 1)
	go func() {
		state, waitErr := process.Wait()
		done <- waitResult{state: state, err: waitErr}
	}()
	select {
	case waited := <-done:
		if waited.err != nil {
			if waited.state != nil {
				return result, fmt.Errorf("probe_child_exit_%d", waited.state.ExitCode())
			}
			return result, waited.err
		}
	case <-time.After(15 * time.Second):
		_ = process.Kill()
		<-done
		return result, errors.New("probe_timeout")
	}
	bytes, err := os.ReadFile(resultPath)
	if err != nil {
		return result, err
	}
	if err := json.Unmarshal(bytes, &result); err != nil {
		return result, err
	}
	return result, nil
}

func prepareRoot() rootResult {
	result := rootResult{Code: "prepare_root_failed"}
	parent, err := controlledParent()
	if err != nil {
		result.Code = "parent_create_failed"
		if err.Error() == "controlled_parent_redirected" {
			result.Code = "controlled_parent_redirected"
		}
		return result
	}
	root, err := os.MkdirTemp(parent, "rc-")
	if err != nil {
		result.Code = "root_create_failed"
		return result
	}
	result.Root = root
	if err := validateRoot(root); err != nil {
		result.Code = "root_invalid"
		return result
	}
	runID, err := randomRunID()
	if err != nil {
		result.Code = "run_id_failed"
		return result
	}
	result.RunID = runID
	restrictor, err := randomRestrictorSID()
	if err != nil {
		result.Code = "restrictor_failed"
		return result
	}
	current, _, _ := getCurrentProcess.Call()
	var source uintptr
	ok, _, _ := openProcessToken.Call(current, tokenDuplicate|tokenQuery, uintptr(unsafe.Pointer(&source)))
	if ok == 0 {
		result.Code = "token_open_failed"
		return result
	}
	defer closeHandle.Call(source)
	user, logon, err := tokenIdentity(source)
	if err != nil {
		result.Code = "token_identity_failed"
		return result
	}
	m := rootMarker{RunID: runID, Restrictor: restrictor, User: user, Logon: logon}
	handle, err := openRootHandle(root)
	if err != nil {
		result.Code = "root_handle_invalid"
		return result
	}
	defer syscall.CloseHandle(handle)
	if err := setRootDACL(handle, m); err != nil {
		result.Code = "root_dacl_set_failed"
		return result
	}
	if err := verifyRootDACL(handle, m); err != nil {
		result.Code = "root_dacl_readback_failed"
		return result
	}
	result.DACLReadback = true
	for _, rel := range []string{".runner-core", "workspace", "tmp", "home"} {
		if err := os.MkdirAll(filepath.Join(root, rel), 0700); err != nil {
			result.Code = "root_layout_failed"
			return result
		}
	}
	marker, _ := json.Marshal(m)
	if err := os.WriteFile(filepath.Join(root, ".runner-core", "root.json"), marker, 0600); err != nil {
		result.Code = "marker_write_failed"
		return result
	}
	if err := os.WriteFile(filepath.Join(root, ".runner-core", "allow.txt"), []byte("fixture"), 0600); err != nil {
		result.Code = "allow_fixture_failed"
		return result
	}
	self, err := os.Executable()
	if err != nil {
		result.Code = "probe_source_unavailable"
		return result
	}
	bytes, err := os.ReadFile(self)
	if err != nil {
		result.Code = "probe_source_unreadable"
		return result
	}
	if err := os.WriteFile(filepath.Join(root, ".runner-core", "probe.exe"), bytes, 0700); err != nil {
		result.Code = "probe_stage_failed"
		return result
	}
	forbidden := filepath.Join(parent, "forbidden-"+runID)
	if err := os.Mkdir(forbidden, 0700); err != nil {
		result.Code = "forbidden_fixture_failed"
		return result
	}
	if err := os.WriteFile(filepath.Join(forbidden, "forbidden.txt"), []byte("fixture"), 0600); err != nil {
		result.Code = "forbidden_fixture_failed"
		return result
	}
	result.AccessProbes, err = runAccessProbe(root, m)
	if err != nil {
		result.Code = safeProbeError(err)
		return result
	}
	if !result.AccessProbes.passed() {
		result.Code = "access_probe_denial_incomplete"
		return result
	}
	result.RootACLVerified = true
	result.Code = "root_acl_and_fixture_probes_passed"
	return result
}

func verifyRoot(root string) rootResult {
	result := rootResult{Root: root, Code: "verify_root_failed"}
	if err := validateRoot(root); err != nil {
		result.Code = "root_invalid"
		return result
	}
	marker, err := os.ReadFile(filepath.Join(root, ".runner-core", "root.json"))
	if err != nil {
		result.Code = "marker_unavailable"
		return result
	}
	var m rootMarker
	if json.Unmarshal(marker, &m) != nil || m.RunID == "" || m.Restrictor == "" {
		result.Code = "marker_invalid"
		return result
	}
	result.RunID = m.RunID
	handle, err := openRootHandle(root)
	if err != nil {
		result.Code = "root_handle_invalid"
		return result
	}
	defer syscall.CloseHandle(handle)
	if err := verifyRootDACL(handle, m); err != nil {
		result.Code = "root_dacl_readback_failed"
		return result
	}
	result.DACLReadback = true
	result.AccessProbes, err = runAccessProbe(root, m)
	if err != nil {
		result.Code = safeProbeError(err)
		return result
	}
	if !result.AccessProbes.passed() {
		result.Code = "access_probe_denial_incomplete"
		return result
	}
	result.RootACLVerified = true
	result.Code = "root_acl_and_fixture_probes_passed"
	return result
}

// desktopJobResult is deliberately fixture-only. It does not certify ports,
// credentials, named pipes, or a Workspace/Electron launch.
type desktopJobResult struct {
	Variant             string `json:"variant,omitempty"`
	TokenUser           string `json:"token_user,omitempty"`
	TokenLogon          string `json:"token_logon,omitempty"`
	TokenRestricted     bool   `json:"token_restricted"`
	RestrictingSIDCount uint32 `json:"restricting_sid_count"`
	PrivilegeCount      uint32 `json:"privilege_count"`
	ChildAssignedToJob  bool   `json:"child_assigned_to_job"`
	Root                string `json:"root"`
	RunID               string `json:"run_id"`
	DesktopACLVerified  bool   `json:"desktop_acl_verified"`
	JobVerified         bool   `json:"job_verified"`
	ChildPID            uint32 `json:"child_pid"`
	ChildCreatedAt      string `json:"child_created_at"`
	GrandchildPID       uint32 `json:"grandchild_pid"`
	GrandchildCreatedAt string `json:"grandchild_created_at"`
	Code                string `json:"code"`
	ChildExecutableOpen bool   `json:"child_executable_open"`
	ChildDesktopOpen    bool   `json:"child_desktop_open"`
	ChildWinStationOpen bool   `json:"child_window_station_open"`
	ChildParentOpen     bool   `json:"child_parent_process_open"`
	ChildTokenDuplicate bool   `json:"child_token_duplicate"`
	ChildTokenQuery     bool   `json:"child_token_query"`
	ChildTokenAssign    bool   `json:"child_token_assign_primary"`
}

type childDiagnostic struct {
	ExecutableOpen    bool `json:"executable_open"`
	DesktopOpen       bool `json:"desktop_open"`
	WindowStationOpen bool `json:"window_station_open"`
	ExtendedExePath   bool `json:"extended_exe_path"`
	ParentProcessOpen bool `json:"parent_process_open"`
	TokenDuplicate    bool `json:"token_duplicate"`
	TokenQuery        bool `json:"token_query"`
	TokenAssign       bool `json:"token_assign_primary"`
}

func childAccessDiagnostic(exe, runID string) childDiagnostic {
	var d childDiagnostic
	d.ExtendedExePath = strings.HasPrefix(exe, `\\?\`)
	if p, err := syscall.UTF16PtrFromString(exe); err == nil {
		h, err := syscall.CreateFile(p, 0x20000000, syscall.FILE_SHARE_READ|syscall.FILE_SHARE_WRITE|syscall.FILE_SHARE_DELETE, nil, syscall.OPEN_EXISTING, 0, 0)
		if err == nil {
			d.ExecutableOpen = true
			syscall.CloseHandle(h)
		}
	}
	name, _ := syscall.UTF16PtrFromString("BloomRunnerCore-" + runID)
	if h, _, _ := openDesktop.Call(uintptr(unsafe.Pointer(name)), 0, 0, 0x01ff); h != 0 {
		d.DesktopOpen = true
		closeDesktop.Call(h)
	}
	station, _ := syscall.UTF16PtrFromString("WinSta0")
	if h, _, _ := openWindowStation.Call(uintptr(unsafe.Pointer(station)), 0, 0x037f); h != 0 {
		d.WindowStationOpen = true
		closeWindowStation.Call(h)
	}
	if h, _, _ := openProcess.Call(0x0080, 0, uintptr(os.Getpid())); h != 0 {
		d.ParentProcessOpen = true
		closeHandle.Call(h)
	}
	current, _, _ := getCurrentProcess.Call()
	var token uintptr
	if r, _, _ := openProcessToken.Call(current, tokenDuplicate|tokenQuery|tokenAssignPrimary, uintptr(unsafe.Pointer(&token))); r != 0 {
		d.TokenDuplicate = true
		closeHandle.Call(token)
	}
	for _, check := range []struct {
		access uintptr
		dest   *bool
	}{{tokenQuery, &d.TokenQuery}, {tokenDuplicate, &d.TokenDuplicate}, {tokenAssignPrimary, &d.TokenAssign}} {
		if r, _, _ := openProcessToken.Call(current, check.access, uintptr(unsafe.Pointer(&token))); r != 0 {
			*check.dest = true
			closeHandle.Call(token)
		}
	}
	return d
}

type jobBasicLimitInformation struct {
	PerProcessUserTimeLimit int64
	PerJobUserTimeLimit     int64
	LimitFlags              uint32
	MinimumWorkingSetSize   uintptr
	MaximumWorkingSetSize   uintptr
	ActiveProcessLimit      uint32
	Affinity                uintptr
	PriorityClass           uint32
	SchedulingClass         uint32
}
type jobIOCounters struct{ ReadOperationCount, WriteOperationCount, OtherOperationCount, ReadTransferCount, WriteTransferCount, OtherTransferCount uint64 }
type jobExtendedLimitInformation struct {
	Basic                                                                        jobBasicLimitInformation
	IO                                                                           jobIOCounters
	ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed uintptr
}

func desktopSecurity(m rootMarker) (uintptr, error) {
	// The normal and restricting access checks must both pass. Restricted Code
	// is included for OS resources, while the unique SID grants this run only.
	sddl := fmt.Sprintf("D:P(A;;GA;;;%s)(A;;GA;;;%s)(A;;GA;;;%s)(A;;GA;;;S-1-5-12)", m.User, m.Logon, m.Restrictor)
	p, err := syscall.UTF16PtrFromString(sddl)
	if err != nil {
		return 0, err
	}
	var sd uintptr
	r, _, callErr := securityDescriptorFromString.Call(uintptr(unsafe.Pointer(p)), 1, uintptr(unsafe.Pointer(&sd)), 0)
	if r == 0 {
		return 0, winCallError("desktop_security_descriptor", callErr)
	}
	return sd, nil
}

func setFixtureTokenDACL(token, sd uintptr) error {
	var present, defaulted int32
	var dacl uintptr
	r, _, callErr := getSecurityDescriptorDacl.Call(sd, uintptr(unsafe.Pointer(&present)), uintptr(unsafe.Pointer(&dacl)), uintptr(unsafe.Pointer(&defaulted)))
	if r == 0 || present == 0 || dacl == 0 {
		return winCallError("GetSecurityDescriptorDacl", callErr)
	}
	const seKernelObject = 6
	const daclInfo = 0x00000004
	const protectedDaclInfo = 0x80000000
	code, _, _ := setSecurityInfo.Call(token, seKernelObject, daclInfo|protectedDaclInfo, 0, 0, dacl, 0)
	if code != 0 {
		return fmt.Errorf("token_dacl_set_win32_%d", code)
	}
	return nil
}

func verifyFixtureTokenDACL(token uintptr, m rootMarker) bool {
	const seKernelObject = 6
	const daclInfo = 4
	var sd uintptr
	code, _, _ := getSecurityInfo.Call(token, seKernelObject, daclInfo, 0, 0, 0, 0, uintptr(unsafe.Pointer(&sd)))
	if code != 0 || sd == 0 {
		return false
	}
	defer freeSid.Call(sd)
	var sddlPtr uintptr
	r, _, _ := securityDescriptorToString.Call(sd, 1, daclInfo, uintptr(unsafe.Pointer(&sddlPtr)), 0)
	if r == 0 || sddlPtr == 0 {
		return false
	}
	defer freeSid.Call(sddlPtr)
	units := make([]uint16, 0, 256)
	for i := uintptr(0); i < 4096; i++ {
		v := *(*uint16)(unsafe.Pointer(sddlPtr + i*2))
		if v == 0 {
			break
		}
		units = append(units, v)
	}
	s := syscall.UTF16ToString(units)
	if !strings.HasPrefix(s, "D:P") || strings.Count(s, "(A;") != 4 {
		return false
	}
	for _, sid := range []string{m.User, m.Logon, m.Restrictor} {
		if !strings.Contains(s, sid) {
			return false
		}
	}
	return strings.Contains(s, ";;;RC)") || strings.Contains(s, ";;;S-1-5-12)")
}

func readDesktopDACL(desktop uintptr, m rootMarker) string {
	daclInfo := uint32(4)
	var length uint32
	getUserObjectSecurity.Call(desktop, uintptr(unsafe.Pointer(&daclInfo)), 0, 0, uintptr(unsafe.Pointer(&length)))
	if length == 0 || length > 1<<20 {
		return "desktop_dacl_length_invalid"
	}
	buf := make([]byte, length)
	r, _, _ := getUserObjectSecurity.Call(desktop, uintptr(unsafe.Pointer(&daclInfo)), uintptr(unsafe.Pointer(&buf[0])), uintptr(length), uintptr(unsafe.Pointer(&length)))
	if r == 0 {
		return "desktop_dacl_get_failed"
	}
	var sddlPtr uintptr
	r, _, _ = securityDescriptorToString.Call(uintptr(unsafe.Pointer(&buf[0])), 1, uintptr(daclInfo), uintptr(unsafe.Pointer(&sddlPtr)), 0)
	if r == 0 || sddlPtr == 0 {
		return "desktop_dacl_convert_failed"
	}
	defer freeSid.Call(sddlPtr)
	units := make([]uint16, 0, 256)
	for i := uintptr(0); i < 4096; i++ {
		v := *(*uint16)(unsafe.Pointer(sddlPtr + i*2))
		if v == 0 {
			break
		}
		units = append(units, v)
	}
	s := syscall.UTF16ToString(units)
	if !strings.HasPrefix(s, "D:P") {
		return "desktop_dacl_not_protected"
	}
	if strings.Count(s, "(A;") != 4 {
		return fmt.Sprintf("desktop_dacl_ace_count_%d", strings.Count(s, "(A;"))
	}
	for index, sid := range []string{m.User, m.Logon, m.Restrictor} {
		if !strings.Contains(s, sid) {
			return fmt.Sprintf("desktop_dacl_principal_%d_missing", index)
		}
	}
	// SDDL emits the well-known Restricted Code SID as the canonical RC alias.
	if !strings.Contains(s, ";;;RC)") && !strings.Contains(s, ";;;S-1-5-12)") {
		return "desktop_dacl_restricted_code_missing"
	}
	return ""
}

func processCreationTime(handle uintptr) (string, error) {
	var created, exited, kernel, user syscall.Filetime
	r, _, e := getProcessTimes.Call(handle, uintptr(unsafe.Pointer(&created)), uintptr(unsafe.Pointer(&exited)), uintptr(unsafe.Pointer(&kernel)), uintptr(unsafe.Pointer(&user)))
	if r == 0 {
		return "", winCallError("GetProcessTimes", e)
	}
	return time.Unix(0, created.Nanoseconds()).UTC().Format(time.RFC3339Nano), nil
}

func processInJob(process, job uintptr) bool {
	var yes int32
	r, _, _ := isProcessInJob.Call(process, job, uintptr(unsafe.Pointer(&yes)))
	return r != 0 && yes != 0
}

func jobFixtureRoot(exe, runID string) (string, error) {
	if !strings.EqualFold(filepath.Base(exe), "probe.exe") || !strings.EqualFold(filepath.Base(filepath.Dir(exe)), ".runner-core") {
		return "", errors.New("job_fixture_executable_invalid")
	}
	root := filepath.Dir(filepath.Dir(exe))
	if !strings.HasPrefix(filepath.Base(root), "rc-") || !strings.EqualFold(filepath.Base(filepath.Dir(root)), "bloom-runner-core") {
		return "", errors.New("job_fixture_root_invalid")
	}
	markerBytes, err := os.ReadFile(filepath.Join(root, ".runner-core", "root.json"))
	if err != nil {
		return "", err
	}
	var m rootMarker
	if json.Unmarshal(markerBytes, &m) != nil || m.RunID != runID {
		return "", errors.New("job_fixture_run_mismatch")
	}
	return root, nil
}

func jobGrandchild(runID, variant string) error {
	exe, err := os.Executable()
	if err != nil {
		return errors.New("grandchild_executable_invalid")
	}
	root, err := jobFixtureRoot(exe, runID)
	if err != nil {
		return err
	}
	current, _ := syscall.GetCurrentProcess()
	if variant != "no-job" && !processInJob(uintptr(current), 0) {
		return errors.New("grandchild_not_in_job")
	}
	if err := os.WriteFile(filepath.Join(root, ".runner-core", "grandchild-"+runID+".txt"), []byte(fmt.Sprintf("%d", os.Getpid())), 0600); err != nil {
		return err
	}
	time.Sleep(20 * time.Second)
	return nil
}

func jobChild(runID, variant string) error {
	exe, err := os.Executable()
	if err != nil || !strings.EqualFold(filepath.Base(exe), "probe.exe") {
		return probeStageError{stage: "job_child_executable", err: errors.New("invalid")}
	}
	root, err := jobFixtureRoot(exe, runID)
	if err != nil {
		return probeStageError{stage: "job_child_root", err: err}
	}
	current, _ := syscall.GetCurrentProcess()
	if variant != "no-job" && !processInJob(uintptr(current), 0) {
		return probeStageError{stage: "job_child_membership", err: errors.New("absent")}
	}
	launchExe := strings.TrimPrefix(exe, `\\?\`)
	app, _ := syscall.UTF16PtrFromString(launchExe)
	cmd, _ := syscall.UTF16FromString(fmt.Sprintf("\"%s\" job-grandchild %s %s", launchExe, runID, variant))
	cwd, _ := syscall.UTF16PtrFromString(root)
	startup := syscall.StartupInfo{Cb: uint32(unsafe.Sizeof(syscall.StartupInfo{}))}
	if variant != "default-desktop" {
		startup.Desktop, _ = syscall.UTF16PtrFromString("WinSta0\\BloomRunnerCore-" + runID)
	}
	var processAttrsPtr, threadAttrsPtr uintptr
	var processAttrs, threadAttrs syscall.SecurityAttributes
	if variant == "grandchild-process-dacl" || variant == "grandchild-thread-dacl" || variant == "grandchild-both-dacls" {
		marker, err := os.ReadFile(filepath.Join(root, ".runner-core", "root.json"))
		if err != nil {
			return probeStageError{stage: "job_child_root", err: err}
		}
		var m rootMarker
		if json.Unmarshal(marker, &m) != nil || m.RunID != runID {
			return probeStageError{stage: "job_child_root", err: errors.New("marker_invalid")}
		}
		sd, err := desktopSecurity(m)
		if err != nil {
			return probeStageError{stage: "job_child_spawn", err: err}
		}
		defer freeSid.Call(sd)
		processAttrs = syscall.SecurityAttributes{Length: uint32(unsafe.Sizeof(syscall.SecurityAttributes{})), SecurityDescriptor: sd}
		threadAttrs = syscall.SecurityAttributes{Length: uint32(unsafe.Sizeof(syscall.SecurityAttributes{})), SecurityDescriptor: sd}
		if variant != "grandchild-thread-dacl" {
			processAttrsPtr = uintptr(unsafe.Pointer(&processAttrs))
		}
		if variant != "grandchild-process-dacl" {
			threadAttrsPtr = uintptr(unsafe.Pointer(&threadAttrs))
		}
	}
	var pi syscall.ProcessInformation
	r, _, callErr := createProcess.Call(uintptr(unsafe.Pointer(app)), uintptr(unsafe.Pointer(&cmd[0])), processAttrsPtr, threadAttrsPtr, 0, 0, 0, uintptr(unsafe.Pointer(cwd)), uintptr(unsafe.Pointer(&startup)), uintptr(unsafe.Pointer(&pi)))
	if r == 0 {
		var errno syscall.Errno
		if errors.As(callErr, &errno) {
			_ = os.WriteFile(filepath.Join(root, ".runner-core", "child-error-"+runID+".txt"), []byte(fmt.Sprintf("%d", uint32(errno))), 0600)
		}
		if b, e := json.Marshal(childAccessDiagnostic(exe, runID)); e == nil {
			_ = os.WriteFile(filepath.Join(root, ".runner-core", "child-diagnostic-"+runID+".json"), b, 0600)
		}
		return probeStageError{stage: "job_child_spawn", err: winCallError("CreateProcessW", callErr)}
	}
	closeHandle.Call(uintptr(pi.Thread))
	closeHandle.Call(uintptr(pi.Process))
	if err := os.WriteFile(filepath.Join(root, ".runner-core", "child-"+runID+".txt"), []byte(fmt.Sprintf("%d", os.Getpid())), 0600); err != nil {
		return probeStageError{stage: "job_child_marker", err: err}
	}
	time.Sleep(20 * time.Second)
	return nil
}

func desktopJobFixture(root, variant string) desktopJobResult {
	result := desktopJobResult{Root: root, Variant: variant, Code: "fixture_preflight_failed"}
	proof := verifyRoot(root)
	if !proof.RootACLVerified {
		result.Code = proof.Code
		return result
	}
	result.RunID = proof.RunID
	markerBytes, err := os.ReadFile(filepath.Join(root, ".runner-core", "root.json"))
	if err != nil {
		result.Code = "marker_unavailable"
		return result
	}
	var m rootMarker
	if json.Unmarshal(markerBytes, &m) != nil || m.RunID != proof.RunID {
		result.Code = "marker_invalid"
		return result
	}
	sd, err := desktopSecurity(m)
	if err != nil {
		result.Code = "desktop_sd_failed"
		return result
	}
	defer freeSid.Call(sd)
	name := "BloomRunnerCore-" + m.RunID
	namePtr, _ := syscall.UTF16PtrFromString(name)
	attrs := syscall.SecurityAttributes{Length: uint32(unsafe.Sizeof(syscall.SecurityAttributes{})), SecurityDescriptor: sd}
	const desktopAllAccess = 0x01ff | 0x00020000 // desktop rights plus READ_CONTROL for DACL readback
	desktop, _, _ := createDesktop.Call(uintptr(unsafe.Pointer(namePtr)), 0, 0, 0, desktopAllAccess, uintptr(unsafe.Pointer(&attrs)))
	if desktop == 0 {
		result.Code = "desktop_create_failed"
		return result
	}
	defer closeDesktop.Call(desktop)
	if code := readDesktopDACL(desktop, m); code != "" {
		result.Code = code
		return result
	}
	result.DesktopACLVerified = true
	job, _, _ := createJobObject.Call(0, 0)
	if job == 0 {
		result.Code = "job_create_failed"
		return result
	}
	defer func() {
		if job != 0 {
			closeHandle.Call(job)
		}
	}() // KILL_ON_JOB_CLOSE terminates all descendants.
	limits := jobExtendedLimitInformation{}
	limits.Basic.LimitFlags = 0x00002000 // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE; no breakaway flags.
	r, _, _ := setInformationJobObject.Call(job, 9, uintptr(unsafe.Pointer(&limits)), uintptr(unsafe.Sizeof(limits)))
	if r == 0 {
		result.Code = "job_limits_failed"
		return result
	}
	current, _, _ := getCurrentProcess.Call()
	var source uintptr
	r, _, _ = openProcessToken.Call(current, tokenAssignPrimary|tokenDuplicate|tokenQuery|0x00040000|0x00020000, uintptr(unsafe.Pointer(&source)))
	if r == 0 {
		result.Code = "token_open_failed"
		return result
	}
	defer closeHandle.Call(source)
	token := source
	if variant != "normal-token" {
		token, err = diagnosticRestrictedToken(source, m.Restrictor, variant)
		if err != nil {
			result.Code = "restricted_token_failed"
			return result
		}
		defer closeHandle.Call(token)
		if variant != "default-token-dacl" {
			if err := setFixtureTokenDACL(token, sd); err != nil {
				result.Code = "restricted_token_dacl_failed"
				return result
			}
			if !verifyFixtureTokenDACL(token, m) {
				result.Code = "restricted_token_dacl_readback_failed"
				return result
			}
		}
	}
	exe := filepath.Join(root, ".runner-core", "probe.exe")
	if err := assertNoReparseAncestors(exe); err != nil {
		result.Code = "fixture_executable_invalid"
		return result
	}
	app, _ := syscall.UTF16PtrFromString(exe)
	cmd, _ := syscall.UTF16FromString(fmt.Sprintf("\"%s\" job-child %s %s", exe, m.RunID, variant))
	desktopName, _ := syscall.UTF16PtrFromString("WinSta0\\" + name)
	cwd, _ := syscall.UTF16PtrFromString(root)
	startup := syscall.StartupInfo{Cb: uint32(unsafe.Sizeof(syscall.StartupInfo{}))}
	if variant != "default-desktop" {
		startup.Desktop = desktopName
	}
	var pi syscall.ProcessInformation
	const createSuspended = 0x00000004
	// A restricted child must be able to open its own process with
	// PROCESS_CREATE_PROCESS; the default process DACL did not grant the
	// per-run restricting SID and CreateProcessW failed with Win32 5.
	var processAttrsPtr, threadAttrsPtr uintptr
	if variant != "default-process-dacl" {
		processAttrs := syscall.SecurityAttributes{Length: uint32(unsafe.Sizeof(syscall.SecurityAttributes{})), SecurityDescriptor: sd}
		threadAttrs := syscall.SecurityAttributes{Length: uint32(unsafe.Sizeof(syscall.SecurityAttributes{})), SecurityDescriptor: sd}
		processAttrsPtr = uintptr(unsafe.Pointer(&processAttrs))
		threadAttrsPtr = uintptr(unsafe.Pointer(&threadAttrs))
		r, _, _ = createProcessAsUser.Call(token, uintptr(unsafe.Pointer(app)), uintptr(unsafe.Pointer(&cmd[0])), processAttrsPtr, threadAttrsPtr, 0, createSuspended, 0, uintptr(unsafe.Pointer(cwd)), uintptr(unsafe.Pointer(&startup)), uintptr(unsafe.Pointer(&pi)))
	} else {
		r, _, _ = createProcessAsUser.Call(token, uintptr(unsafe.Pointer(app)), uintptr(unsafe.Pointer(&cmd[0])), 0, 0, 0, createSuspended, 0, uintptr(unsafe.Pointer(cwd)), uintptr(unsafe.Pointer(&startup)), uintptr(unsafe.Pointer(&pi)))
	}
	if r == 0 {
		result.Code = "create_suspended_failed"
		return result
	}
	defer closeHandle.Call(uintptr(pi.Thread))
	defer closeHandle.Call(uintptr(pi.Process))
	suspended := true
	defer func() {
		if suspended {
			terminateProcess.Call(uintptr(pi.Process), 1)
			waitForSingleObject.Call(uintptr(pi.Process), 5000)
		}
	}()
	// CreateProcessAsUser may create a distinct token object. Verify and set
	// that actual suspended child's token, not only the source token handle.
	var processToken uintptr
	r, _, _ = openProcessToken.Call(uintptr(pi.Process), tokenQuery|0x00040000|0x00020000, uintptr(unsafe.Pointer(&processToken)))
	if r == 0 {
		result.Code = "child_token_open_before_resume_failed"
		return result
	}
	result.TokenUser, result.TokenLogon, _ = tokenIdentity(processToken)
	if restricted, _, _ := isTokenRestricted.Call(processToken); restricted != 0 {
		result.TokenRestricted = true
	}
	if info, err := tokenInformation(processToken, tokenRestrictedClass); err == nil && len(info) >= 4 {
		result.RestrictingSIDCount = *(*uint32)(unsafe.Pointer(&info[0]))
	}
	if info, err := tokenInformation(processToken, tokenPrivilegesClass); err == nil && len(info) >= 4 {
		result.PrivilegeCount = *(*uint32)(unsafe.Pointer(&info[0]))
	}
	if variant != "default-token-dacl" {
		if err := setFixtureTokenDACL(processToken, sd); err != nil {
			closeHandle.Call(processToken)
			result.Code = "child_token_dacl_set_failed"
			return result
		}
	}
	if variant != "default-token-dacl" && !verifyFixtureTokenDACL(processToken, m) {
		closeHandle.Call(processToken)
		result.Code = "child_token_dacl_readback_failed"
		return result
	}
	closeHandle.Call(processToken)
	result.ChildPID = pi.ProcessId
	result.ChildCreatedAt, err = processCreationTime(uintptr(pi.Process))
	if err != nil {
		result.Code = "child_creation_time_failed"
		return result
	}
	if variant != "no-job" {
		r, _, _ = assignProcessToJobObject.Call(job, uintptr(pi.Process))
	}
	if variant != "no-job" && (r == 0 || !processInJob(uintptr(pi.Process), job)) {
		result.Code = "assign_before_resume_failed"
		return result
	}
	result.ChildAssignedToJob = processInJob(uintptr(pi.Process), job)
	marker := filepath.Join(root, ".runner-core", "grandchild-"+m.RunID+".txt")
	_ = os.Remove(marker)
	r, _, _ = resumeThread.Call(uintptr(pi.Thread))
	if r == ^uintptr(0) {
		result.Code = "resume_failed"
		return result
	}
	suspended = false
	deadline := time.Now().Add(8 * time.Second)
	for time.Now().Before(deadline) {
		if status, _, _ := waitForSingleObject.Call(uintptr(pi.Process), 0); status == 0 {
			var exitCode uint32
			getExitCodeProcess.Call(uintptr(pi.Process), uintptr(unsafe.Pointer(&exitCode)))
			result.Code = fmt.Sprintf("fixture_child_exit_%d", exitCode)
			if exitCode == 34 {
				if b, e := os.ReadFile(filepath.Join(root, ".runner-core", "child-error-"+m.RunID+".txt")); e == nil {
					result.Code += "_win32_" + strings.TrimSpace(string(b))
				}
				if b, e := os.ReadFile(filepath.Join(root, ".runner-core", "child-diagnostic-"+m.RunID+".json")); e == nil {
					var d childDiagnostic
					if json.Unmarshal(b, &d) == nil {
						result.ChildExecutableOpen = d.ExecutableOpen
						result.ChildDesktopOpen = d.DesktopOpen
						result.ChildWinStationOpen = d.WindowStationOpen
						result.ChildParentOpen = d.ParentProcessOpen
						result.ChildTokenDuplicate = d.TokenDuplicate
						result.ChildTokenQuery = d.TokenQuery
						result.ChildTokenAssign = d.TokenAssign
					}
				}
			}
			return result
		}
		if b, e := os.ReadFile(marker); e == nil {
			var pid uint32
			if _, e := fmt.Sscanf(string(b), "%d", &pid); e == nil && pid > 0 {
				result.GrandchildPID = pid
				break
			}
		}
		time.Sleep(100 * time.Millisecond)
	}
	if result.GrandchildPID == 0 {
		result.Code = "grandchild_not_observed"
		return result
	}
	const processQueryLimitedInformation = 0x1000
	const synchronize = 0x00100000
	grandchild, _, _ := openProcess.Call(processQueryLimitedInformation|synchronize, 0, uintptr(result.GrandchildPID))
	if grandchild == 0 {
		result.Code = "grandchild_open_failed"
		return result
	}
	defer closeHandle.Call(grandchild)
	if variant == "no-job" {
		terminateProcess.Call(uintptr(pi.Process), 1)
		terminateProcess.Call(grandchild, 1)
		waitForSingleObject.Call(uintptr(pi.Process), 5000)
		waitForSingleObject.Call(grandchild, 5000)
		result.Code = "grandchild_observed_no_job"
		return result
	}
	if !processInJob(grandchild, job) {
		result.Code = "grandchild_not_in_job"
		return result
	}
	result.GrandchildCreatedAt, err = processCreationTime(grandchild)
	if err != nil {
		result.Code = "grandchild_creation_time_failed"
		return result
	}
	// Closing the only job handle must kill both processes, not merely the parent.
	closeHandle.Call(job)
	job = 0
	if a, _, _ := waitForSingleObject.Call(uintptr(pi.Process), 5000); a != 0 {
		result.Code = "child_teardown_failed"
		return result
	}
	if a, _, _ := waitForSingleObject.Call(grandchild, 5000); a != 0 {
		result.Code = "grandchild_teardown_failed"
		return result
	}
	result.JobVerified = true
	result.Code = "desktop_job_fixture_passed"
	return result
}

type functionalManifest struct {
	Kind  string `json:"kind"`
	RunID string `json:"runId"`
	Root  string `json:"root"`
}

func functionalRoot(root string) (functionalManifest, error) {
	var m functionalManifest
	clean := filepath.Clean(root)
	parent := filepath.Dir(clean)
	const approvedParent = `C:\repos\bloom-development-extension\synapse-runner\.runner-core-temp`
	if !filepath.IsAbs(clean) || !strings.EqualFold(parent, approvedParent) ||
		!strings.HasPrefix(filepath.Base(clean), "rc-") {
		return m, errors.New("functional_root_outside_temp")
	}
	if err := assertNoReparseAncestors(clean); err != nil {
		return m, err
	}
	b, err := os.ReadFile(filepath.Join(clean, ".runner-core", "manifest.json"))
	if err != nil {
		return m, err
	}
	if err := json.Unmarshal(b, &m); err != nil {
		return m, err
	}
	if m.Kind != "functional_only" || !strings.EqualFold(filepath.Clean(m.Root), clean) || m.RunID == "" ||
		os.Getenv("RUNNER_CORE_RUN_ID") != m.RunID {
		return m, errors.New("functional_manifest_invalid")
	}
	return m, nil
}

func functionalMockService(root string, httpPort, wsPort int) error {
	if _, err := functionalRoot(root); err != nil {
		return err
	}
	if httpPort < 1024 || httpPort > 65535 || wsPort < 1024 || wsPort > 65535 || httpPort == wsPort {
		return errors.New("functional_port_invalid")
	}
	ws, err := net.Listen("tcp", net.JoinHostPort("127.0.0.1", strconv.Itoa(wsPort)))
	if err != nil {
		return err
	}
	defer ws.Close()
	go func() {
		for {
			conn, err := ws.Accept()
			if err != nil {
				return
			}
			_ = conn.Close()
		}
	}()
	mux := http.NewServeMux()
	var postAttempts atomic.Uint32
	mux.HandleFunc("/api/v1/mandates", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "http://127.0.0.1:5173")
		w.Header().Set("Access-Control-Allow-Methods", "POST,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != http.MethodPost {
			http.Error(w, "method_not_allowed", http.StatusMethodNotAllowed)
			return
		}
		attempt := postAttempts.Add(1)
		if err := os.WriteFile(filepath.Join(root, ".runner-core", "post-attempts.txt"), []byte(strconv.FormatUint(uint64(attempt), 10)), 0600); err != nil {
			http.Error(w, "attempt_capture_failed", http.StatusInternalServerError)
			return
		}
		failOnce := filepath.Join(root, ".runner-core", "fail-next-post")
		if attempt == 1 {
			if err := os.Remove(failOnce); err == nil {
				http.Error(w, "controlled_first_post_failure", http.StatusServiceUnavailable)
				return
			} else if !os.IsNotExist(err) {
				http.Error(w, "controlled_failure_state_invalid", http.StatusInternalServerError)
				return
			}
		}
		defer r.Body.Close()
		body, err := io.ReadAll(io.LimitReader(r.Body, 64*1024+1))
		if err != nil || len(body) > 64*1024 {
			http.Error(w, "body_invalid", http.StatusBadRequest)
			return
		}
		var payload map[string]any
		if json.Unmarshal(body, &payload) != nil {
			http.Error(w, "json_invalid", http.StatusBadRequest)
			return
		}
		record := filepath.Join(root, ".runner-core", "captured-post.json")
		file, err := os.OpenFile(record, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
		if err != nil {
			http.Error(w, "duplicate_post", http.StatusConflict)
			return
		}
		if _, err := file.Write(body); err != nil {
			_ = file.Close()
			http.Error(w, "capture_failed", http.StatusInternalServerError)
			return
		}
		if err := file.Close(); err != nil {
			http.Error(w, "capture_failed", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "http://127.0.0.1:5173")
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte(`{"mandateId":"00000000-0000-4000-8000-000000000001","status":"building"}`))
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "http://127.0.0.1:5173")
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "GET,HEAD,POST,OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.URL.Path == "/api/v1/health" {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"status":"ok"}`))
			return
		}
		http.NotFound(w, r)
	})
	listener, err := net.Listen("tcp", net.JoinHostPort("127.0.0.1", strconv.Itoa(httpPort)))
	if err != nil {
		return err
	}
	return http.Serve(listener, mux)
}

func functionalStubNucleus() error {
	if filepath.Base(os.Args[0]) != "nucleus.exe" || len(os.Args) < 3 || os.Args[1] != "--json" || os.Args[2] != "dev-start" {
		return errors.New("functional_nucleus_command_forbidden")
	}
	_, err := os.Stdout.WriteString("{\"success\":true,\"status\":\"ready\"}\n")
	return err
}

func functionalSpawn(job uintptr, exe, cwd, command, logPath string) (uint32, error) {
	if err := assertNoReparseAncestors(exe); err != nil {
		return 0, err
	}
	app, _ := syscall.UTF16PtrFromString(exe)
	cmd, _ := syscall.UTF16FromString(command)
	working, _ := syscall.UTF16PtrFromString(cwd)
	log, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		return 0, err
	}
	defer log.Close()
	const handleFlagInherit = 0x00000001
	setHandleInformation := kernel32.NewProc("SetHandleInformation")
	if ok, _, e := setHandleInformation.Call(log.Fd(), handleFlagInherit, handleFlagInherit); ok == 0 {
		return 0, winCallError("SetHandleInformation", e)
	}
	defer setHandleInformation.Call(log.Fd(), handleFlagInherit, 0)
	startup := syscall.StartupInfo{Cb: uint32(unsafe.Sizeof(syscall.StartupInfo{})), Flags: 0x00000100, StdOutput: syscall.Handle(log.Fd()), StdErr: syscall.Handle(log.Fd())}
	var pi syscall.ProcessInformation
	const createSuspended = 0x00000004
	ok, _, e := createProcess.Call(uintptr(unsafe.Pointer(app)), uintptr(unsafe.Pointer(&cmd[0])), 0, 0, 1, createSuspended, 0, uintptr(unsafe.Pointer(working)), uintptr(unsafe.Pointer(&startup)), uintptr(unsafe.Pointer(&pi)))
	if ok == 0 {
		return 0, winCallError("CreateProcessW", e)
	}
	defer closeHandle.Call(uintptr(pi.Thread))
	defer closeHandle.Call(uintptr(pi.Process))
	assigned := false
	defer func() {
		if !assigned {
			terminateProcess.Call(uintptr(pi.Process), 1)
		}
	}()
	if ok, _, e := assignProcessToJobObject.Call(job, uintptr(pi.Process)); ok == 0 {
		return 0, winCallError("AssignProcessToJobObject", e)
	}
	if !processInJob(uintptr(pi.Process), job) {
		return 0, errors.New("functional_job_membership_missing")
	}
	if previous, _, e := resumeThread.Call(uintptr(pi.Thread)); previous == 0xffffffff {
		return 0, winCallError("ResumeThread", e)
	}
	assigned = true
	return pi.ProcessId, nil
}

func functionalWaitPort(port int) error {
	address := net.JoinHostPort("127.0.0.1", strconv.Itoa(port))
	for i := 0; i < 600; i++ {
		conn, err := net.DialTimeout("tcp", address, 200*time.Millisecond)
		if err == nil {
			_ = conn.Close()
			return nil
		}
		time.Sleep(100 * time.Millisecond)
	}
	return fmt.Errorf("functional_port_not_ready:%d", port)
}

func functionalSupervisor(root string, httpPort, wsPort, uiPort int) error {
	m, err := functionalRoot(root)
	if err != nil {
		return err
	}
	if httpPort == wsPort || httpPort == uiPort || wsPort == uiPort {
		return errors.New("functional_ports_duplicate")
	}
	job, _, e := createJobObject.Call(0, 0)
	if job == 0 {
		return winCallError("CreateJobObjectW", e)
	}
	defer closeHandle.Call(job)
	limits := jobExtendedLimitInformation{}
	limits.Basic.LimitFlags = 0x00002000
	if ok, _, e := setInformationJobObject.Call(job, 9, uintptr(unsafe.Pointer(&limits)), uintptr(unsafe.Sizeof(limits))); ok == 0 {
		return winCallError("SetInformationJobObject", e)
	}
	self, err := os.Executable()
	if err != nil {
		return err
	}
	local := filepath.Join(root, "home", "AppData", "Local", "BloomNucleus")
	nucleus := filepath.Join(local, "bin", "nucleus", "nucleus.exe")
	if err := os.MkdirAll(filepath.Dir(nucleus), 0700); err != nil {
		return err
	}
	if err := copyFunctionalSelf(self, nucleus); err != nil {
		return err
	}
	logDir := filepath.Join(root, ".runner-core")
	service, err := functionalSpawn(job, self, root, fmt.Sprintf("\"%s\" functional-service \"%s\" %d %d", self, root, httpPort, wsPort), filepath.Join(logDir, "service.log"))
	if err != nil {
		return err
	}
	if err := functionalWaitPort(httpPort); err != nil {
		return err
	}
	if err := functionalWaitPort(wsPort); err != nil {
		return err
	}
	node := filepath.Join(root, "bin", "node.exe")
	webview := filepath.Join(root, "webview", "app")
	vite := filepath.Join(webview, "node_modules", "vite", "bin", "vite.js")
	ui, err := functionalSpawn(job, node, webview, fmt.Sprintf("\"%s\" \"%s\" --host 127.0.0.1 --port %d --strictPort --configLoader runner", node, vite, uiPort), filepath.Join(logDir, "ui.log"))
	if err != nil {
		return err
	}
	if err := functionalWaitPort(uiPort); err != nil {
		return err
	}
	workspace := filepath.Join(root, "bin", "bloom-workspace.exe")
	userData := filepath.Join(root, "electron-user-data")
	if err := os.MkdirAll(userData, 0700); err != nil {
		return err
	}
	electron, err := functionalSpawn(job, workspace, filepath.Join(root, "bin"), fmt.Sprintf("\"%s\" --disable-gpu --no-sandbox --remote-debugging-port=0 --user-data-dir=\"%s\"", workspace, userData), filepath.Join(logDir, "workspace.log"))
	if err != nil {
		return err
	}
	_ = json.NewEncoder(os.Stdout).Encode(map[string]any{"runId": m.RunID, "servicePid": service, "uiPid": ui, "electronPid": electron, "httpPort": httpPort, "wsPort": wsPort, "uiPort": uiPort})
	_, _ = io.Copy(io.Discard, bufio.NewReader(os.Stdin))
	return nil // Deferred close of the sole Job handle kills the whole tree.
}

func gate2Supervisor(root string, grpcPort, uiPort int, temporalOnly bool) error {
	clean := filepath.Clean(root)
	const parent = `C:\repos\bloom-development-extension\synapse-runner\.runner-core-temp`
	if !filepath.IsAbs(clean) || !strings.EqualFold(filepath.Dir(clean), parent) ||
		!strings.HasPrefix(filepath.Base(clean), "rc-") || os.Getenv("RUNNER_CORE_GATE2_ROOT") != clean {
		return errors.New("gate2_root_invalid")
	}
	if err := assertNoReparseAncestors(clean); err != nil {
		return err
	}
	var manifest struct{ Kind, RunID, Root string }
	data, err := os.ReadFile(filepath.Join(clean, ".runner-core", "manifest.json"))
	if err != nil {
		return err
	}
	if err := json.Unmarshal(data, &manifest); err != nil {
		return err
	}
	if manifest.Kind != "genesis_backend_only" || manifest.RunID == "" ||
		manifest.RunID != os.Getenv("RUNNER_CORE_RUN_ID") || !strings.EqualFold(filepath.Clean(manifest.Root), clean) ||
		grpcPort < 1 || grpcPort > 65535 || uiPort < 1 || uiPort > 65535 || grpcPort == uiPort ||
		os.Getenv("RUNNER_CORE_TEMPORAL_ADDRESS") != net.JoinHostPort("127.0.0.1", strconv.Itoa(grpcPort)) {
		return errors.New("gate2_manifest_or_ports_invalid")
	}
	job, _, e := createJobObject.Call(0, 0)
	if job == 0 {
		return winCallError("CreateJobObjectW", e)
	}
	defer closeHandle.Call(job)
	limits := jobExtendedLimitInformation{}
	limits.Basic.LimitFlags = 0x00002000 // KILL_ON_JOB_CLOSE
	if ok, _, e := setInformationJobObject.Call(job, 9, uintptr(unsafe.Pointer(&limits)), uintptr(unsafe.Sizeof(limits))); ok == 0 {
		return winCallError("SetInformationJobObject", e)
	}
	logDir := filepath.Join(clean, ".runner-core")
	temporalExe := filepath.Join(clean, "bin", "temporal.exe")
	db := filepath.Join(clean, "temporal", "temporal.db")
	if err := os.MkdirAll(filepath.Dir(db), 0700); err != nil {
		return err
	}
	temporalPID, err := functionalSpawn(job, temporalExe, clean,
		fmt.Sprintf("\"%s\" server start-dev --ip 127.0.0.1 --port %d --ui-port %d --db-filename \"%s\"", temporalExe, grpcPort, uiPort, db),
		filepath.Join(logDir, "temporal.log"))
	if err != nil {
		return err
	}
	if err := functionalWaitPort(grpcPort); err != nil {
		return err
	}
	var watcherPID uint32
	if !temporalOnly {
		watcherExe := filepath.Join(clean, "bin", "gate2-watcher.test.exe")
		watcherPID, err = functionalSpawn(job, watcherExe, clean,
			fmt.Sprintf("\"%s\" -test.run ^TestRunnerCoreGate2Watcher$ -test.timeout 0", watcherExe),
			filepath.Join(logDir, "watcher.log"))
		if err != nil {
			return err
		}
	}
	_ = json.NewEncoder(os.Stdout).Encode(map[string]any{"runId": manifest.RunID, "temporalPid": temporalPID,
		"watcherPid": watcherPID, "grpcPort": grpcPort, "uiPort": uiPort})
	_, _ = io.Copy(io.Discard, bufio.NewReader(os.Stdin))
	return nil
}

func geneG2Fixture(root, executable string) (string, error) {
	clean := filepath.Clean(root)
	const parent = `C:\repos\bloom-development-extension\synapse-runner\.runner-core-temp`
	if !filepath.IsAbs(clean) || !strings.EqualFold(filepath.Dir(clean), parent) ||
		!strings.HasPrefix(filepath.Base(clean), "rc-") || os.Getenv("RUNNER_CORE_GENE_G2_ROOT") != clean {
		return "", errors.New("gene_g2_root_invalid")
	}
	if err := assertNoReparseAncestors(clean); err != nil { return "", err }
	manifestPath := filepath.Join(clean, ".runner-core", "manifest.json")
	if err := assertNoReparseAncestors(manifestPath); err != nil { return "", err }
	var manifest struct { Kind, RunID, Root string }
	raw, err := os.ReadFile(manifestPath)
	if err != nil { return "", err }
	if err = json.Unmarshal(raw, &manifest); err != nil { return "", err }
	if manifest.Kind != "gene_g2" || manifest.RunID == "" ||
		manifest.RunID != os.Getenv("RUNNER_CORE_RUN_ID") ||
		!strings.EqualFold(filepath.Clean(manifest.Root), clean) ||
		executable != filepath.Join(clean, "bin", "gene-g2.test.exe") ||
		os.Getenv("RUNNER_CORE_GENE_G2_EVIDENCE") != filepath.Join(clean, ".runner-core", "gene-g2-evidence.json") {
		return "", errors.New("gene_g2_manifest_invalid")
	}
	if err = assertNoReparseAncestors(executable); err != nil { return "", err }
	info, err := os.Stat(executable)
	if err != nil || !info.Mode().IsRegular() { return "", errors.New("gene_g2_executable_invalid") }
	return manifest.RunID, nil
}

func geneG2Supervisor(root, executable string) error {
	runID, err := geneG2Fixture(root, executable)
	if err != nil { return err }
	job, _, e := createJobObject.Call(0, 0)
	if job == 0 { return winCallError("CreateJobObjectW", e) }
	defer closeHandle.Call(job)
	limits := jobExtendedLimitInformation{}
	limits.Basic.LimitFlags = 0x00002000 // KILL_ON_JOB_CLOSE
	if ok, _, e := setInformationJobObject.Call(job, 9, uintptr(unsafe.Pointer(&limits)), uintptr(unsafe.Sizeof(limits))); ok == 0 {
		return winCallError("SetInformationJobObject", e)
	}
	command := fmt.Sprintf("\"%s\" -test.run ^TestRunnerCoreGeneG2$ -test.v -test.timeout 90s", executable)
	pid, err := functionalSpawn(job, executable, root, command, filepath.Join(root, ".runner-core", "gene-g2.log"))
	if err != nil { return err }
	const synchronizeAndQuery = 0x00100000 | 0x00001000
	process, _, e := openProcess.Call(synchronizeAndQuery, 0, uintptr(pid))
	if process == 0 { return winCallError("OpenProcess", e) }
	defer closeHandle.Call(process)
	if status, _, _ := waitForSingleObject.Call(process, 120000); status != 0 { return errors.New("gene_g2_process_timeout") }
	var exitCode uint32
	if ok, _, e := getExitCodeProcess.Call(process, uintptr(unsafe.Pointer(&exitCode))); ok == 0 { return winCallError("GetExitCodeProcess", e) }
	if exitCode != 0 { return fmt.Errorf("gene_g2_test_failed:%d", exitCode) }
	_ = json.NewEncoder(os.Stdout).Encode(map[string]any{"kind":"gene_g2_supervisor", "runId":runID, "childAssignedToJob":true, "exitCode":exitCode})
	return nil
}

func copyFunctionalSelf(source, target string) error {
	in, err := os.Open(source)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(target, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0700)
	if err != nil {
		return err
	}
	_, err = io.Copy(out, in)
	closeErr := out.Close()
	if err != nil {
		return err
	}
	return closeErr
}

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: windows-core-isolation --json-help|capabilities|prepare-root|verify-root|desktop-job-fixture")
		os.Exit(2)
	}
	switch os.Args[1] {
	case "gene-g2-supervisor":
		if len(os.Args) != 4 { os.Exit(2) }
		if err := geneG2Supervisor(os.Args[2], os.Args[3]); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(3)
		}
	case "gate2-supervisor":
		if len(os.Args) != 6 {
			os.Exit(2)
		}
		grpcPort, e1 := strconv.Atoi(os.Args[3])
		uiPort, e2 := strconv.Atoi(os.Args[4])
		if e1 != nil || e2 != nil || (os.Args[5] != "watcher" && os.Args[5] != "temporal-only") {
			os.Exit(2)
		}
		if err := gate2Supervisor(os.Args[2], grpcPort, uiPort, os.Args[5] == "temporal-only"); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(3)
		}
	case "functional-supervisor":
		if len(os.Args) != 6 {
			os.Exit(2)
		}
		httpPort, e1 := strconv.Atoi(os.Args[3])
		wsPort, e2 := strconv.Atoi(os.Args[4])
		uiPort, e3 := strconv.Atoi(os.Args[5])
		if e1 != nil || e2 != nil || e3 != nil {
			os.Exit(2)
		}
		if err := functionalSupervisor(os.Args[2], httpPort, wsPort, uiPort); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(3)
		}
	case "functional-service":
		if len(os.Args) != 5 {
			os.Exit(2)
		}
		httpPort, e1 := strconv.Atoi(os.Args[3])
		wsPort, e2 := strconv.Atoi(os.Args[4])
		if e1 != nil || e2 != nil {
			os.Exit(2)
		}
		if err := functionalMockService(os.Args[2], httpPort, wsPort); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(3)
		}
	case "--json":
		if err := functionalStubNucleus(); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(3)
		}
	case "--json-help":
		if len(os.Args) != 2 {
			os.Exit(2)
		}
		_ = json.NewEncoder(os.Stdout).Encode(map[string]any{
			"name":     "windows-core-isolation",
			"commands": []string{"capabilities", "prepare-root", "verify-root", "desktop-job-fixture", "functional-supervisor", "gate2-supervisor", "gene-g2-supervisor"},
			"scope":    "restricted access probes and a disposable functional Core Job; functional mode has no filesystem isolation",
		})
	case "capabilities":
		if len(os.Args) != 2 {
			os.Exit(2)
		}
		result := probeRestrictedToken()
		_ = json.NewEncoder(os.Stdout).Encode(result)
		if !result.IsolationDemonstrated {
			os.Exit(3)
		}
	case "prepare-root":
		if len(os.Args) != 2 {
			os.Exit(2)
		}
		result := prepareRoot()
		_ = json.NewEncoder(os.Stdout).Encode(result)
		if !result.RootACLVerified || !result.AccessProbes.passed() {
			os.Exit(3)
		}
	case "verify-root":
		if len(os.Args) != 3 {
			os.Exit(2)
		}
		result := verifyRoot(os.Args[2])
		_ = json.NewEncoder(os.Stdout).Encode(result)
		if !result.RootACLVerified || !result.AccessProbes.passed() {
			os.Exit(3)
		}
	case "child-probe":
		if len(os.Args) != 3 {
			os.Exit(2)
		}
		if err := childProbe(os.Args[2]); err != nil {
			os.Exit(childProbeExitCode(err))
		}
	case "desktop-job-fixture":
		if len(os.Args) != 3 {
			os.Exit(2)
		}
		result := desktopJobFixture(os.Args[2], "baseline")
		_ = json.NewEncoder(os.Stdout).Encode(result)
		if !result.DesktopACLVerified || !result.JobVerified {
			os.Exit(3)
		}
	case "desktop-job-diagnostic":
		if len(os.Args) != 4 {
			os.Exit(2)
		}
		variant := os.Args[3]
		switch variant {
		case "baseline", "normal-token", "default-token-dacl", "default-process-dacl", "no-job", "default-desktop", "keep-privileges", "no-restricting-sids", "restricted-code-only", "run-sid-only", "grandchild-process-dacl", "grandchild-thread-dacl", "grandchild-both-dacls":
		default:
			os.Exit(2)
		}
		result := desktopJobFixture(os.Args[2], variant)
		_ = json.NewEncoder(os.Stdout).Encode(result)
	case "job-child":
		if len(os.Args) != 4 {
			os.Exit(2)
		}
		if err := jobChild(os.Args[2], os.Args[3]); err != nil {
			var staged probeStageError
			if errors.As(err, &staged) {
				switch staged.stage {
				case "job_child_executable":
					os.Exit(31)
				case "job_child_root":
					os.Exit(32)
				case "job_child_membership":
					os.Exit(33)
				case "job_child_spawn":
					os.Exit(34)
				case "job_child_marker":
					os.Exit(35)
				}
			}
			os.Exit(3)
		}
	case "job-grandchild":
		if len(os.Args) != 4 {
			os.Exit(2)
		}
		if err := jobGrandchild(os.Args[2], os.Args[3]); err != nil {
			os.Exit(3)
		}
	default:
		fmt.Fprintln(os.Stderr, "unsupported_command")
		os.Exit(2)
	}
}
