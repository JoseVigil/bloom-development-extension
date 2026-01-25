package cli

import (
	"encoding/json"
	"fmt"
	"strings"
	"github.com/spf13/cobra"
	"github.com/spf13/pflag"
)

type CommandJSON struct {
	Name        string        `json:"name"`
	Use         string        `json:"use"`
	Short       string        `json:"short"`
	Category    string        `json:"category,omitempty"`
	Options     []FlagJSON    `json:"options,omitempty"`
	SubCommands []CommandJSON `json:"subcommands,omitempty"`
}

type FlagJSON struct {
	Name      string `json:"name"`
	Shorthand string `json:"shorthand"`
	Usage     string `json:"usage"`
	Default   string `json:"default"`
}

// RenderHelpJSON: EXPORTADA (MAYÚSCULA)
func RenderHelpJSON(root *cobra.Command) {
	var fullMap []CommandJSON
	for _, sub := range root.Commands() {
		if sub.Name() == "help" || sub.Name() == "completion" { continue }
		fullMap = append(fullMap, parseCommand(sub))
	}
	output, _ := json.MarshalIndent(fullMap, "", "  ")
	fmt.Println(string(output))
}

func parseCommand(cmd *cobra.Command) CommandJSON {
	item := CommandJSON{
		Name:     cmd.Name(),
		Use:      cmd.Use,
		Short:    cmd.Short,
		Category: cmd.Annotations["category"],
	}
	cmd.LocalFlags().VisitAll(func(f *pflag.Flag) {
		item.Options = append(item.Options, FlagJSON{
			Name: f.Name, Shorthand: f.Shorthand, Usage: f.Usage, Default: f.DefValue,
		})
	})
	for _, child := range cmd.Commands() {
		item.SubCommands = append(item.SubCommands, parseCommand(child))
	}
	return item
}

// RenderFullDiscoveryHelp: EXPORTADA
func RenderFullDiscoveryHelp(root *cobra.Command) {
	fmt.Printf("\n [SENTINEL] Modular Orchestrator for Bloom\n")
	DrawBox("Uso / Usage", []string{"sentinel [command] [args]", "Ejemplo: sentinel health"})
	
	categories := []string{"SYSTEM", "IDENTITY", "RUNTIME", "BRIDGE", "DEVELOPMENT", "UI"}
	for _, cat := range categories {
		var content []string
		for _, sub := range root.Commands() {
			if sub.Annotations["category"] == cat {
				content = append(content, fmt.Sprintf("  %s - %s", strings.ToUpper(sub.Name()), sub.Short))
			}
		}
		if len(content) > 0 { DrawBox(cat, content) }
	}
}

func DrawBox(title string, lines []string) {
	width := 85
	fmt.Printf("+-- %s %s+\n", title, strings.Repeat("-", width-len(title)-4))
	for _, l := range lines { fmt.Printf("| %-82s |\n", l) }
	fmt.Printf("+%s+\n", strings.Repeat("-", width-2))
}