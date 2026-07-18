// workspace/onboarding/renderer/core/ipc-bridge.js
//
// Centraliza:
//   1. log() — puente a window.onboarding.log (Main), reemplaza la función
//      log() que antes vivía suelta al tope de onboarding.js.
//   2. Todos los listeners de push que vienen de Main/Brain:
//        window.onboarding.onMilestone      → 'milestone:reached'
//        window.onboarding.onStepUpdate     → 'onboarding:step-ui-update'
//        window.onboarding.onSynapseEvent   → eventos crudos de Synapse (debug tab)
//   3. Un registry de handlers de milestone (registerMilestoneHandler) para
//      que los módulos de steps/ se enganchen sin que ipc-bridge.js tenga
//      que importarlos (evita el ciclo steps→ipc-bridge→steps).
//
// IMPORTANTE (Requerimiento 3 del roadmap — "unificar el mecanismo de
// avance"): a partir de este refactor, el avance NUNCA lo decide un click
// que llama goTo(n) a mano. Todo avance real pasa por:
//   handleMilestoneReached(stepId, data) → handler del step → produce el
//   artefacto → navigation.navigateTo(<siguiente stepId>)
// El click del usuario solo dispara la ACCIÓN (navigate/init-nucleus/etc.);
// quien decide a qué pantalla ir después es siempre un milestone confirmado
// o, en boot, resolution-engine.js vía onboarding:get-resume-state.
//
// CAMBIOS (2026-07-18 — bug ACCOUNT_REGISTERED resolviendo a github_auth):
// onSynapseEvent llamaba a handleMilestoneReached() con el campo
// data.data.step tal cual venía en el payload del mensaje, en paralelo a
// la resolución oficial de onMilestone (que sí usa registry.resolveEvent()
// en Main, con discriminación por "service"). Un payload con un "step"
// legacy/hardcodeado (ej: simulado desde el Harness) pisaba silenciosamente
// el milestone correcto. Se saca esa resolución de acá — onSynapseEvent
// ahora solo reenvía el evento crudo al iframe de debug, que es su único
// rol real. Ver hilo de debugging GOOGLE_LOGIN_DETECTED/ACCOUNT_REGISTERED.

const milestoneHandlers = new Map();   // stepId → (data) => void
const stepUpdateHandlers = new Map();  // stepId → (phase) => void

/**
 * Un step module llama esto para reaccionar cuando su propio stepId es
 * confirmado por Brain (push) o por el poll de fallback (ver step module).
 */
export function registerMilestoneHandler(stepId, handler) {
  milestoneHandlers.set(stepId, handler);
}

/**
 * Igual que registerMilestoneHandler pero para el canal granular
 * 'onboarding:step-ui-update' (fases intermedias tipo ESTABLISHED).
 */
export function registerStepUpdateHandler(stepId, handler) {
  stepUpdateHandlers.set(stepId, handler);
}

// ── LOGGING ──────────────────────────────────────────────────────────────
export function log(level, msg) {
  const ts = new Date().toISOString();
  const fn = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
  console[fn](`[${ts}] [${level.toUpperCase()}] [RENDERER] ${msg}`);
  if (window.onboarding?.log) {
    window.onboarding.log(level, msg).catch(() => {});
  }
}

// ── DISPATCH — punto único de entrada para cualquier milestone confirmado ──
// Reemplaza a handleMilestoneReached() del monolito. Sigue siendo el único
// lugar donde un stepId de Brain se traduce en "llamar al handler correcto";
// lo que cambia es que el handler mismo vive en steps/step-*.js, no acá.
export function handleMilestoneReached(stepId, data) {
  log('info', `milestone:reached — stepId: ${stepId}`);

  if (stepId === '__onboarding_complete__') {
    // Todos los steps bloqueantes terminaron. El renderer no hace nada
    // especial acá — el reactor en Main ya llamó a
    // `nucleus synapse onboarding --step success` para avanzar Chrome.
    log('info', 'milestone: onboarding completo (todos los blocking steps ok)');
    return;
  }

  const handler = milestoneHandlers.get(stepId);
  if (!handler) {
    log('warn', `milestone:reached — sin handler registrado para stepId: ${stepId}`);
    return;
  }
  handler(data);
}

function handleStepUpdate(stepId, phase) {
  log('info', `IPC ← onboarding:step-ui-update — stepId: ${stepId} phase: ${phase}`);
  const handler = stepUpdateHandlers.get(stepId);
  if (handler) handler(phase);
}

// ── SYNAPSE CATEGORY ────────────────────────────────────────────────────────
// Mapea el tipo clasificado por SynapseBridge a la categoría que usa el
// Event Feed de debug.html (filters: synapse, brain, sentinel, nucleus,
// temporal, health). Sin cambios de lógica respecto al monolito.
function synapseCategory(data) {
  const t = (data.type || '').toUpperCase();
  const e = (data.event || '').toUpperCase();
  if (t === 'HANDSHAKE' || t === 'ONBOARDING_MILESTONE' || t === 'HOST_READY') return 'synapse';
  if (t === 'INTENT') return 'temporal';
  if (t === 'ION') return 'sentinel';
  if (t === 'PROFILE' || t === 'PROFILE_LAUNCHED' || t === 'PROFILE_CONNECTED') return 'brain';
  if (t === 'STATUS' || t === 'HEARTBEAT') return 'nucleus';
  if (e.startsWith('INTENT_')) return 'temporal';
  if (e.startsWith('ION_')) return 'sentinel';
  if (e.startsWith('PROFILE_')) return 'brain';
  return 'synapse';
}

let _synapseHandshakeNotified = false;

/**
 * Registra los tres listeners de push. Llamar una sola vez desde
 * onboarding.js (DOMContentLoaded). onMilestone/onStepUpdate usan
 * removeAllListeners internamente en el preload — no hace falta
 * des-registrarlos.
 *
 * @param {object} deps
 * @param {(text:string, opts?:object) => void} deps.addNotification
 * @param {(nodeName:string) => void} deps.setStepperEstablished  — de ui-stepper.js
 * @param {(stepId:string) => string|undefined} deps.nodeForStep  — de navigation.js
 */
export function initIpcBridge({ addNotification, setStepperEstablished, nodeForStep }) {
  if (window.onboarding?.onMilestone) {
    window.onboarding.onMilestone(({ stepId, ...data }) => {
      handleMilestoneReached(stepId, data);
    });
    log('info', 'milestone:reached listener registrado');
  } else {
    log('warn', 'window.onboarding.onMilestone no disponible — solo modo poll fallback');
  }

  if (window.onboarding?.onStepUpdate) {
    window.onboarding.onStepUpdate(({ stepId, phase }) => {
      handleStepUpdate(stepId, phase);
      // Comportamiento histórico conservado: ESTABLISHED también actualiza
      // el stepper directamente vía el nodo mapeado, sin depender de que el
      // step module haya registrado un handler propio para esta fase.
      if (phase === 'ESTABLISHED') {
        const nodeName = nodeForStep(stepId);
        if (nodeName) setStepperEstablished(nodeName);
      }
    });
    log('info', 'onboarding:step-ui-update listener registrado');
  }

  if (window.onboarding?.onSynapseEvent) {
    window.onboarding.onSynapseEvent((data) => {
      if (data.type === 'HANDSHAKE' && !_synapseHandshakeNotified) {
        _synapseHandshakeNotified = true;
        addNotification('Synapse handshake complete', { icon: '⚡', type: 'success' });
      }

      // FIX (2026-07-18 — bug ACCOUNT_REGISTERED/google_auth resolviendo a
      // github_auth): este canal (onSynapseEvent) es el feed CRUDO para el
      // panel de debug — antes también llamaba a handleMilestoneReached()
      // usando data.data.step, es decir, el campo "step" tal cual viene
      // escrito DENTRO del payload del mensaje (a veces puesto a mano por
      // un simulador del Harness, con valores viejos/legacy tipo
      // "github_auth"). Eso creaba una segunda resolución de milestone en
      // paralelo a la oficial — la oficial es la que hace Main con
      // registry.resolveEvent() (discrimina por "service", lee el SSOT en
      // disco/fallback) y llega acá por el canal dedicado onMilestone, más
      // arriba en este archivo. Confiar en un "step" que viaja dentro del
      // payload del evento, en vez de en el stepId que Main ya resolvió,
      // es lo que producía el milestone fantasma "github_auth" en paralelo
      // al "google_auth" correcto. Se saca la llamada a
      // handleMilestoneReached() de acá — este bloque ahora solo reenvía
      // el evento crudo al iframe de debug, que es su único propósito real.

      // Reenvío al iframe de debug — siempre disponible
      const frame = document.getElementById('debug-frame');
      if (frame?.contentWindow) {
        frame.contentWindow.postMessage({ type: 'SYNAPSE_RAW_EVENT', payload: data }, '*');
        frame.contentWindow.postMessage({
          type: 'SYNAPSE_EVENT',
          payload: {
            category: synapseCategory(data),
            event: data.event || data.type || '?',
            data: data.data || {},
            profile_id: data._profileId || data.profile_id || null,
            timestamp: data._ts || data.timestamp || Date.now(),
          },
        }, '*');
        log('info', `onSynapseEvent → debug-frame: ${data?.type || data?.event || '?'}`);
      }
    });
    log('info', 'onSynapseEvent listener registrado — bridge activo desde inicio');
  }
}
