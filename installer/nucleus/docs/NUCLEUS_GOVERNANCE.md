# Implementación de Gobernanza en Nucleus

## Arquitectura de Roles

### Jerarquía de Autoridad

```
                    MASTER (Owner)
                         |
          ┌──────────────┴──────────────┐
          |                             |
    SPECIALIST 1                  SPECIALIST 2
```

### Definición de Roles

#### Master (Owner)
- **Autoridad**: Control total del sistema
- **Permisos**:
  - Acceso a la Bóveda Maestra de llaves
  - Gestión de miembros del equipo
  - Modificación de configuración organizacional
  - Firma de actualizaciones de estado
  - Acceso a analytics centrales

#### Specialist (Team Member)
- **Autoridad**: Ejecución operacional
- **Permisos**:
  - Ejecutar proyectos
  - Coordinar intents
  - Reportar telemetría
- **Restricciones**:
  - NO puede extraer llaves maestras
  - NO puede modificar roles
  - NO puede cambiar gobernanza

## Sistema de Detección de Roles

### Archivos Marcadores

Ubicación: `~/.bloom/.nucleus/`

- `.master` - Indica que el usuario es Master
- `.specialist` - Indica que el usuario es Specialist

### Flujo de Detección

```go
func detectUserRole() Role {
    homeDir, _ := os.UserHomeDir()
    
    // Verificar Master
    if exists(homeDir + "/.bloom/.nucleus/.master") {
        return RoleMaster
    }
    
    // Verificar Specialist
    if exists(homeDir + "/.bloom/.nucleus/.specialist") {
        return RoleSpecialist
    }
    
    // Por defecto: primer usuario es Master
    return RoleMaster
}
```

## Registro de Propiedad

### Estructura del ownership.json

```json
{
  "org_id": "org_1234567890",
  "owner_id": "github:username",
  "owner_name": "John Doe",
  "created_at": "2025-01-29T10:00:00Z",
  "signed_hash": "sha256:abc123...",
  "team_members": [
    {
      "id": "github:specialist1",
      "name": "Jane Smith",
      "role": "specialist",
      "added_at": "2025-01-29T11:00:00Z",
      "active": true
    },
    {
      "id": "github:specialist2",
      "name": "Bob Johnson",
      "role": "specialist",
      "added_at": "2025-01-29T12:00:00Z",
      "active": true
    }
  ]
}
```

### Operaciones de Gobernanza

#### Crear Registro Inicial
```go
record, err := governance.CreateInitialOwnership(
    "github:master",
    "Master Name"
)
```

#### Agregar Specialist
```go
err := governance.AddTeamMember(
    record,
    "github:specialist1",
    "Specialist Name",
    "specialist"
)
```

#### Cargar Registro
```go
record, err := governance.LoadOwnership()
```

## Integración con Comandos

### Comando info con Roles

```bash
# Output texto
$ nucleus info
app_name: nucleus
app_release: 1.0.0
build_counter: 1
...
user_role: master

# Output JSON
$ nucleus --json info
{
  "app_name": "nucleus",
  "user_role": "master",
  ...
}
```

## Casos de Uso

### Caso 1: Inicialización Master

```bash
# Master ejecuta por primera vez
nucleus init --master --github-id master_username

# Nucleus crea:
# - ~/.bloom/.nucleus/.master
# - ~/.bloom/.nucleus/ownership.json
```

### Caso 2: Agregar Specialist

```bash
# Master agrega un specialist
nucleus team add --github-id specialist1 --name "Jane Smith"

# Nucleus actualiza:
# - ownership.json (agrega member)
# - Envía invitación al specialist
```

### Caso 3: Specialist se Une

```bash
# Specialist ejecuta en su máquina
nucleus join --invite-token ABC123

# Nucleus crea:
# - ~/.bloom/.nucleus/.specialist
# - Sincroniza con servidor central
```

## Validación de Autoridad

### En Operaciones Críticas

```go
func (c *Core) RequireMasterRole() error {
    role := core.GetUserRole()
    if role != core.RoleMaster {
        return fmt.Errorf("operation requires master role")
    }
    return nil
}
```

### Ejemplo de Uso

```go
// En comando que requiere Master
Run: func(cmd *cobra.Command, args []string) {
    if err := c.RequireMasterRole(); err != nil {
        fmt.Println("❌ Unauthorized:", err)
        return
    }
    
    // Operación crítica...
}
```

## Próximos Pasos

### Comandos a Implementar

1. `nucleus init` - Inicializar organización
2. `nucleus team add` - Agregar specialist
3. `nucleus team list` - Listar miembros
4. `nucleus team remove` - Remover specialist
5. `nucleus vault status` - Estado de la bóveda
6. `nucleus vault request-key` - Solicitar llave (solo Master)

### Integración con Vault

El sistema de roles se integrará con el Vault Management:

```go
// Sentinel solicita llave
func RequestKey(keyID string) ([]byte, error) {
    // Nucleus verifica rol
    if GetUserRole() != RoleMaster {
        return nil, errors.New("vault access denied")
    }
    
    // Extraer de Chrome Master Profile
    return extractFromVault(keyID)
}
```

## Seguridad

### Principios

1. **Least Privilege**: Specialists solo tienen permisos necesarios
2. **Single Owner**: Solo un Master por organización
3. **Immutable Audit**: Todos los cambios se registran
4. **Cryptographic Signing**: Actualizaciones firmadas por Master

### Archivo de Firma

```json
{
  "state_hash": "sha256:...",
  "signed_by": "github:master",
  "signed_at": "2025-01-29T15:00:00Z",
  "signature": "RSA:..."
}
```
