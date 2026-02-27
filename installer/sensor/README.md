# bloom-sensor

> Human presence runtime for the Bloom ecosystem.

**Sensor mide. Nucleus decide. Brain ejecuta.**

`bloom-sensor` es el runtime de presencia humana de la arquitectura Bloom. Corre en **Session 1** como proceso persistente, detecta actividad del usuario, calcula métricas de energía y publica eventos a `bloom-sentinel`.

---

## Arquitectura

```
Sensor = presencia humana (fisiología digital)
Brain  = cognición
Nucleus = gobernanza
Sentinel = sistema nervioso
```

Sensor no sabe si alguien lo escucha. Solo mide. Solo publica. Solo existe mientras el humano existe en sesión.

---

## Comandos

### RUNTIME
| Comando | Descripción |
|---|---|
| `bloom-sensor run` | Arranca el loop de detección de presencia |
| `bloom-sensor run --once` | Un solo tick y sale (modo diagnóstico) |
| `bloom-sensor status` | Estado del proceso, autostart y conexión a Sentinel |

### LIFECYCLE
| Comando | Descripción |
|---|---|
| `bloom-sensor enable` | Registra BloomSensor en HKCU\Run (elimina BloomLauncher si existe) |
| `bloom-sensor disable` | Elimina BloomSensor de HKCU\Run (no mata el proceso) |

### TELEMETRY
| Comando | Descripción |
|---|---|
| `bloom-sensor export` | Exporta los últimos 100 snapshots del ring buffer |
| `bloom-sensor export --last 1h` | Snapshots de la última hora |

### SYSTEM
| Comando | Descripción |
|---|---|
| `bloom-sensor version` | Versión, canal y build |
| `bloom-sensor --json info` | Identidad y capabilities (contrato Metamorph) |

---

## Flags globales

```
--debug           Activa logging de debug
--channel string  Canal de release (stable|beta)
--config string   Ruta a config file
--json            Output en formato JSON
```

---

## Build

```bat
cd scripts
build.bat
```

Requiere: Go 1.22+, Windows (compila con `GOOS=windows`).

---

## Modelo de métricas

`energy_index` es un valor determinista en `[0.0, 1.0]`:

- **Sesión bloqueada** → `0.0`
- **Idle > 60 min** → `0.0`
- **Idle 30–60 min** → decaimiento lineal `0.5 → 0.0`
- **Idle 0–30 min** → decaimiento suave `1.0 → 0.5`

Sin ML. Sin estado externo. Función pura y testeable.

---

## Integración con Sentinel

Protocolo: `4 bytes big-endian (longitud) + JSON payload`.

Reconexión automática en background con backoff exponencial. El runtime principal nunca bloquea esperando a Sentinel.

---

## Logs

```
%LOCALAPPDATA%\BloomNucleus\logs\sensor\sensor_YYYYMMDD.log
```

Timestamps siempre en UTC. Ring buffer en memoria (últimas 1440 snapshots = 24h a 1 tick/min).

---

*bloom-sensor v1.0 — Ecosistema Bloom*
