# 🌸 BLOOM — BASE CONCEPTO (BTIP)

Sistema de Documentación Inteligente — Bloom Technical Intent Packages (BTIP)

## 1. PROPÓSITO GENERAL

Bloom es un sistema para crear, mantener y consultar documentación técnica viva optimizada para IA.
Su unidad básica es el Bloom Technical Intent Package (BTIP): un paquete autocontenido que agrupa código, documentación, prompts y planes de acción para una intención técnica concreta.

Bloom permite:

- Proveer contexto inmediato y reproducible a cualquier IA.
- Versionar y compartir intenciones técnicas como artefactos portables.
- Integrar CLI y plugin (VSCode/Visual Studio) para creación y gestión de BTIPs.

## 2. ESTRUCTURA PRINCIPAL DEL PROYECTO (RESUMEN)

La raíz oculta de Bloom dentro de cada proyecto es `.bloom/`.
Estructura esperada mínima:

    .bloom/
    ├── system/
    │   ├── .readme.main.bl
    │   ├── .system-prompt.bl
    │   ├── .prompting-guide.bl
    │   ├── .architecture-guide.bl
    │   └── .api-reference.bl
    ├── intents/
    │   ├── cache-system.btip/
    │   │   ├── .intent.json
    │   │   ├── .requirement.bl
    │   │   ├── .codebase.bl
    │   │   ├── .plan.bl
    │   │   └── .report.bl
    │   └── another-feature.btip/
    └── manifest.json

Nota: todos los archivos y carpetas dentro de `.bloom/` empiezan con `.` y son "ocultos" por diseño.
Los sufijos `.bl` y `.btip` son convenciones internas para distinguir archivos IA-ready.

## 3. DEFINICIÓN DE UN BTIP

Cada BTIP representa una intención técnica (audit, feature, refactor, integración).
Debe incluir como mínimo:

- `.intent.json` — metadata del intent (id, nombre, versión, tipo, autor, dependencias).
- `.requirement.bl` — especificación funcional/arquitectónica.
- `.codebase.bl` — código unificado o referencias al codebase relevante.
- `.plan.bl` — plan de implementación o checklist técnico.
- `.prompt-master.bl` — instrucciones maestras para la IA (cómo auditar).
- `.prompt-exec.bl` — prompt de ejecución corto/preciso para enviar a la IA.
- `.report.bl` — salida / resultados / auditorías (generadas por IA o humanos).

## 4. TIPOS DE BTIP

- **System BTIPs** (persistentes): definen el contexto global del proyecto (`.bloom/system/*`). Se crean con `bloom init`.
- **Intent BTIPs** (dinámicos): creados por desarrolladores para tareas puntuales. Pueden ser miles y versionables.

## 5. PRINCIPIOS DE DISEÑO

- **IA-native**: los `.bl` están optimizados para ser consumidos por modelos de lenguaje.
- **CLI-first**: el CLI `bloom` es el motor; el plugin delega en el CLI.
- **Modularidad**: cada BTIP es autocontenido y reutilizable.
- **Trazabilidad**: toda ejecución IA genera `report.bl` con metadatos (timestamps, modelo, prompt usado).
- **Simplicidad UX**: el desarrollador selecciona archivos -> crea intent -> ejecuta IA.

## 6. METADATA EJEMPLO (.intent.json)

    {
        "id": "cache-system",
        "name": "Sistema de Caché y Sincronización",
        "version": "2.0.0",
        "type": "audit",
        "author": "Jose Vigil",
        "dependencies": [],
        "description": "Gestión de caché híbrida (RAM + SQLite) con sincronización granular bajo demanda.",
        "entry_prompts": {
            "main": ".prompt-master.bl",
            "exec": ".prompt-exec.bl"
        },
        "ai_context": ["requirement", "plan", "codebase"],
        "created_at": "2025-11-11"
    }

## 7. FLUJO DE USO (ALTO NIVEL)

    bloom init
    bloom create intent <name> --files <paths>
    bloom ai run <name> --model <provider>
    bloom update intent <name>
    bloom export --all

El plugin invoca estos comandos; no duplica la lógica.

## 8. NOTAS FINALES

- Mantener la convención `.bl` y `.btip` para compatibilidad con parsers y automatizaciones.
- Documentar en `.bloom/manifest.json` la lista de intents y system BTIPs.
- Favor CLI para scripting y CI; plugin para UX (selección y triggers).

---

# ⚙️ BLOOM CLI SPEC — Especificación técnica del CLI Bloom

## 0. PROPÓSITO

El CLI `bloom` automatiza la creación, gestión, ejecución y exportación de BTIPs.
Debe ser robusto, scriptable y agnóstico respecto al proveedor IA.

## 1. COMANDOS PRINCIPALES

### bloom init

Inicializa `.bloom/` y crea System BTIPs base.

Flags: `--force`, `--template <name>`.

### bloom create intent <name> [--files <paths>]

Crea un nuevo intent BTIP en `.bloom/intents/<name>.btip/`.

Genera placeholders: `.intent.json`, `.requirement.bl`, `.codebase.bl`, `.plan.bl`, `.prompt-master.bl`, `.prompt-exec.bl`.

Si `--files` se provee, agrega fragmentos del codebase a `.codebase.bl`.

### bloom update intent <name>

Sincroniza cambios locales hacia el intent (refresca `.codebase.bl`, `.plan.bl` si corresponde).

### bloom list [--all]

Lista intents y system BTIPs.

### bloom ai run <name> [--model <provider>] [--dry-run]

Envía los archivos marcados como `ai_context` al proveedor IA con el prompt indicado en `.prompt-exec.bl` o `.prompt-master.bl` según flag.

Guarda respuesta en `.report.bl`.

### bloom report <name> [--open]

Muestra el contenido de `.report.bl` y metadatos.

### bloom export [--intent <name>] [--all] --output <path>

Empaqueta el intent o todo `.bloom/` en un artefacto portable (`.bloombundle` / zip).

### bloom validate [--schema]

Valida integridad del esquema `.bloom/` y los `.bl` requeridos.

### bloom diff <intent> [--base <rev>] (roadmap)

Compara versiones de `.codebase.bl` o `.plan.bl` si existe control de versiones.

## 2. REGLAS DE CREACIÓN DE INTENT (create intent)

Nombre de intent: `^[a-z0-9\-_]+$`

Estructura resultante:

    .bloom/intents/<name>.btip/
    .intent.json
    .requirement.bl
    .codebase.bl
    .plan.bl
    .prompt-master.bl
    .prompt-exec.bl
    .report.bl (inicialmente vacío)
    /assets/ (opcional: binarios o attachments)

Por defecto, `.intent.json.ai_context = ["requirement", "codebase", "plan"]`.

## 3. ENVIRONMENT / CONFIG

Archivo de configuración global: `~/.bloomrc` o variable `BLOOM_CONFIG`.

Config contiene keys para providers IA, timeouts, límites de tokens y logging.

Ejemplo (json):

    {
        "default_model": "claude",
        "providers": {
            "claude": {"api_key_env": "CLAUDE_KEY"},
            "openai": {"api_key_env": "OPENAI_KEY"}
        },
        "timeout_ms": 120000
    }

## 4. INTEGRACIÓN CON PLUGIN (CLI Contract)

El plugin debe llamar al CLI para:

- `bloom create intent` (con paths seleccionados)
- `bloom update intent` (cuando se guarden cambios)
- `bloom ai run` (ejecución remota)
- `bloom report` (mostrar resultados)

El CLI retorna JSON en stdout cuando se invoca con `--json` para que la UI lo interprete.

## 5. OUTPUTS / TRAZABILIDAD

Cada ejecución `bloom ai run` genera en el intent:

- `.report.bl` — markdown con resultado y metadatos.
- `.report.meta.json` — estructura con: `{ model, prompt_hash, timestamp, duration_ms, provider, success }`

Formato meta ejemplo:

    {
        "model": "claude-2",
        "prompt_hash": "sha256:abcd...",
        "timestamp": "2025-11-12T12:00:00Z",
        "duration_ms": 2345,
        "provider": "claude",
        "success": true
    }

## 6. POLÍTICAS Y LÍMITES

- Límite predeterminado de tokens por ejecución configurable.
- Timeout por provider configurable.
- El CLI debe validar tamaños de archivos y advertir si el envío excede el límite de provider.

## 7. EJEMPLO DE FLUJO (CLI)

    # Inicializar proyecto Bloom
    bloom init

    # Crear intent a partir de archivos seleccionados
    bloom create intent cache-system --files src/main/java/MainActivity.java src/main/java/DataLoadManager.java

    # Ejecutar auditoría via IA
    bloom ai run cache-system --model claude --json

    # Revisar reporte
    bloom report cache-system --open

## 8. NOTAS PARA DESARROLLADORES

- Adoptar pruebas unitarias y de integración para comandos `create`, `update`, `ai run`.
- Diseñar la API interna del CLI de forma que el plugin la consuma por CLI (shell) o por RPC (opcional).
- Mantener logs detallados en `.bloom/.meta/` para reproducibilidad.