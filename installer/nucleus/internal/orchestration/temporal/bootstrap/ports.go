package bootstrap

import (
	"fmt"
	"net"
	"time"
)

// isPortListening verifica si un puerto TCP está en estado LISTEN
func isPortListening(port int) bool {
	address := net.JoinHostPort("localhost", fmt.Sprintf("%d", port))
	
	conn, err := net.DialTimeout("tcp", address, 2*time.Second)
	if err != nil {
		return false
	}
	conn.Close()
	return true
}

// waitForPort espera a que un puerto esté disponible
func waitForPort(port int, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	
	for time.Now().Before(deadline) {
		if isPortListening(port) {
			return true
		}
		time.Sleep(500 * time.Millisecond)
	}
	
	return false
}