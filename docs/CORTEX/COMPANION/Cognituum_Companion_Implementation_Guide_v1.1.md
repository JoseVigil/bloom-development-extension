# COGNITUUM · Companion Cognitivo
## Guía de Implementación — Gemini Side Panel

**Módulo:** Gemini Side Panel · **Versión:** 1.1  
**Componentes:** `panel.html` · `panel.js` · `background.js`

Este documento describe la arquitectura, decisiones de diseño e instrucciones de integración para el panel lateral companion de Cognituum. Está dirigido al desarrollador que implementa o mantiene estos archivos dentro del build custom de Chromium.

---

## Registro de cambios

| Versión | Fecha | Cambios |
|---|---|---|
| v1.0 | 2026-05-23 | Implementación inicial: webview Gemini, inyección de briefs, screenshot, system prompt. |
| v1.1 | 2026-06-29 | BISP como contexto nativo del Companion. Nuevo flujo `INJECT_BISP` con push automático al detectar UI de AI web. Principio de Sesión Prístina. Estado `SILENT_MONITORING`. Nuevo tipo de mensaje `NEW_SESSION`. Tabla de mensajes extendida. |

---

## 1. Contexto del sistema

Cognituum es un sistema de asistencia cognitiva para ingenieros de software donde el ingeniero toma todas las decisiones. El pipeline central se llama **BTIPS** (Bloom Technical Intent Package System): unidades estructuradas de intención técnica procesadas por un LLM via API, gestionadas por el módulo **Cortex**.

El **Companion Cognitivo** es un panel lateral embebido en el navegador que provee una segunda opinión inmediata sin interrumpir el flujo de trabajo. No reemplaza el pipeline de BTIPS ni tiene acceso directo al contexto de Cortex — es un recurso solidario a la decisión del ingeniero.

A partir de la v1.1, el Companion puede recibir el **BISP activo de la sesión como contexto nativo**, cargado en background antes de que el ingeniero interactúe con la UI de la AI web. Esto lo convierte en un validador silencioso de arquitectura disponible bajo demanda, sin contaminar la sesión principal.

---

## 2. Condiciones de activación del Companion

El Companion **no puede activarse en cualquier momento**. Su disponibilidad depende de que el perfil haya completado el onboarding correctamente en la Discovery Page.

### 2.1 Prerequisitos obligatorios

**Condición 1 — Cuenta Google registrada**

Durante el onboarding (`register=true` en `SYNAPSE_CONFIG`), el usuario debe haber completado el paso de autenticación de Google. Cuando se completa, Discovery emite:

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

**Condición 2 — API key de Gemini registrada**

El Clipboard Monitor de `background.js` detecta automáticamente una API key de Gemini cuando el usuario la copia durante el paso `gemini_api_waiting` del onboarding. Cuando se valida y registra, Brain emite `API_KEY_REGISTERED` con `service: 'gemini'` hacia la Discovery Page.

Ambas condiciones deben cumplirse dentro del mismo flujo de onboarding. No existe un orden impuesto entre ellas, pero Discovery no emite `onboarding_complete` hasta que el perfil las tenga ambas registradas.

### 2.2 Señal de habilitación — `onboarding_complete`

Cuando el onboarding finaliza, Discovery notifica a Brain:

```javascript
chrome.runtime.sendMessage({
  event: 'onboarding_complete',
  payload: { email, api_key_validated: true }
})
```

Brain persiste este estado en el perfil. A partir de este momento, el perfil tiene `linked_accounts` que incluye entradas para `google` y `gemini`. Este campo es la fuente de verdad que Landing usa para determinar si el Companion está disponible.

### 2.3 Punto de activación — Landing Page

El botón de activación del Companion se expone en la **Landing Page**, no antes. Esta decisión es deliberada:

- En Discovery el handshake puede no estar completamente confirmado todavía.
- El webview del Companion necesita la sesión de Google activa (`partition: persist:gemini-session`), que solo existe después de que el login fue completado durante el onboarding.
- Landing es el cockpit permanente de la sesión: es el lugar correcto para controles de herramientas persistentes.

### 2.4 Implementación del guard en Landing

`landingProtocol.js` debe verificar `linked_accounts` antes de renderizar el botón del Companion:

```javascript
// landingProtocol.js — dentro de renderActions()

function isCompanionAvailable(profile) {
  const accounts = profile?.accounts ?? [];
  const hasGoogle = accounts.some(a => a.provider === 'google' && a.status === 'active');
  const hasGemini = accounts.some(a => a.provider === 'gemini' && a.status === 'active');
  return hasGoogle && hasGemini;
}

function renderActions(profile) {
  const companionEnabled = isCompanionAvailable(profile);

  const btn = document.createElement('button');
  btn.textContent = 'Abrir Companion';
  btn.disabled = !companionEnabled;
  btn.title = companionEnabled
    ? 'Abrir el panel lateral de Gemini'
    : 'Requiere cuenta Google y API key de Gemini registradas';

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
  ├─ ACCOUNT_REGISTERED · service: google    ──┐
  └─ API_KEY_REGISTERED · service: gemini    ──┤
                                               ▼
                                    onboarding_complete
                                    Brain persiste linked_accounts

Landing Page (sesión activa)
  └─ renderActions()
       ├─ [linked_accounts tiene google + gemini] → botón habilitado
       └─ [falta alguno]                          → botón deshabilitado

Companion activado
  └─ chrome.sidePanel.open()
       └─ panel.html · webview → gemini.google.com
            └─ "Companion activo. ¿Qué analizamos?"
```

---

## 3. Arquitectura del Companion Panel

### 3.1 Filosofía de diseño

- El panel embebe `gemini.google.com` via `<webview>` nativo de Chromium (no iframe).
- El usuario usa su propia cuenta de Google — costo $0 para el sistema.
- Cortex puede inyectar contexto estructurado (briefs o BISP completo) bajo demanda o automáticamente al detectar una sesión de AI web activa.
- El ingeniero siempre tiene control: la inyección prepara, él decide si consultar y cuándo.

### 3.2 Principio de Sesión Prístina

El Companion opera bajo el **Principio de Sesión Prístina**: la sesión de la AI web (claude.ai, ChatGPT, Grok) debe contener exclusivamente la conversación técnica entre el ingeniero y el modelo. Sin preguntas de control de contexto, sin verificaciones de consistencia con el BISP, sin ruido de gobernanza.

Cuando el ingeniero necesita validar si una propuesta de la AI web rompe la arquitectura documentada en el BISP, **abre el panel del Companion y pregunta allí**, manteniendo el historial de la AI web completamente limpio.

El Companion **nunca** emite outputs proactivos durante una sesión activa con la AI web. Si detecta una divergencia entre lo que propone la AI web y el BISP cargado, la retiene en su contexto y la expone solo cuando el ingeniero lo consulta directamente.

### 3.3 Mapa de archivos

| Archivo | Descripción |
|---|---|
| `panel.html` | Estructura visual del panel lateral. Define el `<webview>`, toolbar de acciones y statusbar. |
| `panel.js` | Lógica de control: ciclo de vida del webview, CSS injection, inyección de briefs y BISP, captura de screenshot, bridge con Cortex. |
| `background.js` | Service worker de la extensión. Captura de pestañas, almacenamiento del BISP activo, detección de UI de AI web, routing de mensajes. |
| `manifest.json` | Configuración de la extensión. Requiere permisos específicos para el funcionamiento del companion. |

### 3.4 Diagrama de comunicación

```
Cortex (context.js)
    │
    ├─── Intent API ──────────────────► Claude / AI web (pipeline BTIPS)
    │
    └─── STORE_BISP message ──────────► background.js
                                             │
                          ┌──────────────────┴────────────────────┐
                          │ Tab AI web detectado                   │ Botón "Brief"
                          │ INJECT_BISP (auto, silencioso)         │ INJECT_BRIEF (manual)
                          ▼                                        ▼
                    panel.js (bridge)                        panel.js (bridge)
                          │                                        │
              executeScript() │ insertCSS()            executeScript() │ insertCSS()
                          │                                        │
                          ▼                                        ▼
                <webview> gemini.google.com          <webview> gemini.google.com
                 Estado: SILENT_MONITORING            El ingeniero ve el texto y
                 El ingeniero no percibe              decide si enviar
                 la inyección
```

---

## 4. panel.html — Estructura visual

### 4.1 Componentes del layout

- **Toolbar (`#toolbar`):** Contiene la marca "Cognituum" y tres botones de acción.
- **Webview wrap (`#webview-wrap`):** Contenedor flex que ocupa el espacio restante.
- **`<webview id="gemini-companion">`:** El componente nativo de Chromium.
- **Loading overlay (`#loading-overlay`):** Se oculta al dispararse el evento `dom-ready`.
- **Status bar (`#statusbar`):** Muestra estado de conexión, nombre de sesión y estado BISP.
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

> **`allowpopups=`** Necesario para los flows de autenticación de Google (OAuth, verificación de cuenta). Sin esto, el login puede quedar bloqueado silenciosamente.

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
| Cargando | `Conectando…` | El webview está cargando Gemini. |
| Listo sin BISP | `● Companion activo` | System prompt inyectado. Sin BISP de sesión. |
| SILENT_MONITORING | `● Sesión activa — BISP cargado` | BISP inyectado en background. El Companion tiene contexto completo y espera consulta. |
| Error de carga | `✕ Error de conexión` | El webview no pudo cargar. |

---

## 5. panel.js — Lógica de control

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
4. Inyectar el `SYSTEM_PROMPT` base de Cognituum con `autoSend=true`.
5. Si `background.js` tiene un BISP activo (`_activeBisp !== null`), inyectarlo inmediatamente después con `autoSend=true` como extensión del system prompt.

El paso 5 garantiza que cuando el Companion termina de arrancar, ya tiene el contexto de la sesión cargado sin intervención del ingeniero.

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

### 5.5 `injectBisp(bisp, systemPrompt)` — Carga silenciosa de sesión *(nuevo v1.1)*

Punto de entrada para la carga automática del BISP activo. A diferencia de `injectBrief()`, esta función opera en background y no produce feedback visible para el ingeniero salvo la actualización del statusbar.

```javascript
async function injectBisp(bisp, systemPrompt) {
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

**`SYSTEM_PROMPT` base** — constante en `panel.js`, se inyecta en cada `onDomReady()`:

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

Captura la pestaña activa via `chrome.tabs.captureVisibleTab()` (ejecutado en `background.js`, ya que `panel.js` no tiene acceso directo a tabs fuera del panel) y envía la imagen al companion simulando un evento `paste` con `DataTransfer`.

### 5.8 Bridge de mensajes (`chrome.runtime`)

`panel.js` escucha los siguientes tipos de mensajes entrantes desde `background.js` o Cortex:

| Mensaje | `autoSend` | Comportamiento |
|---|---|---|
| `INJECT_BRIEF` | `false` | Inyecta el último brief de Cortex en el campo de chat. El ingeniero ve el texto y decide si enviarlo. Carga manual explícita. |
| `INJECT_BISP` | `true` | Inyecta el BISP completo con system prompt de sesión. El ingeniero no percibe la inyección. Statusbar actualiza a `SILENT_MONITORING`. |
| `INJECT_TEXT` | configurable | Inyección de texto libre. El flag `autoSend` en el payload determina el comportamiento. |
| `NEW_SESSION` | `true` (system prompt) | Recarga el webview, re-inyecta el `SYSTEM_PROMPT` base. Si hay un BISP activo en `background.js`, lo re-inyecta también. Las cookies de Google no se borran. |

---

## 6. background.js — Responsabilidades

El `background.js` existente debe incorporar cuatro responsabilidades para que el companion v1.1 funcione.

### 6.1 Captura de pantalla de pestaña activa

`panel.js` no puede llamar a `chrome.tabs.captureVisibleTab()` directamente porque opera en el contexto del Side Panel. `background.js` actúa como proxy:

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

### 6.2 Almacenamiento del último brief y del BISP activo

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

  // panel.js recupera el último brief (botón "Brief" del toolbar)
  if (msg.type === 'GET_LAST_BRIEF') {
    sendResponse({ brief: _lastCortexBrief });
  }

  // Cortex registra el BISP activo de la sesión (carga silenciosa)
  if (msg.type === 'STORE_BISP') {
    _activeBisp = msg.bisp;
    sendResponse({ ok: true });
  }

  // panel.js recupera el BISP activo al arrancar (por si el panel se abrió tarde)
  if (msg.type === 'GET_ACTIVE_BISP') {
    sendResponse({ bisp: _activeBisp });
  }

});
```

### 6.3 Detección de UI de AI web — Push automático del BISP *(nuevo v1.1)*

Cuando el ingeniero navega a una UI de AI web y hay un BISP activo en memoria, `background.js` dispara automáticamente la inyección en el Companion:

```javascript
const AI_WEB_URLS = ['claude.ai', 'chat.openai.com', 'grok.com'];

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const isAIWeb = AI_WEB_URLS.some(url => tab.url?.includes(url));

  if (changeInfo.status === 'complete' && isAIWeb && _activeBisp) {
    chrome.runtime.sendMessage({
      type: 'INJECT_BISP',
      bisp: _activeBisp,
      systemPrompt: buildSessionPrompt(_activeBisp),
    });
  }
});
```

**Caso: Companion abierto tarde.** Si el ingeniero ya está en una UI de AI web cuando abre el Companion, `onDomReady()` en `panel.js` consulta `GET_ACTIVE_BISP` al arrancar. Si hay un BISP activo, lo carga sin necesidad de que el tab cambie:

```javascript
// panel.js — dentro de onDomReady(), después del system prompt base
async function loadActiveBispIfPresent() {
  const { bisp } = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_BISP' });
  if (bisp) {
    await injectBisp(bisp, buildSessionPrompt(bisp));
  }
}
```

### 6.4 Integración desde Cortex (`context.js`)

Cuando Cortex termina de procesar un intent, registra tanto el brief manual como el BISP de sesión:

```javascript
// context.js (Cortex) — integración con el companion v1.1

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

## 7. manifest.json — Permisos requeridos

```json
{
  "manifest_version": 3,
  "name": "Cognituum",
  "version": "1.1.0",

  "permissions": [
    "sidePanel",
    "activeTab",
    "scripting",
    "tabs",
    "storage"
  ],

  "host_permissions": [
    "https://gemini.google.com/*"
  ],

  "background": {
    "service_worker": "background.js"
  },

  "side_panel": {
    "default_path": "panel.html"
  },

  "action": {
    "default_title": "Cognituum Companion"
  }
}
```

> **`host_permissions`:** Obligatorio para que `webview.executeScript()` e `insertCSS()` funcionen. Sin él, las llamadas fallan silenciosamente en Manifest V3.

> **`tabs`:** Requerido tanto para `captureVisibleTab` (screenshot) como para `chrome.tabs.onUpdated` (detección de UI de AI web). Sin este permiso, el push automático del BISP no funciona.

---

## 8. Checklist de integración v1.1

### 8.1 Archivos nuevos
- [ ] `panel.html` presente en la raíz de la extensión.
- [ ] `panel.js` presente en la raíz de la extensión.

### 8.2 Archivos modificados
- [ ] `background.js`: handlers `CAPTURE_TAB_SCREENSHOT`, `STORE_BRIEF`, `GET_LAST_BRIEF`, `STORE_BISP`, `GET_ACTIVE_BISP` agregados. Listener `chrome.tabs.onUpdated` con detección de AI web y push de `INJECT_BISP`.
- [ ] `manifest.json`: permisos `sidePanel`, `activeTab`, `scripting`, `tabs`, `storage` y `host_permissions` para `gemini.google.com`. Versión actualizada a `1.1.0`.
- [ ] `context.js` (Cortex): llamadas a `STORE_BRIEF` y `STORE_BISP` después de procesar cada intent.
- [ ] `landingProtocol.js`: función `isCompanionAvailable()` implementada y guard en `renderActions()`.
- [ ] `panel.js`: función `injectBisp()`, función `loadActiveBispIfPresent()` en `onDomReady()`, manejo de mensaje `INJECT_BISP`, actualización de statusbar a `SILENT_MONITORING`.

### 8.3 Verificación funcional — Flujo base (v1.0)
- [ ] El botón "Companion" en Landing aparece deshabilitado si el perfil no tiene cuenta Google y API key de Gemini registradas.
- [ ] El botón se habilita correctamente al completar el onboarding con ambas condiciones satisfechas.
- [ ] El panel lateral se abre desde el botón de Landing.
- [ ] Gemini carga en formato móvil (sin sidebar, sin header completo).
- [ ] El system prompt base se envía y Gemini responde `"Companion activo. ¿Qué analizamos?"`.
- [ ] El botón "Brief" recupera e inyecta el último intent de Cortex en el campo de chat con `autoSend=false`.
- [ ] El botón "Screenshot" captura la pestaña activa y la imagen aparece en el chat.
- [ ] El botón "Reset" inicia un nuevo chat con el system prompt base re-inyectado.
- [ ] El login de Google persiste al cerrar y reabrir el panel lateral.

### 8.4 Verificación funcional — BISP nativo (v1.1)
- [ ] Al navegar a `claude.ai` con un BISP activo en memoria, el statusbar del Companion cambia a `● Sesión activa — BISP cargado` sin intervención del ingeniero.
- [ ] El historial del chat de `claude.ai` no contiene ningún mensaje generado por el Companion.
- [ ] Si el Companion se abre cuando ya hay un tab de AI web activo, `GET_ACTIVE_BISP` retorna el BISP correcto y `loadActiveBispIfPresent()` lo carga al arrancar.
- [ ] Al consultar al Companion sobre el BISP activo, responde con el contexto correcto de la sesión.
- [ ] El botón "Reset" re-inyecta el BISP activo junto al system prompt base si `_activeBisp !== null`.
- [ ] Si Cortex procesa un nuevo intent durante la sesión, `STORE_BISP` actualiza `_activeBisp` y un Reset refleja el contexto actualizado.

---

## 9. Notas de mantenimiento

### 9.1 Cambios en la UI de Gemini

Google actualiza su SPA frecuentemente. Si el companion pierde la limpieza de UI, revisar y actualizar los selectores CSS en la constante `ISOLATION_CSS` de `panel.js`. Priorizar selectores de `role` y `aria` sobre clases BEM — son más estables entre deploys.

### 9.2 Inyección de texto rota

Si el botón "Send" de Gemini queda gris después de la inyección, el framework interno cambió su modelo de eventos. Revisar la cadena de eventos en `injectAndFire()` dentro de `injectTextToGemini()`. La causa más común es que `execCommand` quedó deprecado en la versión de Chromium usada — en ese caso, usar solo el `InputEvent` nativo con `inputType: "insertText"`.

### 9.3 System prompt

La constante `SYSTEM_PROMPT` base en `panel.js` puede editarse libremente para ajustar el rol del companion. El system prompt de sesión en `buildSessionPrompt()` de `background.js` está acoplado al contrato del BISP: cualquier cambio de comportamiento debe quedar registrado en el documento de decisiones del BISP. Se recomienda versionar ambos juntos.

### 9.4 Condiciones de activación desincronizadas

Si un perfil reporta que el botón de Companion está deshabilitado a pesar de haber completado el onboarding, verificar:

1. Que `linked_accounts` en el objeto de perfil incluye entradas para `google` y `gemini` con `status: 'active'`.
2. Que Brain persistió correctamente el evento `onboarding_complete` — revisar los logs del Temporal workflow.
3. Que `data-loader.js` en Landing está cargando el objeto de perfil actualizado y no una versión cacheada en `chrome.storage.local`.

### 9.5 BISP no llega al Companion

Si el statusbar nunca cambia a `SILENT_MONITORING` a pesar de haber procesado un intent:

1. Verificar que `context.js` ejecuta `STORE_BISP` después del intent y que `_activeBisp` en `background.js` no es `null`.
2. Verificar que `chrome.tabs.onUpdated` está registrado y que la URL del tab activo coincide con alguna entrada de `AI_WEB_URLS`.
3. Si el Companion se abrió antes de navegar a la AI web, verificar que `loadActiveBispIfPresent()` se ejecuta en `onDomReady()` y que `GET_ACTIVE_BISP` retorna el BISP correcto.
4. Revisar los permisos de `tabs` en `manifest.json` — sin ellos, `chrome.tabs.onUpdated` no dispara.

---

*Cognituum · Companion Panel v1.1 · Documento de implementación para el equipo de desarrollo*
