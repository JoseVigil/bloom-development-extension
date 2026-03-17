// File: internal/supervisor/workers.go
// Temporal worker pool inspection commands — nucleus workers list / describe
// Auto-contained command following NUCLEUS master guide v2.0
package supervisor

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"nucleus/internal/core"

	"github.com/spf13/cobra"
)

func init() {
	core.RegisterCommand("ORCHESTRATION", createWorkersCommand)
}

// ============================================================================
// SHARED TYPES — used by workers list, workers describe, and health.go
// ============================================================================

// PollerInfo represents an individual poller reported by Temporal CLI.
type PollerInfo struct {
	BuildID        string  `json:"buildId"`
	TaskQueueType  string  `json:"taskQueueType"`
	Identity       string  `json:"identity"`
	LastAccessTime string  `json:"lastAccessTime"`
	RatePerSecond  float64 `json:"ratePerSecond"`
}

// TaskQueueStats represents the statistics for one task-queue type.
type TaskQueueStats struct {
	BuildID                 string  `json:"buildId"`
	TaskQueueType           string  `json:"taskQueueType"`
	ApproximateBacklogCount int     `json:"approximateBacklogCount"`
	ApproximateBacklogAge   string  `json:"approximateBacklogAge"`
	BacklogIncreaseRate     float64 `json:"backlogIncreaseRate"`
	TasksAddRate            float64 `json:"tasksAddRate"`
	TasksDispatchRate       float64 `json:"tasksDispatchRate"`
}

// temporalDescribeResult is the exact schema returned by `temporal task-queue describe -o json`.
type temporalDescribeResult struct {
	Pollers []PollerInfo     `json:"pollers"`
	Stats   []TaskQueueStats `json:"stats"`
}

// getTaskQueuePollers queries Temporal and returns pollers and stats for the
// profile-orchestration task queue.
//
// Resolution order for temporal binary:
//  1. binDir/temporal/temporal.exe  (absolute path)
//  2. temporal on PATH              (fallback)
//
// Timeout: 5 s for the subprocess.
// Used by workers list, workers describe, and checkWorker in health.go.
func getTaskQueuePollers(ctx context.Context, binDir string) ([]PollerInfo, []TaskQueueStats, error) {
	temporalBin := filepath.Join(binDir, "temporal", "temporal.exe")
	if _, err := os.Stat(temporalBin); err != nil {
		if p, lookErr := exec.LookPath("temporal"); lookErr == nil {
			temporalBin = p
		} else {
			return nil, nil, fmt.Errorf("temporal binary not found at %s or in PATH", temporalBin)
		}
	}

	tqCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	out, err := exec.CommandContext(tqCtx, temporalBin,
		"task-queue", "describe",
		"--task-queue", "profile-orchestration",
		"-o", "json",
	).CombinedOutput()
	if err != nil {
		if tqCtx.Err() == context.DeadlineExceeded {
			return nil, nil, fmt.Errorf("temporal CLI timeout after 5s")
		}
		return nil, nil, fmt.Errorf("temporal CLI failed: %w (output: %s)", err, string(out))
	}

	var result temporalDescribeResult
	if err := json.Unmarshal(out, &result); err != nil {
		return nil, nil, fmt.Errorf("invalid JSON from temporal CLI: %w", err)
	}

	return result.Pollers, result.Stats, nil
}

// ============================================================================
// WORKER INFO — rich struct for UI consumption
// ============================================================================

// WorkerInfo contains the full identity, connection status, and timing
// information for a single Temporal worker.
type WorkerInfo struct {
	// Identity
	Identity       string `json:"identity"`
	RawIdentity    string `json:"raw_identity"`
	IdentityFormat string `json:"identity_format"` // "enriched" | "legacy"
	PID            int    `json:"pid,omitempty"`
	Hostname       string `json:"hostname"`
	Version        string `json:"version,omitempty"`
	Role           string `json:"role,omitempty"`
	BuildID        string `json:"build_id"`

	// Connection state
	HasWorkflowPoller bool   `json:"has_workflow_poller"`
	HasActivityPoller bool   `json:"has_activity_poller"`
	FullyConnected    bool   `json:"fully_connected"`
	PollerCount       int    `json:"poller_count"`
	Status            string `json:"status"` // "ACTIVE" | "IDLE" | "STALE"

	// Timestamps
	LastSeen              string `json:"last_seen"`
	LastSeenAgoSeconds    int64  `json:"last_seen_ago_seconds"`
	LastWorkflowSeen      string `json:"last_workflow_seen,omitempty"`
	LastActivitySeen      string `json:"last_activity_seen,omitempty"`

	// Rates per poller type
	WorkflowRatePerSecond float64 `json:"workflow_rate_per_second"`
	ActivityRatePerSecond float64 `json:"activity_rate_per_second"`

	// Capabilities — leído de config/worker_capabilities.json
	Workflows  []string `json:"workflows,omitempty"`
	Activities []string `json:"activities,omitempty"`
}

// parseWorkerIdentity parses a raw Temporal worker identity string.
//
// Enriched format: nucleus-worker/{version}@{hostname}/{role}
//
//	e.g. nucleus-worker/dev@LENOVO/profile-orchestration
//
// Legacy format:   {pid}@{hostname}@
//
//	e.g. 23428@LENOVO@
func parseWorkerIdentity(raw string) (format, hostname, version, role string, pid int) {
	if strings.HasPrefix(raw, "nucleus-worker/") {
		format = "enriched"
		s := strings.TrimPrefix(raw, "nucleus-worker/")
		atIdx := strings.Index(s, "@")
		if atIdx > 0 {
			version = s[:atIdx]
			rest := s[atIdx+1:]
			slashIdx := strings.Index(rest, "/")
			if slashIdx > 0 {
				hostname = rest[:slashIdx]
				role = rest[slashIdx+1:]
			} else {
				hostname = rest
			}
		}
	} else {
		format = "legacy"
		parts := strings.Split(strings.TrimSuffix(raw, "@"), "@")
		if len(parts) >= 2 {
			pid, _ = strconv.Atoi(parts[0])
			hostname = parts[1]
		}
	}
	return
}

// workerStatus maps a lastSeen duration to an ACTIVE / IDLE / STALE label.
func workerStatus(lastSeenAgo time.Duration) string {
	switch {
	case lastSeenAgo < 60*time.Second:
		return "ACTIVE"
	case lastSeenAgo < 5*time.Minute:
		return "IDLE"
	default:
		return "STALE"
	}
}

// ============================================================================
// WORKER CAPABILITIES — lee config/worker_capabilities.json
// ============================================================================

// workerCapabilitiesFile es el schema del archivo escrito por worker.go al arrancar.
type workerCapabilitiesFile struct {
	PID          int      `json:"pid"`
	RegisteredAt string   `json:"registered_at"`
	TaskQueue    string   `json:"task_queue"`
	Workflows    []string `json:"workflows"`
	Activities   []string `json:"activities"`
}

// loadWorkerCapabilities lee config/worker_capabilities.json y retorna un map
// keyed por PID para cruzar con los pollers de Temporal.
// Retorna map vacío si el archivo no existe o no se puede parsear (no-fatal).
func loadWorkerCapabilities(logsDir string) map[int]*workerCapabilitiesFile {
	result := make(map[int]*workerCapabilitiesFile)
	historyDir := filepath.Join(filepath.Dir(logsDir), "history", "workers")

	entries, err := os.ReadDir(historyDir)
	if err != nil {
		return result // directorio no existe aún — normal en primer arranque
	}

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasPrefix(entry.Name(), "capabilities_") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(historyDir, entry.Name()))
		if err != nil {
			continue
		}
		var caps workerCapabilitiesFile
		if err := json.Unmarshal(data, &caps); err != nil {
			continue
		}
		if caps.PID > 0 {
			result[caps.PID] = &caps
		}
	}
	return result
}

// formatCapabilitiesSummary genera un string corto para la tabla humana.
// Ejemplo: "ProfileLifecycle, Seed (+5 activities)"
func formatCapabilitiesSummary(workflows, activities []string) string {
	if len(workflows) == 0 && len(activities) == 0 {
		return ""
	}
	var wfPart string
	switch len(workflows) {
	case 0:
		wfPart = ""
	case 1:
		wfPart = shortName(workflows[0])
	case 2:
		wfPart = shortName(workflows[0]) + ", " + shortName(workflows[1])
	default:
		wfPart = shortName(workflows[0]) + ", " + shortName(workflows[1]) +
			fmt.Sprintf(" (+%d)", len(workflows)-2)
	}
	if len(activities) > 0 {
		wfPart += fmt.Sprintf(" · %da", len(activities))
	}
	return wfPart
}

// shortName acorta un nombre de workflow eliminando el sufijo "Workflow".
func shortName(name string) string {
	return strings.TrimSuffix(name, "Workflow")
}

// buildWorkerInfos groups a flat pollers slice by identity and produces one
// WorkerInfo per unique worker.
func buildWorkerInfos(pollers []PollerInfo, caps map[int]*workerCapabilitiesFile) []WorkerInfo {
	type group struct {
		pollers []PollerInfo
	}
	groups := make(map[string]*group)
	order := []string{}

	for _, p := range pollers {
		if _, ok := groups[p.Identity]; !ok {
			groups[p.Identity] = &group{}
			order = append(order, p.Identity)
		}
		groups[p.Identity].pollers = append(groups[p.Identity].pollers, p)
	}

	workers := make([]WorkerInfo, 0, len(order))
	now := time.Now()

	for _, identity := range order {
		g := groups[identity]
		format, hostname, version, role, pid := parseWorkerIdentity(identity)

		var (
			hasWorkflow, hasActivity       bool
			lastWorkflowTime, lastActivityTime time.Time
			workflowRate, activityRate     float64
			buildID                        string
		)

		for _, p := range g.pollers {
			t, _ := time.Parse(time.RFC3339Nano, p.LastAccessTime)
			tqType := strings.ToUpper(p.TaskQueueType)
			if strings.Contains(tqType, "WORKFLOW") {
				hasWorkflow = true
				if t.After(lastWorkflowTime) {
					lastWorkflowTime = t
				}
				workflowRate = p.RatePerSecond
			} else if strings.Contains(tqType, "ACTIVITY") {
				hasActivity = true
				if t.After(lastActivityTime) {
					lastActivityTime = t
				}
				activityRate = p.RatePerSecond
			}
			if buildID == "" && p.BuildID != "" {
				buildID = p.BuildID
			}
		}

		// Pick the most-recent timestamp as LastSeen
		lastSeen := lastWorkflowTime
		if lastActivityTime.After(lastSeen) {
			lastSeen = lastActivityTime
		}
		if lastSeen.IsZero() {
			lastSeen = now
		}

		agoSec := int64(now.Sub(lastSeen).Seconds())
		if agoSec < 0 {
			agoSec = 0
		}

		// Format display identity (truncated already handled in table output)
		displayIdentity := identity

		if buildID == "" {
			buildID = "UNVERSIONED"
		}

		wi := WorkerInfo{
			Identity:              displayIdentity,
			RawIdentity:           identity,
			IdentityFormat:        format,
			PID:                   pid,
			Hostname:              hostname,
			Version:               version,
			Role:                  role,
			BuildID:               buildID,
			HasWorkflowPoller:     hasWorkflow,
			HasActivityPoller:     hasActivity,
			FullyConnected:        hasWorkflow && hasActivity,
			PollerCount:           len(g.pollers),
			Status:                workerStatus(now.Sub(lastSeen)),
			LastSeen:              lastSeen.UTC().Format(time.RFC3339),
			LastSeenAgoSeconds:    agoSec,
			WorkflowRatePerSecond: workflowRate,
			ActivityRatePerSecond: activityRate,
		}

		// Enriquecer con capabilities si el PID matchea
		if pid > 0 {
			if c, ok := caps[pid]; ok {
				wi.Workflows = c.Workflows
				wi.Activities = c.Activities
			}
		}

		if !lastWorkflowTime.IsZero() {
			wi.LastWorkflowSeen = lastWorkflowTime.UTC().Format(time.RFC3339)
		}
		if !lastActivityTime.IsZero() {
			wi.LastActivitySeen = lastActivityTime.UTC().Format(time.RFC3339)
		}

		workers = append(workers, wi)
	}

	return workers
}

// ============================================================================
// RESPONSE STRUCTS
// ============================================================================

// BacklogDetail holds per-type task queue backlog metrics.
type BacklogDetail struct {
	Count        int     `json:"count"`
	Age          string  `json:"age"`
	AddRate      float64 `json:"add_rate"`
	DispatchRate float64 `json:"dispatch_rate"`
}

// WorkersListResult is the JSON envelope returned by `nucleus workers list`.
type WorkersListResult struct {
	Success             bool                      `json:"success"`
	TaskQueue           string                    `json:"task_queue"`
	WorkerCount         int                       `json:"worker_count"`
	ActiveCount         int                       `json:"active_count"`
	IdleCount           int                       `json:"idle_count"`
	StaleCount          int                       `json:"stale_count"`
	FullyConnectedCount int                       `json:"fully_connected_count"`
	TotalPollers        int                       `json:"total_pollers_in_queue"`
	Workers             []WorkerInfo              `json:"workers"`
	Backlog             map[string]BacklogDetail  `json:"backlog"`
	Timestamp           int64                     `json:"timestamp"`
	Error               string                    `json:"error,omitempty"`
}

// ============================================================================
// FORMAT HELPERS
// ============================================================================

// formatAgo formats seconds as "Xs", "Xm Ys", or "Xh Ym".
func formatAgo(secs int64) string {
	d := time.Duration(secs) * time.Second
	switch {
	case d < time.Minute:
		return fmt.Sprintf("%ds", secs)
	case d < time.Hour:
		m := int(d.Minutes())
		s := secs - int64(m)*60
		return fmt.Sprintf("%dm%ds", m, s)
	default:
		h := int(d.Hours())
		m := int(d.Minutes()) - h*60
		return fmt.Sprintf("%dh%dm", h, m)
	}
}

// truncate clips a string to maxLen, appending "..." if clipped.
func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-3] + "..."
}

// pollerCheck returns "✓" or "✗".
func pollerCheck(ok bool) string {
	if ok {
		return "✓"
	}
	return "✗"
}

// ============================================================================
// WORKERS SNAPSHOT — persistent log of workers list results
// ============================================================================

// snapshotLogLine es la línea JSON que se appends al log por cada ejecución.
type snapshotLogLine struct {
	TaskQueue           string                   `json:"task_queue"`
	WorkerCount         int                      `json:"worker_count"`
	ActiveCount         int                      `json:"active_count"`
	IdleCount           int                      `json:"idle_count"`
	StaleCount          int                      `json:"stale_count"`
	FullyConnectedCount int                      `json:"fully_connected_count"`
	TotalPollers        int                      `json:"total_pollers_in_queue"`
	Workers             []WorkerInfo             `json:"workers"`
	Backlog             map[string]BacklogDetail `json:"backlog"`
	Timestamp           int64                    `json:"timestamp"`
	TimestampISO        string                   `json:"timestamp_iso"`
}

// writeWorkersSnapshot appends una línea al log diario de snapshots y registra
// el stream en telemetría (idempotente — safe to call en cada ejecución).
//
// Path:   logs/nucleus/worker/nucleus_workers_snapshot_YYYYMMDD.log
// Stream: nucleus_workers_snapshot
// Errors: no-fatal — se loguean a stderr, nunca interrumpen el output principal.
func writeWorkersSnapshot(c *core.Core, result WorkersListResult) {
	logsDir := getLogsDir(c)
	dateStr := time.Now().Format("20060102")
	logDir := filepath.Join(logsDir, "nucleus", "worker")
	logPath := filepath.Join(logDir, fmt.Sprintf("nucleus_workers_snapshot_%s.log", dateStr))

	if err := os.MkdirAll(logDir, 0755); err != nil {
		fmt.Fprintf(os.Stderr, "[workers snapshot] ERROR: MkdirAll(%s): %v\n", logDir, err)
		return
	}

	// Registrar stream en telemetría via CLI (mismo path que todo proceso externo)
	// Idempotente — nucleus telemetry register preserva first_seen en updates.
	nucleusBin := filepath.Join(getBinDir(c), "nucleus", "nucleus.exe")
	if _, statErr := os.Stat(nucleusBin); statErr != nil {
		if p, lookErr := exec.LookPath("nucleus"); lookErr == nil {
			nucleusBin = p
		}
	}
	registerArgs := []string{
		"telemetry", "register",
		"--stream", "nucleus_workers_snapshot",
		"--label", "👷 WORKERS SNAPSHOT",
		"--path", filepath.ToSlash(logPath),
		"--priority", "2",
		"--category", "nucleus",
		"--source", "nucleus",
		"--description", "Temporal worker pool snapshot log — one JSON line per `nucleus workers list` execution, captures worker count, status, poller connectivity and backlog for AI-assisted diagnostics",
	}
	regCmd := exec.Command(nucleusBin, registerArgs...)
	// En modo --json silenciar completamente el subprocess — su output
	// va a stderr del padre y la consola lo mezcla con el JSON.
	// El registro es no-fatal: si falla, el snapshot igual se escribe en disco.
	if c.IsJSON {
		regCmd.Stdout = nil
		regCmd.Stderr = nil
	} else {
		regCmd.Stdout = os.Stderr
		regCmd.Stderr = os.Stderr
	}
	regCmd.Run()

	line := snapshotLogLine{
		TaskQueue:           result.TaskQueue,
		WorkerCount:         result.WorkerCount,
		ActiveCount:         result.ActiveCount,
		IdleCount:           result.IdleCount,
		StaleCount:          result.StaleCount,
		FullyConnectedCount: result.FullyConnectedCount,
		TotalPollers:        result.TotalPollers,
		Workers:             result.Workers,
		Backlog:             result.Backlog,
		Timestamp:           result.Timestamp,
		TimestampISO:        time.Now().UTC().Format(time.RFC3339),
	}

	lineJSON, err := json.Marshal(line)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[workers snapshot] ERROR: json.Marshal: %v\n", err)
		return
	}

	// Formato: "2026/03/16 19:14:14 [SNAPSHOT] {...}\n"
	// Mismo prefijo de timestamp que el resto de logs del sistema.
	entry := fmt.Sprintf("%s [SNAPSHOT] %s\n",
		time.Now().Format("2006/01/02 15:04:05"),
		string(lineJSON),
	)

	f, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[workers snapshot] ERROR: OpenFile(%s): %v\n", logPath, err)
		return
	}
	defer f.Close()

	if _, err := f.WriteString(entry); err != nil {
		fmt.Fprintf(os.Stderr, "[workers snapshot] ERROR: WriteString: %v\n", err)
	}
}

// ============================================================================
// PARENT COMMAND: nucleus workers
// ============================================================================

func createWorkersCommand(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "workers",
		Short: "Temporal worker pool inspection and management",
		Long: `Inspect and manage the Temporal worker pool connected to profile-orchestration.

Provides real-time visibility into worker identities, connection status,
polling activity, and task queue backlog.`,
		Annotations: map[string]string{
			"category": "ORCHESTRATION",
		},
	}
	cmd.AddCommand(createWorkersListCommand(c))
	cmd.AddCommand(createWorkersDescribeCommand(c))
	return cmd
}

// ============================================================================
// SUBCOMMAND: nucleus workers list
// ============================================================================

func createWorkersListCommand(c *core.Core) *cobra.Command {
	return &cobra.Command{
		Use:   "list",
		Short: "List all active workers in profile-orchestration task queue",

		Args: cobra.NoArgs,

		Annotations: map[string]string{
			"category": "ORCHESTRATION",
			"json_response": `{
  "success": true,
  "task_queue": "profile-orchestration",
  "worker_count": 2,
  "active_count": 1,
  "idle_count": 1,
  "stale_count": 0,
  "fully_connected_count": 2,
  "total_pollers_in_queue": 4,
  "workers": [
    {
      "identity": "nucleus-worker/dev@LENOVO/profile-orchestration",
      "raw_identity": "nucleus-worker/dev@LENOVO/profile-orchestration",
      "identity_format": "enriched",
      "hostname": "LENOVO",
      "version": "dev",
      "role": "profile-orchestration",
      "build_id": "UNVERSIONED",
      "has_workflow_poller": true,
      "has_activity_poller": true,
      "fully_connected": true,
      "poller_count": 2,
      "status": "ACTIVE",
      "last_seen": "2026-03-16T17:12:39Z",
      "last_seen_ago_seconds": 33,
      "workflow_rate_per_second": 100000,
      "activity_rate_per_second": 100000
    }
  ],
  "backlog": {
    "workflow": { "count": 0, "age": "", "add_rate": 0, "dispatch_rate": 0 },
    "activity": { "count": 0, "age": "", "add_rate": 0, "dispatch_rate": 0 }
  },
  "timestamp": 1773680744
}`,
		},

		Example: `  nucleus workers list
  nucleus --json workers list`,

		Run: func(cmd *cobra.Command, args []string) {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()

			pollers, stats, err := getTaskQueuePollers(ctx, getBinDir(c))
			if err != nil {
				result := WorkersListResult{
					Success:   false,
					TaskQueue: "profile-orchestration",
					Error:     err.Error(),
					Timestamp: time.Now().Unix(),
				}
				if c.IsJSON {
					outputJSONResult(result)
				} else {
					c.Logger.Printf("[ERROR] workers list failed: %v", err)
				}
				return
			}

			caps := loadWorkerCapabilities(getLogsDir(c))
			workers := buildWorkerInfos(pollers, caps)

			// Counters
			var activeCount, idleCount, staleCount, fullyConnectedCount int
			for _, w := range workers {
				switch w.Status {
				case "ACTIVE":
					activeCount++
				case "IDLE":
					idleCount++
				case "STALE":
					staleCount++
				}
				if w.FullyConnected {
					fullyConnectedCount++
				}
			}

			// Backlog from stats
			backlog := map[string]BacklogDetail{
				"workflow": {},
				"activity": {},
			}
			for _, s := range stats {
				key := strings.ToLower(s.TaskQueueType)
				if key != "workflow" && key != "activity" {
					continue
				}
				backlog[key] = BacklogDetail{
					Count:        s.ApproximateBacklogCount,
					Age:          s.ApproximateBacklogAge,
					AddRate:      s.TasksAddRate,
					DispatchRate: s.TasksDispatchRate,
				}
			}

			result := WorkersListResult{
				Success:             true,
				TaskQueue:           "profile-orchestration",
				WorkerCount:         len(workers),
				ActiveCount:         activeCount,
				IdleCount:           idleCount,
				StaleCount:          staleCount,
				FullyConnectedCount: fullyConnectedCount,
				TotalPollers:        len(pollers),
				Workers:             workers,
				Backlog:             backlog,
				Timestamp:           time.Now().Unix(),
			}

			// Persistir snapshot — no-fatal, no bloquea el output
			writeWorkersSnapshot(c, result)

			if c.IsJSON {
				outputJSONResult(result)
				return
			}

			// ── Human-readable table ──────────────────────────────────────
			sep := strings.Repeat("─", 90)
			fmt.Printf("WORKERS — profile-orchestration (%d active)\n", activeCount)
			fmt.Println(sep)
			fmt.Printf("%-22s  %-7s  %-8s  %s  %s  %s\n", "IDENTITY", "STATUS", "AGO", "W", "A", "CAPABILITIES")
			for _, w := range workers {
				capSummary := formatCapabilitiesSummary(w.Workflows, w.Activities)
				fmt.Printf("%-22s  %-7s  %-8s  %s  %s  %s\n",
					truncate(w.Identity, 22),
					w.Status,
					formatAgo(w.LastSeenAgoSeconds),
					pollerCheck(w.HasWorkflowPoller),
					pollerCheck(w.HasActivityPoller),
					capSummary,
				)
			}
			fmt.Println(sep)
			wfBacklog := backlog["workflow"].Count
			actBacklog := backlog["activity"].Count
			fmt.Printf("Backlog: %d workflows · %d activities\n", wfBacklog, actBacklog)
		},
	}
}

// ============================================================================
// SUBCOMMAND: nucleus workers describe
// ============================================================================

func createWorkersDescribeCommand(c *core.Core) *cobra.Command {
	var identityFlag string

	cmd := &cobra.Command{
		Use:   "describe",
		Short: "Show detailed information for a specific worker",

		Args: cobra.NoArgs,

		Annotations: map[string]string{
			"category": "ORCHESTRATION",
			"json_response": `{
  "success": true,
  "worker": {
    "identity": "nucleus-worker/dev@LENOVO/profile-orchestration",
    "raw_identity": "nucleus-worker/dev@LENOVO/profile-orchestration",
    "identity_format": "enriched",
    "hostname": "LENOVO",
    "version": "dev",
    "role": "profile-orchestration",
    "build_id": "UNVERSIONED",
    "has_workflow_poller": true,
    "has_activity_poller": true,
    "fully_connected": true,
    "poller_count": 2,
    "status": "ACTIVE",
    "last_seen": "2026-03-16T17:12:39Z",
    "last_seen_ago_seconds": 33,
    "workflow_rate_per_second": 100000,
    "activity_rate_per_second": 100000
  },
  "timestamp": 1773680744
}`,
		},

		Example: `  nucleus workers describe --identity "nucleus-worker/dev@LENOVO/profile-orchestration"
  nucleus --json workers describe --identity "23428@LENOVO@"`,

		Run: func(cmd *cobra.Command, args []string) {
			if identityFlag == "" {
				msg := "--identity flag is required"
				if c.IsJSON {
					outputJSONResult(map[string]interface{}{
						"success":   false,
						"error":     msg,
						"timestamp": time.Now().Unix(),
					})
				} else {
					c.Logger.Printf("[ERROR] %s", msg)
				}
				return
			}

			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()

			pollers, _, err := getTaskQueuePollers(ctx, getBinDir(c))
			if err != nil {
				if c.IsJSON {
					outputJSONResult(map[string]interface{}{
						"success":   false,
						"error":     err.Error(),
						"timestamp": time.Now().Unix(),
					})
				} else {
					c.Logger.Printf("[ERROR] workers describe failed: %v", err)
				}
				return
			}

			caps := loadWorkerCapabilities(getLogsDir(c))
			workers := buildWorkerInfos(pollers, caps)

			var found *WorkerInfo
			for i := range workers {
				if workers[i].Identity == identityFlag {
					found = &workers[i]
					break
				}
			}

			if found == nil {
				errMsg := fmt.Sprintf("worker not found: %s", identityFlag)
				if c.IsJSON {
					outputJSONResult(map[string]interface{}{
						"success":   false,
						"error":     errMsg,
						"timestamp": time.Now().Unix(),
					})
				} else {
					c.Logger.Printf("[ERROR] %s", errMsg)
				}
				return
			}

			if c.IsJSON {
				outputJSONResult(map[string]interface{}{
					"success":   true,
					"worker":    found,
					"timestamp": time.Now().Unix(),
				})
				return
			}

			// ── Human-readable detail view ────────────────────────────────
			sep := strings.Repeat("─", 54)
			connLabel := "partially connected"
			if found.FullyConnected {
				connLabel = "fully connected"
			}

			fmt.Printf("Worker: %s\n", found.Identity)
			fmt.Println(sep)
			fmt.Printf("Format:    %s\n", found.IdentityFormat)
			if found.IdentityFormat == "enriched" {
				fmt.Printf("Version:   %s\n", found.Version)
				fmt.Printf("Hostname:  %s\n", found.Hostname)
				fmt.Printf("Role:      %s\n", found.Role)
			} else {
				fmt.Printf("PID:       %d\n", found.PID)
				fmt.Printf("Hostname:  %s\n", found.Hostname)
			}
			fmt.Printf("Status:    %s\n", found.Status)
			fmt.Printf("Last seen: %s ago (%s)\n", formatAgo(found.LastSeenAgoSeconds), found.LastSeen)
			fmt.Printf("Pollers:   workflow %s  activity %s  (%s)\n",
				pollerCheck(found.HasWorkflowPoller),
				pollerCheck(found.HasActivityPoller),
				connLabel,
			)
			fmt.Printf("Rates:     workflow %.0f/s  activity %.0f/s\n",
				found.WorkflowRatePerSecond,
				found.ActivityRatePerSecond,
			)
			fmt.Printf("Build ID:  %s\n", found.BuildID)
		},
	}

	cmd.Flags().StringVar(&identityFlag, "identity", "", "Worker identity to describe (required)")
	return cmd
}