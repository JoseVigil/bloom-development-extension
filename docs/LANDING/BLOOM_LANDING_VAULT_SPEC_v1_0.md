# Bloom — Landing Page & Vault Integration Spec
## v1.0 — Diseño de arquitectura · Junio 2026

> **Propósito:** Fuente de verdad del diseño decidido en sesión de análisis sobre la relación entre Discovery, Landing y el sistema de vaults en Cortex. Cubre decisiones de producto, contratos de eventos nuevos, schema de estado compartido, secuencia de apertura de Landing, y gaps de código a implementar.
>
> **Contexto:** Este documento surge del análisis de `ONBOARDING_CORTEX_INTEGRATION.md`, `BLOOM_ONBOARDING_WORKFLOW_SPEC_v2_1.md` y `HARNESS_SOURCE_OF_TRUTH.md`. Las decisiones aquí registradas resuelven ambigüedades no cubiertas en esos documentos y deben incorporarse a ellos en la próxima revisión.

---

## Índice

1. [El problema que este spec resuelve](#1-el-problema-que-este-spec-resuelve)
2. [Las tres páginas y sus roles definitivos](#2-las-tres-páginas-y-sus-roles-definitivos)
3. [Decisión de producto: vault pertenece a Landing](#3-decisión-de-producto-vault-pertenece-a-landing)
4. [Cuándo se abre Landing](#4-cuándo-se-abre-landing)
5. [Eventos nuevos — contratos canónicos](#5-eventos-nuevos--contratos-canónicos)
6. [La pantalla vault_init en Discovery](#6-la-pantalla-vault_init-en-discovery)
7. [bloom_profile_state — el objeto de estado compartido](#7-bloom_profile_state--el-objeto-de-estado-compartido)
8. [Boot sequence de Landing](#8-boot-sequence-de-landing)
9. [El panel de control por perfil](#9-el-panel-de-control-por-perfil)
10. [Gaps de código a implementar](#10-gaps-de-código-a-implementar)
11. [Dependencias entre capas](#11-dependencias-entre-capas)
12. [Archivos a adjuntar al implementador](#12-archivos-a-adjuntar-al-implementador)

---

## 1. El problema que este spec resuelve

Dentro del onboarding de Bloom existen tres páginas en Cortex: Discovery, Harness y Landing. Discovery y Harness estaban suficientemente documentadas. Landing estaba marcada como pendiente o fuera de alcance en versiones anteriores — la revisión del 19 de junio de 2026 confirmó que `landingProtocol.js` ya existe con su manifest completo, pero el rol de Landing en el flujo de onboarding, su momento de apertura, y su relación con el sistema de vaults no estaban definidos.

El análisis identificó dos desafíos concretos sin resolver:

**Desafío 1 — Discovery**: la pantalla de discovery se lanza junto con el registro, acompaña al usuario en el handshake inicial y en todo el flujo de onboarding. Se cierra cuando cumple su función. Es transitoria por diseño.

**Desafío 2 — Harness**: página de desarrollo y debugging. Acompaña al desarrollador para observar y simular el protocolo. No tiene rol en producción.

**El problema no resuelto — Landing**: la página estable, siempre abierta, donde el usuario puede ver todos los elementos vivos del perfil. Existía como implementación pero sin integración definida en el flujo de onboarding. Específicamente: el vault que se crea cuando una clave se guarda en el shield de Chrome (`chrome.storage.local`) tiene naturaleza de Landing — es estado vivo del perfil — pero ocurre durante Discovery.

---

## 2. Las tres páginas y sus roles definitivos

| Página | Cuándo corre | Quién la necesita | Ciclo de vida |
|---|---|---|---|
| **Discovery** (`discovery/index.html`) | Handshake inicial + todo el onboarding | Usuario en proceso de registro | Transitoria — se cierra al completar el onboarding |
| **Harness** (`harness/index.html`) | Solo en builds `--dev` | Desarrollador debuggeando | Solo en dev — no existe en prod |
| **Landing** (`landing/index.html`) | Post-onboarding, en cada uso normal | Usuario operando el perfil | Permanente — siempre abierta durante el uso |

**Regla de propiedad de funcionalidades:**

- Discovery es dueña de: handshake, registro de cuentas, captura de tokens, confirmación de steps de onboarding.
- Landing es dueña de: estado vivo del perfil, vaults activos, cuentas registradas, intents en curso, panel de control.
- Harness es dueño de: observación del protocolo, simulación de eventos, debugging.

---

## 3. Decisión de producto: vault pertenece a Landing

### La decisión

El vault — el objeto que agrupa las claves guardadas en `chrome.storage.local` para un perfil — es semánticamente propiedad de Landing, no de Discovery.

**Justificación:** Discovery acompaña el momento puntual del registro. El vault no es un evento del registro — es estado persistente del perfil. El usuario necesita poder ver sus vaults activos, identificarlos, saber cuáles están activos o pendientes, en cualquier momento de uso del perfil. Ese es el rol de Landing.

### Lo que Discovery sí hace respecto al vault

Discovery crea el vault como efecto secundario de guardar el token. Cuando el usuario confirma su PAT de GitHub en la pantalla `github-confirm`, `_saveToken()` escribe en `bloom_vault_temp`. Eso es correcto y no cambia.

Lo que Discovery agrega con este spec es:

1. Una pantalla de confirmación (`vault_init`) que le informa al usuario que su clave fue guardada de forma segura en el shield de Chrome.
2. La escritura de `bloom_profile_state` en `chrome.storage` — el objeto que Landing leerá al arrancar.
3. La emisión de dos eventos nuevos: `GITHUB_TOKEN_STORED` (vault existe) y `GITHUB_ACCOUNT_CREATED` (identidad confirmada via API).

### Lo que Landing hace respecto al vault

Landing muestra todos los vaults del perfil en su panel de control, con su estado (activo/pendiente), fingerprint, y cuenta asociada. Esta vista puede actualizarse en tiempo real a medida que el onboarding avanza.

---

## 4. Cuándo se abre Landing

### La decisión

Landing se abre cuando el step `success` se emite desde Discovery — es decir, cuando el onboarding completo termina.

**No se abre en `vault_init`** aunque el vault ya exista en ese momento. Abrir Landing antes del final del onboarding implicaría mostrar un estado incompleto como destino, lo que puede confundir al usuario sobre si el proceso terminó.

### Lo que no implica "estado incompleto"

Landing no va a estar vacía ni desorientadora cuando se abra. Para ese momento ya existen:
- La cuenta de GitHub (registrada en `github_auth`)
- La cuenta de Google (registrada en `google_auth`)
- El vault de GitHub (creado en `vault_init`)
- Potencialmente la API key de Gemini (si `ai_provider_setup` completó)

Los elementos que todavía no existen se muestran como **pendientes** — no como ausentes. El usuario ve el panel completo de su perfil con los elementos en sus estados reales. "Pendiente" es información válida, no un estado vacío.

```
CUENTAS
  GitHub    ● activo    @username
  Google    ● activo    user@gmail.com
  Gemini    ○ pendiente —              ← existe como elemento, todavía no activo

VAULTS
  GitHub    ● activo    a3f8b2c1
  Gemini    ○ pendiente —              ← irá apareciendo cuando se registre la API key
```

### El mecanismo de apertura

```
Discovery emite step: "success"
  → DISCOVERY_COMPLETE sube al sistema con completed: true
  → Conductor recibe el evento
  → Ejecuta: nucleus synapse tab.create landing/index.html en el perfil Chrome
  → Landing se abre como tab nueva en la misma ventana Chrome del perfil
  → Conductor pone foco en el Workspace (Electron)
  → El usuario ve Landing abrirse pero el foco queda en Workspace
  → Se lo invita a continuar el proceso desde Conductor Workspace
  → Discovery puede cerrarse o quedar abierta (decisión de UX — no bloqueante)
```

**Implicación para el usuario:** Landing aparece como confirmación visual del éxito. "Tu perfil fue creado. Acá podés ver tus cuentas y tus vaults." El foco no cambia — el usuario sigue en Workspace para continuar el flujo del Conductor.

---

## 5. Eventos nuevos — contratos canónicos

### 5.1 `GITHUB_TOKEN_STORED` (expandido)

Este evento ya existe. Su semántica se expande: ahora es también el signal de que un vault fue inicializado para este perfil.

**Cuándo se emite:** al completar el paso 4 de `_saveToken()` — después de escribir `bloom_vault_temp` en `chrome.storage.local`.

**Emisor:** `discovery.js` → `background.js` → host

**Contrato (sin cambios en campos, semántica expandida):**

```javascript
{
  type:              'GITHUB_TOKEN_STORED',
  profile_id:        string,   // profileId del SYNAPSE_CONFIG
  launch_id:         string,   // launchId del SYNAPSE_CONFIG
  token_fingerprint: string    // SHA-256 del token, primeros 8 chars hex
  // El token real NUNCA sale de chrome.storage — solo el fingerprint viaja
}
```

**Efecto en el sistema:** el receptor (host → Brain → Temporal) debe ahora también registrar que existe un vault activo para este perfil en `nucleus.json`.

---

### 5.2 `GITHUB_ACCOUNT_CREATED` (nuevo)

**Cuándo se emite:** en `_saveToken()`, inmediatamente después de que el fetch a `api.github.com/user` responde con éxito. Si el fetch falla, este evento **no se emite** — el sistema continúa sin él.

**Secuencia exacta dentro de `_saveToken()`:**

```
1. Lee bloom_vault_temp (o crea {})
2. Escribe vault.github_token = token
3. Fetch best-effort → https://api.github.com/user
   Authorization: token <PAT recién guardado>
   → Si OK:
       vault.github_user = user.login
       chrome.storage.local.set({ bloom_vault_temp: vault })
       chrome.runtime.sendMessage({ event: 'GITHUB_ACCOUNT_CREATED', ... })  ← NUEVO
   → Si falla:
       chrome.storage.local.set({ bloom_vault_temp: vault })
       // no se emite GITHUB_ACCOUNT_CREATED — vault igual existe
4. chrome.runtime.sendMessage({ event: 'GITHUB_TOKEN_STORED', ... })  ← siempre
```

**Contrato del evento:**

```javascript
{
  event:      'GITHUB_ACCOUNT_CREATED',
  profile_id: string,       // profileId del SYNAPSE_CONFIG
  launch_id:  string,       // launchId del SYNAPSE_CONFIG
  provider:   'github',
  username:   string,       // user.login resuelto via API
  timestamp:  number        // Date.now()
}
```

**Emisor:** `discovery.js` → `background.js` → host

**Handler en `background.js`:** análogo a `GITHUB_TOKEN_STORED` — valida que `username` exista y reenvía al host. Si `username` falta, ignora.

**Efecto en el sistema:** el receptor registra que la cuenta de GitHub fue confirmada con identidad real. Esto actualiza `bloom_profile_state.accounts[]` con `status: "active"` y el username.

---

### 5.3 Tabla de certeza de los eventos

| Evento | ¿Siempre se emite? | Condición |
|---|---|---|
| `GITHUB_TOKEN_STORED` | Sí | El usuario confirmó el token — vault existe |
| `GITHUB_ACCOUNT_CREATED` | No — best-effort | El PAT tiene acceso a `api.github.com/user` |

Un perfil puede tener vault sin identidad confirmada si el fetch falla. En ese caso `bloom_profile_state.accounts[github].status` queda como `"vault_only"` — el token está guardado pero el username no se resolvió.

---

## 6. La pantalla `vault_init` en Discovery

### El gap de código actual

`routeToStep()` en `discovery.js` (línea 397) solo tiene cases para `github_auth` y `google_auth`. Los steps `vault_init`, `ai_provider_setup` y `project_create` caen al `default`, que llama a `routeToServiceFlow(this.serviceTarget)` — pantalla incorrecta, sin error visible. Este gap está documentado en `HARNESS_SOURCE_OF_TRUTH.md` §9.4 como deuda de código real.

### Qué hace la pantalla

La pantalla `vault_init` en Discovery tiene una sola responsabilidad: **confirmarle al usuario que su clave fue guardada de forma segura en el shield de Chrome**. No es una pantalla de configuración ni de acción — es un receipt.

### Contenido de la pantalla

```
✓ Tu clave fue guardada de forma segura

  Proveedor:   GitHub
  Cuenta:      @username   (o "no resuelto" si el fetch falló)
  Almacenado:  chrome.storage.local — solo accesible desde este navegador
  Fingerprint: a3f8b2c1
  Guardado:    <timestamp>

  Tus claves nunca salen de Chrome. Solo el fingerprint
  viaja al sistema para confirmar que la clave existe.

  [ Ver en Landing →]          [Continuar →]
```

**Botón "Continuar →":** avanza al siguiente step del onboarding. Emite `onboarding_navigate` con el step siguiente (`google_auth` o el que corresponda según el flujo).

**Botón "Ver en Landing →":** abre Landing como tab (si ya existe) o encola la apertura para cuando se cree al final del onboarding. Este botón es opcional y no bloquea el flujo.

### Implementación requerida

**En `discovery.js` — `routeToStep()`:**

```javascript
case 'vault_init':
  this.showScreen('vault-created');
  this._populateVaultReceipt();
  break;
```

**Método `_populateVaultReceipt()`:**

```javascript
_populateVaultReceipt() {
  chrome.storage.local.get('bloom_vault_temp', (result) => {
    const vault = result.bloom_vault_temp || {};
    // Poblar los campos de la pantalla vault-created
    document.getElementById('vault-provider').textContent = 'GitHub';
    document.getElementById('vault-username').textContent =
      vault.github_user || 'No resuelto';
    document.getElementById('vault-fingerprint').textContent =
      this._computeFingerprint(vault.github_token);
    document.getElementById('vault-timestamp').textContent =
      new Date().toLocaleString();
  });
}
```

**En `discovery/index.html`:** agregar la screen `<div id="screen-vault-created" class="screen">` con el HTML del receipt descrito arriba.

---

## 7. `bloom_profile_state` — el objeto de estado compartido

### Por qué existe este objeto

`bloom_vault_temp` fue diseñado para almacenar el token de GitHub y su username — nada más. No puede ser la fuente de verdad para Landing porque no tiene estructura para múltiples cuentas, múltiples vaults, ni estado de onboarding general.

`bloom_profile_state` es el objeto nuevo que Discovery escribe progresivamente durante el onboarding y que Landing lee al arrancar.

### Schema

```javascript
// chrome.storage.local['bloom_profile_state']
{
  profile_id:         string,     // del SYNAPSE_CONFIG
  onboarding_complete: boolean,   // true cuando step: "success" completa
  last_updated:       number,     // Date.now()

  accounts: [
    {
      provider:     string,    // "github" | "google" | "gemini" | "openai" | ...
      username:     string,    // null si no resuelto
      email:        string,    // null si no aplica
      status:       string,    // "active" | "pending" | "vault_only" | "error"
      created_at:   number,    // timestamp de cuando se registró
      completed_at: number     // null si status !== "active"
    }
  ],

  vaults: [
    {
      provider:    string,    // "github" | "gemini" | "openai" | ...
      fingerprint: string,    // SHA-256, primeros 8 chars hex
      storage:     string,    // siempre "chrome.storage.local"
      status:      string,    // "active" | "pending"
      created_at:  number
    }
  ]
}
```

### Quién escribe qué campo

| Campo | Escritor | Cuándo |
|---|---|---|
| `profile_id` | `discovery.js` al inicializar | Al cargar `SYNAPSE_CONFIG` |
| `onboarding_complete` | `discovery.js` | Cuando step `success` se emite |
| `accounts[].status = "active"` | `discovery.js` | Al recibir `ACCOUNT_REGISTERED` para ese provider |
| `accounts[github].username` | `discovery.js` | Cuando `GITHUB_ACCOUNT_CREATED` se emite |
| `vaults[]` | `discovery.js` | Cuando `GITHUB_TOKEN_STORED` se emite |
| `last_updated` | `discovery.js` | En cada escritura |

**Regla:** `discovery.js` es el único escritor de `bloom_profile_state` durante el onboarding. Landing solo lee. Después del onboarding, Landing puede actualizar `last_updated` y campos de estado de sesión, pero no los campos de accounts y vaults.

### Estado inicial

Cuando el perfil no tiene onboarding completo, `bloom_profile_state` incluye los tres providers conocidos como pendientes:

```javascript
// Estado inicial al arrancar el onboarding
{
  profile_id: "uuid",
  onboarding_complete: false,
  last_updated: timestamp,
  accounts: [
    { provider: "github", status: "pending", username: null, email: null, created_at: null },
    { provider: "google", status: "pending", username: null, email: null, created_at: null },
    { provider: "gemini", status: "pending", username: null, email: null, created_at: null }
  ],
  vaults: []
}
```

Este objeto se crea al inicio del onboarding — no cuando los steps completan. Landing siempre encuentra el objeto, nunca null.

---

## 8. Boot sequence de Landing

### Prerequisitos

Landing solo existe en `extensionDir` post-onboarding. `harness.js` usa `loadScriptOptional()` para cargarla condicionalmente. Este comportamiento no cambia.

Landing se abre por primera vez cuando Conductor ejecuta `tab.create landing/index.html` al recibir el step `success`. En ese momento `bloom_profile_state.onboarding_complete` puede ser `false` todavía — Landing arranca de todas formas con el estado disponible.

### Secuencia

```javascript
// landing.js — DOMContentLoaded
document.addEventListener('DOMContentLoaded', async () => {

  // 1. Cargar config
  // landing.synapse.config.js ya fue inyectado por Sentinel en el launch
  // Expone: LANDING_CONFIG = { profileId, launchId, mode: "landing", profile_alias }

  // 2. Leer estado del perfil desde chrome.storage
  const stored = await chrome.storage.local.get('bloom_profile_state');
  const profileState = stored.bloom_profile_state || null;

  if (!profileState) {
    // Estado no encontrado — mostrar pantalla de error / retry
    showScreen('landing-error');
    return;
  }

  // 3. Renderizar panel con estado actual
  renderProfilePanel(profileState);

  // 4. Establecer listener para eventos del host
  chrome.runtime.onMessage.addListener(handleLandingMessage);

  // 5. Solicitar estado fresco al sistema
  chrome.runtime.sendMessage({
    command:    'profile_load',
    profile_id: LANDING_CONFIG.profileId
  });

  // 6. Emitir que Landing está lista
  chrome.runtime.sendMessage({
    event:      'LANDING_READY',
    profile_id: LANDING_CONFIG.profileId,
    launch_id:  LANDING_CONFIG.launchId,
    timestamp:  Date.now()
  });
});
```

### Mensajes que Landing escucha

| Evento entrante | Efecto en Landing |
|---|---|
| `SESSION_STATUS` | Actualiza indicator de conexión |
| `STATS_UPDATE` | Actualiza contadores de launches, uptime, intents |
| `PROFILE_LOADED` | Actualiza panel completo con datos frescos del sistema |
| `ACCOUNT_REGISTERED` | Activa la cuenta correspondiente en el panel |
| `GITHUB_TOKEN_STORED` | Activa el vault de GitHub en el panel |
| `GITHUB_ACCOUNT_CREATED` | Actualiza el username de GitHub en el panel |

---

## 9. El panel de control por perfil

### Estructura visual

```
┌─────────────────────────────────────────────────────────┐
│  MasterWorker                              ● Connected  │
│  Perfil: b0a3cb70                                       │
├─────────────────────────────────────────────────────────┤
│  CUENTAS                                                │
│                                                         │
│  ● GitHub    @username          activo                  │
│  ● Google    user@gmail.com     activo                  │
│  ○ Gemini    —                  pendiente               │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  VAULTS                                                 │
│                                                         │
│  ● GitHub    a3f8b2c1    chrome.storage    activo  [+]  │
│  ○ Gemini    —           —                pendiente     │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  INTENTS                                                │
│                                                         │
│  Sin intents activos                                    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Semántica de estados

**● activo:** el elemento existe, fue verificado, está listo para usar.

**○ pendiente:** el elemento se sabe que va a existir (es parte del perfil), pero todavía no fue registrado. No es ausencia — es intención conocida.

**✗ error:** el elemento existió pero falló. Requiere acción del usuario.

### Los tres providers conocidos de antemano

Bloom sabe que todo perfil va a tener GitHub, Google y Gemini. Landing puede renderizar los tres como pendientes desde el primer boot — sin necesidad de esperar a que el sistema le diga que existen. Esto evita que el panel se vea vacío en el período entre que se abre Landing y que `PROFILE_LOADED` llega con datos frescos.

---

## 10. Gaps de código a implementar

### Prioridad 1 — Prerrequisito del flujo completo

**`routeToStep()` en `discovery.js` — agregar cases faltantes**

Sin esto, tres steps del onboarding caen al default y muestran la pantalla equivocada.

```javascript
// En el switch de routeToStep()
case 'vault_init':
  this.showScreen('vault-created');
  this._populateVaultReceipt();
  break;

case 'ai_provider_setup':
  this.showScreen('provider-select');
  // lógica existente de provider-select
  break;

case 'project_create':
  this.showScreen('project-create');
  // nueva pantalla
  break;
```

**Archivos a modificar:** `discovery/discovery.js`

---

### Prioridad 2 — Eventos nuevos en Cortex

**`GITHUB_ACCOUNT_CREATED` en `_saveToken()`**

Agregar la emisión del evento después del fetch exitoso:

```javascript
// En _saveToken(), dentro del bloque if (githubResponse.ok)
chrome.runtime.sendMessage({
  event:      'GITHUB_ACCOUNT_CREATED',
  profile_id: SYNAPSE_CONFIG.profileId,
  launch_id:  SYNAPSE_CONFIG.launchId,
  provider:   'github',
  username:   githubUser,
  timestamp:  Date.now()
});
```

**Handler en `background.js`:**

```javascript
case 'GITHUB_ACCOUNT_CREATED':
  if (!msg.username) {
    console.warn('[Synapse] GITHUB_ACCOUNT_CREATED sin username — ignorado');
    return;
  }
  sendToHost({
    type:       'GITHUB_ACCOUNT_CREATED',
    profile_id: msg.profile_id || config?.profileId,
    launch_id:  msg.launch_id  || config?.launchId,
    provider:   'github',
    username:   msg.username,
    timestamp:  msg.timestamp
  });
  break;
```

**Archivos a modificar:** `discovery/discovery.js`, `background.js`

---

### Prioridad 3 — Estado compartido

**Escritura de `bloom_profile_state` desde `discovery.js`**

Crear el objeto al inicio del onboarding y actualizarlo en cada step que completa.

```javascript
// Al inicializar el onboarding
_initProfileState() {
  const initial = {
    profile_id:          SYNAPSE_CONFIG.profileId,
    onboarding_complete: false,
    last_updated:        Date.now(),
    accounts: [
      { provider: 'github', status: 'pending', username: null, email: null, created_at: null },
      { provider: 'google', status: 'pending', username: null, email: null, created_at: null },
      { provider: 'gemini', status: 'pending', username: null, email: null, created_at: null }
    ],
    vaults: []
  };
  chrome.storage.local.set({ bloom_profile_state: initial });
}

// Al completar vault_init
_updateVaultState(fingerprint) {
  chrome.storage.local.get('bloom_profile_state', (result) => {
    const state = result.bloom_profile_state || {};
    state.vaults.push({
      provider:    'github',
      fingerprint: fingerprint,
      storage:     'chrome.storage.local',
      status:      'active',
      created_at:  Date.now()
    });
    state.last_updated = Date.now();
    chrome.storage.local.set({ bloom_profile_state: state });
  });
}
```

**Archivos a modificar:** `discovery/discovery.js`

---

### Prioridad 4 — Pantalla vault_init en HTML

**Screen `vault-created` en `discovery/index.html`:**

```html
<div id="screen-vault-created" class="screen">
  <div class="screen-icon">🔐</div>
  <h2>Clave guardada de forma segura</h2>

  <div class="vault-receipt">
    <div class="receipt-row">
      <span class="label">Proveedor</span>
      <span id="vault-provider">GitHub</span>
    </div>
    <div class="receipt-row">
      <span class="label">Cuenta</span>
      <span id="vault-username">—</span>
    </div>
    <div class="receipt-row">
      <span class="label">Almacenado en</span>
      <span>chrome.storage.local</span>
    </div>
    <div class="receipt-row">
      <span class="label">Fingerprint</span>
      <span id="vault-fingerprint" class="monospace">—</span>
    </div>
  </div>

  <p class="security-note">
    Tu clave nunca sale de Chrome. Solo el fingerprint viaja al sistema.
  </p>

  <div class="screen-actions">
    <button id="btn-vault-continue" class="btn-primary">Continuar →</button>
  </div>
</div>
```

**Archivos a modificar:** `discovery/index.html`

---

### Prioridad 5 — Trigger de apertura de Landing

**En Conductor** (Electron), cuando recibe el step `success` o `DISCOVERY_COMPLETE` con `completed: true`:

```javascript
// En el handler de onboarding complete
async function handleOnboardingComplete(profileId) {
  // Abrir Landing como tab nueva en el perfil Chrome del onboarding
  await nucleus.synapse.tabCreate(profileId, 'landing/index.html');

  // Poner foco en Workspace
  conductorWindow.focus();

  // Actualizar nucleus.json
  await nucleus.updateOnboardingStatus(profileId, { completed: true });
}
```

**Archivos a modificar:** Conductor Electron (onboarding handler — ver `IMPL_PROMPT_ONBOARDING_UX_v1.md`)

---

### Prioridad 6 — Manifest y enums actualizados

**`DISCOVERY_PROTOCOL_MANIFEST`** en `discoveryProtocol.js` — actualizar el enum de steps:

```javascript
// Reemplazar el enum actual:
options: ["welcome", "github_auth", "github_confirm", "api_key", "complete"]

// Por el enum completo:
options: [
  "github_auth", "nucleus_create", "vault_init",
  "google_auth", "ai_provider_setup", "project_create", "success"
]
```

**Archivos a modificar:** `discovery/discoveryProtocol.js`

---

## 11. Dependencias entre capas

```
Prioridad 1 (routeToStep cases)
  └── depende de: nada — implementable primero

Prioridad 2 (GITHUB_ACCOUNT_CREATED)
  └── depende de: nada — implementable en paralelo con P1

Prioridad 3 (bloom_profile_state)
  └── depende de: P2 (los eventos son los que actualizan el estado)

Prioridad 4 (pantalla vault_init HTML)
  └── depende de: P1 (el case en routeToStep), P3 (para poblar el receipt)

Prioridad 5 (apertura de Landing)
  └── depende de: P3 (Landing necesita bloom_profile_state para arrancar)

Prioridad 6 (manifest actualizado)
  └── depende de: nada — trabajo paralelo, desbloquea el Harness
```

---

## 12. Archivos a adjuntar al implementador

### Obligatorios

| Archivo | Por qué |
|---|---|
| `discovery/discovery.js` | Para ver `routeToStep()`, `_saveToken()`, `GithubAuthFlow`, `OnboardingFlow` |
| `discovery/index.html` | Para agregar la screen `vault-created` |
| `background.js` | Para agregar el handler de `GITHUB_ACCOUNT_CREATED` y actualizar `sendToHost` |
| `discovery/discoveryProtocol.js` | Para actualizar el enum de steps en el manifest |
| `ONBOARDING_CORTEX_INTEGRATION.md` | Fuente de verdad de los contratos existentes de Cortex |
| `BLOOM_ONBOARDING_WORKFLOW_SPEC_v2_1.md` | Para entender la cadena Go → Temporal → Sentinel → Brain → Chrome |
| `HARNESS_SOURCE_OF_TRUTH.md` | Para no romper el Harness al actualizar los manifests |

### Si disponibles

| Archivo | Por qué |
|---|---|
| `landing/landing.js` | Para implementar el boot sequence y `renderProfilePanel()` |
| `landing/index.html` | Para agregar las secciones de accounts y vaults al panel |
| `landing/landingProtocol.js` | Para agregar `GITHUB_ACCOUNT_CREATED` y `GITHUB_TOKEN_STORED` a `observable_events` |
| `IMPL_PROMPT_ONBOARDING_UX_v1.md` | Para implementar el trigger de apertura de Landing en Conductor |
| `onboarding_steps.json` | Para verificar que los steps enumerados aquí coinciden con la fuente de verdad |

---

*Documento generado en sesión de análisis — 19 de junio de 2026.*
*Versión: 1.0 — listo para revisión antes de implementación.*
*Próxima acción: adjuntar `discovery.js` completo para iniciar implementación de Prioridad 1.*
