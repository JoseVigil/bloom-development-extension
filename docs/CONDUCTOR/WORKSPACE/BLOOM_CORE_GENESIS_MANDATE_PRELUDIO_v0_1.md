# Bloom Core — Preludio del Genesis Mandate
## Estado técnico · Handoff Onboarding → Core · v0.1 · 28 de junio de 2026

> **Propósito de este documento:** registrar con precisión el estado actual del módulo Core
> antes de iniciar el desarrollo del Genesis Mandate. Es la fuente de verdad para la sesión
> de desarrollo que abre ese módulo. No contiene decisiones de diseño futuras — solo lo que
> existe, lo que falta, y las preguntas que bloquean la implementación.

---

## 1. Qué es el Genesis Mandate y por qué importa ahora

El Genesis Mandate es el primer mandate que Bloom crea para un usuario. Es el artefacto que
transforma un sistema instalado en un sistema operativo: le da al agente un contexto inicial,
un repositorio de referencia, y una identidad de proyecto desde la que operar.

Hoy el onboarding termina con `onboarding:complete` → `win.loadURL('http://localhost:3000')`.
Lo que carga en esa URL es la UI de Core — el workspace estándar post-onboarding. El Genesis
Mandate debería existir antes de que esa pantalla cargue, o la pantalla debería crearlo como
primer acto visible al usuario.

Esa decisión no está tomada. Este documento registra todo lo que se sabe para poder tomarla.

---

## 2. El handoff exacto tal como existe en el código

### 2.1 Cadena de llamadas

```
onboarding.js (renderer)
  └── completeOnboarding()
        └── window.onboarding.complete({ workspaceUrl: 'http://localhost:3000' })
              └── IPC: 'onboarding:complete'
                    └── onboarding-handlers.js
                          ├── Escribe en nucleus.json:
                          │     onboarding.completed     = true
                          │     onboarding.completed_at  = ISO timestamp
                          │     onboarding.workspace_url = 'http://localhost:3000'
                          │     onboarding.current_step  = 'success'
                          └── win.loadURL('http://localhost:3000')
```

### 2.2 Lo que nucleus.json contiene en el momento del handoff

```json
{
  "installation": {
    "completed": true
  },
  "master_profile": "<uuid>",
  "onboarding": {
    "completed":      true,
    "completed_at":   "2026-06-28T...",
    "workspace_url":  "http://localhost:3000",
    "current_step":   "success",
    "completed_steps": [
      "nucleus_create",
      "github_auth",
      "vault_init",
      "google_auth",
      "ai_provider_setup",
      "project_create"
    ]
  }
}
```

El mandate creado durante el onboarding (`onboarding:create-mandate`) **no escribe nada en
nucleus.json** — el handler solo ejecuta `nucleus --json mandate create --project <name>
--path <path>` y devuelve `{ success, result }`. No hay campo `mandate` en nucleus.json.
No hay confirmación persistida de que el mandate existe.

### 2.3 El servidor en :3000

`http://localhost:3000` es hardcodeado en el renderer (`onboarding.js` línea 987). Ese valor
se escribe en `nucleus.json` y se reutiliza en cada arranque posterior de Conductor.

El servidor en ese puerto es **responsabilidad de nucleus**, no de Conductor. Lo levanta
`nucleus dev-start` como el componente `svelte_dev`, que aparece listado en
`nucleus --json health`. El puerto nunca se lee dinámicamente del resultado de `dev-start` —
`bootServices()` en `main_conductor.js` parsea el JSON de salida pero solo extrae
`boot_time_seconds`, no el puerto de Svelte.

**Consecuencia:** si nucleus levanta Svelte en un puerto distinto de 3000 (por conflicto,
por configuración, o por plataforma), Conductor carga una pantalla en blanco sin saber por qué.

---

## 3. Estado actual del módulo Core

### 3.1 Árbol de archivos

```
workspace/
├── core/
│   ├── core.html                    ← UI del workspace estándar
│   ├── preload_core.js              ← contextBridge hacia el renderer
│   └── ipc/
│       ├── health-handlers.js       ← nucleus:health
│       └── profiles-handlers.js    ← nucleus:list-profiles, launch, create, get-installation
├── ipc/
│   └── workspace-synapse-handlers.js ← synapse:seedAndLaunch, synapse:launch
└── main_conductor.js               ← orquestador principal
```

### 3.2 Inconsistencia crítica — preload_core.js

`preload_core.js` expone `window.onboarding` — la misma API que usa el onboarding. El nombre
es incorrecto: Core no es onboarding. Peor aún, expone handlers que no tienen sentido en el
contexto post-onboarding: `launchDiscovery`, `pollIdentity`, `initNucleus`, `createMandate`
(como paso de onboarding), `markStepComplete`.

Cuando `createWorkspaceWindow` carga `core.html` con este preload, el renderer tiene acceso
a IPC de onboarding que ya no debería existir, y no tiene acceso a ningún IPC específico de
Core (`nucleus:health`, `nucleus:list-profiles`, etc.) porque esos handlers no están
expuestos en el preload.

En paralelo, `core.html` llama `window.nucleus.health()` y `window.nucleus.listProfiles()` —
pero `preload_core.js` no expone `window.nucleus`. Los llama como si existieran, pero no
existen. **Core.html está roto en su estado actual** — sus llamadas IPC nunca llegan a ningún
handler registrado.

El preload que corresponde a Core es una versión nueva que exponga `window.nucleus` (o
`window.workspace`) con los métodos correctos: `health`, `listProfiles`, `launchProfile`,
`createProfile`, `getInstallation`, y los que se agreguen para el mandate.

### 3.3 Lo que existe y funciona (en main_conductor.js)

Los handlers IPC de Core **sí están registrados** en `main_conductor.js` vía
`setupNucleusHandlers()`. El problema está exclusivamente en el preload — los handlers
existen en el main process pero el renderer no puede invocarlos porque el contextBridge no
los expone.

Handlers registrados y funcionales en el main process:

| Handler IPC | Comando nucleus | Archivo |
|---|---|---|
| `nucleus:health` | `nucleus --json health` | `health-handlers.js` |
| `nucleus:list-profiles` | `nucleus --json profile list` | `profiles-handlers.js` |
| `nucleus:launch-profile` | `nucleus --json synapse launch <id>` | `profiles-handlers.js` |
| `nucleus:create-profile` | `nucleus --json profile create --name <n>` | `profiles-handlers.js` |
| `nucleus:get-installation` | lee `nucleus.json` directamente | `profiles-handlers.js` |
| `onboarding:health` | `nucleus --json health` (5s timeout) | `main_conductor.js` inline |

El handler `nucleus:launch-profile` en `profiles-handlers.js` llama `synapse launch <id>`
**sin `--mode`**. El comando correcto post-onboarding debería especificar el modo. Sin el
flag, nucleus usa el modo por defecto — que puede ser `discovery` en lugar de `landing`,
lo cual abriría Chrome en el modo incorrecto.

### 3.4 workspace-synapse-handlers.js

Este archivo existe y está correctamente implementado. Registra `synapse:seedAndLaunch` y
`synapse:launch` como handlers IPC, y conecta el bridge al MilestoneReactor cuando se pasan
`registry` y `reactor` como opciones.

Sin embargo, `registerSynapseHandlers` **no está siendo llamado** en `main_conductor.js` en
el path de arranque de Core (modo `onboardingDone === true`). Solo se llama
`setupNucleusHandlers()`. El bridge de Synapse para el workspace estándar no se inicializa.

---

## 4. Preguntas bloqueantes para el Genesis Mandate

Estas preguntas deben responderse antes de escribir una línea de código del mandate.

### 4.1 ¿Cuándo se crea el mandate?

**Opción A — Durante el onboarding (ya implementado parcialmente):**
`onboarding:create-mandate` ya existe y llama `nucleus --json mandate create`. Si esta
llamada tiene éxito durante el onboarding, el mandate ya existe cuando Core carga. Core
solo necesita leerlo y mostrarlo.

**Opción B — Como primer acto de Core:**
Core carga, detecta que no existe ningún mandate, y lo crea como primer acto visible.
El botón "Enter System" del onboarding no crea el mandate — solo transiciona a Core,
que lo crea.

**Lo que dice el código hoy:** `createMandateAndContinue()` en `onboarding.js` llama
`onboarding:create-mandate` **antes** de llamar `onboarding:navigate({ step: 'success' })`.
Si ese IPC tiene éxito, el mandate ya fue creado. Pero no hay persistencia de confirmación
en nucleus.json, así que no hay forma de que Core sepa si el mandate existe o no.

### 4.2 ¿Qué persiste nucleus después de `mandate create`?

No se sabe. El comando `nucleus --json mandate create --project <name> --path <path>` retorna
`{ success, result }` pero no está documentado qué escribe en disco. Las preguntas concretas:

- ¿Escribe algo en `nucleus.json`? ¿En qué campo?
- ¿Crea un archivo de mandate en el directorio del proyecto?
- ¿Cómo se consulta la lista de mandates existentes? (`nucleus --json mandate list`?)
- ¿Cómo se lee el mandate activo? (`nucleus --json mandate get --active`?)

### 4.3 ¿Cuál es el puerto real de Svelte?

`http://localhost:3000` está hardcodeado. Las preguntas concretas:

- ¿`nucleus dev-start --json` incluye el puerto de Svelte en su JSON de salida?
- ¿Existe un campo en `nucleus.json` o en otro archivo de config donde nucleus persiste
  el puerto después de arrancar?
- ¿El puerto es siempre 3000 por convención o es configurable?

Si el puerto es dinámico, `bootServices()` necesita leerlo del JSON de salida y
`completeOnboarding()` necesita recibirlo en lugar de hardcodearlo.

### 4.4 ¿Qué modo usa `nucleus synapse launch` para el workspace estándar?

`profiles-handlers.js` llama `synapse launch <profileId>` sin `--mode`. Las opciones
conocidas son `discovery` y `landing`. Para el workspace post-onboarding el modo correcto
es `landing` — pero esto debe confirmarse con el CLI de nucleus.

---

## 5. Deuda técnica identificada en Core

En orden de severidad para el desarrollo del mandate:

| # | Problema | Severidad | Bloquea mandate |
|---|---|---|---|
| 1 | `preload_core.js` expone `window.onboarding` en lugar de `window.nucleus` | Crítica | Sí — Core no puede invocar IPC |
| 2 | `core.html` llama `window.nucleus.*` que no existe en el contextBridge | Crítica | Sí |
| 3 | `workspace_url` hardcodeado a `:3000` sin leer el puerto real de Svelte | Alta | Indirectamente |
| 4 | `nucleus:launch-profile` sin `--mode landing` | Alta | No directamente |
| 5 | `registerSynapseHandlers` no se llama en el path de Core | Alta | Para Synapse en workspace |
| 6 | No hay persistencia de confirmación del mandate en nucleus.json | Alta | Sí |
| 7 | `core.html` usa paleta legacy y `window.nucleus` inexistente | Media | Para la UI |
| 8 | `main_conductor.js` no importa ni llama a `registerHealthHandlers` ni `registerProfilesHandlers` desde sus archivos | A verificar | Depende de si setupNucleusHandlers los incluye |

**Nota sobre el punto 8:** `main_conductor.js` llama `setupNucleusHandlers()` que tiene los
handlers inline. Pero también existen `health-handlers.js` y `profiles-handlers.js` como
archivos separados con sus propias funciones `register*`. No está claro si ambos paths
conviven o si uno de ellos es el correcto y el otro es deuda de refactor. Necesita
verificación con el código completo de `setupNucleusHandlers()`.

---

## 6. Lo que se necesita para arrancar el desarrollo del mandate

En orden estricto de dependencia:

**Paso 1 — Reescribir `preload_core.js`**
Exponer `window.nucleus` (o `window.workspace`) con los métodos correctos para Core:
`health`, `listProfiles`, `launchProfile`, `getInstallation`. Agregar `mandate.*` cuando
los handlers existan. Eliminar todos los métodos de onboarding.

**Paso 2 — Responder las preguntas de §4**
Específicamente §4.1 (cuándo se crea el mandate) y §4.2 (qué persiste nucleus). Sin estas
respuestas no se puede diseñar ni el handler IPC ni la UI de Core.

**Paso 3 — Agregar `nucleus:mandate-*` handlers**
Una vez que se sabe qué comandos expone nucleus para mandates, agregar los handlers
correspondientes en un nuevo archivo `core/ipc/mandate-handlers.js`, siguiendo el patrón
exacto de `profiles-handlers.js`.

**Paso 4 — Diseñar la UI de Core para el mandate**
`core.html` en su estado actual es la UI legacy descrita en el Technical Reference original.
La pantalla del Genesis Mandate es la primera pantalla que el usuario ve después del
onboarding — necesita reflejar el Design System BTIPS v1.0 y mostrar el mandate creado de
forma significativa, no como un ítem en una lista de perfiles.

**Paso 5 — Leer el puerto de Svelte dinámicamente**
Una vez que §4.3 esté respondida, eliminar el hardcodeo de `:3000` y leer el puerto del
JSON de salida de `dev-start`.

---

## 7. Prompt de investigación para la próxima sesión

Para responder las preguntas bloqueantes de §4, compartir los siguientes archivos o outputs
al inicio de la próxima sesión:

**Del CLI de nucleus — ejecutar y compartir el output:**
```bash
nucleus --json mandate create --help
nucleus --json mandate list
nucleus --json dev-start --help
nucleus --json synapse launch --help
```

**Del filesystem — compartir si existen:**
- Cualquier archivo de mandate creado por `onboarding:create-mandate` (buscar en el path
  del proyecto seleccionado durante el onboarding)
- `nucleus.json` completo después de un onboarding completado exitosamente

**Del código — compartir si no fue compartido:**
- El archivo de Go o TypeScript donde nucleus implementa `mandate create`
  (para saber exactamente qué persiste)
- Cualquier spec o documento de BTIPS v3.0 que defina el Genesis Mandate

---

## 8. Resumen ejecutivo

El onboarding está completo y el puente milestone→stepper funciona. El handoff al workspace
ocurre via `win.loadURL('http://localhost:3000')` después de escribir `onboarding.completed
= true` en nucleus.json.

Core en su estado actual tiene dos bugs críticos que lo dejan no funcional: `preload_core.js`
expone la API equivocada y `core.html` llama métodos que no existen en el contextBridge. Estos
deben corregirse antes de cualquier trabajo sobre el mandate.

El Genesis Mandate fue parcialmente preparado durante el onboarding (`onboarding:create-mandate`
existe y llama al binario), pero no hay persistencia de confirmación, no hay lectura del
mandate en Core, y no hay UI diseñada para mostrarlo. La próxima sesión debe comenzar
respondiendo §4 y corrigiendo el preload antes de escribir cualquier código nuevo.
