// workspace/onboarding/renderer/steps/step-project.js
//
// Step: project_create — screen-project. Funciones movidas 1:1: loadRepos,
// selectProject, createMandateAndContinue, _onMilestoneProjectCreate.

import { log } from '../core/ipc-bridge.js';
import { addNotification } from '../core/notifications.js';
import { navigateTo, registerStepHandler } from '../core/navigation.js';
import { registerMilestoneHandler } from '../core/ipc-bridge.js';
import { selection, state } from '../core/shared-state.js';

function showCortex(msg) {
  const el = document.getElementById('cortex-text');
  if (!el) return;
  el.textContent = msg;
  document.getElementById('cortex-bar')?.classList.add('visible');
}

export async function loadRepos() {
  const grid = document.getElementById('project-grid');
  if (!grid) return;
  grid.innerHTML = `
    <div style="color:var(--text-dim);font-family:var(--font-mono);
                font-size:12px;padding:16px;grid-column:1/-1;">
      Loading repositories…
    </div>`;

  const result = await window.onboarding.listRepos({ org: selection.selectedOrg });
  grid.innerHTML = '';

  if (result.success && result.repos.length > 0) {
    result.repos.slice(0, 5).forEach(repo => {
      const card = document.createElement('div');
      card.className = 'project-card';
      card.innerHTML = `
        <div class="project-card-name">${repo.name}</div>
        <div class="project-card-type">Repository</div>
      `;
      card.onclick = () => selectProject(card, repo);
      grid.appendChild(card);
    });
  }

  const local = document.createElement('div');
  local.className = 'project-card';
  local.innerHTML = `
    <div class="project-card-name">+ Local folder</div>
    <div class="project-card-type">Select path</div>
  `;
  local.onclick = async () => {
    const fr = await window.onboarding.selectFolder();
    if (fr.success) {
      selectProject(local, {
        name: fr.path.split(/[\\/]/).pop(),
        path: fr.path,
      });
    }
  };
  grid.appendChild(local);
}

export function selectProject(el, repoObj) {
  if (selection.selectedProjectEl) selection.selectedProjectEl.classList.remove('selected');
  el.classList.add('selected');
  selection.selectedProjectEl = el;
  selection.selectedProject = repoObj;
  state.selectedRepo = repoObj;
  const btn = document.getElementById('btn-create-mandate');
  if (btn) {
    btn.disabled = false;
    btn.onclick = createMandateAndContinue;
  }
}

export async function createMandateAndContinue() {
  log('info', 'click — btn-create-mandate');
  const btn = document.getElementById('btn-create-mandate');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Creating mandate…';
  }

  log('info', `IPC → onboarding:create-mandate — project: ${selection.selectedProject.name}`);
  const result = await window.onboarding.createMandate({
    project: selection.selectedProject.name,
    projectPath: selection.selectedProject.path || '',
  });
  log(result.success ? 'info' : 'error',
    `IPC ← onboarding:create-mandate — success: ${result.success}`);

  if (result.success) {
    // El milestone push ('project_create') es quien realmente avanza la UI
    // (ver onMilestoneProjectCreate). El navigate('success') de acá sigue
    // funcionando como fallback si Brain no emite el evento.
    log('info', 'IPC → onboarding:navigate — step: success');
    const navResult = await window.onboarding.navigate({ step: 'success' });
    log(navResult.success ? 'info' : 'error',
      `IPC ← onboarding:navigate — success: ${navResult.success}`);
    navigateTo('__onboarding_complete__');
  } else {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Retry';
    }
    log('error', `createMandateAndContinue failed: ${result.error}`);
    showCortex('Mandate failed: ' + result.error);
  }
}

function onMilestoneProjectCreate(_data) {
  log('info', 'milestone: project_create confirmado por Brain');
  addNotification('Project created — workspace ready', { icon: '✓', type: 'success' });
  const milestoneScreen = document.getElementById('screen-milestone');
  if (milestoneScreen && !milestoneScreen.classList.contains('active')) {
    log('info', 'milestone: project_create — avanzando a milestone por push');
    navigateTo('__onboarding_complete__');
  }
}

registerMilestoneHandler('project_create', onMilestoneProjectCreate);

registerStepHandler('project_create', {
  onEnter: loadRepos,
});
