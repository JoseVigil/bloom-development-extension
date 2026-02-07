Aquí tienes la **Guía Maestra de Implementación de Comandos** para Sentinel. Síguela para que cada nueva funcionalidad sea robusta, auto-documentada y fácil de mantener.

---

### 1. Regla de Oro: Ubicación y Archivo
*   **Nueva funcionalidad:** Si vas a crear algo que no existe (ej. gestión de red), crea una carpeta `internal/network/` y un archivo `network.go`.
*   **Funcionalidad existente:** Si vas a añadir un comando a algo que ya existe (ej. un nuevo test de salud), hazlo **dentro** de `internal/health/health.go`. No crees archivos `.go` nuevos si la categoría es la misma.

---

### 2. Plantilla Estándar de un Comando
Copia y pega este bloque en el archivo de la funcionalidad. Esta estructura garantiza que el comando aparezca en el `--help` con sus flags.

```go
package nombrepaquete

import (
	"sentinel/internal/core"
	"github.com/spf13/cobra"
    // "fmt", "os", etc...
)

func init() {
	// CATEGORIAS: "SYSTEM", "IDENTITY", "RUNTIME", "BRIDGE", "DEVELOPMENT", "UI"
	core.RegisterCommand("CATEGORIA", func(c *core.Core) *cobra.Command {
		
		// A. VARIABLES PARA FLAGS (Opciones)
		var puerto int
		var format string

		// B. DEFINICIÓN DEL COMANDO
		cmd := &cobra.Command{
			Use:   "nombre [argumento]", // Cómo se usa: sentinel nombre valor
			Short: "Descripción corta (para el help general)",
			Long:  "Descripción larga y detallada (para sentinel nombre --help)",
			
			// C. VALIDACIÓN DE ARGUMENTOS
			// cobra.NoArgs            -> No permite argumentos
			// cobra.ExactArgs(1)      -> Obliga a recibir exactamente 1
			// cobra.MinimumNArgs(1)   -> Al menos 1
			Args:  cobra.MinimumNArgs(1), 

			// D. LÓGICA DE EJECUCIÓN
			Run: func(cmd *cobra.Command, args []string) {
				argPrincipal := args[0]
				
				c.Logger.Info("Iniciando comando con puerto %d", puerto)
				
				// LLAMADA A LA LÓGICA (Definida abajo)
				err := TuFuncionLogica(c, argPrincipal, puerto, format)
				if err != nil {
					c.Logger.Error("Fallo: %v", err)
				}
			},
		}

		// E. DEFINICIÓN DE FLAGS (Opciones del comando)
		// Flags().TipoVarP(&variable, "nombre-largo", "letra-corta", default, "descripción")
		cmd.Flags().IntVarP(&puerto, "port", "p", 8080, "Puerto de conexión")
		cmd.Flags().StringVar(&format, "format", "json", "Formato de salida (json|text)")

		return cmd
	})
}

// 3. LA LÓGICA DE NEGOCIO (Separada para ser testeable)
func TuFuncionLogica(c *core.Core, data string, p int, f string) error {
    // Aquí va tu código real de Go...
    return nil
}
```

---

### 3. Checklist de Implementación (3 Pasos)

#### Paso 1: Definir el Contrato
Decidir el nombre (`Use`), qué categoría le toca (para que `cli/help_renderer.go` lo agrupe) y qué parámetros necesita.

#### Paso 2: Configurar los Flags
Si tu comando necesita opciones (ej: `--force`, `--timeout`, `--user`), definirlos en el `init()`. Cobra se encargará de:
1.  Parsear los valores automáticamente.
2.  Validar si son del tipo correcto (int, string, bool).
3.  Mostrarlos en el `sentinel --help`.

#### Paso 3: Activación en `main.go`
Si has creado un **paquete nuevo** (una carpeta nueva en `internal`), debes añadir una línea al bloque de `import` de `main.go` con un guion bajo:

```go
import (
    // ...
    _ "sentinel/internal/nuevo-paquete"
)
```
*Si solo añadiste un comando a un archivo existente, no tienes que tocar nada en `main.go`.*

---

### 4. Consejos Pro para Sentinel

1.  **Usa el Core**: Siempre tienes acceso a `c.Logger`, `c.Config` y `c.Paths`. No redeclares rutas ni abras logs nuevos.
2.  **Salida JSON**: Si el comando va a ser usado por Electron, intenta que el resultado final sea un `json.Marshal` a `os.Stdout`.
3.  **Errores**: No uses `panic`. Devuelve errores y deja que el `c.Logger.Error` en el `Run` se encargue de informar al usuario.
4.  **Categorías Estrictas**: Mantén las categorías en mayúsculas (`SYSTEM`, `IDENTITY`, etc.) para que el renderizador de cajas no cree secciones vacías o desordenadas.

Con esta guía, Sentinel se vuelve una plataforma donde añadir una herramienta es simplemente copiar una plantilla y rellenar la lógica. El sistema se encarga de todo lo demás (ayuda, flags, organización).