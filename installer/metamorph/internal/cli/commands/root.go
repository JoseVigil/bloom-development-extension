package commands

import (
	"fmt"
	"os"

	"github.com/bloom/metamorph/internal/core"
	"github.com/spf13/cobra"
)

var (
	// Flags globales
	jsonOutput bool
	verbose    bool
)

// rootCmd es el comando raíz de la aplicación
var rootCmd = &cobra.Command{
	Use:   "metamorph",
	Short: "System State Reconciler",
	Long: `Metamorph - A declarative system state reconciler
	
Metamorph manages system binaries and configuration through declarative
manifests, providing atomic updates, rollback capabilities, and state inspection.`,
	Version: getVersionString(),
	Run: func(cmd *cobra.Command, args []string) {
		// Si no se proporciona subcomando, mostrar help
		cmd.Help()
	},
}

// Execute ejecuta el comando raíz
func Execute() error {
	return rootCmd.Execute()
}

func init() {
	// Flags globales persistentes (disponibles para todos los subcomandos)
	rootCmd.PersistentFlags().BoolVar(&jsonOutput, "json", false, "Output in JSON format")
	rootCmd.PersistentFlags().BoolVarP(&verbose, "verbose", "v", false, "Enable verbose output")

	// Personalizar la plantilla de ayuda
	rootCmd.SetHelpTemplate(getCustomHelpTemplate())
	
	// Deshabilitar la generación automática de comandos de completado
	rootCmd.CompletionOptions.DisableDefaultCmd = true
}

// getVersionString devuelve la cadena de versión formateada
func getVersionString() string {
	return fmt.Sprintf("v%s-build.%d", core.Version, core.BuildNumber)
}

// getCustomHelpTemplate devuelve una plantilla de ayuda personalizada
func getCustomHelpTemplate() string {
	return `{{with (or .Long .Short)}}{{. | trimTrailingWhitespaces}}

{{end}}{{if or .Runnable .HasSubCommands}}{{.UsageString}}{{end}}`
}

// GetJSONOutput devuelve el valor del flag --json
func GetJSONOutput() bool {
	return jsonOutput
}

// GetVerbose devuelve el valor del flag --verbose
func GetVerbose() bool {
	return verbose
}

// InitPaths inicializa las rutas del sistema con manejo de errores
func InitPaths() (*core.PathConfig, error) {
	paths, err := core.InitPaths()
	if err != nil {
		if jsonOutput {
			fmt.Fprintf(os.Stderr, `{"success": false, "error": "failed to initialize paths: %s"}`+"\n", err.Error())
		} else {
			fmt.Fprintf(os.Stderr, "Error: failed to initialize paths: %v\n", err)
		}
		return nil, err
	}
	return paths, nil
}
