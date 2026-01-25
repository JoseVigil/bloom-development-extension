package cli

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"sort"
	"strings"

	"github.com/spf13/cobra"
	"github.com/spf13/pflag"
)

// ANSI Color Codes
type Color string

const (
	Reset      Color = "\033[0m"
	Bold       Color = "\033[1m"
	Dim        Color = "\033[2m"
	
	// Modern gradient colors
	Cyan       Color = "\033[36m"
	BrightCyan Color = "\033[96m"
	Green      Color = "\033[32m"
	BrightGreen Color = "\033[92m"
	Yellow     Color = "\033[33m"
	BrightYellow Color = "\033[93m"
	Magenta    Color = "\033[35m"
	BrightMagenta Color = "\033[95m"
	Blue       Color = "\033[34m"
	BrightBlue Color = "\033[94m"
	White      Color = "\033[97m"
	Gray       Color = "\033[90m"
)

// Colorize applies color only if colors are enabled
func (c Color) Apply(text string, enabled bool) string {
	if !enabled {
		return text
	}
	return string(c) + text + string(Reset)
}

// isOutputRedirected detects if stdout is being piped/redirected
func isOutputRedirected() bool {
	fileInfo, _ := os.Stdout.Stat()
	return (fileInfo.Mode() & os.ModeCharDevice) == 0
}

// ModernHelpRenderer handles sophisticated help rendering
type ModernHelpRenderer struct {
	output      io.Writer
	useColors   bool
	width       int
	buf         strings.Builder
}

// NewModernHelpRenderer creates a renderer with auto-detection
func NewModernHelpRenderer(output io.Writer) *ModernHelpRenderer {
	return &ModernHelpRenderer{
		output:    output,
		useColors: !isOutputRedirected(),
		width:     120,
	}
}

// isRedirected checks if output is being redirected to file
func (r *ModernHelpRenderer) isRedirected() bool {
	return isOutputRedirected()
}

// RenderFullHelp generates complete modern help output
func RenderFullHelp(root *cobra.Command) {
	renderer := NewModernHelpRenderer(os.Stdout)
	renderer.render(root)
	fmt.Fprint(renderer.output, renderer.buf.String())
}

// RenderFullDiscoveryHelp is an alias for backward compatibility
func RenderFullDiscoveryHelp(root *cobra.Command) {
	RenderFullHelp(root)
}

func (r *ModernHelpRenderer) render(root *cobra.Command) {
	r.printHeader()
	r.printUsageSection()
	r.printGlobalOptions()
	r.printCategoriesOverview(root)
	r.printDetailedCommands(root)
	r.printFooter()
}

func (r *ModernHelpRenderer) printHeader() {
	title := "SENTINEL"
	subtitle := "Modular Orchestrator for Bloom"
	
	r.writeln("")
	r.writeln(r.centerText(Bold.Apply(title, r.useColors), r.width))
	r.writeln(r.centerText(Dim.Apply(subtitle, r.useColors), r.width))
	r.writeln("")
}

func (r *ModernHelpRenderer) printUsageSection() {
	r.printSectionHeader("USAGE", BrightCyan)
	
	r.writeln("  " + Bold.Apply("sentinel", r.useColors) + " [OPTIONS] <command> [args]")
	r.writeln("")
	
	r.writeln("  " + Dim.Apply("Quick examples:", r.useColors))
	r.writeln("    " + Green.Apply("sentinel health", r.useColors) + 
		Dim.Apply("                    # System integrity scan", r.useColors))
	r.writeln("    " + Green.Apply("sentinel launch profile_001", r.useColors) + 
		Dim.Apply("     # Launch browser instance", r.useColors))
	r.writeln("    " + Green.Apply("sentinel cockpit --health", r.useColors) + 
		Dim.Apply("       # Monitoring UI with health view", r.useColors))
	r.writeln("")
}

func (r *ModernHelpRenderer) printGlobalOptions() {
	r.printSectionHeader("GLOBAL OPTIONS", BrightYellow)
	
	options := []struct {
		flag string
		desc string
	}{
		{"--json", "Output in JSON format (machine-readable)"},
		{"--verbose", "Enable detailed logging for debugging"},
		{"--help", "Show this help message"},
	}
	
	for _, opt := range options {
		r.writeln(fmt.Sprintf("  %s  %s",
			Yellow.Apply(r.padRight(opt.flag, 15), r.useColors),
			Dim.Apply(opt.desc, r.useColors)))
	}
	r.writeln("")
}

func (r *ModernHelpRenderer) printCategoriesOverview(root *cobra.Command) {
	r.printSectionHeader("COMMAND CATEGORIES", BrightMagenta)
	
	categories := r.categorizeCommands(root)
	categoryOrder := []string{"SYSTEM", "IDENTITY", "RUNTIME", "BRIDGE", "DEVELOPMENT", "UI"}
	
	maxNameLen := 0
	for name := range categories {
		if len(name) > maxNameLen {
			maxNameLen = len(name)
		}
	}
	
	totalCmds := 0
	for _, catName := range categoryOrder {
		cmds, exists := categories[catName]
		if !exists {
			continue
		}
		
		count := len(cmds)
		totalCmds += count
		
		name := r.padRight(catName, maxNameLen+2)
		desc := r.getCategoryDescription(catName)
		countStr := fmt.Sprintf("%d cmd%s", count, r.plural(count))
		
		r.writeln(fmt.Sprintf("  %s  %s  %s",
			Magenta.Apply(name, r.useColors),
			Dim.Apply(r.padRight(desc, 55), r.useColors),
			BrightCyan.Apply(countStr, r.useColors)))
	}
	
	var separator string
	if r.isRedirected() {
		separator = strings.Repeat("-", maxNameLen+60)
	} else {
		separator = strings.Repeat("─", maxNameLen+60)
	}
	
	r.writeln(fmt.Sprintf("  %s  %s",
		Gray.Apply(separator, r.useColors),
		Bold.Apply(fmt.Sprintf("Total: %d commands", totalCmds), r.useColors)))
	r.writeln("")
}

func (r *ModernHelpRenderer) printDetailedCommands(root *cobra.Command) {
	categories := r.categorizeCommands(root)
	categoryOrder := []string{"SYSTEM", "IDENTITY", "RUNTIME", "BRIDGE", "DEVELOPMENT", "UI"}
	
	for _, catName := range categoryOrder {
		cmds, exists := categories[catName]
		if !exists {
			continue
		}
		
		r.printCategoryDetail(catName, cmds)
	}
}

func (r *ModernHelpRenderer) printCategoryDetail(category string, commands []*cobra.Command) {
	// Category header with modern box
	r.writeln("")
	r.writeln(r.createBox(category, BrightCyan))
	r.writeln("")
	
	sort.Slice(commands, func(i, j int) bool {
		return commands[i].Name() < commands[j].Name()
	})
	
	for _, cmd := range commands {
		r.printCommandDetail(cmd)
	}
}

func (r *ModernHelpRenderer) printCommandDetail(cmd *cobra.Command) {
	// Command name and description
	cmdName := strings.ToUpper(cmd.Name())
	
	var bullet string
	if r.isRedirected() {
		bullet = "> "
	} else {
		bullet = "▸ "
	}
	
	r.writeln("  " + Bold.Apply(BrightGreen.Apply(bullet, r.useColors)+cmdName, r.useColors))
	r.writeln("    " + Dim.Apply(cmd.Short, r.useColors))
	r.writeln("")
	
	// Usage line
	usage := fmt.Sprintf("sentinel %s", cmd.Use)
	r.writeln("    " + Dim.Apply("Usage:", r.useColors) + " " + Green.Apply(usage, r.useColors))
	r.writeln("")
	
	// Args
	if args := r.extractArgs(cmd); len(args) > 0 {
		r.writeln("    " + Bold.Apply("Arguments:", r.useColors))
		for _, arg := range args {
			reqLabel := Dim.Apply("optional", r.useColors)
			if arg.Required {
				reqLabel = Yellow.Apply("required", r.useColors)
			}
			r.writeln(fmt.Sprintf("      %s  %s",
				Cyan.Apply(r.padRight(arg.Name, 20), r.useColors),
				reqLabel))
		}
		r.writeln("")
	}
	
	// Flags
	hasFlags := false
	cmd.LocalFlags().VisitAll(func(f *pflag.Flag) {
		if !hasFlags {
			r.writeln("    " + Bold.Apply("Flags:", r.useColors))
			hasFlags = true
		}
		
		flagStr := "--" + f.Name
		if f.Shorthand != "" {
			flagStr += ", -" + f.Shorthand
		}
		
		defaultInfo := ""
		if f.DefValue != "" && f.DefValue != "false" {
			defaultInfo = Dim.Apply(fmt.Sprintf(" [default: %s]", f.DefValue), r.useColors)
		}
		
		r.writeln(fmt.Sprintf("      %s  %s%s",
			BrightYellow.Apply(r.padRight(flagStr, 25), r.useColors),
			f.Usage,
			defaultInfo))
	})
	if hasFlags {
		r.writeln("")
	}
	
	// Subcommands
	if cmd.HasSubCommands() {
		r.writeln("    " + Bold.Apply("Subcommands:", r.useColors))
		for _, child := range cmd.Commands() {
			r.writeln(fmt.Sprintf("      %s  %s",
				Magenta.Apply(r.padRight(child.Name(), 20), r.useColors),
				Dim.Apply(child.Short, r.useColors)))
		}
		r.writeln("")
	}
	
	// Example
	if cmd.Example != "" {
		r.writeln("    " + Bold.Apply("Example:", r.useColors))
		for _, line := range strings.Split(cmd.Example, "\n") {
			if strings.TrimSpace(line) != "" {
				r.writeln("      " + Green.Apply(line, r.useColors))
			}
		}
		r.writeln("")
	}
	
	// Requirements
	if req, ok := cmd.Annotations["requires"]; ok {
		r.writeln("    " + Bold.Apply("Requirements:", r.useColors))
		
		var reqBullet string
		if r.isRedirected() {
			reqBullet = "* "
		} else {
			reqBullet = "• "
		}
		
		for _, line := range strings.Split(req, "\n") {
			line = strings.TrimSpace(line)
			if line != "" && line != "-" {
				line = strings.TrimPrefix(line, "- ")
				r.writeln("      " + Dim.Apply(reqBullet, r.useColors) + line)
			}
		}
		r.writeln("")
	}
	
	var separator string
	if r.isRedirected() {
		separator = strings.Repeat("-", 80)
	} else {
		separator = strings.Repeat("─", 80)
	}
	
	r.writeln(Gray.Apply("    "+separator, r.useColors))
	r.writeln("")
}

func (r *ModernHelpRenderer) printFooter() {
	r.writeln("")
	
	var emoji string
	if r.isRedirected() {
		emoji = "[!]"
	} else {
		emoji = "💡"
	}
	
	r.writeln(r.centerText(
		Dim.Apply(emoji+" All commands support active telemetry streaming", r.useColors),
		r.width))
	r.writeln(r.centerText(
		Dim.Apply("Use 'sentinel <command> --help' for detailed command information", r.useColors),
		r.width))
	r.writeln("")
}

func (r *ModernHelpRenderer) printSectionHeader(title string, color Color) {
	var line string
	if r.isRedirected() {
		line = strings.Repeat("-", r.width)
	} else {
		line = strings.Repeat("─", r.width)
	}
	
	r.writeln("")
	r.writeln(Gray.Apply(line, r.useColors))
	r.writeln(color.Apply(Bold.Apply("  "+title, r.useColors), r.useColors))
	r.writeln(Gray.Apply(line, r.useColors))
	r.writeln("")
}

func (r *ModernHelpRenderer) createBox(title string, color Color) string {
	titleLen := len(title) + 4
	padding := (r.width - titleLen) / 2
	
	var top string
	if r.isRedirected() {
		// ASCII fallback para archivos
		top = strings.Repeat("=", padding) + "[ " + title + " ]" + strings.Repeat("=", r.width-padding-titleLen)
	} else {
		// Unicode para terminal
		top = strings.Repeat("━", padding) + "┫ " + title + " ┣" + strings.Repeat("━", r.width-padding-titleLen)
	}
	
	if r.useColors {
		return color.Apply(top, true)
	}
	return top
}

// Helper: categorize commands
func (r *ModernHelpRenderer) categorizeCommands(root *cobra.Command) map[string][]*cobra.Command {
	categories := make(map[string][]*cobra.Command)
	
	for _, cmd := range root.Commands() {
		if cmd.Name() == "help" || cmd.Name() == "completion" {
			continue
		}
		
		category := cmd.Annotations["category"]
		if category == "" {
			category = "OTHER"
		}
		
		categories[category] = append(categories[category], cmd)
	}
	
	return categories
}

func (r *ModernHelpRenderer) getCategoryDescription(category string) string {
	descriptions := map[string]string{
		"SYSTEM":      "Health checks and system diagnostics",
		"IDENTITY":    "Profile identity and seed management",
		"RUNTIME":     "Browser instance lifecycle control",
		"BRIDGE":      "JSON-RPC communication with Electron",
		"DEVELOPMENT": "Integrated development environment",
		"UI":          "Monitoring and telemetry interfaces",
	}
	
	if desc, ok := descriptions[category]; ok {
		return desc
	}
	return "Command category"
}

type ArgInfo struct {
	Name     string
	Required bool
}

func (r *ModernHelpRenderer) extractArgs(cmd *cobra.Command) []ArgInfo {
	var args []ArgInfo
	
	if cmd.Use == cmd.Name() {
		return args
	}
	
	argsStr := strings.TrimPrefix(cmd.Use, cmd.Name()+" ")
	if argsStr == "" {
		return args
	}
	
	fields := strings.Fields(argsStr)
	for _, field := range fields {
		required := true
		name := field
		
		if strings.HasPrefix(field, "[") && strings.HasSuffix(field, "]") {
			required = false
			name = strings.Trim(field, "[]")
		}
		
		args = append(args, ArgInfo{
			Name:     name,
			Required: required,
		})
	}
	
	return args
}

// Utilities
func (r *ModernHelpRenderer) writeln(text string) {
	r.buf.WriteString(text + "\n")
}

func (r *ModernHelpRenderer) padRight(text string, width int) string {
	if len(text) >= width {
		return text
	}
	return text + strings.Repeat(" ", width-len(text))
}

func (r *ModernHelpRenderer) centerText(text string, width int) string {
	// Strip ANSI codes for length calculation
	plainText := r.stripANSI(text)
	if len(plainText) >= width {
		return text
	}
	
	padding := (width - len(plainText)) / 2
	return strings.Repeat(" ", padding) + text
}

func (r *ModernHelpRenderer) stripANSI(text string) string {
	// Simple ANSI stripper for length calculation
	result := text
	for {
		start := strings.Index(result, "\033[")
		if start == -1 {
			break
		}
		end := strings.Index(result[start:], "m")
		if end == -1 {
			break
		}
		result = result[:start] + result[start+end+1:]
	}
	return result
}

func (r *ModernHelpRenderer) plural(count int) string {
	if count == 1 {
		return ""
	}
	return "s"
}

// RenderHelpJSON exports complete metadata as JSON
func RenderHelpJSON(root *cobra.Command) {
	var fullMap []CommandJSON
	
	for _, sub := range root.Commands() {
		if sub.Name() == "help" || sub.Name() == "completion" {
			continue
		}
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
		Example:  cmd.Example,
	}
	
	// Extract args
	if cmd.Use != cmd.Name() {
		argsStr := strings.TrimPrefix(cmd.Use, cmd.Name()+" ")
		if argsStr != "" {
			args := strings.Fields(argsStr)
			for _, arg := range args {
				required := true
				if strings.HasPrefix(arg, "[") && strings.HasSuffix(arg, "]") {
					arg = strings.Trim(arg, "[]")
					required = false
				}
				item.Args = append(item.Args, ArgJSON{
					Name:     arg,
					Required: required,
				})
			}
		}
	}
	
	// Extract flags
	cmd.LocalFlags().VisitAll(func(f *pflag.Flag) {
		item.Options = append(item.Options, FlagJSON{
			Name:      f.Name,
			Shorthand: f.Shorthand,
			Usage:     f.Usage,
			Default:   f.DefValue,
		})
	})
	
	// Extract requirements
	if req, ok := cmd.Annotations["requires"]; ok {
		item.Requires = req
	}
	
	// Extract subcommands
	for _, child := range cmd.Commands() {
		item.SubCommands = append(item.SubCommands, parseCommand(child))
	}
	
	return item
}

// JSON structures
type CommandJSON struct {
	Name        string        `json:"name"`
	Use         string        `json:"use"`
	Short       string        `json:"short"`
	Category    string        `json:"category,omitempty"`
	Args        []ArgJSON     `json:"args,omitempty"`
	Options     []FlagJSON    `json:"options,omitempty"`
	SubCommands []CommandJSON `json:"subcommands,omitempty"`
	Example     string        `json:"example,omitempty"`
	Requires    string        `json:"requires,omitempty"`
}

type ArgJSON struct {
	Name     string `json:"name"`
	Required bool   `json:"required"`
}

type FlagJSON struct {
	Name      string `json:"name"`
	Shorthand string `json:"shorthand,omitempty"`
	Usage     string `json:"usage"`
	Default   string `json:"default,omitempty"`
}