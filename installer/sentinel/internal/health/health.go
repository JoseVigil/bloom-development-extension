package health

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"sentinel/internal/discovery"
	"sync"
	"time"
)

type ServiceStatus struct {
	Name      string `json:"name"`
	Available bool   `json:"available"`
	Details   string `json:"details"`
}

type HealthReport struct {
	Timestamp           string               `json:"timestamp"`
	SystemMap           *discovery.SystemMap `json:"system_map"`
	ExecutablesValid    bool                 `json:"executables_valid"`
	Services            []ServiceStatus      `json:"services"`
	OnboardingCompleted bool                 `json:"onboarding_completed"`
}

func CheckHealth(sm *discovery.SystemMap) (*HealthReport, error) {
	report := &HealthReport{
		Timestamp: time.Now().Format(time.RFC3339),
		SystemMap: sm,
	}

	// Validar ejecutables
	if _, err := os.Stat(sm.BrainPath); err == nil {
		report.ExecutablesValid = true
	}

	// Escaneo de Red Concurrente (Tu lógica original)
	var wg sync.WaitGroup
	sc := make(chan ServiceStatus, 2)

	wg.Add(2)
	go func() { defer wg.Done(); sc <- checkTCP(5678, "Brain TCP Service") }()
	go func() { defer wg.Done(); sc <- checkHTTP(3001, "Chrome Extension Backend") }()

	go func() {
		wg.Wait()
		close(sc)
	}()

	for s := range sc {
		report.Services = append(report.Services, s)
	}

	// Check Lógico Onboarding
	if report.ExecutablesValid {
		cmd := exec.Command(sm.BrainPath, "--json", "health", "onboarding-status")
		if out, err := cmd.Output(); err == nil {
			var resp struct {
				Onboarding struct{ Completed bool } `json:"onboarding"`
			}
			if err := json.Unmarshal(out, &resp); err == nil {
				report.OnboardingCompleted = resp.Onboarding.Completed
			}
		}
	}

	return report, nil
}

func checkTCP(port int, name string) ServiceStatus {
	conn, err := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", port), 1*time.Second)
	if err != nil {
		return ServiceStatus{Name: name, Available: false, Details: "Puerto cerrado"}
	}
	conn.Close()
	return ServiceStatus{Name: name, Available: true, Details: "OK"}
}

func checkHTTP(port int, name string) ServiceStatus {
	client := http.Client{Timeout: 1 * time.Second}
	resp, err := client.Get(fmt.Sprintf("http://127.0.0.1:%d/health", port))
	if err != nil || resp.StatusCode != 200 {
		return ServiceStatus{Name: name, Available: false, Details: "Inalcanzable"}
	}
	defer resp.Body.Close()
	return ServiceStatus{Name: name, Available: true, Details: "HTTP 200 OK"}
}