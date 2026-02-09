package bootstrap

import (
	"net/http"
	"time"
)

// checkGRPCHealth verifica el endpoint gRPC de Temporal
func checkGRPCHealth() bool {
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get("http://localhost:7233/")
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode > 0
}

// checkUIHealth verifica el endpoint de la UI de Temporal
func checkUIHealth() bool {
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get("http://localhost:8233/")
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == 200
}

// checkTemporalHealth verifica el estado completo de Temporal
func checkTemporalHealth() (operational bool, state string, healthChecks map[string]bool) {
	healthChecks = map[string]bool{
		"grpc": checkGRPCHealth(),
		"ui":   checkUIHealth(),
	}

	operational = healthChecks["ui"] || healthChecks["grpc"]

	if operational {
		state = "RUNNING"
	} else {
		state = "NOT_RUNNING"
	}

	return operational, state, healthChecks
}