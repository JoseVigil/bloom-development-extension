# Nucleus — Boot, Logging y Telemetry (con contexto de Setup)

> Este documento describe el sistema de telemetría/boot de Nucleus en **runtime** (post-instalación), y aclara explícitamente qué parte de esto toca al **instalador** (`bloom-development-extension/setup/`). Es el único doc de referencia para ambos temas — no hay un doc separado de setup.

---

## 0. Relación con el instalador (`setup/`)

Según el `Bloom Workspace — Setup Manifest` (sección 7, "Fuera de alcance"):

> *"Telemetría/boot logging de Nucleus en runtime [...] es información de runtime, no de instalación. [...] Electron nunca escribe `telemetry.json` directamente — Nucleus es el único escritor autorizado; Electron solo registra streams vía `nucleus telemetry register` y escribe `.log` en `logs/electron/`."*

En criollo: todo lo que sigue en este documento pasa **después** de que `setup/` terminó su trabajo.

| Touchpoint | Detalle |
|---|---|
| Logs propios del instalador | `logs/electron/` — logs de progreso/errores de milestones. No pasan por `telemetry.json`. |
| Primer arranque de Nucleus | Milestones **M09 `nucleus_seed`** y **M10 `nucleus_launch`** (Setup Manifest, sección 4) — ahí Nucleus corre por primera vez y empieza a registrar streams. Antes de M09, `telemetry.json` no existe o está vacío. |
| Certificación previa (M08) | Health check mínimo (`brain_service` + `temporal`), chequeo de proceso vivo — no es lectura de `telemetry.json`, y es distinto del `nucleus health` completo (sección 5 de este doc). |
| Diagnóstico post-install | `install/diagnose/*.js` — inspecciona si los servicios quedaron bien registrados (NSSM/launchd), no consume el dashboard de streams. |

**Lo que `setup/` nunca hace:** escribir `telemetry.json`, hacer polling de streams, o depender de sus campos (`priority`, `active`, `last_update`). Eso es contrato exclusivo entre Nucleus y **Conductor Workspace** (la app post-instalación), no entre Nucleus y el instalador. Si algo en `install/`, `ipc/` o `scripts/` necesita confirmar que Nucleus arrancó bien, debe usar un health check de proceso o invocar `nucleus health --json` como subproceso — nunca leer el JSON a mano.

---

## 1. Contexto General

El **Supervisor** (`internal/supervisor/supervisor.go`) es el núcleo orquestador de Nucleus, el "Magistrado de Gobernanza" de la arquitectura BTIPS. Nucleus es la **conciencia organizacional** única por organización Bloom: no desarrolla features (eso es de Projects), sino que gobierna, explora y coordina via intents (`exp`, `inf`, `cor`, `doc`). El Supervisor convierte esta gobernanza en un **proceso de ingeniería reproducible**, levantando un runtime persistente y verificable.

Al ejecutar `nucleus dev-start` (desarrollo) o `nucleus service start` (producción, daemon NSSM en Windows), el Supervisor sigue una **secuencia de boot determinística y declarativa** (inspirada en reconciliación de Metamorph): verifica estados deseados vs. actuales, spawnea procesos con env vars inyectadas, monitorea via goroutines (`monitorProcess`), y actualiza telemetry global (`telemetry.json` en `logs/orchestration/`).

**Logging y Telemetry**: sistema centralizado y estricto (`BLOOM_NUCLEUS_LOGGING_SPEC.md`). `telemetry.json` (único archivo en raíz de `logs/`) es el índice global de streams activos, actualizado exclusivamente via CLI `nucleus telemetry register` (single-writer, evita colisiones). Las apps crean sus logs; Nucleus maneja el registro atómico (lock + timestamps UTC). Esto permite a **Conductor Workspace** hacer poll real-time para dashboards.

- **Filosofía**: Idempotente, tolerante a fallos no críticos (e.g., Ollama async), graceful shutdown (SIGINT, 10s timeout → force kill).
- **Requisitos previos**: Rol "Master" (`governance.RequireMaster`), binarios en `$BLOOM_BIN_DIR` o `$LOCALAPPDATA/BloomNucleus/bin`, Vault unlocked (opcional con `--skip-vault`).
- **Duración típica**: 5-10s.
- **Logs globales**: `$BLOOM_LOGS_DIR` (default `$LOCALAPPDATA/BloomNucleus/logs`). Solo `telemetry.json` en raíz + subfolders `*.log` (`module_timestamp.log`).
- **Modos**: `dev-start` (human-readable, `--simulation`), `service start` (daemon, NSSM).

## 2. Secuencia de Boot Detallada

`executeBootSequence` (`dev_start.go`, reusada en `service.go`). Fases atómicas, timeout global 30s, retries con backoff. Post-spawn, cada componente registra su stream via `nucleus telemetry register`.

1. **Temporal Server (~2-5s)** — `nucleus temporal ensure` (idempotente); spawnea `temporal.exe server start-dev` si no corre. Verificación: TCP 7233 + gRPC health SERVING. Outputs: PID, gRPC:7233, UI:8233. Log: `logs/temporal/server/temporal_server_20260216.log`. Telemetry: `--stream temporal_server --priority 1`. Falla: abort (crítico).

2. **Worker Manager (~1s)** — `startWorkerManager` spawnea `nucleus worker start -q profile-orchestration`. Env: `NUCLEUS_WORKER_TASK_QUEUE=profile-orchestration`. Log: `logs/nucleus/worker/worker_manager_20260216.log`. Telemetry: `--stream worker_manager --priority 2`. Falla: abort (crítico para Synapse seed/launch).

3. **Ollama (no-bloqueante, ~3-10s async)** — `StartOllama` via workflow Temporal (retry 3x). Verificación: HTTP GET `localhost:11434/api/tags`. Log: `logs/sentinel/ollama_service_2026-02-16.log`. Telemetry: `--stream ollama_service --priority 3`. Falla: WARN no-crítico; manual: `sentinel ollama start`.

4. **Governance Validation (~0.5s)** — `bootGovernance` parsea `.ownership.json`. Skip si no existe (modo instalación). Telemetry indirecta vía stream `nucleus_build` (priority 3). Falla: crítico si archivo inválido.

5. **Vault Check (opcional, ~1s)** — `CheckVaultStatus` via workflow. `--skip-vault` para dev. Estado esperado: UNLOCKED + `master_profile_active: true`. Falla: abort si locked.

6. **Control Plane (~2-3s)** — `bootControlPlane` spawnea `server-bootstrap.js` (Node). Env: `BLOOM_USER_ROLE=Master`, `BLOOM_VAULT_STATE=UNLOCKED`, `BLOOM_WORKER_RUNNING=true`, `BLOOM_SIMULATION_MODE=false`, `BLOOM_LOGS_DIR=logs`. Outputs: WS `ws://localhost:4124`, API `http://localhost:48215`, Swagger `/api/docs`. Telemetry: streams `control_plane_websocket` / `control_plane_api` (priority 2). Falla: crítico (e.g., Node no encontrado).

**Post-boot global**:
- Monitoreo: goroutines por proceso (exit → FAILED/STOPPED, re-registro en telemetry).
- Éxito: `[SUCCESS] ✅ Nucleus ready` + métricas (boot time, PIDs, ports).
- Conductor Workspace hace poll cada 5s para freshness (`last_update` > 5min → stale alert).
- Shutdown: orden inverso (Control Plane → Ollama → Worker → Temporal), 10s wait, flush logs.

## 3. Componentes Levantados por Supervisor

Gestionados en `s.processes` (`ManagedProcess`: Name, PID, State, LogPath). Estados: IDLE → STARTING → READY/DEGRADED → STOPPING → STOPPED/FAILED.

| Componente | Rol | Puerto/Endpoint | Dependencias | Estado esperado | Priority |
|---|---|---|---|---|---|
| Temporal Server | Orquestador workflows | gRPC:7233, UI:8233 | Ninguna (root) | READY (SERVING) | 1 |
| Worker Manager | Ejecuta activities (seed/launch) | Task Queue: profile-orchestration | Temporal UP | CONNECTED | 2 |
| Ollama | LLM local (intents exp/inf) | HTTP:11434 | Ninguna (async) | RUNNING | 3 |
| Governance | Valida `.ownership.json` | N/A (FS) | Archivo existe | VALID / SKIPPED | 3 |
| Vault | Keys/auth | N/A (CLI) | Governance OK | UNLOCKED | — |
| Control Plane | Puente UI-runtime (Node.js) | API:48215, WS:4124 | Todos previos + Node | READY (post-3s) | 2 |
| Brain Core/Profile/Server | Motor Python, perfiles, Host C++ bridge | 5678 + substreams | Control Plane UP | READY | 2 |
| Sentinel Core | Sidecar/Event Bus (Chrome, side-effects) | Integra con WS 4124 | Worker UP | ACTIVE | 1 |

Integración ecosistema: VSCode Plugin (VSSocket/HTTP → 4124/48215), Sentinel (Event Bus via WS), Brain (Python via Host C++). Logging: apps siguen spec (subfolders, `lowercase_underscore_timestamp.log`); **ninguna app escribe directo a `telemetry.json`**.

## 4. Sistema de Logging y Telemetry (Detalle)

Estructura estricta: raíz `logs/` solo con `telemetry.json` + subfolders (`brain/core/`, `sentinel/`, etc.). Naming: `module_timestamp.log`, rotación diaria. Se recomienda structured logging (JSON lines) para parseo en Conductor Workspace.

- **`telemetry.json`**: índice global. Formato: `{active_streams: {stream_id: {label, path, priority: 1-3, first_seen?, last_update, active?}}}`. Actualización exclusiva via `nucleus telemetry register --stream ID --label "Emoji" --path <log> --priority N` (idempotente, atomic lock, auto-`last_update`).
- **Registro en boot**: post-spawn, cada app llama la CLI (e.g. `server-bootstrap.js` invoca `updateTelemetry` como subproceso). `active: false` (e.g. worker_manager) dispara alert en Conductor Workspace ("Restart needed").
- **Reglas críticas para quien consume esto (Conductor Workspace)**:
  - Lectura: parsear JSON, filtrar por `active:true` o `last_update > now-5min`.
  - **Nunca escribir directo** — usar la CLI para cualquier update.
  - Estructura: `logs/[app]/[sub]/module_timestamp.log`.
  - Priorities: 1=crítico (Sentinel/Temporal), 2=core (Brain/Worker), 3=aux (Ollama/Build).
  - Retention/rotation: app-specific (daily), prune manual de paths viejos si hace falta.

## 5. Verificación: `nucleus health`

`internal/supervisor/health.go` — verificador integral post-boot. `checkSystemHealth` (30s timeout), NUCLEUS SERVICES (prioridad 1) + SENTINEL SERVICES. Estados: HEALTHY / DEGRADED / FAILED.

- **Básico**: `nucleus health` → human-readable.
- **JSON**: `nucleus health --json` → `{success, state, components: {...}, timestamp}` (exit 1 si `!success`).
- **Deep**: `nucleus health --json --validate` → chequeos lentos (HTTP /health, parse profiles.json).
- **Específico**: `nucleus health --component temporal`.

**Qué verifica**:
- Temporal: TCP 7233 + gRPC SERVING.
- Worker: conexión a queue + `telemetry.json` path exists/active.
- Ollama: HTTP 11434 + PID alive; stale si `last_update` > 5min.
- Control Plane: PID Node + HTTP 48215.
- Vault: UNLOCKED.
- Governance: `.ownership.json` válido.
- Brain: TCP 5678 + heartbeat ping.
- Bloom API: HTTP 48215 (/health).
- Worker Manager: `config/profiles.json` (READY vacío en install, ACTIVE si >0).

Uso en Conductor Workspace: widgets de progreso por fase, alerts si DEGRADED o telemetry stale. Post-boot corre automático para onboarding.

---

**Fuente**: `Bloom Workspace — Setup Manifest` v1.0 (2026-08-17), secciones 4 y 7, para el contexto de instalación. El resto es documentación original del Supervisor de Nucleus.
