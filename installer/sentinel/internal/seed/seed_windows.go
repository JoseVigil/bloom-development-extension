//go:build windows

package seed

import "golang.org/x/sys/windows/registry"

// registerInWindows registra el Native Messaging host en HKLM (Windows).
// Sentinel es invocado por Nucleus que corre como servicio de Windows (SYSTEM).
// Escribir en CURRENT_USER desde SYSTEM apunta al hive de SYSTEM, no al del
// usuario interactivo. LOCAL_MACHINE aplica a todos los usuarios y es accesible
// desde cualquier contexto de ejecución.
// profileDir no se usa en Windows (es necesario en Unix para el user-data-dir
// custom de Chromium), pero se recibe para mantener la firma uniforme entre plataformas.
func registerInWindows(hostName, manifestPath, profileDir string) error {
	keyPath := `SOFTWARE\Google\Chrome\NativeMessagingHosts\` + hostName
	k, _, err := registry.CreateKey(registry.LOCAL_MACHINE, keyPath, registry.ALL_ACCESS)
	if err != nil {
		return err
	}
	defer k.Close()
	return k.SetStringValue("", manifestPath)
}
