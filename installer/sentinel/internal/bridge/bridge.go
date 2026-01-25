package bridge

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"sentinel/internal/core"
	"sentinel/internal/discovery"
	"sentinel/internal/health"
	"sentinel/internal/seed"

	"github.com/spf13/cobra"
)

type RPCRequest struct {
	Method string          `json:"method"`
	Params json.RawMessage `json:"params"`
}

func init() {
	core.RegisterCommand("BRIDGE", func(c *core.Core) *cobra.Command {
		return &cobra.Command{
			Use:   "bridge",
			Short: "Modo Bridge para comunicación JSON-RPC con Electron",
			Run: func(cmd *cobra.Command, args []string) {
				c.Logger.Info("📡 Modo Bridge Activo (Esperando comandos JSON)")
				scanner := bufio.NewScanner(os.Stdin)
				for scanner.Scan() {
					var req RPCRequest
					if err := json.Unmarshal(scanner.Bytes(), &req); err != nil {
						sendError("JSON_PARSE_ERROR", err.Error())
						continue
					}

					switch req.Method {
					case "seed":
						var params struct {
							Alias  string
							Master bool
						}
						json.Unmarshal(req.Params, &params)
						uuid, err := seed.HandleSeed(c, params.Alias, params.Master)
						if err != nil {
							sendError("SEED_ERROR", err.Error())
						} else {
							sendResponse(map[string]string{"status": "success", "uuid": uuid})
						}

					case "health":
						sm, _ := discovery.DiscoverSystem(c.Paths.BinDir)
						report, _ := health.CheckHealth(c, sm)
						sendResponse(report)

					case "ping":
						sendResponse("pong")

					default:
						sendError("UNKNOWN_METHOD", req.Method)
					}
				}
			},
		}
	})
}

func sendResponse(data interface{}) {
	res, _ := json.Marshal(map[string]interface{}{"result": data})
	fmt.Println(string(res))
}

func sendError(code, msg string) {
	res, _ := json.Marshal(map[string]interface{}{
		"error": map[string]string{"code": code, "message": msg},
	})
	fmt.Println(string(res))
}