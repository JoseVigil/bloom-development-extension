package health

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os/exec"
	"runtime"
	"sentinel/internal/core"
	"sentinel/internal/discovery"
	"sentinel/internal/startup"
	"sync"
	"time"

	"github.com/spf13/cobra"
)

func init() {
	core.RegisterCommand("SYSTEM", func(c *core.Core) *cobra.Command {
		return &cobra.Command{
			Use:   "health",
			Short: "Escaneo de integridad del sistema",
			Run: func(cmd *cobra.Command, args []string) {
				c.Logger.Info("🔍 Iniciando escaneo de integridad...")
				if err := EnsureBrainRunning(c); err != nil {
					c.Logger.Error("❌ Brain Service: %v", err)
				} else {
					c.Logger.Success("✓ Brain Service: Operativo")
				}
				sm, _ := discovery.DiscoverSystem(c.Paths.BinDir)
				report, _ := CheckHealth(c, sm)
				out, _ := json.MarshalIndent(report, "", "  ")
				fmt.Println(string(out))
			},
		}
	})
}

func EnsureBrainRunning(c *core.Core) error {
	if err := checkBrainHealth(c); err == nil { return nil }
	c.Logger.Warning("⚠️  Brain Service no detectado, intentando iniciar...")
	if err := startBrainService(c); err != nil { return err }
	time.Sleep(1 * time.Second)
	return checkBrainHealth(c)
}

func checkBrainHealth(c *core.Core) error {
	conn, err := net.DialTimeout("tcp", "127.0.0.1:5678", 2*time.Second)
	if err != nil { return err }
	conn.Close()
	return nil
}

func startBrainService(c *core.Core) error {
	sm, _ := discovery.DiscoverSystem(c.Paths.BinDir)
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command("cmd", "/C", "start", "/B", sm.BrainPath, "service", "start", "--port", "5678")
	} else {
		cmd = exec.Command(sm.BrainPath, "service", "start", "--port", "5678", "--daemon")
	}
	return cmd.Start()
}

func CheckHealth(c *core.Core, sm *discovery.SystemMap) (*startup.SystemStatus, error) {
	statusObj := startup.LoadCurrentStatus(c)
	status := &statusObj
	status.Timestamp = time.Now().Format(time.RFC3339)
	status.SystemMap["brain_exe"] = sm.BrainPath
	status.SystemMap["chrome_exe"] = sm.ChromePath
	
	var wg sync.WaitGroup
	sc := make(chan startup.ServiceStatus, 3)
	wg.Add(3)
	go func() { defer wg.Done(); sc <- checkPort(5678, "Core Bridge", "TCP") }()
	go func() { defer wg.Done(); sc <- checkPort(3001, "Extension API", "HTTP") }()
	go func() { defer wg.Done(); sc <- checkPort(5173, "Svelte Dev", "TCP") }()
	
	go func() { wg.Wait(); close(sc) }()
	status.Services = []startup.ServiceStatus{}
	for s := range sc { status.Services = append(status.Services, s) }
	_ = startup.SaveSystemStatus(c, *status)
	return status, nil
}

func checkPort(port int, name, proto string) startup.ServiceStatus {
	addr := fmt.Sprintf("127.0.0.1:%d", port)
	active := false
	if proto == "HTTP" {
		resp, err := http.Get(fmt.Sprintf("http://%s/health", addr))
		active = (err == nil && resp.StatusCode == 200)
	} else {
		conn, err := net.DialTimeout("tcp", addr, 1*time.Second)
		if err == nil { active = true; conn.Close() }
	}
	return startup.ServiceStatus{Name: name, Port: port, Active: active}
}