// workspace/onboarding/renderer/steps/step-milestone.js
//
// No es un "step" del SSOT — corresponde al sentinel ONBOARDING_COMPLETE
// que devuelve resolution-engine.js, y a las dos screens de cierre
// (milestone, launch) que son puramente de presentación.
// Funciones movidas 1:1: runMilestoneSequence, enterSystem,
// runLaunchSequence, completeOnboarding.

import { log } from '../core/ipc-bridge.js';
import { registerStepHandler, showSystemScreen } from '../core/navigation.js';
import { setStepperEstablished } from '../core/ui-stepper.js';

function showCortex(msg) {
  const el = document.getElementById('cortex-text');
  if (!el) return;
  el.textContent = msg;
  document.getElementById('cortex-bar')?.classList.add('visible');
}

export function runMilestoneSequence() {
  const nodes = document.querySelectorAll('#milestone-nodes .m-node');
  const alreadyDone = Array.from(nodes).every(n => n.classList.contains('show'));
  if (alreadyDone) return;

  document.getElementById('ambient')?.classList.add('milestone');
  nodes.forEach((node, i) => {
    setTimeout(() => node.classList.add('show'), 200 + i * 180);
  });
}

export function enterSystem() {
  log('info', 'click — btn-enter-system');
  showSystemScreen('launch');
  runLaunchSequence();
}

export function runLaunchSequence() {
  document.getElementById('ambient')?.classList.remove('milestone');

  const lines = document.querySelectorAll('#launch-lines .launch-line');
  lines.forEach((line, i) => {
    setTimeout(() => line.classList.add('show'), 300 + i * 500);
    setTimeout(() => line.classList.add('done'), 600 + i * 500);
  });

  showCortex('System initialization complete.');

  const totalDelay = 300 + (lines.length * 500) + 800;
  setTimeout(completeOnboarding, totalDelay);
}

export async function completeOnboarding() {
  showCortex('Establishing workspace connection…');
  log('info', 'IPC → onboarding:complete');

  const result = await window.onboarding.complete({ workspaceUrl: 'http://localhost:3000' });

  log(result.success ? 'info' : 'error',
    `IPC ← onboarding:complete — success: ${result.success}`);
  if (!result.success) {
    log('error', `completeOnboarding failed: ${result.error}`);
    showCortex('Handoff failed: ' + result.error);
  }
  // Si success: Electron redimensiona y carga la URL — el renderer no hace nada más.
}

registerStepHandler('__onboarding_complete__', {
  onEnter() {
    setStepperEstablished('project');
    runMilestoneSequence();
    setTimeout(() => {
      const enterBtn = document.getElementById('enter-btn');
      if (enterBtn) enterBtn.style.opacity = '1';
    }, 1200);
  },
});
