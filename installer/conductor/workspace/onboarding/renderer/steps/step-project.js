// workspace/onboarding/renderer/steps/step-project.js
//
// Step: project_create — screen-project. Funciones movidas 1:1: loadRepos,
// selectProject, createMandateAndContinue, _onMilestoneProjectCreate.
//
// FIX (24/07/2026): el step de PROJECT arrancaba y terminaba en PROJECT,
// pero la UI no lo reflejaba así — al elegir "+ Local folder" la carpeta
// se marcaba como seleccionada y ahí nomás aparecía el botón "Crear
// Mandate →", sin haber corrido todavía el import/copy al root de Nucleus
// ni mostrar ninguna confirmación de que eso había pasado. El import y la
// creación del mandate corrían juntos, recién al clickear ese botón, y el
// resultado visual era confuso: el usuario veía "Crear Mandate" cuando en
// realidad lo único pendiente en PROJECT era confirmar el import.
//
// Se separan las dos fases:
//   1. importSelectedProject() — corre SOLO con seleccionar (repo o
//      carpeta local), automáticamente. Si hay que copiar archivos
//      (carpeta local), lo hace acá y muestra el resultado en
//      #project-import-status ("Importando…" → "✓ Importado"). Recién
//      ahí se habilita el botón, ahora "Continuar →" en vez de
//      "Crear Mandate →" — su único trabajo visual es avanzar, no crear
//      nada por sorpresa.
//   2. continueToMandate() — lo que faltaba (creación del Genesis Mandate
//      + navigate) se dispara al click de "Continuar →", ya con el
//      import confirmado de antemano. Esta fase es la que se va a seguir
//      afinando cuando se rediseñe la UI del stepper de mandate.
//
// De paso, showCortex() apuntaba a #cortex-bar/#cortex-text, que ya no
// existen en onboarding.html (reemplazados por #notification-rail — ver
// ese archivo). Los errores de import/mandate no se veían en ningún lado.
// Reemplazado por showImportStatus(), que sí pinta sobre un elemento real
// del DOM (#project-import-status), más addNotification() para el rail.

import { log } from '../core/ipc-bridge.js';
import { addNotification } from '../core/notifications.js';
import { navigateTo, registerStepHandler } from '../core/navigation.js';
import { registerMilestoneHandler } from '../core/ipc-bridge.js';
import { selection, state } from '../core/shared-state.js';

function getStatusEl() {
  return document.getElementById('project-import-status');
}

function getContinueBtn() {
  return document.getElementById('btn-project-continue');
}

/**
 * Pinta el estado del import/selección dentro de screen-project.
 * @param {string} msg
 * @param {'pending'|'success'|'error'} kind
 */
function showImportStatus(msg, kind) {
  const el = getStatusEl();
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('pending', 'success', 'error');
  el.classList.add('visible', kind);
}

function hideImportStatus() {
  const el = getStatusEl();
  if (!el) return;
  el.textContent = '';
  el.classList.remove('visible', 'pending', 'success', 'error');
}

/** Resetea screen-project a su estado inicial — se llama al entrar al step. */
function resetProjectScreen() {
  hideImportStatus();
  selection.importedProjectPath = null;
  const btn = getContinueBtn();
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Continuar →';
    btn.onclick = null;
  }
}

export async function loadRepos() {
  resetProjectScreen();

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

/**
 * Marca la card elegida y dispara el import inmediatamente — ya no espera
 * al click de "Continuar" para eso. El step PROJECT no debería concluir
 * (habilitar el avance) hasta que el import esté confirmado.
 */
export function selectProject(el, repoObj) {
  if (selection.selectedProjectEl) selection.selectedProjectEl.classList.remove('selected');
  el.classList.add('selected');
  selection.selectedProjectEl = el;
  selection.selectedProject = repoObj;
  state.selectedRepo = repoObj;

  importSelectedProject();
}

/**
 * Fase 1 del step: confirma el proyecto elegido dentro de PROJECT.
 *
 * - Si viene de una carpeta local (tiene `path`), corre el import/copy al
 *   root de Nucleus acá mismo y muestra el resultado en pantalla.
 * - Si es un repo listado (sin `path` de filesystem propio), no hay nada
 *   que copiar — se confirma la selección directamente (ver comentario
 *   original en createMandateAndContinue / spec §2.3).
 *
 * En ambos casos, termina habilitando "Continuar →" — ese botón deja de
 * significar "crear el mandate ya mismo" y pasa a significar "avanzar con
 * el proyecto ya confirmado".
 */
export async function importSelectedProject() {
  const btn = getContinueBtn();
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Continuar →';
  }

  const project = selection.selectedProject;
  if (!project) return;

  if (!project.path) {
    // Repo de GitHub — nada que copiar, la selección ya es la confirmación.
    selection.importedProjectPath = '';
    showImportStatus(`✓ "${project.name}" seleccionado — listo para continuar`, 'success');
    if (btn) {
      btn.disabled = false;
      btn.onclick = continueToMandate;
    }
    return;
  }

  showImportStatus(`Importando "${project.name}"…`, 'pending');
  log('info', `IPC → onboarding:import-project — project: ${project.name}`);
  const importResult = await window.onboarding.importProject({
    project: project.name,
    sourcePath: project.path,
  });
  log(importResult.success ? 'info' : 'error',
    `IPC ← onboarding:import-project — success: ${importResult.success}`);

  if (!importResult.success) {
    log('error', `importSelectedProject — import failed: ${importResult.error}`);
    showImportStatus(`Import failed: ${importResult.error} — elegí el proyecto de nuevo para reintentar.`, 'error');
    return; // btn queda disabled — el step no avanza hasta que el import ande.
  }

  // El proyecto ahora vive físicamente en destPath — es ese path, no el
  // original fuera del root de Nucleus, el que corresponde pasar de acá
  // en más (mandate genesis, project_path persistido, etc.).
  selection.importedProjectPath = importResult.destPath;
  showImportStatus(`✓ "${project.name}" importado — listo para continuar`, 'success');

  if (importResult.gitExcluded && importResult.gitExcluded.length > 0) {
    addNotification(
      `Copied — ${importResult.gitExcluded.length} .git ${importResult.gitExcluded.length === 1 ? 'folder' : 'folders'} excluded (no commit history)`,
      { icon: 'ℹ️', type: 'info' }
    );
  }

  if (btn) {
    btn.disabled = false;
    btn.onclick = continueToMandate;
  }
}

/**
 * Fase 2 del step: recién acá se crea el Genesis Mandate y se avanza fuera
 * de PROJECT. Se dispara solo desde "Continuar →", que solo está
 * habilitado una vez que importSelectedProject() confirmó el proyecto.
 *
 * (La UI de esta parte — lo que se ve mientras el mandate se crea, el
 * screen al que se navega — queda pendiente de revisar por separado, una
 * vez que el usuario efectivamente llega acá.)
 */
export async function continueToMandate() {
  log('info', 'click — btn-project-continue');
  const btn = getContinueBtn();
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Creando mandate…';
  }

  log('info', `IPC → onboarding:create-mandate — project: ${selection.selectedProject.name}`);
  const result = await window.onboarding.createMandate({
    project: selection.selectedProject.name,
    projectPath: selection.importedProjectPath || '',
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
      btn.textContent = 'Reintentar';
      btn.onclick = continueToMandate;
    }
    const errMsg = result?.error || result?.result?.error || result?.message
      || 'Unknown error — Main no devolvió detalle (ver logs de conductor_onboarding).';
    log('error', `continueToMandate failed: ${JSON.stringify(result)}`);
    showImportStatus(`Mandate failed: ${errMsg}`, 'error');
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
