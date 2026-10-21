// workspace/onboarding/renderer/steps/step-mandate.js
//
// Step: mandate_genesis — screen-mandate.
//
// Pantalla explicativa: confirma que el proyecto seleccionado o importado
// queda como contexto del workspace. No crea, descarga ni instala Mandates;
// Genesis se instala desde Wisdom, por gesto explícito del Paladín y sobre un
// proyecto ya existente.
//
// El step se completa con `onboarding.mandate_screen_acknowledged`, mediante
// window.onboarding.markStepComplete({step:'mandate_genesis'}) →
// onboarding-handlers.js 'onboarding:mark-step-complete' →
// reactor.handleMilestone() → _persistStepComplete() (milestone-reactor.js),
// verificado por step-verifiers.js con json_field.

import { log } from '../core/ipc-bridge.js';
import { addNotification } from '../core/notifications.js';
import { navigateTo, registerStepHandler } from '../core/navigation.js';
import { registerMilestoneHandler } from '../core/ipc-bridge.js';

function getStatusEl() {
  return document.getElementById('mandate-status');
}

function getContinueBtn() {
  return document.getElementById('btn-mandate-continue');
}

/**
 * Pinta el estado de la confirmación dentro de screen-mandate.
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
 * No hay nada que cargar de forma asíncrona: es una pantalla informativa,
 * el botón arranca habilitado, listo para que el usuario la reconozca.
 */
function resetMandateScreen() {
  hideMandateStatus();
  const btn = getContinueBtn();
  if (btn) {
    btn.disabled = false;
    btn.textContent = 'Got it — Continue →';
    btn.onclick = acknowledgeMandateScreen;
  }
}

/**
 * Único trabajo de este step: registrar que el usuario reconoció la
 * pantalla explicativa. No crea ningún Mandate.
 */
export async function acknowledgeMandateScreen() {
  log('info', 'click — btn-mandate-continue (acknowledge, sin crear mandate)');
  const btn = getContinueBtn();
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Continuing…';
  }
  showMandateStatus('Confirming…', 'pending');

  log('info', "IPC → onboarding:mark-step-complete — step: 'mandate_genesis'");
  const result = await window.onboarding.markStepComplete({ step: 'mandate_genesis' });
  log(result.success ? 'info' : 'error',
    `IPC ← onboarding:mark-step-complete — success: ${result.success}`);

  if (result.success) {
    showMandateStatus('✓ Got it', 'success');
    addNotification('Project confirmed', { icon: '✓', type: 'success' });
    navigateTo('__onboarding_complete__');
  } else {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Retry';
      btn.onclick = acknowledgeMandateScreen;
    }
    const errMsg = result?.error || 'Unknown error — Main no devolvió detalle (ver logs de conductor_onboarding).';
    log('error', `acknowledgeMandateScreen failed: ${JSON.stringify(result)}`);
    showMandateStatus(`Could not continue: ${errMsg}`, 'error');
  }
}

/**
 * Fallback de red de seguridad — ver comentario de cabecera. En el camino
 * normal esto puede llegar a dispararse ahora sí (a diferencia de antes):
 * markStepComplete() pasa por reactor.handleMilestone(), que emite
 * milestone:reached para 'mandate_genesis'. Queda igual de idempotente que
 * antes — solo navega si screen-milestone todavía no está activa.
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
