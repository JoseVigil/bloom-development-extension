package health

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"sentinel/internal/core"
	"sentinel/internal/discovery"
	"sentinel/internal/startup"
	"sync"
	"time"
)

func CheckHealth(c *core.Core, sm *discovery.SystemMap) (*startup.SystemStatus, error) {
	// 1. CARGA ADITIVA: Leemos lo que ya existe para no borrar datos de dev-start
	statusObj := startup.LoadCurrentStatus(c)
	status := &statusObj

	status.Timestamp = time.Now().Format(time.RFC3339)
	
	// 2. Refrescar Mapa de Binarios
	status.SystemMap["brain_exe"] = sm.BrainPath
	status.SystemMap["chrome_exe"] = sm.ChromePath
	
	_, errB := os.Stat(sm.BrainPath)
	_, errC := os.Stat(sm.ChromePath)
	status.ExecutablesValid = (errB == nil && errC == nil)

	// 3. Escaneo de Red Concurrente
	var wg sync.WaitGroup
	sc := make(chan startup.ServiceStatus, 4)

	wg.Add(4)
	go func() { defer wg.Done(); sc <- checkPort(5678, "Core Bridge", "TCP") }()
	go func() { defer wg.Done(); sc <- checkPort(3001, "Extension API", "HTTP") }()
	go func() { defer wg.Done(); sc <- checkPort(5173, "Svelte Dev", "TCP") }()
	go func() {
		defer wg.Done()
		active := false
		if status.ExecutablesValid {
			_, err := startup.FetchBrainManifest(sm.BrainPath)
			if err == nil { active = true }
		}
		sc <- startup.ServiceStatus{Name: "Brain JSON Protocol", Active: active}
	}()

	go func() {
		wg.Wait()
		close(sc)
	}()

	status.Services = []startup.ServiceStatus{} 
	for s := range sc {
		status.Services = append(status.Services, s)
	}

	// 4. Check de Onboarding
	if status.ExecutablesValid {
		cmd := exec.Command(sm.BrainPath, "--json", "health", "onboarding-status")
		if out, err := cmd.Output(); err == nil {
			var resp struct{ Onboarding struct{ Completed bool } `json:"onboarding"` }
			if err := json.Unmarshal(out, &resp); err == nil {
				status.OnboardingCompleted = resp.Onboarding.Completed
			}
		}
	}

	// 5. Persistencia (Mezclada y Aditiva)
	_ = startup.SaveSystemStatus(c, *status)

	return status, nil
}

func checkPort(port int, name, proto string) startup.ServiceStatus {
	addr := fmt.Sprintf("127.0.0.1:%d", port)
	active := false
	if proto == "HTTP" {
		client := http.Client{Timeout: 1 * time.Second}
		resp, err := client.Get(fmt.Sprintf("http://%s/health", addr))
		active = (err == nil && resp.StatusCode == 200)
	} else {
		conn, err := net.DialTimeout("tcp", addr, 1*time.Second)
		if err == nil { active = true; conn.Close() }
	}
	return startup.ServiceStatus{Name: name, Port: port, Active: active}
}