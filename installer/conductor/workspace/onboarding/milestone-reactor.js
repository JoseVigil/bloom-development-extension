'use strict';

/**
 * conductor/onboarding/milestone-reactor.js
 *
 * Reacciona a hitos del onboarding recibidos desde Brain vía SynapseBridge.
 * Cada hito mapea a un handler nombrado. Implementa idempotencia — no re-ejecuta
 * un hito ya procesado en esta sesión.
 *
 * Flujo de datos:
 *   Brain (TCP) → SynapseBridge._classifyMessage() → 'ONBOARDING_MILESTONE'
 *   → workspace-synapse-handlers.js → milestoneReactor.handleMilestone(stepId)
 *   → handler específico (_onGithubAuthComplete, etc.)
 *   → ipcMain.emit('milestone:reached', stepId) → renderer (onboarding.js)
 *
 * Uso:
 *   const reactor = new MilestoneReactor({
 *     registry, getWindow, execNucleus, NUCLEUS_JSON, verbose
 *   });
 *
 *   // En workspace-synapse-handlers.js:
 *   bridge.on('message', (enriched) => {
 *     if (enriched.type === 'ONBOARDING_MILESTONE') {
 *       const stepId = registry.resolveEvent(enriched.event);
 *       if (stepId) reactor.handleMilestone(stepId, enriched);
 *     }
 *   });
 *
 * NOTA sobre _openLandingTab():
 *   La Incógnita 5 del spec está resuelta. nucleus synapse onboarding <profileId>
 *   --step <screen> envía una señal de navegación al onboarding en ejecución.
 *   No es necesario abrir una tab nueva — el canal ya existe.
 *   Ver: nucleus_help.txt y la enmienda del 20 de junio de 2026.
 */

const fs   = require('fs');
const path = require('path');

// Canal IPC que el renderer escucha vía preload_onboarding.js
const MILESTONE_IPC_CHANNEL   = 'milestone:reached';
const STEP_UPDATE_IPC_CHANNEL = 'onboarding:step-ui-update';

class MilestoneReactor {
  /**
   * @param {object}    opts
   * @param {import('./milestone-registry').MilestoneRegistry} opts.registry
   * @param {() => Electron.BrowserWindow|null} opts.getWindow
   * @param {Function}  opts.execNucleus      Misma función que usa onboarding-handlers.js
   * @param {string}    opts.NUCLEUS_JSON      Path absoluto a nucleus.json
   * @param {boolean}  [opts.verbose=false]
   * @param {object}   [opts.logger=console]  Logger con métodos .info/.warn/.error
   *   (ej: el getLogger('onboarding') de main_conductor.js). IMPORTANTE: usar el
   *   logger inyectado en vez de console.* directo — el sistema de logging del
   *   Conductor intercepta los métodos del logger, no console global, así que
   *   console.log/warn/error nunca llegan al archivo de log (ver Bug 4).
   */
  constructor({ registry, getWindow, execNucleus, NUCLEUS_JSON, verbose = false, logger = console }) {
    this._registry    = registry;
    this._getWindow   = getWindow;
    this._execNucleus = execNucleus;
    this._NUCLEUS_JSON = NUCLEUS_JSON;
    this._verbose     = verbose;
    this._logger      = logger;

    // Set de stepIds ya procesados en esta sesión — idempotencia en memoria.
    // Si el proceso reinicia, el estado persiste en nucleus.json.
    this._processed = new Set();

    // Set separado para dedupe de EMISIÓN al renderer (Bug 3).
    // _processed usa clave "stepId:event" porque github_auth necesita procesar
    // varios eventos del mismo step (ACCOUNT_REGISTERED abre Landing,
    // GITHUB_TOKEN_STORED no). Pero eso permite que ambos eventos lleguen a
    // _emitMilestone/_emitStepUiUpdate y el renderer vea el milestone dos veces.
    // _emitted usa clave solo "stepId" — el renderer se notifica una única vez
    // por step, sin importar cuántos eventos internos lo compongan.
    this._emitted = new Set();

    // Mapa de stepId → handler. Permite extensión sin tocar el switch.
    this._handlers = {
      github_auth:       (enriched) => this._onGithubAuthComplete(enriched),
      nucleus_create:    (enriched) => this._onNucleusCreateComplete(enriched),
      vault_init:        (enriched) => this._onVaultInitComplete(enriched),
      google_auth:       (enriched) => this._onGoogleAuthComplete(enriched),
      ai_provider_setup: (enriched) => this._onAiProviderSetupComplete(enriched),
      project_create:    (enriched) => this._onProjectCreateComplete(enriched),
    };
  }

  // ── API pública ─────────────────────────────────────────────────────────────

  /**
   * Punto de entrada principal. Llamado por workspace-synapse-handlers.js.
   *
   * @param {string} stepId    ID del step (del MilestoneRegistry)
   * @param {object} [enriched] Mensaje enriquecido del bridge (para contexto)
   */
  handleMilestone(stepId, enriched = {}) {
    if (!stepId) return;

    // Idempotencia: la clave es "stepId:event", no solo stepId.
    // Un mismo step (ej: github_auth) puede tener varios cortex_events
    // distintos (GITHUB_PAT_DETECTED, GITHUB_TOKEN_STORED, ACCOUNT_REGISTERED),
    // y cada uno puede disparar una reacción diferente dentro del mismo handler
    // (ver _onGithubAuthComplete, que solo abre Landing si enriched.event ===
    // 'ACCOUNT_REGISTERED'). Si la idempotencia fuera solo por stepId, el primer
    // evento que llegue "gasta" el step entero y los eventos siguientes para ese
    // mismo step se descartan en este guard sin llegar nunca al handler —
    // por eso ACCOUNT_REGISTERED se ackeaba en Brain pero nunca abría Landing.
    const dedupeKey = `${stepId}:${enriched.event || 'n/a'}`;
    if (this._processed.has(dedupeKey)) {
      this._log(`handleMilestone: "${dedupeKey}" ya procesado — ignorando`);
      return;
    }

    const step = this._registry.getStep(stepId);
    if (!step) {
      this._log(`handleMilestone: stepId desconocido "${stepId}" — ignorando`);
      return;
    }

    this._log(`handleMilestone: "${stepId}" (evento: ${enriched.event || 'n/a'})`);
    this._processed.add(dedupeKey);

    const handler = this._handlers[stepId];
    if (handler) {
      // Ejecutar de forma async, sin bloquear el caller
      Promise.resolve()
        .then(() => handler(enriched))
        .catch(err => this._logger.error(`[MilestoneReactor] error en handler "${stepId}":`, err.message));
    } else {
      // Handler genérico: marcar completo en nucleus.json y notificar al renderer
      this._defaultReaction(stepId, enriched);
    }
  }

  /**
   * Recarga el estado desde nucleus.json. Útil al reconectar con Brain
   * para evitar re-ejecutar hitos que ya se procesaron en una sesión anterior.
   */
  rehydrateFromDisk() {
    try {
      const data = JSON.parse(fs.readFileSync(this._NUCLEUS_JSON, 'utf8'));
      const completed = data.onboarding?.completed_steps || [];
      for (const stepId of completed) {
        this._processed.add(stepId);
      }
      this._log(`rehydrateFromDisk: ${this._processed.size} steps ya completados`);
    } catch (e) {
      this._log(`rehydrateFromDisk: no se pudo leer nucleus.json — ${e.message}`);
    }
  }

  // ── Handlers por step ───────────────────────────────────────────────────────

  async _onGithubAuthComplete(enriched) {
    this._log(`_onGithubAuthComplete (evento: ${enriched.event || 'n/a'})`);
    await this._persistStepComplete('github_auth');

    // Bug 3 fix: github_auth puede recibir varios eventos Cortex distintos
    // (ACCOUNT_REGISTERED, GITHUB_TOKEN_STORED, GITHUB_PAT_DETECTED...) y el
    // guard de handleMilestone() los deja pasar a todos a propósito, porque
    // cada uno puede requerir una reacción distinta (ver _openLandingTab más
    // abajo). Pero la notificación al renderer (milestone:reached /
    // step-ui-update) debe emitirse una sola vez por step, no una vez por
    // evento interno — de lo contrario el stepper recibe el mismo milestone
    // duplicado en el mismo segundo. Se dedupea por stepId solamente.
    if (!this._emitted.has('github_auth')) {
      this._emitted.add('github_auth');
      this._emitMilestone('github_auth', {
        username: enriched.data?.username || null,
        org:      enriched.data?.org      || null,
      });
      this._emitStepUiUpdate('github_auth', { phase: 'ESTABLISHED' });
    } else {
      this._log('_onGithubAuthComplete: milestone ya emitido al renderer — solo procesando side-effect');
    }

    // ACCOUNT_REGISTERED = el usuario completó el login de GitHub y la cuenta
    // está creada. En este punto Landing puede abrirse para mostrar el workspace.
    // GITHUB_PAT_DETECTED y GITHUB_TOKEN_STORED llegan después (clipboard),
    // para esos eventos solo marcamos el step — Landing ya está abierta.
    if (enriched.event === 'ACCOUNT_REGISTERED') {
      await this._openLandingTab();
    }
  }

  async _onNucleusCreateComplete(enriched) {
    this._log('_onNucleusCreateComplete');
    await this._persistStepComplete('nucleus_create');
    this._emitMilestone('nucleus_create', {});
    this._emitStepUiUpdate('nucleus_create', { phase: 'ESTABLISHED' });
  }

  async _onVaultInitComplete(enriched) {
    this._log('_onVaultInitComplete');
    await this._persistStepComplete('vault_init');
    this._emitMilestone('vault_init', {});
    this._emitStepUiUpdate('vault_init', { phase: 'ESTABLISHED' });
  }

  async _onGoogleAuthComplete(enriched) {
    this._log('_onGoogleAuthComplete');
    await this._persistStepComplete('google_auth');
    this._emitMilestone('google_auth', {
      email: enriched.data?.email || null,
    });
    this._emitStepUiUpdate('google_auth', { phase: 'ESTABLISHED' });
  }

  async _onAiProviderSetupComplete(enriched) {
    this._log('_onAiProviderSetupComplete');
    await this._persistStepComplete('ai_provider_setup');
    this._emitMilestone('ai_provider_setup', {
      provider: enriched.data?.provider || null,
    });
    this._emitStepUiUpdate('ai_provider_setup', { phase: 'ESTABLISHED' });
  }

  async _onProjectCreateComplete(enriched) {
    this._log('_onProjectCreateComplete');
    await this._persistStepComplete('project_create');
    this._emitMilestone('project_create', {
      project: enriched.data?.project || null,
    });
    this._emitStepUiUpdate('project_create', { phase: 'ESTABLISHED' });

    // Verificar si todos los steps bloqueantes están completos
    const allBlockingDone = this._registry.blockingSteps.every(
      s => this._processed.has(s.id)
    );

    if (allBlockingDone) {
      await this._onOnboardingSuccess();
    }
  }

  // ── Reacción genérica ───────────────────────────────────────────────────────

  async _defaultReaction(stepId, enriched) {
    this._log(`_defaultReaction: "${stepId}"`);
    await this._persistStepComplete(stepId);
    this._emitMilestone(stepId, {});
    this._emitStepUiUpdate(stepId, { phase: 'ESTABLISHED' });
  }

  // ── Completion del onboarding ────────────────────────────────────────────────

  /**
   * Se llama cuando todos los steps bloqueantes completan.
   * Navega Discovery a la pantalla 'success' vía nucleus synapse onboarding.
   * Landing ya está abierta desde _onGithubAuthComplete (ACCOUNT_REGISTERED).
   */
  async _onOnboardingSuccess() {
    this._log('_onOnboardingSuccess: todos los steps bloqueantes completos');

    // Notificar al renderer que el onboarding terminó
    this._emitMilestone('__onboarding_complete__', {});

    try {
      const data      = JSON.parse(fs.readFileSync(this._NUCLEUS_JSON, 'utf8'));
      const profileId = data.master_profile;
      if (!profileId) throw new Error('master_profile not found in nucleus.json');

      this._log(`_onOnboardingSuccess: nucleus synapse onboarding ${profileId} --step success`);
      await this._execNucleus(
        ['--json', 'synapse', 'onboarding', profileId, '--step', 'success'],
        15_000
      );
      this._log('_onOnboardingSuccess: ok');
    } catch (err) {
      // No-fatal: el renderer ya recibió __onboarding_complete__ por IPC
      this._logger.warn('[MilestoneReactor] _onOnboardingSuccess: nucleus call falló —', err.message);
    }
  }

  /**
   * Abre Landing en Chrome para el master profile.
   * Llamado desde _onGithubAuthComplete cuando el evento es ACCOUNT_REGISTERED.
   *
   * Comando: nucleus synapse launch <profileId> --mode landing
   * Es el único mecanismo del CLI para abrir una tab de Landing.
   * (nucleus synapse onboarding --step <screen> solo navega Discovery,
   * no abre una tab nueva.)
   */
  async _openLandingTab() {
    try {
      const data      = JSON.parse(fs.readFileSync(this._NUCLEUS_JSON, 'utf8'));
      const profileId = data.master_profile;
      if (!profileId) throw new Error('master_profile not found in nucleus.json');

      this._log(`_openLandingTab: nucleus synapse launch ${profileId} --mode landing`);
      await this._execNucleus(
        ['--json', 'synapse', 'launch', profileId, '--mode', 'landing'],
        15_000
      );
      this._log('_openLandingTab: landing lanzada ok');
    } catch (err) {
      // No-fatal: el usuario puede abrir Landing manualmente si este comando falla.
      this._logger.warn('[MilestoneReactor] _openLandingTab falló —', err.message);
    }
  }

  // ── Helpers IPC ──────────────────────────────────────────────────────────────

  /**
   * Emite milestone:reached al renderer vía webContents.send().
   * Coincide con el listener registrado en preload_onboarding.js (onMilestone).
   */
  _emitMilestone(stepId, extra = {}) {
    const payload = { stepId, ...extra, _ts: Date.now() };
    this._log(`emit ${MILESTONE_IPC_CHANNEL}:`, JSON.stringify(payload));
    try {
      const win = this._getWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send(MILESTONE_IPC_CHANNEL, payload);
      }
    } catch (e) {
      this._log('_emitMilestone: ventana destruida — ignorando');
    }
  }

  /**
   * Emite onboarding:step-ui-update al renderer para actualizaciones granulares de UI.
   * Coincide con el listener registrado en preload_onboarding.js (onStepUpdate).
   */
  _emitStepUiUpdate(stepId, update = {}) {
    const payload = { stepId, ...update, _ts: Date.now() };
    this._log(`emit ${STEP_UPDATE_IPC_CHANNEL}:`, JSON.stringify(payload));
    try {
      const win = this._getWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send(STEP_UPDATE_IPC_CHANNEL, payload);
      }
    } catch (e) {
      this._log('_emitStepUiUpdate: ventana destruida — ignorando');
    }
  }

  // ── Persistencia ─────────────────────────────────────────────────────────────

  /**
   * Persiste un step en onboarding.completed_steps[] de nucleus.json.
   * Idempotente en disco — no duplica si ya existe.
   */
  async _persistStepComplete(stepId) {
    try {
      const data = JSON.parse(fs.readFileSync(this._NUCLEUS_JSON, 'utf8'));
      data.onboarding = data.onboarding || {};
      data.onboarding.completed_steps = data.onboarding.completed_steps || [];

      if (!data.onboarding.completed_steps.includes(stepId)) {
        data.onboarding.completed_steps.push(stepId);
        data.onboarding.updated_at = new Date().toISOString();
        fs.writeFileSync(this._NUCLEUS_JSON, JSON.stringify(data, null, 2));
        this._log(`_persistStepComplete: "${stepId}" escrito en nucleus.json`);
      } else {
        this._log(`_persistStepComplete: "${stepId}" ya estaba en completed_steps`);
      }
    } catch (e) {
      this._logger.error(`[MilestoneReactor] _persistStepComplete("${stepId}") falló:`, e.message);
    }
  }

  // ── Logger ───────────────────────────────────────────────────────────────────

  // IMPORTANTE (Bug 4): usar this._logger, no console.log directo. El logger
  // custom del Conductor (getLogger) intercepta sus propios métodos .info/
  // .warn/.error para escribir al archivo de log de la sesión (ver formato
  // "[INFO] [ONBOARDING] ..." en conductor_onboarding_*.log). console.log
  // crudo va a stdout/devtools pero nunca llega a ese archivo — por eso
  // nunca aparecía ninguna línea "[MilestoneReactor]" en los logs pese a que
  // verbose:true se pasaba correctamente desde main_conductor.js.
  _log(...args) {
    if (this._verbose) this._logger.info('[MilestoneReactor]', ...args);
  }
}

module.exports = { MilestoneReactor, MILESTONE_IPC_CHANNEL, STEP_UPDATE_IPC_CHANNEL };
