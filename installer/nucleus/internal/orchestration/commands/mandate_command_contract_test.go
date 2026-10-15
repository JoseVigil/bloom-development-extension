package commands

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"os"
	"strings"
	"testing"

	"nucleus/internal/core"

	"github.com/spf13/cobra"
)

func TestMandateCommandMetadataContracts(t *testing.T) {
	c := &core.Core{Logger: log.New(io.Discard, "", 0)}
	root := createMandateCommand(c)
	targets := []string{
		"mandate",
		"mandate status",
		"mandate build domains",
		"mandate build domains list",
		"mandate build domains reject",
		"mandate genesis",
		"mandate genesis recover",
		"mandate genesis recover prepare",
		"mandate genesis recover acknowledge",
		"mandate genesis project-status",
		"mandate genesis adopt",
	}
	byPath := map[string]*cobra.Command{}
	var visit func(*cobra.Command, string)
	visit = func(cmd *cobra.Command, parent string) {
		path := strings.TrimSpace(parent + " " + cmd.Name())
		byPath[path] = cmd
		for _, child := range cmd.Commands() {
			visit(child, path)
		}
	}
	visit(root, "")
	for _, path := range targets {
		cmd := byPath[path]
		if cmd == nil {
			t.Fatalf("command %q not registered", path)
		}
		if strings.TrimSpace(cmd.Short) == "" || cmd.Annotations["category"] != "MANDATES" {
			t.Fatalf("command %q has incomplete metadata", path)
		}
		var sample any
		if raw := cmd.Annotations["json_response"]; raw == "" || json.Unmarshal([]byte(raw), &sample) != nil {
			t.Fatalf("command %q has invalid json_response", path)
		}
		if !strings.Contains(cmd.Example, "nucleus ") || !strings.Contains(cmd.Example, "--json") {
			t.Fatalf("command %q lacks human/JSON examples", path)
		}
	}
}

func TestRecoveryResultKeepsJSONContractAndHumanOutputSeparate(t *testing.T) {
	jsonCore := &core.Core{Logger: log.New(io.Discard, "", 0), IsJSON: true}
	read, write, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	previous := os.Stdout
	os.Stdout = write
	printRecoveryResult(jsonCore, map[string]any{"success": true, "projectId": "project-1"}, nil)
	_ = write.Close()
	os.Stdout = previous
	raw, _ := io.ReadAll(read)
	_ = read.Close()
	var payload map[string]any
	if json.Unmarshal(bytes.TrimSpace(raw), &payload) != nil || payload["projectId"] != "project-1" {
		t.Fatalf("unexpected JSON output: %s", raw)
	}

	var human bytes.Buffer
	humanCore := &core.Core{Logger: log.New(&human, "", 0), IsJSON: false}
	printRecoveryResult(humanCore, map[string]any{"success": true}, nil)
	if !strings.Contains(human.String(), "[SUCCESS]") {
		t.Fatalf("human output missing success marker: %q", human.String())
	}
}
