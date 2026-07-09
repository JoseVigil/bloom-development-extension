// workspace/onboarding/renderer/core/navigation.js
//
// Reemplaza por completo:
//   - goTo(n)              (navegación por índice numérico de screen)
//   - SCREEN_IDS            (solo se usa acá, como detalle interno de DOM)
//   - STEP_TO_NODE / STEPPER_MAP / STEPPER_NAV   (colapsados en STEPS + un
//     único mapa de overrides, ver abajo)
//   - RESUME_STEP_ORDER / RESUME_STEP_SCREEN     (el resume ya no calcula
//     "pantalla siguiente" a mano — lo hace resolution-engine.js en Main;
//     acá solo se traduce el stepId resultante a una screen)
//
// Principio (Requerimiento 1 + Paso 1 del roadmap, ver auditoria-stepper-
// workspace.md): la navegación es una función del stepId contra el SSOT
// (onboarding_steps.json), no un índice hardcodeado ni un array paralelo
// mantenido a mano.
//
// ⚠️ HALLAZGO IMPORTANTE — léase antes de deployar este módulo:
// El SSOT (`onboarding_steps.json`) declara:
//     nucleus_create.requires = ["github_app_token"]
// pero la UI actual (goTo(1) = workspace ANTES que goTo(3) = identity/
// github) hace exactamente lo contrario: crea el workspace primero y recién
// después pide GitHub. Si resolution-engine.js pasa a ser la única fuente
// de verdad para "en qué step entra el usuario" (que es literalmente lo
// que pide esta misión), el primer entryStepId que va a devolver al bootear
// sin progreso previo es `github_app_auth`, no `nucleus_create` — porque
// `github_app_auth.requires = []` y es el primero del array que cumple
// "requires ok, produces vacío". Este módulo implementa la navegación fiel
// al SSOT (así lo pide el Requerimiento 1); el cambio de ORDEN resultante
// (github antes que workspace) es una consecuencia real del dato tal cual
// está hoy en el JSON, no una decisión de este archivo. Si el orden
// pretendido sigue siendo "workspace primero", hay que corregir `requires`
// en onboarding_steps.json (quitarle `github_app_token` a nucleus_create)
// antes de este deploy — no alcanza con tocar el renderer.

import { log } from './ipc-bridge.js';
import { setStepperActive, setStepperEstablished, refreshStepperPendingStates } from './ui-stepper.js';

// ── Screens físicas del DOM ─────────────────────────────────────────────────
// Estas son las que existen en onboarding.html. No todas corresponden 1:1 a
// un step del SSOT: 'entry', 'nucleus-init', 'milestone' y 'launch' son
// screens de transición/sistema, no steps del backend.
const SCREEN_IDS = new Set([
  'entry', 'workspace', 'nucleus-init', 'identity', 'vault',
  'project', 'milestone', 'launch',
]);

// stepId (SSOT) → screen física. Existe porque la granularidad de "screen"
// es más fina que la de "view" del SSOT:
//   - github_app_auth y vault_init comparten view:"identity" pero son DOS
//     screens distintas (identity vs vault) — vault_init es la screen 4,
//     no un sub-estado dentro de screen-identity.
//   - google_auth y ai_provider_setup comparten view:"providers" pero
//     ninguno tiene screen propia: ambos se resuelven DENTRO de
//     screen-identity (el sub-wizard sigue ahí, ver steps/step-google.js /
//     step-gemini.js), porque no existe una screen-providers en el HTML.
// Si el HTML alguna vez agrega una screen-providers real, este es el único
// lugar que hay que tocar.
const STEP_SCREEN = {
  github_app_auth: 'identity',
  nucleus_create: 'workspace',
  vault_init: 'vault',
  google_auth: 'identity',
  ai_provider_setup: 'identity',
  project_create: 'project',
};

// stepId especial que no es un step real del JSON.
const ONBOARDING_COMPLETE = '__onboarding_complete__';

// ── Estado del SSOT, cargado en init() ─────────────────────────────────────
let STEPS = [];

// stepId → handlers registrados por cada steps/step-*.js. Se registran al
// importar el módulo del step (ver bottom de cada steps/step-*.js), así
// navigation.js nunca importa steps/* directamente — evita el ciclo
// navigation → steps → navigation.
const stepHandlers = new Map(); // stepId → { onEnter?, restore? }

/**
 * Un step module llama esto al cargar, para declarar qué hacer cuando
 * navigateTo() decide mostrar su screen.
 * @param {string} stepId
 * @param {{ onEnter?: () => void, restore?: (producedSet: Set<string>) => void }} handlers
 */
export function registerStepHandler(stepId, handlers) {
  stepHandlers.set(stepId, handlers);
}

/**
 * Carga el SSOT. Intenta el canal IPC dedicado (getStepsConfig) —
 * consistente con lo que Fase B del roadmap describe como contrato ya
 * cerrado: "Main lo lee de disco; Renderer lo obtiene vía IPC
 * (window.onboarding.getStepsConfig())".
 *
 * PENDIENTE (no confirmado contra onboarding-handlers.js real, que a la
 * fecha de este refactor no expone ese canal todavía — solo expone
 * onboarding:get-resume-state): si getStepsConfig no existe, cae a un
 * fallback embebido idéntico a onboarding_steps.json. Sacar este fallback
 * en cuanto el handler exista en Main, para no volver a tener dos copias
 * del SSOT (el problema original que esta misión busca eliminar).
 */
export async function init() {
  try {
    if (window.onboarding?.getStepsConfig) {
      const cfg = await window.onboarding.getStepsConfig();
      STEPS = cfg?.steps || [];
      log('info', `navigation: STEPS cargado vía IPC — ${STEPS.length} steps`);
      return;
    }
  } catch (e) {
    log('error', `navigation: getStepsConfig falló — ${e.message}`);
  }

  log('warn', 'navigation: window.onboarding.getStepsConfig no existe — usando fallback embebido. '
    + 'Agregar el handler en onboarding-handlers.js para volver a un SSOT único.');
  STEPS = FALLBACK_STEPS;
}

function getStep(stepId) {
  return STEPS.find(s => s.id === stepId);
}

/** stepId → nombre de nodo del stepper (STEPPER_NODES en ui-stepper.js). */
export function nodeForStep(stepId) {
  return getStep(stepId)?.view;
}

// ── Screen activation ───────────────────────────────────────────────────────
function showScreen(screenName) {
  if (!SCREEN_IDS.has(screenName)) {
    log('error', `navigation: screen desconocida "${screenName}"`);
    return;
  }
  log('info', `navigation → screen-${screenName}`);

  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById('screen-' + screenName);
  if (target) {
    target.classList.add('active');
  } else {
    log('error', `screen-${screenName} NOT FOUND in DOM`);
  }
}

/**
 * Punto único de navegación. Reemplaza goTo(n).
 * @param {string} stepId  id del SSOT, o ONBOARDING_COMPLETE
 */
export function navigateTo(stepId) {
  if (stepId === ONBOARDING_COMPLETE) {
    showScreen('milestone');
    stepHandlers.get(ONBOARDING_COMPLETE)?.onEnter?.();
    return;
  }

  const step = getStep(stepId);
  if (!step) {
    log('error', `navigateTo: stepId desconocido "${stepId}" — quedándome en entry`);
    showScreen('entry');
    return;
  }

  const screenName = STEP_SCREEN[stepId] || step.view;
  showScreen(screenName);

  const node = step.view;
  if (node) setStepperActive(node);

  stepHandlers.get(stepId)?.onEnter?.();
}

/** Navega a la screen de entrada (landing, botón "Start"). */
export function goToEntry() {
  showScreen('entry');
}

/**
 * Screens de sistema que NO corresponden a un step del SSOT (no tienen
 * `requires`/`produces`): 'nucleus-init' (terminal transicional) y
 * 'launch' (animación de cierre, post onboarding-complete). Se mantienen
 * como transición explícita de UI, no como parte del grafo de steps.
 */
export function showSystemScreen(name) {
  showScreen(name);
}

/**
 * Usado por el click en un nodo del sidebar (ui-stepper.js): dado un
 * nombre de nodo (workspace/identity/providers/project/mandate), resuelve
 * el PRIMER step del SSOT que pertenece a ese nodo y navega ahí.
 */
/**
 * Primer step del SSOT en orden canónico — usado por el botón "Start" de
 * screen-entry. Reemplaza el goTo(1) hardcodeado del monolito: antes
 * "empezar" significaba siempre "ir a workspace"; ahora significa "ir al
 * primer step que el propio SSOT declara sin requires". Ver el hallazgo al
 * tope de este archivo sobre lo que esto implica en el orden real.
 */
export function getFirstStepId() {
  return STEPS[0]?.id ?? null;
}

export function navigateToNode(nodeName) {
  const step = STEPS.find(s => s.view === nodeName);
  if (!step) {
    log('warn', `navigateToNode: ningún step del SSOT tiene view="${nodeName}"`);
    return;
  }
  navigateTo(step.id);
}

/**
 * Resume de sesión interrumpida — reemplaza resumeOnboarding()/goTo(n)
 * hardcodeado. Se alimenta directamente de la respuesta de
 * onboarding:get-resume-state, que ya corre resolution-engine.js en Main:
 *   { success, stepId, produced }
 * stepId es el entry point calculado dinámicamente (Requerimiento 1).
 * produced es la lista de artefactos que YA existen de verdad — se usa
 * para: (a) marcar established los nodos correspondientes en el sidebar,
 * (b) avisarle a cada step module qué ya está resuelto, vía su hook
 * `restore(producedSet)`, para que pinte su propio estado (inputs,
 * usernames, íconos) sin que navigation.js conozca el detalle de cada uno.
 */
export async function resumeFromEntryPoint() {
  if (!window.onboarding?.getResumeState) {
    log('warn', 'resumeFromEntryPoint: getResumeState no disponible — fresh start');
    goToEntry();
    return;
  }

  let resume;
  try {
    resume = await window.onboarding.getResumeState();
  } catch (e) {
    log('error', `resumeFromEntryPoint: error leyendo estado — ${e.message}`);
    goToEntry();
    return;
  }

  const { stepId, produced = [] } = resume;
  const producedSet = new Set(produced);

  if (!stepId) {
    log('info', 'resumeFromEntryPoint: sin stepId — fresh start');
    goToEntry();
    return;
  }

  log('info', `resumeFromEntryPoint: entryStepId="${stepId}" produced=[${produced.join(', ')}]`);

  // Marcar established cada nodo cuyo `produces` ya existe.
  for (const step of STEPS) {
    if (step.produces && producedSet.has(step.produces) && step.view) {
      setStepperEstablished(step.view);
    }
  }

  // Avisar a cada step module registrado para que restaure su propio
  // estado visual (inputs, usernames, íconos de cuenta, etc.).
  for (const [id, handlers] of stepHandlers) {
    handlers.restore?.(producedSet);
  }

  if (producedSet.size === 0) {
    // Sin ningún artefacto todavía → arranque limpio, screen de entrada.
    goToEntry();
    return;
  }

  navigateTo(stepId);
}

// ── Fallback embebido — ver comentario de init() más arriba ────────────────
// Copia 1:1 de onboarding_steps.json al momento de este refactor. Borrar
// en cuanto exista window.onboarding.getStepsConfig().
const FALLBACK_STEPS = [
  { id: 'github_app_auth', view: 'identity', requires: [], produces: 'github_app_token' },
  { id: 'nucleus_create', view: 'workspace', requires: ['github_app_token'], produces: 'workspace_path' },
  { id: 'vault_init', view: 'identity', requires: ['github_app_token', 'workspace_path'], produces: 'vault_initialized' },
  { id: 'google_auth', view: 'providers', requires: ['vault_initialized'], produces: 'google_account' },
  { id: 'ai_provider_setup', view: 'providers', requires: ['vault_initialized'], produces: 'ai_provider_key' },
  { id: 'project_create', view: 'project', requires: ['vault_initialized', 'github_app_token'], produces: 'project_mandate' },
];

export { refreshStepperPendingStates };
