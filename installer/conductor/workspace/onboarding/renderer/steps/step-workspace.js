// workspace/onboarding/renderer/steps/step-workspace.js
//
// Step: nucleus_create — screen-workspace.
// Funciones movidas 1:1 desde el monolito (mismo comportamiento):
//   slugify, updateWorkspacePreview, checkWorkspaceReady,
//   selectWorkspaceFolder, onWorkspacePathInput, onWorkspaceOrgInput,
//   onWorkspaceOrgBlur, verifyOrgOnGithub, continueWorkspace,
//   useExistingWorkspace, runNucleusTerminal.
//
// ⚠️ Ver navigation.js — el SSOT declara nucleus_create.requires =
// ["github_token"], lo que en teoría contradice que este step se ofrezca
// ANTES de github_auth como hace la UI hoy. No se resuelve acá: este
// módulo solo mueve el código, no reordena el producto.

import { log } from '../core/ipc-bridge.js';
import { addNotification } from '../core/notifications.js';
import { navigateTo, registerStepHandler } from '../core/navigation.js';
import { workspaceState, selection, state } from '../core/shared-state.js';

export function slugify(val) {
  return val.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export function updateWorkspacePreview() {
  const pathVal = workspaceState.path;
  const orgVal = workspaceState.org;
  const orgDisplay = document.getElementById('ws-preview-org');
  const pathDisplay = document.getElementById('ws-preview-path');
  const structDisplay = document.getElementById('ws-preview-struct');

  if (!pathDisplay) return;

  if (!pathVal) {
    if (pathDisplay) pathDisplay.textContent = '—';
    if (orgDisplay) orgDisplay.textContent = '—';
    if (structDisplay) structDisplay.textContent = 'Completá la ubicación para ver la preview';
    return;
  }

  const isTemporary = !orgVal;

  if (pathDisplay) pathDisplay.textContent = isTemporary ? pathVal : `${pathVal}/${orgVal}`;
  if (orgDisplay) orgDisplay.textContent = isTemporary ? '(Temporal)' : orgVal;

  if (structDisplay) {
    structDisplay.textContent = isTemporary
      ? `${pathVal}/bloom-workspace/.bloom/.nucleus-<temporal>/`
      : `${pathVal}/${orgVal}/.bloom/.nucleus-${orgVal}/`;
  }
}

export function checkWorkspaceReady() {
  const btn = document.getElementById('btn-continue-workspace');
  if (btn) btn.disabled = !workspaceState.path;
}

export async function selectWorkspaceFolder() {
  const result = await window.onboarding.selectFolder();
  if (!result.success || result.canceled) return;

  workspaceState.path = result.path;
  const input = document.getElementById('ws-path-input');
  if (input) input.value = result.path;
  updateWorkspacePreview();
  checkWorkspaceReady();
}

export function onWorkspacePathInput(e) {
  workspaceState.path = e.target.value.trim();
  updateWorkspacePreview();
  checkWorkspaceReady();
}

export function onWorkspaceOrgInput(e) {
  const raw = e.target.value;
  const slugged = slugify(raw);

  if (raw !== slugged) {
    e.target.value = slugged;
    const hint = document.getElementById('ws-org-hint');
    if (hint) { hint.textContent = 'Convertido a minúsculas'; hint.style.display = 'block'; }
    setTimeout(() => { if (hint) hint.style.display = 'none'; }, 2000);
  }

  workspaceState.org = slugged;
  updateWorkspacePreview();

  const badge = document.getElementById('ws-org-badge');
  if (badge) { badge.textContent = ''; badge.className = 'ws-org-badge'; }
  workspaceState.githubVerified = null;

  clearTimeout(workspaceState._orgDebounceTimer);
  if (slugged.length >= 2) {
    workspaceState._orgDebounceTimer = setTimeout(() => verifyOrgOnGithub(slugged), 600);
  }
}

export function onWorkspaceOrgBlur(e) {
  if (!e.target.value.trim()) {
    workspaceState.org = '';
    updateWorkspacePreview();
  }
}

export async function verifyOrgOnGithub(slug) {
  const badge = document.getElementById('ws-org-badge');
  if (!badge) return;
  badge.textContent = '…';
  badge.className = 'ws-org-badge checking';

  try {
    const res = await fetch(`https://api.github.com/orgs/${encodeURIComponent(slug)}`);
    if (res.status === 200) {
      badge.textContent = '✓ Organización encontrada en GitHub';
      badge.className = 'ws-org-badge found';
      workspaceState.githubVerified = true;
    } else if (res.status === 404) {
      badge.textContent = 'Nueva organización — la vincularás en el paso siguiente';
      badge.className = 'ws-org-badge new';
      workspaceState.githubVerified = false;
    } else {
      badge.textContent = '';
      badge.className = 'ws-org-badge';
    }
  } catch (_) {
    badge.textContent = '';
    badge.className = 'ws-org-badge';
  }
}

export async function continueWorkspace() {
  const btn = document.getElementById('btn-continue-workspace');
  if (!btn || btn.disabled) return;

  const path = workspaceState.path;
  const orgSlug = workspaceState.org;
  const temporary = !orgSlug;

  const ipcPayload = temporary
    ? { path, temporary: true }
    : { path, org: orgSlug };

  log('info', `continueWorkspace — payload: ${JSON.stringify(ipcPayload)}`);

  btn.disabled = true;
  btn.textContent = 'Creando estructura…';

  const errEl = document.getElementById('ws-error');
  if (errEl) errEl.style.display = 'none';

  let result;
  try {
    result = await window.onboarding.initNucleus(ipcPayload);
  } catch (e) {
    result = { success: false, error: e.message };
  }

  log(result.success ? 'info' : 'error',
    `IPC ← onboarding:init-nucleus (nucleus create) — success: ${result.success}`);

  if (result.success) {
    const resolvedOrg = result.org || orgSlug || 'bloom-local';
    selection.selectedOrg = resolvedOrg;
    selection.selectedFolderPath = path;
    state.selectedOrg = resolvedOrg;
    state.selectedFolder = path;

    await window.onboarding.markStepComplete({ step: 'nucleus_create' });
    addNotification('Workspace configured', { icon: '✓', type: 'success' });

    // Antes: goTo(3) hardcodeado. Ahora: dejamos que el SSOT diga cuál es
    // el próximo step real en vez de asumir "siempre identity".
    navigateTo('github_auth');
  } else {
    btn.disabled = false;
    btn.textContent = 'Continuar';

    if (!errEl) return;
    errEl.style.display = 'block';

    const msg = result.error || '';
    if (msg.includes('already exists') || msg.includes('ya existe')) {
      errEl.innerHTML = `
        Ya existe una configuración de Bloom en esta carpeta.
        <div class="ws-error-actions">
          <button id="ws-err-use-existing">Usar la existente</button>
          <button id="ws-err-pick-folder">Elegir otra ubicación</button>
        </div>`;
      document.getElementById('ws-err-use-existing')?.addEventListener('click', useExistingWorkspace);
      document.getElementById('ws-err-pick-folder')?.addEventListener('click', selectWorkspaceFolder);
    } else if (msg.includes('EACCES') || msg.includes('permission') || msg.includes('permisos')) {
      errEl.innerHTML = `
        Sin permisos para crear la carpeta en <strong>${path}</strong>. Elegí otra ubicación.
        <div class="ws-error-actions">
          <button id="ws-err-pick-folder">Elegir carpeta</button>
        </div>`;
      document.getElementById('ws-err-pick-folder')?.addEventListener('click', selectWorkspaceFolder);
    } else {
      errEl.innerHTML = `
        No se pudo crear el workspace en <strong>${path}</strong>. ${msg}
        <div class="ws-error-actions">
          <button id="ws-err-retry">Reintentar</button>
        </div>`;
      document.getElementById('ws-err-retry')?.addEventListener('click', continueWorkspace);
    }
  }
}

export async function useExistingWorkspace() {
  const orgSlug = workspaceState.org;
  const path = workspaceState.path;
  selection.selectedOrg = orgSlug || null;
  selection.selectedFolderPath = path;
  state.selectedOrg = orgSlug || null;
  state.selectedFolder = path;
  await window.onboarding.markStepComplete({ step: 'nucleus_create' });
  navigateTo('github_auth');
}

// ── Nucleus Init Terminal ────────────────────────────────────────────────
// LEGACY: en el flujo actual, continueWorkspace() ya NO pasa por esta
// screen (ver comentario original: "nucleus init NO se llama aquí").
// Se conserva porque el listener de onInitLine puede seguir siendo útil
// si en el futuro se reintroduce una pantalla de progreso entre workspace
// y github_auth — hoy no está enganchada a navigateTo() de ningún step.
export function runNucleusTerminal() {
  const terminal = document.getElementById('nucleus-terminal');
  if (!terminal) return;
  terminal.innerHTML = '';

  window.onboarding.onInitLine(({ line, isError }) => {
    const el = document.createElement('div');
    el.className = 'terminal-line active';
    if (isError) el.style.color = 'var(--error)';
    el.textContent = line;
    terminal.appendChild(el);
    terminal.scrollTop = terminal.scrollHeight;
  });

  log('info', 'nucleus-terminal: escuchando líneas de nucleus create…');
}

// ── LEGACY — código zombie heredado del monolito ────────────────────────
// loadOrgs/selectOrg/selectFolder/checkNucleusReady pertenecían a una
// versión anterior del flujo de creación de org (screen "init-nucleus" ya
// removida — ver el comentario "REMOVED (código zombie)" en el onboarding.js
// original, línea ~1240). Ninguna function de acá abajo está enganchada a
// navigateTo() ni a ningún botón de onboarding.html tal como está hoy.
// Se preservan sin modificar por si algo externo (ej. el debug harness)
// todavía las referencia — confirmar con grep en el HTML/tests antes de
// borrarlas definitivamente.
export async function loadOrgs() {
  const result = await window.onboarding.listOrgs();
  const list = document.getElementById('org-list');
  if (!list) return;
  list.innerHTML = '';

  if (result.success && result.orgs.length > 0) {
    result.orgs.forEach(org => {
      const item = document.createElement('div');
      item.className = 'select-item';
      item.innerHTML = `
        <span>${org.name}</span>
        <span class="select-item-label">${org.type || 'GitHub Org'}</span>
      `;
      item.onclick = () => selectOrg(item, org.name);
      list.appendChild(item);
    });
  }

  const newItem = document.createElement('div');
  newItem.className = 'select-item';
  newItem.innerHTML = `
    <span>+ Create new organization</span>
    <span class="select-item-label">GitHub</span>
  `;
  newItem.onclick = () => selectOrg(newItem, 'new');
  list.appendChild(newItem);
}

export function selectOrg(el, orgName) {
  document.querySelectorAll('#org-list .select-item').forEach(i => i.classList.remove('selected'));
  el.classList.add('selected');
  selection.selectedOrg = orgName;
  state.selectedOrg = orgName;
  checkNucleusReady();
}

export async function selectFolder() {
  const result = await window.onboarding.selectFolder();
  if (!result.success || result.canceled) return;

  const pathEl = document.getElementById('folder-path');
  if (pathEl) pathEl.textContent = result.path;
  document.getElementById('folder-picker')?.classList.add('selected');
  selection.folderSelected = true;
  selection.selectedFolderPath = result.path;
  state.selectedFolder = result.path;
  checkNucleusReady();
}

export function checkNucleusReady() {
  const el = document.getElementById('btn-init-nucleus');
  if (el) el.disabled = !(selection.selectedOrg && selection.folderSelected);
}

// ── Registro ante navigation.js ─────────────────────────────────────────
registerStepHandler('nucleus_create', {
  onEnter() {
    // El monolito no tenía efecto propio al entrar a screen-workspace
    // (goTo(1) no disparaba nada especial) — se mantiene así.
  },
  restore(producedSet) {
    // El resume actual (resolution-engine.js) solo expone `produced`
    // (nombres de artefacto), no los VALORES reales (path/org). Sin una
    // extensión de onboarding:get-resume-state que también devuelva el
    // snapshot de nucleus.json, no hay con qué prellenar los inputs acá.
    // Dejamos el guard para cuando esa extensión exista.
    if (producedSet.has('workspace_path')) {
      log('info', 'restore(nucleus_create): workspace_path ya existe — inputs no se prellenan '
        + '(falta que get-resume-state exponga el valor real, no solo el nombre del artefacto)');
    }
  },
});
