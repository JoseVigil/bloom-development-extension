# COGNITUUM · Companion Cognitivo
## Guía de Implementación — Gemini Side Panel

**Módulo:** Gemini Side Panel · **Versión:** 1.1
**Componentes:** `panel.html` · `panel.js` · `background.js`

Este documento describe la arquitectura, decisiones de diseño e instrucciones de integración para el panel lateral companion de Cognituum. Está dirigido al desarrollador que implementa o mantiene estos archivos dentro del build custom de Chromium.

---

## 1. Contexto del sistema

Cognituum es un sistema de asistencia cognitiva para ingenieros de software donde el ingeniero toma todas las decisiones. El pipeline central se llama **BTIPS** (Bloom Technical Intent Package System): unidades estructuradas de intención técnica procesadas por un LLM via API, gestionadas por el módulo **Cortex**.

El **Companion Cognitivo** es un panel lateral embebido en el navegador que provee una segunda opinión inmediata sin interrumpir el flujo de trabajo. No reemplaza el pipeline de BTIPS ni tiene acceso directo al contexto de Cortex — es un recurso solidario a la decisión del ingeniero.

---

## 2. Condiciones de activación del Companion

El Companion **no puede activarse en cualquier momento**. Su disponibilidad depende de que el perfil haya completado el onboarding correctamente en la Discovery Page. Esta sección define las condiciones exactas y el punto de exposición en la UI.

### 2.1 Prerequisitos obligatorios

El Companion requiere que dos condiciones estén satisfechas antes de poder activarse:

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

`landingProtocol.js` debe verificar `linked_accounts` antes de renderizar el botón del Companion. El campo llega en el objeto de perfil cargado por `data-loader.js`:

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

  // Botón del Companion
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

Si `companionEnabled` es `false`, el botón se muestra deshabilitado con un tooltip que explica la condición faltante. Nunca se oculta: el ingeniero debe saber que la funcionalidad existe aunque no esté disponible aún.

### 2.5 Resumen del flujo de activación

```
Discovery (register=true)
  ├─ ACCOUNT_REGISTERED · service: google    ──┐
  └─ API_KEY_REGISTERED · service: gemini    ──┤
                                               ▼
                                    onboarding_complete
                                    Brain persiste linked_accounts
                                    Discovery Page se cierra

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
- Cortex puede inyectar contexto estructurado (briefs) bajo demanda del ingeniero.
- El ingeniero siempre tiene control: la inyección prepara, él decide si enviar.

### 3.2 Mapa de archivos

| Archivo | Descripción |
|---|---|
| `panel.html` | Estructura visual del panel lateral. Define el `<webview>`, toolbar de acciones y statusbar. |
| `panel.js` | Lógica de control: ciclo de vida del webview, CSS injection, inyección de briefs, captura de screenshot y bridge con Cortex. |
| `background.js` | Service worker de la extensión. Captura de pestañas, almacenamiento del último brief de Cortex y routing de mensajes. |
| `manifest.json` | Configuración de la extensión. Requiere permisos específicos para el funcionamiento del companion. |

### 3.3 Diagrama de comunicación

```
Cortex (context.js)
    │
    ├─── Intent API ──────────────────► Claude (pipeline BTIPS)
    │
    └─── INJECT_BRIEF message ────────► background.js
                                             │
                                             ▼
                                       panel.js (bridge)
                                             │
                                 executeScript() │ insertCSS()
                                             │
                                             ▼
                                   <webview> gemini.google.com
                                    partition="persist:gemini-session"
                                    UA: Android / Pixel 7
```

---

## 4. panel.html — Estructura visual

### 4.1 Componentes del layout

- **Toolbar (`#toolbar`):** Contiene la marca "Cognituum" y tres botones de acción.
- **Webview wrap (`#webview-wrap`):** Contenedor flex que ocupa el espacio restante.
- **`<webview id="gemini-companion">`:** El componente nativo de Chromium.
- **Loading overlay (`#loading-overlay`):** Se oculta al dispararse el evento `dom-ready`.
- **Status bar (`#statusbar`):** Muestra estado de conexión y nombre de la sesión.
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
| `#btn-brief` | Solicita el último brief almacenado en `background.js` (resultado del último intent de Cortex) y lo inyecta en el chat de Gemini. |
| `#btn-screenshot` | Captura la pestaña activa del navegador y la envía al companion para análisis visual. |
| `#btn-reset` | Recarga el webview manteniendo las cookies de sesión e inyecta el system prompt de Cognituum en el nuevo chat. |

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
4. Inyectar el `SYSTEM_PROMPT` de Cognituum con `autoSend=true` para que Gemini procese el contexto del rol.

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

### 5.4 `injectBrief(brief)` — API de Cortex

Punto de entrada público para que Cortex inyecte contexto estructurado. Recibe un objeto brief y lo formatea en un prompt legible:

```javascript
// Firma del objeto brief esperado:
{
  intentType:     string,  // Tipo de intent ejecutado por BTIPS
  summary:        string,  // Resumen del resultado
  openDecision:   string,  // Decisión pendiente del ingeniero
  suggestedQuery: string   // (opcional) Pregunta sugerida al companion
}

// Uso desde Cortex:
chrome.runtime.sendMessage({
  type: 'INJECT_BRIEF',
  brief: {
    intentType:    'ARCHITECTURE_REVIEW',
    summary:       'Cortex procesó 3 componentes con acoplamiento alto.',
    openDecision:  '¿Extraer interfaz o reestructurar módulo?',
    suggestedQuery: 'Analizá el trade-off entre ambas opciones.'
  }
});
```

> **`autoSend=false`:** El brief se inyecta en el campo de texto pero NO se envía automáticamente. El ingeniero lo lee, puede editarlo y decide cuándo presionar Enter. Coherente con la filosofía de Cognituum.

### 5.5 `captureAndSendScreenshot()`

Captura la pestaña activa via `chrome.tabs.captureVisibleTab()` (ejecutado en `background.js`, ya que `panel.js` no tiene acceso directo a tabs fuera del panel) y envía la imagen al companion simulando un evento `paste` con `DataTransfer`.

### 5.6 Bridge de mensajes (`chrome.runtime`)

`panel.js` escucha tres tipos de mensajes entrantes desde `background.js` o Cortex:

| Mensaje | Comportamiento |
|---|---|
| `INJECT_BRIEF` | Inyecta un objeto brief estructurado desde Cortex. El ingeniero ve el brief listo para enviar. |
| `INJECT_TEXT` | Inyecta texto libre. El flag `autoSend` determina si se envía automáticamente. |
| `NEW_SESSION` | Recarga el webview y re-inyecta el system prompt. Las cookies de Google no se borran. |

---

## 6. background.js — Cambios requeridos

El `background.js` existente debe incorporar tres responsabilidades para que el companion funcione.

### 6.1 Captura de pantalla de pestaña activa

`panel.js` no puede llamar a `chrome.tabs.captureVisibleTab()` directamente porque opera en el contexto del Side Panel. `background.js` actúa como proxy:

```javascript
// background.js — handler de captura
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

  if (msg.type === 'CAPTURE_TAB_SCREENSHOT') {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab) {
        sendResponse({ error: 'No active tab found' });
        return;
      }
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
    return true; // Mantener canal abierto para respuesta async
  }

});
```

### 6.2 Almacenamiento del último brief de Cortex

Cuando Cortex dispara un intent, debe registrar el resultado en `background.js` para que el botón "Brief" del toolbar pueda recuperarlo:

```javascript
// background.js — almacenamiento de brief

// Variable en memoria (se pierde al cerrar el navegador — comportamiento esperado)
let _lastCortexBrief = null;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

  // Cortex guarda el brief después de ejecutar un intent
  if (msg.type === 'STORE_BRIEF') {
    _lastCortexBrief = msg.brief;
    sendResponse({ ok: true });
  }

  // panel.js recupera el último brief (botón "Brief" del toolbar)
  if (msg.type === 'GET_LAST_BRIEF') {
    sendResponse({ brief: _lastCortexBrief });
  }

});
```

### 6.3 Integración desde Cortex (`context.js`)

Cuando Cortex termina de procesar un intent, debe enviar el resultado a `background.js`. Este es el punto de integración con el sistema BTIPS existente:

```javascript
// context.js (Cortex) — integración con el companion

async function processIntent(intent) {
  // ... lógica existente de BTIPS ...
  const result = await callClaudeAPI(intent);

  // Nuevo: registrar el brief en background para el companion
  const brief = {
    intentType:     intent.type,
    summary:        result.summary,
    openDecision:   result.pendingDecision ?? null,
    suggestedQuery: result.suggestedQuery  ?? null,
  };

  // Opción A: guardar para que el ingeniero lo solicite manualmente (recomendado)
  chrome.runtime.sendMessage({ type: 'STORE_BRIEF', brief });

  // Opción B: inyectar directamente al companion (si el panel está abierto)
  // chrome.runtime.sendMessage({ type: 'INJECT_BRIEF', brief });

  return result;
}
```

> **Recomendación:** Usar Opción A (`STORE_BRIEF`) como default. El ingeniero decide cuándo consultar al companion tocando el botón "Brief". La Opción B puede resultar intrusiva si el panel no está abierto o el ingeniero está en medio de otra tarea.

---

## 7. manifest.json — Permisos requeridos

Agregar o verificar que estos permisos estén presentes:

```json
{
  "manifest_version": 3,
  "name": "Cognituum",
  "version": "1.0.0",

  "permissions": [
    "sidePanel",   // Registrar el panel lateral nativo de Chromium
    "activeTab",   // Acceder a la pestaña activa del usuario
    "scripting",   // executeScript en el webview y pestañas
    "tabs",        // captureVisibleTab para screenshots
    "storage"      // (opcional) persistencia de configuración
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

> **`host_permissions`:** El permiso sobre `gemini.google.com` es obligatorio para que `webview.executeScript()` e `insertCSS()` funcionen. Sin él, las llamadas fallan silenciosamente en Manifest V3.

---

## 8. Checklist de integración

### 8.1 Archivos nuevos
- [ ] `panel.html` presente en la raíz de la extensión.
- [ ] `panel.js` presente en la raíz de la extensión.

### 8.2 Archivos modificados
- [ ] `background.js`: handlers `CAPTURE_TAB_SCREENSHOT`, `STORE_BRIEF` y `GET_LAST_BRIEF` agregados.
- [ ] `manifest.json`: permisos `sidePanel`, `activeTab`, `scripting`, `tabs` y `host_permissions` para `gemini.google.com`.
- [ ] `context.js` (Cortex): llamada a `STORE_BRIEF` después de procesar cada intent.
- [ ] `landingProtocol.js`: función `isCompanionAvailable()` implementada y guard en `renderActions()`.

### 8.3 Verificación funcional
- [ ] El botón "Companion" en Landing aparece deshabilitado si el perfil no tiene cuenta Google y API key de Gemini registradas.
- [ ] El botón se habilita correctamente al completar el onboarding con ambas condiciones satisfechas.
- [ ] El panel lateral se abre desde el botón de Landing (no desde el ícono de la extensión directamente).
- [ ] Gemini carga en formato móvil (sin sidebar, sin header completo).
- [ ] El system prompt de Cognituum se envía y Gemini responde `"Companion activo. ¿Qué analizamos?"`.
- [ ] El botón "Brief" recupera e inyecta el último intent de Cortex en el campo de chat.
- [ ] El botón "Screenshot" captura la pestaña activa y la imagen aparece en el chat.
- [ ] El botón "Reset" inicia un nuevo chat con el system prompt re-inyectado.
- [ ] El login de Google persiste al cerrar y reabrir el panel lateral.

---

## 9. Notas de mantenimiento

### 9.1 Cambios en la UI de Gemini

Google actualiza su SPA frecuentemente. Si el companion pierde la limpieza de UI, revisar y actualizar los selectores CSS en la constante `ISOLATION_CSS` de `panel.js`. Priorizar selectores de `role` y `aria` sobre clases BEM, ya que son más estables entre deploys.

### 9.2 Inyección de texto rota

Si el botón "Send" de Gemini queda gris después de la inyección, el framework interno cambió su modelo de eventos. Revisar la cadena de eventos en `injectAndFire()` dentro de `injectTextToGemini()`. La causa más común es que `execCommand` quedó deprecado en la versión de Chromium usada — en ese caso, usar solo el `InputEvent` nativo con `inputType: "insertText"`.

### 9.3 System prompt

La constante `SYSTEM_PROMPT` en `panel.js` puede editarse libremente para ajustar el rol del companion según evolucione Cognituum. Se recomienda versionarlo junto con el BTIPS package ya que define el comportamiento del companion en cada sesión.

### 9.4 Condiciones de activación desincronizadas

Si un perfil reporta que el botón de Companion está deshabilitado a pesar de haber completado el onboarding, verificar:

1. Que `linked_accounts` en el objeto de perfil incluye entradas para `google` y `gemini` con `status: 'active'`.
2. Que Brain persistió correctamente el evento `onboarding_complete` — revisar los logs del Temporal workflow.
3. Que `data-loader.js` en Landing está cargando el objeto de perfil actualizado y no una versión cacheada en `chrome.storage.local`.

---

*Cognituum · Companion Panel v1.1 · Documento de implementación para el equipo de desarrollo*
