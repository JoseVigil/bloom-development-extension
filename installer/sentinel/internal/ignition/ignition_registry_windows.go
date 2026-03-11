package ignition

import (
	"fmt"
	"unsafe"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

type coreLogger interface {
	Info(format string, args ...interface{})
	Error(format string, args ...interface{})
}

func registerNativeHostHKCU(regKeyPath string, manifestPath string, logger coreLogger) error {
	var (
		modadvapi32              = windows.NewLazySystemDLL("advapi32.dll")
		modkernel32              = windows.NewLazySystemDLL("kernel32.dll")
		modwtsapi32              = windows.NewLazySystemDLL("wtsapi32.dll")
		procImpersonateLoggedOn  = modadvapi32.NewProc("ImpersonateLoggedOnUser")
		procRevertToSelf         = modadvapi32.NewProc("RevertToSelf")
		procWTSGetActiveSession  = modkernel32.NewProc("WTSGetActiveConsoleSessionId")
		procWTSQueryUserToken    = modwtsapi32.NewProc("WTSQueryUserToken")
	)

	// 1. Obtener sesión activa del usuario interactivo
	sessionRet, _, _ := procWTSGetActiveSession.Call()
	if sessionRet == 0xFFFFFFFF {
		return fmt.Errorf("no hay sesión de consola activa")
	}
	sessionID := uint32(sessionRet)

	// 2. Obtener token del usuario de esa sesión
	var userToken windows.Handle
	ret, _, err := procWTSQueryUserToken.Call(
		uintptr(sessionID),
		uintptr(unsafe.Pointer(&userToken)),
	)
	if ret == 0 {
		return fmt.Errorf("WTSQueryUserToken session=%d falló: %v", sessionID, err)
	}
	defer windows.CloseHandle(userToken)

	// 3. Impersonar al usuario interactivo
	ret, _, err = procImpersonateLoggedOn.Call(uintptr(userToken))
	if ret == 0 {
		return fmt.Errorf("ImpersonateLoggedOnUser falló: %v", err)
	}
	defer procRevertToSelf.Call()

	// 4. Ahora CURRENT_USER apunta al hive del usuario interactivo
	k, _, err := registry.CreateKey(registry.CURRENT_USER, regKeyPath, registry.ALL_ACCESS)
	if err != nil {
		return fmt.Errorf("CreateKey HKCU: %v", err)
	}
	k.SetStringValue("", manifestPath)
	k.Close()

	// 5. Limpiar HKLM residual
	hklm, err := registry.OpenKey(registry.LOCAL_MACHINE, regKeyPath, registry.SET_VALUE|registry.QUERY_VALUE)
	if err == nil {
		hklm.Close()
		registry.DeleteKey(registry.LOCAL_MACHINE, regKeyPath)
		logger.Info("[IGNITION] ✅ HKLM key eliminada: %s", regKeyPath)
	}

	return nil
}