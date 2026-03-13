// onboarding.js — BTIPS Conductor (Synapse Protocol v4.0)
// Script completo del onboarding. Cargado por onboarding.html via <script src="onboarding.js">.

// ── LOGGING ────────────────────────────────────────────────────────────────
function log(level, msg) {
  const ts = new Date().toISOString();
  const fn = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
  console[fn](`[${ts}] [${level.toUpperCase()}] [RENDERER] ${msg}`);
  if (window.onboarding?.log) {
    window.onboarding.log(level, msg).catch(() => {});
  }
}

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

// ── SCREEN MAP ─────────────────────────────────────────────────────────────
const SCREEN_IDS = [
  'entry',        // 0
  'identity',     // 1
  'vault',        // 2
  'nucleus',      // 3
  'nucleus-init', // 4
  'project',      // 5
  'milestone',    // 6
  'launch'        // 7
];

// ── NAVIGATION ─────────────────────────────────────────────────────────────
async function goTo(n) {
  log('info', `goTo(${n}) — screen-${SCREEN_IDS[n]}`);

  // Ocultar todas las screens
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  // Mostrar la screen objetivo por id
  const target = document.getElementById('screen-' + SCREEN_IDS[n]);
  if (target) {
    target.classList.add('active');
  } else {
    log('error', `screen-${SCREEN_IDS[n]} NOT FOUND in DOM`);
  }

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
    // kickoffDiscovery() NO va aquí — se llama desde handleIdentityBtn()
  }
  if (n === 3) loadOrgs();
  if (n === 5) loadRepos();
  if (n === 6) runLaunchSequence();
}

function showCortex(msg) {
  const el = document.getElementById('cortex-text');
  if (!el) return;
  el.textContent = msg;
  document.getElementById('cortex-bar')?.classList.add('visible');
}

function hideCortex() {
  document.getElementById('cortex-bar')?.classList.remove('visible');
}

// ── INFO POPUP ─────────────────────────────────────────────────────────────
function openInfo()  { document.getElementById('info-popup').classList.add('open'); }
function closeInfo() { document.getElementById('info-popup').classList.remove('open'); }

// ── SCREEN 1 — Identity ────────────────────────────────────────────────────
async function handleIdentityBtn() {
  log('info', 'click — btn-continue-identity (Validate)');

  const btn = document.getElementById('btn-continue-identity');
  btn.textContent = 'Awaiting accounts…';
  btn.disabled = true;
  btn.onclick = null;

  showCortex("Register your accounts in the Discovery window.");

  // Lanzar Chrome en modo discovery — AQUÍ y solo aquí
  await kickoffDiscovery();

  // Arrancar polling de cuentas cada 3 segundos
  identityPollTimer = setInterval(async () => {
    const result = await window.onboarding.pollIdentity();
    if (!result.success) return;

    ['google', 'gemini', 'github'].forEach(name => {
      if (result.accounts[name] && !activeAccounts.has(name)) {
        activeAccounts.add(name);
        document.getElementById('acc-' + name)?.classList.add('active');
        log('info', `account confirmed: ${name}`);
      }
    });

    if (REQUIRED_ACCOUNTS.every(a => activeAccounts.has(a))) {
      clearInterval(identityPollTimer);
      identityPollTimer = null;
      checkIdentityReady();
    }
  }, 3000);
}

async function kickoffDiscovery() {
  log('info', 'IPC → onboarding:launch-discovery — email: ' + (userEmail || '(none)'));
  const result = await window.onboarding.launchDiscovery({ email: userEmail });
  log(result.success ? 'info' : 'error', `IPC ← onboarding:launch-discovery — success: ${result.success}`);

  if (!result.success) {
    showCortex("Could not launch Discovery. Retry.");
    const btn = document.getElementById('btn-continue-identity');
    btn.textContent = 'Validate';
    btn.disabled = false;
    btn.onclick = handleIdentityBtn;
    return;
  }

  // Enviar step google_login a Chrome
  log('info', 'IPC → onboarding:navigate — step: google_login');
  const navResult = await window.onboarding.navigate({ step: 'google_login', email: userEmail });
  log(navResult.success ? 'info' : 'error', `IPC ← onboarding:navigate — success: ${navResult.success}`);
}

function checkIdentityReady() {
  const allDone = REQUIRED_ACCOUNTS.every(a => activeAccounts.has(a));
  if (!allDone) return;

  log('info', 'all required accounts confirmed — identity ready');
  document.getElementById('sn-identity')?.classList.add('established');
  showCortex("Identity confirmed. Vault layer next.");

  const btn = document.getElementById('btn-continue-identity');
  btn.textContent = 'Continue';
  btn.disabled = false;
  btn.onclick = () => goTo(2);
}

// ── SCREEN 3 — Nucleus ─────────────────────────────────────────────────────
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
  folderSelected     = true;
  selectedFolderPath = result.path;
  checkNucleusReady();
}

function checkNucleusReady() {
  document.getElementById('btn-init-nucleus').disabled = !(selectedOrg && folderSelected);
}

function initNucleus() {
  log('info', `initNucleus — org: ${selectedOrg} | path: ${selectedFolderPath}`);
  goTo(4);
}

// ── SCREEN 4 — Nucleus Init Terminal ───────────────────────────────────────
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

  log('info', 'IPC → onboarding:init-nucleus');
  window.onboarding.initNucleus({
    org:  selectedOrg,
    path: selectedFolderPath
  }).then(result => {
    log(result.success ? 'info' : 'error', `IPC ← onboarding:init-nucleus — success: ${result.success}`);
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
      log('error', `runNucleusTerminal failed: ${result.error}`);
    }
  });
}

// ── SCREEN 5 — Project ─────────────────────────────────────────────────────
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

// ── SCREEN 6 — Milestone ───────────────────────────────────────────────────
async function createMandateAndContinue() {
  log('info', 'click — btn-create-mandate');
  const btn = document.getElementById('btn-create-mandate');
  if (btn) {
    btn.disabled    = true;
    btn.textContent = 'Creating mandate…';
  }

  log('info', `IPC → onboarding:create-mandate — project: ${selectedProject.name}`);
  const result = await window.onboarding.createMandate({
    project:     selectedProject.name,
    projectPath: selectedProject.path || ''
  });
  log(result.success ? 'info' : 'error', `IPC ← onboarding:create-mandate — success: ${result.success}`);

  if (result.success) {
    log('info', 'IPC → onboarding:navigate — step: success');
    const navResult = await window.onboarding.navigate({ step: 'success' });
    log(navResult.success ? 'info' : 'error', `IPC ← onboarding:navigate — success: ${navResult.success}`);
    goTo(6);
  } else {
    if (btn) {
      btn.disabled    = false;
      btn.textContent = 'Retry';
    }
    log('error', `createMandateAndContinue failed: ${result.error}`);
    showCortex('Mandate failed: ' + result.error);
  }
}

// ── SCREEN 7 — Launch ──────────────────────────────────────────────────────
function enterSystem() {
  log('info', 'click — btn-enter-system');
  goTo(7);
}

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

  const totalDelay = 300 + (lines.length * 500) + 800;
  setTimeout(completeOnboarding, totalDelay);
}

async function completeOnboarding() {
  showCortex("Establishing workspace connection…");
  log('info', 'IPC → onboarding:complete');

  const result = await window.onboarding.complete({
    workspaceUrl: 'http://localhost:3000'
  });

  log(result.success ? 'info' : 'error', `IPC ← onboarding:complete — success: ${result.success}`);
  if (!result.success) {
    log('error', `completeOnboarding failed: ${result.error}`);
    showCortex('Handoff failed: ' + result.error);
  }
  // Si success: Electron redimensiona y carga la URL.
  // El renderer no necesita hacer nada más.
}

// ── INIT ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  log('info', 'DOM ready — initialized');
  document.getElementById('btn-continue-identity').onclick = handleIdentityBtn;
});