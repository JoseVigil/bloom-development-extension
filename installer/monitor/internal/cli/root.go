package cli

import (
	"encoding/json"
	"fmt"
	"github.com/spf13/cobra"
	"io"
	"monitor/internal/core"
	"strconv"
	"strings"
)

func NewRoot(c *core.Core) *cobra.Command {
	var jsonHelp bool
	root := &cobra.Command{Use: "monitor", Short: "Local persistent runtime observer", Long: "Monitor observes runtime facts, correlates evaluable conditions and publishes signals. It never grants authority to execute, pause or cancel work.", Args: cobra.NoArgs, Example: "  monitor --help\n  monitor --json-help", Annotations: map[string]string{"category": "SYSTEM", "json_response": `{"name":"monitor","commands":[],"flags":[]}`}, SilenceErrors: true, SilenceUsage: true}
	root.SetOut(c.Out)
	root.SetErr(c.Err)
	root.PersistentFlags().BoolVar(&c.JSON, "json", false, "Write structured response only to stdout")
	root.PersistentFlags().BoolVar(&jsonHelp, "json-help", false, "Render command metadata as JSON")
	root.CompletionOptions.DisableDefaultCmd = true
	root.SetHelpCommand(&cobra.Command{Use: "help", Hidden: true})
	root.SetHelpFunc(func(cmd *cobra.Command, args []string) {
		if jsonHelp || c.JSON {
			_ = RenderHelpJSON(c.Out, cmd)
		} else {
			_ = RenderFullHelp(c.Out, cmd)
		}
	})
	root.RunE = func(cmd *cobra.Command, args []string) error { return cmd.Help() }
	core.BuildCommands(c, root)
	// Help flags at any depth short circuit execution, including required input.
	var setup func(*cobra.Command)
	setup = func(cmd *cobra.Command) {
		cmd.InitDefaultHelpFlag()
		for _, child := range cmd.Commands() {
			setup(child)
		}
	}
	setup(root)
	return root
}
func Execute(args []string, out, stderr io.Writer, factory func(bool) (*core.Logger, error)) (err error) {
	c := &core.Core{Out: out, Err: stderr, LoggerFactory: factory}
	root := NewRoot(c)
	root.SetArgs(args)
	// Parse before logger construction so even help and argument errors use the
	// correct console channel. Cobra still performs final argument validation.
	target, _, findErr := root.Find(args)
	var parseErr error
	if findErr == nil {
		parseErr = target.ParseFlags(args)
	}
	jsonHelp := requestedFlag(args, "json-help")
	c.JSON = requestedFlag(args, "json") || jsonHelp
	jsonMode := c.JSON || requestedFlag(args, "help") || len(args) == 0
	logger, logErr := factory(jsonMode)
	if logErr != nil {
		return emitError(c, fmt.Errorf("Monitor logging or telemetry initialization failed: %w", logErr))
	}
	c.Logger = logger
	defer func() {
		if closeErr := logger.Close(); closeErr != nil {
			fmt.Fprintln(stderr, "Monitor log close or telemetry update failed")
			if err == nil {
				err = closeErr
			}
		}
	}()
	if err = logger.Info("command started"); err != nil {
		return emitError(c, err)
	}
	if findErr != nil {
		_ = logger.Error("unknown command")
		return emitError(c, fmt.Errorf("unknown command"))
	}
	if parseErr != nil {
		_ = logger.Error("invalid command flags")
		return emitError(c, fmt.Errorf("invalid command flags"))
	}
	// --json-help behaves like --help rather than running the target command.
	if jsonHelp {
		return RenderHelpJSON(out, target)
	}
	if err = root.Execute(); err != nil {
		_ = logger.Error("command failed")
		return emitError(c, err)
	}
	return nil
}

// Determine output routing even when Cobra rejects a command before it parses
// persistent flags. Respect the positional separator and the input flag value.
func requestedFlag(args []string, name string) bool {
	enabled := false
	for i := 0; i < len(args); i++ {
		arg := args[i]
		if arg == "--" {
			break
		}
		if arg == "--"+name || arg == "--"+name+"=true" || (name == "help" && arg == "-h") {
			enabled = true
		}
		if strings.HasPrefix(arg, "--"+name+"=") {
			value, err := strconv.ParseBool(strings.TrimPrefix(arg, "--"+name+"="))
			if err == nil {
				enabled = value
			}
		}
	}
	return enabled
}
func emitError(c *core.Core, err error) error {
	if c.JSON {
		_ = json.NewEncoder(c.Out).Encode(map[string]string{"error": "monitor command failed", "detail": err.Error()})
	} else {
		fmt.Fprintln(c.Err, err)
	}
	return err
}
