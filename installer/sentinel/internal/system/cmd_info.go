package system

import (
	"encoding/json"
	"fmt"
	"sort"
	
	"sentinel/internal/core"
	"github.com/spf13/cobra"
)

func init() {
	core.RegisterCommand("SYSTEM", func(c *core.Core) *cobra.Command {
		cmd := &cobra.Command{
			Use:   "info",
			Short: "Display detailed system and runtime information",
			Long: `Shows comprehensive technical metadata about the Sentinel executable.

This includes application details, build information, compilation timestamps,
current system time, platform architecture, OS, and Go runtime version.

All fields are auto-detected at runtime or build-time for maximum portability.

Example output:
  app_name: sentinel
  app_release: 2.1.0
  build_counter: 42
  compile_date: 2026-01-29
  compile_time: 14:35:22
  current_time: 2026-01-29 14:40:15
  platform_arch: amd64
  platform_os: windows
  runtime_engine: Go
  runtime_release: go1.22.0`,
			
			Args: cobra.NoArgs,
			
			Run: func(cmd *cobra.Command, args []string) {
				c.Logger.Info("Executing %s command", cmd.Name())
				
				jsonOutput, _ := cmd.Flags().GetBool("json")
				
				info := core.GetSystemInfo()
				
				if jsonOutput {
					output, _ := json.MarshalIndent(info, "", "  ")
					fmt.Println(string(output))
				} else {
					// Imprimir en formato clave:valor ordenado alfabéticamente
					printSystemInfoText(info)
				}
			},
		}
		
		return cmd
	})
}

// printSystemInfoText imprime la información del sistema en formato texto
// con los campos ordenados alfabéticamente
func printSystemInfoText(info core.SystemInfo) {
	// Crear slice de pares clave-valor para ordenar
	fields := []struct {
		key   string
		value string
	}{
		{"app_name", info.AppName},
		{"app_release", info.AppRelease},
		{"build_counter", intToString(info.BuildCounter)},
		{"compile_date", info.CompileDate},
		{"compile_time", info.CompileTime},
		{"current_time", info.CurrentTime},
		{"platform_arch", info.PlatformArch},
		{"platform_os", info.PlatformOS},
		{"runtime_engine", info.RuntimeEngine},
		{"runtime_release", info.RuntimeRelease},
	}
	
	// Ordenar alfabéticamente por clave
	sort.Slice(fields, func(i, j int) bool {
		return fields[i].key < fields[j].key
	})
	
	// Imprimir cada campo
	for _, field := range fields {
		fmt.Printf("%s: %s\n", field.key, field.value)
	}
}

// intToString convierte int a string (helper local)
func intToString(n int) string {
	if n == 0 {
		return "0"
	}
	
	negative := n < 0
	if negative {
		n = -n
	}
	
	var digits []byte
	for n > 0 {
		digits = append([]byte{byte('0' + n%10)}, digits...)
		n /= 10
	}
	
	if negative {
		digits = append([]byte{'-'}, digits...)
	}
	
	return string(digits)
}