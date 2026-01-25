package cli

import (
	"fmt"
	"strings"

	"github.com/spf13/cobra"
	"github.com/spf13/pflag" // <--- Agregamos este import
)

func RenderFullDiscoveryHelp(root *cobra.Command) {
	fmt.Printf("\n Sentinel Base - Modular Orchestrator for Bloom\n")

	DrawBox("Uso / Usage", []string{
		"  sentinel [OPTIONS] <command> [args]",
		"",
		"Ejemplos:",
		"  sentinel health",
		"  sentinel launch profile_001 --mode --discovery",
	})

	categories := []string{"SYSTEM", "IDENTITY", "RUNTIME", "BRIDGE", "DEVELOPMENT", "UI"}

	for _, cat := range categories {
		var content []string
		for _, sub := range root.Commands() {
			if sub.Annotations["category"] == cat {
				content = append(content, fmt.Sprintf("  %s", strings.ToUpper(sub.Name())))
				content = append(content, fmt.Sprintf("    %s", sub.Short))
				content = append(content, fmt.Sprintf("    Comando: sentinel %s", sub.Use))

				hasFlags := false
				// CAMBIO CLAVE: El tipo correcto es *pflag.Flag
				sub.LocalFlags().VisitAll(func(f *pflag.Flag) {
					if !hasFlags {
						content = append(content, "    Opciones:")
						hasFlags = true
					}
					short := ""
					if f.Shorthand != "" {
						short = fmt.Sprintf("-%s, ", f.Shorthand)
					}
					line := fmt.Sprintf("      %s--%-12s %s (default: %s)", short, f.Name, f.Usage, f.DefValue)
					content = append(content, line)
				})
				content = append(content, "")
			}
		}

		if len(content) > 0 {
			DrawBox(cat, content)
		}
	}

	fmt.Println(" [!] Todos los comandos están optimizados para telemetría activa.")
	fmt.Println()
}

func DrawBox(title string, lines []string) {
	width := 90
	fmt.Printf("╭─ %s %s╮\n", title, strings.Repeat("─", width-len(title)-4))
	for _, l := range lines {
		if len(l) > width-4 {
			l = l[:width-7] + "..."
		}
		fmt.Printf("│ %-87s │\n", l)
	}
	fmt.Printf("╰%s╯\n", strings.Repeat("─", width-2))
}