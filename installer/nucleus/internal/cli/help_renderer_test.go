package cli

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"

	"github.com/spf13/cobra"
)

func nestedMandateHelpFixture() (*cobra.Command, *cobra.Command) {
	root := &cobra.Command{Use: "nucleus"}
	mandate := &cobra.Command{Use: "mandate", Annotations: map[string]string{"category": "MANDATES"}}
	build := &cobra.Command{Use: "build", Short: "Prepara un Mandate"}
	domains := &cobra.Command{Use: "domains", Short: "Selecciona dominios"}
	confirm := &cobra.Command{Use: "confirm", Short: "Confirma un dominio", Long: "Confirma un dominio del Mandate en preparación",
		Example:     "nucleus mandate build domains confirm --id M --domain-id D",
		Annotations: map[string]string{"category": "MANDATES", "json_response": `{"success":true,"mandateId":"M"}`}}
	confirm.Flags().String("id", "", "Mandate ID")
	confirm.Flags().String("domain-id", "", "Domain ID")
	root.AddCommand(mandate)
	mandate.AddCommand(build)
	build.AddCommand(domains)
	domains.AddCommand(confirm)
	return root, confirm
}

func TestNestedMandateHelpExportsHumanPathAndJSONMetadata(t *testing.T) {
	root, confirm := nestedMandateHelpFixture()
	var human bytes.Buffer
	RenderFullHelp(root, NewModernHelpRenderer(&human, DefaultNucleusConfig()))
	if !strings.Contains(human.String(), "nucleus mandate build domains confirm") || !strings.Contains(human.String(), "--domain-id") {
		t.Fatalf("nested command absent from human help: %s", human.String())
	}
	human.Reset()
	RenderFullHelp(confirm, NewModernHelpRenderer(&human, DefaultNucleusConfig()))
	if !strings.Contains(human.String(), "nucleus mandate build domains confirm") || !strings.Contains(human.String(), "Confirma un dominio") {
		t.Fatalf("leaf help missing: %s", human.String())
	}
	for _, entries := range [][]CommandJSON{collectHelpJSON(root), collectHelpJSON(confirm)} {
		found := false
		for _, entry := range entries {
			if entry.Path != "nucleus mandate build domains confirm" {
				continue
			}
			var response map[string]interface{}
			if err := json.Unmarshal([]byte(entry.JSONResponse), &response); err != nil || response["mandateId"] != "M" {
				t.Fatalf("invalid JSON metadata: %#v err=%v", entry, err)
			}
			if len(entry.Options) != 2 || entry.Example == "" {
				t.Fatalf("flags or examples missing: %#v", entry)
			}
			found = true
		}
		if !found {
			t.Fatal("nested public path absent from JSON help")
		}
	}
}
