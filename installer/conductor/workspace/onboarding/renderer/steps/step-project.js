// workspace/onboarding/renderer/steps/step-project.js
//
// Step: project_select — screen-project. Funciones movidas 1:1: loadRepos,
// selectProject, _onMilestoneProjectSelect.
//
// FIX (25/07/2026 — split MANDATE de PROJECT, ver
// MANDATE-STEP-IMPLEMENTATION-PROMPT.md): este step ya NO crea el Genesis
// Mandate. project_select (SSOT v3.1.0) termina en cuanto el proyecto está
// confirmado (produces: project_name) — la creación del mandate es un step
// aparte, mandate_genesis, con su propia screen (screen-mandate) y su propio
// módulo (steps/step-mandate.js). Lo que acá adentro se llamaba
// createMandateAndContinue()/continueToMandate() pasa a ser
// advanceToMandateStep(): su único trabajo es navegar a mandate_genesis,
// nunca llamar a createMandate().
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
//   2. advanceToMandateStep() — se dispara al click de "Continuar →", ya
//      con el import confirmado de antemano. Desde el split del 25/07/2026
//      esto YA NO crea el Genesis Mandate acá — solo navega al step
//      mandate_genesis (screen-mandate). La creación del mandate vive en
//      steps/step-mandate.js, disparada por su propio botón, recién después
//      de mostrar el copy explicativo de esa pantalla.
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
import { setStepperEstablished } from '../core/ui-stepper.js';

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
    await window.onboarding.selectProject({ projectName: project.name, projectPath: '' });
    if (btn) {
      btn.disabled = false;
      btn.onclick = advanceToMandateStep;
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
  await window.onboarding.selectProject({ projectName: project.name, projectPath: importResult.destPath });

  if (importResult.gitExcluded && importResult.gitExcluded.length > 0) {
    addNotification(
      `Copied — ${importResult.gitExcluded.length} .git ${importResult.gitExcluded.length === 1 ? 'folder' : 'folders'} excluded (no commit history)`,
      { icon: 'ℹ️', type: 'info' }
    );
  }

  if (btn) {
    btn.disabled = false;
    btn.onclick = advanceToMandateStep;
  }
}

/**
 * Fase 2 del step: ya NO crea el Genesis Mandate acá (ver split del
 * 25/07/2026, MANDATE-STEP-IMPLEMENTATION-PROMPT.md §3.1). Su único trabajo
 * es avanzar de screen-project a screen-mandate (step mandate_genesis),
 * una vez que importSelectedProject() ya confirmó el proyecto. La creación
 * real del mandate — con su propio copy explicativo y su propio botón —
 * vive en steps/step-mandate.js.
 */
export function advanceToMandateStep() {
  log('info', 'click — btn-project-continue — avanzando a mandate_genesis');
  // FIX (26/07/2026 — bug reportado tras el split de MANDATE/PROJECT):
  // antes de separar el step, esto lo hacía __onboarding_complete__.onEnter()
  // en step-milestone.js — tenía sentido porque PROJECT era el último step
  // real. Al mover ese hardcode a establecer 'mandate' (que ahora sí es el
  // último), nadie quedó a cargo de marcar 'project' como establecido en su
  // propio momento de completar — el nodo se quedaba gris para siempre en
  // un arranque fresh (el camino de resume sí lo marcaba bien, por eso no
  // se notaba reabriendo la app, solo en la sesión en curso).
  setStepperEstablished('project');
  navigateTo('mandate_genesis');
}

/**
 * Fallback: si Brain llega a emitir PROJECT_CREATED/DISCOVERY_COMPLETE
 * (cortex_events de project_select) mientras el usuario sigue en
 * screen-project, empujamos igual a mandate_genesis — nunca directo a
 * __onboarding_complete__, que ahora depende de un step más (mandate_genesis,
 * todavía sin completar en este punto).
 */
function onMilestoneProjectSelect(_data) {
  log('info', 'milestone: project_select confirmado por Brain');
  addNotification('Project selected — ready for Mandate', { icon: '✓', type: 'success' });
  setStepperEstablished('project');
  const mandateScreen = document.getElementById('screen-mandate');
  if (mandateScreen && !mandateScreen.classList.contains('active')) {
    log('info', 'milestone: project_select — avanzando a mandate_genesis por push');
    navigateTo('mandate_genesis');
  }
}

registerMilestoneHandler('project_select', onMilestoneProjectSelect);

registerStepHandler('project_select', {
  onEnter: loadRepos,
});
