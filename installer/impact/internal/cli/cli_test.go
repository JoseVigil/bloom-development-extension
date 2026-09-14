package cli

import (
	"bytes"
	"encoding/json"
	"github.com/spf13/cobra"
	_ "impact/internal/assessment"
	"impact/internal/core"
	"impact/internal/evaluation"
	"io"
	"os"
	"strings"
	"testing"
)

type registrar struct{}

func (registrar) Register(string) error { return nil }
func run(t *testing.T, args ...string) (string, string, error) {
	t.Helper()
	var out, stderr bytes.Buffer
	err := Execute(args, &out, &stderr, func(jsonMode bool) (*core.Logger, error) {
		var console io.Writer = &out
		if jsonMode {
			console = &stderr
		}
		return core.NewLogger(core.LoggerOptions{LogsDir: t.TempDir(), Console: console, Errors: &stderr, Registrar: registrar{}})
	})
	return out.String(), stderr.String(), err
}
func TestJSONStdoutSuccessFailureAndHelp(t *testing.T) {
	for i, args := range [][]string{{"assess", "--input", "../../testdata/assessment.json", "--json"}, {"--json", "assess"}, {"--json-help"}, {"assess", "--json-help"}, {"--json", "assess", "--input", "missing"}} {
		out, stderr, err := run(t, args...)
		if (i == 0 || i == 2 || i == 3) && err != nil {
			t.Fatalf("expected success: %v %s", err, out)
		}
		if (i == 1 || i == 4) && err == nil {
			t.Fatal("expected command failure")
		}
		if !json.Valid([]byte(out)) {
			t.Fatalf("not one JSON response: %q", out)
		}
		if !strings.Contains(stderr, "[INFO]") {
			t.Fatal("missing operational log")
		}
	}
}
func TestMetadataIsRecursiveAndNewCommandsAppear(t *testing.T) {
	c := &core.Core{Engine: evaluation.Default(), Out: io.Discard, Err: io.Discard}
	root := NewRoot(c)
	var verify func(*cobra.Command)
	verify = func(cmd *cobra.Command) {
		if cmd.Hidden {
			return
		}
		if cmd.Args == nil || cmd.Short == "" || cmd.Long == "" || cmd.Example == "" || cmd.Annotations["category"] == "" || !json.Valid([]byte(cmd.Annotations["json_response"])) {
			t.Fatalf("missing metadata: %s", cmd.CommandPath())
		}
		for _, ch := range cmd.Commands() {
			verify(ch)
		}
	}
	verify(root)
	parent := &cobra.Command{Use: "future", Annotations: map[string]string{"category": "EVALUATION", "json_response": "{}"}}
	parent.AddCommand(&cobra.Command{Use: "nested", Short: "new command", Annotations: map[string]string{"category": "EVALUATION", "json_response": "{}"}})
	root.AddCommand(parent)
	var human, machine bytes.Buffer
	_ = RenderFullHelp(&human, root)
	if e := RenderHelpJSON(&machine, root); e != nil {
		t.Fatal(e)
	}
	if !strings.Contains(human.String(), "nested") || !strings.Contains(machine.String(), "nested") {
		t.Fatal("new command missing")
	}
}

func TestJSONErrorsBeforeCobraDispatch(t *testing.T) {
	for _, args := range [][]string{{"does-not-exist", "--json"}, {"--bad-flag", "--json"}, {"assess", "--json-help", "--bad-flag"}} {
		out, stderr, err := run(t, args...)
		if err == nil || !json.Valid([]byte(out)) || !strings.Contains(stderr, "[INFO]") {
			t.Fatalf("%v: %q %q %v", args, out, stderr, err)
		}
	}
}

func TestExplicitBooleanJSONFlag(t *testing.T) {
	for _, flag := range []string{"--json=1", "--json=TRUE"} {
		out, _, err := run(t, "assess", "--input", "../../testdata/assessment.json", flag)
		if err != nil || !json.Valid([]byte(out)) {
			t.Fatalf("%s: %v %q", flag, err, out)
		}
	}
}
func TestGeneratedHelpMatchesTree(t *testing.T) {
	c := &core.Core{Out: io.Discard, Err: io.Discard}
	root := NewRoot(c)
	for _, ext := range []string{"txt", "json"} {
		var out bytes.Buffer
		if ext == "txt" {
			_ = RenderFullHelp(&out, root)
		} else {
			_ = RenderHelpJSON(&out, root)
		}
		raw, e := os.ReadFile("../../../help/impact_help." + ext)
		if e != nil {
			t.Fatal(e)
		}
		if string(raw) != out.String() {
			t.Fatalf("generated %s help is stale", ext)
		}
	}
}
