// onboarding.html — JavaScript logic block (Synapse Protocol v4.0)
// Drop this into btips_onboarding_v5.html replacing the existing <script> block.
// CSS, HTML structure, and all IDs are left untouched.

// ── STATE ──────────────────────────────────────────────────────────────────
const activeAccounts    = new Set();
const REQUIRED_ACCOUNTS = ['google', 'gemini']; // GitHub es opcional en esta etapa
let selectedOrg         = null;
let selectedFolderPath  = null;
let folderSelected      = false;
let selectedProjectEl   = null;
let selectedProject     = null; // { name, path }
let identityPollTimer   = null;
let userEmail           = null; // email del usuario (capturado en Screen 1 si aplica)

// ── NAVIGATION ─────────────────────────────────────────────────────────────
async function goTo(n) {
  // Ocultar todas las screens
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  // Mostrar la screen objetivo
  const target = document.querySelector(`.screen[data-screen="${n}"]`);
  if (target) target.classList.add('active');

  // Actualizar stepper (si existe)
  document.querySelectorAll('.step-node').forEach((node, i) => {
    node.classList.toggle('active', i === n);
    node.classList.toggle('done',   i < n);
  });

  // Efectos por pantalla
  if (n === 1) {
    setTimeout(() => {
      document.getElementById('sn-identity')?.classList.add('active');
    }, 400);
    kickoffDiscovery();
  }
  if (n === 3) loadOrgs();
  if (n === 5) loadRepos();
  if (n === 6) runLaunchSequence();
}

function showCortex(msg) {
  const el = document.getElementById('cortex-msg');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('show');
  void el.offsetWidth; // reflow
  el.classList.add('show');
}

// ── SCREEN 0 → 1: arrancar el onboarding ──────────────────────────────────
async function kickoffDiscovery() {
  // Lanzar Chrome en modo discovery + registro (no bloquea la UI)
  const result = await window.onboarding.launchDiscovery({ email: userEmail });
  if (!result.success) {
    showCortex("Could not launch Discovery. Retry.");
    return;
  }

  // Enviar step google_login a Chrome para que abra en la pantalla correcta
  await window.onboarding.navigate({
    step: 'google_login',
    email: userEmail
  });
}

// ── SCREEN 1 — Identity: botón Validate con polling real ──────────────────
async function handleIdentityBtn() {
  const btn = document.getElementById('btn-continue-identity');
  btn.textContent = 'Awaiting accounts…';
  btn.disabled = true;

  showCortex("Register your accounts in the Discovery window.");

  // Polling cada 3 segundos — espera que nucleus synapse status
  // devuelva identity con las cuentas activas
  identityPollTimer = setInterval(async () => {
    const result = await window.onboarding.pollIdentity();
    if (!result.success) return;

    ['google', 'gemini', 'github'].forEach(name => {
      if (result.accounts[name] && !activeAccounts.has(name)) {
        activeAccounts.add(name);
        document.getElementById('acc-' + name)?.classList.add('active');
      }
    });

    if (REQUIRED_ACCOUNTS.every(a => activeAccounts.has(a))) {
      clearInterval(identityPollTimer);
      identityPollTimer = null;
      checkIdentityReady();
    }
  }, 3000);
}

function checkIdentityReady() {
  const allDone = REQUIRED_ACCOUNTS.every(a => activeAccounts.has(a));
  if (!allDone) return;

  document.getElementById('sn-identity')?.classList.add('established');
  showCortex("Identity confirmed. Vault layer next.");

  const btn = document.getElementById('btn-continue-identity');
  btn.textContent = 'Continue';
  btn.disabled = false;
  btn.onclick = () => goTo(2);
}

// Wire up identity button
document.addEventListener('DOMContentLoaded', () => {
  const identityBtn = document.getElementById('btn-continue-identity');
  if (identityBtn) identityBtn.onclick = handleIdentityBtn;
});

// ── SCREEN 3 — Nucleus: orgs reales + folder picker real ──────────────────
async function loadOrgs() {
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

function selectOrg(el, orgName) {
  document.querySelectorAll('#org-list .select-item').forEach(i => i.classList.remove('selected'));
  el.classList.add('selected');
  selectedOrg = orgName;
  checkNucleusReady();
}

async function selectFolder() {
  const result = await window.onboarding.selectFolder();
  if (!result.success || result.canceled) return;

  const pathEl = document.getElementById('folder-path');
  if (pathEl) pathEl.textContent = result.path;
  document.getElementById('folder-picker')?.classList.add('selected');
  folderSelected      = true;
  selectedFolderPath  = result.path;
  checkNucleusReady();
}

function checkNucleusReady() {
  const btn = document.getElementById('btn-continue-nucleus');
  if (!btn) return;
  btn.disabled = !(selectedOrg && folderSelected);
}

// ── SCREEN 3b — Terminal con output real de nucleus init ──────────────────
function runNucleusTerminal() {
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

  window.onboarding.initNucleus({
    org:  selectedOrg,
    path: selectedFolderPath
  }).then(result => {
    if (result.success) {
      const done = document.createElement('div');
      done.className = 'terminal-line done';
      done.innerHTML = '✓ Nucleus established.<span class="terminal-cursor"></span>';
      terminal.appendChild(done);
      setTimeout(() => goTo(5), 1200);
    } else {
      const err = document.createElement('div');
      err.className = 'terminal-line';
      err.style.color = 'var(--error)';
      err.textContent = '✗ Init failed: ' + result.error;
      terminal.appendChild(err);
    }
  });
}

// ── SCREEN 4 — Project: repos reales ─────────────────────────────────────
async function loadRepos() {
  const grid = document.getElementById('project-grid');
  if (!grid) return;
  grid.innerHTML = `
    <div style="color:var(--text-dim);font-family:var(--font-mono);
                font-size:12px;padding:16px;grid-column:1/-1;">
      Loading repositories…
    </div>`;

  const result = await window.onboarding.listRepos({ org: selectedOrg });
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
        path: fr.path
      });
    }
  };
  grid.appendChild(local);
}

function selectProject(el, repoObj) {
  if (selectedProjectEl) selectedProjectEl.classList.remove('selected');
  el.classList.add('selected');
  selectedProjectEl = el;
  selectedProject   = repoObj;
  const btn = document.getElementById('btn-create-mandate');
  if (btn) {
    btn.disabled = false;
    btn.onclick  = createMandateAndContinue;
  }
}

// ── SCREEN 5 (Milestone) — Create Mandate + enviar step success a Chrome ──
async function createMandateAndContinue() {
  const btn = document.getElementById('btn-create-mandate');
  if (btn) {
    btn.disabled  = true;
    btn.textContent = 'Creating mandate…';
  }

  const result = await window.onboarding.createMandate({
    project:     selectedProject.name,
    projectPath: selectedProject.path || ''
  });

  if (result.success) {
    // Notificar a Chrome que el onboarding está completo
    await window.onboarding.navigate({ step: 'success' });
    goTo(6); // milestone screen en Conductor
  } else {
    if (btn) {
      btn.disabled  = false;
      btn.textContent = 'Retry';
    }
    showCortex('Mandate failed: ' + result.error);
  }
}

// ── SCREEN 6 (Launch) — handoff real al workspace ─────────────────────────
function runLaunchSequence() {
  document.getElementById('ambient')?.classList.remove('milestone');
  const sysLayer = document.getElementById('system-layer');
  if (sysLayer) sysLayer.style.opacity = '0';

  const lines = document.querySelectorAll('#launch-lines .launch-line');
  lines.forEach((line, i) => {
    setTimeout(() => line.classList.add('show'), 300 + i * 500);
    setTimeout(() => line.classList.add('done'), 600 + i * 500);
  });

  showCortex("System initialization complete.");

  // Handoff después de que terminen las animaciones
  const totalDelay = 300 + (lines.length * 500) + 800;
  setTimeout(completeOnboarding, totalDelay);
}

async function completeOnboarding() {
  showCortex("Establishing workspace connection…");

  const result = await window.onboarding.complete({
    workspaceUrl: 'http://localhost:3000'
  });

  if (!result.success) {
    showCortex('Handoff failed: ' + result.error);
  }
  // Si success: Electron redimensiona y carga la URL.
  // El renderer no necesita hacer nada más.
}