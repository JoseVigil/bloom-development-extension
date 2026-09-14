package cli

import (
	"encoding/json"
	"fmt"
	"github.com/spf13/cobra"
	"github.com/spf13/pflag"
	"io"
	"sort"
)

type FlagJSON struct {
	Name        string `json:"name"`
	Type        string `json:"type"`
	Default     string `json:"default"`
	Description string `json:"description"`
	Required    bool   `json:"required"`
}
type CommandJSON struct {
	Name         string          `json:"name"`
	Syntax       string          `json:"syntax"`
	Description  string          `json:"description"`
	Long         string          `json:"long"`
	Category     string          `json:"category"`
	Examples     string          `json:"examples"`
	JSONResponse json.RawMessage `json:"json_response"`
	Flags        []FlagJSON      `json:"flags"`
	Commands     []CommandJSON   `json:"commands"`
}

func metadata(cmd *cobra.Command) CommandJSON {
	item := CommandJSON{Name: cmd.CommandPath(), Syntax: cmd.UseLine(), Description: cmd.Short, Long: cmd.Long, Category: cmd.Annotations["category"], Examples: cmd.Example, JSONResponse: json.RawMessage(cmd.Annotations["json_response"]), Flags: []FlagJSON{}, Commands: []CommandJSON{}}
	flags := pflag.NewFlagSet("metadata", pflag.ContinueOnError)
	flags.AddFlagSet(cmd.InheritedFlags())
	flags.AddFlagSet(cmd.LocalFlags())
	flags.VisitAll(func(f *pflag.Flag) {
		if !f.Hidden {
			_, required := f.Annotations[cobra.BashCompOneRequiredFlag]
			item.Flags = append(item.Flags, FlagJSON{f.Name, f.Value.Type(), f.DefValue, f.Usage, required})
		}
	})
	children := append([]*cobra.Command(nil), cmd.Commands()...)
	sort.Slice(children, func(i, j int) bool { return children[i].Name() < children[j].Name() })
	for _, child := range children {
		if !child.Hidden {
			item.Commands = append(item.Commands, metadata(child))
		}
	}
	return item
}
func RenderHelpJSON(out io.Writer, cmd *cobra.Command) error {
	e := json.NewEncoder(out)
	e.SetIndent("", "  ")
	return e.Encode(metadata(cmd))
}
func RenderFullHelp(out io.Writer, cmd *cobra.Command) error {
	cfg := DefaultImpactConfig()
	fmt.Fprintf(out, "%s — %s\n", cfg.AppName, cfg.AppSubtitle)
	for _, category := range cfg.CategoryOrder {
		fmt.Fprintf(out, "%s: %s\n", category, cfg.CategoryDescs[category])
	}
	var render func(CommandJSON)
	render = func(c CommandJSON) {
		fmt.Fprintf(out, "\n%s [%s]\n%s\n%s\n", c.Syntax, c.Category, c.Description, c.Long)
		for _, f := range c.Flags {
			fmt.Fprintf(out, "  --%s (%s, default=%q, required=%t): %s\n", f.Name, f.Type, f.Default, f.Required, f.Description)
		}
		fmt.Fprintf(out, "Examples:\n%s\nJSON response: %s\n", c.Examples, c.JSONResponse)
		for _, child := range c.Commands {
			render(child)
		}
	}
	render(metadata(cmd))
	return nil
}
