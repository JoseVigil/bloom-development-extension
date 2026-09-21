// workspace/onboarding/renderer/steps/step-backend-identity.js
//
// Step 0 del onboarding: backend_identity_check (Auth 1). Ver
// Investigacion_Onboarding_ValidacionGitHub_ServerSide_PuntoInsercion_v1_0.md
// para el diseño completo (encargo de ejecución cerrado). Puntos de diseño
// que este módulo respeta sin desviarse:
//
//   - Auth 1 es SOLO identidad (§5): no pide ni descarga ningún token acá.
//     No depende de que exista Vault ni workspace — corre antes de
//     nucleus_create.
//   - El resultado (branch/orgId/role) llega vía el handler dedicado que
//     milestone-reactor.js registra para este step (§6.6) — nunca vía
//     _defaultReaction(), así que el payload de onMilestone siempre trae
//     esos campos cuando corresponde.
//   - El fallo de servidor NO es un milestone (no hay `produces` real) —
//     llega por el canal de fase step-ui-update con phase:'ERROR' (§8.4).
//   - Mismo patrón de tres capas (push + pull autoritativo + poll de
//     respaldo) que ya usan step-vault.js/step-identity.js (§3.1).

import { log, registerMilestoneHandler, registerStepUpdateHandler, handleMilestoneReached } from '../core/ipc-bridge.js';
import { addNotification } from '../core/notifications.js';
import { navigateTo, registerStepHandler } from '../core/navigation.js';

const state = {
  triggered: false,
  resolved: false,
  pollTimer: null,
};

function setTitle(text) {
  const el = document.getElementById('backend-identity-title');
  if (el) el.textContent = text;
}

function setBody(text) {
  const el = document.getElementById('backend-identity-body');
  if (el) el.textContent = text;
}

function showStatus(label) {
  const box = document.getElementById('backend-identity-status');
  const val = document.getElementById('backend-identity-status-val');
  if (box) box.style.display = 'flex';
  if (val) val.textContent = label;
}

function showError(message) {
  const el = document.getElementById('backend-identity-error');
  if (el) el.textContent = message || '';
}

function enableContinue() {
  const btn = document.getElementById('btn-continue-backend-identity');
  if (btn) {
    btn.disabled = false;
    btn.textContent = 'Continuar →';
  }
}

/**
 * onclick del botón "Continuar" de screen-backend-identity-check.
 * Exportado para que onboarding.js lo cablee a window, mismo patrón que
 * continueWorkspace/selectWorkspaceFolder en step-workspace.js.
 */
export function continueBackendIdentity() {
  navigateTo('nucleus_create');
}

function clearPoll() {
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

async function triggerBackendIdentityCheck() {
  if (state.triggered) return;
  state.triggered = true;

  setTitle('Validando tu cuenta…');
  setBody('Estamos confirmando tu identidad contra el servidor antes de continuar con la configuración local.');
  showError('');

  log('info', 'IPC → onboarding:validate-backend-identity');
  const result = await window.onboarding.validateBackendIdentity?.();
  log(result?.success ? 'info' : 'warn',
    `IPC ← onboarding:validate-backend-identity — success: ${result?.success}`);

  // Poll de respaldo (§6.8/§3.1 del doc) — mismo patrón que
  // step-vault.js::runVaultInit. window.onboarding.pollBackendIdentity()
  // lee lo que el handler dedicado del reactor ya persistió.
  state.pollTimer = setInterval(async () => {
    if (state.resolved) { clearPoll(); return; }
    const pollResult = await window.onboarding.pollBackendIdentity?.();
    if (pollResult?.success && pollResult.validated) {
      log('info', 'poll fallback: backend_identity_check confirmado vía pollBackendIdentity');
      handleMilestoneReached('backend_identity_check', {
        branch: pollResult.branch,
        orgId: pollResult.orgId,
        role: pollResult.role,
      });
    }
  }, 3000);
}

function onMilestoneBackendIdentityCheck(data) {
  if (state.resolved) return;
  state.resolved = true;
  clearPoll();

  log('info', `milestone: backend_identity_check confirmado — branch: ${data?.branch || 'n/a'}`);
  addNotification('Identidad verificada', { icon: '🪪', type: 'success' });

  // Bifurcación de UI por rama — el ruteo real hacia getOrCreateOrg()/
  // nucleus_create según la rama queda fuera de alcance de este encargo
  // (§9 del doc: el schema de roles/tenant y la lógica de bifurcación de
  // getOrCreateOrg() no están definidos todavía). Acá solo se refleja la
  // rama resuelta en la UI y se habilita continuar — el mismo botón lleva
  // a nucleus_create en los tres casos.
  const branch = data?.branch || null;
  if (branch === 'invited_existing_org') {
    setTitle('Te uniste a una organización existente');
    setBody('Tu cuenta fue reconocida como invitado. Continuá con la configuración local.');
    showStatus(`Invitado — org: ${data?.orgId || '—'} · rol: ${data?.role || '—'}`);
  } else if (branch === 'no_organization') {
    setTitle('Cuenta validada — sin organización');
    setBody('Tu cuenta fue validada, pero todavía no pertenece a ninguna organización. Podés continuar y crear tu workspace local.');
    showStatus('Sin organización');
  } else {
    setTitle('Cuenta validada');
    setBody('Tu identidad fue confirmada. Continuá con la configuración local.');
    showStatus('Cuenta nueva / master');
  }

  enableContinue();
}

/**
 * Canal step-ui-update (fases intermedias). El único caso que este step usa
 * hoy es 'ERROR' (§8.4: fallo del servidor NO es un milestone). El contrato
 * de ipc-bridge.js::handleStepUpdate solo pasa `phase` al handler registrado
 * (no reenvía datos extra del payload) — no se altera ese contrato acá.
 */
function onStepUpdateBackendIdentityCheck(phase) {
  if (phase === 'ERROR') {
    log('warn', 'step-ui-update: backend_identity_check ERROR');
    showError('No se pudo validar tu cuenta contra el servidor. Reintentá en unos segundos.');
  }
}

registerMilestoneHandler('backend_identity_check', onMilestoneBackendIdentityCheck);
registerStepUpdateHandler('backend_identity_check', onStepUpdateBackendIdentityCheck);

registerStepHandler('backend_identity_check', {
  onEnter: triggerBackendIdentityCheck,
  restore(producedSet) {
    if (producedSet.has('backend_identity_validated')) {
      state.resolved = true;
      clearPoll();
      enableContinue();
      setTitle('Cuenta validada');
      setBody('Tu identidad ya fue confirmada en una sesión anterior.');
      log('info', 'resume: backend_identity_check restaurado — botón habilitado');
    }
  },
});
