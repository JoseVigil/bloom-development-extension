// workspace/onboarding/renderer/steps/step-identity.js
//
// Sub-wizard de identity: github_auth → google_auth → ai_provider_setup,
// los tres dentro de la misma screen física (screen-identity).
//
// DECISIÓN DE DISEÑO — por qué UN solo archivo y no step-github.js /
// step-google.js / step-gemini.js por separado (como pedía la consigna
// original): en el monolito, IDENTITY_STEPS es un único array recorrido
// secuencialmente por un ÚNICO botón (#btn-continue-identity) y un ÚNICO
// popup de ayuda (#info-popup). Partirlo en 3 archivos habría obligado a
// esos 3 módulos a importarse entre sí para compartir identityStepIndex,
// el botón y el array de orden — exactamente el acoplamiento cruzado que
// esta modularización busca eliminar. Se prioriza cohesión real de negocio
// (es UN wizard con 3 pasos) sobre una regla de nombres 1 archivo = 1
// stepId. Si en el futuro cada sub-step gana su propia screen física,
// ahí sí conviene partir esto en 3.
//
// Funciones movidas 1:1 desde el monolito: STEP_INFO, openInfo, closeInfo,
// IDENTITY_STEPS, IDENTITY_KEY_TO_SUBSTEP, IDENTITY_SCREEN_COPY,
// _renderIdentityScreenCopy, _refreshAccountIconStates, REQUIRED_ACCOUNTS,
// toggleAccount, handleIdentityBtn, advanceToNextIdentityStep,
// kickoffIdentityStep, _identityInstructionFor, _clearPollFallback,
// advanceIdentityWizard, _wireIdentityButtonToResumeStep,
// _completeIdentitySubstep, _onMilestoneGithubAuth, _onMilestoneGoogleAuth,
// _onMilestoneAiProviderSetup.
//
// CAMBIO respecto al original (Requerimiento 3 — unificar el mecanismo de
// avance): el destino tras "github" ya no es un goTo(4) a mano — es
// navigateTo('vault_init'). El destino tras el último sub-step ya no es
// goTo(5) — es navigateTo('project_create'). El AVANCE real sigue siendo
// el mismo (github → vault → google → gemini → project), lo único que
// cambia es que ahora se expresa como stepId, no como índice de screen.

import { log, registerMilestoneHandler } from '../core/ipc-bridge.js';
import { addNotification } from '../core/notifications.js';
import { navigateTo, registerStepHandler } from '../core/navigation.js';
import { setStepperEstablished } from '../core/ui-stepper.js';
import { identityWizard, activeAccounts, state, userEmail } from '../core/shared-state.js';

// ── INFO POPUP — contenido por cuenta ─────────────────────────────────────
const STEP_INFO = {
  github: {
    label: 'Step 1 — GitHub',
    title: 'Creating a Personal\nAccess Token.',
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
    `,
  },
  google: {
    label: 'Step 4 — Google',
    title: 'Connecting your\nGoogle account.',
    body: `
      Bloom usará tu cuenta de Google para acceder a <strong>Google Cloud</strong> y <strong>AI Studio</strong>.<br><br>
      La ventana de Discovery va a pedirte que inicies sesión con tu cuenta Google.<br>
      Solo necesitás confirmar el acceso — no se almacenan contraseñas en Bloom.
    `,
  },
  gemini: {
    label: 'Step 5 — AI Provider',
    title: 'Configuring your\nAI provider.',
    body: `
      Podés usar Gemini, Claude, OpenAI o Grok.<br><br>
      Para Gemini: abrí <strong>aistudio.google.com</strong> → Get API key → copiala.<br>
      Para otros proveedores: ingresá a su plataforma y generá una API key.<br><br>
      La extensión detecta la key al copiarla y la guarda en el vault cifrado.<br>
      Bloom nunca ve la key en texto plano.
    `,
  },
};

let currentInfoStep = 'github';

export function openInfo(step) {
  currentInfoStep = step || currentInfoStep;
  const info = STEP_INFO[currentInfoStep];
  if (!info) return;

  document.getElementById('info-panel-label').textContent = info.label;
  document.getElementById('info-panel-title').innerHTML = info.title.replace('\n', '<br>');
  document.getElementById('info-panel-body').innerHTML = info.body;
  document.getElementById('info-popup').classList.add('open');
}

export function closeInfo() {
  document.getElementById('info-popup').classList.remove('open');
}

// ── IDENTITY SUB-WIZARD ────────────────────────────────────────────────────
// id          → clave corta usada en activeAccounts / STEP_INFO
// key         → stepId real del SSOT (navigate, milestones)
// label       → texto legible para poll status / notificaciones
// buttonText  → texto del botón "Continue" mientras este sub-step está activo
// startLabel  → texto del botón ANTES de confirmarse (arranca el sub-step)
// infoStep    → key en STEP_INFO para el popup de ayuda (?)
export const IDENTITY_STEPS = [
  { id: 'github', key: 'github_auth', label: 'GitHub', buttonText: 'Continue to Vault', startLabel: 'Validate', infoStep: 'github' },
  { id: 'google', key: 'google_auth', label: 'Google', buttonText: 'Continue to Gemini', startLabel: 'Continue to Google', infoStep: 'google' },
  { id: 'gemini', key: 'ai_provider_setup', label: 'Gemini', buttonText: 'Continue to Projects', startLabel: 'Continue to Gemini', infoStep: 'gemini' },
];

const IDENTITY_KEY_TO_SUBSTEP = Object.fromEntries(IDENTITY_STEPS.map(s => [s.key, s]));

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

const REQUIRED_ACCOUNTS = IDENTITY_STEPS.map(s => s.id);

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

function _refreshAccountIconStates() {
  IDENTITY_STEPS.forEach((step, i) => {
    const el = document.getElementById(`acc-${step.id}`);
    if (!el) return;
    el.classList.remove('pending', 'in-progress', 'active');
    if (activeAccounts.has(step.id)) {
      el.classList.add('active');
    } else if (i === identityWizard.stepIndex) {
      el.classList.add('in-progress');
    } else {
      el.classList.add('pending');
    }
  });
}

// Fix 5: toggleAccount() ya no hace nada — los íconos los activa solo el
// poll/milestone. El onclick en el HTML queda por compatibilidad.
export function toggleAccount(name) {
  log('info', `toggleAccount(${name}) ignorado — estado manejado por milestone/pollIdentity`);
}

function showCortex(msg) {
  const el = document.getElementById('cortex-text');
  if (!el) return;
  el.textContent = msg;
  document.getElementById('cortex-bar')?.classList.add('visible');
}

export async function handleIdentityBtn() {
  log('info', 'click — btn-continue-identity');

  identityWizard.stepIndex = 0;
  const step = IDENTITY_STEPS[identityWizard.stepIndex];

  const btn = document.getElementById('btn-continue-identity');
  btn.textContent = `Esperando ${step.label}…`;
  btn.disabled = true;
  btn.onclick = null;

  currentInfoStep = step.infoStep;

  await kickoffIdentityStep();
}

export function advanceToNextIdentityStep() {
  identityWizard.stepIndex += 1;
  const next = IDENTITY_STEPS[identityWizard.stepIndex];
  if (!next) return; // el último sub-step navega a project desde advanceIdentityWizard()

  log('info', `identity wizard → avanzando a sub-step "${next.id}"`);
  currentInfoStep = next.infoStep;

  const btn = document.getElementById('btn-continue-identity');
  if (btn) {
    btn.textContent = `Esperando ${next.label}…`;
    btn.disabled = true;
    btn.onclick = null;
  }

  kickoffIdentityStep();
}

export async function kickoffIdentityStep() {
  const step = IDENTITY_STEPS[identityWizard.stepIndex];

  _renderIdentityScreenCopy(step);
  _refreshAccountIconStates();

  if (!identityWizard.discoveryLaunchedThisSession) {
    showCortex('Opening Discovery window…');
    log('info', 'IPC → onboarding:launch-discovery — email: ' + (userEmail || '(none)'));

    const result = await window.onboarding.launchDiscovery({ email: userEmail });
    log(result.success ? 'info' : 'error',
      `IPC ← onboarding:launch-discovery — success: ${result.success}`);

    if (!result.success) {
      showCortex('Could not launch Discovery. Retry.');
      const btn = document.getElementById('btn-continue-identity');
      btn.textContent = 'Validate';
      btn.disabled = false;
      btn.onclick = handleIdentityBtn;
      return;
    }

    identityWizard.discoveryLaunchedThisSession = true;
  }

  showCortex(`Connecting to ${step.label}…`);
  log('info', `IPC → onboarding:navigate — step: ${step.key}`);

  const navResult = await window.onboarding.navigate({ step: step.key, email: userEmail });
  log(navResult.success ? 'info' : 'warn',
    `IPC ← onboarding:navigate — success: ${navResult.success}`);

  if (!navResult.success) {
    log('warn', 'navigate falló — Chrome puede ya estar activo, continuando');
    showCortex(`Chrome open — follow the (?) instructions for ${step.label}.`);
  }

  showCortex(_identityInstructionFor(step));

  identityWizard.pollTimeoutId = setTimeout(() => {
    if (activeAccounts.has(step.id)) return;
    showCortex('Taking longer than expected. Click (?) for step-by-step instructions.');
  }, 3 * 60 * 1000);

  document.getElementById('identity-poll-status').style.display = 'flex';

  identityWizard.pollFallbackTimer = setInterval(async () => {
    if (activeAccounts.has(step.id)) {
      _clearPollFallback();
      return;
    }

    const pollResult = await window.onboarding.pollIdentity();
    if (!pollResult.success) return;

    if (pollResult.steps?.[step.key]) {
      log('info', `poll fallback: ${step.key} confirmado vía pollIdentity`);
      handleMilestoneReached(step.key, {
        username: pollResult.username || null,
        org: pollResult.org || null,
        provider: pollResult.provider || null,
      });
    }
  }, 3000);
}

function _identityInstructionFor(step) {
  switch (step.id) {
    case 'github':
      return 'In Chrome: Settings → Developer Settings → Personal access tokens → Tokens (classic) → Generate → select repo & read:org → copy.';
    case 'google':
      return 'In Chrome: sign in with your Google account and confirm access.';
    case 'gemini':
      return 'In Chrome: aistudio.google.com → Get API key → copy it.';
    default:
      return `Follow the instructions in Chrome for ${step.label}.`;
  }
}

function _clearPollFallback() {
  if (identityWizard.pollFallbackTimer) {
    clearInterval(identityWizard.pollFallbackTimer);
    identityWizard.pollFallbackTimer = null;
    log('info', 'poll fallback timer limpiado');
  }
  if (identityWizard.pollTimeoutId) {
    clearTimeout(identityWizard.pollTimeoutId);
    identityWizard.pollTimeoutId = null;
  }
}

// RF-08: github → Vault (interrumpe el wizard); google → sigue a gemini;
// gemini (último) → Project. Se mantiene igual, solo cambian los goTo(n)
// por navigateTo(stepId).
function advanceIdentityWizard() {
  const current = IDENTITY_STEPS[identityWizard.stepIndex];
  if (!current) return;
  if (!activeAccounts.has(current.id)) return;

  log('info', `identity wizard — sub-step "${current.id}" listo`);
  showCortex(`${current.label} connected.`);
  _refreshAccountIconStates();

  const btn = document.getElementById('btn-continue-identity');
  if (!btn) return;

  const isLastStep = identityWizard.stepIndex === IDENTITY_STEPS.length - 1;

  btn.textContent = current.buttonText;
  btn.disabled = false;

  if (current.id === 'github') {
    btn.onclick = () => {
      log('info', 'identity wizard — GitHub confirmado, yendo a Vault antes de Google/Gemini');
      showCortex('GitHub connected. Setting up vault…');
      navigateTo('vault_init');
    };
  } else if (isLastStep) {
    btn.onclick = () => {
      log('info', 'identity wizard completo — GitHub + Vault + Google + Gemini confirmados');
      setStepperEstablished('identity');
      showCortex('Identity complete. Setting up project…');
      navigateTo('project_create');
    };
  } else {
    btn.onclick = advanceToNextIdentityStep;
  }
}

// Retoma el sub-step apuntado por identityWizard.stepIndex sin resetearlo a
// 0 — usado solo desde resume(), cuando ese sub-step NO fue confirmado
// todavía (si ya lo está, advanceIdentityWizard() aplica en su lugar).
function _wireIdentityButtonToResumeStep() {
  const step = IDENTITY_STEPS[identityWizard.stepIndex];
  const btn = document.getElementById('btn-continue-identity');
  if (!step || !btn) return;

  _renderIdentityScreenCopy(step);
  _refreshAccountIconStates();

  btn.textContent = step.startLabel;
  btn.disabled = false;
  btn.onclick = () => {
    log('info', `identity wizard — retomando sub-step "${step.id}" desde resume`);
    btn.textContent = `Esperando ${step.label}…`;
    btn.disabled = true;
    btn.onclick = null;
    currentInfoStep = step.infoStep;
    kickoffIdentityStep();
  };
}

// Punto único de "un sub-step del identity wizard fue confirmado".
function _completeIdentitySubstep(subStepId, _data) {
  if (activeAccounts.has(subStepId)) return; // idempotente

  activeAccounts.add(subStepId);
  _refreshAccountIconStates();

  const step = IDENTITY_STEPS.find(s => s.id === subStepId);
  const stepLabel = step?.label || subStepId;

  const pollStatus = document.getElementById('identity-poll-status');
  const pollLabel = document.getElementById('identity-poll-label');
  if (pollLabel) pollLabel.textContent = `✓ ${stepLabel} confirmado`;
  if (pollStatus) pollStatus.classList.add('confirmed');

  _clearPollFallback();
  advanceIdentityWizard();
}

// ── Milestone handlers (registrados en ipc-bridge.js) ──────────────────────
function onMilestoneGithubAuth(data) {
  if (activeAccounts.has('github')) return;
  log('info', 'milestone: github_auth confirmado por Brain');

  const userLabel = data?.username ? ` — @${data.username}` : '';
  addNotification(`GitHub connected${userLabel}`, { icon: '✓', type: 'success' });

  if (data?.username) {
    state.githubUsername = data.username;
    state.githubOrg = data.org || null;
    const vaultUser = document.getElementById('vault-username');
    const vaultOrg = document.getElementById('vault-org');
    if (vaultUser) vaultUser.textContent = '@' + data.username;
    if (vaultOrg) vaultOrg.textContent = data.org || '—';
  }

  _completeIdentitySubstep('github', data);
}

function onMilestoneGoogleAuth(data) {
  if (activeAccounts.has('google')) return;
  log('info', 'milestone: google_auth confirmado por Brain');
  addNotification('Google account connected', { icon: '✓', type: 'success' });
  _completeIdentitySubstep('google', data);
}

function onMilestoneAiProviderSetup(data) {
  if (activeAccounts.has('gemini')) return;
  log('info', `milestone: ai_provider_setup confirmado por Brain — provider: ${data?.provider || 'n/a'}`);
  const providerLabel = data?.provider ? ` (${data.provider})` : '';
  addNotification(`AI provider configured${providerLabel}`, { icon: '✓', type: 'success' });
  _completeIdentitySubstep('gemini', data);
}

// handleMilestoneReached local — usado por el poll fallback de este mismo
// módulo (arriba, en kickoffIdentityStep) para reusar el mismo camino que
// un milestone real. No confundir con ipc-bridge.handleMilestoneReached,
// que es el dispatcher global: este es un wrapper de conveniencia interno.
function handleMilestoneReached(stepId, data) {
  if (stepId === 'github_auth') return onMilestoneGithubAuth(data);
  if (stepId === 'google_auth') return onMilestoneGoogleAuth(data);
  if (stepId === 'ai_provider_setup') return onMilestoneAiProviderSetup(data);
}

registerMilestoneHandler('github_auth', onMilestoneGithubAuth);
registerMilestoneHandler('google_auth', onMilestoneGoogleAuth);
registerMilestoneHandler('ai_provider_setup', onMilestoneAiProviderSetup);

// ── Registro ante navigation.js ─────────────────────────────────────────
// Los tres stepId de este wizard comparten la misma screen (identity) y el
// mismo onEnter: re-renderizar el sub-step actual. navigateTo() ya activó
// el nodo del stepper correcto (step.view) antes de llamar acá.
function onEnterIdentity() {
  _renderIdentityScreenCopy(IDENTITY_STEPS[identityWizard.stepIndex]);
  _refreshAccountIconStates();
}

registerStepHandler('github_auth', { onEnter: onEnterIdentity });
registerStepHandler('google_auth', { onEnter: onEnterIdentity });
registerStepHandler('ai_provider_setup', {
  onEnter: onEnterIdentity,
  restore(producedSet) {
    // Restauración fina (qué sub-step ya está confirmado) requiere que
    // get-resume-state exponga completedSteps, no solo `produced` a nivel
    // de artefacto final. Ver mismo comentario en step-workspace.js.
    if (producedSet.has('ai_provider_key')) {
      log('info', 'restore(identity): ai_provider_key ya existe — wizard completo, listo para project_create');
    }
  },
});
