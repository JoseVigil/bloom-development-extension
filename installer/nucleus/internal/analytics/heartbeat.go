package analytics

import (
	"encoding/json"
	"fmt"
	"nucleus/internal/client"
	"nucleus/internal/core"
	"os"
	"time"

	"github.com/spf13/cobra"
)

// ============================================
// BUSINESS LOGIC (estructuras de datos propias de analytics)
// ============================================

// Heartbeat representa el payload que se envía al servidor central.
// La lógica de envío HTTP vive ahora en el paquete client.
type Heartbeat struct {
	OrgID         string    `json:"org_id"`
	Timestamp     time.Time `json:"timestamp"`
	Version       string    `json:"version"`
	ActiveWorkers int       `json:"active_workers"`
	IntentVolume  int       `json:"intent_volume"`
	SystemHealth  string    `json:"system_health"`
}

// HeartbeatResponse modela la respuesta del servidor (se mantiene por
// compatibilidad aunque el decode se movió a client).
type HeartbeatResponse struct {
	Status  string `json:"status"`
	Message string `json:"message"`
}

// PrepareHeartbeat setea los campos que analytics conoce (OrgID, Timestamp)
// antes de delegar el envío a client.SendHeartbeat.
func PrepareHeartbeat(orgID string, hb *Heartbeat) {
	hb.OrgID = orgID
	hb.Timestamp = time.Now()
}

// ============================================
// CLI COMMAND (Auto-registration via init())
// ============================================

func init() {
	core.RegisterCommand("ANALYTICS", func(c *core.Core) *cobra.Command {
		var workers int
		var volume int

		cmd := &cobra.Command{
			Use:   "heartbeat",
			Short: "Send heartbeat to central server",
			Args:  cobra.NoArgs,
			Run: func(cmd *cobra.Command, args []string) {
				// client expone el OrgID sin que analytics necesite
				// importar governance directamente.
				orgID, err := client.GetOrgID()
				if err != nil {
					fmt.Println("Error: organization not initialized")
					os.Exit(1)
				}

				cl := client.NewClient(orgID, "demo-key")

				versionInfo := core.GetVersionInfo()

				hb := &Heartbeat{
					Version:       versionInfo.Version,
					ActiveWorkers: workers,
					IntentVolume:  volume,
					SystemHealth:  "ok",
				}

				// Preparar campos temporales/org antes de enviar
				PrepareHeartbeat(orgID, hb)

				err = cl.SendHeartbeat(hb)
				if err != nil {
					fmt.Printf("Error: %v\n", err)
					os.Exit(1)
				}

				if c.IsJSON {
					data, _ := json.Marshal(HeartbeatResponse{Status: "sent", Message: "ok"})
					fmt.Println(string(data))
				} else {
					fmt.Println("💓 Heartbeat sent")
				}
			},
		}

		cmd.Flags().IntVar(&workers, "workers", 0, "Active workers count")
		cmd.Flags().IntVar(&volume, "volume", 0, "Intent volume")

		return cmd
	})
}