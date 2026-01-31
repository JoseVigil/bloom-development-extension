# 🏛️ Guía Maestra de Implementación: Comandos NUCLEUS

Esta guía hereda el estándar de Sentinel pero se especializa en funciones de **Gobernanza, Roles y Bóveda**.

### 1. Categorías de Nucleus
Para mantener el help organizado, usa exclusivamente estas categorías:
*   **`SYSTEM`**: Información base, versión y diagnóstico de salud organizacional.
*   **`GOVERNANCE`**: Inicialización de la organización y reglas de soberanía.
*   **`TEAM`**: Gestión de colaboradores (`add`, `remove`, `list`) y asignación de roles.
*   **`VAULT`**: Operaciones sobre la Bóveda Maestra (estado, solicitudes de llaves, firmas).
*   **`SYNC`**: Sincronización del estado organizacional con el repositorio Git.

---

### 2. Plantilla de Comando Soberano
Copia este bloque. Nota que en Nucleus, casi siempre verificamos el **Rol** antes de ejecutar.

```go
package comandos_nucleus

import (
	"nucleus/internal/core"
	"nucleus/internal/governance" // Especializado en roles
	"github.com/spf13/cobra"
)

func init() {
	core.RegisterCommand("CATEGORIA", func(c *core.Core) *cobra.Command {
		
		var force bool

		cmd := &cobra.Command{
			Use:   "nombre [arg]",
			Short: "Descripción corta",
			Long:  "Descripción detallada de la regla de gobernanza",
			Args:  cobra.MinimumNArgs(1), 

			Run: func(cmd *cobra.Command, args []string) {
				// 1. VERIFICACIÓN DE AUTORIDAD (Regla de Oro de Nucleus)
				if err := governance.RequireMaster(c); err != nil {
					c.Logger.Error("Acceso Denegado: Este comando requiere rol Master")
					return
				}
				
				arg := args[0]
				
				// 2. EJECUCIÓN LÓGICA
				err := EjecutarAccionGobernanza(c, arg, force)
				if err != nil {
					c.Logger.Error("Fallo de Gobernanza: %v", err)
				}
			},
		}

		cmd.Flags().BoolVarP(&force, "force", "f", false, "Forzar operación")

		return cmd
	})
}

// 3. LÓGICA ATÓMICA
func EjecutarAccionGobernanza(c *core.Core, data string, f bool) error {
    // IMPORTANTE: Si modificas el blueprint.json, usa escritura atómica
    return nil
}
```

---

### 3. Diferencias Clave con Sentinel (Lo que cambia)

| Característica | Sentinel | Nucleus |
| :--- | :--- | :--- |
| **Foco** | Ejecución de procesos (`taskkill`, `spawn`) | Gestión de estado (`JSON`, `signatures`) |
| **Seguridad** | Permisos de SO (Admin/User) | Roles Bloom (`Master`, `Architect`, `Specialist`) |
| **Persistencia** | `profiles.json` (Operativo) | `blueprint.json` (Constitucional) |
| **Output** | Eventos en tiempo real (Bus) | Snapshots de estado y ACKs de autoridad |

---

### 4. Checklist para el Desarrollador de Nucleus

1.  **¿Es Atómico?**: Nucleus es la "Fuente de Verdad". Si un comando falla a la mitad de escribir el `blueprint.json`, el archivo debe quedar intacto. **Siempre usa archivos temporales para escribir.**
2.  **¿Verifica el Rol?**: Antes de tocar el equipo o el vault, ¿llamaste a `governance.RequireMaster()`?
3.  **¿Es compatible con Electron?**: Asegúrate de que el comando devuelva un JSON estructurado por `os.Stdout` si se usa el flag `--json`.
4.  **¿Está en el main?**: Si creaste una carpeta nueva en `internal/commands/`, no olvides el import ciego en `cmd/nucleus/main.go`.
