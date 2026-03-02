package ignition

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// initBloomHost ejecuta bloom-host.exe en modo --init para pre-crear la
// estructura de logs del host antes de que Chrome sea lanzado.
//
// Chrome lanza bloom-host.exe con un security token restringido que no tiene
// permisos para crear directorios. Sentinel corre con el token completo del
// usuario y debe crear la estructura primero.
//
// Contrato:
//   - Debe llamarse DESPUÉS de prepareSessionFiles() → launchID y profileID disponibles.
//   - Debe llamarse ANTES del handoff a Brain / LaunchProfileSync().
//   - Exit code 0  → éxito, continuar con el lanzamiento.
//   - Exit code != 0 → abortar; NO lanzar Chrome.
//
// Estructura creada en disco (idempotente — no falla si ya existe):
//
//	logs/host/profiles/<profileID>/<launchID>/synapse_host_YYYYMMDD.log
//	logs/host/profiles/<profileID>/<launchID>/synapse_extension_YYYYMMDD.log
func (ig *Ignition) initBloomHost(profileID string, launchID string) error {
	// ── 1. Resolver ruta al binario ───────────────────────────────────────────
	hostBin := filepath.Join(ig.Core.Paths.BinDir, "host", "bloom-host.exe")

	if _, err := os.Stat(hostBin); os.IsNotExist(err) {
		return fmt.Errorf(
			"bloom-host.exe no encontrado en %s — verificar instalación del paquete host",
			hostBin,
		)
	}

	// ── 2. Pre-crear directorio de logs ───────────────────────────────────────
	// Garantizamos la existencia del directorio destino antes de invocar el
	// binario, por si el propio --init depende de que el padre exista.
	// La creación es idempotente: os.MkdirAll no falla si ya existe.
	logDir := filepath.Join(
		ig.Core.Paths.AppDataDir, "logs", "host", "profiles", profileID, launchID,
	)
	if err := os.MkdirAll(logDir, 0755); err != nil {
		return fmt.Errorf("no se pudo crear directorio de logs del host en %s: %v", logDir, err)
	}

	ig.Core.Logger.Info("[HOST-INIT] Directorio de logs preparado: %s", logDir)

	// ── 3. Ejecutar bloom-host.exe --init ────────────────────────────────────
	ig.Core.Logger.Info(
		"[HOST-INIT] Ejecutando bloom-host --init (profile: %s, launch: %s)...",
		profileID, launchID,
	)

	cmd := exec.Command(hostBin,
		"--init",
		"--profile-id", profileID,
		"--launch-id", launchID,
	)

	// bloom-host resuelve rutas usando LOCALAPPDATA del entorno.
	// Cuando Sentinel corre como servicio Windows (SYSTEM), os.Environ()
	// contiene LOCALAPPDATA=C:\WINDOWS\system32\config\systemprofile\...
	// lo que hace que bloom-host escriba en el perfil de SYSTEM en lugar
	// del usuario real.
	//
	// Solución: derivar LOCALAPPDATA desde ig.Core.Paths.AppDataDir que ya
	// fue resuelto correctamente por Sentinel (es el padre de AppDataDir).
	// Ej: AppDataDir = C:\Users\josev\AppData\Local\BloomNucleus
	//  → localAppData = C:\Users\josev\AppData\Local
	//  → userProfile  = C:\Users\josev
	localAppData := filepath.Dir(ig.Core.Paths.AppDataDir)
	userProfile := filepath.Dir(filepath.Dir(localAppData)) // Local → AppData → user

	// Partir del entorno actual y sobreescribir solo las variables de ruta
	env := os.Environ()
	overrides := map[string]string{
		"LOCALAPPDATA": localAppData,
		"APPDATA":      filepath.Join(filepath.Dir(localAppData), "Roaming"),
		"USERPROFILE":  userProfile,
	}
	filtered := make([]string, 0, len(env))
	for _, e := range env {
		key := e[:func() int {
			for i, c := range e {
				if c == '=' {
					return i
				}
			}
			return len(e)
		}()]
		upperKey := strings.ToUpper(key)
		if _, skip := overrides[upperKey]; !skip {
			filtered = append(filtered, e)
		}
	}
	for k, v := range overrides {
		filtered = append(filtered, fmt.Sprintf("%s=%s", k, v))
	}
	cmd.Env = filtered

	ig.Core.Logger.Info("[HOST-INIT] Entorno corregido → LOCALAPPDATA=%s", localAppData)

	// Capturar stdout/stderr para loguear en caso de error
	output, err := cmd.CombinedOutput()

	if err != nil {
		// Incluir output del proceso para facilitar diagnóstico
		detail := ""
		if len(output) > 0 {
			detail = fmt.Sprintf(" — output: %s", string(output))
		}
		return fmt.Errorf(
			"bloom-host --init falló (profile: %s, launch: %s)%s: %v",
			profileID, launchID, detail, err,
		)
	}

	if len(output) > 0 {
		ig.Core.Logger.Info("[HOST-INIT] bloom-host output: %s", string(output))
	}

	// ── 4. Verificar que los archivos de log fueron creados ───────────────────
	// bloom-host los crea con timestamp del día actual.
	// Si usan una convención distinta, advertimos pero no abortamos
	// (el exit 0 ya garantiza que la inicialización fue exitosa).
	today := time.Now().Format("20060102")
	expectedFiles := []string{
		filepath.Join(logDir, fmt.Sprintf("synapse_host_%s.log", today)),
		filepath.Join(logDir, fmt.Sprintf("synapse_extension_%s.log", today)),
	}

	for _, f := range expectedFiles {
		if _, statErr := os.Stat(f); os.IsNotExist(statErr) {
			ig.Core.Logger.Info(
				"[HOST-INIT] [WARN] Archivo de log esperado no encontrado: %s "+
					"(bloom-host puede usar otra convención de nombre)", f,
			)
		} else {
			ig.Core.Logger.Info("[HOST-INIT] ✅ Log verificado: %s", f)
		}
	}

	ig.Core.Logger.Info(
		"[HOST-INIT] ✅ Inicialización completada — Chrome puede arrancar bloom-host sin restricciones de permisos",
	)
	return nil
}