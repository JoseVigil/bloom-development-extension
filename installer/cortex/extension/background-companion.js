'use strict';

// ============================================================================
// BACKGROUND-COMPANION.JS — Orquestador Cognituum (Companion v2.0.0)
//
// Único responsable de toda la orquestación del Companion: máquina de
// estados, comunicación con la Tab de Cognituum (Gemini), construcción de
// prompts, filtrado de ruido, y sincronización de estado con el Side Panel.
//
// Se carga vía `import './background-companion.js';` desde background.js
// (service worker, type: "module"). background.js no le agrega ni le mueve
// ninguna lógica de Companion — este archivo registra sus propios listeners
// (chrome.runtime.onConnect para el Port 'companion-link', y un
// chrome.runtime.onMessage separado y acotado solo a los mensajes que llegan
// desde el script inyectado en la Tab de Cognituum) de forma independiente
// del dispatcher principal de background.js.
//
// ── Decisión de arquitectura (Meta 0 de SESSION_HANDOFF_companion_audit.md) ──
// <webview> es un tag histórico de Chrome Apps / Isolated Web Apps
// (developer.chrome.com/docs/extensions/reference/webviewTag/) y NO está
// disponible en páginas de extensión Manifest V3 normales (side panels
// incluidos) — confirmado contra documentación oficial de Chrome antes de
// escribir este archivo, tal como pedía el prompt de esta sesión. Por eso
// el modelo NO es "Contenedor" (webview embebiendo Gemini dentro del Side
// Panel), sino "Orquestador": Gemini corre en una tab real y separada
// ("Tab de Cognituum"), y este módulo la coordina inyectando texto vía
// chrome.scripting.executeScript y escuchando lo que esa inyección reporta.
// El Side Panel nunca toca el DOM de Gemini directamente.
//
// ── Nota sobre companionProtocol.js ──
// companionProtocol.js v2.0.0 se distribuye en formato UMD pensado para
// `<script>` tag (companion_index.html lo carga como global `window
// .COMPANION_PROTOCOL`). Un service worker de tipo module no tiene `window`
// ni CommonJS `module.exports`, así que ese archivo no expone nada
// importable acá — por eso COMMAND_EVENTS abajo repite a mano la misma
// lista de comandos que documenta companionProtocol.js en vez de
// importarla. Es una duplicación intencional, no un olvido; alinear el
// formato de companionProtocol.js (agregar un `export`) para que ambos
// lados puedan importar la misma fuente es trabajo de una sesión de
// documentación posterior, no de esta.
// ============================================================================

const ENGINE_STATE_KEY = 'cognituum_engine_state';
const ENGINE_TAB_URL = 'https://gemini.google.com/app';
const ENGINE_RESPONSE_TIMEOUT_MS = 90_000; // ajustar según latencia real observada

const EngineStatus = Object.freeze({
  SLEEPING:     'SLEEPING',
  WAKING:       'WAKING',
  READY:        'READY',
  BUSY:         'BUSY',
  DISCONNECTED: 'DISCONNECTED',
});

// Debe reflejar exactamente `commands` en companionProtocol.js v2.0.0.
const COMMAND_EVENTS = [
  'COMMAND_RUN_BISP',
  'COMMAND_RUN_BRIEF',
  'COMMAND_RUN_FREETEXT',
  'COMMAND_REOPEN_ENGINE',
];

// ============================================================================
// VISIBILIDAD DEL SIDE PANEL — activación estrictamente condicional
//
// Vive acá y no en background.js porque es política del Companion, no del
// router de handshake: decide EN QUÉ TABS existe el Side Panel, antes de
// que companion.js llegue siquiera a conectar el Port 'companion-link' de
// la sección de abajo.
//
// Requisito: el Side Panel NUNCA debe abrirse en las páginas core de la
// propia extensión (discovery/harness/landing) ni en sitios generales
// (github.com, etc) — solo se activa en dominios de IA (ChatGPT, Claude,
// Gemini), donde carga companion/index.html.
//
// manifest.json declara solo "side_panel": { "enabled": true } (sin
// "default_path"), así que el path se asigna acá, por tab, vía
// chrome.sidePanel.setOptions.
// ============================================================================

// Superset de ENGINE_TAB_URL (gemini.google.com, arriba): acá cubrimos
// además chatgpt.com y claude.ai, que no tienen motor propio pero sí deben
// mostrar el panel según lo pedido.
const AI_SIDE_PANEL_DOMAINS = ['chatgpt.com', 'claude.ai', 'gemini.google.com'];
const COMPANION_PANEL_PATH = 'companion/index.html';

function hostMatchesAiDomain(hostname) {
  if (!hostname) return false;
  return AI_SIDE_PANEL_DOMAINS.some(domain => hostname === domain || hostname.endsWith(`.${domain}`));
}

async function updateSidePanelForTab(tabId, url) {
  if (typeof tabId !== 'number') return;

  let hostname = null;
  try {
    hostname = url ? new URL(url).hostname : null;
  } catch (_) {
    hostname = null; // URLs internas (chrome-extension://, about:blank, etc)
  }

  try {
    if (hostMatchesAiDomain(hostname)) {
      await chrome.sidePanel.setOptions({ tabId, path: COMPANION_PANEL_PATH, enabled: true });
      console.log('[CognituumEngine][SidePanel] ✓ Habilitado para tab', tabId, `(${hostname})`);
    } else {
      // Cubre explícitamente: tabs de discovery/harness/landing/companion
      // (chrome-extension://<id>/...) y cualquier sitio general (github,
      // etc) — todo lo que no matchee un dominio de IA queda deshabilitado.
      await chrome.sidePanel.setOptions({ tabId, enabled: false });
    }
  } catch (err) {
    // Puede fallar si la tab se cerró entre el evento y esta llamada async
    // — no es un error real de la lógica, se ignora silenciosamente.
    console.warn('[CognituumEngine][SidePanel] ⚠️ No se pudo actualizar tab', tabId, err.message);
  }
}

function registerSidePanelLifecycle() {
  // El ícono de la extensión NO debe abrir el panel por click directo —
  // la apertura es 100% por dominio, vía updateSidePanelForTab.
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch((err) => {
    console.warn('[CognituumEngine][SidePanel] ⚠️ setPanelBehavior falló:', err.message);
  });

  // Default global: deshabilitado. Toda tab nueva arranca sin side panel
  // hasta que onUpdated/onActivated confirme que es un dominio de IA.
  chrome.sidePanel.setOptions({ enabled: false }).catch((err) => {
    console.warn('[CognituumEngine][SidePanel] ⚠️ No se pudo fijar default global:', err.message);
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url || changeInfo.status === 'complete') {
      updateSidePanelForTab(tabId, tab.url);
    }
  });

  chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    try {
      const tab = await chrome.tabs.get(tabId);
      updateSidePanelForTab(tabId, tab.url);
    } catch (_) {
      // Tab cerrada entre el evento onActivated y el query — ignorar.
    }
  });

  // Barrido inicial: tabs que ya existían cuando el service worker arrancó
  // (ej. tras un reciclado por inactividad de MV3) no disparan onUpdated ni
  // onActivated por sí solas — hay que evaluarlas a mano una vez al boot.
  chrome.tabs.query({}).then(tabs => {
    for (const tab of tabs) {
      updateSidePanelForTab(tab.id, tab.url);
    }
  }).catch(() => {});
}

registerSidePanelLifecycle();

// ============================================================================
// GESTIÓN DE PUERTOS — Side Panel <-> background-companion.js
//
// El Side Panel se conecta mediante chrome.runtime.connect({name:
// 'companion-link'}) al abrirse, y mantiene ese Port vivo incluso cuando el
// usuario lo minimiza con el botón ">>" (minimizar es solo visual del lado
// de companion.js; el Port no se cierra). Puede haber más de un Port activo
// en teoría (ej. el panel se cerró y volvió a abrir antes de que el
// service worker notara el disconnect) — se trackean todos en un Set y se
// les notifica a todos por igual; no hay noción de "el" panel activo.
// ============================================================================

const companionPorts = new Set();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'companion-link') return;

  companionPorts.add(port);
  console.log('[CognituumEngine] 🔌 Side Panel conectado vía companion-link. Ports activos:', companionPorts.size);

  port.onMessage.addListener((msg) => {
    handlePortMessage(msg, port).catch((err) => {
      console.error('[CognituumEngine] ❌ Error manejando mensaje de Port:', msg?.event, err);
    });
  });

  port.onDisconnect.addListener(() => {
    companionPorts.delete(port);
    console.log('[CognituumEngine] 🔌 Side Panel desconectado. Ports activos:', companionPorts.size);
  });
});

// Envía un mensaje a todos los Ports conectados. Fire-and-forget: un Port
// roto (panel cerrado sin que el onDisconnect haya corrido todavía) no debe
// tirar abajo el broadcast para los demás.
function broadcast(msg) {
  for (const port of companionPorts) {
    try {
      port.postMessage(msg);
    } catch (err) {
      console.warn('[CognituumEngine] ⚠️ Port muerto durante broadcast, removiendo:', err?.message);
      companionPorts.delete(port);
    }
  }
}

async function handlePortMessage(msg, port) {
  const { event } = msg || {};

  // ---- Sincronización inicial: GET_ENGINE_STATUS ----------------------
  // El Side Panel manda esto apenas conecta el Port, sin esperar a un
  // ENGINE_STATUS_CHANGED espontáneo. Respondemos únicamente al Port que
  // preguntó (no un broadcast) reusando la forma de ENGINE_STATUS_CHANGED
  // para que companion.js tenga un solo handler de mensaje de estado.
  if (event === 'GET_ENGINE_STATUS') {
    const state = await getEngineState();
    port.postMessage({
      event: 'ENGINE_STATUS_CHANGED',
      status: state.status,
      currentMandate: state.currentMandate,
      activeCommandId: state.activeCommandId,
      queueLength: state.commandQueue.length,
    });
    return;
  }

  // ---- Comandos del Side Panel (COMMAND_RUN_BISP/BRIEF/FREETEXT/REOPEN) -
  if (COMMAND_EVENTS.includes(event)) {
    await handleSidePanelCommand(msg, port);
    return;
  }

  console.warn('[CognituumEngine] ⚠️ Mensaje de Port con evento desconocido, ignorado:', event);
}

// ============================================================================
// CANAL SEPARADO — Tab de Cognituum -> background-companion.js
//
// A diferencia del Port de arriba (extensión-a-extensión, confiable), esto
// es chrome.runtime.sendMessage clásico porque el emisor es una función
// inyectada vía chrome.scripting.executeScript corriendo en el DOM de
// gemini.google.com — no tiene forma de sostener un Port entre inyecciones.
// Se registra en un listener propio y separado del de arriba a propósito:
// mezclar "reportes confiables del Port" con "DOM no confiable de un
// tercero" en el mismo handler sería exactamente el tipo de mezcla de
// responsabilidades que esta sesión existe para deshacer.
// ============================================================================

chrome.runtime.onMessage.addListener((msg, sender, sendResp) => {
  if (!msg || (msg.event !== 'ENGINE_RESPONSE_CAPTURED' && msg.event !== 'ENGINE_INJECTION_FAILED')) {
    return false; // no es un mensaje de este canal — no respondemos nada
  }
  handleEngineMessage(msg).catch((err) => {
    console.error('[CognituumEngine] ❌ Error manejando mensaje del motor:', msg.event, err);
  });
  return false; // nada que responderle al script inyectado
});

// ============================================================================
// PERSISTENCIA DE ESTADO
//
// chrome.storage.session (no .local): sobrevive al reciclado del service
// worker dentro de la misma sesión de browser, se limpia al cerrar el
// browser. La Tab-motor vive minutos/horas — mucho más que el ciclo de vida
// del service worker — así que el estado en memoria simple no alcanza.
// ============================================================================

async function getEngineState() {
  const result = await chrome.storage.session.get(ENGINE_STATE_KEY);
  return result[ENGINE_STATE_KEY] || {
    tabId: null,
    status: EngineStatus.SLEEPING,
    currentMandate: null,
    commandQueue: [],
    activeCommandId: null,
  };
}

async function setEngineState(patch) {
  const current = await getEngineState();
  const next = { ...current, ...patch };
  await chrome.storage.session.set({ [ENGINE_STATE_KEY]: next });
  if (patch.status || patch.currentMandate !== undefined) {
    reportEngineStatus(next.status, { currentMandate: next.currentMandate });
  }
  return next;
}

// ---- Reportes proactivos al Side Panel (vía Port, no sendMessage) --------

function reportEngineStatus(status, extra = {}) {
  broadcast({ event: 'ENGINE_STATUS_CHANGED', status, ...extra });
}

function reportResult(mandateId, commandId, cleanResponse) {
  broadcast({
    event: 'REPORT_RESULT',
    mandateId,
    commandId,
    cleanResponse,
    timestamp: Date.now(),
  });
}

function reportError(mandateId, commandId, reason) {
  broadcast({ event: 'REPORT_ERROR', mandateId, commandId, reason });
}

// ============================================================================
// CICLO DE VIDA DE LA TAB DE COGNITUUM
// ============================================================================

async function wakeEngine() {
  const state = await getEngineState();

  if (state.tabId) {
    try {
      const tab = await chrome.tabs.get(state.tabId);
      if (tab && tab.url && tab.url.startsWith('https://gemini.google.com')) {
        await setEngineState({ status: EngineStatus.READY });
        return state.tabId;
      }
    } catch (_) {
      // La tab guardada ya no existe — sigue al bloque de creación.
    }
  }

  await setEngineState({ status: EngineStatus.WAKING });
  const tab = await chrome.tabs.create({ url: ENGINE_TAB_URL, active: false });
  registerEngineTabWatcher(tab.id);
  await setEngineState({ tabId: tab.id, status: EngineStatus.WAKING });
  return tab.id;
}

// Mismo patrón que el watcher de Google login que ya existe en background.js
// (chrome.tabs.onUpdated scoped a un tabId puntual, auto-desregistro) —
// acá aplicado a "¿la tab-motor sigue viva y en gemini.google.com?" en vez
// de a "¿la URL llegó al host terminal de login?". Vive acá, no en
// background.js: es estado de Companion, no de Synapse.
function registerEngineTabWatcher(tabId) {
  const onRemoved = (removedTabId) => {
    if (removedTabId !== tabId) return;
    chrome.tabs.onRemoved.removeListener(onRemoved);
    chrome.tabs.onUpdated.removeListener(onUpdated);
    setEngineState({ tabId: null, status: EngineStatus.DISCONNECTED });
  };

  const onUpdated = (updatedTabId, changeInfo) => {
    if (updatedTabId !== tabId || !changeInfo.url) return;
    if (!changeInfo.url.startsWith('https://gemini.google.com')) {
      chrome.tabs.onRemoved.removeListener(onRemoved);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      setEngineState({ tabId: null, status: EngineStatus.DISCONNECTED });
    }
  };

  chrome.tabs.onRemoved.addListener(onRemoved);
  chrome.tabs.onUpdated.addListener(onUpdated);
}

// ============================================================================
// COMANDOS ENTRANTES DESDE EL SIDE PANEL
// ============================================================================

async function handleSidePanelCommand(msg, port) {
  if (msg.event === 'COMMAND_REOPEN_ENGINE') {
    await wakeEngine();
    port.postMessage({ event: 'COMMAND_ACK', commandEvent: msg.event, success: true });
    return;
  }

  const commandId = `${msg.event}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await enqueueCommand({
    commandId,
    type: msg.event,
    payload: msg.payload,
    mandateId: msg.mandateId,
  });
  // Ack inmediato y liviano por el mismo Port — confirma recepción, no
  // resultado. El resultado real llega después, proactivamente, vía
  // REPORT_RESULT/REPORT_ERROR (broadcast a todos los Ports).
  port.postMessage({ event: 'COMMAND_ACK', commandEvent: msg.event, success: true, commandId });
}

async function enqueueCommand(command) {
  let state = await getEngineState();
  state = await setEngineState({ commandQueue: [...state.commandQueue, command] });

  if (state.status === EngineStatus.SLEEPING || state.status === EngineStatus.DISCONNECTED) {
    await wakeEngine();
  } else if (state.status === EngineStatus.READY) {
    await dispatchNextCommand();
  }
  // Si está WAKING o BUSY, queda encolado — dispatchNextCommand() se llama
  // solo cuando el estado vuelve a READY (ver handleEngineMessage).
}

async function dispatchNextCommand() {
  const state = await getEngineState();
  if (state.status !== EngineStatus.READY || state.commandQueue.length === 0) return;

  const [nextCommand, ...rest] = state.commandQueue;
  await setEngineState({
    status: EngineStatus.BUSY,
    commandQueue: rest,
    activeCommandId: nextCommand.commandId,
    currentMandate: nextCommand.mandateId
      ? { mandateId: nextCommand.mandateId }
      : state.currentMandate,
  });

  const prompt = buildPromptFromCommand(nextCommand);

  try {
    await chrome.scripting.executeScript({
      target: { tabId: state.tabId },
      world: 'ISOLATED',
      func: injectAndObserve,
      args: [prompt, nextCommand.commandId, nextCommand.mandateId],
    });
  } catch (err) {
    console.error('[CognituumEngine] ❌ executeScript falló:', err);
    await handleEngineFailure(nextCommand, 'INJECTION_FAILED');
    return;
  }

  // Timeout de cortesía: si nadie manda ENGINE_RESPONSE_CAPTURED a tiempo,
  // no dejamos el estado trabado en BUSY para siempre.
  const timeoutCommandId = nextCommand.commandId;
  setTimeout(async () => {
    const check = await getEngineState();
    if (check.activeCommandId === timeoutCommandId) {
      await handleEngineFailure(nextCommand, 'ENGINE_TIMEOUT');
    }
  }, ENGINE_RESPONSE_TIMEOUT_MS);
}

async function handleEngineFailure(command, reason) {
  reportError(command.mandateId, command.commandId, reason);
  await setEngineState({ status: EngineStatus.READY, activeCommandId: null });
  await dispatchNextCommand();
}

// ============================================================================
// buildPromptFromCommand — formatea BISP/Brief/FreeText para Gemini
//
// El encabezado deja explícito que esto es una directiva estructurada de
// Cognituum, no un turno de chat casual, y pide explícitamente que Gemini
// no repita el payload ni agregue saludos — eso es justamente lo que
// filterNoise() de abajo existe para limpiar si igual se cuela.
// ============================================================================

const COGNITUUM_DIRECTIVE_HEADER =
  '[DIRECTIVA COGNITUUM — Bloom Orchestrator] No es un mensaje de chat casual. ' +
  'Ejecutá el contenido de abajo con precisión. No repitas el payload en tu ' +
  'respuesta, no agregues saludos, disclaimers, ni preguntas de seguimiento — ' +
  'devolvé directamente el resultado de inferencia solicitado.';

function buildPromptFromCommand(command) {
  const mandateLine = `Mandate ID: ${command.mandateId ?? '(sin mandate asociado)'}`;

  switch (command.type) {
    case 'COMMAND_RUN_BISP': {
      const bisp = command.payload ?? {};
      return [
        COGNITUUM_DIRECTIVE_HEADER,
        '',
        'Tipo: BISP (Bloom Intent Specification Package)',
        mandateLine,
        '',
        '```json',
        JSON.stringify(bisp, null, 2),
        '```',
      ].join('\n');
    }

    case 'COMMAND_RUN_BRIEF': {
      const brief = command.payload ?? {};
      return [
        COGNITUUM_DIRECTIVE_HEADER,
        '',
        'Tipo: Brief',
        mandateLine,
        '',
        '```json',
        JSON.stringify(brief, null, 2),
        '```',
      ].join('\n');
    }

    case 'COMMAND_RUN_FREETEXT': {
      const text = command.payload?.text ?? '';
      return [
        COGNITUUM_DIRECTIVE_HEADER,
        '',
        'Tipo: FreeText',
        mandateLine,
        '',
        text,
      ].join('\n');
    }

    default:
      throw new Error(`[CognituumEngine] Tipo de comando desconocido: ${command.type}`);
  }
}

// ============================================================================
// injectAndObserve — función inyectada en la Tab de Cognituum
//
// Corre en el contexto de gemini.google.com (world: 'ISOLATED'), no en el
// service worker — no tiene acceso a nada del scope de arriba salvo lo que
// llega por args. chrome.runtime.sendMessage funciona acá porque
// scripting.executeScript la expone a scripts inyectados, sin necesitar que
// este código sea un content_script declarado en el manifest.
//
// ⚠️ LOS SELECTORES DE ABAJO SON EL MEJOR PUNTO DE PARTIDA QUE SE PUEDE
// ESCRIBIR SIN UN BROWSER REAL ABIERTO CONTRA gemini.google.com — no están
// verificados contra el DOM vivo. Se usan selectores por atributo `aria-*`
// (más estables que clases/data-testid generados) para el botón de enviar y
// los botones de feedback, con fallback a data-testid, pero Google puede
// cambiar cualquiera de esto sin aviso y sin versionado. Confirmar con el
// inspector real antes de considerar esto funcional en producción.
// ============================================================================

function injectAndObserve(promptText, commandId, mandateId) {
  const INPUT_SELECTOR = 'div.ql-editor[contenteditable="true"]';               // ⚠️ verificar
  const SEND_BUTTON_SELECTOR = 'button[aria-label*="Send" i], button[aria-label*="Enviar" i]'; // ⚠️ verificar
  const LOADING_SELECTOR = '[data-testid="loading-indicator"], [aria-busy="true"]'; // ⚠️ verificar
  const COPY_BUTTON_SELECTOR = 'button[aria-label*="Copy" i], button[aria-label*="Copiar" i]'; // ⚠️ verificar
  const DISLIKE_BUTTON_SELECTOR = 'button[aria-label*="Dislike" i], button[aria-label*="No me gusta" i]'; // ⚠️ verificar
  const RESPONSE_NODE_SELECTOR = '[data-message-author="model"]';               // ⚠️ verificar
  const ERROR_SELECTOR = '[role="alert"], [data-testid="error"], .error-message'; // ⚠️ verificar

  const input = document.querySelector(INPUT_SELECTOR);
  if (!input) {
    chrome.runtime.sendMessage({
      event: 'ENGINE_INJECTION_FAILED', commandId, mandateId, reason: 'INPUT_NOT_FOUND',
    });
    return;
  }

  input.focus();
  document.execCommand('insertText', false, promptText);
  input.dispatchEvent(new InputEvent('input', { bubbles: true }));

  const sendBtn = document.querySelector(SEND_BUTTON_SELECTOR);
  if (sendBtn && !sendBtn.disabled) {
    sendBtn.click();
  } else {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  }

  let settled = false;
  const finish = (sendFn) => {
    if (settled) return;
    settled = true;
    observer.disconnect();
    sendFn();
  };

  // Lógica del Observer: NO es un timeout simple. Espera a que desaparezca
  // el indicador de carga (o aria-busy) Y a que aparezca alguno de los
  // botones de feedback que Google solo renderiza cuando la respuesta
  // terminó de escribirse (Copy / Dislike). Si en el medio aparece un nodo
  // de error/bloqueo, corta inmediatamente en vez de esperar el timeout de
  // cortesía del lado del background.
  const observer = new MutationObserver(() => {
    const errorNode = document.querySelector(ERROR_SELECTOR);
    if (errorNode && errorNode.textContent && errorNode.textContent.trim()) {
      finish(() => chrome.runtime.sendMessage({
        event: 'ENGINE_INJECTION_FAILED',
        commandId,
        mandateId,
        // NOTA: 'ENGINE_RESPONSE_ERROR' no está todavía en el
        // knownReasons documentado de companionProtocol.js v2.0.0 (solo
        // lista 'INPUT_NOT_FOUND'). Se usa igual porque el prompt de esta
        // sesión pide explícitamente reportar errores de red/bloqueo, y no
        // corresponde parchear companionProtocol.js en esta sesión — queda
        // como corrección pendiente para la sesión de documentación.
        reason: 'ENGINE_RESPONSE_ERROR',
        detail: errorNode.textContent.trim().slice(0, 200),
      }));
      return;
    }

    const stillLoading = document.querySelector(LOADING_SELECTOR);
    if (stillLoading) return;

    const feedbackReady = document.querySelector(COPY_BUTTON_SELECTOR) ||
                           document.querySelector(DISLIKE_BUTTON_SELECTOR);
    if (!feedbackReady) return;

    const responseNodes = document.querySelectorAll(RESPONSE_NODE_SELECTOR);
    const lastResponse = responseNodes[responseNodes.length - 1];
    finish(() => chrome.runtime.sendMessage({
      event: 'ENGINE_RESPONSE_CAPTURED',
      commandId,
      mandateId,
      rawText: lastResponse ? lastResponse.innerText : '',
    }));
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-busy'],
  });
}

// ============================================================================
// filterNoise — limpieza real y agresiva de la respuesta cruda de Gemini
//
// Remueve preámbulos conversacionales ("Claro, aquí tienes...", "Entendido,
// ...", "Sure, here's...") y coletillas de cierre ("¿Deseas que...?",
// "Espero que esto te ayude", "Let me know if...") tanto en español como en
// inglés, dejando solo la sabiduría decantada que el Side Panel muestra en
// "Respuesta refinada". Es deliberadamente una lista de patrones, no una
// heurística de IA — determinista y auditable, como corresponde a algo que
// corre en cada respuesta sin supervisión humana previa.
// ============================================================================

const PREAMBLE_PATTERNS = [
  /^¡?claro!?,?\s*(que\s+s[ií]|[^\n]*)?\n+/i,
  /^entendido[.,!]?\s*[^\n]*\n+/i,
  /^por supuesto[.,!]?\s*[^\n]*\n+/i,
  /^¡?perfecto!?,?\s*[^\n]*\n+/i,
  /^aqu[ií]\s+(tienes|est[aá])[^\n]*\n+/i,
  /^(¡?bien!?|de acuerdo)[.,!]?\s*[^\n]*\n+/i,
  /^(sure|okay|ok|certainly|of course|got it|absolutely)[.,!]?\s*[^\n]*\n+/i,
  /^here('s| is)\s+[^\n]*\n+/i,
];

const TRAILING_PATTERNS = [
  /\n+¿(deseas|quer[eé]s|quieres|te gustar[ií]a|necesit[aá]s)[^\n]*\??\s*$/i,
  /\n+espero que esto te (ayude|sirva|sea (útil|de utilidad))[^\n]*$/i,
  /\n+(avisame|avísame|decime|dime) si[^\n]*$/i,
  /\n+let me know if[^\n]*$/i,
  /\n+(is there anything else|feel free to)[^\n]*$/i,
];

function filterNoise(rawText) {
  let text = (rawText || '').trim();
  if (!text) return text;

  for (const pattern of PREAMBLE_PATTERNS) {
    text = text.replace(pattern, '');
  }
  for (const pattern of TRAILING_PATTERNS) {
    text = text.replace(pattern, '');
  }

  return text.trim();
}

// ============================================================================
// Handler de mensajes que llegan desde injectAndObserve()
// ============================================================================

async function handleEngineMessage(msg) {
  if (msg.event === 'ENGINE_RESPONSE_CAPTURED') {
    const clean = filterNoise(msg.rawText);
    reportResult(msg.mandateId, msg.commandId, clean);
    await setEngineState({ status: EngineStatus.READY, activeCommandId: null });
    await dispatchNextCommand();
    return;
  }

  if (msg.event === 'ENGINE_INJECTION_FAILED') {
    reportError(msg.mandateId, msg.commandId, msg.reason);
    await setEngineState({ status: EngineStatus.READY, activeCommandId: null });
    await dispatchNextCommand();
  }
}
