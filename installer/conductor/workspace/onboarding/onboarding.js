console.log('%c[ONBOARDING BUILD] modular-v1 (SSOT navigation, sin goTo/RESUME_STEP_ORDER)', 'background:#222;color:#0f0;font-size:14px;padding:4px;');

// workspace/onboarding/onboarding.js — Bloom Conductor (Synapse Protocol v4.0)
//
// Orquestador principal. Todo lo que antes era un monolito de ~1800 líneas
// ahora vive en renderer/core/ y renderer/steps/ — este archivo solo:
//   1. Importa los módulos (los steps se auto-registran contra
//      navigation.js / ipc-bridge.js al importarse — ver cada archivo).
//   2. Inicializa el SSOT (navigation.init()).
//   3. Cablea los pocos handlers de DOM que no pertenecen a ningún step
//      concreto (botón Start, nodos del stepper, tabs, popup de ayuda).
//   4. Dispara el resume de sesión interrumpida al final, una vez que todo
//      lo demás ya está registrado.
//
// Lo que este archivo YA NO tiene, a propósito:
//   - goTo(n) / SCREEN_IDS / STEPPER_MAP / STEPPER_NAV / RESUME_STEP_ORDER
//     → navigation.js, derivados del SSOT.
//   - Ningún handler de milestone ni lógica de negocio de un step puntual
//     → steps/step-*.js.

import * as navigation from './renderer/core/navigation.js';
import { initIpcBridge, log } from './renderer/core/ipc-bridge.js';
import { addNotification } from './renderer/core/notifications.js';
import {
  setStepperEstablished, refreshStepperPendingStates,
  handleStepperNodeClick, bindNodeClickHandler,
} from './renderer/core/ui-stepper.js';
import { switchTab, initTabShortcut, initHarnessMessageBridge } from './renderer/core/tab-system.js';
import { setUserEmail } from './renderer/core/shared-state.js';

// Los steps se registran a sí mismos contra navigation.js/ipc-bridge.js con
// solo importarlos (side-effect imports) — por eso no hace falta usar
// ningún export de estos módulos acá abajo.
import './renderer/steps/step-workspace.js';
import './renderer/steps/step-identity.js';
import './renderer/steps/step-vault.js';
import './renderer/steps/step-project.js';
import './renderer/steps/step-milestone.js';

// Bindings puntuales que sí necesitan un import directo porque los llama
// un onclick inline de onboarding.html (ver notas de migración al final).
import { onWorkspacePathInput, onWorkspaceOrgInput, onWorkspaceOrgBlur, continueWorkspace, selectWorkspaceFolder } from './renderer/steps/step-workspace.js';
import { handleIdentityBtn, openInfo, closeInfo, toggleAccount } from './renderer/steps/step-identity.js';
import { enterSystem } from './renderer/steps/step-milestone.js';

// navigation.js no importa ui-stepper "hacia arriba" para no generar un
// ciclo — el bootstrap cablea la conexión una sola vez, acá.
bindNodeClickHandler(navigation.navigateToNode);

// ── Exposición de compatibilidad para onclick="" inline en onboarding.html ──
// Se mantienen los MISMOS nombres que ya usa el HTML (closeInfo,
// navigateToStep, switchTab, selectWorkspaceFolder, continueWorkspace,
// enterSystem) para no tener que tocar esas líneas. La ÚNICA que cambia de
// verdad es goTo(1) → startOnboarding(), porque eliminar goTo(n) por
// completo es un requisito explícito de esta misión — ver MIGRATION al
// final de este archivo para el diff exacto que hay que aplicar al HTML.
window.closeInfo = closeInfo;
window.openInfo = openInfo;
window.toggleAccount = toggleAccount;
window.navigateToStep = handleStepperNodeClick;
window.switchTab = switchTab;
window.selectWorkspaceFolder = selectWorkspaceFolder;
window.continueWorkspace = continueWorkspace;
window.enterSystem = enterSystem;
window.startOnboarding = () => {
  const firstStepId = navigation.getFirstStepId();
  if (!firstStepId) {
    log('error', 'startOnboarding: no hay steps cargados en el SSOT');
    return;
  }
  navigation.navigateTo(firstStepId);
};

document.addEventListener('DOMContentLoaded', async () => {
  log('info', 'DOM ready — initialized');

  await navigation.init();

  document.getElementById('btn-continue-identity').onclick = handleIdentityBtn;

  refreshStepperPendingStates();

  const wsPathInput = document.getElementById('ws-path-input');
  if (wsPathInput) wsPathInput.addEventListener('input', onWorkspacePathInput);

  const wsOrgInput = document.getElementById('ws-org-input');
  if (wsOrgInput) {
    wsOrgInput.addEventListener('input', onWorkspaceOrgInput);
    wsOrgInput.addEventListener('blur', onWorkspaceOrgBlur);
  }

  const btnWorkspace = document.getElementById('btn-continue-workspace');
  if (btnWorkspace) btnWorkspace.onclick = continueWorkspace;

  initIpcBridge({ addNotification, setStepperEstablished, nodeForStep: navigation.nodeForStep });
  initTabShortcut();
  initHarnessMessageBridge();

  // Resume de sesión interrumpida — reemplaza resumeOnboarding()/goTo(n).
  // Se llama al final para que todos los listeners y registros de steps
  // (registerStepHandler / registerMilestoneHandler) ya estén activos
  // cuando navigateTo() dispare efectos secundarios (loadRepos,
  // runVaultInit, etc.).
  navigation.resumeFromEntryPoint().catch(err => {
    log('error', `resumeFromEntryPoint error — ${err.message}`);
    navigation.goToEntry();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// MIGRATION — cambios pendientes en onboarding.html (fuera del alcance de
// este refactor de renderer/, pero necesarios para que esto funcione):
//
// 1. <script src="onboarding.js"></script>  →  agregar type="module":
//      <script type="module" src="onboarding.js"></script>
//
// 2. Único onclick que DEBE cambiar de nombre (elimina goTo(n) del HTML):
//      <button class="btn-primary" onclick="goTo(1)">Start</button>
//      →
//      <button class="btn-primary" onclick="startOnboarding()">Start</button>
//
// El resto de los onclick= (closeInfo, navigateToStep, switchTab,
// selectWorkspaceFolder, continueWorkspace, enterSystem) NO necesitan
// tocarse — este archivo expone esos mismos nombres en window.
// ─────────────────────────────────────────────────────────────────────────
