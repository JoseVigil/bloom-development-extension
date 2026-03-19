# Nucleus Hook System — Guía de referencia y autoría

## Qué es esto

El **Hook System** es el mecanismo de extensibilidad de Nucleus que permite ejecutar lógica Python arbitraria en respuesta a eventos del sistema, sin modificar el binario Go.

Cada evento tiene un directorio propio en disco. Nucleus descubre, ordena y ejecuta los scripts Python que encuentra ahí, pasando contexto por `stdin` y leyendo resultados por `stdout`. El sistema es deliberadamente simple: un script Python que lee JSON y escribe JSON.

---

## Arquitectura general

```
Temporal Schedule (60s)
        │
        ▼
SystemHealthWorkflow       ← workflow de ciclo único, Go
        │
        ▼
RunSystemHealthActivity    ← activity Go en internal/mandates/
        │
        ▼
RunEvent(ctx, event, hctx) ← punto de entrada central
        │
        ▼
DiscoverHooks(event)       ← lee disco, ordena por nombre
        │
        ├── RunHook(00_health_check.py)
        ├── RunHook(01_otro_hook.py)
        └── ...
```

El mismo `RunEvent` es invocado por la Activity de Temporal **y** por el CLI (`nucleus hooks run <event>`), garantizando comportamiento idéntico en ambos contextos.

---

## Ubicación de hooks en disco

Los hooks viven **fuera del repositorio**, en el directorio de datos del usuario. Nucleus los descubre en runtime.

| OS      | Ruta base                                                  |
|---------|------------------------------------------------------------|
| Windows | `%LOCALAPPDATA%\BloomNucleus\hooks\`                       |
| macOS   | `~/Library/Application Support/BloomNucleus/hooks/`        |
| Linux   | `~/.local/share/BloomNucleus/hooks/`                       |

Cada evento tiene su propio subdirectorio:

```
BloomNucleus/hooks/
├── post_launch/
│   └── 00_generate_synapse_trace.py
└── system_health/
    └── 00_health_check.py
```

Los scripts se ejecutan **en orden alfabético**. El prefijo numérico (`00_`, `01_`, `02_`) es la convención para controlar ese orden de forma explícita.

---

## Contrato de un hook

### Entrada — `HookContext` vía `stdin`

Nucleus serializa esta struct Go como JSON y la escribe en el `stdin` del proceso Python:

```json
{
  "launch_id":    "001_031c802a_205228",
  "profile_id":   "031c802a",
  "log_base_dir": "C:\\Users\\...\\BloomNucleus\\logs",
  "nucleus_bin":  "C:\\...\\nucleus.exe"
}
```

| Campo          | Tipo   | Descripción                                                    |
|----------------|--------|----------------------------------------------------------------|
| `launch_id`    | string | Identificador del launch activo. Vacío si el evento no es de launch. |
| `profile_id`   | string | Perfil de Chromium asociado.                                   |
| `log_base_dir` | string | Directorio base de logs. Usarlo siempre para escribir archivos.|
| `nucleus_bin`  | string | Path absoluto al ejecutable `nucleus`. Usarlo para invocar nucleus desde el hook. |

**El campo `nucleus_bin` es crítico.** No asumir que `nucleus` está en el PATH. Siempre usar `ctx.get("nucleus_bin", "nucleus")` como fallback.

### Salida — `HookResult` vía `stdout`

El hook debe escribir exactamente **una línea JSON** en `stdout`:

```json
{
  "hook":    "00_mi_hook.py",
  "success": true,
  "stdout":  "cualquier string con metadata adicional",
  "stderr":  "",
  "error":   ""
}
```

| Campo     | Tipo   | Requerido | Descripción                                                              |
|-----------|--------|-----------|--------------------------------------------------------------------------|
| `hook`    | string | sí        | Nombre del script. Nucleus lo sobreescribe con `filepath.Base(script)`, pero incluirlo es buena práctica. |
| `success` | bool   | sí        | `true` si el hook completó su objetivo. **Esta es la señal de éxito**, no el exit code. |
| `stdout`  | string | no        | Metadata adicional o resultado. Puede ser un JSON string anidado (ver `00_health_check.py`). |
| `stderr`  | string | no        | Nucleus captura el `stderr` real del proceso. Este campo es para diagnóstico adicional. |
| `error`   | string | no        | Descripción del error si `success: false`.                               |

**Regla sobre el exit code:** Nucleus ignora deliberadamente el exit code del proceso Python. La única señal que importa es el campo `success` del JSON. Se puede hacer `sys.exit(1)` por convención, pero no tiene efecto en cómo Nucleus reporta el resultado.

**Regla sobre stdout no-JSON:** Nucleus busca la primera línea que empiece con `{`. Si un hook emite texto de debug antes del JSON, el runner lo tolera. Aun así, la mejor práctica es que la única línea en `stdout` sea el JSON de resultado. Usar `stderr` para logs de diagnóstico.

---

## Esqueleto canónico de un hook

```python
#!/usr/bin/env python3
"""
hooks/<evento>/NN_nombre_descriptivo.py

Event: <evento>
<Una línea explicando qué hace este hook y cuándo se dispara.>
"""
import sys
import json
import subprocess

HOOK_NAME = "NN_nombre_descriptivo.py"


def main():
    # 1. Leer HookContext desde stdin
    raw = sys.stdin.read()
    try:
        ctx = json.loads(raw)
    except json.JSONDecodeError as e:
        print(json.dumps({
            "hook":    HOOK_NAME,
            "success": False,
            "error":   f"invalid context JSON: {e}",
        }))
        sys.exit(1)

    nucleus_bin  = ctx.get("nucleus_bin", "nucleus")
    log_base_dir = ctx.get("log_base_dir", "")
    launch_id    = ctx.get("launch_id", "")

    # 2. Validar campos requeridos por este hook
    if not log_base_dir:
        print(json.dumps({
            "hook":    HOOK_NAME,
            "success": False,
            "error":   "log_base_dir missing from context",
        }))
        sys.exit(1)

    # 3. Lógica del hook
    result = subprocess.run(
        [nucleus_bin, "--json", "algún-comando"],
        capture_output=True,
        text=True,
    )

    # 4. Devolver HookResult
    print(json.dumps({
        "hook":    HOOK_NAME,
        "success": result.returncode == 0,
        "stdout":  result.stdout.strip(),
        "stderr":  result.stderr.strip(),
    }))
    sys.exit(result.returncode)


if __name__ == "__main__":
    main()
```

---

## Convenciones obligatorias

**Naming:** `NN_nombre_en_snake_case.py` donde `NN` es un número de dos dígitos (`00`, `01`, `02`...). El número define el orden de ejecución. Dejar gaps (`00`, `02`, `05`) si se anticipa insertar hooks intermedios más adelante.

**Una responsabilidad por hook:** Cada script hace exactamente una cosa. Si se necesita A y luego B, son dos hooks: `00_A.py` y `01_B.py`.

**Sin dependencias externas:** Los hooks solo pueden usar la stdlib de Python. No instalar paquetes. Si se necesita una librería, la lógica debe ir en un comando de Nucleus que el hook invoca.

**Invocar Nucleus, no reimplementar:** Si existe `nucleus --json algún-comando`, el hook lo llama como subproceso. No reimplementar lógica que ya vive en el binario Go.

**`log_base_dir` para archivos:** Si el hook escribe logs o archivos en disco, siempre usar `log_base_dir` del contexto como raíz. Nunca rutas hardcodeadas.

**Timeout consciente:** El hook debe terminar en tiempo razonable. El `StartToCloseTimeout` del workflow es 90 segundos en total para todos los hooks del evento. Diseñar en consecuencia.

**Stderr para diagnóstico:** Nucleus captura el `stderr` del proceso y lo preserva en el `HookResult`. Usarlo para mensajes de advertencia (`sys.stderr.write(...)`). No emitir texto de diagnóstico por `stdout` antes del JSON final.

---

## Eventos existentes

### `post_launch`

Se dispara después de que un perfil de Chrome arranca. El hook recibe `launch_id` y `log_base_dir` con valores reales.

Hook actual: `00_generate_synapse_trace.py` — espera los logs de Chrome en disco y ejecuta `nucleus logs synapse` para consolidarlos en un Synapse trace.

### `system_health`

Disparado por `SystemHealthWorkflow` vía Temporal Schedule cada 60 segundos. El `launch_id` puede estar vacío.

Hook actual: `00_health_check.py` — ejecuta `nucleus health`, evalúa el estado del sistema, intenta auto-fix en componentes fixables, chequea presión de memoria y devuelve metadata extendida en `stdout` como JSON string anidado para que la Activity Go la exponga en Temporal UI.

---

## Convención de logging en disco

Todo hook debe escribir un log en disco y registrar ese stream en telemetry. Sin esto, la única trazabilidad de la ejecución es lo que Temporal captura en el workflow result — insuficiente para diagnóstico.

### Estructura de archivos de log

```
{log_base_dir}/nucleus/{nombre_evento}/nucleus_{nombre_evento}_{YYYYMMDD}.log
```

Ejemplos reales:
```
logs/nucleus/system_health/nucleus_system_health_20260319.log
logs/nucleus/post_launch/nucleus_post_launch_20260319.log
```

Usar log rotado por día. Nunca un archivo único acumulativo.

### Registro en telemetry

Cada hook debe llamar a `nucleus telemetry register` al inicio, antes de escribir cualquier línea. Es una operación best-effort — si falla, no interrumpir la ejecución del hook.

```python
import subprocess
from pathlib import Path
from datetime import datetime

def get_log_path(log_base_dir: str, event_name: str) -> Path:
    date_str = datetime.now().strftime("%Y%m%d")
    log_dir = Path(log_base_dir) / "nucleus" / event_name
    log_dir.mkdir(parents=True, exist_ok=True)
    return log_dir / f"nucleus_{event_name}_{date_str}.log"

def register_telemetry(nucleus_bin: str, log_path: Path, event_name: str) -> None:
    """Registra el stream en telemetry. Best-effort: nunca lanza excepción."""
    try:
        subprocess.run(
            [
                nucleus_bin, "telemetry", "register",
                "--stream",      f"nucleus_{event_name}",
                "--label",       event_name.upper().replace("_", " "),
                "--path",        str(log_path).replace("\\", "/"),
                "--priority",    "2",
                "--category",    "nucleus",
                "--source",      "nucleus",
                "--description", f"{event_name} hook log",
            ],
            capture_output=True,
            timeout=10,
        )
    except Exception:
        pass
```

### Parámetros de telemetry register

| Parámetro      | Convención                                                                 |
|----------------|----------------------------------------------------------------------------|
| `--stream`     | `nucleus_{nombre_evento}` en snake_case. Estable entre ejecuciones.        |
| `--label`      | Nombre legible en mayúsculas, sin emoji. El Conductor lo puede decorar.    |
| `--priority`   | `1` para infraestructura crítica (como `system_health`), `2` para el resto.|
| `--category`   | Siempre `nucleus` para hooks del sistema.                                  |
| `--source`     | Siempre `nucleus`.                                                         |
| `--description`| Una línea describiendo qué registra el stream.                             |

### Escritura de log

Formato de línea estándar, consistente con el resto del sistema:

```python
from datetime import datetime, timezone

def write_log(log_path: Path, level: str, message: str) -> None:
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    line = f"[{ts}] {level:<7} {message}\n"
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(line)
```

Niveles: `INFO`, `WARN`, `ERROR`. Siempre UTC. Siempre append (`"a"`).

Líneas mínimas que todo hook debe escribir:

```python
write_log(log_path, "INFO", "=== <nombre_evento> hook started ===")
# ... lógica del hook ...
write_log(log_path, "INFO", "=== <nombre_evento> hook completed ===")
```

### Esqueleto canónico actualizado con logging

```python
#!/usr/bin/env python3
"""
hooks/<evento>/NN_nombre_descriptivo.py
Event: <evento>
"""
import sys
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

HOOK_NAME  = "NN_nombre_descriptivo.py"
EVENT_NAME = "nombre_evento"


def get_log_path(log_base_dir: str) -> Path:
    date_str = datetime.now().strftime("%Y%m%d")
    log_dir = Path(log_base_dir) / "nucleus" / EVENT_NAME
    log_dir.mkdir(parents=True, exist_ok=True)
    return log_dir / f"nucleus_{EVENT_NAME}_{date_str}.log"


def register_telemetry(nucleus_bin: str, log_path: Path) -> None:
    try:
        subprocess.run(
            [
                nucleus_bin, "telemetry", "register",
                "--stream",      f"nucleus_{EVENT_NAME}",
                "--label",       EVENT_NAME.upper().replace("_", " "),
                "--path",        str(log_path).replace("\\", "/"),
                "--priority",    "2",
                "--category",    "nucleus",
                "--source",      "nucleus",
                "--description", f"{EVENT_NAME} hook log",
            ],
            capture_output=True,
            timeout=10,
        )
    except Exception:
        pass


def write_log(log_path: Path, level: str, message: str) -> None:
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(f"[{ts}] {level:<7} {message}\n")


def main():
    raw = sys.stdin.read()
    try:
        ctx = json.loads(raw)
    except json.JSONDecodeError as e:
        print(json.dumps({"hook": HOOK_NAME, "success": False, "error": f"invalid context JSON: {e}"}))
        sys.exit(1)

    nucleus_bin  = ctx.get("nucleus_bin", "nucleus")
    log_base_dir = ctx.get("log_base_dir", "")

    if not log_base_dir:
        print(json.dumps({"hook": HOOK_NAME, "success": False, "error": "log_base_dir missing from context"}))
        sys.exit(1)

    log_path = get_log_path(log_base_dir)
    register_telemetry(nucleus_bin, log_path)

    write_log(log_path, "INFO", f"=== {EVENT_NAME} hook started ===")

    # lógica del hook
    result = subprocess.run(
        [nucleus_bin, "--json", "algún-comando"],
        capture_output=True, text=True,
    )

    if result.returncode == 0:
        write_log(log_path, "INFO", "Hook completed successfully")
    else:
        write_log(log_path, "ERROR", f"Command failed: {result.stderr.strip()}")

    write_log(log_path, "INFO", f"=== {EVENT_NAME} hook completed ===")

    print(json.dumps({
        "hook":    HOOK_NAME,
        "success": result.returncode == 0,
        "stdout":  result.stdout.strip(),
        "stderr":  result.stderr.strip(),
    }))
    sys.exit(result.returncode)


if __name__ == "__main__":
    main()
```

---

## Agregar un nuevo hook — checklist

1. Identificar a qué evento pertenece. Si no existe el evento, crear el directorio.
2. Elegir el número de orden: ver qué hooks ya existen con `nucleus hooks list <evento>`.
3. Crear el archivo `NN_nombre.py` siguiendo el esqueleto canónico.
4. Validar los campos del `HookContext` que el hook va a usar y fallar limpiamente si faltan.
5. Implementar logging con `get_log_path`, `register_telemetry` y `write_log` siguiendo la convención de la sección anterior.
6. Probar en local: `echo '{"nucleus_bin":"nucleus","log_base_dir":"/tmp"}' | python NN_nombre.py`
7. Verificar con el CLI: `nucleus hooks run <evento> --context '{...}'`
8. Verificar con `--json`: `nucleus --json hooks run <evento>` — confirmar que `success: true` y el output JSON es parseable.
9. Confirmar que el stream aparece en telemetry: `nucleus --json telemetry list` debe mostrar `nucleus_{nombre_evento}` como stream activo.

---

## Comportamiento de fallo

Si un hook falla (`success: false`), Nucleus lo registra en `HooksRunResult.Failed` y marca el resultado global como `success: false`. **Los hooks siguientes continúan ejecutándose** — no hay short-circuit. Un hook fallido no bloquea al resto.

Si el stdout del hook no contiene JSON parseable, Nucleus construye un `HookResult` de error automáticamente con el stdout y stderr completos para facilitar el diagnóstico.

---

## CLI de referencia

```bash
# Listar hooks registrados para un evento
nucleus hooks list post_launch
nucleus --json hooks list post_launch

# Ejecutar hooks de un evento manualmente
nucleus hooks run post_launch
nucleus hooks run post_launch --context '{"launch_id":"001_031c802a","profile_id":"031c802a","log_base_dir":"/tmp/logs","nucleus_bin":"/usr/local/bin/nucleus"}'

# Modo JSON (para integración con otras herramientas)
nucleus --json hooks run post_launch --context '{...}'
```

---

## Ubicación en el árbol del proyecto

```
internal/mandates/
├── mandate_types.go          ← HookContext, HookResult, HooksRunResult
├── mandate_runner.go         ← HooksBaseDir, DiscoverHooks, RunHook, RunEvent
├── mandate_hooks_cmd.go      ← CLI: nucleus hooks run | list
├── mandate_activities.go
├── mandate_logger.go
└── system_health_activity.go ← Activity que invoca RunEvent para system_health
```