// onboarding.js — Bloom Conductor (Synapse Protocol v4.0)
// Paso 1: github_auth — steps como strings, poll de completedSteps en lugar de accounts.
// Cargado por onboarding.html via <script src="onboarding.js">.

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
// completedSteps: Set de step IDs confirmados por Brain via nucleus.json.
// Reemplaza a activeAccounts (que era por provider, no por step).
const completedSteps = new Set();

// REQUIRED_STEPS: steps mínimos para avanzar desde la screen de github_auth.
// Paso 1: solo github_auth es requerido para pasar a nucleus_create.
const REQUIRED_STEPS = ['github_auth'];

let selectedOrg         = null;
let selectedFolderPath  = null;
let folderSelected      = false;
let selectedProjectEl   = null;
let selectedProject     = null; // { name, path }
let stepPollTimer       = null;
let userEmail           = null;

// ── SCREEN MAP ─────────────────────────────────────────────────────────────
// Mapeado 1:1 con los steps de onboarding_steps.json más entry y launch.
// Orden: entry → github_auth → nucleus_create → vault_init →
//        google_auth → ai_provider_setup → project_create → launch
const SCREEN_IDS = [
  'entry',           // 0
  'github-login',    // 1 — step: github_auth
  'nucleus-create',  // 2 — step: nucleus_create
  'vault-init',      // 3 — step: vault_init
  'google-login',    // 4 — step: google_auth
  'provider-select', // 5 — step: ai_provider_setup
  'project-create',  // 6 — step: project_create
  'launch'           // 7
];

// ── NAVIGATION ─────────────────────────────────────────────────────────────
async function goTo(n) {
  log('info', `goTo(${n}) — screen-${SCREEN_IDS[n]}`);

  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById('screen-' + SCREEN_IDS[n]);
  if (target) {
    target.classList.add('active');
  } else {
    log('error', `screen-${SCREEN_IDS[n]} NOT FOUND in DOM`);
  }

  document.querySelectorAll('.step-node').forEach((node, i) => {
    node.classList.toggle('active', i === n);
    node.classList.toggle('done',   i < n);
  });

  // Efectos por pantalla
  if (n === 1) {
    setTimeout(() => {
      document.getElementById('sn-github')?.classList.add('active');
    }, 400);
    // kickoffDiscovery() se llama desde handleGithubBtn(), no aquí
  }
  if (n === 2) loadOrgs();
  if (n === 6) loadRepos();
  if (n === 7) runLaunchSequence();
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

// ── SCREEN 1 — GitHub Auth ─────────────────────────────────────────────────
// Primer step del onboarding: conectar GitHub.
// Chrome (discovery page) maneja el flujo real de GitHub token.
// El Conductor espera hasta que Brain confirme github_auth en completed_steps[].
async function handleGithubBtn() {
  log('info', 'click — btn-continue-github (Connect GitHub)');

  const btn = document.getElementById('btn-continue-github');
  btn.textContent = 'Awaiting GitHub connection…';
  btn.disabled = true;
  btn.onclick = null;

  showCortex("Connect your GitHub account in the Discovery window.");

  // Lanzar Chrome en discovery mode + navegar al step github_auth
  await kickoffDiscovery();

  // Polling de steps completados cada 3 segundos
  stepPollTimer = setInterval(async () => {
    const result = await window.onboarding.pollIdentity();
    if (!result.success) return;

    // Marcar steps completados en el Set local
    for (const [stepId, done] of Object.entries(result.steps)) {
      if (done && !completedSteps.has(stepId)) {
        completedSteps.add(stepId);
        // Actualizar indicador visual si existe
        document.getElementById('step-indicator-' + stepId)?.classList.add('active');
        log('info', `step confirmed: ${stepId}`);
      }
    }

    // Verificar si los steps requeridos para esta pantalla están completos
    if (REQUIRED_STEPS.every(s => completedSteps.has(s))) {
      clearInterval(stepPollTimer);
      stepPollTimer = null;
      checkGithubReady();
    }
  }, 3000);
}

async function kickoffDiscovery() {
  log('info', 'IPC → onboarding:launch-discovery — email: ' + (userEmail || '(none)'));
  const result = await window.onboarding.launchDiscovery({ email: userEmail });
  log(result.success ? 'info' : 'error', `IPC ← onboarding:launch-discovery — success: ${result.success}`);

  if (!result.success) {
    showCortex("Could not launch Discovery. Retry.");
    const btn = document.getElementById('btn-continue-github');
    btn.textContent = 'Connect GitHub';
    btn.disabled = false;
    btn.onclick = handleGithubBtn;
    return;
  }

  // Navegar al primer step: github_auth
  log('info', 'IPC → onboarding:navigate — step: github_auth');
  const navResult = await window.onboarding.navigate({ step: 'github_auth' });
  log(navResult.success ? 'info' : 'error', `IPC ← onboarding:navigate — success: ${navResult.success}`);
}

function checkGithubReady() {
  const allDone = REQUIRED_STEPS.every(s => completedSteps.has(s));
  if (!allDone) return;

  log('info', 'github_auth confirmed — ready to proceed');
  document.getElementById('sn-github')?.classList.add('established');
  showCortex("GitHub connected. Setting up your Nucleus next.");

  const btn = document.getElementById('btn-continue-github');
  btn.textContent = 'Continue';
  btn.disabled = false;
  btn.onclick = () => goTo(2);
}

// ── SCREEN 2 — Nucleus Create ──────────────────────────────────────────────
// nucleus_create: el usuario elige org de GitHub y carpeta local.
// Requires: github_token (ya confirmado en screen 1).
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
  // Navegar step nucleus_create en Chrome antes de ir al terminal
  window.onboarding.navigate({ step: 'nucleus_create' }).then(r => {
    log(r.success ? 'info' : 'warn', `navigate nucleus_create — success: ${r.success}`);
  });
  goTo(3); // Mostrar terminal de init — screen vault-init usa el terminal de creación
           // TODO Paso 2: separar nucleus terminal (screen 2b) de vault-init (screen 3)
}

// ── SCREEN 3 — Vault Init Terminal ─────────────────────────────────────────
// Ejecuta nucleus init y muestra el output en tiempo real.
// Al terminar navega al step vault_init en Chrome.
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

      // Navegar step vault_init en Chrome
      window.onboarding.navigate({ step: 'vault_init' }).then(r => {
        log(r.success ? 'info' : 'warn', `navigate vault_init — success: ${r.success}`);
      });

      setTimeout(() => goTo(4), 1200); // → google-login
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

// ── SCREEN 4 — Google Auth ─────────────────────────────────────────────────
// google_auth: vault_required=true — Chrome ya creó el vault en el step anterior.
// Navegar a google_auth en la discovery page y esperar confirmación.
// TODO Paso 3: implementar polling de google_auth completion aquí
function handleGoogleBtn() {
  log('info', 'click — btn-continue-google');
  window.onboarding.navigate({ step: 'google_auth' }).then(r => {
    log(r.success ? 'info' : 'warn', `navigate google_auth — success: ${r.success}`);
  });
  // Por ahora avanza manualmente — el poll de google_auth se implementa en Paso 3
}

// ── SCREEN 5 — AI Provider Setup ───────────────────────────────────────────
// ai_provider_setup: el usuario agrega su API key de IA preferida.
// TODO Paso 4: implementar este step completo
function handleProviderBtn() {
  log('info', 'click — btn-continue-provider');
  window.onboarding.navigate({ step: 'ai_provider_setup' }).then(r => {
    log(r.success ? 'info' : 'warn', `navigate ai_provider_setup — success: ${r.success}`);
  });
}

// ── SCREEN 6 — Project Create ──────────────────────────────────────────────
// project_create: requiere vault_initialized + github_token.
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

// ── SCREEN 6 → 7 — Mandate + Launch ───────────────────────────────────────
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
    log('info', 'IPC → onboarding:navigate — step: project_create');
    const navResult = await window.onboarding.navigate({ step: 'project_create' });
    log(navResult.success ? 'info' : 'error', `IPC ← onboarding:navigate project_create — success: ${navResult.success}`);
    goTo(7);
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
}

// ── INIT ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  log('info', 'DOM ready — initialized');

  // Paso 1: el botón de entry navega a github-login (screen 1)
  document.getElementById('btn-continue-entry')?.addEventListener('click', () => goTo(1));

  // Screen 1: github-login
  const btnGithub = document.getElementById('btn-continue-github');
  if (btnGithub) btnGithub.onclick = handleGithubBtn;

  // Screen 4: google-login — stub para Paso 3
  const btnGoogle = document.getElementById('btn-continue-google');
  if (btnGoogle) btnGoogle.onclick = handleGoogleBtn;

  // Screen 5: provider-select — stub para Paso 4
  const btnProvider = document.getElementById('btn-continue-provider');
  if (btnProvider) btnProvider.onclick = handleProviderBtn;
});