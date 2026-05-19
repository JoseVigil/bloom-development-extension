# Bloom BTIP — Documentación Técnica del Plugin VS Code

> `bloom-nucleus-installer` · versión 1.0.0 · publisher `josevigil`  
> Última revisión basada en código fuente real — mayo 2025

---

## Índice

1. [Arquitectura general del sistema Bloom](#1-arquitectura-general-del-sistema-bloom)
2. [Ciclo de vida del plugin](#2-ciclo-de-vida-del-plugin)
3. [Inicialización — orden exacto y responsabilidades](#3-inicialización--orden-exacto-y-responsabilidades)
4. [Managers del sistema](#4-managers-del-sistema)
5. [Stack de servidores](#5-stack-de-servidores)
6. [Protocolo WebSocket](#6-protocolo-websocket)
7. [El concepto Intent / BTIP](#7-el-concepto-intent--btip)
8. [IntentFormPanel — ciclo UI del intent](#8-intentformpanel--ciclo-ui-del-intent)
9. [Comandos registrados](#9-comandos-registrados)
10. [Vistas de VS Code](#10-vistas-de-vs-code)
11. [Webview SvelteKit](#11-webview-sveltekit)
12. [Configuraciones de usuario](#12-configuraciones-de-usuario)
13. [Build y empaquetado](#13-build-y-empaquetado)
14. [Dependencias clave](#14-dependencias-clave)
15. [Código legacy y deuda técnica activa](#15-código-legacy-y-deuda-técnica-activa)

---

## 1. Arquitectura general del sistema Bloom

Bloom es una plataforma de automatización AI **local-first**. El plugin VS Code es la interfaz central del desarrollador, pero convive con varios componentes que corren de forma independiente.

```
┌─────────────────────────────────────────────────────────────────┐
│                        SISTEMA BLOOM                            │
│                                                                 │
│  ┌──────────────────┐      ┌──────────────────────────────┐    │
│  │   VS Code Plugin │      │     Bootstrap (Node.js)      │    │
│  │  bloom-nucleus-  │      │  Standalone Control Plane    │    │
│  │    installer     │      │  (corre sin VS Code abierto) │    │
│  └────────┬─────────┘      └──────────────┬───────────────┘    │
│           │                               │                     │
│           │   ws://localhost:4124         │                     │
│           └───────────────┬───────────────┘                     │
│                           │                                     │
│              ┌────────────▼────────────┐                        │
│              │   WebSocketManager      │  ← Nucleus Control     │
│              │   (Singleton :4124)     │    Plane               │
│              └────────────┬────────────┘                        │
│                           │                                     │
│           ┌───────────────┼───────────────┐                     │
│           │               │               │                     │
│  ┌────────▼──────┐ ┌──────▼──────┐ ┌─────▼──────────┐         │
│  │ BloomApiServer│ │OllamaAdapter│ │  FileSystem     │         │
│  │  Fastify :48215│ │  (AI local) │ │  Watcher        │         │
│  └───────────────┘ └─────────────┘ └────────────────┘         │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Servicios externos                          │  │
│  │   Nucleus (Go binary)  ·  Brain CLI (Python/PyInstaller) │  │
│  │   Ollama  ·  GitHub OAuth  ·  Chromium (vía Cortex)      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Webview SvelteKit  :5173                    │  │
│  │   / · /genesis · /home · /intents · /onboarding          │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Componentes del ecosistema

| Componente | Tecnología | Rol |
|---|---|---|
| **Plugin VS Code** | TypeScript | Interfaz del desarrollador, Control Plane consumer |
| **Nucleus** | Go (binario) | Supervisor de servicios, orquestador |
| **Brain CLI** | Python compilado con PyInstaller | Motor de operaciones: crear intents, generar codebase, etc. |
| **Bootstrap** | Node.js standalone | Levanta WS + API cuando VS Code está cerrado |
| **Webview** | SvelteKit | UI principal en `http://localhost:5173` |
| **Ollama** | Servicio local | Inferencia AI local (único adapter conectado actualmente) |
| **Chromium** | Chromium headless | Ejecutado por Cortex bajo demanda para automatización web |

### Principio de ownership del WebSocket

El WebSocket **no pertenece al plugin**. Es inicializado por `nucleus-server` (o el Bootstrap) y existe independientemente del ciclo de vida de VS Code. El plugin actúa como cliente pasivo: se conecta al WS ya existente y transmite eventos a la UI.

---

## 2. Ciclo de vida del plugin

### Activación

El plugin se activa por cualquiera de estos eventos (definidos en `activationEvents`):

- Apertura de las vistas `bloomNucleus`, `bloomNucleusWelcome`, `bloomIntents`, `bloomProfiles`
- Ejecución de comandos específicos: `bloom.openMarkdownPreview`, `bloom.generateIntent`, `bloom.createNucleusProject`, `bloom.linkToNucleus`, `bloom.syncNucleusProjects`, `bloom.showWelcome`, `bloom.manageProfiles`, `bloom.openIntentInBrowser`, `bloom.startGitHubOAuth`, `bloom.createIntentDev`

### Shutdown

La desactivación es pasiva. Toda la limpieza ocurre via `context.subscriptions` — cada componente se registra con un objeto `{ dispose: () => ... }` en subscriptions durante la inicialización. No hay lógica crítica en `deactivate()`.

```typescript
// Patrón de registro de cleanup:
context.subscriptions.push({
    dispose: () => wsManager.stop()
});
```

### Modo degradado (sin workspace)

Si VS Code se abre sin ningún workspace folder, el plugin registra únicamente `bloom.resetRegistration` y retorna sin inicializar el stack completo. Esto protege contra errores en rutas de archivos que asumen workspace.

---

## 3. Inicialización — orden exacto y responsabilidades

El orden es **crítico** y está documentado en `extension.ts`. Alterar la secuencia rompe dependencias.

```
activate()
│
├── [0/7] BrainExecutor.initialize()
│         Verifica que el binario Brain CLI esté disponible.
│         DEBE correr primero — otros subsistemas pueden llamarlo.
│
├── [1/7] initializeContext(context, logger)
│         → UserManager.init(context)   ← crea el singleton
│         → setContext('bloom.isRegistered', bool)
│         Controla qué vistas y comandos son visibles.
│
├── [2/7] initializeManagers(context, logger)
│         → GitManager.initialize(context)
│         → new MetadataManager(logger)
│         → new ContextGatherer(logger)
│         → new TokenEstimator()
│         → new ChromeProfileManager(context, logger)
│         → UserManager.init(context)   ← retorna instancia existente
│
├── [3] Verificación de workspace
│         Si no hay workspaceFolder → registerCriticalCommands() + return
│         Solo bloom.resetRegistration queda disponible.
│
├── [3/7] initializeProviders(context, workspaceFolder, logger, managers)
│         Tree providers de VS Code (bloomNucleus, bloomIntents, bloomProfiles)
│
├── [4/7] initializeServerAndUI(context, logger, managers)
│   │
│   ├── OutputChannel 'Bloom Server'
│   ├── WebSocketManager.getInstance().start()   ← :4124
│   ├── new HostExecutor(context)  ← LEGACY, ver §15
│   ├── wsManager.attachHost(hostExecutor)
│   ├── hostExecutor.start()
│   ├── new BloomApiServer({...}).start()        ← :48215
│   ├── registerStartGithubOAuthCommand(...)
│   ├── registerUICommands(...)
│   │     bloom.openUI · bloom.openApiDocs · bloom.openHome
│   │     bloom.openBTIPExplorer · bloom.executeHost
│   │     bloom.restartServers · bloom.showStatus
│   └── setupFileWatcher('**/.bloom/**/*')
│
├── [5/7] initializeProfileAccounts(context, logger, wsManager, chromeProfileManager)
│         Perfiles Chrome y cuentas AI
│
├── [6/7] registerAllCommands(context, logger, managers, providers)
│         7 categorías, ~50 comandos (ver §9)
│
└── [7/7] Notificación de éxito
          Mensaje con opciones: 'Open UI' → :5173 · 'View Docs' → :48215/api/docs
```

---

## 4. Managers del sistema

Todos los managers son inicializados en `managersInitializer.ts` y pasados como objeto `Managers` a los subsistemas que los necesitan.

### UserManager

**Singleton** via `UserManager.init(context)`. Gestiona identidad del usuario, tokens OAuth y API keys.

**Almacenamiento:**
- `globalState['bloom.user.v3']` — datos del usuario (`BloomUser`)
- `secrets['bloom.github.token']` — token GitHub (SecretStorage cifrado)
- `secrets['bloom.gemini.apiKey']` — API key Gemini (SecretStorage cifrado)

**Estructura `BloomUser`:**
```typescript
interface BloomUser {
    githubUsername: string;
    githubOrg: string;        // org principal
    allOrgs: string[];        // todas las orgs del usuario
    registeredAt: number;     // timestamp
}
```

**Migración de versiones:** El manager incluye `migrateFromV1()` que convierte datos del esquema `bloom.user.email` (v1) al esquema `bloom.user.v3`. Se limpia automáticamente en primera carga si hay datos legacy.

**Contexto VS Code:** Al guardar o limpiar usuario, ejecuta `setContext('bloom.isRegistered', bool)` para controlar visibilidad de vistas y comandos.

### MetadataManager

Lee y escribe el archivo `metadata.json` dentro de cada carpeta de intent (`.bloom/intents/<nombre>/`). Es el responsable de la persistencia de `IntentMetadata`.

### ContextGatherer

Recopila el contexto del proyecto actual para incluirlo en los intents. Usado por `bloom.copyContextToClipboard`.

### TokenEstimator

Estima tokens de un intent dado el conjunto de archivos seleccionados. Límite hardcodeado: 100.000 tokens. Calcula porcentaje de uso y dispara alertas `warning` (acercándose) o `error` (excedido).

### ChromeProfileManager

Gestiona perfiles de Chrome para la automatización AI. Cada perfil puede tener cuentas AI asociadas (Claude, ChatGPT, Grok). El navegador es lanzado por Cortex bajo demanda — no por el plugin directamente.

### GitManager

Singleton que envuelve operaciones git sobre el workspace. Usa `simple-git` internamente. Inicializado con `GitManager.initialize(context)`.

---

## 5. Stack de servidores

### WebSocketManager (:4124)

**Singleton** via `WebSocketManager.getInstance()`. El componente más crítico del sistema.

```
Propiedades:
  PORT              = 4124
  HEARTBEAT_INTERVAL = 20_000 ms (ping/pong)
  
Colecciones internas:
  clients           Set<ExtendedWebSocket>   — todos los clientes conectados
  intentSubscribers Set<ExtendedWebSocket>   — suscriptores de eventos de intents
  activeProcesses   Map<string, AIExecutionProcess>  — ejecuciones AI en curso
```

**Política de origen aceptado:**
- `vscode-webview://` — webviews de VS Code
- `localhost` / `127.0.0.1` — cualquier puerto local
- `file://` o sin origen — permitido (Bootstrap standalone)
- Todo lo demás → rechazado con log de advertencia

**Heartbeat:** Cada 20 segundos hace `ping` a todos los clientes. Si un cliente no responde con `pong` (flag `isAlive = false`), es terminado y eliminado de las colecciones.

**Gestión de procesos AI:** Cada ejecución genera un `processId` (`proc_{timestamp}_{random}`). El proceso vive en `activeProcesses` durante el streaming y se elimina al completar, cancelar o fallar. En shutdown, todos los procesos activos reciben `bloom.ai.execution.cancelled` con `reason: 'server_shutdown'`.

**Clasificación de errores:**

| Código | Condición |
|---|---|
| `AI_RATE_LIMIT` | mensaje contiene "rate limit" |
| `AI_QUOTA_EXCEEDED` | mensaje contiene "quota" |
| `AI_AUTH_FAILED` | mensaje contiene "authentication" |
| `AI_TIMEOUT` | mensaje contiene "timeout" |
| `PROCESS_CANCELLED` | mensaje contiene "cancelled" |
| `AI_EXECUTION_OLLAMA_NOT_RUNNING` | ollama + not running |
| `AI_EXECUTION_FAILED` | cualquier otro error |

Los errores con código `AI_RATE_LIMIT`, `AI_TIMEOUT`, `AI_QUOTA_EXCEEDED`, `AI_EXECUTION_OLLAMA_NOT_RUNNING` son considerados **recuperables**.

### BloomApiServer / PluginApiServer (:48215)

Servidor Fastify con Swagger UI disponible en `/api/docs`.

**Nota de nomenclatura:** Existe `src/server/PluginApiServer.ts` (wrapper legacy) y `src/api/server.ts` (implementación real con `BloomApiServer`). El plugin instancia `BloomApiServer` directamente desde `serverAndUiInitializer.ts`. `PluginApiServer.ts` es código de transición, no se usa en el path principal.

**Dependencias en construcción:**
```typescript
new BloomApiServer({
    context,
    wsManager,      // referencia al WS singleton
    outputChannel,
    port: 48215,
    userManager     // para rutas autenticadas
})
```

### FileSystemWatcher

Observa `**/.bloom/**/*` (todos los archivos dentro de la carpeta `.bloom` del workspace). Cualquier cambio, creación o eliminación:

- Dispara `wsManager.broadcast('btip:updated', { path })` en cambios/creaciones
- Dispara `wsManager.broadcast('btip:deleted', { path })` en eliminaciones
- Llama `BTIPExplorerController.notifyUpdate(path)` (legacy, ver §15)

---

## 6. Protocolo WebSocket

Versión del protocolo: `1.0.0` (definido en `contracts/websocket-protocol.js`).

**Formato de mensaje (bidireccional):**
```json
{ "event": "nombre.del.evento", "data": { ... } }
```

### Mensajes Cliente → Servidor

| Evento | Datos | Descripción |
|---|---|---|
| `bloom.ai.execution.prompt` | `{ context, text, intentId?, profileId?, metadata? }` | Iniciar ejecución AI streaming |
| `bloom.ai.execution.cancel` | `{ processId }` | Cancelar proceso AI activo |
| `subscribe_intents` | `{}` | Suscribirse a actualizaciones de intents |
| `intent:subscribe` | `{ intentId }` | Suscribirse a un intent específico |
| `ping` | `{ timestamp }` | Heartbeat manual |

**Campo `context` en prompts AI:**

| Valor | Significado |
|---|---|
| `onboarding` | Setup inicial del sistema |
| `genesis` | Inicialización única del proyecto |
| `dev` | Trabajo dentro de un intent de desarrollo |
| `doc` | Trabajo dentro de un intent de documentación |

### Mensajes Servidor → Cliente

| Evento | Datos | Disparado por |
|---|---|---|
| `bloom.ai.execution.connected` | `{ clientId, timestamp }` | Conexión establecida |
| `bloom.ai.execution.stream_start` | `{ processId, context, intentId, timestamp, cancellable }` | Inicio de streaming |
| `bloom.ai.execution.stream_chunk` | `{ processId, context, intentId, sequence, chunk }` | Fragmento de respuesta AI |
| `bloom.ai.execution.stream_end` | `{ processId, context, intentId, timestamp, total_chunks, total_chars }` | Fin de streaming |
| `bloom.ai.execution.cancelled` | `{ processId, reason }` | Proceso cancelado (`user_request` o `server_shutdown`) |
| `bloom.ai.execution.error` | `{ processId, error_code, details }` | Error en ejecución |
| `btip:updated` | `{ path }` | Archivo `.bloom/**` modificado/creado |
| `btip:deleted` | `{ path }` | Archivo `.bloom/**` eliminado |
| `subscribed` | `{ type: 'intents', timestamp }` | Confirmación de suscripción |
| `intent:subscribed` | `{ intentId, timestamp }` | Confirmación de suscripción a intent |
| `pong` | `{ timestamp }` | Respuesta a ping manual |
| `error` | `{ message }` | Error genérico |

### Flujo de ejecución AI (secuencia completa)

```
Cliente                          WebSocketManager                    OllamaAdapter
   │                                    │                                 │
   │──bloom.ai.execution.prompt────────>│                                 │
   │                                    │──executePrompt()───────────────>│
   │<──stream_start─────────────────────│                                 │
   │                                    │<─────────────chunk──────────────│
   │<──stream_chunk (seq=1)─────────────│                                 │
   │<──stream_chunk (seq=2)─────────────│                                 │
   │            ...                     │            ...                  │
   │<──stream_end───────────────────────│                                 │
   │                                    │                                 │
   │  (alternativa: cancel)             │                                 │
   │──bloom.ai.execution.cancel────────>│                                 │
   │                                    │──cancelProcess(processId)──────>│
   │<──bloom.ai.execution.cancelled─────│                                 │
```

---

## 7. El concepto Intent / BTIP

Un **Intent** es la unidad de trabajo central de Bloom. Representa una tarea de desarrollo o documentación con toda la información necesaria para que un modelo AI la ejecute: descripción del problema, contexto de código, archivos relevantes y preguntas de refinamiento.

**BTIP** (Bloom Task Intent Protocol) es el nombre del protocolo/formato que estructura los intents.

### Estructura en disco

Cada intent se persiste como una carpeta dentro del workspace:

```
.bloom/
└── intents/
    └── <nombre-del-intent>/
        ├── intent.bl          ← Descripción en markdown estructurado
        ├── codebase.bl        ← Código fuente concatenado (free tier)
        │   o codebase.tar.gz ← Archivo comprimido (pro tier)
        └── metadata.json      ← IntentMetadata completa
```

### Ciclo de vida (workflow stages)

```
draft
  │  Usuario completa el formulario y hace submit
  ▼
intent-generated
  │  Se generaron preguntas de refinamiento
  ▼
questions-ready
  │  Usuario respondió las preguntas
  ▼
answers-submitted
  │  Se descargó el snapshot de la respuesta AI
  ▼
snapshot-downloaded
  │  El snapshot fue integrado al codebase
  ▼
integrated
```

### El archivo intent.bl

Generado determinísticamente por `IntentGenerator` (sin llamada a AI). Contiene:

```markdown
# <nombre del intent>

**Generado:** <fecha>
**Bloom Version:** 1.0.0

---

## Problema
<descripción del problema>

## Comportamiento Actual
1. <item>
2. <item>

## Comportamiento Deseado
1. <item>
2. <item>

## Salida Esperada del Modelo
<descripción>

## Consideraciones
<texto libre opcional>

## Archivos Incluidos
Total: N archivo(s)
- `path/al/archivo.ts`
- `path/al/otro.ts`

---

**Nota:** Este archivo fue generado automáticamente por Bloom.
```

### Estructura de metadata completa (IntentMetadata)

```typescript
{
    id: string;              // UUID del intent
    name: string;            // slug del nombre (kebab-case)
    displayName: string;     // nombre con mayúsculas para UI
    status: 'draft' | 'in-progress' | 'completed' | 'archived';
    projectType?: 'android' | 'ios' | 'react-web' | 'web' | 'node' |
                  'python-flask' | 'php-laravel' | 'nucleus' | 'generic';
    version: 'free' | 'pro';
    aiProvider?: 'claude' | 'grok' | 'chatgpt' | 'gemini';
    aiAccountId?: string;
    profileId?: string;      // perfil Chrome asociado
    createdAt: string;
    updatedAt: string;

    files: {
        intentFile: 'intent.bl';
        codebaseFile: 'codebase.bl' | 'codebase.tar.gz';
        filesIncluded: string[];   // paths relativos al workspace
        filesCount: number;
        totalSize: number;         // bytes
    };

    content: {
        problem: string;
        expectedOutput: string;
        currentBehavior: string[];
        desiredBehavior: string[];
        considerations: string;
    };

    tokens: {
        estimated: number;
        limit: 100000;       // hardcoded
        percentage: number;
    };

    workflow: {
        stage: IntentWorkflowStage;
        questions: Question[];          // preguntas de refinamiento
        questionsArtifactUrl?: string;
        snapshotPath?: string;
        integrationStatus?: 'pending' | 'in-progress' | 'success' | 'failed';
        integrationReport?: {
            filesCreated: string[];
            filesModified: string[];
            conflicts: string[];
        };
    };

    stats: {
        timesOpened: number;
        lastOpened: string | null;
        estimatedTokens: number;
    };

    bloomVersion: string;
    nucleusId?: string;
    projectId?: string;
}
```

### Tipos de intent

| Tipo | Descripción |
|---|---|
| `dev` | Intent de desarrollo — modifica código |
| `doc` | Intent de documentación — solo lectura del código |

### Preguntas de refinamiento (Questions)

Cada question tiene:
- `category`: `architecture | design | implementation | testing | security`
- `priority`: `high | medium | low`
- `answerType`: `multiple-choice | free-text | boolean | code-snippet`
- `options[]`: para multiple-choice
- `userAnswer`: respuesta del usuario

---

## 8. IntentFormPanel — ciclo UI del intent

`IntentFormPanel` es el WebviewPanel principal para crear y editar intents. Carga una UI custom (`out/ui/intent/intentForm.html`) con su CSS y JS inlineados.

### Modos de operación

**Modo creación** (`isEditMode = false`):
1. Crea carpeta temporal `.bloom/intents/temp_{timestamp}`
2. Inicia `IntentSession.create()`
3. Al submit: renombra carpeta temporal a `.bloom/intents/<nombre>`

**Modo edición** (`isEditMode = true`):
1. Carga intent existente via `IntentSession.forIntent(intentName)`
2. Puebla el formulario con datos existentes
3. Al submit: llama `session.regenerateIntent(data)`

### Mensajes Webview → Plugin (onDidReceiveMessage)

| Comando | Acción |
|---|---|
| `submit` | Valida, genera codebase.bl + intent.bl, cierra panel |
| `cancel` | Cierra panel sin guardar |
| `openFileInVSCode` | Abre archivo en editor con `ViewColumn.Beside` |
| `copyFilePath` | Copia path absoluto al clipboard |
| `revealInFinder` | Ejecuta `revealFileInOS` |
| `removeFile` | Solicita confirmación y remueve archivo del intent |
| `autoSave` | Encola auto-guardado en la sesión |
| `deleteIntent` | Confirma y elimina la carpeta del intent completa |
| `intentDevCreate` | Crea intent DEV via Brain CLI |

### Mensajes Plugin → Webview (postMessage)

| Comando | Datos |
|---|---|
| `loadExistingIntent` | `{ name, content, status }` |
| `setFiles` | `files[]` con `{ filename, fullPath, relativePath }` |
| `updateTokens` | `{ estimated, limit, percentage }` |
| `validationErrors` | `errors[]` |
| `error` | `message` |
| `intents:created` | `{ id, name, uid, profileId, aiProvider, url }` |
| `intentDevCreateResponse` | `{ ok, name, uid, path, url, summary }` o `{ ok, error, stderr }` |

### Generación del codebase

El plugin tiene dos estrategias para generar `codebase.bl`, controladas por la configuración `bloom.useCustomCodebaseGenerator`:

**Generador nativo (default):** TypeScript puro. Lee cada archivo via `vscode.workspace.fs.readFile` y concatena en markdown con bloques de código fenced.

**Brain CLI (opcional):** Llama `BrainExecutor.generateCodebase()` con `mode: 'codebase'`. Si falla, hace fallback al generador nativo automáticamente.

### Validación de tokens

Antes de generar, el panel verifica `tokenEstimation.error`. Si el intent excede el límite de 100.000 tokens, bloquea el submit con un error visible. Los warnings (acercándose al límite) permiten continuar.

---

## 9. Comandos registrados

### Tabla completa de comandos

| Comando | Título | Categoría | Keybinding | Menú |
|---|---|---|---|---|
| `bloom.openMarkdownPreview` | Open Markdown Preview | Intent | — | — |
| `bloom.generateIntent` | Generate New Intent | Intent | — | Explorer context |
| `bloom.openIntent` | Open Intent | Intent | — | bloomIntents item |
| `bloom.copyContextToClipboard` | Copy Context to Clipboard | Intent | — | bloomIntents item |
| `bloom.deleteIntent` | Delete Intent | Intent | — | bloomIntents item |
| `bloom.addToIntent` | Add to Intent | Intent | — | Explorer context |
| `bloom.deleteIntentFromForm` | Delete Current Intent | Intent | — | — |
| `bloom.openFileInVSCode` | Open File in VSCode | Intent | — | — |
| `bloom.revealInFinder` | Reveal in Finder/Explorer | Intent | — | — |
| `bloom.copyFilePath` | Copy File Path | Intent | — | — |
| `bloom.createBTIPProject` | Create BTIP Project | Intent | — | Explorer context (folder) |
| `bloom.generateQuestions` | Generate Questions | Intent | — | — |
| `bloom.submitAnswers` | Submit Answers to Claude | Intent | — | — |
| `bloom.reloadIntentForm` | Reload Intent Form | Intent | — | — |
| `bloom.regenerateContext` | Regenerate Project Context | Intent | — | Command Palette (con workspace) |
| `bloom.integrateSnapshot` | Integrate Snapshot | Intent | — | — |
| `bloom.createNucleus` | Create Nucleus | Nucleus/BrainCLI | `ctrl+alt+n` / `cmd+alt+n` | Command Palette |
| `bloom.createNucleusProject` | Crear Nucleus | Nucleus | `ctrl+alt+n` / `cmd+alt+n` | bloomNucleus title, Command Palette |
| `bloom.linkToNucleus` | Link to Nucleus | Nucleus | — | Explorer context (folder), Command Palette |
| `bloom.unlinkFromNucleus` | Unlink from Nucleus | Nucleus | — | — |
| `bloom.unlinkNucleus` | Unlink Nucleus | Nucleus | — | bloomNucleus title |
| `bloom.openNucleusProject` | Open Nucleus Project | Nucleus | — | bloomNucleus item (nucleusProject) |
| `bloom.syncNucleusProjects` | Sync Nucleus Projects | Nucleus | — | bloomNucleus title |
| `bloom.addProjectToNucleus` | Agregar Proyecto | Nucleus | — | bloomNucleus item inline (nucleusOrg) |
| `bloom.reviewPendingCommits` | Revisar Commits Pendientes | Git | — | — |
| `bloom.refreshNucleus` | Refresh Nucleus | Nucleus | — | bloomNucleus title |
| `bloom.manageProfiles` | Manage Chrome Profiles | Profiles | `ctrl+alt+m` / `cmd+alt+m` | bloomProfiles title, Command Palette |
| `bloom.refreshProfiles` | Refresh Profiles | Profiles | — | bloomProfiles title |
| `bloom.addAiAccount` | Add AI Account | Profiles | — | bloomProfiles item inline, Command Palette |
| `bloom.checkAiAccounts` | Check AI Accounts | Profiles | — | bloomProfiles item, Command Palette |
| `bloom.checkSpecificAiAccount` | Check Specific AI Account | Profiles | — | bloomProfiles item (ai-account) |
| `bloom.configureIntentProfile` | Configure Intent Profile | Profiles | — | bloomIntents item |
| `bloom.changeIntentProfile` | Change Intent Profile | Profiles | — | — |
| `bloom.removeIntentProfile` | Remove Intent Profile | Profiles | — | — |
| `bloom.openIntentInBrowser` | Open Intent in Browser | Profiles | `ctrl+shift+b` / `cmd+shift+b` (editorFocus) | bloomIntents item |
| `bloom.openClaudeInBrowser` | Open Claude in Browser | Profiles | — | — |
| `bloom.openChatGPTInBrowser` | Open ChatGPT in Browser | Profiles | — | — |
| `bloom.openGrokInBrowser` | Open Grok in Browser | Profiles | — | — |
| `bloom.startGitHubOAuth` | Authenticate with GitHub | Auth | `ctrl+alt+g` / `cmd+alt+g` | Command Palette |
| `bloom.showWelcome` | Mostrar Bienvenida | UI | — | Command Palette |
| `bloom.openUI` | (registrado en serverAndUiInitializer) | UI | — | — |
| `bloom.openApiDocs` | (registrado en serverAndUiInitializer) | UI | — | — |
| `bloom.openHome` | (registrado en serverAndUiInitializer) | UI | — | — |
| `bloom.openBTIPExplorer` | (registrado en serverAndUiInitializer) | UI | — | — |
| `bloom.restartServers` | (registrado en serverAndUiInitializer) | UI | — | — |
| `bloom.showStatus` | (registrado en serverAndUiInitializer) | UI | — | — |
| `bloom.createIntent` | (Brain CLI directo) | BrainCLI | — | — |
| `bloom.createIntentDev` | Create Intent DEV (Draft) | BrainCLI | — | Explorer context |
| `bloom.resetRegistration` | Reset Registration (Debug) | Debug | — | Command Palette |

### Condiciones `when` por menú

**`view/title`** (botones en cabecera de vista):

| Comando | Vista | Condición extra |
|---|---|---|
| `bloom.refreshProfiles` | `bloomProfiles` | — |
| `bloom.manageProfiles` | `bloomProfiles` | — |
| `bloom.unlinkNucleus` | `bloomNucleus` | — |
| `bloom.refreshNucleus` | `bloomNucleus` | — |
| `bloom.createNucleusProject` | `bloomNucleus` | `bloom.isRegistered` |
| `bloom.syncNucleusProjects` | `bloomNucleus` | `bloom.isRegistered` |

**`explorer/context`** (clic derecho en Explorer):

| Comando | Condición |
|---|---|
| `bloom.generateIntent` | Carpeta o archivo |
| `bloom.createIntentDev` | Carpeta o archivo |
| `bloom.addToIntent` | Carpeta o archivo |
| `bloom.createBTIPProject` | Solo carpeta |
| `bloom.linkToNucleus` | Solo carpeta |

**`view/item/context`** (clic derecho en items de vista):

| Comando | Vista | viewItem |
|---|---|---|
| `bloom.addProjectToNucleus` | `bloomNucleus` | `nucleusOrg` (inline) |
| `bloom.openIntent` | `bloomIntents` | `intent` |
| `bloom.copyContextToClipboard` | `bloomIntents` | `intent` |
| `bloom.configureIntentProfile` | `bloomIntents` | `intent` |
| `bloom.openIntentInBrowser` | `bloomIntents` | `intent` |
| `bloom.deleteIntent` | `bloomIntents` | `intent` |
| `bloom.openNucleusProject` | `bloomNucleus` | `nucleusProject` |
| `bloom.addAiAccount` | `bloomProfiles` | `profile` (inline) |
| `bloom.checkAiAccounts` | `bloomProfiles` | `profile` |
| `bloom.checkSpecificAiAccount` | `bloomProfiles` | `ai-account` |

---

## 10. Vistas de VS Code

El plugin registra un Activity Bar container (`bloomAiBridge`, ícono `$(flame)`, título "Bloom Nucleus BTIPS") con cuatro vistas:

### bloomProfiles — "Chrome Profiles"

**Siempre visible.** Muestra los perfiles de Chrome disponibles y las cuentas AI asociadas a cada uno.

Items de árbol:
- `profile` — un perfil Chrome. Acción inline: `bloom.addAiAccount`
- `ai-account` — cuenta AI dentro de un perfil. Acción: `bloom.checkSpecificAiAccount`

Botones en cabecera: `bloom.refreshProfiles`, `bloom.manageProfiles`.

### bloomNucleusWelcome — "Nucleus" (no registrado)

**Visible cuando `!bloom.isRegistered`.** Muestra mensaje de bienvenida con botón para iniciar GitHub OAuth.

Contenido welcome estático:
```
Bienvenido a Bloom Nucleus

Para comenzar, completá tu registro gratuito.
[Conectar con GitHub](command:bloom.showWelcome)
```

### bloomNucleus — "Nucleus / Organization Projects" (registrado)

**Visible cuando `bloom.isRegistered`.** Muestra la jerarquía de proyectos Nucleus del workspace.

Items de árbol:
- `nucleusOrg` — organización. Acción inline: `bloom.addProjectToNucleus`
- `nucleusProject` — proyecto dentro de la org. Acción: `bloom.openNucleusProject`

Botones en cabecera: `bloom.unlinkNucleus`, `bloom.refreshNucleus`, `bloom.createNucleusProject` (si registrado), `bloom.syncNucleusProjects` (si registrado).

Mensaje vacío cuando `bloom.isRegistered && workspaceFolderCount > 0`:
```
No hay ningún Nucleus detectado en este workspace.
[Crear Nucleus](command:bloom.showWelcome)
```

### bloomIntents — "Intents"

**Siempre visible.** Lista todos los intents del workspace actual (carpetas dentro de `.bloom/intents/`).

Items de árbol:
- `intent` — un intent. Menú contextual: `bloom.openIntent`, `bloom.copyContextToClipboard`, `bloom.configureIntentProfile`, `bloom.openIntentInBrowser`, `bloom.deleteIntent`

---

## 11. Webview SvelteKit

La interfaz principal corre en `http://localhost:5173` (dev) o como build estático. Está en `webview/app/` y es independiente del plugin — puede operar con el Bootstrap standalone.

### Rutas disponibles

| Ruta | Descripción |
|---|---|
| `/` | Root — muestra `<SystemStatus />` |
| `/genesis` | Inicialización única del proyecto |
| `/home` | Dashboard principal |
| `/intents` | Listado y gestión de intents |
| `/onboarding` | Setup inicial del usuario |
| `/welcome` | Pantalla de bienvenida pre-registro |

### Stores de estado

#### `websocketStore` (`stores/websocket.ts`)

Store principal de comunicación. Gestiona la conexión WS, reconexión automática y dispatching de eventos.

```typescript
interface WebSocketState {
    connected: boolean;
    reconnecting: boolean;
    activeContext: 'onboarding' | 'genesis' | 'dev' | 'doc' | null;
    activeIntentId: string | null;
    streaming: boolean;
    chunks: string[];     // fragmentos acumulados del stream actual
}
```

**Reconexión automática:** Si la conexión se cierra, espera 3 segundos y reintenta. Se cancela si se llama `disconnect()` explícitamente.

**Suscripción a eventos:** `websocketStore.on(event, callback)` permite que componentes se suscriban a eventos específicos sin depender del store reactivo. Útil para efectos secundarios (ej. actualizar la lista de intents cuando llega `btip:updated`).

**API pública:**
```typescript
websocketStore.connect(url?)          // conectar a ws://localhost:4124
websocketStore.disconnect()           // desconectar y limpiar
websocketStore.send(event, data?)     // enviar mensaje
websocketStore.sendAIPrompt(context, text, intentId?)  // shorthand para AI
websocketStore.on(event, callback)    // suscribir a evento específico
websocketStore.onUpdate(callback)     // suscribir a btip:updated / intents:updated
websocketStore.clearChunks()          // limpiar buffer de streaming
```

#### `intentsStore` (`stores/intents.ts`)

```typescript
interface IntentsState {
    list: Intent[];
    current: Intent | null;
    wizardState: 'briefing' | 'questions' | 'refinement';
    nucleusPath: string;
}
```

**API pública:**
- `intentsStore.load(nucleusPath?)` — carga lista via `$lib/api.listIntents()`
- `intentsStore.loadIntent(id, nucleusPath)` — carga intent individual
- `intentsStore.createNew()` — inicializa un intent vacío en memoria con 5 preguntas placeholder
- `intentsStore.setWizardState(state)` — navega entre fases del wizard
- `intentsStore.addTurn(intentId, turn)` — agrega turno al intent actual (simula respuesta AI con timeout de 1s)
- `intentsStore.finalize(intentId, nucleusPath)` — finaliza via `$lib/api.finalizeIntent()`

### Módulo `ws.ts` (`lib/ws.ts`)

Thin wrapper sobre `websocketStore` que expone funciones simples para uso en componentes:

```typescript
connectWebSocket(url?)           // → websocketStore.connect()
disconnectWebSocket()            // → websocketStore.disconnect()
onWebSocketEvent(event, cb)      // → websocketStore.on()
sendWebSocketMessage(event, data?) // → log (implementación incompleta)
```

> **Nota:** `sendWebSocketMessage` actualmente solo hace `console.log`. Para enviar mensajes usar `websocketStore.send()` directamente.

### Comunicación plugin ↔ webview interna de VS Code

Para el WebviewPanel de `intentFormPanel` (no el webview SvelteKit standalone), la comunicación usa la API de mensajes de VS Code:

```
Plugin → Webview:  panel.webview.postMessage({ command, ...data })
Webview → Plugin:  vscode.postMessage({ command, ...data })
                   capturado por panel.webview.onDidReceiveMessage()
```

---

## 12. Configuraciones de usuario

Accesibles en VS Code Settings bajo la sección "Bloom" (`bloom.*`).

| Propiedad | Tipo | Default | Descripción |
|---|---|---|---|
| `bloom.version` | `"free" \| "pro"` | `"free"` | Tier del plugin. Pro usa `codebase.tar.gz` en lugar de `codebase.bl` |
| `bloom.gitPath` | `string` | `""` | Path absoluto al ejecutable git. Vacío = autodetección |
| `bloom.pythonPath` | `string` | `"python3"` | Ejecutable Python para scripts internos |
| `bloom.useCustomCodebaseGenerator` | `boolean` | `false` | Si `true`, usa Brain CLI para generar `codebase.bl` en lugar del generador nativo TypeScript. Hace fallback al nativo si Brain CLI falla |
| `bloom.claudeApiKey` | `string` | `""` | API Key de Claude. Alternativa: variable de entorno `ANTHROPIC_API_KEY` |
| `bloom.claudeModel` | `enum` | `"claude-3-sonnet-20240229"` | Modelo Claude. Opciones: `claude-3-opus-20240229`, `claude-3-sonnet-20240229` |
| `bloom.autoUpdateTree` | `boolean` | `true` | Actualizar `tree.txt` automáticamente después de cambios en el workspace |
| `bloom.nucleusAutoDetect` | `boolean` | `true` | Detectar y mostrar proyectos Nucleus automáticamente al abrir workspace |
| `bloom.github.clientId` | `string` | `""` | Client ID de la GitHub OAuth App |
| `bloom.github.clientSecret` | `string` | `""` | Client Secret de la GitHub OAuth App (almacenado en settings, no en SecretStorage) |

> **Seguridad:** `bloom.github.clientSecret` está en `settings.json` en texto plano. Para producción considerar migrar a `context.secrets`. Los tokens de usuario sí usan SecretStorage correctamente.

---

## 13. Build y empaquetado

### Pipeline completo

```
npm run build
   │
   ├── compile
   │     tsc -p ./
   │     Compila TypeScript → out/
   │
   ├── copy-assets
   │     Copia src/ui/ → out/ui/
   │     (HTML, CSS, JS del IntentFormPanel)
   │
   └── build:bundle
         node installer/bootstrap/bundle-bootstrap.js
         Genera el Bootstrap standalone
```

### Publicación del .vsix

```
npm run vscode:prepublish
   │   (compile + copy-assets + build:bundle)
   │
npm run package:vscode
   │   vsce package --out installer/vscode/bloom-extension.vsix
   │
   └── Output: installer/vscode/bloom-extension.vsix
```

### Scripts adicionales relevantes

| Script | Descripción |
|---|---|
| `npm run watch` | Compilación TypeScript incremental |
| `npm run watch:webview` | Dev server SvelteKit en :5173 |
| `npm run build:webview` | Build de producción del webview |
| `npm run installer:dev` | Dev del instalador Electron |
| `npm run package:installer` | Build del instalador completo |
| `npm run test` | Ejecuta `test-installation.js` |
| `npm run rebuild` | `clean` + `build` completo |

### Contenido del .vsix

El `.vsix` incluye:
- `out/` — TypeScript compilado (extensión principal)
- `out/ui/` — Assets del IntentFormPanel (HTML/CSS/JS)
- `installer/bootstrap/` — Bootstrap bundleado (Control Plane standalone)
- `node_modules/` — dependencias de runtime

**No incluye:**
- `webview/app/` — el webview SvelteKit se sirve externamente en :5173
- Binario `brain` — se descarga/instala por separado
- Binario Nucleus (Go) — componente externo independiente

### Relación con el sistema de build de Nucleus

El plugin referencia `build-all.py` (sistema del monorepo Nucleus) para builds coordinados de todos los componentes. El `package:vscode` es una pieza de ese pipeline mayor.

---

## 14. Dependencias clave

### Runtime

| Paquete | Versión | Rol |
|---|---|---|
| `ws` | ^8.18.3 | WebSocket server (`WebSocketManager`). Elegido sobre la API nativa de vscode por control total del servidor y soporte headless |
| `fastify` | ^5.6.2 | API HTTP del plugin. Más rápido que Express, tipado nativo, plugin ecosystem |
| `@fastify/cors` | ^11.2.0 | CORS para requests desde el webview SvelteKit en :5173 |
| `@fastify/swagger` | ^9.6.1 | Generación de spec OpenAPI desde las rutas Fastify |
| `@fastify/swagger-ui` | ^5.2.3 | Serve de Swagger UI en `/api/docs` |
| `chokidar` | ^3.6.0 | Watcher de archivos alternativo (disponible pero el watcher activo usa `vscode.workspace.createFileSystemWatcher`) |
| `simple-git` | ^3.30.0 | Operaciones git en TypeScript para `GitManager` |
| `@octokit/rest` | ^22.0.1 | GitHub API client para OAuth y operaciones de repositorio |
| `proper-lockfile` | ^4.1.2 | Lock de archivos para evitar condiciones de carrera en writes concurrentes |
| `marked` | ^12.0.0 | Renderizado de markdown (para preview de `intent.bl`) |
| `marked-gfm-heading-id` | ^3.1.3 | Plugin de marked para IDs en headings (navegación) |
| `uuid` | ^9.0.0 | Generación de IDs únicos para intents y procesos |
| `@google/generative-ai` | ^0.24.1 | SDK de Gemini AI (adapter disponible, pendiente de integración al WS) |
| `fs-extra` | ^11.2.0 | Operaciones de filesystem extendidas (copy recursivo, ensureDir, etc.) |
| `unzipper` | ^0.12.3 | Descompresión de archivos (snapshots, distribución de binarios) |
| `module-alias` | ^2.2.3 | Alias `@` → `out/` para imports absolutos en runtime |

### Dev

| Paquete | Rol |
|---|---|
| `esbuild` | Bundler del Bootstrap standalone |
| `typescript` | Compilador TypeScript |
| `zod` | Validación de schemas (usado en rutas API) |
| `sinon` | Mocking para tests |

---

## 15. Código legacy y deuda técnica activa

Esta sección documenta componentes que existen en el código pero no forman parte del sistema activo. Importante para nuevos desarrolladores: **no invertir tiempo en estos componentes sin confirmar primero que están en el roadmap de remoción o rehabilitación.**

### HostExecutor (legacy — no activo)

**Archivo:** `installer/host/HostExecutor.ts`  
**Estado:** Instanciado en `serverAndUiInitializer.ts` pero el componente que debía usar (bloom-host.exe) ya no existe.  
**Historia:** Estaba destinado a ejecutar un proceso host local. La funcionalidad fue absorbida por Cortex/Chromium bajo demanda.  
**Impacto actual:** Se inicia (`hostExecutor.start()`) pero no tiene efecto observable. El comando `bloom.executeHost` existe pero no tiene utilidad real.  
**Acción recomendada:** Remover de `serverAndUiInitializer.ts` y eliminar el comando.

### BTIPExplorerController (legacy — no activo)

**Archivo:** `src/server/BTIPExplorerController.ts`  
**Estado:** Referenciado en `serverAndUiInitializer.ts` (FileSystemWatcher lo llama) y en `bloom.openBTIPExplorer`.  
**Historia:** Era un WebviewPanel para navegar intents directamente en VS Code. Reemplazado por la arquitectura workspace + webview SvelteKit.  
**Impacto actual:** `BTIPExplorerController.notifyUpdate(path)` se llama en cada cambio de `.bloom/` pero probablemente no tiene efecto si el panel no está abierto.  
**Acción recomendada:** Remover las referencias del FileSystemWatcher y eliminar el comando `bloom.openBTIPExplorer`.

### PluginApiServer.ts (legacy — wrapper innecesario)

**Archivo:** `src/server/PluginApiServer.ts`  
**Estado:** Existe pero no se usa en el path de inicialización actual.  
**Historia:** Wrapper del `BloomApiServer`. `serverAndUiInitializer.ts` instancia `BloomApiServer` directamente.  
**Acción recomendada:** Eliminar el archivo.

### getSystemContract() / getDefaultContract() en WebSocketManager

**Estado:** Métodos definidos con contratos de sistema por contexto (`onboarding`, `genesis`, `dev`, `doc`) pero nunca invocados en el flujo de ejecución.  
**Historia:** Probablemente de una integración anterior con un adapter de Claude directo donde el prompt incluía el contrato del sistema.  
**Impacto actual:** Código muerto.  
**Acción recomendada:** Remover ambos métodos o mover a un módulo de contratos si se reintegran con adapters no-Ollama.

### ws-events.ts

**Archivo:** `src/types/ws-events.ts`  
**Estado:** Archivo vacío. El contrato formal está en `contracts/websocket-protocol.js`.  
**Acción recomendada:** Eliminar o poblar con los tipos TypeScript equivalentes al protocolo.

### sendWebSocketMessage en ws.ts (webview)

**Archivo:** `webview/app/src/lib/ws.ts`  
**Estado:** Función exportada que solo hace `console.log`. No envía nada.  
**Acción recomendada:** Implementar usando `websocketStore.send()` o eliminar si no se usa.

### intentsStore.addTurn — respuesta AI simulada

**Archivo:** `webview/app/src/stores/intents.ts`  
**Estado:** `addTurn()` simula una respuesta AI con un `setTimeout` de 1 segundo que responde "Processing your request...". No hay integración real con el WS aquí.  
**Acción recomendada:** Reemplazar con suscripción a `bloom.ai.execution.stream_*` vía `websocketStore`.

---

*Documento generado a partir de código fuente real. Secciones pendientes de archivos no compartidos: rutas detalladas de la API Fastify, `src/ai/` adapters, `src/strategies/`, `src/core/contextGatherer.ts`, `src/initialization/providersInitializer.ts`.*
