// workspace/onboarding/renderer/steps/step-mandate.js
//
// Step: mandate_genesis — screen-mandate. NUEVO (25/07/2026, ver
// MANDATE-STEP-IMPLEMENTATION-PROMPT.md). Contiene lo que hasta esta
// sesión vivía escondido dentro de step-project.js como
// createMandateAndContinue()/continueToMandate() — separado a su propio
// step real del SSOT, con su propia screen y su propio copy explicativo
// (Requerimiento 2.2 del prompt de implementación).
//
// mandate_genesis tiene cortex_events: [] en el SSOT (onboarding_steps.json)
// — Brain/Cortex nunca emite un evento para este step, así que no hay nada
// que esperar por ese lado. La confirmación se resuelve síncronamente acá:
// se llama a window.onboarding.createMandate(...) y, recién cuando esa
// llamada IPC devuelve éxito (y el handler en Main ya escribió
// onboarding.genesis_mandate_id en nucleus.json — ver onboarding-handlers.js
// 'onboarding:create-mandate'), se navega a __onboarding_complete__.
//
// registerMilestoneHandler('mandate_genesis', ...) se registra igual como
// red de seguridad (ej: si algún día se usa el harness de dev para inyectar
// el milestone manualmente vía mark-step-complete), pero en el camino normal
// nunca se dispara — quien realmente avanza la UI es el resultado directo
// del IPC de create-mandate, no un push de Brain.

import { log } from '../core/ipc-bridge.js';
import { addNotification } from '../core/notifications.js';
import { navigateTo, registerStepHandler } from '../core/navigation.js';
import { registerMilestoneHandler } from '../core/ipc-bridge.js';
import { selection } from '../core/shared-state.js';

function getStatusEl() {
  return document.getElementById('mandate-status');
}

function getCreateBtn() {
  return document.getElementById('btn-mandate-continue');
}

/**
 * Pinta el estado de la creación del mandate dentro de screen-mandate.
 * Mismo patrón que showImportStatus() en step-project.js.
 * @param {string} msg
 * @param {'pending'|'success'|'error'} kind
 */
function showMandateStatus(msg, kind) {
  const el = getStatusEl();
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('pending', 'success', 'error');
  el.classList.add('visible', kind);
}

function hideMandateStatus() {
  const el = getStatusEl();
  if (!el) return;
  el.textContent = '';
  el.classList.remove('visible', 'pending', 'success', 'error');
}

/**
 * Resetea screen-mandate a su estado inicial — se llama al entrar al step.
 * A diferencia de screen-project, acá no hay nada que cargar de forma
 * asíncrona (el proyecto ya está confirmado desde project_select) — el
 * botón arranca habilitado, listo para que el usuario confirme.
 */
function resetMandateScreen() {
  hideMandateStatus();
  const btn = getCreateBtn();
  if (btn) {
    btn.disabled = false;
    btn.textContent = 'Create Mandate →';
    btn.onclick = createGenesisMandate;
  }
}

/**
 * Crea el Genesis Mandate — único trabajo real de este step. Se dispara al
 * click de "Create Mandate →" en screen-mandate, ya con project_name/
 * project_path confirmados por project_select.
 */
export async function createGenesisMandate() {
  log('info', 'click — btn-mandate-continue');
  const btn = getCreateBtn();
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Creating mandate…';
  }
  showMandateStatus('Analyzing project and assembling the foundation…', 'pending');

  const project = selection.selectedProject;
  if (!project) {
    // No debería poder pasar (project_select es requires de este step),
    // pero si pasa, no tiene sentido llamar al IPC sin proyecto.
    log('error', 'createGenesisMandate: selection.selectedProject vacío — ¿se saltó project_select?');
    showMandateStatus('No project selected — go back to Project and select one first.', 'error');
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Create Mandate →';
    }
    return;
  }

  log('info', `IPC → onboarding:create-mandate — project: ${project.name}`);
  const result = await window.onboarding.createMandate({
    project: project.name,
    projectPath: selection.importedProjectPath || '',
  });
  log(result.success ? 'info' : 'error',
    `IPC ← onboarding:create-mandate — success: ${result.success}`);

  if (result.success) {
    showMandateStatus('✓ Genesis Mandate created', 'success');
    addNotification('Genesis Mandate created', { icon: '✓', type: 'success' });
    navigateTo('__onboarding_complete__');
  } else {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Retry';
      btn.onclick = createGenesisMandate;
    }
    const errMsg = result?.error || result?.result?.error || result?.message
      || 'Unknown error — Main no devolvió detalle (ver logs de conductor_onboarding).';
    log('error', `createGenesisMandate failed: ${JSON.stringify(result)}`);
    showMandateStatus(`Mandate failed: ${errMsg}`, 'error');
  }
}

/**
 * Fallback de red de seguridad — ver comentario de cabecera. En el camino
 * normal esto nunca se dispara (cortex_events: [] para mandate_genesis).
 */
function onMilestoneMandateGenesis(_data) {
  log('info', 'milestone: mandate_genesis confirmado (push)');
  const milestoneScreen = document.getElementById('screen-milestone');
  if (milestoneScreen && !milestoneScreen.classList.contains('active')) {
    log('info', 'milestone: mandate_genesis — avanzando a onboarding_complete por push');
    navigateTo('__onboarding_complete__');
  }
}

registerMilestoneHandler('mandate_genesis', onMilestoneMandateGenesis);

registerStepHandler('mandate_genesis', {
  onEnter: resetMandateScreen,
});
