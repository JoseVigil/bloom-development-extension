# Brain CLI - Sistema de Versionado Semántico

## Descripción

Brain CLI incluye un sistema de versionado automático con changelog semántico integrado. El sistema permite incrementar versiones y documentar cambios de forma estructurada usando tres categorías: **added**, **changed** y **details**.

## Comando Principal

```bash
brain system version [FLAGS]
```

## Flags Disponibles

| Flag | Descripción | Uso Múltiple |
|------|-------------|--------------|
| `--added` | Nueva funcionalidad o capacidad agregada | ✅ Sí |
| `--changed` | Funcionalidad o comportamiento modificado | ✅ Sí |
| `--details` | Detalle de implementación o nota técnica | ✅ Sí |

## Comportamiento

- **Sin flags**: Muestra la versión actual
- **Con al menos un flag**: Incrementa automáticamente la versión patch (ej: `0.1.1` → `0.1.2`)
- **Múltiples flags**: Se puede usar cada flag varias veces; todos se registran pero solo se incrementa una vez la versión
- **Validación**: Al menos un flag de changelog es requerido para incrementar

## Ejemplos de Uso

### Ver versión actual
```bash
brain system version
# Output: Brain CLI v0.1.1
```

### Incrementar con una característica agregada
```bash
brain system version --added "AI-native JSON Schema output"
```

### Incrementar con múltiples cambios
```bash
brain system version \
  --added "New authentication system" \
  --added "User profile management" \
  --changed "Refactored database layer" \
  --details "Migrated from SQLite to PostgreSQL"
```

### Documentar múltiples features del mismo tipo
```bash
brain system version \
  --added "Feature A" \
  --added "Feature B" \
  --added "Feature C"
```

### Combinación completa
```bash
brain system version \
  --added "OpenAI Function Calling support" \
  --changed "help_renderer.py: Added JSON Schema builder" \
  --changed "__main__.py: Added --ai flag" \
  --details "JSON Schema v7 compliance" \
  --details "Backward compatible with legacy format"
```

## Salida del Comando

Al incrementar la versión, el sistema muestra:

```
======================================================================
🎯 Version Increment: 0.1.2
======================================================================

✨ ADDED:
   • OpenAI Function Calling support

🔄 CHANGED:
   • help_renderer.py: Added JSON Schema builder
   • __main__.py: Added --ai flag

📋 DETAILS:
   • JSON Schema v7 compliance
   • Backward compatible with legacy format

----------------------------------------------------------------------

✅ Versión actualizada: 0.1.2
📝 Changelog guardado en pyproject.toml y versions.json

======================================================================
```

## Almacenamiento

### pyproject.toml
El changelog se guarda en `[tool.brain.changelog]`:

```toml
[project]
version = "0.1.2"

[tool.brain.changelog]
added = [
    "OpenAI Function Calling support"
]
changed = [
    "help_renderer.py: Added JSON Schema builder",
    "__main__.py: Added --ai flag"
]
details = [
    "JSON Schema v7 compliance",
    "Backward compatible with legacy format"
]
```

### versions.json
El historial completo se mantiene en `versions.json`:

```json
{
  "project": "brain-cli",
  "history": [
    {
      "version": "0.1.2",
      "timestamp": "2026-01-11T15:30:45.123456",
      "changelog": {
        "added": ["OpenAI Function Calling support"],
        "changed": [
          "help_renderer.py: Added JSON Schema builder",
          "__main__.py: Added --ai flag"
        ],
        "details": [
          "JSON Schema v7 compliance",
          "Backward compatible with legacy format"
        ]
      }
    }
  ]
}
```

## Modo Frozen (Ejecutable Compilado)

En modo frozen (brain.exe), el comando crea un archivo `version_request.json` que debe ser procesado por el launcher:

```bash
brain system version --added "New feature"

# Output:
✅ Solicitud de incremento guardada
📦 Nueva versión solicitada: 0.1.2
💡 Archivo creado: version_request.json
   El launcher procesará esta solicitud y recompilará Brain.
```

## Buenas Prácticas

### Para `--added`
- Nuevas funcionalidades visibles al usuario
- Nuevas capacidades del sistema
- Nuevas APIs o comandos

Ejemplo:
```bash
--added "User authentication system"
--added "Export to PDF functionality"
```

### Para `--changed`
- Modificaciones a funcionalidades existentes
- Refactorizaciones importantes
- Cambios en comportamiento
- Formato: `archivo.py: Descripción del cambio`

Ejemplo:
```bash
--changed "auth.py: Migrated to OAuth2.0"
--changed "database.py: Optimized query performance"
```

### Para `--details`
- Detalles técnicos de implementación
- Decisiones de arquitectura
- Compatibilidad y compliance
- Notas para desarrolladores

Ejemplo:
```bash
--details "Uses bcrypt for password hashing"
--details "Implements JWT with 1-hour expiration"
```

## Integración con CI/CD

```bash
# En un script de deployment
VERSION=$(brain system version --json | jq -r '.data.version')
echo "Deploying version $VERSION"

# Incrementar versión post-deployment
brain system version \
  --added "Deployed to production" \
  --details "Build #${BUILD_NUMBER}"
```

## Troubleshooting

### Error: "At least one changelog field required"
**Causa**: Intentaste incrementar sin proporcionar flags de changelog.

**Solución**: Agrega al menos uno de: `--added`, `--changed`, o `--details`

### Error: "pyproject.toml not found"
**Causa**: El comando se ejecutó fuera del directorio del proyecto.

**Solución**: Navega al directorio raíz del proyecto o usa ruta absoluta.

---

## Resumen Rápido

```bash
# Ver versión
brain system version

# Incrementar con changelog
brain system version --added "Feature" --changed "File: Change" --details "Technical note"

# Múltiples valores
brain system version --added "A" --added "B" --added "C"
```

**Nota**: El sistema garantiza que solo se incremente la versión una vez por ejecución, sin importar cuántos flags se usen.
