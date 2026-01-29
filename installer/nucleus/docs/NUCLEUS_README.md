# Nucleus - Core CLI for Bloom Ecosystem

Componente de gobernanza para el ecosistema Bloom. Gestiona roles, identidad y autoridad organizacional.

## Estructura del Proyecto

```
nucleus/
├── cmd/nucleus/main.go              # Punto de entrada
├── internal/
│   ├── cli/                         # Sistema de ayuda parametrizado
│   │   ├── config.go               # Configuración visual
│   │   └── help_renderer.go       # Renderer portado de Sentinel
│   ├── core/                        # Core system
│   │   ├── core.go                 # Estructura central
│   │   ├── registry.go             # Registro de comandos
│   │   ├── version.go              # Gestión de versión
│   │   ├── metadata.go             # Metadatos + roles
│   │   └── build_info.go           # AUTO-GENERADO en build
│   ├── governance/                  # Lógica de gobernanza
│   │   └── roles.go                # Gestión de roles y propiedad
│   └── commands/
│       └── system/                  # Comandos del sistema
│           ├── version.go          # Comando version
│           └── info.go             # Comando info
├── scripts/build.bat                # Build automation
├── VERSION                          # 1.0.0
├── build_number.txt                 # Auto-incremental
└── go.mod
```

## Instalación y Build

### 1. Instalar dependencias
```bash
go mod download
```

### 2. Compilar (Windows)
```cmd
scripts\build.bat
```

El build automáticamente:
- Incrementa el build number
- Genera `internal/core/build_info.go`
- Compila el binario en `bin/nucleus.exe`
- Genera archivos de ayuda en `help/`

## Comandos Disponibles

### System Commands

```bash
# Mostrar versión
nucleus version

# Mostrar versión en JSON
nucleus --json version

# Mostrar información del sistema
nucleus info

# Mostrar información en JSON
nucleus --json info

# Mostrar ayuda
nucleus --help

# Mostrar ayuda en JSON
nucleus --json-help
```

## Sistema de Roles

Nucleus implementa dos niveles de autoridad:

- **Master (Owner)**: Control total, acceso a la bóveda maestra
- **Specialist**: Miembros del equipo, ejecución limitada

El rol se detecta automáticamente basado en archivos marcadores en `~/.bloom/.nucleus/`.

## Arquitectura Técnica

### Core System
- **Core**: Estructura central con Logger, Config y Paths
- **Registry**: Sistema de auto-registro de comandos
- **Metadata**: Recolección de información del sistema y roles

### CLI System
- **HelpConfig**: Configuración inyectable para branding
- **ModernHelpRenderer**: Sistema de ayuda con soporte de colores
- Portado de Sentinel pero parametrizado para Nucleus

### Governance Layer
- **Roles**: Gestión de autoridad (Master/Specialist)
- **Ownership**: Sistema de registro de propiedad organizacional

## Diferencias con Sentinel

| Aspecto | Sentinel | Nucleus |
|---------|----------|---------|
| Propósito | Orquestador | Gobernanza |
| Branding | "Modular Orchestrator" | "Core CLI" |
| Categorías | 6 específicas | 3 extensibles |
| Comandos iniciales | 8+ | 2 (version, info) |
| Lógica de roles | No | Sí (Master/Specialist) |

## Desarrollo

### Agregar un nuevo comando

1. Crear archivo en `internal/commands/{categoria}/`
2. Implementar usando el patrón:

```go
package categoria

import (
    "nucleus/internal/core"
    "github.com/spf13/cobra"
)

func init() {
    core.RegisterCommand("CATEGORIA", func(c *core.Core) *cobra.Command {
        return &cobra.Command{
            Use:   "comando",
            Short: "Descripción",
            Run: func(cmd *cobra.Command, args []string) {
                // Lógica del comando
            },
        }
    })
}
```

3. Importar en `cmd/nucleus/main.go`:
```go
_ "nucleus/internal/commands/categoria"
```

4. Recompilar con `scripts\build.bat`

## Flags Globales

- `--json`: Output en formato JSON
- `--verbose`: Logging detallado
- `--help`: Mostrar ayuda

## Notas de Implementación

- El sistema de help es parametrizable vía `cli.HelpConfig`
- Build number se auto-incrementa en cada compilación
- Los comandos se auto-registran usando `init()`
- El sistema detecta automáticamente redirección de output para ajustar formato
