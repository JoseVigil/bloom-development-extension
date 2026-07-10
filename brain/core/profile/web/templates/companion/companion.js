'use strict';

// ============================================================================
// COMPANION.JS — Side Panel (Bloom UI/UX) del Orquestador Cognituum
//
// Se carga como <script> clásico (no module) en companion_index.html, DESPUÉS
// de companionProtocol.js, del cual toma window.COMPANION_PROTOCOL para no
// hardcodear una segunda vez los nombres de evento (a diferencia de
// background-companion.js, que sí tiene que duplicarlos a mano porque un
// service worker de tipo module no tiene `window` — ver la nota al respecto
// en ese archivo).
//
// Responsabilidad de este archivo, y nada más que esto:
//   1. Abrir y mantener vivo el Port 'companion-link' con background-companion.js.
//   2. Pedir GET_ENGINE_STATUS apenas conecta, para sincronizar la UI sin
//      esperar un ENGINE_STATUS_CHANGED espontáneo.
//   3. Reflejar en el DOM lo que llega por el Port: ENGINE_STATUS_CHANGED,
//      REPORT_RESULT, REPORT_ERROR, COMMAND_ACK.
//   4. Emitir COMMAND_REOPEN_ENGINE cuando el usuario clickea "Reabrir motor".
//   5. Minimizar el panel visualmente con el botón "»" SIN tocar el Port.
//
// Este archivo NO construye BISP/Brief/FreeText: companion_index.html no
// tiene ningún formulario para eso a propósito ("Opacidad del Protocolo" —
// el usuario no compone comandos a mano acá). Esos comandos se originan en
// otras superficies de la extensión (Discovery/Landing, corriendo en una
// tab de claude.ai/chatgpt.com/github.com) que quieren enrutar algo hacia
// Gemini. Como companionPorts en background-companion.js trata cualquier
// Port llamado 'companion-link' por igual (sin noción de "el" panel activo),
// este script también actúa como punto de relevo: escucha un mensaje
// interno (COMPANION_RELAY_COMMAND, ver §RELAY abajo) desde esas otras
// superficies vía chrome.runtime.onMessage, lo re-emite al background por
// el Port, y arma la entrada del Expander en el momento de reenviarlo —
// porque es el único punto que tiene el payload completo en mano; el
// protocolo documenta explícitamente que background.js NO reenvía el
// payload crudo de vuelta (companionProtocol.js, comentario de `reports`).
// ⚠️ Esta ruta de relevo es una interpretación razonable del contrato
// documentado, no algo confirmado línea por línea contra Discovery/Landing
// en esta sesión — queda marcado para revisión cuando se audite ese lado.
// ============================================================================

(function initCompanion() {
  const PROTOCOL = window.COMPANION_PROTOCOL || null;
  if (!PROTOCOL) {
    console.error('[Companion] ❌ companionProtocol.js no cargó antes que companion.js — abortando init.');
    return;
  }

  const KNOWN_REPORTS = new Set(Object.keys(PROTOCOL.reports || {}).concat(['COMMAND_ACK']));
  const KNOWN_COMMANDS = new Set(Object.keys(PROTOCOL.commands || {}));

  // ---- Refs de DOM (todas existen en companion_index.html) ---------------
  const el = {
    engineStatus: document.getElementById('engine-status'),
    engineStatusLabel: document.getElementById('engine-status-label'),
    reopenBtn: document.getElementById('reopen-engine'),
    collapseBtn: document.getElementById('btn-collapse'),
    app: document.getElementById('companion-app'),
    headerBlock: document.getElementById('header-block'),
    mandateIntent: document.getElementById('mandate-intent'),
    mandateName: document.getElementById('mandate-name'),
    mandateDescription: document.getElementById('mandate-description'),
    refinedResponse: document.getElementById('refined-response'),
    technicalLogList: document.getElementById('technical-log-list'),
  };

  const STATUS_LABELS = {
    SLEEPING: 'En espera',
    WAKING: 'Despertando…',
    READY: 'Listo',
    BUSY: 'Procesando…',
    DISCONNECTED: 'Desconectado',
  };

  const REOPEN_VISIBLE_STATES = new Set(['SLEEPING', 'DISCONNECTED']);

  // ==========================================================================
  // PORT — conexión con background-companion.js
  //
  // Reconexión: si el service worker se recicla (MV3 lo hace agresivamente),
  // el Port se cae con onDisconnect. Reintentamos con backoff simple — el
  // panel puede quedar abierto horas y no tiene sentido dejarlo mudo.
  // ==========================================================================

  let port = null;
  let reconnectDelayMs = 1000;
  const MAX_RECONNECT_DELAY_MS = 15_000;

  function connectPort() {
    port = chrome.runtime.connect({ name: 'companion-link' });

    port.onMessage.addListener(handlePortMessage);

    port.onDisconnect.addListener(() => {
      console.warn('[Companion] 🔌 Port desconectado, reintentando en', reconnectDelayMs, 'ms');
      port = null;
      setStatus('DISCONNECTED');
      setTimeout(() => {
        connectPort();
        reconnectDelayMs = Math.min(reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS);
      }, reconnectDelayMs);
    });

    // Sincronización inicial: pedimos el estado real apenas conecta, sin
    // esperar a que background emita algo espontáneamente.
    port.postMessage({ event: 'GET_ENGINE_STATUS' });
    reconnectDelayMs = 1000; // reset del backoff tras una conexión exitosa
  }

  function handlePortMessage(msg) {
    const { event } = msg || {};
    if (!event || !KNOWN_REPORTS.has(event)) {
      console.warn('[Companion] ⚠️ Mensaje de Port con evento no reconocido por el protocolo:', event);
      return;
    }

    switch (event) {
      case 'ENGINE_STATUS_CHANGED':
        onEngineStatusChanged(msg);
        break;
      case 'REPORT_RESULT':
        onReportResult(msg);
        break;
      case 'REPORT_ERROR':
        onReportError(msg);
        break;
      case 'COMMAND_ACK':
        onCommandAck(msg);
        break;
      default:
        // En KNOWN_REPORTS pero sin handler explícito — no debería pasar
        // salvo que companionProtocol.js agregue un report nuevo sin que
        // este archivo se actualice. Lo dejamos loggeado, no silencioso.
        console.warn('[Companion] ⚠️ Report conocido por el protocolo pero sin handler:', event);
    }
  }

  // ==========================================================================
  // ENGINE_STATUS_CHANGED — toolbar (dot + label) y botón "Reabrir motor"
  // ==========================================================================

  function onEngineStatusChanged(msg) {
    setStatus(msg.status);
    if (msg.currentMandate) {
      renderMandate(msg.currentMandate);
    }
  }

  function setStatus(status) {
    const known = Object.prototype.hasOwnProperty.call(STATUS_LABELS, status);
    const safeStatus = known ? status : 'DISCONNECTED';

    el.engineStatus.dataset.state = safeStatus;
    el.engineStatusLabel.textContent = STATUS_LABELS[safeStatus];
    el.reopenBtn.hidden = !REOPEN_VISIBLE_STATES.has(safeStatus);
  }

  // ==========================================================================
  // Mandate — Header reactivo
  // ==========================================================================

  function renderMandate(mandate) {
    if (!mandate) {
      el.headerBlock.hidden = true;
      return;
    }
    el.headerBlock.hidden = false;
    el.mandateIntent.textContent = mandate.intent || mandate.mandateId || '—';
    el.mandateName.textContent = mandate.name || 'Mandate activo';
    el.mandateDescription.textContent = mandate.description || '';
  }

  // ==========================================================================
  // REPORT_RESULT / REPORT_ERROR — Respuesta refinada + Expander
  // ==========================================================================

  function onReportResult(msg) {
    const { mandateId, commandId, cleanResponse, timestamp } = msg;

    el.refinedResponse.dataset.state = 'ready';
    // textContent, no innerHTML: cleanResponse viene del DOM de un tercero
    // (Gemini) vía filterNoise() en background-companion.js — nunca se
    // interpreta como HTML acá, por más que ya esté "limpio" de ruido.
    el.refinedResponse.textContent = cleanResponse || '(respuesta vacía tras el filtrado)';

    appendLogEntry({
      kind: 'result',
      label: 'Resultado recibido',
      commandId,
      mandateId,
      timestamp: timestamp || Date.now(),
    });
  }

  function onReportError(msg) {
    const { mandateId, commandId, reason } = msg;

    el.refinedResponse.dataset.state = 'error';
    el.refinedResponse.textContent = `El motor no pudo completar el comando (${reason}).`;

    appendLogEntry({
      kind: 'error',
      label: `Error: ${reason}`,
      commandId,
      mandateId,
      timestamp: Date.now(),
    });
  }

  function onCommandAck(msg) {
    // Confirmación liviana de recepción, no de resultado. Si el comando fue
    // reenviado por este mismo script vía relayCommandToEngine(), la entrada
    // de log "enviado" ya se agregó ahí — acá solo dejamos rastro de que
    // background efectivamente lo recibió, para no perder trazabilidad si
    // el ACK nunca llega (indicio de que algo se cayó en el medio).
    console.log('[Companion] ✅ COMMAND_ACK', msg.commandEvent, msg.commandId || '(sin commandId)');
  }

  // ==========================================================================
  // Expander de auditoría — technical-log-list
  // ==========================================================================

  function appendLogEntry({ kind, label, commandId, mandateId, timestamp }) {
    const emptyPlaceholder = el.technicalLogList.querySelector('.log-empty');
    if (emptyPlaceholder) emptyPlaceholder.remove();

    const li = document.createElement('li');
    li.className = `log-entry log-entry--${kind}`;

    const time = document.createElement('span');
    time.className = 'log-time';
    time.textContent = new Date(timestamp).toLocaleTimeString();

    const text = document.createElement('span');
    text.className = 'log-text';
    const idFragment = commandId ? ` · ${commandId}` : '';
    const mandateFragment = mandateId ? ` (Mandate: ${mandateId})` : '';
    text.textContent = `${label}${idFragment}${mandateFragment}`;

    li.appendChild(time);
    li.appendChild(text);
    // Más reciente arriba: es un log de auditoría, no una consola de scroll.
    el.technicalLogList.prepend(li);
  }

  // ==========================================================================
  // §RELAY — comandos originados en otras superficies de la extensión
  //
  // Discovery/Landing (corriendo como página de extensión sobre github.com,
  // claude.ai, chatgpt.com — ver web_accessible_resources en manifest.json)
  // no tiene Port propio hacia background-companion.js. En vez de que cada
  // superficie abra su propio Port 'companion-link' (multiplicando puntos
  // de entrada al mismo estado), centralizamos acá: escuchan
  // chrome.runtime.sendMessage({event:'COMPANION_RELAY_COMMAND', ...}) y
  // este script hace de único puente hacia el Port. Es lo que permite que
  // el Expander muestre "cada comando enviado" con el payload real, tal
  // como pide el prompt de esta sesión, sin que background.js tenga que
  // reenviarlo (que el protocolo explícitamente no hace).
  // ==========================================================================

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.event !== 'COMPANION_RELAY_COMMAND') return false;

    const ok = relayCommandToEngine(msg.command, msg.mandateId, msg.payload);
    sendResponse({ relayed: ok });
    return false;
  });

  function relayCommandToEngine(commandEvent, mandateId, payload) {
    if (!KNOWN_COMMANDS.has(commandEvent)) {
      console.warn('[Companion] ⚠️ COMPANION_RELAY_COMMAND con comando desconocido, ignorado:', commandEvent);
      return false;
    }
    if (!port) {
      console.warn('[Companion] ⚠️ No hay Port activo, no se puede relevar el comando:', commandEvent);
      return false;
    }

    appendLogEntry({
      kind: 'sent',
      label: `Enviado: ${commandEvent}`,
      commandId: null,
      mandateId,
      timestamp: Date.now(),
    });

    port.postMessage({ event: commandEvent, mandateId, payload });
    return true;
  }

  // ==========================================================================
  // Toolbar — "Reabrir motor" y minimizar panel
  // ==========================================================================

  el.reopenBtn.addEventListener('click', () => {
    if (!port) return;
    port.postMessage({ event: 'COMMAND_REOPEN_ENGINE' });
  });

  el.collapseBtn.addEventListener('click', () => {
    // Minimiza SOLO visualmente. El Port sigue vivo (no se llama a
    // port.disconnect() acá bajo ningún concepto) — así el usuario sigue
    // recibiendo ENGINE_STATUS_CHANGED/REPORT_RESULT aunque no vea el panel.
    const collapsed = el.app.classList.toggle('is-collapsed');
    el.collapseBtn.textContent = collapsed ? '«' : '»';
    el.collapseBtn.setAttribute('aria-label', collapsed ? 'Restaurar panel' : 'Minimizar panel');
    el.collapseBtn.title = collapsed ? 'Restaurar panel' : 'Minimizar panel';
  });

  // ==========================================================================
  // Init
  // ==========================================================================

  connectPort();
  console.log('[Companion] 🌸 Side Panel inicializado, esperando sincronización de estado…');
})();
