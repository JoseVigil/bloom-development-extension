//go:build windows

package main

import (
	"encoding/json"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"
)

type processIdentity struct {
	PID     int    `json:"pid"`
	Created string `json:"created"`
}

// captureServiceDescendants records the entire process tree before SCM stops
// NSSM. Detached npm/cmd/Node descendants can outlive the service process.
func captureServiceDescendants(service string) ([]processIdentity, error) {
	quoted := strings.ReplaceAll(service, "'", "''")
	ps := fmt.Sprintf(`$ErrorActionPreference='Stop'; $svc=Get-CimInstance Win32_Service -Filter "Name='%s'"; if (!$svc -or !$svc.ProcessId) { '[]'; exit }; $rows=@(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CreationDate); $known=@{}; $known[[int]$svc.ProcessId]=$true; $result=@(); do { $added=$false; foreach($p in $rows) { $pidValue=[int]$p.ProcessId; if (!$known.ContainsKey($pidValue) -and $known.ContainsKey([int]$p.ParentProcessId)) { $known[$pidValue]=$true; $result+=@{pid=$pidValue;created=$p.CreationDate.ToUniversalTime().Ticks.ToString()}; $added=$true } } } while($added); ConvertTo-Json -InputObject @($result) -Compress -Depth 3`, quoted)
	v, err := command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", ps)
	if err != nil {
		return nil, err
	}
	var result []processIdentity
	if err := json.Unmarshal([]byte(strings.TrimSpace(v)), &result); err != nil {
		return nil, fmt.Errorf("inventario de hijos inválido: %w", err)
	}
	return result, nil
}

func stopCapturedDescendants(children []processIdentity, out io.Writer) error {
	// Stop deepest descendants first, while checking creation time so a reused
	// PID cannot cause an unrelated process to be terminated.
	for i := len(children) - 1; i >= 0; i-- {
		child := children[i]
		if child.PID <= 0 {
			return fmt.Errorf("PID hijo inválido: %d", child.PID)
		}
		if _, err := strconv.ParseInt(child.Created, 10, 64); err != nil {
			return fmt.Errorf("fecha de proceso inválida para PID %d", child.PID)
		}
		ps := fmt.Sprintf(`$ErrorActionPreference='Stop'; $p=Get-CimInstance Win32_Process -Filter 'ProcessId=%d'; if (!$p -or $p.CreationDate.ToUniversalTime().Ticks.ToString() -ne '%s') { exit 0 }; Stop-Process -Id %d -Force -ErrorAction Stop; Start-Sleep -Milliseconds 200; $p=Get-CimInstance Win32_Process -Filter 'ProcessId=%d'; if ($p -and $p.CreationDate.ToUniversalTime().Ticks.ToString() -eq '%s') { throw 'proceso sigue activo' }`, child.PID, child.Created, child.PID, child.PID, child.Created)
		if _, err := command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", ps); err != nil {
			return fmt.Errorf("PID %d: %w", child.PID, err)
		}
		fmt.Fprintf(out, "Proceso hijo verificado y detenido si seguía activo (PID %d).\n", child.PID)
	}
	if len(children) > 0 {
		time.Sleep(300 * time.Millisecond)
	}
	return nil
}
