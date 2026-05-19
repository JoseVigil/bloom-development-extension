# Documentación Oficial: Inicialización del Servicio Nucleus via Supervisor (Extensión: Logging y Telemetry)

## Contexto General
El **Supervisor** (implementado en `internal/supervisor/supervisor.go`) es el núcleo orquestador de Nucleus, el "Magistrado de Gobernanza" descrito en la arquitectura BTIPS (Bloom Technical Intent Package). Nucleus actúa como la **conciencia organizacional** única por organización Bloom: no desarrolla features productivas (eso es para Projects), sino que gobierna, explora y coordina via intents como `exp` (exploration), `inf` (information), `cor` (coordination) y `doc` (documentation estratégica). El Supervisor transforma esta gobernanza en un **proceso de ingeniería reproducible**, levantando un runtime persistente y verificable.

Cuando se ejecuta `nucleus dev-start` (para desarrollo) o `nucleus service start` (para producción como daemon NSSM en Windows), el Supervisor sigue una **secuencia de boot determinística y declarativa** (inspirada en reconciliación de Metamorph): verifica estados deseados vs. actuales, spawnea procesos con env vars inyectadas, monitorea via goroutines (`monitorProcess`), y actualiza telemetry global (`telemetry.json` en `logs/orchestration/`). Esto asegura coherencia cognitiva, escalabilidad local (DevPC) y transferencia de conocimiento sin degradación.

**Extensión: Logging y Telemetry**: El sistema de logging es centralizado y estricto, definido en `BLOOM_NUCLEUS_LOGGING_SPEC.md`. `telemetry.json` (único archivo en raíz de `logs/`) actúa como índice global de streams activos, actualizado exclusivamente via CLI `nucleus telemetry register` (patrón single-writer para evitar colisiones). Aplicaciones crean sus logs, pero Nucleus maneja el registro atómico (con lock y timestamps UTC). Esto permite al **Conductor** (UI/Onboarding) poll real-time para dashboards (e.g., métricas de streams, alerts por `last_update` stale), integrando con health checks para verificación visual.

- **Filosofía**: Idempotente (no falla si ya corre), tolerante a fallos no críticos (e.g., Ollama async), y graceful shutdown (SIGINT con 10s timeout → force kill). Logging: Separación estricta (apps escriben logs, Nucleus registra telemetry).
- **Requisitos Previos**: Rol "Master" (verificado via `governance.RequireMaster`), binarios en `$BLOOM_BIN_DIR` o `$LOCALAPPDATA/BloomNucleus/bin`, y Vault unlocked (opcional con `--skip-vault`).
- **Duración Típica**: 5-10s (incluye waits para readiness; e.g., 3s post-Control Plane).
- **Logs Globales**: `$BLOOM_LOGS_DIR` (default: `$LOCALAPPDATA/BloomNucleus/logs`). Estructura: Solo `telemetry.json` en raíz + subfolders con `*.log` (naming: `module_timestamp.log`, e.g., `brain_core_20260216.log`).
- **Diferencias Modos**: `dev-start` (human-readable, `--simulation` para test), `service start` (daemon, NSSM integration).

Esta documentación es la fuente de verdad para el **Conductor** (UI/Onboarding): úsala para diseñar flujos de inicialización, dashboards con polling de telemetry/health/logs, y verificación post-boot. Integra con VSCode Plugin (conecta a API/WS post-boot) y Synapse (perfiles via Temporal). Para logging, Conductor puede parsear `telemetry.json` para widgets (e.g., lista de streams con paths, filtros por priority/active), y tail logs via paths.

## Secuencia de Boot Detallada
La secuencia principal está en `executeBootSequence` (`dev_start.go` y reusada en `service.go`). Cada fase es atómica, con timeouts (30s global) y retries (backoff para locks/files). Outputs: JSON para automation (`--json`), human-readable para dev. Post-spawn, cada componente registra su stream via `nucleus telemetry register` (auto o manual por app), actualizando `telemetry.json`.

1. **Fase 1: Temporal Server (~2-5s)**  
   - Acción: `nucleus temporal ensure` (idempotente). Si no corre, `startTemporalServer` spawnea `temporal.exe server start-dev`.  
   - Env/Args: Ninguno extra.  
   - Verificación: `verifyTemporalServer` (TCP dial a 7233, 2s timeout) + gRPC health (`HealthClient.Check` → SERVING).  
   - Outputs: PID, gRPC:7233, UI:8233. Log: `logs/temporal/server/temporal_server_20260216.log`.  
   - Telemetry: Registro via CLI: `--stream temporal_server --label "⏰ TEMPORAL SERVER" --path <log> --priority 1`. Stream: `{label: "⏰ TEMPORAL SERVER", path: ".../temporal_server_20260216.log", priority: 1, last_update: "2026-02-16T12:06:00Z"}`.  
   - Falla: Abort si unreachable (crítico para workflows).

2. **Fase 2: Worker Manager (~1s)**  
   - Acción: `startWorkerManager` spawnea `nucleus worker start -q profile-orchestration` (Node.js-like via `StartNodeProcess`).  
   - Env/Args: `NUCLEUS_WORKER_TASK_QUEUE=profile-orchestration`.  
   - Verificación: `verifyWorkerRunning` (placeholder; futuro: query Temporal).  
   - Outputs: PID, conectado a task queue. Log: `logs/nucleus/worker/worker_manager_20260216.log`.  
   - Telemetry: Registro: `--stream worker_manager --label "🔧 WORKER MANAGER" --path <log> --priority 2`. Ejemplo del JSON adjunto: `{label: "🔧 WORKER MANAGER", path: ".../worker_manager_20260216.log", priority: 2, first_seen: "", last_update: "2026-02-16T11:22:03Z", active: false}`.  
   - Falla: Abort (crítico para activities como Synapse seed/launch).

3. **Fase 3: Ollama (Non-Blocking, ~3-10s async)**  
   - Acción: `StartOllama` via workflow Temporal (`ollama serve`, retry 3x). Goroutine para no bloquear.  
   - Env/Args: Ninguno extra. Binario: `ollama.exe` (PATH o `bin/ollama/`).  
   - Verificación: HTTP GET `http://localhost:11434/api/tags` (2s timeout).  
   - Outputs: PID, puerto 11434. Log: `logs/sentinel/ollama_service_2026-02-16.log`.  
   - Telemetry: Registro: `--stream ollama_service --label "⚙️ OLLAMA ENGINE" --path <log> --priority 3`. Ejemplo: `{label: "⚙️ OLLAMA ENGINE", path: ".../ollama_service_2026-02-16.log", priority: 3, first_seen: "2026-02-16T07:47:21-03:00", last_update: "2026-02-16T07:58:19-03:00", active: true}`.  
   - Falla: WARN no-crítico ("Ollama start failed"); manual: `sentinel ollama start`.

4. **Fase 4: Governance Validation (~0.5s)**  
   - Acción: `bootGovernance` parsea `.ownership.json` (campos: owner, created_at, etc.).  
   - Env/Args: `$BLOOM_DIR/.bloom/.ownership.json` (o simulado en `--simulation`: `installer/nucleus/scripts/simulation_env/.bloom/`).  
   - Verificación: Stat/exists; skip si no existe (instalación mode).  
   - Outputs: Estado "VALID". Log: Integra en build/nucleus_build.log si aplica.  
   - Telemetry: No directo; usa stream `nucleus_build` para governance logs. Ejemplo: `{label: "📦 NUCLEUS BUILD", path: ".../nucleus_build.log", priority: 3, first_seen: "2026-02-16T11:38:09Z", last_update: "2026-02-16T13:07:11Z", active: true}`.  
   - Falla: "governance validation failed" (crítico si archivo inválido).

5. **Fase 5: Vault Check (Opcional, ~1s)**  
   - Acción: `CheckVaultStatus` via workflow (`nucleus vault-status`).  
   - Env/Args: `--skip-vault` para dev (set "SKIPPED").  
   - Verificación: Estado "UNLOCKED" + `master_profile_active: true`. JSON: `{success: true, vault_state: "UNLOCKED"}`.  
   - Outputs: Estado Vault. Log: Integra en sentinel_core si auth-related.  
   - Telemetry: No directo; `active: true` en streams relacionados (e.g., sentinel_core).  
   - Falla: Abort si locked (crítico para auth/keys).

6. **Fase 6: Control Plane (~2-3s)**  
   - Acción: `bootControlPlane` spawnea Node.js `server-bootstrap.js` via `StartNodeProcess`.  
   - Env/Args: `BLOOM_USER_ROLE=Master`, `BLOOM_VAULT_STATE=UNLOCKED`, `BLOOM_WORKER_RUNNING=true`, `BLOOM_SIMULATION_MODE=false`, `BLOOM_LOGS_DIR=logs`. Script: `bin/bootstrap/server-bootstrap.js` (usa Node en `bin/node/node.exe` o PATH).  
   - Verificación: Sleep 3s para readiness.  
   - Outputs: PID Node, WS: `ws://localhost:4124` (via `WebSocketManager.start()`), API: `http://localhost:48215` (via `startAPIServer`), Swagger: `http://localhost:48215/api/docs`. Logs: `logs/server/websocket_*.log` y `api_*.log`.  
   - Telemetry: Registro en JS: `--stream control_plane_websocket --label "🔌 WEBSOCKET SERVER" --path <log> --priority 2`; similar para `control_plane_api`.  
   - Falla: "control plane start failed" (crítico; e.g., Node no encontrado).  
   - Detalles Internos (de server-bootstrap.js): Valida env (exit si Vault locked/Worker down), inicializa `HeadlessUserManager` (storage: `LOCALAPPDATA/BloomNucleus/users`), graceful SIGINT shutdown. Actualiza telemetry atomic via lockfile.

**Post-Boot Global**: 
- Monitoreo: Goroutines por proc (detecta exit → state FAILED/STOPPED, update telemetry via re-registro CLI).
- Outputs Éxito: `[SUCCESS] ✅ Nucleus ready` + métricas (boot time, PIDs, ports). JSON: `{success: true, boot_time_seconds: 8.5, components: {...}, ollama_pid: X, ...}`.
- Logging/Telemetry: Apps llaman `nucleus telemetry register` post-start (idempotente). Ejemplo del JSON adjunto: Streams como `brain_core` (priority 2, path: `logs/brain/core/brain_core_20260216.log`), `sentinel_core` (priority 1, active: true). Conductor poll cada 5s para freshness (`last_update` > 5min → stale alert).
- Shutdown: `Shutdown(ctx)` → Reverse order (Control Plane → Ollama → Worker → Temporal), signals + 10s wait. Flush logs + optional re-registro para `last_update` final.

## Componentes Levantados por Supervisor
Todos gestionados en `s.processes` (map con `ManagedProcess`: Name, PID, State, LogPath). Estados: IDLE → STARTING → READY/DEGRADED → STOPPING → STOPPED/FAILED. Cada uno registra stream en `telemetry.json` (priority: 1=crítico como Sentinel, 2=core como Brain, 3=aux como Ollama/Build).

| Componente | Rol en Nucleus/BTIPS | Puerto/Endpoint | Dependencias | Estado Esperado | Logs/Telemetry (Ejemplo del JSON) |
|------------|----------------------|-----------------|--------------|-----------------|-----------------------------------|
| **Temporal Server** | Orquestador workflows (Synapse perfiles, intents). Persistencia: `logs/temporal/temporal.db`. | gRPC:7233, UI:8233 | Ninguna (root). | READY (SERVING). | `logs/temporal/server/temporal_server_20260216.log`; stream `temporal_server` (priority:1). |
| **Worker Manager** | Ejecuta activities (e.g., seed/launch). Load-balanced. | Task Queue: profile-orchestration | Temporal UP. | CONNECTED. | `logs/nucleus/worker/worker_manager_20260216.log`; stream `worker_manager` (priority:2, active:false, last_update:"2026-02-16T11:22:03Z"). |
| **Ollama** | LLM local para intents `exp`/`inf`. | HTTP:11434 | Ninguna (async). | RUNNING. | `logs/sentinel/ollama_service_2026-02-16.log`; stream `ollama_service` (priority:3, active:true, first_seen:"2026-02-16T07:47:21-03:00"). |
| **Governance** | Valida `.ownership.json` (roles, org). | N/A (FS). | Archivo existe. | VALID (o SKIPPED). | Integra en `logs/build/nucleus_build.log`; stream `nucleus_build` (priority:3, active:true, last_update:"2026-02-16T13:07:11Z"). |
| **Vault** | Keys/auth (OAuth, firmas). | N/A (CLI). | Governance OK. | UNLOCKED. | Integra en Sentinel; verifica `active:true` en streams relacionados. |
| **Control Plane** | Puente UI-runtime (Node.js). Levanta API/WS para VSCode/Sentinel. | API:48215, WS:4124, Swagger:/api/docs | Todos previos + Node. | READY (post-3s). | `logs/server/api_*.log`, `websocket_*.log`; streams `control_plane_api/websocket` (priority:2). |
| **Brain Core/Profile/Server** (Extensión Logging) | Motor Python (intents ejecución), perfiles, server (Host C++ bridge). Event Bus para Sentinel. | 5678 (Brain), substreams para manager/event_bus. | Control Plane UP. | READY. | `logs/brain/core/brain_core_20260216.log` etc.; streams `brain_core`/`brain_profile`/`brain_server`/`brain_server_event_bus`/`brain_server_manager` (priority:2, last_update:"2026-02-16T11:17:29.*"). |
| **Sentinel Core** (Extensión Logging) | Sidecar/Event Bus (perfiles Chrome, intents side-effects). | Integra con WS 4124. | Worker UP. | ACTIVE. | `logs/sentinel/sentinel_core_2026-02-16.log`; stream `sentinel_core` (priority:1, active:true, first_seen:"2026-02-16T07:47:21-03:00"). |

- **Integración Ecosistema**: Conecta VSCode Plugin (VSSocket/HTTP → 4124/48215), Sentinel (Event Bus via WS), Brain (Python via Host C++). Soporta intents en `.bloom/.nucleus-{org}/` y Projects. Logging: Apps siguen spec (subfolders, naming lowercase_underscore_timestamp.log); no writes directos a telemetry.json.

## Sistema de Logging y Telemetry (Extensión Detallada)
Basado en `BLOOM_NUCLEUS_LOGGING_SPEC.md` y ejemplo `telemetry.json`. Estructura estricta para evitar corrupción: Root `logs/` solo con `telemetry.json` + subfolders (e.g., `brain/core/`, `sentinel/`). Naming: `module_timestamp.log` (lowercase, underscore, daily rotation). Contenido: Structured logging recomendado (JSON lines para parseo en Conductor).

- **Telemetry.json**: Índice global de streams activos. Formato: `{active_streams: {stream_id: {label: "Emoji LABEL", path: "abs_path.log", priority:1-3, first_seen?: "ISO", last_update: "ISO UTC", active?: bool}}}`. Actualización: Solo via `nucleus telemetry register --stream ID --label "Emoji" --path <log> --priority N` (idempotente, atomic lock, auto-last_update). Ejemplo adjunto muestra 9 streams (e.g., Brain substreams priority 2, Sentinel priority 1). Conductor: Poll para dashboard (e.g., tabla sortable por priority/last_update, tail paths con jq/grep).
  
- **Registro en Boot**: Post-spawn, apps llaman CLI (e.g., en server-bootstrap.js: `updateTelemetry` via subprocess a Nucleus). Si `active: false` (como worker_manager), alert en Conductor ("Restart needed").

- **Reglas Críticas para Conductor**:
  - **Lectura**: Parse JSON (fs.readFileSync); filtra por `active:true` o `last_update > now-5min`.
  - **No Modif**: Nunca writes directos; usa CLI para updates (e.g., post-shutdown).
  - **Estructura Directorios**: `logs/[app]/[sub]/module_timestamp.log` (e.g., `logs/brain/server/brain_server_event_bus_20260216.log`).
  - **Priorities**: 1=Crítico (Sentinel/Temporal), 2=Core (Brain/Worker), 3=Aux (Ollama/Build).
  - **Migración**: De patrón viejo (direct lock/json) a nuevo (CLI single-writer).
  - **Retention/Rotation**: App-specific (daily por timestamp); Conductor puede prune old paths via script.

Ejemplo Uso en Conductor: Widget "Active Streams" → Tabla de `telemetry.json` con links a logs (e.g., clic en path → open en VSCode terminal: `tail -f path`).

## Verificación de Servicios: Comando `nucleus health`
El comando `nucleus health` (en `internal/supervisor/health.go`) es el verificador integral post-boot. Orquesta `checkSystemHealth` (30s timeout), chequeando NUCLEUS SERVICES (prioridad 1) y SENTINEL SERVICES (integración). Estados globales: HEALTHY (todo OK), DEGRADED (fallos no-críticos), FAILED (críticos down). Outputs: JSON compacto o human-readable. Integra logging: Chequea paths de telemetry.json para stale logs.

### Cómo Correrlo
- **Básico**: `nucleus health` → Human-readable (logs con ✓/✗ por componente).
- **JSON**: `nucleus health --json` → `{success: true, state: "HEALTHY", components: {temporal: {healthy: true, state: "RUNNING", port: 7233}}, timestamp: X}` (exit 1 si !success).
- **Deep**: `nucleus health --json --validate` → Chequeos lentos (e.g., HTTP /health en API, parse profiles.json).
- **Específico**: `nucleus health --component temporal` → Solo uno (e.g., gRPC health).
- **Ejemplos**:
  ```
  nucleus health  # → [SUCCESS] ✅ System HEALTHY | Components: ✓ temporal: RUNNING (port 7233)
  nucleus health --json --validate  # → JSON con PIDs, profiles_count (de profiles.json)
  ```

### Qué Verifica (de health.go)
- **NUCLEUS SERVICES**:
  - Temporal: TCP 7233 + gRPC health (SERVING).
  - Worker: Conexión a queue (futuro: query Temporal); chequea `telemetry.json` path exists/active.
  - Ollama: HTTP 11434 + process PID alive (`isPIDAlive` via syscall.Signal(0)); stale si last_update >5min.
  - Control Plane: PID Node + HTTP 48215 (/documentation 200/302).
  - Vault: Estado UNLOCKED via workflow.
  - Governance: Parse `.ownership.json` válido.

- **SENTINEL SERVICES** (Integración):
  - Brain: TCP 5678 + heartbeat ping (JSON PING → response); substreams en telemetry (e.g., brain_core last_update fresh).
  - Bloom API: HTTP 48215 (/health en validate); path de log en telemetry.
  - Svelte Dev: Puerto 5173 (si dev mode).
  - Worker Manager: `config/profiles.json` (parsea profiles; READY si vacío durante install, ACTIVE si >0); cross-check con stream active.

- **Outputs Detallados** (Human-Readable):
  ```
  [SUCCESS] ✅ System HEALTHY
  [INFO]    State: HEALTHY
  [INFO]    Components:
    ✓ temporal: RUNNING (port 7233) (PID 1234)
    ✓ worker: CONNECTED (task_queue profile-orchestration) [Telemetry: active:true]
    ✓ ollama: RUNNING (port 11434) (PID 1235) [Last update: 2026-02-16T07:58:19Z]
    ✓ vault: UNLOCKED
    ✓ control_plane: READY (port 48215) (PID 1236)
    ✓ brain: READY (port 5678) [Stream: brain_core active]
  ```
- **JSON Estructura** (ComponentHealth): `{healthy: true, state: "RUNNING", pid: X, port: Y, error: "", telemetry_path: "logs/..."}`. Global: `HealthResult` con `components` map + cross-ref a telemetry.

Usa `health` en Conductor para widgets (e.g., progress bar por fase, alerts si DEGRADED o stale telemetry). Post-boot: Corre auto para onboarding ("Verifica: nucleus health --json | jq '.state' == 'HEALTHY'"). Para logs: Integra `jq .active_streams[] | select(.priority==1) | .path` para high-priority tails.

Esta doc es exhaustiva y auto-contenida—cópiala directamente al prompt del Conductor para flujos verificables (e.g., "Basado en esta secuencia + telemetry/logging, genera onboarding con polling de telemetry.json y health widgets"). Si necesitas extensiones (e.g., script para parse telemetry), avísame. ¡Listo para avanzar! 🚀