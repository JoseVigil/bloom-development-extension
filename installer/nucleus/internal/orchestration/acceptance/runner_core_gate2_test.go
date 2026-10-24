package acceptance

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"os/user"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"

	"go.temporal.io/sdk/client"
	"go.temporal.io/sdk/worker"
	"nucleus/internal/core"
	"nucleus/internal/orchestration/activities"
	"nucleus/internal/orchestration/temporal"
	"nucleus/internal/orchestration/temporal/workflows"
	"nucleus/internal/orchestration/watchers"
)

type runnerCoreGate2Client struct{ client *temporal.Client }

// Environment-only diagnostic for the resource detectors Temporal invokes at
// startup. It reports error classes, never usernames or machine identifiers.
func TestRunnerCoreGate2EnvironmentProbe(t *testing.T) {
	if os.Getenv("RUNNER_CORE_GATE2_ROOT") == "" {
		t.Skip("Gate 2 probe only")
	}
	result := map[string]any{}
	_, err := os.Executable()
	result["executableError"] = fmt.Sprint(err)
	_, err = os.Hostname()
	result["hostnameError"] = fmt.Sprint(err)
	_, err = user.Current()
	result["ownerError"] = fmt.Sprint(err)
	if token, tokenErr := syscall.OpenCurrentProcessToken(); tokenErr != nil {
		result["tokenError"] = fmt.Sprint(tokenErr)
	} else {
		defer token.Close()
		_, profileErr := token.GetUserProfileDirectory()
		result["profileDirectoryError"] = fmt.Sprint(profileErr)
	}
	_, err = os.Stat("/proc/self/cgroup")
	result["cgroupMissing"] = errors.Is(err, os.ErrNotExist)
	result["cgroupError"] = fmt.Sprint(err)
	_ = json.NewEncoder(os.Stdout).Encode(result)
}

func (c runnerCoreGate2Client) StartMandateBuildWorkflow(ctx context.Context, id string, input workflows.MandateBuildInput) (client.WorkflowRun, error) {
	return c.client.StartMandateBuildWorkflow(ctx, id, input)
}

func (runnerCoreGate2Client) StartMandateExecutionWorkflow(context.Context, string, workflows.MandateExecutionInput) (client.WorkflowRun, error) {
	return nil, errors.New("runner_core_gate2_execution_forbidden")
}

func (runnerCoreGate2Client) SignalMandateExecutionWorkflow(context.Context, string, string) error {
	return errors.New("runner_core_gate2_execution_forbidden")
}

// A separate short-lived probe proves that the Temporal server (including
// after restart) has the workflow in its own durable store.
func TestRunnerCoreGate2Describe(t *testing.T) {
	root := os.Getenv("RUNNER_CORE_GATE2_ROOT")
	id := os.Getenv("RUNNER_CORE_MANDATE_ID")
	address := os.Getenv("RUNNER_CORE_TEMPORAL_ADDRESS")
	if root == "" && id == "" {
		t.Skip("Gate 2 probe only")
	}
	parent := `C:\repos\bloom-development-extension\synapse-runner\.runner-core-temp`
	if !strings.EqualFold(filepath.Dir(filepath.Clean(root)), parent) || !strings.HasPrefix(filepath.Base(root), "rc-") ||
		!strings.HasPrefix(id, "mandate_build_") || os.Getenv("BLOOM_NUCLEUS_PATH") != filepath.Join(root, "workspace", "runner-core-gate2") {
		t.Fatal("gate2 describe context invalid")
	}
	host, _, err := net.SplitHostPort(address)
	if err != nil || host != "127.0.0.1" {
		t.Fatal("gate2 describe endpoint invalid")
	}
	paths, err := core.InitPaths()
	if err != nil {
		t.Fatal(err)
	}
	tc, err := temporal.NewClientAt(context.Background(), paths, true, address)
	if err != nil {
		t.Fatal(err)
	}
	defer tc.Close()
	desc, err := tc.GetClient().DescribeWorkflowExecution(context.Background(), id, "")
	if err != nil {
		t.Fatal(err)
	}
	info := desc.GetWorkflowExecutionInfo()
	if info == nil || info.GetExecution().GetWorkflowId() != id {
		t.Fatal("gate2 workflow identity invalid")
	}
	_ = json.NewEncoder(os.Stdout).Encode(map[string]any{"gate2WorkflowId": id,
		"runId": info.GetExecution().GetRunId(), "status": info.GetStatus().String()})
}
func (c runnerCoreGate2Client) IsWorkflowRunning(ctx context.Context, id string) (bool, error) {
	return c.client.IsWorkflowRunning(ctx, id)
}
func (c runnerCoreGate2Client) GetWorkflowExecutionState(ctx context.Context, id string) (watchers.WorkflowExecutionState, error) {
	state, err := c.client.GetWorkflowExecutionState(ctx, id)
	return watchers.WorkflowExecutionState(state), err
}

// TestRunnerCoreGate2Watcher is compiled to a disposable test executable.
// It runs the real watcher, workflow worker and the activities required to stop
// durably at Human Sync. Later activities are deliberately not registered.
func TestRunnerCoreGate2Watcher(t *testing.T) {
	root := os.Getenv("RUNNER_CORE_GATE2_ROOT")
	address := os.Getenv("RUNNER_CORE_TEMPORAL_ADDRESS")
	if root == "" && address == "" {
		t.Skip("Gate 2 executable only")
	}
	parent := `C:\repos\bloom-development-extension\synapse-runner\.runner-core-temp`
	if !strings.EqualFold(filepath.Dir(filepath.Clean(root)), parent) || !strings.HasPrefix(filepath.Base(root), "rc-") {
		t.Fatal("gate2 root outside disposable parent")
	}
	host, portText, err := net.SplitHostPort(address)
	if err != nil || host != "127.0.0.1" {
		t.Fatal("gate2 Temporal address must be loopback")
	}
	port, err := strconv.Atoi(portText)
	if err != nil || port < 1 || port > 65535 {
		t.Fatal("gate2 Temporal port invalid")
	}
	workspace := filepath.Join(root, "workspace", "runner-core-gate2")
	expectedAppData := filepath.Join(root, "home", "AppData", "Local", "BloomNucleus")
	if os.Getenv("RUNNER_CORE_HUMAN_SYNC") == "1" {
		expectedAppData = os.Getenv("RUNNER_CORE_PRODUCT_APPDATA")
		if expectedAppData == "" || !filepath.IsAbs(expectedAppData) || filepath.Base(expectedAppData) != "BloomNucleus" {
			t.Fatal("gate2 product Vault path invalid")
		}
	}
	if os.Getenv("BLOOM_NUCLEUS_PATH") != workspace || os.Getenv("BLOOM_APPDATA_DIR") != expectedAppData {
		t.Fatal("gate2 environment outside root")
	}
	paths, err := core.InitPaths()
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	tc, err := temporal.NewClientAt(ctx, paths, true, address)
	if err != nil {
		t.Fatal(err)
	}
	defer tc.Close()
	if os.Getenv("RUNNER_CORE_HUMAN_SYNC") == "1" {
		w := worker.New(tc.GetClient(), "mandate-orchestration", worker.Options{})
		w.RegisterWorkflow(workflows.MandateBuildWorkflow)
		w.RegisterActivity(activities.IngestReceptionActivity)
		w.RegisterActivity(activities.LoadMandateBuildCheckpointActivity)
		w.RegisterActivity(activities.ScaffoldDomainActivity)
		w.RegisterActivity(activities.PublishMandateEventActivity)
		w.RegisterActivity(activities.AdvancePhaseActivity)
		w.RegisterActivity(activities.PersistCandidateDomainsActivity)
		if err := w.Start(); err != nil {
			t.Fatal(err)
		}
		defer w.Stop()
	}
	mandates := filepath.Join(workspace, ".bloom", ".nucleus-runner-core-gate2", ".mandates")
	watcher, err := watchers.NewMandateWatcher(mandates, runnerCoreGate2Client{tc}, paths, true)
	if err != nil {
		t.Fatal(err)
	}
	ended := make(chan error, 1)
	go func() { ended <- watcher.Start(ctx) }()
	logPath := filepath.Join(root, ".runner-core", "watcher.log")
	deadline := time.After(20 * time.Second)
	for {
		select {
		case err := <-ended:
			t.Fatalf("watcher exited before ready: %v", err)
		case <-deadline:
			t.Fatal("watcher readiness timeout")
		default:
			if raw, err := os.ReadFile(logPath); err == nil && strings.Contains(string(raw), "[mandate_watcher] vigilando "+mandates) {
				marker := filepath.Join(root, ".runner-core", "watcher.ready")
				if err := os.WriteFile(marker, []byte(fmt.Sprintf("%d", os.Getpid())), 0600); err != nil {
					t.Fatal(err)
				}
				for {
					time.Sleep(time.Second)
				}
			}
			time.Sleep(50 * time.Millisecond)
		}
	}
}
