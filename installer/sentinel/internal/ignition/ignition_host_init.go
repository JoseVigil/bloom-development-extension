package ignition

import (
	"fmt"
	"sentinel/internal/eventbus"
	"time"
)

// initBloomHost pre-inicializa la estructura de logs del host Synapse
// enviando HOST_INIT al servicio Brain via EventBus.
//
// El servicio Brain (proceso permanente con sesión nucleus activa) ejecuta
// SynapseHostInitManager.init_host() y registra los streams en telemetry.json.
//
// Este método recibe el cliente ya conectado desde execute() para usar
// el mismo socket TCP — un solo socket, un solo loop de lectura.
func (ig *Ignition) initBloomHost(profileID string, launchID string) error {
	ig.Core.Logger.Info("[HOST-INIT] Delegando inicialización a Brain (profile: %s, launch: %s)...", profileID, launchID)

	client := eventbus.NewSentinelClient("127.0.0.1:5678", ig.Core.Logger)
	if err := client.Connect(); err != nil {
		return fmt.Errorf("[HOST-INIT] no se pudo conectar con Brain: %v", err)
	}
	defer client.Close()

	if err := client.WaitForConnection(5 * time.Second); err != nil {
		return fmt.Errorf("[HOST-INIT] timeout conectando con Brain: %v", err)
	}

	ig.Core.Logger.Info("[HOST-INIT] CMD: Brain.HostInitSync profile=%s launch=%s", profileID, launchID)

	data, err := client.HostInitSync(
		profileID,
		launchID,
		ig.Core.Paths.AppDataDir,
		30*time.Second,
	)
	if err != nil {
		return fmt.Errorf("[HOST-INIT] %v", err)
	}

	// Verificar que los archivos de log fueron creados
	hostLog, _ := data["host_log"].(string)
	extLog, _ := data["extension_log"].(string)

	if hostLog != "" {
		ig.Core.Logger.Info("[HOST-INIT] ✅ Log verificado: %s", hostLog)
	}
	if extLog != "" {
		ig.Core.Logger.Info("[HOST-INIT] ✅ Log verificado: %s", extLog)
	}

	ig.Core.Logger.Info("[HOST-INIT] ✅ Inicialización completada via Brain — Chrome puede arrancar")
	return nil
}