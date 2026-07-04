# COGNITUUM · Companion Cognitivo
## Guía de Implementación — Companion Side Panel (Store-Ready Edition)

**Módulo:** Companion · **Versión:** 1.2 (Store-Ready)
**Componentes:** `companion/index.html` · `companion/companion.js` · `companion/companionProtocol.js` · `background.js`
**Protocolo:** Synapse v3.0 · **Marco:** BTIPS v5.0

Este documento describe la arquitectura, decisiones de diseño e instrucciones de integración para el **Companion**, el cuarto activo nativo del sistema Cortex. Está dirigido al desarrollador que implementa o mantiene estos archivos dentro de la extensión.

> Fuente de verdad complementaria: `AUTHORITY_BOUNDARY.md` tiene precedencia sobre cualquier sección de este documento en lo relativo a onboarding de credenciales de terceros.

---

## Registro de cambios

| Versión | Fecha | Cambios |
|---|---|---|
| v1.0 | 2026-05-23 | Implementación inicial: webview Gemini, inyección de briefs, screenshot, system prompt. |
| v1.1 | 2026-06-29 | BISP como contexto nativo del Companion. Nuevo flujo `INJECT_BISP` con push automático al detectar UI de AI web. Principio de Sesión Prístina. Estado `SILENT_MONITORING`. Nuevo tipo de mensaje `NEW_SESSION`. Tabla de mensajes extendida. |
| **v1.2** | **2026-07-04** | **Store-Ready Edition.** El Companion pasa de módulo independiente (`panel.html`/`panel.js`) a **cuarto activo nativo** de Cortex, ubicado en `extension/companion/` con su propio `companionProtocol.js`. `host_permissions` restringidos a dominios de ingeniería declarados (Privilegio Mínimo). **Eliminado el Clipboard Monitor** para la API key de Gemini — sustituido por entrada manual en la Discovery Page (`HUMAN_GATE_CLIPBOARD` deja de aplicar a este flujo; ver `AUTHORITY_BOUNDARY.md`). La activación del Companion pasa a depender del handshake Synapse de 3 fases, no solo de `linked_accounts`. Nuevo `companion.schema.json` en `protocols/`. |

---

## 1. Contexto del sistema

Cognituum es un sistema de asistencia cognitiva para ingenieros de software donde el ingeniero toma todas las decisiones. El pipeline central se llama **BTIPS** (Bloom Technical Intent Package System): unidades estructuradas de intención técnica procesadas por un LLM via API, gestionadas por el módulo **Cortex**.

El **Companion Cognitivo** es un panel lateral embebido en el navegador que provee una segunda opinión inmediata sin interrumpir el flujo de trabajo. No reemplaza el pipeline de BTIPS ni tiene acceso directo al contexto de Cortex — es un recurso solidario a la decisión del ingeniero.

A partir de v1.2, el Companion deja de ser un módulo satélite y pasa a ser **el cuarto activo Synapse** del sistema, junto a Discovery, Landing y Harness. Esto significa que:

- Vive en `extension/companion/`, con su propio manifiesto de protocolo (`companionProtocol.js`) y schema (`protocols/companion.schema.json`), igual que los otros tres activos.
- Se integra en el mismo ciclo de boot y en el mismo ducto de mensajería que Discovery/Landing/Harness.
- Su habilitación operativa depende del **handshake de 3 fases** del ducto Synapse, no únicamente de que el perfil tenga cuentas vinculadas (ver §2.6).

El Companion puede recibir el **BISP activo de la sesión como contexto nativo**, cargado en background antes de que el ingeniero interactúe con la UI de la AI web. Esto lo convierte en un validador silencioso de arquitectura disponible bajo demanda, sin contaminar la sesión principal.

---

## 2. Condiciones de activación del Companion

El Companion **no puede activarse en cualquier momento**. Su disponibilidad depende de que el perfil haya completado el onboarding correctamente en la Discovery Page **y** de que el ducto Synapse haya confirmado el handshake operativo.

### 2.1 Prerequisitos obligatorios

**Condición 1 — Cuenta Google registrada**

Durante el onboarding (`register=true` en `SYNAPSE_CONFIG`), el usuario debe haber completado el paso de autenticación de Google. Esta condición se detecta mediante `HUMAN_GATE_URL_WATCH` (`startGoogleAuthWatcher()` en `background.js`, ver `AUTHORITY_BOUNDARY.md` §2.2–2.3): un listener de `chrome.tabs.onUpdated` observa a qué URL navega la tab de registro, sin leer el DOM ni el contenido de la página. Al detectar una URL alcanzable solo con sesión activa, emite:

```javascript
chrome.runtime.sendMessage({
  event: 'ACCOUNT_REGISTERED',
  service: 'google',
  email: string,
  profile_id: string,
  launch_id: string,
  timestamp: number
})
```

Este evento es persistido por Brain y queda registrado en `linked_accounts` del perfil con `provider: 'google'`.

**Condición 2 — API key de Gemini registrada (entrada manual)**

> **Cambio v1.2:** se elimina el Clipboard Monitor para este flujo. La detección automática de la API key vía regex sobre el portapapeles queda descontinuada para reducir permisos (`clipboardRead` ya no se declara en el manifest) y para cumplir el principio de **Human-in-the-loop** exigido por `AUTHORITY_BOUNDARY.md` §1: Cognituum lleva al usuario hasta la puerta, pero nunca lee ni intercepta el secreto por un canal pasivo del sistema operativo.

El nuevo flujo es de **entrada manual explícita**:

1. Discovery presenta el formulario de la API key de Gemini (paso `gemini_api_manual_entry` del onboarding) con un campo de texto simple.
2. El usuario genera su key en la puerta real del proveedor (`aistudio.google.com` o equivalente) y la pega manualmente en el campo.
3. Al enviar el formulario, `discovery/onboarding.js` valida el formato localmente (regex `AIzaSy...`) y dispara:

```javascript
chrome.runtime.sendMessage({
  event: 'API_KEY_REGISTERED',
  service: 'gemini',
  key: string,          // provisto por el usuario, nunca leído de fuera del formulario
  profile_id: string,
  launch_id: string,
  timestamp: number
})
```

4. Brain persiste la key en el Vault de Nucleus vía el ducto Synapse, exactamente igual que con el PAT de GitHub (mismo patrón de formulario manual, ver prompt de Refactor Store-Ready, Hito 3).

Ambas condiciones deben cumplirse dentro del mismo flujo de onboarding. No existe un orden impuesto entre ellas, pero Discovery no emite `onboarding_complete` hasta que el perfil las tenga ambas registradas.

### 2.2 Señal de habilitación — `onboarding_complete`

Cuando el onboarding finaliza, Discovery notifica a Brain:

```javascript
chrome.runtime.sendMessage({
  event: 'onboarding_complete',
  payload: { email, api_key_validated: true }
})
```

Brain persiste este estado en el perfil. A partir de este momento, el perfil tiene `linked_accounts` que incluye entradas para `google` y `gemini`. Este campo es una **condición necesaria pero no suficiente** para que Landing habilite el Companion — ver §2.6 para la condición adicional del handshake.

### 2.3 Punto de activación — Landing Page

El botón de activación del Companion se expone en la **Landing Page**, no antes. Esta decisión es deliberada:

- En Discovery el handshake puede no estar completamente confirmado todavía.
- El webview del Companion necesita la sesión de Google activa (`partition: persist:gemini-session`), que solo existe después de que el login fue completado durante el onboarding.
- Landing es el cockpit permanente de la sesión: es el lugar correcto para controles de herramientas persistentes.

### 2.4 Implementación del guard en Landing

`landingProtocol.js` debe verificar `linked_accounts` **y** el estado del handshake antes de renderizar el botón del Companion:

```javascript
// landingProtocol.js — dentro de renderActions()

function isCompanionAvailable(profile, synapseState) {
  const accounts = profile?.accounts ?? [];
  const hasGoogle = accounts.some(a => a.provider === 'google' && a.status === 'active');
  const hasGemini = accounts.some(a => a.provider === 'gemini' && a.status === 'active');
  const handshakeReady = synapseState?.phase === 'handshake_confirm';
  return hasGoogle && hasGemini && handshakeReady;
}

function renderActions(profile, synapseState) {
  const companionEnabled = isCompanionAvailable(profile, synapseState);

  const btn = document.createElement('button');
  btn.textContent = 'Abrir Companion';
  btn.disabled = !companionEnabled;
  btn.title = companionEnabled
    ? 'Abrir el panel lateral de Gemini'
    : 'Requiere cuentas registradas y ducto Synapse confirmado';

  btn.addEventListener('click', () => {
    if (companionEnabled) chrome.sidePanel.open({ windowId: currentWindowId });
  });

  actionsContainer.appendChild(btn);
}
```

Si `companionEnabled` es `false`, el botón se muestra deshabilitado con tooltip explicativo. Nunca se oculta.

### 2.5 Resumen del flujo de activación

```
Discovery (register=true)
  ├─ ACCOUNT_REGISTERED · service: google       (HUMAN_GATE_URL_WATCH)     ──┐
  └─ API_KEY_REGISTERED · service: gemini       (entrada manual, formulario)──┤
                                                                              ▼
                                                                   onboarding_complete
                                                                   Brain persiste linked_accounts

Ducto Synapse (background.js)
  └─ handshake de 3 fases
       extension_ready → host_ready → handshake_confirm
                                              │
                                              ▼
Landing Page (sesión activa)
  └─ renderActions()
       ├─ [linked_accounts OK] Y [handshake_confirm] → botón habilitado
       └─ [falta alguno]                              → botón deshabilitado

Companion activado (cuarto activo Synapse)
  └─ chrome.sidePanel.open()
       └─ companion/index.html · webview → gemini.google.com
            └─ "Companion activo. ¿Qué analizamos?"
```

### 2.6 El handshake de 3 fases como condición de gating *(nuevo v1.2)*

En versiones previas, la única condición de habilitación era el estado `linked_accounts` del perfil. A partir de v1.2, el Companion es un activo Synapse más, y por lo tanto **su comunicación operativa (recepción de `INJECT_BISP`, envío de `slave_mode_changed`, etc.) solo se habilita después de que el handshake de 3 fases se haya confirmado**:

1. `extension_ready` — la extensión notifica al Host (Brain) que el ducto de Native Messaging está arriba.
2. `host_ready` — Brain confirma que el proceso nativo está listo para recibir comandos.
3. `handshake_confirm` — ambas partes confirman el ducto; solo después de este mensaje `background.js` empieza a rutear mensajes hacia/desde `companion`.

Antes de `handshake_confirm`, el Companion puede estar visualmente abierto (si el ingeniero fuerza `chrome.sidePanel.open()` manualmente) pero permanece en modo pasivo: no recibe `INJECT_BISP` ni ningún mensaje proveniente del ducto Synapse. Esto evita condiciones de carrera donde el Companion intenta inyectar contexto antes de que Brain esté efectivamente disponible.

---

## 3. Arquitectura del Companion Panel

### 3.1 Filosofía de diseño

- El panel embebe `gemini.google.com` via `<webview>` nativo de Chromium (no iframe).
- El usuario usa su propia cuenta de Google — costo $0 para el sistema.
- Cortex puede inyectar contexto estructurado (briefs o BISP completo) bajo demanda o automáticamente al detectar una sesión de AI web activa.
- El ingeniero siempre tiene control: la inyección prepara, él decide si consultar y cuándo.
- **Privilegio Mínimo (v1.2):** el Companion, como el resto de la extensión, solo declara `host_permissions` sobre los dominios de ingeniería explícitamente necesarios (Gemini, Claude, ChatGPT, GitHub). No hay `<all_urls>` en el manifest de producción ni acceso implícito a dominios fuera de ese conjunto.

### 3.2 Principio de Sesión Prístina

El Companion opera bajo el **Principio de Sesión Prístina**: la sesión de la AI web (claude.ai, ChatGPT, Grok) debe contener exclusivamente la conversación técnica entre el ingeniero y el modelo. Sin preguntas de control de contexto, sin verificaciones de consistencia con el BISP, sin ruido de gobernanza.

Cuando el ingeniero necesita validar si una propuesta de la AI web rompe la arquitectura documentada en el BISP, **abre el panel del Companion y pregunta allí**, manteniendo el historial de la AI web completamente limpio.

El Companion **nunca** emite outputs proactivos durante una sesión activa con la AI web. Si detecta una divergencia entre lo que propone la AI web y el BISP cargado, la retiene en su contexto y la expone solo cuando el ingeniero lo consulta directamente.

Este principio se mantiene como eje central en v1.2 y ahora convive explícitamente con el de **Privilegio Mínimo**: la sesión permanece limpia de ruido de gobernanza, y además el sistema que la observa (`background.js` vía `chrome.tabs.onUpdated`) solo tiene visibilidad sobre los dominios de ingeniería declarados — nunca sobre el contenido de la página, solo sobre la URL de la tab.

### 3.3 Mapa de archivos *(actualizado v1.2)*

| Archivo | Descripción |
|---|---|
| `companion/index.html` | Estructura visual del panel lateral (antes `panel.html`). Define el `<webview>`, toolbar de acciones y statusbar. |
| `companion/companion.js` | Lógica de control (antes `panel.js`): ciclo de vida del webview, CSS injection, inyección de briefs y BISP, captura de screenshot, bridge con Cortex. |
| `companion/companionProtocol.js` | **Nuevo.** Manifiesto del protocolo Companion: declara los tipos de mensaje (`INJECT_BISP`, `INJECT_BRIEF`, `INJECT_TEXT`, `NEW_SESSION`), su dirección (Brain → Companion / Companion → Brain) y su contrato de payload. Es el equivalente, para este activo, de lo que `discoveryProtocol.js`/`landingProtocol.js` son para sus respectivos activos. |
| `companion/styles.css` | Estilos del panel: toolbar, statusbar, overlay de carga. |
| `protocols/companion.schema.json` | **Nuevo.** Schema de validación para los mensajes `INJECT_BISP` / `STORE_BISP`, asegurando que el payload BISP tenga la forma esperada antes de ser inyectado en el webview. |
| `background.js` | Service worker de la extensión. Ruteador del ducto Synapse (incluye ahora el activo `companion`), captura de pestañas, almacenamiento del BISP activo, detección de UI de AI web, `startGoogleAuthWatcher()`. |
| `manifest.json` | Configuración de la extensión, Store-Ready: `host_permissions` restringidos, sin `clipboardRead`. |

### 3.4 Diagrama de comunicación

```
Cortex (context.js)
    │
    ├─── Intent API ──────────────────► Claude / AI web (pipeline BTIPS)
    │
    └─── STORE_BISP message ──────────► background.js (ducto Synapse)
                                             │
                          [requiere handshake_confirm]
                                             │
                          ┌──────────────────┴────────────────────┐
                          │ Tab AI web detectado                   │ Botón "Brief"
                          │ (host_permissions: claude.ai/           │
                          │  chatgpt.com/gemini.google.com/github)  │
                          │ INJECT_BISP (auto, silencioso)          │ INJECT_BRIEF (manual)
                          ▼                                        ▼
                 companion.js (bridge, valida contra          companion.js (bridge)
                 companion.schema.json)                              │
                          │                                          │
              executeScript() │ insertCSS()               executeScript() │ insertCSS()
                          │                                          │
                          ▼                                          ▼
                <webview> gemini.google.com          <webview> gemini.google.com
                 Estado: SILENT_MONITORING            El ingeniero ve el texto y
                 El ingeniero no percibe              decide si enviar
                 la inyección
```

---

## 4. companion/index.html — Estructura visual

### 4.1 Componentes del layout

- **Toolbar (`#toolbar`):** Contiene la marca "Cognituum" y tres botones de acción.
- **Webview wrap (`#webview-wrap`):** Contenedor flex que ocupa el espacio restante.
- **`<webview id="gemini-companion">`:** El componente nativo de Chromium.
- **Loading overlay (`#loading-overlay`):** Se oculta al dispararse el evento `dom-ready`.
- **Status bar (`#statusbar`):** Muestra estado de conexión, nombre de sesión, estado BISP y estado del handshake Synapse.
- **Toast (`#toast`):** Feedback no bloqueante para acciones del toolbar.

### 4.2 Atributos críticos del `<webview>`

```html
<webview
  id="gemini-companion"
  partition="persist:gemini-session"
  useragent="Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230805.001)
             AppleWebKit/537.36 (KHTML, like Gecko)
             Chrome/124.0.0.0 Mobile Safari/537.36"
  allowpopups
></webview>
```

> **`partition=`** `"persist:gemini-session"` mantiene cookies y login entre reinicios del panel. Sin este atributo el usuario debe autenticarse en Google cada vez que abre el companion.

> **`useragent=`** Forzar User-Agent móvil antes del primer request hace que Google sirva directamente la UI colapsada de Gemini (sin sidebar, sin header completo). Si se seteara via JS post-carga, la primera respuesta ya sería desktop.

> **`allowpopups=`** Necesario para los flows de autenticación de Google (OAuth, verificación de cuenta) completados **manualmente por el usuario** durante el onboarding. Sin esto, el login puede quedar bloqueado silenciosamente.

### 4.3 Botones del toolbar

| ID | Función |
|---|---|
| `#btn-brief` | Solicita el último brief almacenado en `background.js` y lo inyecta en el chat de Gemini con `autoSend=false`. El ingeniero ve el texto y decide si enviarlo. |
| `#btn-screenshot` | Captura la pestaña activa del navegador y la envía al companion para análisis visual. |
| `#btn-reset` | Recarga el webview manteniendo las cookies de sesión e inyecta el system prompt base de Cognituum. Si hay un BISP activo, lo re-inyecta también. |

### 4.4 Statusbar — estados

El statusbar refleja el estado actual del Companion. Estados posibles:

| Estado | Texto en statusbar | Descripción |
|---|---|---|
| Handshake pendiente | `○ Ducto no confirmado` | El handshake de 3 fases del ducto Synapse todavía no llegó a `handshake_confirm`. El Companion está visualmente abierto pero pasivo. |
| Cargando | `Conectando…` | El webview está cargando Gemini. |
| Listo sin BISP | `● Companion activo` | System prompt inyectado. Sin BISP de sesión. |
| SILENT_MONITORING | `● Sesión activa — BISP cargado` | BISP inyectado en background. El Companion tiene contexto completo y espera consulta. |
| Error de carga | `✕ Error de conexión` | El webview no pudo cargar. |

---

## 5. companion/companion.js — Lógica de control

### 5.1 `initWebview()`

Registra todos los event listeners del webview **antes** de asignar `webview.src`. Este orden es crítico: si se asigna `src` primero en el HTML, el evento `dom-ready` puede dispararse antes de que el JS esté listo para escucharlo.

```javascript
function initWebview() {
  webview.addEventListener('dom-ready',     onDomReady);
  webview.addEventListener('did-fail-load', onLoadFail);
  webview.src = GEMINI_URL; // Se asigna DESPUÉS de registrar listeners
}

document.addEventListener('DOMContentLoaded', initWebview);
```

### 5.2 `onDomReady()` — Secuencia de arranque

Este handler orquesta todo lo que ocurre cuando el DOM de Gemini está disponible:

1. Ocultar el loading overlay.
2. Inyectar `ISOLATION_CSS` via `webview.insertCSS()` para limpiar header, sidebar y footer de Gemini.
3. Esperar 1200ms (`setTimeout`) para que Angular/Wiz termine de montar sus componentes reactivos.
4. Consultar al ducto Synapse si el handshake está en `handshake_confirm`. Si no lo está, detener la secuencia y mostrar `○ Ducto no confirmado` en el statusbar.
5. Inyectar el `SYSTEM_PROMPT` base de Cognituum con `autoSend=true`.
6. Si `background.js` tiene un BISP activo (`_activeBisp !== null`), inyectarlo inmediatamente después con `autoSend=true` como extensión del system prompt.

El paso 6 garantiza que cuando el Companion termina de arrancar, ya tiene el contexto de la sesión cargado sin intervención del ingeniero.

### 5.3 `injectTextToGemini()` — El núcleo técnico

Esta función resuelve el problema central de la inyección en SPAs como la de Gemini: el DOM carga de forma asíncrona y el framework interno (Angular/Wiz) no reacciona a asignaciones directas de propiedades del DOM.

#### Problema: Race conditions y eventos reactivos

Si se ejecuta `executeScript()` inmediatamente después de `dom-ready` y se hace `elemento.innerText = texto`, ocurren dos fallas:

- El `contenteditable` puede no existir todavía en el DOM.
- Aunque exista, Angular no detecta el cambio → el botón "Send" queda deshabilitado (gris).

#### Solución: MutationObserver + cadena de eventos nativos

El script inyectado en el webview instala un `MutationObserver` sobre `document.body` que espera activamente a que el `contenteditable` aparezca. Una vez detectado, ejecuta la secuencia:

```javascript
// 1. Foco (activa el estado interno de Angular)
el.focus();

// 2. Inyección via execCommand (más compatible que innerText directo)
document.execCommand('selectAll', false, null);
document.execCommand('insertText', false, textToInject);

// 3. Fallback si execCommand no funciona
if (!el.innerText.trim()) {
  el.innerText = textToInject;
  el.dispatchEvent(new InputEvent('input', {
    bubbles: true, inputType: 'insertText', data: textToInject
  }));
}

// 4. Cadena de eventos para actualizar estado reactivo
['input', 'change'].forEach(ev =>
  el.dispatchEvent(new Event(ev, { bubbles: true }))
);

// 5. Envío (si autoSend=true): click en botón o Enter simulado
sendBtn?.click() ?? el.dispatchEvent(new KeyboardEvent('keydown', {
  key: 'Enter', keyCode: 13, bubbles: true
}));
```

> **Timeout:** El `MutationObserver` se auto-limpia después de 15 segundos si el elemento nunca aparece. Esto previene memory leaks en sesiones donde Gemini no cargó correctamente.

### 5.4 `injectBrief(brief)` — Carga manual desde toolbar

Punto de entrada para el botón `#btn-brief`. Recibe el último brief almacenado en `background.js` y lo formatea como prompt legible para el ingeniero:

```javascript
// Firma del objeto brief esperado:
{
  intentType:     string,  // Tipo de intent ejecutado por BTIPS
  summary:        string,  // Resumen del resultado
  openDecision:   string,  // Decisión pendiente del ingeniero
  suggestedQuery: string   // (opcional) Pregunta sugerida al companion
}
```

`autoSend=false`: el brief se inyecta en el campo de texto pero NO se envía automáticamente. El ingeniero lo lee, puede editarlo y decide cuándo presionar Enter.

### 5.5 `injectBisp(bisp, systemPrompt)` — Carga silenciosa de sesión

Punto de entrada para la carga automática del BISP activo. A diferencia de `injectBrief()`, esta función opera en background y no produce feedback visible para el ingeniero salvo la actualización del statusbar. **En v1.2, esta función valida el payload contra `protocols/companion.schema.json` antes de inyectar** — si el BISP recibido no cumple el schema, la inyección se descarta y se loguea un error en vez de inyectar datos malformados en el webview.

```javascript
async function injectBisp(bisp, systemPrompt) {
  // 0. Validar contra companion.schema.json (nuevo v1.2)
  if (!validateAgainstSchema(bisp, companionSchema.definitions.bisp)) {
    console.error('BISP recibido no cumple companion.schema.json — inyección descartada');
    return;
  }

  // 1. Formatear el BISP como contexto de sesión para Gemini
  const bispContext = formatBispAsContext(bisp, systemPrompt);

  // 2. Inyectar con autoSend=true: Gemini procesa el contexto silenciosamente
  await injectTextToGemini(bispContext, { autoSend: true });

  // 3. Actualizar statusbar: el ingeniero sabe que el Companion tiene contexto
  updateStatusbar('SILENT_MONITORING');
}

function formatBispAsContext(bisp, systemPrompt) {
  return [
    systemPrompt,
    `\n---\nCONTEXTO DE SESIÓN BISP:`,
    `Intent activo: ${bisp.intentType} — ${bisp.summary}`,
    bisp.openDecision ? `Decisión abierta: ${bisp.openDecision}` : null,
    bisp.findingsSummary ? `Findings: ${bisp.findingsSummary}` : null,
  ].filter(Boolean).join('\n');
}
```

> **Sin feedback intrusivo:** El ingeniero no ve el texto de inyección en su flujo. Solo el statusbar cambia a `● Sesión activa — BISP cargado`. El chat de Gemini puede mostrar brevemente la respuesta de Gemini al system prompt, pero esto ocurre en el panel lateral, no en la UI de la AI web principal.

### 5.6 System prompt del Companion — Roles según modo

El `SYSTEM_PROMPT` base y el system prompt de sesión son distintos y tienen propósitos distintos:

**`SYSTEM_PROMPT` base** — constante en `companion.js`, se inyecta en cada `onDomReady()`:

```javascript
const SYSTEM_PROMPT = `
Sos el Companion Cognitivo de Cognituum, asistente lateral de un ingeniero de software.
Tu rol es de segunda opinión técnica. Respondés cuando el ingeniero te consulta.
No tomás decisiones, no ejecutás, no interrumpís. Preparás, analizás, validás.
`.trim();
```

**System prompt de sesión BISP** — construido dinámicamente en `background.js` a partir del BISP activo, se inyecta solo cuando hay un BISP cargado:

```javascript
// background.js
function buildSessionPrompt(bisp) {
  return `
SESIÓN ACTIVA CON CONTEXTO BISP.
REGLA DE ORO — SESIÓN PRÍSTINA:
Tu rol en esta sesión es PASIVO y REACTIVO.
El ingeniero está trabajando con una AI web en paralelo.
No emitas advertencias proactivas ni intervengas en el flujo principal.
Si detectás una divergencia entre lo que propone la AI web y este BISP,
retené esa información y exponela solo si el ingeniero te lo pregunta.
Tu objetivo: que el ingeniero nunca tenga que preguntarle a la AI web
sobre consistencia de arquitectura. Para eso estás vos.
  `.trim();
}
```

> **Nota de mantenimiento:** Cualquier cambio en el system prompt de sesión es un cambio de comportamiento del Companion. Versionarlo junto al BISP package.

### 5.7 `captureAndSendScreenshot()`

Captura la pestaña activa via `chrome.tabs.captureVisibleTab()` (ejecutado en `background.js`, ya que `companion.js` no tiene acceso directo a tabs fuera del panel) y envía la imagen al companion simulando un evento `paste` con `DataTransfer`.

### 5.8 Bridge de mensajes (`chrome.runtime`)

`companion.js` escucha los mensajes definidos formalmente en `companionProtocol.js` (ver §6), entrantes desde `background.js` o Cortex:

| Mensaje | `autoSend` | Comportamiento |
|---|---|---|
| `INJECT_BRIEF` | `false` | Inyecta el último brief de Cortex en el campo de chat. El ingeniero ve el texto y decide si enviarlo. Carga manual explícita. |
| `INJECT_BISP` | `true` | Inyecta el BISP completo con system prompt de sesión, previa validación contra `companion.schema.json`. El ingeniero no percibe la inyección. Statusbar actualiza a `SILENT_MONITORING`. |
| `INJECT_TEXT` | configurable | Inyección de texto libre. El flag `autoSend` en el payload determina el comportamiento. |
| `NEW_SESSION` | `true` (system prompt) | Recarga el webview, re-inyecta el `SYSTEM_PROMPT` base. Si hay un BISP activo en `background.js`, lo re-inyecta también. Las cookies de Google no se borran. |

Todos estos mensajes solo se procesan si el ducto Synapse ya está en `handshake_confirm` (§2.6). Si llegan antes, `companion.js` los descarta y loguea una advertencia — no deberían ocurrir en condiciones normales porque `background.js` no los emite hasta ese punto, pero la validación en el receptor es defensiva.

---

## 6. companion/companionProtocol.js — Manifiesto del protocolo *(nuevo v1.2)*

Este archivo formaliza, para el activo `companion`, lo que `discoveryProtocol.js`/`landingProtocol.js`/`harnessProtocol.js` ya hacen para sus respectivos activos: declarar los mensajes que el activo entiende, su dirección y su contrato de payload, de modo que `background.js` pueda validar el ruteo sin conocer los detalles internos de `companion.js`.

```javascript
// companion/companionProtocol.js

export const COMPANION_PROTOCOL = {
  asset: 'companion',
  version: '1.2.0',

  messages: {
    INJECT_BISP: {
      direction: 'brain -> companion',
      requiresHandshake: true,
      payloadSchemaRef: 'protocols/companion.schema.json#/definitions/bisp',
    },
    INJECT_BRIEF: {
      direction: 'brain -> companion',
      requiresHandshake: true,
      payloadSchemaRef: 'protocols/companion.schema.json#/definitions/brief',
    },
    INJECT_TEXT: {
      direction: 'brain -> companion',
      requiresHandshake: true,
      payloadSchemaRef: 'protocols/companion.schema.json#/definitions/freeText',
    },
    NEW_SESSION: {
      direction: 'brain -> companion',
      requiresHandshake: true,
      payloadSchemaRef: null,
    },
    // Mensajes salientes del Companion hacia el ducto
    SLAVE_MODE_CHANGED: {
      direction: 'companion -> brain',
      requiresHandshake: true,
    },
  },
};
```

`background.js` usa `COMPANION_PROTOCOL.messages[type].requiresHandshake` para decidir si un mensaje entrante/saliente puede rutearse en el estado actual del ducto, antes de tocar el payload.

---

## 7. background.js — Responsabilidades

El `background.js` incorpora las siguientes responsabilidades para que el Companion, como cuarto activo Synapse, funcione en v1.2.

### 7.1 Captura de pantalla de pestaña activa

`companion.js` no puede llamar a `chrome.tabs.captureVisibleTab()` directamente porque opera en el contexto del Side Panel. `background.js` actúa como proxy:

```javascript
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'CAPTURE_TAB_SCREENSHOT') {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab) { sendResponse({ error: 'No active tab found' }); return; }
      chrome.tabs.captureVisibleTab(
        tab.windowId,
        { format: 'png', quality: 90 },
        (dataUrl) => {
          if (chrome.runtime.lastError) {
            sendResponse({ error: chrome.runtime.lastError.message });
          } else {
            sendResponse({ dataUrl });
          }
        }
      );
    });
    return true;
  }
});
```

### 7.2 Almacenamiento del último brief y del BISP activo

```javascript
// Variables en memoria (se pierden al cerrar el navegador — comportamiento esperado)
let _lastCortexBrief = null;  // Último brief manual (botón "Brief")
let _activeBisp      = null;  // BISP de la sesión activa (push automático)

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

  // Cortex guarda el brief después de ejecutar un intent (carga manual)
  if (msg.type === 'STORE_BRIEF') {
    _lastCortexBrief = msg.brief;
    sendResponse({ ok: true });
  }

  // companion.js recupera el último brief (botón "Brief" del toolbar)
  if (msg.type === 'GET_LAST_BRIEF') {
    sendResponse({ brief: _lastCortexBrief });
  }

  // Cortex registra el BISP activo de la sesión (carga silenciosa)
  if (msg.type === 'STORE_BISP') {
    _activeBisp = msg.bisp;
    sendResponse({ ok: true });
  }

  // companion.js recupera el BISP activo al arrancar (por si el panel se abrió tarde)
  if (msg.type === 'GET_ACTIVE_BISP') {
    sendResponse({ bisp: _activeBisp });
  }

});
```

### 7.3 Detección de UI de AI web — Push automático del BISP

Cuando el ingeniero navega a una UI de AI web dentro de los dominios declarados en `host_permissions` y hay un BISP activo en memoria, `background.js` dispara automáticamente la inyección en el Companion — siempre que el handshake ya esté confirmado (§2.6):

```javascript
const AI_WEB_URLS = ['claude.ai', 'chatgpt.com', 'gemini.google.com'];

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const isAIWeb = AI_WEB_URLS.some(url => tab.url?.includes(url));

  if (changeInfo.status === 'complete' && isAIWeb && _activeBisp && synapseState.phase === 'handshake_confirm') {
    chrome.runtime.sendMessage({
      type: 'INJECT_BISP',
      bisp: _activeBisp,
      systemPrompt: buildSessionPrompt(_activeBisp),
    });
  }
});
```

**Caso: Companion abierto tarde.** Si el ingeniero ya está en una UI de AI web cuando abre el Companion, `onDomReady()` en `companion.js` consulta `GET_ACTIVE_BISP` al arrancar. Si hay un BISP activo, lo carga sin necesidad de que el tab cambie:

```javascript
// companion.js — dentro de onDomReady(), después del system prompt base
async function loadActiveBispIfPresent() {
  const { bisp } = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_BISP' });
  if (bisp) {
    await injectBisp(bisp, buildSessionPrompt(bisp));
  }
}
```

### 7.4 `startGoogleAuthWatcher()` — Condición 1 del onboarding

Ver `AUTHORITY_BOUNDARY.md` §2.3 para la implementación de referencia completa. En resumen: un listener de `chrome.tabs.onUpdated` observa la tab de registro de Google mientras `onboarding_state.currentStep === 'google_waiting'`, y emite `ACCOUNT_REGISTERED` al detectar una URL alcanzable solo con sesión activa (dos capas de patrones: éxito conocido e interstitial de `accounts.google.com`). Nunca lee el DOM ni el título de la tab.

### 7.5 Ruteo del ducto Synapse hacia el activo `companion`

`background.js` extiende su ruteador de mensajes para reconocer `companion` como destino/origen válido, consultando `COMPANION_PROTOCOL` (§6) antes de reenviar:

```javascript
function routeToCompanion(msg) {
  const spec = COMPANION_PROTOCOL.messages[msg.type];
  if (!spec) return; // tipo desconocido para este activo, ignorar
  if (spec.requiresHandshake && synapseState.phase !== 'handshake_confirm') {
    console.warn(`Mensaje ${msg.type} descartado: handshake no confirmado`);
    return;
  }
  chrome.runtime.sendMessage(msg); // companion.js lo recibe vía su propio listener
}
```

### 7.6 Integración desde Cortex (`context.js`)

Cuando Cortex termina de procesar un intent, registra tanto el brief manual como el BISP de sesión:

```javascript
// context.js (Cortex) — integración con el companion

async function processIntent(intent) {
  const result = await callClaudeAPI(intent);

  // Brief para carga manual (botón "Brief" del toolbar)
  const brief = {
    intentType:     intent.type,
    summary:        result.summary,
    openDecision:   result.pendingDecision ?? null,
    suggestedQuery: result.suggestedQuery  ?? null,
  };
  chrome.runtime.sendMessage({ type: 'STORE_BRIEF', brief });

  // BISP para carga silenciosa de sesión (push automático al detectar AI web)
  const bisp = {
    intentType:      intent.type,
    summary:         result.summary,
    openDecision:    result.pendingDecision  ?? null,
    findingsSummary: result.findingsSummary  ?? null,
    domainTags:      result.domainTags       ?? [],
  };
  chrome.runtime.sendMessage({ type: 'STORE_BISP', bisp });

  return result;
}
```

> `STORE_BRIEF` y `STORE_BISP` son mensajes distintos con propósitos distintos. El brief es el objeto compacto para consulta manual. El BISP es el contexto completo de sesión para carga silenciosa. No colapsar en un solo mensaje.

---

## 8. protocols/companion.schema.json — Schema de validación *(nuevo v1.2)*

Define la forma esperada de los payloads `bisp`, `brief` y `freeText` referenciados desde `companionProtocol.js`. Un esqueleto de referencia:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Companion Protocol Payloads",
  "definitions": {
    "bisp": {
      "type": "object",
      "required": ["intentType", "summary"],
      "properties": {
        "intentType":      { "type": "string" },
        "summary":         { "type": "string" },
        "openDecision":    { "type": ["string", "null"] },
        "findingsSummary": { "type": ["string", "null"] },
        "domainTags":      { "type": "array", "items": { "type": "string" } }
      }
    },
    "brief": {
      "type": "object",
      "required": ["intentType", "summary"],
      "properties": {
        "intentType":     { "type": "string" },
        "summary":        { "type": "string" },
        "openDecision":   { "type": ["string", "null"] },
        "suggestedQuery": { "type": ["string", "null"] }
      }
    },
    "freeText": {
      "type": "object",
      "required": ["text", "autoSend"],
      "properties": {
        "text":     { "type": "string" },
        "autoSend": { "type": "boolean" }
      }
    }
  }
}
```

Este schema es la fuente de verdad que `injectBisp()` (§5.5) usa para descartar payloads malformados antes de tocar el webview.

---

## 9. manifest.json — Permisos requeridos (Store-Ready)

```json
{
  "manifest_version": 3,
  "name": "Cognituum Cortex",
  "version": "3.0.0",

  "permissions": [
    "sidePanel",
    "nativeMessaging",
    "storage",
    "tabs",
    "scripting",
    "notifications"
  ],

  "host_permissions": [
    "https://gemini.google.com/*",
    "https://claude.ai/*",
    "https://chatgpt.com/*",
    "https://github.com/*"
  ],

  "background": {
    "service_worker": "background.js",
    "type": "module"
  },

  "side_panel": {
    "default_path": "companion/index.html"
  },

  "action": {
    "default_title": "Abrir Cognituum Companion"
  },

  "web_accessible_resources": [
    {
      "resources": ["companion/*", "protocols/*"],
      "matches": ["<all_urls>"]
    }
  ]
}
```

> **Sin `clipboardRead`:** eliminado por completo del manifest de producción. Ningún flujo del Companion ni del onboarding depende de leer el portapapeles — ver §2.1 Condición 2.

> **`host_permissions` (Privilegio Mínimo):** restringido a los cuatro dominios de ingeniería declarados. Sin él, `webview.executeScript()` e `insertCSS()` sobre `gemini.google.com` fallarían silenciosamente en Manifest V3; para `claude.ai`/`chatgpt.com`/`github.com` habilita la detección de UI de AI web por URL (§7.3), no inyección de contenido en esas páginas.

> **`tabs`:** Requerido tanto para `captureVisibleTab` (screenshot) como para `chrome.tabs.onUpdated` (detección de UI de AI web y `startGoogleAuthWatcher`). Sin este permiso, el push automático del BISP no funciona.

> **`nativeMessaging`:** Requerido para el ducto Synapse hacia Brain — es la base de todo el handshake de 3 fases descrito en §2.6.

---

## 10. Checklist de integración v1.2

### 10.1 Archivos nuevos
- [ ] `companion/index.html` presente en `extension/companion/` (renombrado desde `panel.html`).
- [ ] `companion/companion.js` presente en `extension/companion/` (renombrado desde `panel.js`).
- [ ] `companion/companionProtocol.js` implementado con el manifiesto de mensajes (§6).
- [ ] `companion/styles.css` extraído de los estilos inline previos.
- [ ] `protocols/companion.schema.json` implementado (§8).

### 10.2 Archivos modificados
- [ ] `background.js`: ruteador extendido para el activo `companion` vía `routeToCompanion()` (§7.5). Handlers `CAPTURE_TAB_SCREENSHOT`, `STORE_BRIEF`, `GET_LAST_BRIEF`, `STORE_BISP`, `GET_ACTIVE_BISP` mantenidos. Listener `chrome.tabs.onUpdated` con detección de AI web condicionada a `handshake_confirm`. `startGoogleAuthWatcher()` implementado según `AUTHORITY_BOUNDARY.md` §2.3.
- [ ] `manifest.json`: `host_permissions` restringidos a Gemini/Claude/ChatGPT/GitHub. Sin `clipboardRead`. `side_panel.default_path` apunta a `companion/index.html`. Versión `3.0.0`.
- [ ] `discovery/onboarding.js`: Clipboard Monitor para Gemini eliminado. Formulario de entrada manual para API key de Gemini implementado, dispara `API_KEY_REGISTERED` (§2.1 Condición 2).
- [ ] `context.js` (Cortex): llamadas a `STORE_BRIEF` y `STORE_BISP` después de procesar cada intent (sin cambios respecto a v1.1).
- [ ] `landingProtocol.js`: `isCompanionAvailable()` actualizado para exigir también `handshake_confirm` (§2.4).
- [ ] `companion.js`: `injectBisp()` valida contra `companion.schema.json` antes de inyectar (§5.5). `onDomReady()` verifica estado de handshake antes de arrancar la secuencia de inyección (§5.2).

### 10.3 Verificación funcional — Flujo base
- [ ] El botón "Companion" en Landing aparece deshabilitado si el perfil no tiene cuenta Google y API key de Gemini registradas, o si el handshake Synapse no llegó a `handshake_confirm`.
- [ ] El botón se habilita correctamente al completar el onboarding con ambas condiciones satisfechas y el handshake confirmado.
- [ ] El panel lateral se abre desde el botón de Landing.
- [ ] Gemini carga en formato móvil (sin sidebar, sin header completo).
- [ ] El system prompt base se envía y Gemini responde `"Companion activo. ¿Qué analizamos?"`.
- [ ] El botón "Brief" recupera e inyecta el último intent de Cortex en el campo de chat con `autoSend=false`.
- [ ] El botón "Screenshot" captura la pestaña activa y la imagen aparece en el chat.
- [ ] El botón "Reset" inicia un nuevo chat con el system prompt base re-inyectado.
- [ ] El login de Google persiste al cerrar y reabrir el panel lateral.

### 10.4 Verificación funcional — BISP nativo y ducto Synapse (v1.2)
- [ ] Al navegar a `claude.ai` con un BISP activo en memoria y el handshake confirmado, el statusbar del Companion cambia a `● Sesión activa — BISP cargado` sin intervención del ingeniero.
- [ ] Si el handshake **no** está confirmado, el statusbar muestra `○ Ducto no confirmado` y ningún `INJECT_BISP` llega al Companion aunque la tab de AI web esté activa.
- [ ] El historial del chat de `claude.ai` no contiene ningún mensaje generado por el Companion.
- [ ] Si el Companion se abre cuando ya hay un tab de AI web activo, `GET_ACTIVE_BISP` retorna el BISP correcto y `loadActiveBispIfPresent()` lo carga al arrancar.
- [ ] Un payload de BISP malformado (que no cumple `companion.schema.json`) es descartado por `injectBisp()` y logueado, sin llegar al webview.
- [ ] Al consultar al Companion sobre el BISP activo, responde con el contexto correcto de la sesión.
- [ ] El botón "Reset" re-inyecta el BISP activo junto al system prompt base si `_activeBisp !== null`.
- [ ] Si Cortex procesa un nuevo intent durante la sesión, `STORE_BISP` actualiza `_activeBisp` y un Reset refleja el contexto actualizado.

### 10.5 Verificación funcional — Onboarding manual (v1.2)
- [ ] El formulario de entrada manual de la API key de Gemini en Discovery valida el formato localmente antes de emitir `API_KEY_REGISTERED`.
- [ ] Ningún código de la extensión invoca `navigator.clipboard.read()` ni declara `clipboardRead` en el manifest.
- [ ] `ACCOUNT_REGISTERED` para `service: 'google'` sigue emitiéndose por `startGoogleAuthWatcher()` (detección por URL), no por el formulario manual.

---

## 11. Notas de mantenimiento

### 11.1 Cambios en la UI de Gemini

Google actualiza su SPA frecuentemente. Si el companion pierde la limpieza de UI, revisar y actualizar los selectores CSS en la constante `ISOLATION_CSS` de `companion.js`. Priorizar selectores de `role` y `aria` sobre clases BEM — son más estables entre deploys.

### 11.2 Inyección de texto rota

Si el botón "Send" de Gemini queda gris después de la inyección, el framework interno cambió su modelo de eventos. Revisar la cadena de eventos en `injectAndFire()` dentro de `injectTextToGemini()`. La causa más común es que `execCommand` quedó deprecado en la versión de Chromium usada — en ese caso, usar solo el `InputEvent` nativo con `inputType: "insertText"`.

### 11.3 System prompt

La constante `SYSTEM_PROMPT` base en `companion.js` puede editarse libremente para ajustar el rol del companion. El system prompt de sesión en `buildSessionPrompt()` de `background.js` está acoplado al contrato del BISP: cualquier cambio de comportamiento debe quedar registrado en el documento de decisiones del BISP. Se recomienda versionar ambos juntos.

### 11.4 Condiciones de activación desincronizadas

Si un perfil reporta que el botón de Companion está deshabilitado a pesar de haber completado el onboarding, verificar:

1. Que `linked_accounts` en el objeto de perfil incluye entradas para `google` y `gemini` con `status: 'active'`.
2. Que Brain persistió correctamente el evento `onboarding_complete` — revisar los logs del Temporal workflow.
3. Que `data-loader.js` en Landing está cargando el objeto de perfil actualizado y no una versión cacheada en `chrome.storage.local`.
4. **(nuevo v1.2)** Que el ducto Synapse efectivamente llegó a `handshake_confirm` — revisar logs de `extension_ready`/`host_ready`/`handshake_confirm` en `background.js`. Un perfil con `linked_accounts` completo pero handshake caído mostrará el botón deshabilitado, y esto es el comportamiento esperado, no un bug.

### 11.5 BISP no llega al Companion

Si el statusbar nunca cambia a `SILENT_MONITORING` a pesar de haber procesado un intent:

1. Verificar que `context.js` ejecuta `STORE_BISP` después del intent y que `_activeBisp` en `background.js` no es `null`.
2. Verificar que `chrome.tabs.onUpdated` está registrado y que la URL del tab activo coincide con alguna entrada de `AI_WEB_URLS`.
3. Verificar que el handshake Synapse está en `handshake_confirm` — si no lo está, `background.js` descarta el `INJECT_BISP` por diseño (§7.3, §7.5).
4. Si el Companion se abrió antes de navegar a la AI web, verificar que `loadActiveBispIfPresent()` se ejecuta en `onDomReady()` y que `GET_ACTIVE_BISP` retorna el BISP correcto.
5. Revisar los permisos de `tabs` en `manifest.json` — sin ellos, `chrome.tabs.onUpdated` no dispara.
6. **(nuevo v1.2)** Verificar que el BISP no fue descartado silenciosamente por no cumplir `companion.schema.json` en `injectBisp()` — revisar el log de consola del webview.

### 11.6 Onboarding manual de credenciales (v1.2)

Si un perfil no puede completar la Condición 2 (§2.1):

1. Verificar que el formulario de Discovery emite `API_KEY_REGISTERED` al submit, no antes.
2. Verificar que la validación local de formato (regex) no está rechazando keys válidas por un patrón desactualizado.
3. Confirmar que no queda ningún listener de clipboard residual de v1.1 — su presencia junto al nuevo flujo manual duplicaría la detección y generaría estados inconsistentes en `linked_accounts`.
4. Consultar `AUTHORITY_BOUNDARY.md` §6 antes de reactivar cualquier automatización de tipo `dom_type`/`dom_click` sobre la puerta del proveedor — ese camino está reservado exclusivamente al Harness de debug y nunca al onboarding real.

---

*Cognituum · Companion Panel v1.2 (Store-Ready Edition) · Documento de implementación para el equipo de desarrollo*
