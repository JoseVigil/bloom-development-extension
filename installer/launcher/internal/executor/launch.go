// internal/executor/launch.go
// Ejecutor real — lanza chrome.exe en la sesión interactiva del usuario (Session 1)
// usando WTSQueryUserToken + CreateProcessAsUser para cruzar la barrera Session 0 → Session 1.
//
// Por qué es necesario:
//   bloom-launcher.exe puede ser arrancado por Brain desde Session 0 (el servicio).
//   Un simple exec.Command hereda la sesión del padre — Chrome termina en Session 0
//   y no tiene acceso a display, DComposition ni cursor.
//   La única forma garantizada de aterrizar en Session 1 es pedirle a WTS el token
//   del usuario interactivo y usarlo en CreateProcessAsUser.
//
// Privilegios requeridos:
//   SeTcbPrivilege (Act as part of the OS) o SeImpersonatePrivilege.
//   Garantizados si bloom-launcher corre como SYSTEM o Administrator.
//   Si corre como usuario normal ya está en Session 1 — el path directo también funciona.

package executor

import (
	"fmt"
	"os"
	"strings"
	"syscall"
	"unicode/utf16"
	"unsafe"

	"bloom-launcher/internal/pipe"
)

// ── constantes Win32 ──────────────────────────────────────────────────────────

const (
	// Token
	tokenPrimary          = 1
	securityImpersonation = 2
	maximumAllowed        = 0x02000000

	// CreateProcess flags
	createNewProcessGroup = 0x00000200
	detachedProcess       = 0x00000008
	createUnicodeEnv      = 0x00000400

	// WTSGetActiveConsoleSessionId devuelve esto cuando no hay sesión
	wtsNoSession = 0xFFFFFFFF
)

// ── DLL y procedimientos ──────────────────────────────────────────────────────

var (
	modWtsapi32  = syscall.NewLazyDLL("wtsapi32.dll")
	modKernel32  = syscall.NewLazyDLL("kernel32.dll")
	modUserenv   = syscall.NewLazyDLL("userenv.dll")
	modAdvapi32  = syscall.NewLazyDLL("advapi32.dll")

	procWTSQueryUserToken          = modWtsapi32.NewProc("WTSQueryUserToken")
	procWTSGetActiveConsoleSession = modKernel32.NewProc("WTSGetActiveConsoleSessionId")
	procCreateEnvironmentBlock     = modUserenv.NewProc("CreateEnvironmentBlock")
	procDestroyEnvironmentBlock    = modUserenv.NewProc("DestroyEnvironmentBlock")
	procCreateProcessAsUserW       = modAdvapi32.NewProc("CreateProcessAsUserW")
	procDuplicateTokenEx           = modAdvapi32.NewProc("DuplicateTokenEx")
)

// ── structs Win32 ─────────────────────────────────────────────────────────────

// startupInfoW replica STARTUPINFOW de Win32.
// Los campos con nombre "_" son reservados/no usados pero deben ocupar espacio.
type startupInfoW struct {
	Cb            uint32
	_             *uint16 // lpReserved
	Desktop       *uint16 // lpDesktop — "winsta0\default" para sesión interactiva
	Title         *uint16 // lpTitle
	X             uint32
	Y             uint32
	XSize         uint32
	YSize         uint32
	XCountChars   uint32
	YCountChars   uint32
	FillAttribute uint32
	Flags         uint32
	ShowWindow    uint16
	_             uint16  // cbReserved2
	_             *byte   // lpReserved2
	StdInput      syscall.Handle
	StdOutput     syscall.Handle
	StdError      syscall.Handle
}

// processInformation replica PROCESS_INFORMATION de Win32.
type processInformation struct {
	Process   syscall.Handle
	Thread    syscall.Handle
	ProcessId uint32
	ThreadId  uint32
}

// ── HandleLaunch ─────────────────────────────────────────────────────────────

// HandleLaunch recibe la request de Brain y lanza Chrome en la sesión interactiva.
func HandleLaunch(req pipe.LaunchRequest) pipe.LaunchResponse {
	if len(req.Args) == 0 {
		return errResp("args vacíos — se requiere al menos chrome.exe")
	}

	pid, err := launchInUserSession(req.Args)
	if err != nil {
		return errResp(fmt.Sprintf("launchInUserSession: %v", err))
	}

	return pipe.LaunchResponse{
		OK:      true,
		Success: true,
		PID:     pid,
	}
}

// ── implementación principal ──────────────────────────────────────────────────

// launchInUserSession lanza el proceso en Session 1 usando WTSQueryUserToken +
// CreateProcessAsUser. Es la única manera de cruzar la barrera Session 0 → Session 1.
func launchInUserSession(args []string) (int, error) {
	// 1. ID de la sesión interactiva activa (la consola física del usuario).
	sessionID, err := getActiveConsoleSessionID()
	if err != nil {
		return 0, err
	}

	// 2. Token de acceso del usuario en esa sesión.
	//    Requiere SeTcbPrivilege — disponible si corremos como SYSTEM/Admin.
	userToken, err := wtsQueryUserToken(sessionID)
	if err != nil {
		return 0, fmt.Errorf("WTSQueryUserToken(session=%d): %w", sessionID, err)
	}
	defer syscall.CloseHandle(userToken)

	// 3. Duplicar como token primario.
	//    CreateProcessAsUser requiere un token primario, no de impersonación.
	var primaryToken syscall.Handle
	r, _, e := procDuplicateTokenEx.Call(
		uintptr(userToken),
		maximumAllowed,
		0, // lpTokenAttributes = nil — seguridad por defecto
		securityImpersonation,
		tokenPrimary,
		uintptr(unsafe.Pointer(&primaryToken)),
	)
	if r == 0 {
		return 0, os.NewSyscallError("DuplicateTokenEx", e)
	}
	defer syscall.CloseHandle(primaryToken)

	// 4. Bloque de entorno del usuario.
	//    Sin esto Chrome hereda el entorno de SYSTEM, que puede carecer de
	//    variables como USERPROFILE, APPDATA, TEMP, etc.
	var envBlock uintptr
	r, _, e = procCreateEnvironmentBlock.Call(
		uintptr(unsafe.Pointer(&envBlock)),
		uintptr(primaryToken),
		0, // bInherit = FALSE
	)
	if r == 0 {
		return 0, os.NewSyscallError("CreateEnvironmentBlock", e)
	}
	defer procDestroyEnvironmentBlock.Call(envBlock)

	// 5. Command line en UTF-16 (Windows requiere que sea editable — no const).
	cmdLineUTF16, err := buildCommandLine(args)
	if err != nil {
		return 0, err
	}

	// 6. Desktop interactivo del usuario.
	//    "winsta0\default" es el desktop de la sesión de usuario normal.
	//    Sin esto el proceso podría intentar abrir una ventana en el desktop
	//    de SYSTEM, lo cual falla silenciosamente.
	desktop, err := syscall.UTF16PtrFromString("winsta0\\default")
	if err != nil {
		return 0, fmt.Errorf("UTF16PtrFromString(desktop): %w", err)
	}

	si := startupInfoW{
		Cb:      uint32(unsafe.Sizeof(startupInfoW{})),
		Desktop: desktop,
	}
	var pi processInformation

	// 7. Path del ejecutable.
	exePtr, err := syscall.UTF16PtrFromString(args[0])
	if err != nil {
		return 0, fmt.Errorf("UTF16PtrFromString(exe=%q): %w", args[0], err)
	}

	// 8. CreateProcessAsUserW — el paso crítico.
	//    Lanza Chrome en Session 1 con el token del usuario interactivo.
	//    CREATE_UNICODE_ENVIRONMENT: envBlock está en UTF-16.
	//    DETACHED_PROCESS: Chrome no hereda consola de bloom-launcher.
	//    CREATE_NEW_PROCESS_GROUP: Chrome tiene su propio grupo de señales.
	creationFlags := uint32(createUnicodeEnv | detachedProcess | createNewProcessGroup)

	r, _, e = procCreateProcessAsUserW.Call(
		uintptr(primaryToken),                // hToken — usuario interactivo
		uintptr(unsafe.Pointer(exePtr)),      // lpApplicationName
		uintptr(unsafe.Pointer(cmdLineUTF16)), // lpCommandLine
		0,                                    // lpProcessAttributes — nil
		0,                                    // lpThreadAttributes — nil
		0,                                    // bInheritHandles = FALSE
		uintptr(creationFlags),               // dwCreationFlags
		envBlock,                             // lpEnvironment — env del usuario
		0,                                    // lpCurrentDirectory — nil (hereda)
		uintptr(unsafe.Pointer(&si)),         // lpStartupInfo
		uintptr(unsafe.Pointer(&pi)),         // lpProcessInformation [OUT]
	)
	if r == 0 {
		return 0, os.NewSyscallError("CreateProcessAsUserW", e)
	}

	pid := int(pi.ProcessId)

	// Cerrar handles devueltos — bloom-launcher no monitorea el proceso de Chrome.
	syscall.CloseHandle(pi.Process)
	syscall.CloseHandle(pi.Thread)

	return pid, nil
}

// ── helpers ───────────────────────────────────────────────────────────────────

// getActiveConsoleSessionID devuelve el ID de la sesión interactiva de consola.
func getActiveConsoleSessionID() (uint32, error) {
	r, _, _ := procWTSGetActiveConsoleSession.Call()
	if uint32(r) == wtsNoSession {
		return 0, fmt.Errorf(
			"no hay sesión de usuario interactiva — " +
				"posible acceso headless o RDP sin consola física",
		)
	}
	return uint32(r), nil
}

// wtsQueryUserToken obtiene el token de acceso del usuario en la sesión dada.
func wtsQueryUserToken(sessionID uint32) (syscall.Handle, error) {
	var token syscall.Handle
	r, _, e := procWTSQueryUserToken.Call(
		uintptr(sessionID),
		uintptr(unsafe.Pointer(&token)),
	)
	if r == 0 {
		return 0, os.NewSyscallError("WTSQueryUserToken", e)
	}
	return token, nil
}

// buildCommandLine construye la command line Windows correctamente escapada en UTF-16.
// Implementa las reglas de escapado de CommandLineToArgvW (Raymond Chen):
//   - Args con espacios/tabs/comillas van entre comillas dobles.
//   - Backslashes antes de una comilla se doblan.
//   - Backslashes al final de un arg citado se doblan.
func buildCommandLine(args []string) (*uint16, error) {
	var sb strings.Builder

	for i, arg := range args {
		if i > 0 {
			sb.WriteByte(' ')
		}

		needsQuote := arg == "" || strings.ContainsAny(arg, " \t\n\"")
		if !needsQuote {
			sb.WriteString(arg)
			continue
		}

		sb.WriteByte('"')
		slashes := 0
		for j := 0; j < len(arg); j++ {
			c := arg[j]
			switch c {
			case '\\':
				slashes++
			case '"':
				// Doblar backslashes acumulados + escapar la comilla
				for k := 0; k < slashes*2; k++ {
					sb.WriteByte('\\')
				}
				slashes = 0
				sb.WriteString(`\"`)
			default:
				// Emitir backslashes sin doblar
				for k := 0; k < slashes; k++ {
					sb.WriteByte('\\')
				}
				slashes = 0
				sb.WriteByte(c)
			}
		}
		// Backslashes finales antes del cierre de comilla se doblan
		for k := 0; k < slashes*2; k++ {
			sb.WriteByte('\\')
		}
		sb.WriteByte('"')
	}

	encoded := utf16.Encode([]rune(sb.String()))
	encoded = append(encoded, 0) // null terminator requerido por Win32
	return &encoded[0], nil
}

// errResp construye una LaunchResponse de error.
func errResp(msg string) pipe.LaunchResponse {
	return pipe.LaunchResponse{
		OK:      false,
		Success: false,
		Error:   msg,
	}
}