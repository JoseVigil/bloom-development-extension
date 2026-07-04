console.log('%c[ONBOARDING BUILD] rf08-fix-v2 (github→vault→google→gemini, startLabel fix)', 'background:#222;color:#0f0;font-size:14px;padding:4px;');

// onboarding.js — Bloom Conductor (Synapse Protocol v4.0)
//
// NOTA (RF-11): el header de cambios referencia requerimientos
// (requerimientos_onboarding_ui.md, RF-XX) en vez de números de "Fix" locales.
// Un "Fix N" sin contexto es lo que causó que este mismo header mintiera sobre
// REQUIRED_ACCOUNTS en la v1 de este archivo (ver RF-08/RF-11) — referenciar el
// RF permite que cualquier sesión nueva vuelva al documento y confirme el
// estado real en vez de confiar ciegamente en el comentario.
//
// Correcciones aplicadas (histórico, pre-RF):
//   navigate manda 'github_auth', no 'google_login'
//   poll mapea result.steps.github_auth, no result.accounts
//   goTo(4) llama runNucleusTerminal()  [ver nota más abajo — esto era goTo(2)]
//   toggleAccount() desactivado — los íconos los activa solo el poll
//   info popup dinámico por step, contenido desde STEP_INFO[]
//
// CAMBIOS (sesión 2026-06):
//   - Listeners de milestone:reached y onboarding:step-ui-update registrados en DOMContentLoaded
//   - handleMilestoneReached() maneja el avance automático por hito
//   - setInterval en kickoffDiscovery se mantiene como FALLBACK (renombrado a _pollFallbackTimer)
//     para el caso en que Brain no emita GITHUB_TOKEN_STORED. Se limpia cuando el milestone
//     llega por el canal push o cuando el poll confirma github_auth.
//   - STEP_TO_NODE: mapa stepId → nombre de nodo del stepper, para que los handlers
//     de milestone puedan actualizar el stepper sin conocer los índices internos.
//
// CAMBIOS (sesión actual):
//   - RF-08: IDENTITY_STEPS/advanceIdentityWizard reordenados a github → vault →
//     google → gemini, para coincidir con `requires` de milestone-registry.js
//     (vault_init requiere github_token; google_auth y ai_provider_setup
//     requieren vault_initialized). Antes el wizard pedía Google/Gemini antes
//     de que el vault existiera.
//   - RF-01: título + bloque de instrucciones de screen-identity ahora se
//     derivan de IDENTITY_STEPS[identityStepIndex] (ver IDENTITY_SCREEN_COPY /
//     _renderIdentityScreenCopy) en vez de quedar hardcodeados a GitHub.
//   - RF-02/RF-04: los íconos de cuenta ahora tienen 3 estados reales
//     (pending / in-progress / active), ver _refreshAccountIconStates().
//   - RF-03: resumeOnboarding() arma el mensaje de "✓ X confirmado" a partir
//     del step restaurado, no de un string fijo.
//   - RF-05/RF-09: screen-vault ahora dispara runVaultInit() al entrar
//     (goTo(4)) y su botón queda disabled hasta que vault_init se confirma.

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

// ── IDENTITY SUB-WIZARD ────────────────────────────────────────────────────
// Screen 3 (identity) ya no es un único paso de GitHub — es un sub-wizard
// secuencial de 3 sub-steps: GitHub → Google → Gemini. Cada entrada mapea:
//   id          → clave corta usada en activeAccounts / STEP_INFO
//   key         → stepId real que entiende el backend (navigate, milestones)
//   label       → texto legible para el status del poll / notificaciones
//   buttonText  → texto del botón "Continue" mientras este sub-step está activo
//   startLabel  → texto del botón ANTES de confirmarse (arranca el sub-step)
//   infoStep    → key en STEP_INFO para el popup de ayuda (?)
// RF-08: buttonText refleja el orden real de dependencias del registry
// (github → vault → google → gemini), no el orden secuencial dentro de este
// array — 'github' salta a Vault (screen 4), no al siguiente índice.
//
// startLabel es el texto del botón ANTES de que este sub-step se confirme
// (lo que dispara kickoffIdentityStep para ESTE step). Es un campo separado
// de buttonText a propósito: buttonText describe adónde lleva COMPLETAR el
// sub-step actual, startLabel describe cómo ARRANCARLO. Antes de RF-08
// coincidían por accidente (buttonText del sub-step anterior decía
// literalmente "Continue to {este step}") — dejaron de coincidir en cuanto
// el orden de ejecución dejó de ser el mismo que el orden del array.
const IDENTITY_STEPS = [
  { id: 'github', key: 'github_auth',       label: 'GitHub', buttonText: 'Continue to Vault',   startLabel: 'Validate',             infoStep: 'github' },
  { id: 'google', key: 'google_auth',       label: 'Google', buttonText: 'Continue to Gemini',  startLabel: 'Continue to Google',   infoStep: 'google' },
  { id: 'gemini', key: 'ai_provider_setup', label: 'Gemini', buttonText: 'Continue to Projects', startLabel: 'Continue to Gemini',   infoStep: 'gemini' },
];

// stepId (backend) → sub-step de IDENTITY_STEPS, para rutear milestones
// entrantes sin tener que buscar en el array cada vez.
const IDENTITY_KEY_TO_SUBSTEP = Object.fromEntries(IDENTITY_STEPS.map(s => [s.key, s]));

// RF-01: título + bloque de instrucciones de screen-identity, por sub-step.
// Antes esto era HTML estático hardcodeado a GitHub (onboarding.html) — ver
// _renderIdentityScreenCopy(), que es el único lugar que debe escribir
// .stage-title / .identity-instruction para screen-identity.
const IDENTITY_SCREEN_COPY = {
  github: {
    title: 'Conectá tu cuenta<br>de GitHub.',
    steps: [
      'En el Chrome que abrió Bloom, andá a <strong>GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)</strong>',
      'Creá un token con permisos: <code>repo</code> · <code>read:org</code> · <code>read:user</code>',
      'Pegá el token en el campo que aparece en Chrome. Bloom lo detecta automáticamente.',
    ],
  },
  google: {
    title: 'Conectá tu cuenta<br>de Google.',
    steps: [
      'En el Chrome que abrió Bloom, iniciá sesión con la cuenta de Google que querés usar.',
      'Confirmá los permisos que Bloom solicita para acceder a Google Cloud y AI Studio.',
      'Bloom detecta la sesión automáticamente — no hace falta pegar nada.',
    ],
  },
  gemini: {
    title: 'Conectá tu API key<br>de Gemini.',
    steps: [
      'En el Chrome que abrió Bloom, andá a <strong>aistudio.google.com → Get API key</strong>',
      'Generá o copiá una API key existente.',
      'Pegá la key en el campo que aparece en Chrome. Bloom la detecta automáticamente.',
    ],
  },
};

// Escribe título + instrucciones de screen-identity para el sub-step dado.
// Único punto de escritura para estos dos elementos (RF-01) — llamar cada
// vez que el sub-step activo cambia: kickoffIdentityStep() (avance normal)
// y _wireIdentityButtonToResumeStep() (resume a mitad de camino).
function _renderIdentityScreenCopy(step) {
  const copy = IDENTITY_SCREEN_COPY[step?.id];
  if (!copy) return;

  const titleEl = document.querySelector('#screen-identity .stage-title');
  if (titleEl) titleEl.innerHTML = copy.title;

  const instructionEl = document.querySelector('#screen-identity .identity-instruction');
  if (instructionEl) {
    instructionEl.innerHTML = copy.steps.map((text, i) => `
      <div class="instruction-step">
        <span class="step-num">${i + 1}</span>
        <span>${text}</span>
      </div>
    `).join('');
  }
}

// RF-02/RF-04: aplica el estado visual correcto (pending / in-progress /
// active) a cada ícono de cuenta según activeAccounts + identityStepIndex.
// Único punto de escritura de estas 3 clases — llamar cada vez que cambia
// el sub-step activo o se confirma uno.
function _refreshAccountIconStates() {
  IDENTITY_STEPS.forEach((step, i) => {
    const el = document.getElementById(`acc-${step.id}`);
    if (!el) return;
    el.classList.remove('pending', 'in-progress', 'active');
    if (activeAccounts.has(step.id)) {
      el.classList.add('active');
    } else if (i === identityStepIndex) {
      el.classList.add('in-progress');
    } else {
      el.classList.add('pending');
    }
  });
}

// Índice del sub-step actualmente activo dentro del sub-wizard de identity.
let identityStepIndex = 0;

// Si ya lanzamos la ventana de Discovery en ESTA sesión de la app.
// NO usar `identityStepIndex === 0` para esto: tras un resumeOnboarding()
// el índice puede arrancar en 1 o 2 (ej: GitHub ya confirmado en una sesión
// anterior) mientras que en esta sesión nueva la ventana de Chrome todavía
// no existe. Sin este flag separado, kickoffIdentityStep() saltea
// launchDiscovery() creyendo que la ventana ya está abierta, y navigate()
// falla silenciosamente porque no hay nada donde navegar.
let _discoveryLaunchedThisSession = false;

// ── STATE ──────────────────────────────────────────────────────────────────
const activeAccounts = new Set();

// Los 3 sub-steps de IDENTITY_STEPS son requeridos, en orden, antes de
// avanzar a Vault (screen 4).
const REQUIRED_ACCOUNTS = IDENTITY_STEPS.map(s => s.id);

let selectedOrg         = null;
let selectedFolderPath  = null;
let folderSelected      = false;
let selectedProjectEl   = null;
let selectedProject     = null; // { name, path }
let _pollFallbackTimer  = null; // renombrado de identityPollTimer — es un fallback ahora
let identityTimeoutId   = null;
let userEmail           = null;

// RF-09: estado del disparo de vault_init — separado del _pollFallbackTimer
// de identity porque corren en pantallas distintas y no deben pisarse.
let _vaultInitTriggered    = false;
let _vaultPollFallbackTimer = null;

// Variables de estado para copy dinámico (§7 del spec)
const state = {
  githubUsername: null,  // @username detectado en pollIdentity o en milestone payload
  githubOrg:      null,  // org principal detectada
  selectedOrg:    null,  // org elegida en dropdown
  selectedFolder: null,  // path local elegido
  selectedRepo:   null,  // { name, full_name, private }
};

// ── NOTIFICATION RAIL ─────────────────────────────────────────────────────
//
// addNotification(text, opts) — único punto de escritura en #notification-list.
//
// opts:
//   icon  {string}  — emoji o símbolo que aparece como dot (default: '·')
//   type  {string}  — clase CSS adicional en .notif-card: 'success' | 'warn' | 'error'
//                     (sin valor → estilo neutro)
//
// Las notificaciones se insertan al inicio de la lista (más reciente arriba).
// El botón ✕ de cada card la elimina individualmente.
// Si el debug panel está abierto, el rail está oculto (display:none) — la
// notificación se agrega igual; será visible cuando el panel se cierre.
//
function addNotification(text, { icon = '·', type = '' } = {}) {
  const list = document.getElementById('notification-list');
  if (!list) return;

  const card = document.createElement('div');
  card.className = ['notif-card', type].filter(Boolean).join(' ');

  const dot = document.createElement('span');
  dot.className   = 'notif-dot';
  dot.textContent = icon;

  const msg = document.createElement('span');
  msg.className   = 'notif-text';
  msg.textContent = text;

  const close = document.createElement('button');
  close.className   = 'notif-close';
  close.textContent = '✕';
  close.setAttribute('aria-label', 'Dismiss notification');
  close.onclick = () => card.remove();

  card.appendChild(dot);
  card.appendChild(msg);
  card.appendChild(close);

  // Insertar al inicio — la más reciente queda arriba
  list.insertBefore(card, list.firstChild);

  log('info', `notification: [${type || 'info'}] ${text}`);
}

// ── MILESTONE → STEPPER mapping ────────────────────────────────────────────
// Mapa stepId (onboarding_steps.json) → nombre de nodo del stepper (STEPPER_NODES).
// Permite que handleMilestoneReached() actualice el stepper sin conocer los
// índices internos ni acoplarse a la estructura del DOM.
const STEP_TO_NODE = {
  nucleus_create:    'workspace',
  github_auth:       'identity',
  vault_init:        'vault',
  google_auth:       'providers',
  ai_provider_setup: 'providers',
  project_create:    'project',
};

// ── STEPPER API ────────────────────────────────────────────────────────────
// Mapa de nombre de nodo → índice del .step-node en el sidebar
// Fix D: nucleus va antes que vault (índice 1 y 2) para reflejar el orden real
// de dependencias: nucleus_create requiere [github_token], vault_init requiere
// [github_token, nucleus_path]. El stepper visual debe coincidir con ese orden.
const STEPPER_NODES = { workspace: 0, identity: 1, providers: 2, project: 3, mandate: 4 };

// Texto de status que aparece bajo el label cuando el nodo está established
const STEPPER_STATUSES = {
  workspace: 'Configured',
  identity:  'Active',
  providers: 'Connected',
  project:   'Active',
  mandate:   'Persistent',
};

// Mapa screen → nodo activo (screen 0 = entry, sin nodo activo)
// Nuevo orden: workspace → identity → providers → project
const STEPPER_MAP = {
  1: 'workspace',
  2: 'workspace',   // nucleus-init terminal (parte del step workspace)
  3: 'identity',
  4: 'identity',    // vault screen (pertenece al nodo identity)
  5: 'project',     // project selection (providers se maneja por onStepUpdate/milestone, no por navegación)
  6: 'mandate',     // screen-milestone: mandate visible
  7: 'mandate',     // screen-launch: animación de cierre
};

// Mapa nodo → screen de destino
const STEPPER_NAV = {
  workspace: 1,
  identity:  3,
  providers: 5,
  project:   5,
  mandate:   6,
};

function navigateToStep(nodeName) {
  const idx = STEPPER_NODES[nodeName];
  if (idx === undefined) return;
  const nodes = document.querySelectorAll('.step-node');
  const node = nodes[idx];
  if (!node) return;

  // Navegación libre: el usuario puede saltar a cualquier step del stepper,
  // completado o no, para entender el flujo completo y dónde está parado.
  // No bloqueamos por estado 'pending' — la pantalla de destino puede no
  // tener todos los datos disponibles todavía (ej: lista de repos vacía si
  // no hay github_auth), pero eso es responsabilidad de cada screen, no del
  // stepper. Avisamos en el log para diagnóstico, sin interrumpir al usuario.
  const target = STEPPER_NAV[nodeName];
  if (target === undefined) return;

  const isPending = node.classList.contains('pending');
  if (isPending) {
    log('info', `stepper click → navigateToStep(${nodeName}) — step aún no completado, navegando igual`);
  }

  log('info', `stepper click → navigateToStep(${nodeName}) → goTo(${target})`);
  goTo(target);
}

function setStepperActive(nodeName) {
  const idx = STEPPER_NODES[nodeName];
  if (idx === undefined) return;
  const nodes = document.querySelectorAll('.step-node');
  nodes.forEach(n => n.classList.remove('active'));
  if (nodes[idx]) nodes[idx].classList.add('active');
  log('info', `stepper: active → ${nodeName}`);
  refreshStepperPendingStates();
}

function setStepperEstablished(nodeName) {
  const idx = STEPPER_NODES[nodeName];
  if (idx === undefined) return;
  const nodes = document.querySelectorAll('.step-node');
  if (nodes[idx]) {
    nodes[idx].classList.remove('active');
    nodes[idx].classList.add('established');
  }
  log('info', `stepper: established → ${nodeName}`);
  refreshStepperPendingStates();
}

// Marca como 'pending' (visualmente atenuado, pero igual navegable) cualquier
// nodo que no esté ni 'established' ni 'active'. Se recalcula cada vez que
// cambia el estado del stepper para mantener el estilo consistente.
function refreshStepperPendingStates() {
  document.querySelectorAll('.step-node').forEach(n => {
    const isDone   = n.classList.contains('established');
    const isActive = n.classList.contains('active');
    n.classList.toggle('pending', !isDone && !isActive);
  });
}

// ── SCREEN MAP ─────────────────────────────────────────────────────────────
const SCREEN_IDS = [
  'entry',        // 0
  'workspace',    // 1 — nuevo step 1: configurar workspace (nucleus_create)
  'nucleus-init', // 2 — terminal de nucleus init
  'identity',     // 3 — github auth (antes screen 1)
  'vault',        // 4 — vault confirmation (antes screen 2)
  'project',      // 5 — project selection (antes screen 5)
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

  // Actualizar stepper usando el mapa correcto (screen index ≠ node index)
  const activeNode = STEPPER_MAP[n];
  if (activeNode) setStepperActive(activeNode);

  // Efectos por pantalla
  // Screen 2: nucleus-init terminal (llama al IPC)
  // Screen 3: identity ready (workspace ya establecido)
  // Screen 4: vault confirmation
  // Screen 5: project selection (vault establecido)
  if (n === 2) runNucleusTerminal();
  if (n === 3) { setStepperEstablished('workspace'); }
  if (n === 4) runVaultInit(); // RF-09: antes no había ningún efecto para n===4
  if (n === 5) { setStepperEstablished('identity'); loadRepos(); }
  if (n === 6) {
    setStepperEstablished('project');
    runMilestoneSequence();
    setTimeout(() => {
      const enterBtn = document.getElementById('enter-btn');
      if (enterBtn) enterBtn.style.opacity = '1';
    }, 1200);
  }
  if (n === 7) {
    setStepperEstablished('mandate');
    runLaunchSequence();
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

// ── MILESTONE HANDLERS (Cambio 7) ──────────────────────────────────────────
//
// handleMilestoneReached() es el punto único de entrada para todos los hitos
// confirmados por Brain vía MilestoneReactor.
//
// Principio: cada handler es idempotente — verificar con activeAccounts.has()
// o guardas equivalentes antes de modificar estado de UI.

function handleMilestoneReached(stepId, data) {
  log('info', `milestone:reached — stepId: ${stepId}`);

  switch (stepId) {
    case 'github_auth':
      _onMilestoneGithubAuth(data);
      break;

    case 'vault_init':
      _onMilestoneVaultInit(data);
      break;

    case 'google_auth':
      _onMilestoneGoogleAuth(data);
      break;

    case 'ai_provider_setup':
      _onMilestoneAiProviderSetup(data);
      break;

    case 'project_create':
      _onMilestoneProjectCreate(data);
      break;

    case '__onboarding_complete__':
      // Todos los steps bloqueantes terminaron.
      // El renderer no hace nada aquí — el reactor ya llamó
      // nucleus synapse onboarding --step success para navegar Chrome.
      // El usuario completa el flujo en la UI de Conductor normalmente.
      log('info', 'milestone: onboarding completo (todos los blocking steps ok)');
      break;

    default:
      log('warn', `milestone:reached — stepId desconocido: ${stepId}`);
  }
}

// Punto único de "un sub-step del identity wizard fue confirmado".
// Idempotente: si el sub-step ya estaba marcado activo, no repite trabajo.
// No decide navegación por sí sola — delega en advanceIdentityWizard(),
// que sólo actúa si el sub-step confirmado es el que está actualmente activo.
function _completeIdentitySubstep(subStepId, _data) {
  if (activeAccounts.has(subStepId)) return; // idempotente

  activeAccounts.add(subStepId);
  _refreshAccountIconStates();

  const step = IDENTITY_STEPS.find(s => s.id === subStepId);
  const stepLabel = step?.label || subStepId;

  // Actualizar poll status a confirmado
  const pollStatus = document.getElementById('identity-poll-status');
  const pollLabel  = document.getElementById('identity-poll-label');
  if (pollLabel)  pollLabel.textContent = `✓ ${stepLabel} confirmado`;
  if (pollStatus) pollStatus.classList.add('confirmed');

  // Limpiar el poll de fallback del sub-step activo — ya no lo necesitamos
  _clearPollFallback();

  advanceIdentityWizard();
}

function _onMilestoneGithubAuth(data) {
  if (activeAccounts.has('github')) return;  // idempotente
  log('info', 'milestone: github_auth confirmado por Brain');

  const userLabel = data?.username ? ` — @${data.username}` : '';
  addNotification(`GitHub connected${userLabel}`, { icon: '✓', type: 'success' });

  // Capturar username/org para copy dinámico si Brain los incluyó en el payload
  if (data?.username) {
    state.githubUsername = data.username;
    state.githubOrg      = data.org || null;
    const vaultUser = document.getElementById('vault-username');
    const vaultOrg  = document.getElementById('vault-org');
    if (vaultUser) vaultUser.textContent = '@' + data.username;
    if (vaultOrg)  vaultOrg.textContent  = data.org || '—';
  }

  _completeIdentitySubstep('github', data);
}

function _onMilestoneVaultInit(_data) {
  if (activeAccounts.has('vault_init')) return; // idempotente
  log('info', 'milestone: vault_init confirmado por Brain');

  activeAccounts.add('vault_init');
  addNotification('Vault initialized', { icon: '🔒', type: 'success' });
  setStepperEstablished('identity');   // ← era 'vault', que no existe en STEPPER_NODES
  showCortex('Vault initialized.');
  _clearVaultPollFallback();

  // RF-05/RF-09: el botón de screen-vault queda disabled hasta este punto.
  // RF-08: al confirmarse, vuelve a screen-identity y retoma el wizard en
  // 'google' — vault ya está listo, así que ya no hace falta pasar por acá
  // de nuevo antes de llegar a Project.
  const btn = document.getElementById('btn-continue-vault');
  if (btn) {
    btn.textContent = 'Continuar →';
    btn.disabled    = false;
    btn.onclick     = () => {
      log('info', 'vault confirmado — retomando identity wizard en Google');
      goTo(3);
      advanceToNextIdentityStep();
    };
  }
}

function _onMilestoneGoogleAuth(data) {
  if (activeAccounts.has('google')) return;  // idempotente
  log('info', 'milestone: google_auth confirmado por Brain');
  addNotification('Google account connected', { icon: '✓', type: 'success' });
  _completeIdentitySubstep('google', data);
}

function _onMilestoneAiProviderSetup(data) {
  if (activeAccounts.has('gemini')) return;  // idempotente
  log('info', `milestone: ai_provider_setup confirmado por Brain — provider: ${data?.provider || 'n/a'}`);
  const providerLabel = data?.provider ? ` (${data.provider})` : '';
  addNotification(`AI provider configured${providerLabel}`, { icon: '✓', type: 'success' });
  _completeIdentitySubstep('gemini', data);
}

function _onMilestoneProjectCreate(_data) {
  log('info', 'milestone: project_create confirmado por Brain');
  addNotification('Project created — workspace ready', { icon: '✓', type: 'success' });
  // El reactor ya llamó nucleus synapse onboarding --step success para Chrome.
  // El renderer avanza a la pantalla de milestone (screen 6) si no está ahí.
  const milestoneScreen = document.getElementById('screen-milestone');
  if (milestoneScreen && !milestoneScreen.classList.contains('active')) {
    log('info', 'milestone: project_create — avanzando a screen 6 por push');
    goTo(6);
  }
}

// ── SCREEN 1 — Identity (sub-wizard: GitHub → Google → Gemini) ────────────
//
// El screen 3 (identity) recorre IDENTITY_STEPS en orden. Cada sub-step:
//   1. kickoffIdentityStep()     — abre/navega Discovery al step correspondiente
//   2. usuario completa la acción en Chrome (token, login, API key)
//   3. milestone push (o poll fallback) confirma el sub-step
//   4. advanceIdentityWizard()   — habilita el botón "Continue to X"
//   5. usuario clickea — RF-08: el destino depende del sub-step, no de la
//      posición en el array: 'github' → goTo(4) (Vault, interrumpe el wizard);
//      'google' → advanceToNextIdentityStep() (sigue a gemini); 'gemini'
//      (último) → goTo(5) (Project — vault ya pasó entre github y google).
//
// Solo el primer sub-step (github) requiere launchDiscovery — abre la ventana
// de Chrome del perfil. Los siguientes (google, gemini) reusan esa misma
// ventana y solo necesitan navigate() al step correspondiente.

// Fix 5: toggleAccount() ya no hace nada — los íconos los activa solo el poll/milestone.
// El onclick en el HTML queda por compatibilidad pero no cambia estado.
function toggleAccount(name) {
  log('info', `toggleAccount(${name}) ignorado — estado manejado por milestone/pollIdentity`);
}

async function handleIdentityBtn() {
  log('info', 'click — btn-continue-identity');

  identityStepIndex = 0;
  const step = IDENTITY_STEPS[identityStepIndex];

  const btn = document.getElementById('btn-continue-identity');
  btn.textContent = `Esperando ${step.label}…`;
  btn.disabled = true;
  btn.onclick  = null;

  // Actualizar el info popup al sub-step actual antes de abrir Discovery
  currentInfoStep = step.infoStep;

  await kickoffIdentityStep();
}

// Avanza identityStepIndex al siguiente sub-step y lo arranca.
// Llamado desde el onclick de "Continue to Google" / "Continue to Gemini".
function advanceToNextIdentityStep() {
  identityStepIndex += 1;
  const next = IDENTITY_STEPS[identityStepIndex];
  if (!next) return; // no debería pasar — el último step navega a goTo(5) desde advanceIdentityWizard(), no acá

  log('info', `identity wizard → avanzando a sub-step "${next.id}"`);
  currentInfoStep = next.infoStep;

  const btn = document.getElementById('btn-continue-identity');
  if (btn) {
    btn.textContent = `Esperando ${next.label}…`;
    btn.disabled    = true;
    btn.onclick     = null;
  }

  kickoffIdentityStep();
}

// Arranca (o continúa) el flujo de Discovery para el sub-step activo
// (IDENTITY_STEPS[identityStepIndex]). Sólo el primer sub-step (github)
// lanza una ventana de Discovery nueva; los siguientes navegan dentro de
// la misma sesión ya abierta.
async function kickoffIdentityStep() {
  const step = IDENTITY_STEPS[identityStepIndex];

  // RF-01/RF-02/RF-04: título, instrucciones e íconos deben reflejar el
  // sub-step que arranca ahora, no quedar en lo que dejó el sub-step anterior.
  _renderIdentityScreenCopy(step);
  _refreshAccountIconStates();

  if (!_discoveryLaunchedThisSession) {
    // Fase 1: lanzar Discovery — una sola vez por sesión de la app, sin
    // importar en qué sub-step del wizard estemos (puede ser google o
    // gemini directamente si venimos de un resume con github ya confirmado
    // en una sesión previa).
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

    _discoveryLaunchedThisSession = true;
  }

  // Fase 2: navegar al step correspondiente en Chrome
  showCortex(`Connecting to ${step.label}…`);
  log('info', `IPC → onboarding:navigate — step: ${step.key}`);

  const navResult = await window.onboarding.navigate({
    step:  step.key,
    email: userEmail
  });
  log(navResult.success ? 'info' : 'warn',
      `IPC ← onboarding:navigate — success: ${navResult.success}`);

  if (!navResult.success) {
    log('warn', 'navigate falló — Chrome puede ya estar activo, continuando');
    showCortex(
      `Chrome open — follow the (?) instructions for ${step.label}.`
    );
  }

  // Fase 3: instrucción al usuario, específica del sub-step
  showCortex(_identityInstructionFor(step));

  // Timeout de 3 minutos — mensaje de ayuda si el usuario tarda
  identityTimeoutId = setTimeout(() => {
    if (activeAccounts.has(step.id)) return;
    showCortex(
      "Taking longer than expected. Click (?) for step-by-step instructions."
    );
  }, 3 * 60 * 1000);

  // Fase 4: mostrar el indicador de poll y arrancar el fallback poll
  //
  // El canal push (milestone:reached) es el mecanismo principal.
  // El setInterval es un FALLBACK para el caso en que Brain no emita el
  // evento correspondiente (builds viejos, race condition, etc.).
  // Se limpia automáticamente cuando llega el milestone o cuando el poll confirma.
  document.getElementById('identity-poll-status').style.display = 'flex';

  _pollFallbackTimer = setInterval(async () => {
    // Si el milestone ya llegó por el canal push, el timer ya se limpió.
    // Esta guarda es por si hay un tick residual.
    if (activeAccounts.has(step.id)) {
      _clearPollFallback();
      return;
    }

    const pollResult = await window.onboarding.pollIdentity();
    if (!pollResult.success) return;

    if (pollResult.steps?.[step.key]) {
      log('info', `poll fallback: ${step.key} confirmado vía pollIdentity`);
      // Tratar igual que si hubiera llegado el milestone push
      handleMilestoneReached(step.key, {
        username: pollResult.username || null,
        org:      pollResult.org      || null,
        provider: pollResult.provider || null,
      });
    }
  }, 3000);
}

// Texto de instrucción mostrado en la cortex bar mientras se espera la
// confirmación de cada sub-step.
function _identityInstructionFor(step) {
  switch (step.id) {
    case 'github':
      return "In Chrome: Settings → Developer Settings → Personal access tokens → Tokens (classic) → Generate → select repo & read:org → copy.";
    case 'google':
      return "In Chrome: sign in with your Google account and confirm access.";
    case 'gemini':
      return "In Chrome: aistudio.google.com → Get API key → copy it.";
    default:
      return `Follow the instructions in Chrome for ${step.label}.`;
  }
}

// RF-09: dispara vault_init activamente al entrar a screen 4, en vez de
// dejar la pantalla puramente pasiva esperando un evento que Cortex podía
// o no decidir emitir. Sigue el mismo patrón de kickoffIdentityStep():
// navigate() (canal principal) + poll de fallback (por si el push no llega).
//
// SUPUESTO A VERIFICAR: se asume que onboarding-handlers.js expone el step
// 'vault_init' en window.onboarding.navigate() igual que expone
// 'github_auth' / 'google_auth' / 'ai_provider_setup'. No tenemos ese
// archivo (ni workspace-synapse-handlers.js) en este set de fixes — si el
// contrato real es otro (otro nombre de step, otro método IPC), este
// bloque necesita el nombre correcto antes de mergear.
async function runVaultInit() {
  if (_vaultInitTriggered) return;          // ya disparado en esta sesión
  if (activeAccounts.has('vault_init')) return; // ya confirmado (ej: resume)
  _vaultInitTriggered = true;

  const btn = document.getElementById('btn-continue-vault');
  if (btn) {
    btn.textContent = 'Inicializando vault…';
    btn.disabled    = true;
    btn.onclick     = null;
  }

  showCortex('Setting up vault…');
  log('info', 'IPC → onboarding:navigate — step: vault_init');

  const navResult = await window.onboarding.navigate({ step: 'vault_init', email: userEmail });
  log(navResult.success ? 'info' : 'warn',
      `IPC ← onboarding:navigate (vault_init) — success: ${navResult.success}`);

  if (!navResult.success) {
    log('warn', 'navigate(vault_init) falló — dejando el poll fallback como único camino');
  }

  const pollStatus = document.getElementById('vault-poll-status');
  if (pollStatus) pollStatus.style.display = 'flex';

  // Timeout de 3 minutos — mismo criterio que identity: avisar, no bloquear.
  const vaultTimeoutId = setTimeout(() => {
    if (activeAccounts.has('vault_init')) return;
    showCortex('Vault is taking longer than expected…');
  }, 3 * 60 * 1000);

  _vaultPollFallbackTimer = setInterval(async () => {
    if (activeAccounts.has('vault_init')) {
      _clearVaultPollFallback(vaultTimeoutId);
      return;
    }

    const pollResult = await window.onboarding.pollIdentity();
    if (!pollResult.success) return;

    if (pollResult.steps?.vault_init) {
      log('info', 'poll fallback: vault_init confirmado vía pollIdentity');
      handleMilestoneReached('vault_init', {});
    }
  }, 3000);
}

function _clearVaultPollFallback(vaultTimeoutId) {
  if (_vaultPollFallbackTimer) {
    clearInterval(_vaultPollFallbackTimer);
    _vaultPollFallbackTimer = null;
    log('info', 'vault poll fallback timer limpiado');
  }
  if (vaultTimeoutId) clearTimeout(vaultTimeoutId);
}

function _clearPollFallback() {
  if (_pollFallbackTimer) {
    clearInterval(_pollFallbackTimer);
    _pollFallbackTimer = null;
    log('info', 'poll fallback timer limpiado');
  }
  if (identityTimeoutId) {
    clearTimeout(identityTimeoutId);
    identityTimeoutId = null;
  }
}

// Reacciona a la confirmación de un sub-step: si el sub-step confirmado es
// el que está actualmente activo en el wizard, habilita el botón "Continue"
// con el texto correspondiente (buttonText).
//
// RF-08: el destino del click ya no es "el siguiente índice del array salvo
// que sea el último" — es el orden real de dependencias del registry:
//   - github  → Vault (screen 4). vault_init requiere github_token, así que
//     el wizard SE INTERRUMPE acá; no sigue directo a Google. El botón de
//     screen-vault retoma el wizard en 'google' una vez que vault_init se
//     confirma (ver _onMilestoneVaultInit()).
//   - google  → sigue al siguiente sub-step del array (gemini) como antes.
//   - gemini (último sub-step) → Project (screen 5), no Vault — el vault ya
//     se hizo entre github y google.
function advanceIdentityWizard() {
  const current = IDENTITY_STEPS[identityStepIndex];
  if (!current) return;

  // Si el sub-step confirmado no es el activo (ej: llegó fuera de orden,
  // o vía push mientras el usuario todavía no arrancó ese sub-step),
  // no tocamos el botón — cuando el wizard llegue a ese sub-step,
  // activeAccounts ya lo va a tener marcado y avanzará inmediatamente.
  if (!activeAccounts.has(current.id)) return;

  log('info', `identity wizard — sub-step "${current.id}" listo`);
  showCortex(`${current.label} connected.`);
  _refreshAccountIconStates();

  const btn = document.getElementById('btn-continue-identity');
  if (!btn) return;

  const isLastStep = identityStepIndex === IDENTITY_STEPS.length - 1;

  btn.textContent = current.buttonText;
  btn.disabled    = false;

  if (current.id === 'github') {
    btn.onclick = () => {
      log('info', 'identity wizard — GitHub confirmado, yendo a Vault antes de Google/Gemini');
      showCortex("GitHub connected. Setting up vault…");
      goTo(4);
    };
  } else if (isLastStep) {
    btn.onclick = () => {
      log('info', 'identity wizard completo — GitHub + Vault + Google + Gemini confirmados');
      setStepperEstablished('identity');
      showCortex("Identity complete. Setting up project…");
      goTo(5);
    };
  } else {
    btn.onclick = advanceToNextIdentityStep;
  }
}

// Wire #btn-continue-identity to RESUME the sub-step currently pointed at by
// identityStepIndex (used only from resumeOnboarding(), when that sub-step
// has NOT been confirmed yet — otherwise advanceIdentityWizard() applies).
// Clicking the button kicks off Discovery/navigate for that exact sub-step
// without touching identityStepIndex, so progress from a previous session
// isn't lost. Mirrors the text/disable pattern used in
// handleIdentityBtn()/advanceToNextIdentityStep(), just without resetting
// the index to 0.
function _wireIdentityButtonToResumeStep() {
  const step = IDENTITY_STEPS[identityStepIndex];
  const btn = document.getElementById('btn-continue-identity');
  if (!step || !btn) return;

  // RF-01/RF-02/RF-04: un resume a mitad de camino debe mostrar el
  // título/instrucciones/íconos del sub-step que se está retomando, no los
  // de GitHub por default.
  _renderIdentityScreenCopy(step);
  _refreshAccountIconStates();

  // step.buttonText describe a dónde lleva COMPLETAR este sub-step — no es
  // el label correcto para arrancarlo. step.startLabel es el campo pensado
  // para esto (ver definición de IDENTITY_STEPS).
  const label = step.startLabel;

  btn.textContent = label;
  btn.disabled    = false;
  btn.onclick = () => {
    log('info', `identity wizard — retomando sub-step "${step.id}" desde resume`);
    btn.textContent = `Esperando ${step.label}…`;
    btn.disabled    = true;
    btn.onclick     = null;
    currentInfoStep = step.infoStep;
    kickoffIdentityStep();
  };
}

// ── SCREEN 1 — Workspace (nucleus_create) ─────────────────────────────────

// Estado del workspace step (persiste para navegación hacia atrás)
const workspaceState = {
  path: '',
  org:  '',
  githubVerified: null,   // true | false | null
  _orgDebounceTimer: null,
};

function slugify(val) {
  return val.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function updateWorkspacePreview() {
  const pathVal = workspaceState.path;
  const orgVal  = workspaceState.org;
  const orgDisplay    = document.getElementById('ws-preview-org');
  const pathDisplay   = document.getElementById('ws-preview-path');
  const structDisplay = document.getElementById('ws-preview-struct');

  if (!pathDisplay) return;

  if (!pathVal) {
    if (pathDisplay)   pathDisplay.textContent  = '—';
    if (orgDisplay)    orgDisplay.textContent   = '—';
    if (structDisplay) structDisplay.textContent = 'Completá la ubicación para ver la preview';
    return;
  }

  const isTemporary = !orgVal;

  if (pathDisplay)  pathDisplay.textContent  = isTemporary ? pathVal : `${pathVal}/${orgVal}`;
  if (orgDisplay)   orgDisplay.textContent   = isTemporary ? '(Temporal)' : orgVal;

  if (structDisplay) {
    structDisplay.textContent = isTemporary
      ? `${pathVal}/bloom-workspace/.bloom/.nucleus-<temporal>/`
      : `${pathVal}/${orgVal}/.bloom/.nucleus-${orgVal}/`;
  }
}

function checkWorkspaceReady() {
  const btn = document.getElementById('btn-continue-workspace');
  if (btn) btn.disabled = !workspaceState.path;
}

async function selectWorkspaceFolder() {
  const result = await window.onboarding.selectFolder();
  if (!result.success || result.canceled) return;

  workspaceState.path = result.path;
  const input = document.getElementById('ws-path-input');
  if (input) input.value = result.path;
  updateWorkspacePreview();
  checkWorkspaceReady();
}

function onWorkspacePathInput(e) {
  workspaceState.path = e.target.value.trim();
  updateWorkspacePreview();
  checkWorkspaceReady();
}

function onWorkspaceOrgInput(e) {
  const raw      = e.target.value;
  const slugged  = slugify(raw);

  // Corregir automáticamente si había mayúsculas
  if (raw !== slugged) {
    e.target.value = slugged;
    const hint = document.getElementById('ws-org-hint');
    if (hint) { hint.textContent = 'Convertido a minúsculas'; hint.style.display = 'block'; }
    setTimeout(() => { if (hint) hint.style.display = 'none'; }, 2000);
  }

  workspaceState.org = slugged;
  updateWorkspacePreview();

  // Limpiar badge anterior
  const badge = document.getElementById('ws-org-badge');
  if (badge) { badge.textContent = ''; badge.className = 'ws-org-badge'; }
  workspaceState.githubVerified = null;

  // Debounce 600ms para verificar en GitHub
  clearTimeout(workspaceState._orgDebounceTimer);
  if (slugged.length >= 2) {
    workspaceState._orgDebounceTimer = setTimeout(() => verifyOrgOnGithub(slugged), 600);
  }
}

function onWorkspaceOrgBlur(e) {
  // Si quedó vacío al perder el foco, usar bloom-local como valor interno
  if (!e.target.value.trim()) {
    workspaceState.org = '';
    updateWorkspacePreview();
  }
}

async function verifyOrgOnGithub(slug) {
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
    // Error de red — silencioso
    badge.textContent = '';
    badge.className = 'ws-org-badge';
  }
}

async function continueWorkspace() {
  const btn = document.getElementById('btn-continue-workspace');
  if (!btn || btn.disabled) return;

  const path      = workspaceState.path;
  const orgSlug   = workspaceState.org;
  const temporary = !orgSlug;

  // Construir payload correcto:
  // - si el campo org está vacío → pasar temporary:true (el binario resuelve el slug internamente)
  // - si tiene valor → pasar org: slug (sin hardcodear 'bloom-local' acá)
  const ipcPayload = temporary
    ? { path, temporary: true }
    : { path, org: orgSlug };

  log('info', `continueWorkspace — payload: ${JSON.stringify(ipcPayload)}`);

  // Estado loading
  btn.disabled    = true;
  btn.textContent = 'Creando estructura…';

  // Limpiar error previo
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
    // Guardar en estado global para pasos siguientes
    // Si fue temporary, el slug real lo devuelve el handler en result.org
    const resolvedOrg = result.org || orgSlug || 'bloom-local';
    selectedOrg          = resolvedOrg;
    selectedFolderPath   = path;
    state.selectedOrg    = resolvedOrg;
    state.selectedFolder = path;

    // Marcar step completo
    await window.onboarding.markStepComplete({ step: 'nucleus_create' });
    addNotification('Workspace configured', { icon: '✓', type: 'success' });

    // Avanzar al step 2 (github_auth) — screen 3
    // NOTA: nucleus init NO se llama aquí. Se llama en screen 3 (github_auth),
    // después de que el usuario autentica con GitHub y el sistema dispone del github_id.
    goTo(3);
  } else {
    btn.disabled    = false;
    btn.textContent = 'Continuar';

    if (!errEl) return;
    errEl.style.display = 'block';

    const msg = result.error || '';
    if (msg.includes('already exists') || msg.includes('ya existe')) {
      errEl.innerHTML = `
        Ya existe una configuración de Bloom en esta carpeta.
        <div class="ws-error-actions">
          <button onclick="useExistingWorkspace()">Usar la existente</button>
          <button onclick="selectWorkspaceFolder()">Elegir otra ubicación</button>
        </div>`;
    } else if (msg.includes('EACCES') || msg.includes('permission') || msg.includes('permisos')) {
      errEl.innerHTML = `
        Sin permisos para crear la carpeta en <strong>${path}</strong>. Elegí otra ubicación.
        <div class="ws-error-actions">
          <button onclick="selectWorkspaceFolder()">Elegir carpeta</button>
        </div>`;
    } else {
      errEl.innerHTML = `
        No se pudo crear el workspace en <strong>${path}</strong>. ${msg}
        <div class="ws-error-actions">
          <button onclick="continueWorkspace()">Reintentar</button>
        </div>`;
    }
  }
}

async function useExistingWorkspace() {
  // El workspace ya existe — marcar como completo y continuar sin re-ejecutar nucleus create.
  // El slug real de org vacío lo resolverá el handler cuando corresponda; acá solo
  // guardamos lo que tenemos y avanzamos.
  const orgSlug = workspaceState.org;   // puede ser '' si es temporary
  const path    = workspaceState.path;
  selectedOrg          = orgSlug || null;
  selectedFolderPath   = path;
  state.selectedOrg    = orgSlug || null;
  state.selectedFolder = path;
  await window.onboarding.markStepComplete({ step: 'nucleus_create' });
  goTo(3);
}

// ── SCREEN 2 — Nucleus Init Terminal ───────────────────────────────────────
// (ver runNucleusTerminal más abajo)

// ── SCREEN 3 — Identity (github_auth) ─────────────────────────────────────
// loadOrgs se mantiene para pasos posteriores que aún lo usan
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
  state.selectedOrg = orgName;
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
  state.selectedFolder = result.path;
  checkNucleusReady();
}

function checkNucleusReady() {
  document.getElementById('btn-init-nucleus').disabled = !(selectedOrg && folderSelected);
}

// REMOVED (código zombie): initNucleus() redirigía a goTo(4) (terminal antigua del screen 2
// en el orden previo). Ya no forma parte del flujo — continueWorkspace() en screen 1
// dispara el IPC init-nucleus directamente y avanza a goTo(3) al completar.
// Se deja comentado como referencia histórica.
//
// function initNucleus() {
//   log('info', `initNucleus — org: ${selectedOrg} | path: ${selectedFolderPath}`);
//   goTo(4); // Fix 4: goTo(4) llama runNucleusTerminal()
// }

// ── SCREEN 2 — Nucleus Create Terminal ─────────────────────────────────────
// El IPC onboarding:init-nucleus ya se disparó en continueWorkspace() (screen 1).
// Esta pantalla solo escucha las líneas de output que el main process emite
// mientras el subproceso `nucleus create` corre.
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

  log('info', 'nucleus-terminal: escuchando líneas de nucleus create…');
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
        name: fr.path.split(/[\\\/]/).pop(),
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
  state.selectedRepo = repoObj;
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
    // El reactor en el main process recibirá PROJECT_CREATED de Brain
    // y llamará nucleus synapse onboarding --step success.
    // El IPC milestone:reached ('project_create') avanzará la UI vía _onMilestoneProjectCreate.
    // La llamada a navigate() acá sigue siendo útil como fallback si Brain no emite el evento.
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

// ── SCREEN 6 — Milestone ───────────────────────────────────────────────────
function runMilestoneSequence() {
  const nodes = document.querySelectorAll('#milestone-nodes .m-node');
  // Guard: si todos los nodos ya están visibles, no re-animar
  const alreadyDone = Array.from(nodes).every(n => n.classList.contains('show'));
  if (alreadyDone) return;

  document.getElementById('ambient')?.classList.add('milestone');
  nodes.forEach((node, i) => {
    setTimeout(() => node.classList.add('show'), 200 + i * 180);
  });
}

// ── SCREEN 7 — Launch ──────────────────────────────────────────────────────
function enterSystem() {
  log('info', 'click — btn-enter-system');
  goTo(7);
}

function runLaunchSequence() {
  document.getElementById('ambient')?.classList.remove('milestone');

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

// ── SYNAPSE CATEGORY ───────────────────────────────────────────────────────
// Mapea el tipo clasificado por SynapseBridge a la categoría que usa el
// Event Feed de debug.html (filters: synapse, brain, sentinel, nucleus, temporal, health).
function _synapseCategory(data) {
  const t = (data.type || '').toUpperCase();
  const e = (data.event || '').toUpperCase();
  if (t === 'HANDSHAKE' || t === 'ONBOARDING_MILESTONE' || t === 'HOST_READY') return 'synapse';
  if (t === 'INTENT')    return 'temporal';
  if (t === 'ION')       return 'sentinel';
  if (t === 'PROFILE' || t === 'PROFILE_LAUNCHED' || t === 'PROFILE_CONNECTED') return 'brain';
  if (t === 'STATUS' || t === 'HEARTBEAT') return 'nucleus';
  if (e.startsWith('INTENT_'))  return 'temporal';
  if (e.startsWith('ION_'))     return 'sentinel';
  if (e.startsWith('PROFILE_')) return 'brain';
  return 'synapse';
}

// ── TAB SYSTEM ─────────────────────────────────────────────────────────────
//
// El iframe #debug-frame se carga con src desde el HTML — está vivo desde
// DOMContentLoaded. switchTab solo alterna visibilidad CSS, sin toca el DOM
// del iframe ni el src. No hay buffer, no hay lazy-load, no se pierden eventos.
//
let _activeTab = 'onboarding';

function switchTab(name) {
  if (name === _activeTab) return;
  _activeTab = name;

  document.querySelectorAll('.content-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.content-panel').forEach(p => p.classList.remove('active'));

  document.getElementById(`tab-${name}`)?.classList.add('active');
  document.getElementById(`panel-${name}`)?.classList.add('active');

  log('info', `tab: switched to ${name}`);
}

// ── RESUME — restaurar sesión de onboarding interrumpida ──────────────────
//
// Mapa de stepId → pantalla de destino (goTo index).
// "dado que este step YA está completo, ¿en qué pantalla debe estar el usuario?"
// = la pantalla del SIGUIENTE step a completar.
const RESUME_STEP_SCREEN = {
  nucleus_create: 3,   // → identity (github_auth)
  github_auth:    4,   // → vault confirmation
  vault_init:     3,   // → identity — retomar el sub-wizard en 'google' (RF-08)
  project_create: 6,   // → milestone
};

// Orden canónico de steps — de más avanzado a menos avanzado.
// NOTA: ya no se usa para calcular targetScreen (ver el bloque "4. Calcular
// pantalla de destino" en resumeOnboarding — ahora tiene lógica explícita
// para el sub-wizard de identity). Se deja por si algún otro código externo
// la referencia; si no es el caso, se puede eliminar con seguridad.
const RESUME_STEP_ORDER = ['project_create', 'vault_init', 'github_auth', 'nucleus_create'];

/**
 * resumeOnboarding()
 *
 * Lee estado de nucleus.json, restaura variables globales + UI, y navega
 * a la pantalla correcta. Retorna true si se hizo resume, false si hay
 * que empezar desde el principio.
 *
 * Restauraciones por step completado:
 *   nucleus_create → workspaceState fields, selectedOrg, selectedFolderPath,
 *                    preview DOM, workspace screen inputs
 *   github_auth    → activeAccounts('github'), acc-github icon, identity btn,
 *                    vault-username / vault-org DOM, state.githubUsername/Org
 *   vault_init     → stepper node identity established
 *   project_create → (no state to restore, milestone screen handles itself)
 */
async function resumeOnboarding() {
  if (!window.onboarding?.getResumeState) {
    log('warn', 'resumeOnboarding: getResumeState no disponible — modo fresh start');
    return false;
  }

  let resume;
  try {
    resume = await window.onboarding.getResumeState();
  } catch (e) {
    log('error', `resumeOnboarding: error leyendo estado — ${e.message}`);
    return false;
  }

  if (!resume.success || !resume.hasProgress) {
    log('info', `resumeOnboarding: sin progreso previo — fresh start`);
    return false;
  }
  if (resume.completed) {
    log('info', 'resumeOnboarding: onboarding ya completado — no hay nada que retomar');
    return false;
  }

  const { completedSteps = [], workspaceState: ws = {} } = resume;
  log('info', `resumeOnboarding: completedSteps=[${completedSteps.join(', ')}]`);

  // ── 1. Restaurar nucleus_create (workspace) ─────────────────────────────
  //
  // Dos casos posibles:
  //   a) nucleus_create completó — ws.path/ws.org vienen de los campos definitivos.
  //   b) nucleus_create quedó interrumpido (ej: usuario cerró la app mientras
  //      `nucleus create` corría) — ws.pending === true, los valores vienen de
  //      los campos *_pending escritos antes del spawn. En este caso repoblamos
  //      los inputs para que el usuario no tenga que re-tipear nada, pero NO
  //      marcamos el step como completo ni avanzamos de pantalla: el usuario
  //      debe re-confirmar "Continuar" para que `nucleus create` corra de nuevo.
  if (ws.path && (completedSteps.includes('nucleus_create') || ws.pending)) {
    // Restaurar los inputs del workspace screen siempre
    const wsPathInput = document.getElementById('ws-path-input');
    const wsOrgInput  = document.getElementById('ws-org-input');
    if (wsPathInput) wsPathInput.value = ws.path;
    if (wsOrgInput && ws.org) wsOrgInput.value = ws.org;

    // workspaceState (objeto local del step) para que checkWorkspaceReady() funcione
    workspaceState.path = ws.path;
    workspaceState.org  = ws.org || '';

    // Restaurar preview en tiempo real del workspace screen
    updateWorkspacePreview();
    checkWorkspaceReady();

    if (ws.pending) {
      // Intento interrumpido: NO seteamos selectedOrg/selectedFolder globales
      // todavía (eso implicaría tratar el step como completo), solo dejamos
      // los inputs listos para que el usuario confirme de nuevo.
      addNotification(
        'Workspace incompleto — revisá los datos y continuá de nuevo',
        { icon: '⚠', type: 'warn' }
      );
      log('info', `resumeOnboarding: workspace PENDIENTE restaurado (intento interrumpido) — path: ${ws.path} | org: ${ws.org || '(none)'}`);
    } else {
      // Variables globales que los steps siguientes necesitan
      selectedFolderPath   = ws.path;
      selectedOrg          = ws.org || null;
      state.selectedFolder = ws.path;
      state.selectedOrg    = ws.org || null;

      log('info', `resumeOnboarding: workspace restaurado — path: ${ws.path} | org: ${ws.org || '(none)'}`);
    }
  }

  // ── 2. Restaurar sub-wizard de identity (github → google → gemini) ────
  // Recorremos IDENTITY_STEPS en orden y marcamos como activo cada sub-step
  // cuyo stepId aparece en completedSteps. identityStepIndex queda apuntando
  // al primer sub-step NO completado (o al último si los 3 lo están),
  // exactamente lo que kickoffIdentityStep()/advanceIdentityWizard() esperan.
  let anyIdentityStepRestored = false;
  let lastRestoredIdentityStep = null; // RF-03: para armar el mensaje de poll dinámico
  for (let i = 0; i < IDENTITY_STEPS.length; i++) {
    const step = IDENTITY_STEPS[i];
    if (!completedSteps.includes(step.key)) {
      identityStepIndex = i;
      break;
    }

    anyIdentityStepRestored = true;
    lastRestoredIdentityStep = step;
    identityStepIndex = i;
    activeAccounts.add(step.id);
    document.getElementById(`acc-${step.id}`)?.classList.add('active');
    log('info', `resumeOnboarding: ${step.key} restaurado — sub-step "${step.id}" activo`);
  }
  _refreshAccountIconStates();

  if (anyIdentityStepRestored) {
    // RF-03: el mensaje refleja la CUENTA restaurada, no un string genérico
    // ("✓ Token detectado" no significa nada si lo que se restauró fue Google
    // o Gemini). Mismo criterio que _completeIdentitySubstep() en el flujo en vivo.
    const pollLabel  = document.getElementById('identity-poll-label');
    const pollStatus = document.getElementById('identity-poll-status');
    if (pollLabel)  pollLabel.textContent = `✓ ${lastRestoredIdentityStep.label} confirmado`;
    if (pollStatus) {
      pollStatus.style.display = 'flex';
      pollStatus.classList.add('confirmed');
    }

    // Restaurar username/org en el vault screen si los tenemos
    if (ws.githubUsername) {
      state.githubUsername = ws.githubUsername;
      const vaultUser = document.getElementById('vault-username');
      if (vaultUser) vaultUser.textContent = '@' + ws.githubUsername;
    }
    if (ws.githubOrg) {
      state.githubOrg = ws.githubOrg;
      const vaultOrg = document.getElementById('vault-org');
      if (vaultOrg) vaultOrg.textContent = ws.githubOrg;
    }

    // Dejar el botón listo para el estado correcto: si todos los sub-steps
    // están confirmados, "Continue to Projects" (RF-08: vault ya pasó entre
    // github y google, no queda pendiente); si no, hay que dejarlo listo
    // para RETOMAR el sub-step actualmente activo (identityStepIndex), que
    // todavía NO está confirmado — por eso NO podemos usar advanceIdentityWizard()
    // acá: esa función sólo actúa si activeAccounts.has(current.id), y en un
    // resume a mitad de camino el sub-step actual, por definición, todavía no
    // fue confirmado. Sin este branch, el botón queda con el onclick default
    // (handleIdentityBtn), que resetea identityStepIndex a 0 y relanza Discovery
    // desde GitHub, perdiendo el progreso ya hecho.
    const allIdentityDone = REQUIRED_ACCOUNTS.every(a => activeAccounts.has(a));
    const identityBtn = document.getElementById('btn-continue-identity');
    if (identityBtn && allIdentityDone) {
      const lastStep = IDENTITY_STEPS[IDENTITY_STEPS.length - 1];
      identityBtn.textContent = lastStep.buttonText;
      identityBtn.disabled    = false;
      identityBtn.onclick     = () => goTo(5);
    } else if (identityBtn) {
      _wireIdentityButtonToResumeStep();
    }

    log('info', `resumeOnboarding: identity wizard restaurado — identityStepIndex=${identityStepIndex}`);
  }

  // ── 3. Marcar stepper nodes como established ───────────────────────────
  // Cada step completado establece un conjunto de nodos en el stepper.
  // Se aplican acumulativamente — un step más avanzado implica los anteriores.
  const STEP_ESTABLISHES = {
    nucleus_create: ['workspace'],
    github_auth:    ['workspace', 'identity'],
    vault_init:     ['workspace', 'identity'],
    project_create: ['workspace', 'identity', 'providers', 'project'],
  };
  const toEstablish = new Set();
  for (const stepId of completedSteps) {
    for (const n of (STEP_ESTABLISHES[stepId] || [])) toEstablish.add(n);
  }
  for (const nodeName of toEstablish) setStepperEstablished(nodeName);

  // ── 3.5 Restaurar vault_init ─────────────────────────────────────────────
  // RF-07/RF-08: vault_init ahora es un step intermedio (github → vault →
  // google → gemini), no algo que sólo importa "después de identity". Si ya
  // está confirmado, reflejarlo en activeAccounts (lo que usa runVaultInit()
  // para no re-disparar) y dejar el botón de screen-vault ya habilitado por
  // si el usuario vuelve a esa pantalla manualmente.
  if (completedSteps.includes('vault_init')) {
    activeAccounts.add('vault_init');
    const vaultBtn = document.getElementById('btn-continue-vault');
    if (vaultBtn) {
      vaultBtn.textContent = 'Continuar →';
      vaultBtn.disabled    = false;
      vaultBtn.onclick     = () => { goTo(3); advanceToNextIdentityStep(); };
    }
    log('info', 'resumeOnboarding: vault_init restaurado — activeAccounts + botón de vault habilitados');
  }

  // ── 4. Calcular pantalla de destino ────────────────────────────────────
  // RF-08: el orden real es github → vault → google → gemini → project, así
  // que el destino no puede depender solo de "¿identity terminó?" — hay que
  // distinguir explícitamente si vault_init ya pasó o todavía falta.
  const identityKeys      = IDENTITY_STEPS.map(s => s.key);
  const allIdentityDone   = identityKeys.every(k => completedSteps.includes(k));
  const anyIdentityDone   = identityKeys.some(k => completedSteps.includes(k));

  let targetScreen = 1; // default: workspace (primer step real)
  if (completedSteps.includes('project_create')) {
    targetScreen = RESUME_STEP_SCREEN.project_create; // 6 — milestone
    log('info', `resumeOnboarding: step más avanzado="project_create" → screen ${targetScreen}`);
  } else if (allIdentityDone) {
    // github + vault + google + gemini, todos confirmados → Project.
    targetScreen = 5;
    log('info', `resumeOnboarding: identity + vault completos → screen ${targetScreen}`);
  } else if (completedSteps.includes('vault_init')) {
    // Vault listo, retomando google/gemini.
    targetScreen = RESUME_STEP_SCREEN.vault_init; // 3 — identity
    log('info', `resumeOnboarding: vault_init completo, identity incompleto → screen ${targetScreen}`);
  } else if (completedSteps.includes('github_auth')) {
    // GitHub confirmado pero vault todavía no — la pantalla de vault
    // dispara runVaultInit() sola al entrar (goTo(4) → RF-09).
    targetScreen = RESUME_STEP_SCREEN.github_auth; // 4 — vault
    log('info', `resumeOnboarding: github_auth completo, vault_init pendiente → screen ${targetScreen}`);
  } else if (anyIdentityDone || completedSteps.includes('nucleus_create')) {
    targetScreen = 3; // identity — retomar el sub-wizard donde quedó
    log('info', `resumeOnboarding: identity wizard incompleto o recién arrancado → screen ${targetScreen}`);
  }

  if (completedSteps.length > 0) {
    addNotification(
      `Retomando desde ${completedSteps.length} step${completedSteps.length !== 1 ? 's' : ''} completado${completedSteps.length !== 1 ? 's' : ''}`,
      { icon: '↩', type: 'success' }
    );
  } else if (ws.pending) {
    addNotification('Retomando workspace incompleto', { icon: '↩', type: '' });
  }

  log('info', `resumeOnboarding: navegando a screen ${targetScreen}`);
  await goTo(targetScreen);
  return true;
}

// ── INIT ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  log('info', 'DOM ready — initialized');
  document.getElementById('btn-continue-identity').onclick = handleIdentityBtn;

  // Inicializar clase 'pending' en todos los nodos del stepper que arrancan
  // sin estado (ni active ni established) — necesario para que el estilo CSS
  // y la navegación libre del stepper sean consistentes desde el primer render.
  refreshStepperPendingStates();

  // RF-02/RF-04: mismo criterio para los íconos de cuenta — sin esto, Google
  // y Gemini se ven clickeables/sin atenuar desde el primer render aunque
  // el wizard todavía ni arrancó.
  _refreshAccountIconStates();

  // ── Workspace screen (Step 1) handlers ────────────────────────────────────
  const wsPathInput = document.getElementById('ws-path-input');
  if (wsPathInput) wsPathInput.addEventListener('input', onWorkspacePathInput);

  const wsOrgInput = document.getElementById('ws-org-input');
  if (wsOrgInput) {
    wsOrgInput.addEventListener('input', onWorkspaceOrgInput);
    wsOrgInput.addEventListener('blur', onWorkspaceOrgBlur);
  }

  const btnWorkspace = document.getElementById('btn-continue-workspace');
  if (btnWorkspace) btnWorkspace.onclick = continueWorkspace;

  // ── Milestone listeners (Cambio 7) ─────────────────────────────────────
  //
  // Registrar los listeners de push del MilestoneReactor.
  // onMilestone y onStepUpdate usan removeAllListeners internamente —
  // registrar acá una sola vez es suficiente.

  if (window.onboarding?.onMilestone) {
    window.onboarding.onMilestone(({ stepId, ...data }) => {
      log('info', `IPC ← milestone:reached — stepId: ${stepId}`);
      handleMilestoneReached(stepId, data);
    });
    log('info', 'milestone:reached listener registrado');
  } else {
    log('warn', 'window.onboarding.onMilestone no disponible — solo modo poll fallback');
  }

  if (window.onboarding?.onStepUpdate) {
    window.onboarding.onStepUpdate(({ stepId, phase }) => {
      log('info', `IPC ← onboarding:step-ui-update — stepId: ${stepId} phase: ${phase}`);
      // Actualizar el stepper si tenemos un nodo mapeado para el step
      if (phase === 'ESTABLISHED') {
        const nodeName = STEP_TO_NODE[stepId];
        if (nodeName) setStepperEstablished(nodeName);
      }
    });
    log('info', 'onboarding:step-ui-update listener registrado');
  }

  // ── Harness tab — live dot refleja WS state del iframe ─────────────────
  window.addEventListener('message', (evt) => {
    if (!evt.data) return;
    if (evt.data.type === 'HARNESS_WS_STATE') {
      const dot = document.getElementById('harness-live-dot');
      if (dot) dot.className = 'tab-live-dot' + (evt.data.state === 'live' ? ' live' : '');
    }
    if (evt.data.type === 'REQUEST_HEALTH') {
      (async () => {
        try {
          const data = await (window.onboarding?.health?.() ?? window.electronAPI?.health?.());
          document.getElementById('debug-frame')?.contentWindow
            ?.postMessage({ type: 'HEALTH_RESPONSE', data }, '*');
        } catch(e) {
          document.getElementById('debug-frame')?.contentWindow
            ?.postMessage({ type: 'HEALTH_RESPONSE', error: e.message }, '*');
        }
      })();
    }
  });

  // ── Atajo de teclado Ctrl/Cmd+Shift+D → toggle Harness tab ─────────────
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'D') {
      e.preventDefault();
      switchTab(_activeTab === 'harness' ? 'onboarding' : 'harness');
    }
  });

  // ── Synapse bridge (preload → iframe debug.html via postMessage) ─────────
  // El iframe ya está cargado desde el inicio — no hay buffer ni frameReady check.
  // Un único callback maneja notificaciones rail + reenvío al iframe.
  if (window.onboarding?.onSynapseEvent) {
    window.onboarding.onSynapseEvent((data) => {
      // Notificación rail — HANDSHAKE una sola vez
      if (data.type === 'HANDSHAKE' && !window._synapseHandshakeNotified) {
        window._synapseHandshakeNotified = true;
        addNotification('Synapse handshake complete', { icon: '⚡', type: 'success' });
      }
      // ── NUEVO: rutear ONBOARDING_MILESTONE al reactor de milestones ──────────
      // El SynapseBridge clasifica como ONBOARDING_MILESTONE todos los eventos
      // de onboarding que llegan de Brain. El renderer debe actuar sobre ellos
      // exactamente igual que si hubieran llegado por el canal push (onMilestone).
      // data.data.step contiene el stepId (ej: 'github_auth').
      if (data.type === 'ONBOARDING_MILESTONE') {
        const stepId = data.data?.step;
        if (stepId) {
          log('info', `onSynapseEvent: ONBOARDING_MILESTONE → handleMilestoneReached('${stepId}')`);
          handleMilestoneReached(stepId, data.data);
        }
      }

      // Reenvío al iframe — siempre disponible
      const frame = document.getElementById('debug-frame');
      if (frame?.contentWindow) {
        frame.contentWindow.postMessage({ type: 'SYNAPSE_RAW_EVENT', payload: data }, '*');
        frame.contentWindow.postMessage({ type: 'SYNAPSE_EVENT', payload: {
          category:   _synapseCategory(data),
          event:      data.event || data.type || '?',
          data:       data.data || {},
          profile_id: data._profileId || data.profile_id || null,
          timestamp:  data._ts || data.timestamp || Date.now(),
        }}, '*');
        log('info', `onSynapseEvent → debug-frame: ${data?.type || data?.event || '?'}`);
      }
    });
    log('info', 'onSynapseEvent listener registrado — bridge activo desde inicio');
  }

  // ── Resume de sesión interrumpida ──────────────────────────────────────
  //
  // Intentar retomar el onboarding donde quedó. Se llama al final para que
  // todos los listeners ya estén registrados cuando goTo() dispara efectos
  // secundarios (setStepperEstablished, loadRepos, runNucleusTerminal, etc.).
  //
  // Si resumeOnboarding() retorna false → el usuario empieza en screen 0
  // (entry / "Start") que es el comportamiento original.
  resumeOnboarding().catch(err => {
    log('error', `resumeOnboarding error — ${err.message}`);
    // No crashear — simplemente arrancar desde el principio
  });
});
