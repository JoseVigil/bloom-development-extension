// onboarding.js — Bloom Conductor (Synapse Protocol v4.0)
// Correcciones aplicadas:
//   Fix 1: REQUIRED_ACCOUNTS = ['github'] — GitHub primero, Google/Gemini después del vault
//   Fix 2: navigate manda 'github_auth', no 'google_login'
//   Fix 3: poll mapea result.steps.github_auth, no result.accounts
//   Fix 4: goTo(4) llama runNucleusTerminal()
//   Fix 5: toggleAccount() desactivado — los íconos los activa solo el poll
//   Fix 6: info popup dinámico por step, contenido desde STEP_INFO[]

// ── LOGGING ────────────────────────────────────────────────────────────────
function log(level, msg) {
  const ts = new Date().toISOString();
  const fn = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
  console[fn](`[${ts}] [${level.toUpperCase()}] [RENDERER] ${msg}`);
  if (window.onboarding?.log) {
    window.onboarding.log(level, msg).catch(() => {});
  }
}

// ── INFO POPUP — contenido por cuenta ─────────────────────────────────────
// Fuente de verdad para los popups de ayuda durante el onboarding.
// Refleja onboarding_steps.json pero con instrucciones de usuario concretas.
// Si GitHub cambia su UI, solo hay que actualizar este objeto.
const STEP_INFO = {
  github: {
    label:  'Step 1 — GitHub',
    title:  'Creating a Personal\nAccess Token.',
    body: `
      Bloom necesita un <strong>token clásico</strong> de GitHub con dos permisos:<br>
      <strong>repo</strong> y <strong>read:org</strong>.<br><br>
      Cómo crearlo:<br>
      1. Abrí GitHub → avatar → <strong>Settings</strong><br>
      2. Bajá hasta <strong>Developer settings</strong> (último ítem)<br>
      3. <strong>Personal access tokens → Tokens (classic)</strong><br>
      4. <strong>Generate new token (classic)</strong><br>
      5. Marcá <strong>repo</strong> y <strong>read:org</strong><br>
      6. Generá y <strong>copiá</strong> el token<br><br>
      ⚠ Usá <em>Tokens (classic)</em>, no Fine-grained.<br>
      El token empieza con <strong>ghp_</strong> — la extensión lo detecta automáticamente al copiarlo.
    `
  },
  google: {
    label:  'Step 4 — Google',
    title:  'Connecting your\nGoogle account.',
    body: `
      Bloom usará tu cuenta de Google para acceder a <strong>Google Cloud</strong> y <strong>AI Studio</strong>.<br><br>
      La ventana de Discovery va a pedirte que inicies sesión con tu cuenta Google.<br>
      Solo necesitás confirmar el acceso — no se almacenan contraseñas en Bloom.
    `
  },
  gemini: {
    label:  'Step 5 — AI Provider',
    title:  'Configuring your\nAI provider.',
    body: `
      Podés usar Gemini, Claude, OpenAI o Grok.<br><br>
      Para Gemini: abrí <strong>aistudio.google.com</strong> → Get API key → copiala.<br>
      Para otros proveedores: ingresá a su plataforma y generá una API key.<br><br>
      La extensión detecta la key al copiarla y la guarda en el vault cifrado.<br>
      Bloom nunca ve la key en texto plano.
    `
  }
};

// Estado actual del popup — para abrir el correcto según el flujo
let currentInfoStep = 'github';

function openInfo(step) {
  currentInfoStep = step || currentInfoStep;
  const info = STEP_INFO[currentInfoStep];
  if (!info) return;

  document.getElementById('info-panel-label').textContent  = info.label;
  document.getElementById('info-panel-title').innerHTML    = info.title.replace('\n', '<br>');
  document.getElementById('info-panel-body').innerHTML     = info.body;
  document.getElementById('info-popup').classList.add('open');
}

function closeInfo() {
  document.getElementById('info-popup').classList.remove('open');
}

// ── STATE ──────────────────────────────────────────────────────────────────
const activeAccounts = new Set();

// Fix 1: Solo GitHub en Screen 1. Google y Gemini van después del vault
// (onboarding_steps.json: google_auth requiere vault_initialized)
const REQUIRED_ACCOUNTS = ['github'];

let selectedOrg         = null;
let selectedFolderPath  = null;
let folderSelected      = false;
let selectedProjectEl   = null;
let selectedProject     = null; // { name, path }
let identityPollTimer   = null;
let identityTimeoutId   = null;
let userEmail           = null;

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

  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById('screen-' + SCREEN_IDS[n]);
  if (target) {
    target.classList.add('active');
  } else {
    log('error', `screen-${SCREEN_IDS[n]} NOT FOUND in DOM`);
  }

  document.querySelectorAll('.step-node').forEach((node, i) => {
    node.classList.toggle('active', i === n);
    node.classList.toggle('done', i < n);
  });

  // Efectos por pantalla
  if (n === 1) {
    // Hacer visible el system-layer lateral (opacity 0 → 1)
    document.getElementById('system-layer')?.classList.add('visible');
    // Activar el nodo Identity
    setTimeout(() => {
      document.getElementById('sn-identity')?.classList.add('active');
    }, 400);
    // kickoffDiscovery() se llama desde handleIdentityBtn(), no aquí
  }
  if (n === 3) loadOrgs();

  // Fix 4: faltaba este case — el terminal nunca arrancaba
  if (n === 4) runNucleusTerminal();

  if (n === 5) loadRepos();
  if (n === 6) runLaunchSequence();
  if (n === 6) {
    // Revelar el botón Enter System después de que los nodos animaron
    setTimeout(() => {
      const enterBtn = document.getElementById('enter-btn');
      if (enterBtn) enterBtn.style.opacity = '1';
    }, 1200);
  }
}

// ── CORTEX BAR ─────────────────────────────────────────────────────────────
function showCortex(msg) {
  const el = document.getElementById('cortex-text');
  if (!el) return;
  el.textContent = msg;
  document.getElementById('cortex-bar')?.classList.add('visible');
}

function hideCortex() {
  document.getElementById('cortex-bar')?.classList.remove('visible');
}

// ── SCREEN 1 — Identity ────────────────────────────────────────────────────

// Fix 5: toggleAccount() ya no hace nada — los íconos los activa solo el poll.
// El onclick en el HTML queda por compatibilidad pero no cambia estado.
function toggleAccount(name) {
  // No-op: el estado de las cuentas lo maneja exclusivamente el poll.
  // Esta función existe solo para no romper los onclick del HTML.
  log('info', `toggleAccount(${name}) ignorado — estado manejado por pollIdentity`);
}

async function handleIdentityBtn() {
  log('info', 'click — btn-continue-identity');

  const btn = document.getElementById('btn-continue-identity');
  btn.textContent = 'Awaiting GitHub…';
  btn.disabled = true;
  btn.onclick  = null;

  // Actualizar el info popup al step actual (github) antes de abrir Discovery
  currentInfoStep = 'github';

  await kickoffDiscovery();
}

async function kickoffDiscovery() {
  // Fase 1: lanzar Discovery
  showCortex("Opening Discovery window…");
  log('info', 'IPC → onboarding:launch-discovery — email: ' + (userEmail || '(none)'));

  const result = await window.onboarding.launchDiscovery({ email: userEmail });
  log(result.success ? 'info' : 'error',
      `IPC ← onboarding:launch-discovery — success: ${result.success}`);

  if (!result.success) {
    showCortex("Could not launch Discovery. Retry.");
    const btn = document.getElementById('btn-continue-identity');
    btn.textContent = 'Validate';
    btn.disabled    = false;
    btn.onclick     = handleIdentityBtn;
    return;
  }

  // Fase 2: navegar a github_auth en Chrome
  // NOTA: nucleus synapse onboarding solo acepta --step (sin --service).
  // El step 'github_auth' es el identificador del config file de Cortex para el PAT de GitHub.
  // Si este step ID no existe en el CLI, el navigate fallará con exit 1 — eso es no-fatal:
  // Chrome ya está abierto desde el launch, el poll sigue corriendo.
  // TODO: verificar step ID correcto con: nucleus synapse onboarding --help
  showCortex("Connecting to GitHub…");
  log('info', 'IPC → onboarding:navigate — step: github_auth');

  const navResult = await window.onboarding.navigate({
    step:  'github_auth',
    email: userEmail
  });
  log(navResult.success ? 'info' : 'warn',
      `IPC ← onboarding:navigate — success: ${navResult.success}`);

  // Navigate failure es NO-FATAL: Chrome puede ya estar abierto y en el step correcto.
  // No se interrumpe el flujo — se continúa al poll y se muestra advertencia en cortex bar.
  if (!navResult.success) {
    log('warn', 'navigate falló — Chrome puede ya estar activo, continuando con poll');
    showCortex(
      "Chrome open — follow the (?) instructions to create your GitHub token and copy it."
    );
    // No return — continúa al poll
  }

  // Fase 3: instrucción al usuario — qué tiene que hacer en Chrome
  showCortex(
    "In Chrome: Settings → Developer Settings → Personal access tokens → Tokens (classic) → Generate → select repo & read:org → copy."
  );

  // Timeout de 3 minutos — mensaje de ayuda si el usuario tarda
  identityTimeoutId = setTimeout(() => {
    if (activeAccounts.has('github')) return; // ya confirmado, no mostrar
    showCortex(
      "Taking longer than expected. Click (?) for step-by-step instructions."
    );
  }, 3 * 60 * 1000);

  // Fase 4: poll cada 3 segundos
  // Fix 3: era result.accounts[name] — ese campo no existe.
  // El handler devuelve result.steps con IDs del JSON (github_auth, google_auth…)
  identityPollTimer = setInterval(async () => {
    const pollResult = await window.onboarding.pollIdentity();
    if (!pollResult.success) return;

    if (pollResult.steps?.github_auth && !activeAccounts.has('github')) {
      activeAccounts.add('github');
      document.getElementById('acc-github')?.classList.add('active');
      log('info', 'account confirmed: github');
      checkIdentityReady();
    }
  }, 3000);
}

function checkIdentityReady() {
  const allDone = REQUIRED_ACCOUNTS.every(a => activeAccounts.has(a));
  if (!allDone) return;

  // Limpiar timers
  clearInterval(identityPollTimer);
  clearTimeout(identityTimeoutId);
  identityPollTimer = null;
  identityTimeoutId = null;

  log('info', 'github confirmed — identity ready');
  document.getElementById('sn-identity')?.classList.add('established');
  showCortex("GitHub connected. Vault layer next.");

  const btn = document.getElementById('btn-continue-identity');
  btn.textContent = 'Continue';
  btn.disabled    = false;
  btn.onclick     = () => goTo(2);
}

// ── SCREEN 3 — Nucleus ─────────────────────────────────────────────────────
async function loadOrgs() {
  const result = await window.onboarding.listOrgs();
  const list   = document.getElementById('org-list');
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
  goTo(4); // Fix 4 se activa aquí: goTo(4) llama runNucleusTerminal()
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
    log(result.success ? 'info' : 'error',
        `IPC ← onboarding:init-nucleus — success: ${result.success}`);
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
  log(result.success ? 'info' : 'error',
      `IPC ← onboarding:create-mandate — success: ${result.success}`);

  if (result.success) {
    log('info', 'IPC → onboarding:navigate — step: success');
    const navResult = await window.onboarding.navigate({ step: 'success' });
    log(navResult.success ? 'info' : 'error',
        `IPC ← onboarding:navigate — success: ${navResult.success}`);
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

  log(result.success ? 'info' : 'error',
      `IPC ← onboarding:complete — success: ${result.success}`);
  if (!result.success) {
    log('error', `completeOnboarding failed: ${result.error}`);
    showCortex('Handoff failed: ' + result.error);
  }
  // Si success: Electron redimensiona y carga la URL — el renderer no hace nada más.
}

// ── INIT ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  log('info', 'DOM ready — initialized');
  document.getElementById('btn-continue-identity').onclick = handleIdentityBtn;
});