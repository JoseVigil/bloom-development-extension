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

	// 1. Validar Ejecutable de Brain de forma estática
	if info, err := os.Stat(sm.BrainPath); err == nil && !info.IsDir() {
		report.ExecutablesValid = true
	}

	// 2. Escaneo de Red Concurrente (3 Servicios)
	// Usamos 127.0.0.1 para evitar el lag de resolución de DNS de 'localhost' en Windows
	var wg sync.WaitGroup
	sc := make(chan ServiceStatus, 3)

	wg.Add(3)
	// Brain: Servicio de datos (TCP)
	go func() { defer wg.Done(); sc <- checkPort(5678, "Brain TCP Service", "TCP") }()
	// Extension: API Rest (HTTP)
	go func() { defer wg.Done(); sc <- checkPort(3001, "Chrome Extension Backend", "HTTP") }()
	// Svelte: Servidor de Desarrollo (TCP es suficiente para detectar que Vite despertó)
	go func() { defer wg.Done(); sc <- checkPort(5173, "Svelte Dev Server", "TCP") }()

	go func() { wg.Wait(); close(sc) }()
	for s := range sc {
		report.Services = append(report.Services, s)
	}

	// 3. Check Lógico: Onboarding (Llamada real a brain.exe)
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

func checkPort(port int, name, proto string) ServiceStatus {
	// Forzamos 127.0.0.1 para coincidir con el flag --host de Vite
	addr := fmt.Sprintf("127.0.0.1:%d", port)
	
	if proto == "HTTP" {
		client := http.Client{Timeout: 3 * time.Second} // Aumentamos a 3s para SvelteKit
		resp, err := client.Get(fmt.Sprintf("http://%s/health", addr))
		if err == nil && resp.StatusCode == 200 {
			return ServiceStatus{Name: name, Available: true, Details: "HTTP 200 OK"}
		}
		return ServiceStatus{Name: name, Available: false, Details: "Inalcanzable (API no responde)"}
	}

	// Chequeo TCP genérico (rápido y fiable para servicios vivos)
	conn, err := net.DialTimeout("tcp", addr, 2*time.Second)
	if err != nil {
		return ServiceStatus{Name: name, Available: false, Details: "Puerto cerrado o servicio inactivo"}
	}
	conn.Close()
	return ServiceStatus{Name: name, Available: true, Details: "Servicio activo (Puerto abierto)"}
}