// workspace/onboarding/renderer/steps/step-vault.js
//
// Step: vault_init — screen-vault. Funciones movidas 1:1: runVaultInit,
// _clearVaultPollFallback, _onMilestoneVaultInit.
//
// RF-09: dispara vault_init activamente al ENTRAR a la screen (antes:
// goTo(4) → runVaultInit() en el switch de goTo). Ahora ese disparo vive
// en el onEnter registrado al final de este archivo.

import { log, registerMilestoneHandler, handleMilestoneReached } from '../core/ipc-bridge.js';
import { addNotification } from '../core/notifications.js';
import { navigateTo, registerStepHandler } from '../core/navigation.js';
import { setStepperEstablished } from '../core/ui-stepper.js';
import { activeAccounts, vaultState, userEmail } from '../core/shared-state.js';
import { advanceToNextIdentityStep } from './step-identity.js';

function showCortex(msg) {
  const el = document.getElementById('cortex-text');
  if (!el) return;
  el.textContent = msg;
  document.getElementById('cortex-bar')?.classList.add('visible');
}

// SUPUESTO A VERIFICAR (heredado del monolito, sin confirmar contra
// onboarding-handlers.js real): se asume que window.onboarding.navigate()
// acepta step: 'vault_init' igual que acepta 'github_auth' / 'google_auth' /
// 'ai_provider_setup'.
export async function runVaultInit() {
  if (vaultState.initTriggered) return;
  if (activeAccounts.has('vault_init')) return;
  vaultState.initTriggered = true;

  const btn = document.getElementById('btn-continue-vault');
  if (btn) {
    btn.textContent = 'Inicializando vault…';
    btn.disabled = true;
    btn.onclick = null;
  }

  showCortex('Setting up vault…');
  log('info', 'IPC → onboarding:navigate — step: vault_init');

  const navResult = await window.onboarding.navigate({ step: 'vault_init', email: userEmail });
  log(navResult.success ? 'info' : 'warn',
    `IPC ← onboarding:navigate (vault_init) — success: ${navResult.success}`);

  if (!navResult.success) {
    log('warn', 'navigate(vault_init) falló — dejando el poll fallback como único camino');
  }

  const pollStatus = document.getElementById('vault-poll-status');
  if (pollStatus) pollStatus.style.display = 'flex';

  const vaultTimeoutId = setTimeout(() => {
    if (activeAccounts.has('vault_init')) return;
    showCortex('Vault is taking longer than expected…');
  }, 3 * 60 * 1000);

  vaultState.pollFallbackTimer = setInterval(async () => {
    if (activeAccounts.has('vault_init')) {
      _clearVaultPollFallback(vaultTimeoutId);
      return;
    }

    const pollResult = await window.onboarding.pollIdentity();
    if (!pollResult.success) return;

    if (pollResult.steps?.vault_init) {
      log('info', 'poll fallback: vault_init confirmado vía pollIdentity');
      handleMilestoneReached('vault_init', {});
    }
  }, 3000);
}

function _clearVaultPollFallback(vaultTimeoutId) {
  if (vaultState.pollFallbackTimer) {
    clearInterval(vaultState.pollFallbackTimer);
    vaultState.pollFallbackTimer = null;
    log('info', 'vault poll fallback timer limpiado');
  }
  if (vaultTimeoutId) clearTimeout(vaultTimeoutId);
}

function onMilestoneVaultInit(_data) {
  if (activeAccounts.has('vault_init')) return;
  log('info', 'milestone: vault_init confirmado por Brain');

  activeAccounts.add('vault_init');
  addNotification('Vault initialized', { icon: '🔒', type: 'success' });
  setStepperEstablished('identity'); // vault_init.view === 'identity' en el SSOT
  showCortex('Vault initialized.');
  _clearVaultPollFallback();

  const btn = document.getElementById('btn-continue-vault');
  if (btn) {
    btn.textContent = 'Continuar →';
    btn.disabled = false;
    btn.onclick = () => {
      log('info', 'vault confirmado — retomando identity wizard en Google');
      navigateTo('google_auth');
      advanceToNextIdentityStep();
    };
  }
}

registerMilestoneHandler('vault_init', onMilestoneVaultInit);

registerStepHandler('vault_init', {
  onEnter: runVaultInit,
  restore(producedSet) {
    if (producedSet.has('vault_initialized')) {
      activeAccounts.add('vault_init');
      const vaultBtn = document.getElementById('btn-continue-vault');
      if (vaultBtn) {
        vaultBtn.textContent = 'Continuar →';
        vaultBtn.disabled = false;
        vaultBtn.onclick = () => {
          navigateTo('google_auth');
          advanceToNextIdentityStep();
        };
      }
      log('info', 'resume: vault_init restaurado — activeAccounts + botón habilitados');
    }
  },
});
