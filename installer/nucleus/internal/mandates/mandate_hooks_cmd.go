package mandates

import (
	"context"
	"encoding/json"
	"fmt"
	"nucleus/internal/core"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"
)

func init() {
	core.RegisterCommand("MANDATES", createHooksCommand)
}

func createHooksCommand(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "hooks",
		Short: "Manage and execute mandate hooks",
		Long:  "Discover and execute Python hooks registered for system events.",
		Annotations: map[string]string{
			"category": "MANDATES",
		},
	}

	cmd.AddCommand(createHooksRunSubcommand(c))
	cmd.AddCommand(createHooksListSubcommand(c))

	return cmd
}

func createHooksRunSubcommand(c *core.Core) *cobra.Command {
	var contextJSON string

	cmd := &cobra.Command{
		Use:   "run <event>",
		Short: "Execute all hooks registered for an event",
		Long: `Discover and execute all Python hooks registered for a system event.

Hooks are loaded from:
  Windows : %LOCALAPPDATA%\BloomNucleus\hooks\<event>\
  macOS   : ~/Library/Application Support/BloomNucleus/hooks/<event>/
  Linux   : ~/.local/share/BloomNucleus/hooks/<event>/

Scripts are executed in alphabetical order (00_, 01_, ...).
Each script receives the context via stdin as JSON and must return JSON via stdout.`,

		Args: cobra.ExactArgs(1),

		Annotations: map[string]string{
			"category": "MANDATES",
			"json_response": `{
  "success": true,
  "event": "post_launch",
  "total": 1,
  "failed": 0,
  "hooks": [
    {
      "hook": "00_generate_synapse_trace.py",
      "success": true,
      "stdout": "Synapse trace generado correctamente"
    }
  ]
}`,
		},

		Example: `  nucleus hooks run post_launch
  nucleus hooks run post_launch --context '{"launch_id":"001_031c802a_205228","profile_id":"031c802a","log_base_dir":"C:\\...\\logs","nucleus_bin":"C:\\...\\nucleus.exe"}'
  nucleus --json hooks run post_launch --context '{...}'`,

		Run: func(cmd *cobra.Command, args []string) {
			event := args[0]

			var hctx HookContext
			if contextJSON != "" {
				if err := json.Unmarshal([]byte(contextJSON), &hctx); err != nil {
					c.Logger.Printf("[ERROR] Invalid --context JSON: %v", err)
					return
				}
			}

			c.Logger.Printf("[INFO] Running hooks for event: %s", event)
			result := RunEvent(context.Background(), event, hctx)

			if c.IsJSON {
				data, _ := json.MarshalIndent(result, "", "  ")
				fmt.Fprintln(os.Stdout, string(data))
				return
			}

			c.Logger.Printf("[INFO] Total hooks: %d", result.Total)

			if result.Total == 0 {
				c.Logger.Printf("[INFO] No hooks registered for this event.")
				return
			}

			for _, hr := range result.Hooks {
				if hr.Success {
					c.Logger.Printf("[SUCCESS] ✅ %s", hr.Hook)
				} else {
					c.Logger.Printf("[ERROR] ❌ %s — %s", hr.Hook, hr.Error)
				}
			}

			if result.Success {
				c.Logger.Printf("[SUCCESS] ✅ All hooks completed (%d/%d)", result.Total-result.Failed, result.Total)
			} else {
				c.Logger.Printf("[ERROR] ❌ %d hook(s) failed", result.Failed)
			}
		},
	}

	cmd.Flags().StringVar(&contextJSON, "context", "", "Hook context as JSON string")
	return cmd
}

func createHooksListSubcommand(c *core.Core) *cobra.Command {
	return &cobra.Command{
		Use:   "list <event>",
		Short: "List hooks registered for an event",
		Args:  cobra.ExactArgs(1),

		Annotations: map[string]string{
			"category": "MANDATES",
			"json_response": `{
  "event": "post_launch",
  "hooks_dir": "C:\\Users\\josev\\AppData\\Local\\BloomNucleus\\hooks\\post_launch",
  "hooks": ["00_generate_synapse_trace.py"]
}`,
		},

		Example: `  nucleus hooks list post_launch
  nucleus --json hooks list post_launch`,

		Run: func(cmd *cobra.Command, args []string) {
			event := args[0]
			scripts, _ := DiscoverHooks(event)
			hooksDir := filepath.Join(HooksBaseDir(), event)

			type ListResult struct {
				Event    string   `json:"event"`
				HooksDir string   `json:"hooks_dir"`
				Hooks    []string `json:"hooks"`
			}

			result := ListResult{
				Event:    event,
				HooksDir: hooksDir,
				Hooks:    []string{},
			}

			for _, s := range scripts {
				result.Hooks = append(result.Hooks, filepath.Base(s))
			}

			if c.IsJSON {
				data, _ := json.MarshalIndent(result, "", "  ")
				fmt.Fprintln(os.Stdout, string(data))
				return
			}

			c.Logger.Printf("[INFO] 📂 %s", hooksDir)
			if len(scripts) == 0 {
				c.Logger.Printf("[INFO] No hooks registered.")
				return
			}
			for _, h := range result.Hooks {
				c.Logger.Printf("[INFO]    • %s", h)
			}
		},
	}
}