# Control Plane Bootstrap — Documentación Técnica

> **Archivo fuente:** `installer/bootstrap/server-bootstrap.js`  
> **Artefacto de runtime:** `installer/native/bin/bootstrap/bundle.js`  
> **Lanzado por:** Nucleus (`internal/supervisor/service.go → bootControlPlane()`)

---

## Índice

1. [Por qué existe este archivo](#1-por-qué-existe-este-archivo)
2. [El problema que resuelve: independencia de VS Code](#2-el-problema-que-resuelve-independencia-de-vs-code)
3. [Pipeline: de fuente a runtime](#3-pipeline-de-fuente-a-runtime)
4. [Mapa de componentes que levanta](#4-mapa-de-componentes-que-levanta)
5. [Función por función](#5-función-por-función)
   - 5.1 [resolveAppDataDir — cross-platform storage](#51-resolveappdatadir--cross-platform-storage)
   - 5.2 [validateEnvironment — contrato de arranque](#52-validateenvironment--contrato-de-arranque)
   - 5.3 [updateTelemetry — registro de servicios activos](#53-updatetelemetry--registro-de-servicios-activos)
   - 5.4 [isPortOpen — port check sin bloqueo](#54-isportopen--port-check-sin-bloqueo)
   - 5.5 [startSvelteDevServer — UI dev con guard](#55-startsveltedevserver--ui-dev-con-guard)
   - 5.6 [startHeadlessFileWatcher — sincronización de filesystem](#56-startheadlessfilewatcher--sincronización-de-filesystem)
   - 5.7 [bootstrap — secuencia de arranque principal](#57-bootstrap--secuencia-de-arranque-principal)
6. [Puertos y contratos de red](#6-puertos-y-contratos-de-red)
7. [Variables de entorno — API del Control Plane](#7-variables-de-entorno--api-del-control-plane)
8. [Decisiones de diseño documentadas en el código](#8-decisiones-de-diseño-documentadas-en-el-código)
9. [Shutdown graceful](#9-shutdown-graceful)
10. [Qué sigue: componentes a documentar](#10-qué-sigue-componentes-a-documentar)

---

## 1. Por qué existe este archivo

El plugin de VS Code (`bloom-nucleus-installer`) contiene toda la lógica de negocio de Bloom: el servidor WebSocket, el servidor API Fastify, el file watcher, el gestor de usuarios. Esa lógica vive en TypeScript compilado a `out/`.

El problema es que **VS Code puede estar cerrado**. Un usuario puede estar ejecutando un Mandate largo, o tener Brain procesando un intent, o simplemente querer que el sistema siga corriendo mientras trabaja en otra cosa. Reiniciar todo cada vez que se abre o cierra el editor es inaceptable.

`server-bootstrap.js` resuelve esto extrayendo los componentes de infraestructura del ciclo de vida de VS Code y entregándoselos a Nucleus para que los supervise de forma independiente.

```
Sin bootstrap:

  VS Code abierto  → servicios activos
  VS Code cerrado  → servicios muertos
                     Brain no tiene a quién notificar
                     Mandates en curso quedan en limbo

Con bootstrap:

  VS Code abierto  → plugin + servicios activos
  VS Code cerrado  → Nucleus mantiene bundle.js vivo
                     WebSocket sigue escuchando
                     API sigue respondiendo
                     File watcher sigue notificando
  VS Code vuelve   → plugin se reconecta a los servicios existentes
```

---

## 2. El problema que resuelve: independencia de VS Code

Bloom es "local first". Eso significa que la computadora del desarrollador es el centro de ejecución, no un servidor remoto. Pero también significa que el sistema tiene que ser robusto frente a algo tan básico como cerrar el editor.

La arquitectura que hace esto posible tiene tres capas:

```
┌─────────────────────────────────────────────────────────┐
│  CAPA 1: Nucleus (Go binary)                            │
│  Supervisor de procesos. Lanza, monitorea y reinicia    │
│  los servicios. Nunca muere (corre como servicio del    │
│  sistema operativo).                                    │
│                          │                              │
│                          │ bootControlPlane()           │
│                          ▼                              │
│  CAPA 2: bundle.js (este bootstrap compilado)           │
│  El Control Plane. Mantiene vivos:                      │
│  - WebSocket server (puerto 4124)                       │
│  - API Fastify (puerto 48215)                           │
│  - File watcher (.bloom/)                               │
│  - HeadlessUserManager                                  │
│                          │                              │
│                          │ (opcional, solo en dev)      │
│                          ▼                              │
│  CAPA 3: Svelte dev server (puerto 5173)                │
│  La webview. Solo en desarrollo — en producción la UI   │
│  es estática y no requiere este proceso.                │
└─────────────────────────────────────────────────────────┘

VS Code Plugin se conecta a bundle.js como un cliente más,
igual que lo haría la Webview o el Brain Server.
```

---

## 3. Pipeline: de fuente a runtime

Este archivo tiene **tres roles distintos** dependiendo del contexto, documentados explícitamente en el header del archivo:

```
server-bootstrap.js (fuente)
        │
        ├── ROL 1: BUILD ENTRY POINT
        │   esbuild lo toma como entrada
        │   Resuelve los requires de out/:
        │     - ../../out/server/WebSocketManager
        │     - ../../out/api/server
        │     - ../../out/managers/HeadlessUserManager
        │   Produce: bundle.js (standalone, sin deps externas)
        │   Destino: installer/native/bin/bootstrap/bundle.js
        │
        ├── ROL 2: REFERENCIA NATIVA
        │   build-all.py copia este archivo a installer/native/bin/bootstrap/
        │   Solo como referencia — no se ejecuta desde ahí
        │
        └── ROL 3: RUNTIME (vía bundle.js)
            Nucleus lanza bundle.js directamente
            NUNCA lanza server-bootstrap.js
            Ver: internal/supervisor/service.go → bootControlPlane()
```

**En desarrollo** (sin build):
```bash
# Setear NODE_PATH para que los requires resuelvan contra out/
NODE_PATH=<repo>/out node installer/bootstrap/server-bootstrap.js
```

**En producción**:
```bash
# Nucleus lo hace automáticamente al iniciar el Control Plane
node installer/native/bin/bootstrap/bundle.js
```

---

## 4. Mapa de componentes que levanta

```
bootstrap() arranca en orden:
                                                    
  1. validateEnvironment()
     Lee env vars y falla rápido si el estado es inválido
                │
                ▼
  2. WebSocketManager.getInstance()
     Singleton — si el plugin ya lo instanció, reutiliza
     Puerto: 4124
     Protocolo: ws-events.ts / websocket-protocol.ts
                │
                ▼
  3. HeadlessUserManager({ storageDir })
     Gestión de usuarios sin dependencia de VS Code API
     Lee/escribe en: AppData/BloomNucleus/users/
                │
                ▼
  4. wsManager.start()
     WebSocket server escuchando
     updateTelemetry('control_plane_websocket', ...)
                │
                ▼
  5. startAPIServer({ wsManager, userManager, port: 48215 })
     Fastify server con todas las rutas
     Swagger disponible en /api/docs
     updateTelemetry('control_plane_api', ...)
                │
                ▼
  6. startHeadlessFileWatcher(wsManager)
     Chokidar watch en .bloom/**/*
     Broadcast via WebSocket cuando hay cambios
                │
                ▼
  7. startSvelteDevServer()   ← solo si el puerto 5173 está libre
     Spawn de `npm run dev` en webview/app/
     Solo relevante en modo desarrollo
```

---

## 5. Función por función

### 5.1 `resolveAppDataDir` — cross-platform storage

```javascript
function resolveAppDataDir() {
  if (process.env.LOCALAPPDATA) return process.env.LOCALAPPDATA;
  const home = os.homedir();
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support');
  }
  return path.join(home, '.local', 'share');
}
```

**Por qué existe:** El directorio de datos de aplicación tiene convenciones distintas en cada plataforma. `LOCALAPPDATA` es exclusivo de Windows. En macOS la convención es `~/Library/Application Support`. En Linux es `~/.local/share`.

**Resultado por plataforma:**

| Plataforma | Resultado | Ejemplo |
|---|---|---|
| Windows | `%LOCALAPPDATA%` | `C:\Users\user\AppData\Local` |
| macOS | `~/Library/Application Support` | `/Users/user/Library/Application Support` |
| Linux | `~/.local/share` | `/home/user/.local/share` |

Todo lo que el bootstrap persiste (usuarios, telemetría, logs) vive bajo `APP_DATA/BloomNucleus/`.

---

### 5.2 `validateEnvironment` — contrato de arranque

Esta función define el **contrato mínimo** que Nucleus debe satisfacer antes de lanzar el bootstrap. Si no se cumplen las condiciones, el proceso termina con exit code 1 antes de hacer cualquier otra cosa.

**Variables requeridas:**

```javascript
const REQUIRED_ENV = [
  'BLOOM_VAULT_STATE',    // Estado del vault: 'LOCKED' o 'UNLOCKED'
  'BLOOM_WORKER_RUNNING'  // Si el Temporal worker está conectado
];
```

**Lógica de validación:**

```
BLOOM_VAULT_STATE === 'LOCKED'
    → exit(1) inmediato
    → Razón: el vault contiene credenciales. Si está locked,
      ninguna operación de AI puede ejecutarse de todas formas.
      No tiene sentido levantar el Control Plane.

BLOOM_WORKER_RUNNING === 'false'
    → WARNING, NO exit(1)
    → Razón: hay una condición de carrera legítima. Go puede
      lanzar bundle.js antes de que el Temporal worker termine
      de conectarse. Si hacíamos exit(1) acá, el health check
      de Nucleus relanzaba bundle.js, que volvía a fallar →
      loop infinito de crashes.
    → Solución: arrancar en modo degradado. Las rutas que
      necesitan el worker fallan con su propio error específico,
      que es más informativo que un crash de arranque.

BLOOM_USER_ROLE no seteado
    → Se asigna 'pre-onboarding' como default
    → Razón: el rol solo se conoce después de que el usuario
      crea o se une a una organización. El Control Plane debe
      estar corriendo ANTES de que eso pueda ocurrir.
```

**Variables opcionales que loguea:**

| Variable | Default | Propósito |
|---|---|---|
| `BLOOM_USER_ROLE` | `'pre-onboarding'` | Rol del usuario en la organización |
| `BLOOM_SIMULATION_MODE` | `'false'` | Modo simulación para testing |

---

### 5.3 `updateTelemetry` — registro de servicios activos

```javascript
async function updateTelemetry(streamId, data) { ... }
```

Escribe en `AppData/BloomNucleus/logs/telemetry.json` el estado de cada servicio activo. Se llama dos veces durante el arranque:
- Una vez cuando el WebSocket server está listo
- Una vez cuando el API server está listo

**Por qué usa `proper-lockfile`:**

El archivo `telemetry.json` puede ser leído y escrito simultáneamente por:
- bundle.js (el bootstrap, este proceso)
- El plugin de VS Code (cuando VS Code está abierto)
- El Conductor (Electron)
- Herramientas de diagnóstico

Sin lock, las escrituras concurrentes corrompen el JSON. `proper-lockfile` crea un archivo `.lock` adjacent que actúa como semáforo entre procesos.

**Estructura del telemetry.json:**

```json
{
  "active_streams": {
    "control_plane_websocket": {
      "label": "🔌 WEBSOCKET SERVER",
      "path": ".../logs/server/websocket_1234567890.log",
      "priority": 2,
      "pid": 12345,
      "port": 4124,
      "state": "READY",
      "last_update": "2025-05-19T10:30:00.000Z"
    },
    "control_plane_api": {
      "label": "📡 API SERVER",
      "path": ".../logs/server/api_1234567890.log",
      "priority": 2,
      "pid": 12345,
      "port": 48215,
      "state": "READY",
      "last_update": "2025-05-19T10:30:01.000Z"
    }
  }
}
```

Este archivo es la fuente de verdad que usa el Conductor (Electron) para mostrar el estado de los servicios en su UI.

---

### 5.4 `isPortOpen` — port check sin bloqueo

```javascript
function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(500);
    // connect → puerto ocupado (alguien escucha)
    // timeout / error → puerto libre
    socket.connect(port, 'localhost');
  });
}
```

Intenta conectarse por TCP al puerto especificado en localhost con timeout de 500ms.

- `connect` exitoso → `resolve(true)` — hay alguien escuchando
- `timeout` o `error` → `resolve(false)` — puerto libre

Se usa exclusivamente para el guard del Svelte dev server (ver siguiente sección). No tira excepciones — siempre resuelve.

---

### 5.5 `startSvelteDevServer` — UI dev con guard

Esta función tiene dos correcciones de bugs críticos documentadas en los comentarios del código. Ambas son errores que solo aparecen en condiciones específicas de producción.

**Corrección 1 — Guard de puerto (EADDRINUSE):**

```
Problema:
  Nucleus (Go) ya lanza el Svelte dev server antes de lanzar bundle.js.
  Sin el guard, bundle.js intentaba hacer spawn de un segundo proceso npm.
  Resultado: EINVAL bajo NSSM, o EADDRINUSE si llegaba a bindear.

Solución:
  await isPortOpen(5173)
  Si ya hay algo escuchando → log + return null (no spawnar)
  Si está libre → spawnar normalmente
```

**Corrección 2 — `detached: false` (EINVAL en Windows bajo NSSM):**

```
Problema:
  spawn('npm.cmd', ..., { detached: true, stdio: 'ignore' }) falla con
  error -4071 EINVAL en Windows cuando el proceso padre fue iniciado
  por NSSM (sin terminal asignada).
  
  Es un bug de Node.js en Win32: detached + stdio:ignore en un proceso
  sin consola = EINVAL. Bug conocido del runtime, no del código.

Solución:
  detached: false
  El spawn funciona correctamente. Svelte sobrevive al padre igual
  porque Go lo lanzó con CREATE_NEW_PROCESS_GROUP.
```

**Localización del directorio de Svelte:**

```javascript
// Prioridad 1: BLOOM_DIR (apunta directamente a la raíz del repo)
// Prioridad 2: path.dirname(BLOOM_NUCLEUS_PATH)
// Si ninguno está seteado: warning + return null
const svelteDir = path.join(repoRoot, 'webview', 'app');
```

Verifica que `vite.config.ts` existe en ese directorio antes de intentar el spawn.

---

### 5.6 `startHeadlessFileWatcher` — sincronización de filesystem

```javascript
function startHeadlessFileWatcher(wsManager) {
  const bloomDir = path.join(BLOOM_NUCLEUS_PATH, '.bloom');
  const watcher = chokidar.watch(`${bloomDir}/**/*`, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 }
  });
  // ...
}
```

Monitorea todo el directorio `.bloom/` del proyecto activo y emite eventos WebSocket cuando algo cambia.

**Eventos emitidos:**

| Evento chokidar | Evento WebSocket | Payload |
|---|---|---|
| `change` | `btip:updated` | `{ path: filePath }` |
| `add` | `btip:updated` | `{ path: filePath }` |
| `unlink` | `btip:deleted` | `{ path: filePath }` |

**Por qué `awaitWriteFinish`:**

Los intents se escriben en JSON. Un archivo JSON grande puede escribirse en múltiples flushes al disco. Sin `awaitWriteFinish`, chokidar dispara el evento `change` en el primer flush, cuando el archivo todavía está incompleto y el JSON es inválido. `stabilityThreshold: 200` espera 200ms sin actividad antes de disparar el evento — garantiza que el archivo está completo.

**Quién consume estos eventos:**

- La Webview SvelteKit (actualiza la vista de intents en tiempo real)
- El plugin de VS Code si está abierto (refresca el tree provider)
- Cualquier otro cliente WebSocket conectado (Brain, herramientas externas)

---

### 5.7 `bootstrap` — secuencia de arranque principal

```javascript
async function bootstrap() {
  validateEnvironment();                          // 1. Falla rápido
  
  const wsManager = WebSocketManager.getInstance();  // 2. Singleton
  const userManager = new HeadlessUserManager({...}); // 3. Sin VS Code API
  
  await wsManager.start();                        // 4. WebSocket en 4124
  await updateTelemetry('control_plane_websocket', ...);
  
  const apiServer = await startAPIServer({...});  // 5. Fastify en 48215
  await updateTelemetry('control_plane_api', ...);
  
  startHeadlessFileWatcher(wsManager);            // 6. Chokidar en .bloom/
  await startSvelteDevServer();                   // 7. Svelte en 5173 (dev)
  
  // SIGINT handler para shutdown graceful
}
```

Un punto importante: `bootstrap().catch(err => { process.exit(1) })`. Cualquier error no capturado en la secuencia de arranque termina el proceso con exit 1, que Nucleus detecta y decide si relanzar o escalar el error.

---

## 6. Puertos y contratos de red

| Puerto | Servicio | Protocolo | Quién se conecta |
|---|---|---|---|
| `4124` | WebSocket server | `ws://` | Webview SvelteKit, plugin VS Code, Brain |
| `48215` | API Fastify | `http://` | Webview, plugin, Brain, herramientas externas |
| `48215/api/docs` | Swagger UI | `http://` | Desarrolladores, para inspección del contrato |
| `5173` | Svelte dev server | `http://` | Browser del desarrollador (solo dev) |

**Por qué el puerto 48215:**

Puerto alto no privilegiado, poco probable de colisionar con otros servicios comunes. En macOS/Linux los puertos < 1024 requieren root — usar un puerto alto elimina esa dependencia.

**Por qué separar WebSocket (4124) de HTTP (48215):**

La Webview necesita comunicación bidireccional en tiempo real (eventos de intents, estado de Nucleus). HTTP/REST es bueno para operaciones CRUD pero malo para streaming de eventos. Tener un servidor WebSocket dedicado permite:
- Broadcast a todos los clientes conectados sin polling
- Reconexión automática transparente
- Eventos tipados vía el protocolo definido en `contracts/websocket-protocol.ts`

---

## 7. Variables de entorno — API del Control Plane

Nucleus (Go) setea estas variables antes de lanzar bundle.js. Son el contrato entre el supervisor y el proceso que supervisa.

| Variable | Requerida | Valores | Descripción |
|---|---|---|---|
| `BLOOM_VAULT_STATE` | ✅ Sí | `LOCKED` / `UNLOCKED` | Estado del vault de credenciales |
| `BLOOM_WORKER_RUNNING` | ✅ Sí | `true` / `false` | Si el Temporal worker está conectado |
| `BLOOM_USER_ROLE` | ❌ No | `master` / `specialist` / `pre-onboarding` | Rol del usuario en la org |
| `BLOOM_SIMULATION_MODE` | ❌ No | `true` / `false` | Modo simulación (testing) |
| `BLOOM_LOGS_DIR` | ❌ No | Path absoluto | Directorio de logs (default: `AppData/BloomNucleus/logs`) |
| `BLOOM_NUCLEUS_PATH` | ❌ No | Path absoluto | Raíz del proyecto activo (para file watcher y Svelte) |
| `BLOOM_DIR` | ❌ No | Path absoluto | Raíz del repo Bloom (alternativa a BLOOM_NUCLEUS_PATH) |
| `LOCALAPPDATA` | ❌ No | Path absoluto | Solo Windows — provisto por el SO |

---

## 8. Decisiones de diseño documentadas en el código

El `server-bootstrap.js` es inusual porque documenta explícitamente sus propias correcciones. Cada comentario `CORRECCIÓN:` marca un bug que existió en producción y fue resuelto. Vale la pena entenderlos:

### Por qué no hacer exit(1) si BLOOM_WORKER_RUNNING es false

```
Bug original:
  bundle.js arrancaba → rechazaba si el worker no estaba
  → Nucleus detectaba crash → relanzaba bundle.js
  → volvía a rechazar → loop infinito

Fix:
  Arrancar siempre en modo degradado
  Loguear warning claro
  Las rutas que necesitan el worker retornan su propio error
  No hacer exit(1) por una condición de carrera transitoria
```

### Por qué el Svelte spawn usa `detached: false`

```
Bug original:
  detached: true + stdio: 'ignore' + padre iniciado por NSSM
  = error -4071 EINVAL en Win32
  
  Causa raíz: Node.js en Windows, al intentar desvincular un proceso
  hijo sin terminal en un proceso padre que tampoco tiene terminal
  (como los servicios de NSSM), falla con EINVAL. Es un bug conocido
  del binario node.exe en Win32, no del código de usuario.

Fix:
  detached: false resuelve el spawn
  Svelte sobrevive igual porque fue el propio Go quien lo lanzó
  con CREATE_NEW_PROCESS_GROUP
```

### Por qué WebSocketManager es un Singleton

```
Tanto el plugin de VS Code como el bootstrap necesitan la misma
instancia del WebSocketManager. Si cada uno creara la suya,
habría dos servidores compitiendo por el mismo puerto.

El Singleton garantiza que el primero que arrange "gana" el puerto.
El segundo (el plugin de VS Code) obtiene la instancia existente
y se suscribe a ella en lugar de crear una nueva.
```

---

## 9. Shutdown graceful

```javascript
process.on('SIGINT', async () => {
  if (fileWatcher) fileWatcher.close();     // Detiene chokidar
  if (svelteServer) svelteServer.kill();    // Mata el proceso Svelte
  await wsManager.stop();                   // Cierra conexiones WS
  await apiServer.close();                  // Graceful shutdown Fastify
  process.exit(0);
});
```

El orden importa:
1. Primero el file watcher — para de generar eventos nuevos
2. Luego Svelte — no depende de los servers
3. Luego WebSocket — cierra conexiones existentes ordenadamente
4. Último Fastify — espera terminar requests en curso antes de cerrar

En Windows, Nucleus envía una señal equivalente a SIGINT cuando decide detener el Control Plane. En macOS/Linux, es SIGINT o SIGTERM.

---

## 10. Qué sigue: componentes a documentar

Este archivo es solo la superficie. Cada componente que levanta tiene su propia lógica interna:

| Componente | Archivo fuente | Qué documentar |
|---|---|---|
| **WebSocketManager** | `src/server/WebSocketManager.ts` | Protocolo de mensajes, broadcast, reconexión, autenticación de clientes |
| **PluginApiServer / startAPIServer** | `src/api/server.ts` | Rutas Fastify, schemas, middleware, Swagger config |
| **HeadlessUserManager** | `src/managers/HeadlessUserManager.ts` | Diferencias con userManager, almacenamiento, qué puede hacer sin VS Code |
| **Rutas de la API** | `src/api/routes/*.ts` | Cada endpoint, sus parámetros, respuestas y side effects |
| **File watcher → intent sync** | Chokidar + `intentAutoSaver.ts` | Ciclo de escritura, lockfile, formato del JSON de intent |
| **UI: IntentForm** | `src/ui/intent/intentFormPanel.ts` | El panel más importante del plugin — cómo se crea y edita un intent |
| **Selección de archivos de contexto** | `src/core/filePackager.ts` + `BTIPExplorerController.ts` | Cómo el usuario elige qué código ve el AI |
| **Generación de intent** | `src/core/intentGenerator.ts` | El pipeline completo de AI → intent estructurado |

La próxima entidad natural a documentar es **WebSocketManager** — es el hub de comunicación de todo el sistema y el bootstrap ya lo dejó corriendo.

---

*Documento técnico de implementación. Complementa el BTIPS conceptual (v5.0). No reemplaza — profundiza.*
