package ignition

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"os/exec"
	"strings"
	"time"
)

func (ig *Ignition) startBrainService() error {
	ig.Core.Logger.Info("[IGNITION] Levantando servicio base brain.exe...")
	cmd := exec.Command("brain.exe", "service", "start")
	cmd.Env = append(os.Environ(), "PYTHONIOENCODING=utf-8")

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("no se pudo ejecutar brain.exe: %v", err)
	}

	ig.Session.ServicePID = cmd.Process.Pid

	for i := 0; i < 15; i++ {
		conn, _ := net.DialTimeout("tcp", "127.0.0.1:5678", 500*time.Millisecond)
		if conn != nil {
			conn.Close()
			return nil
		}
		time.Sleep(500 * time.Millisecond)
	}
	return fmt.Errorf("timeout: el servicio brain.exe no respondió en el puerto 5678")
}

func (ig *Ignition) execute(profileID string) (string, error) {
	ig.Core.Logger.Info("[IGNITION] Ejecutando orden de lanzamiento en engine...")
	cmd := exec.Command("brain.exe", "profile", "launch", profileID, "--spec", ig.SpecPath)
	cmd.Env = append(os.Environ(), "PYTHONIOENCODING=utf-8")

	stdout, _ := cmd.StdoutPipe()
	if err := cmd.Start(); err != nil {
		return "", fmt.Errorf("fallo al invocar el engine: %v", err)
	}

	resChan := make(chan string, 1)
	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Text()
			if idx := strings.Index(line, "{"); idx != -1 {
				var resp LaunchResponse
				if err := json.Unmarshal([]byte(line[idx:]), &resp); err == nil {
					if resp.Status == "success" {
						ig.Session.BrowserPID = resp.Data.Launch.PID
						_ = ig.updateProfilesConfig(profileID, resp.Data.Launch.LaunchID, resp.Data.LogFiles.DebugLog, resp.Data.LogFiles.NetLog)
						resChan <- resp.Data.Launch.LaunchID
						return
					}
				}
			}
		}
	}()

	select {
	case physicalID := <-resChan:
		return physicalID, nil
	case <-time.After(12 * time.Second):
		return "", fmt.Errorf("timeout: brain.exe no devolvió confirmación de lanzamiento")
	}
}

func (ig *Ignition) startPostLaunchAnalysis(profileID string, launchID string) {
	go func() {
		time.Sleep(2 * time.Second)
		ig.runAnalysisCommand("read-log", profileID, launchID)
		ig.runAnalysisCommand("mining-log", profileID, launchID)
	}()
	go func() {
		time.Sleep(10 * time.Second)
		ig.runAnalysisCommand("read-net-log", profileID, launchID)
	}()
}

func (ig *Ignition) runAnalysisCommand(commandType string, profileID string, launchID string) {
	args := []string{"--json", "chrome", commandType, profileID, "--launch-id", launchID}
	if commandType == "read-net-log" {
		args = append(args, "--filter-ai")
	}
	cmd := exec.Command("brain.exe", args...)
	cmd.Env = append(os.Environ(), "PYTHONIOENCODING=utf-8", "PYTHONUTF8=1")
	_, _ = cmd.CombinedOutput()
}