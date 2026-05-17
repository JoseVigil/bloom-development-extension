# Bloom Bootstrap — Documentación de Arquitectura

> **Versión del documento:** v1.0 — Mayo 2026  
> **Bootstrap build actual:** 53 (ver `bootstrap.meta.json`)  
> **Estado:** Activo en Windows. Migración a Darwin (macOS) en curso.

---

## Índice

1. [¿Qué es el Bootstrap y por qué existe?](#1-qué-es-el-bootstrap-y-por-qué-existe)
2. [El problema que resuelve](#2-el-problema-que-resuelve)
3. [Componentes del Bootstrap](#3-componentes-del-bootstrap)
4. [Flujo completo: de fuente a ejecución](#4-flujo-completo-de-fuente-a-ejecución)
5. [Cómo Nucleus lanza el Bootstrap](#5-cómo-nucleus-lanza-el-bootstrap)
6. [Variables de entorno requeridas](#6-variables-de-entorno-requeridas)
7. [Puertos y servicios que levanta](#7-puertos-y-servicios-que-levanta)
8. [Health checks del sistema](#8-health-checks-del-sistema)
9. [Diferencias Windows vs Darwin](#9-diferencias-windows-vs-darwin)
10. [Empaquetado y versionado](#10-empaquetado-y-versionado)
11. [Guía de desarrollo local](#11-guía-de-desarrollo-local)
12. [Errores frecuentes y soluciones](#12-errores-frecuentes-y-soluciones)

---

## 1. ¿Qué es el Bootstrap y por qué existe?

El Bootstrap es el **Control Plane** del sistema Bloom. Es un proceso Node.js independiente que:

- Corre **fuera de VS Code** — no necesita que el editor esté abierto para funcionar
- Levanta el WebSocket Server (puerto 4124) y el API Server (puerto 48215)
- Actúa de **puente** entre el plugin de VS Code y el backend Go (Nucleus)
- Es gestionado y supervisado por Nucleus como un proceso hijo

**La razón de su existencia:** El plugin de VS Code contiene servidores que necesitan estar disponibles como servicios del sistema, independientemente del estado del editor. Si VS Code se cierra, el Control Plane debe seguir corriendo para que Nucleus pueda seguir operando.

```
┌─────────────────────────────────────────────────────────────┐
│                      Sistema Bloom                          │
│                                                             │
│  ┌──────────────┐     WebSocket      ┌───────────────────┐  │
│  │  VS Code     │◄──── :4124 ────────│                   │  │
│  │  Plugin      │                    │   Bootstrap       │  │
│  │  (extensión) │◄──── HTTP :48215 ──│   (bundle.js)    │  │
│  └──────┬───────┘                    │                   │  │
│         │                            └─────────┬─────────┘  │
│         │ vscode API                           │ spawnea    │
│         ▼                                      ▼            │
│  ┌──────────────┐                    ┌───────────────────┐  │
│  │  Webview     │                    │   Nucleus (Go)    │  │
│  │  SvelteKit   │                    │   supervisor      │  │
│  │  :5173       │                    │   service.go      │  │
│  └──────────────┘                    └───────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. El problema que resuelve

### El desafío original

El plugin de VS Code (`bloom-development-extension`) tiene módulos TypeScript compilados en `out/` que incluyen:
- `WebSocketManager` — servidor de WebSocket en tiempo real
- `startAPIServer` — servidor HTTP/REST (Fastify) con Swagger
- `HeadlessUserManager` — gestión de usuarios sin interfaz gráfica

Estos módulos se compilaron originalmente para correr **dentro del host de VS Code**. Eso creaba una dependencia crítica: si VS Code no estaba abierto, los servidores no corrían.

### La solución Bootstrap

`server-bootstrap.js` importa esos mismos módulos compilados y los corre **de forma standalone**, sin VS Code. El truco es que el módulo `vscode` es interceptado en tiempo de build y reemplazado por un objeto vacío:

```js
// bundle-bootstrap.js — aliasPlugin
build.onResolve({ filter: /^vscode$/ }, () => ({
  path: 'vscode-stub',
  namespace: 'vscode-stub',
}));
build.onLoad({ filter: /.*/, namespace: 'vscode-stub' }, () => ({
  contents: 'module.exports = {};',
  loader: 'js',
}));
```

El resultado es `bundle.js` — un archivo autocontenido que Nucleus puede lanzar con un simple `node bundle.js`.

---

## 3. Componentes del Bootstrap

### 3.1 `server-bootstrap.js` — La fuente canónica

**Ubicación:** `installer/bootstrap/server-bootstrap.js`  
**Rol:** Entry point del bundle. Es el único archivo fuente del Control Plane bootstrap.

**Responsabilidades:**
1. **Validación de entorno** — verifica variables antes de arrancar
2. **Inicialización del WebSocketManager** — singleton, puerto 4124
3. **Inicialización del API Server** — Fastify con Swagger, puerto 48215
4. **HeadlessFileWatcher** — observa `.bloom/` con Chokidar y emite eventos WebSocket
5. **Svelte Dev Server** — guard de puerto 5173, spawna si no corre (solo en desarrollo)
6. **Telemetría** — registra streams en `telemetry.json` via `proper-lockfile`
7. **SIGINT handler** — shutdown graceful

### 3.2 `bundle-bootstrap.js` — El bundler

**Ubicación:** `installer/bootstrap/bundle-bootstrap.js`  
**Rol:** Script de build que produce `bundle.js` usando esbuild.

**Cómo funciona:**
- Toma `server-bootstrap.js` como entry point
- Resuelve los `require()` de `out/` hacia los módulos compilados del repo
- Aplica el `aliasPlugin` para interceptar `vscode` → objeto vacío
- Produce un único archivo autocontenido en `installer/native/bin/bootstrap/bundle.js`

**Alias resueltos:**
| Import en fuente | Resuelto a |
|---|---|
| `../../out/server/WebSocketManager` | `out/server/WebSocketManager.js` |
| `../../out/api/server` | `out/api/server.js` |
| `../../out/managers/HeadlessUserManager` | `src/managers/HeadlessUserManager.ts` |
| `vscode` | Objeto vacío (stub) |

### 3.3 `bootstrap.meta.json` — Metadata del build

```json
{
  "name": "Bloom Bootstrap",
  "version": "1.0.0",
  "build_number": 53,
  "build_date": "2026-05-15T15:43:28Z",
  "files": ["bundle.js", "bundle.js.map", "server-bootstrap.js"]
}
```

### 3.4 `version-bootstrap.py` — Versionado automático

Incrementa `build_number` en `bootstrap.meta.json` y en el archivo `VERSION`.

```bash
python version-bootstrap.py             # incrementa build_number
python version-bootstrap.py --set-version 1.2.0  # cambia versión semántica
python version-bootstrap.py --dry-run   # solo muestra sin escribir
```

---

## 4. Flujo completo: de fuente a ejecución

### Fase BUILD

```
[npm run build]
      │
      ├── tsc -p ./                     → compila TypeScript → out/
      ├── copy-assets                  → copia out/ui desde src/ui
      └── build:bundle
            │
            └── node installer/bootstrap/bundle-bootstrap.js
                      │
                      ├── ENTRY: installer/bootstrap/server-bootstrap.js
                      ├── ALIAS: resuelve out/ + vscode stub
                      ├── esbuild bundle (Node18, CJS, sourcemap)
                      └── OUTPUT: installer/native/bin/bootstrap/bundle.js
```

### Fase DEPLOY

El instalador copia `installer/native/bin/` al directorio de datos de la aplicación:

| Sistema | Destino |
|---|---|
| Windows | `%LOCALAPPDATA%\BloomNucleus\bin\` |
| macOS | `~/Library/Application Support/BloomNucleus/bin/` |

La estructura esperada en `bin/`:
```
bin/
├── bootstrap/
│   └── bundle.js          ← el Control Plane
├── node/
│   └── node[.exe]         ← Node.js empaquetado (o sistema)
├── nucleus/
│   └── nucleus[.exe]      ← el binario Go
├── temporal/
│   └── temporal[.exe]     ← Temporal Server
└── brain/
    └── brain[.exe]        ← Brain Server (Python/PyInstaller)
```

### Fase RUNTIME

```
[nucleus service start]
      │
      └── bootControlPlane() en service.go
                │
                ├── bundleScript = bin/bootstrap/bundle.js
                ├── nodePath = resolveNodeBin(binDir)
                ├── Inyecta variables de entorno
                ├── exec.CommandContext(ctx, nodePath, bundleScript)
                └── Espera puerto 48215 (hasta 8s)
```

---

## 5. Cómo Nucleus lanza el Bootstrap

### El método `bootControlPlane` en `service.go`

Este es el código central que conecta Go con Node.js:

```go
func (s *Supervisor) bootControlPlane(ctx context.Context, simulation bool) (*ManagedProcess, error) {
    bundleScript := filepath.Join(s.binDir, "bootstrap", "bundle.js")
    nodePath := resolveNodeBin(s.binDir)

    env := []string{
        "BLOOM_USER_ROLE=" + os.Getenv("BLOOM_USER_ROLE"),
        "BLOOM_VAULT_STATE=UNLOCKED",
        "BLOOM_WORKER_RUNNING=true",
        fmt.Sprintf("BLOOM_SIMULATION_MODE=%t", simulation),
        "BLOOM_LOGS_DIR=" + s.logsDir,
        "BLOOM_NUCLEUS_PATH=" + os.Getenv("BLOOM_NUCLEUS_PATH"),
        "BLOOM_DIR=" + getBloomDir(),
    }

    cmd := exec.CommandContext(ctx, nodePath, bundleScript)
    cmd.Env = append(os.Environ(), env...)
    // stdout/stderr → logs/nucleus/control_plane/nucleus_control_plane_YYYYMMDD.log
}
```

**Puntos clave:**
- Usa `exec.CommandContext` con el contexto de boot (timeout 120s)
- El proceso queda **registrado como ManagedProcess** en el supervisor
- Si el proceso muere, `monitorProcess()` lo detecta y actualiza estado
- NO existe watchdog automático para el Control Plane (a diferencia del Worker)
- Recuperación manual vía `nucleus service restart-bootstrap`

### El flujo completo de `dev-start` (desarrollo)

`dev_start.go` orquesta el arranque completo en 7 fases:

| Fase | Servicio | Puerto | Crítico |
|---|---|---|---|
| 1 | Temporal Server (`nucleus temporal ensure`) | 7233 | ✅ Sí |
| 2 | Worker Manager (`nucleus worker start`) | — | ✅ Sí |
| 2.5 | Brain Server (`brain service start`) | 5678 | ✅ Sí |
| 3 | Ollama (no-blocking, background) | 11434 | ⚠️ No |
| 4 | Governance (`.ownership.json`) | — | ✅ Sí |
| 5 | Vault unlock | — | ✅ Sí |
| 6 | **Control Plane (Bootstrap)** | 4124, 48215 | ⚠️ No |
| 7 | Svelte Dev Server | 5173 | ⚠️ No |

El Control Plane es "no crítico" en el sentido de que si falla, el boot no aborta. Pero en práctica es esencial para el funcionamiento del plugin.

---

## 6. Variables de entorno requeridas

El bootstrap valida en `validateEnvironment()` antes de arrancar:

### Variables requeridas (si faltan → `process.exit(1)`)

| Variable | Descripción | Valor de ejemplo |
|---|---|---|
| `BLOOM_VAULT_STATE` | Estado del vault. No puede ser `LOCKED` | `UNLOCKED` |
| `BLOOM_WORKER_RUNNING` | Si el worker Temporal está conectado | `true` |

### Variables opcionales

| Variable | Descripción | Fallback |
|---|---|---|
| `BLOOM_USER_ROLE` | Rol del usuario | `pre-onboarding` |
| `BLOOM_SIMULATION_MODE` | Modo simulación | `false` |
| `BLOOM_LOGS_DIR` | Directorio de logs | `LOCALAPPDATA/BloomNucleus/logs` |
| `BLOOM_NUCLEUS_PATH` | Path al directorio del proyecto | — |
| `BLOOM_DIR` | Raíz del repositorio | — |
| `LOCALAPPDATA` | AppData local (Windows) | Requerido en Windows |

### Comportamiento especial de `BLOOM_WORKER_RUNNING`

Si el valor es exactamente el string `"false"`, el bootstrap **arranca de todas formas en modo degradado** (no hace exit). Esto soluciona el race condition donde Go lanza bundle.js antes de que el worker esté conectado.

```
BLOOM_WORKER_RUNNING=false → ⚠️  Warning + arranque degradado
BLOOM_WORKER_RUNNING=true  → ✅ Arranque normal
(ausente o vacío)          → ✅ Arranque (modo dev sin worker)
```

---

## 7. Puertos y servicios que levanta

| Puerto | Servicio | Protocolo | Descripción |
|---|---|---|---|
| **4124** | WebSocketManager | WS | Canal bidireccional entre plugin y backend |
| **48215** | API Server (Fastify) | HTTP | REST API + Swagger UI en `/api/docs` |
| **5173** | Svelte Dev Server | HTTP | UI web (solo en desarrollo) |

### WebSocketManager (puerto 4124)

El WebSocketManager es un **singleton** (`WebSocketManager.getInstance()`). Gestiona:
- Conexiones múltiples simultáneas
- Broadcasting de eventos (`btip:updated`, `btip:deleted`)
- Alimentado por el HeadlessFileWatcher (Chokidar sobre `.bloom/`)

### API Server (puerto 48215)

Fastify con plugins:
- `@fastify/cors` — permite llamadas cross-origin
- `@fastify/swagger` + `@fastify/swagger-ui` — documentación auto-generada
- Recibe el `role` del usuario para adaptar permisos

El health check de Nucleus usa este puerto:
```go
// health.go — checkControlPlane()
resp, err := client.Get("http://127.0.0.1:48215/api/docs")
// 200, 302, 404 → RUNNING
// sin respuesta  → DISCONNECTED
```

---

## 8. Health checks del sistema

Nucleus verifica el Control Plane desde `health.go` junto con todos los demás componentes:

### Componentes monitoreados

| Componente | Puerto | Crítico | Cómo se verifica |
|---|---|---|---|
| `temporal` | 7233 | ✅ | TCP dial |
| `worker` | — | ✅ | Pollers en task-queue |
| `vault` | — | ✅ | `nucleus synapse vault-status` |
| `governance` | — | ✅ | Existencia de `.ownership.json` |
| `control_plane` | 48215 | ⚠️ | HTTP GET `/api/docs` |
| `bloom_api` | 48215 | ⚠️ | HTTP GET `/api/docs` |
| `brain_service` | 5678 | ⚠️ | TCP dial |
| `svelte_dev` | 5173 | ⚠️ | TCP dial |
| `ollama` | 11434 | ⚠️ | TCP dial |
| `worker_manager` | — | ⚠️ | Lectura de `profiles.json` |

### Estados posibles del sistema

```
HEALTHY  → todos los críticos OK, no-críticos todos OK
DEGRADED → todos los críticos OK, algún no-crítico falla
FAILED   → algún crítico falla
```

### Remediación automática (`nucleus health --fix`)

Si `control_plane` está caído, `--fix` ejecuta:
```bash
nucleus --json service restart-bootstrap
```

Esto invoca `createRestartBootstrapCmd` en `service.go`, que:
1. Mata el proceso existente (`control_plane_api`)
2. Llama `bootControlPlane()` de nuevo
3. Verifica `http://127.0.0.1:48215/api/docs` (hasta 10s)
4. Retorna JSON con `success`, `pid`, `state`

---

## 9. Diferencias Windows vs Darwin

### Paths de datos

| Sistema | AppData del app |
|---|---|
| Windows | `%LOCALAPPDATA%\BloomNucleus\` |
| macOS | `~/Library/Application Support/BloomNucleus/` |

### Resolución en el código

`health.go` ya maneja ambas plataformas:
```go
if runtime.GOOS == "windows" {
    appDataDir = filepath.Join(localAppData, "BloomNucleus")
} else {
    macOSPath := filepath.Join(home, "Library", "Application Support", "BloomNucleus")
    if _, statErr := os.Stat(filepath.Join(home, "Library")); statErr == nil {
        appDataDir = macOSPath
    } else {
        appDataDir = filepath.Join(home, ".bloom-nucleus")
    }
}
```

### Binarios

`resolveNodeBin`, `resolveNucleusBin`, `resolveTemporalBin` en `service.go` ya prueban sin extensión primero (macOS/Linux) y luego con `.exe` (Windows):
```go
candidates := []string{
    filepath.Join(binDir, "node", "node"),      // macOS / Linux
    filepath.Join(binDir, "node", "node.exe"),  // Windows
}
```

### Proceso hijo: `setSvelteProcAttr`

Este es el punto más crítico para Darwin. En Windows, NSSM tiene comportamientos especiales que causaron bugs documentados en el código (EINVAL con `detached:true`, etc.). En macOS, `setSvelteProcAttr` usa `Pdeathsig` o equivalente Unix para que el hijo sobreviva al padre.

La función está en archivos separados por plataforma:
- `service_windows.go` (no compartido aquí)  
- Buscar `setSvelteProcAttr` en el paquete `supervisor`

### Variables de entorno

En Windows, `LOCALAPPDATA` siempre existe. En macOS:
- `LOCALAPPDATA` no existe — el código usa `HOME` como fallback
- `BLOOM_LOGS_DIR` debería setearse explícitamente en macOS para evitar que el bootstrap falle al construir paths

### Punto de atención en server-bootstrap.js para Darwin

```js
// Esta línea asume Windows:
storageDir: path.join(process.env.LOCALAPPDATA, 'BloomNucleus', 'users')

// En macOS, LOCALAPPDATA es undefined → el path queda "undefined/BloomNucleus/users"
// Solución necesaria:
const appData = process.env.LOCALAPPDATA 
    || path.join(process.env.HOME, 'Library', 'Application Support');
storageDir: path.join(appData, 'BloomNucleus', 'users')
```

Esto es un **bug activo en la migración a macOS** que debe corregirse en `server-bootstrap.js` y en las referencias a `BLOOM_LOGS_DIR` dentro del mismo archivo.

---

## 10. Empaquetado y versionado

### Scripts NPM relevantes

```bash
npm run build           # compile + copy-assets + build:bundle
npm run build:bundle    # solo el bundle (sin compilar TS)
npm run build:bundle:watch  # watch mode para desarrollo del bundle
```

### Pipeline completo de publicación

```
vscode:prepublish
  ├── compile          → tsc -p ./
  ├── copy-assets      → copia src/ui → out/ui
  └── build:bundle     → genera bundle.js
```

### Proceso de versionado

```bash
python installer/bootstrap/version-bootstrap.py
# Incrementa build_number en bootstrap.meta.json y VERSION
# Imprime JSON con: version, build_number, build_date
```

La `build_date` se toma de `datetime.now(timezone.utc)` — siempre UTC.

### Ubicación final del bundle

Después del build, el archivo vive en:
```
installer/native/bin/bootstrap/bundle.js      ← producido por esbuild
installer/native/bin/bootstrap/bundle.js.map  ← sourcemap (para debug)
```

El instalador copia estos archivos al AppData del sistema.

---

## 11. Guía de desarrollo local

### Sin bundle (modo dev con NODE_PATH)

```bash
# Compilar TypeScript primero
npm run compile

# Setear NODE_PATH y correr server-bootstrap.js directamente
NODE_PATH=<repo>/out \
BLOOM_VAULT_STATE=UNLOCKED \
BLOOM_WORKER_RUNNING=true \
BLOOM_LOGS_DIR=/tmp/bloom-logs \
BLOOM_DIR=<repo> \
node installer/bootstrap/server-bootstrap.js
```

### Con bundle (modo producción local)

```bash
# 1. Compilar y generar bundle
npm run build

# 2. Lanzar como lo haría Nucleus
node installer/native/bin/bootstrap/bundle.js
```

### Watch mode del bundle

```bash
npm run build:bundle:watch
# Detecta cambios en server-bootstrap.js y módulos de out/
# Regenera bundle.js automáticamente
```

### Verificar que el Control Plane está corriendo

```bash
# Health check del API
curl http://localhost:48215/api/docs

# Health check vía Nucleus
nucleus health --component control_plane
nucleus health  # check completo del sistema
```

### Restart manual del Control Plane

```bash
nucleus service restart-bootstrap
nucleus --json service restart-bootstrap  # output JSON
```

---

## 12. Errores frecuentes y soluciones

### `Missing environment variables: BLOOM_VAULT_STATE`

**Causa:** El bootstrap fue lanzado sin las variables requeridas.  
**Solución:** Verificar que Nucleus está pasando correctamente el env en `bootControlPlane()`. Las variables van en el array `env` del `exec.CommandContext`.

### `Vault is LOCKED - cannot start control plane`

**Causa:** `BLOOM_VAULT_STATE=LOCKED` fue pasado como variable.  
**Solución:** Desbloquear el vault antes de lanzar el Control Plane, o verificar que `bootControlPlane` pasa `BLOOM_VAULT_STATE=UNLOCKED` hardcodeado (así lo hace actualmente).

### Control Plane en macOS — path `undefined/BloomNucleus/...`

**Causa:** `LOCALAPPDATA` no existe en macOS.  
**Síntoma:** El HeadlessUserManager falla al crear el directorio `storage`.  
**Solución:** Parchear `server-bootstrap.js`:
```js
const appData = process.env.LOCALAPPDATA 
    || path.join(os.homedir(), 'Library', 'Application Support');
```

### `Port 48215 not ready after 8s`

**Causa:** El bundle crasheó durante el startup (módulo faltante, error de runtime).  
**Diagnóstico:**
```bash
# Ver los últimos logs del Control Plane
tail -50 ~/Library/Application\ Support/BloomNucleus/logs/nucleus/control_plane/nucleus_control_plane_*.log
```
**Solución:** Corregir el error y relanzar con `nucleus service restart-bootstrap`.

### `EINVAL` en Windows al hacer spawn con `detached: true`

**Causa:** Bug documentado de Node.js en Win32 cuando el proceso padre fue iniciado por NSSM sin terminal.  
**Solución ya aplicada:** El código usa `detached: false` para todos los spawns del bootstrap en Windows.

### Svelte ya corriendo, bootstrap intenta lanzarlo de nuevo

**Causa:** Race condition entre Go (que lanza Svelte antes del bootstrap) y el bootstrap (que también intenta lanzarlo).  
**Solución ya aplicada:** El guard `isPortOpen(5173)` en `startSvelteDevServer()` detecta si el puerto ya está ocupado y omite el spawn.

---

## Apéndice: Relación con el plugin de VS Code

El plugin (`bloom-development-extension`) y el Bootstrap comparten el mismo repositorio y los mismos módulos compilados, pero tienen ciclos de vida independientes:

| Aspecto | Plugin VS Code | Bootstrap (bundle.js) |
|---|---|---|
| Host | VS Code Extension Host | Node.js standalone |
| Lanzamiento | VS Code al activarse | Nucleus `bootControlPlane()` |
| Acceso a `vscode` API | ✅ Completo | ❌ Stub vacío |
| Módulos compartidos | `out/server/`, `out/api/`, `out/managers/` | Los mismos |
| Persiste sin VS Code | ❌ No | ✅ Sí |
| Supervisado por Nucleus | ❌ No | ✅ Sí (`ManagedProcess`) |

El bootstrap **no reemplaza** al plugin — ambos corren en paralelo. El plugin usa la API de VS Code para la interfaz de usuario; el bootstrap provee los servidores que el plugin y el webview necesitan para comunicarse con Nucleus.
