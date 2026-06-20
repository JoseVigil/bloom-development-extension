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
   */
  constructor({ registry, getWindow, execNucleus, NUCLEUS_JSON, verbose = false }) {
    this._registry    = registry;
    this._getWindow   = getWindow;
    this._execNucleus = execNucleus;
    this._NUCLEUS_JSON = NUCLEUS_JSON;
    this._verbose     = verbose;

    // Set de stepIds ya procesados en esta sesión — idempotencia en memoria.
    // Si el proceso reinicia, el estado persiste en nucleus.json.
    this._processed = new Set();

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

    // Idempotencia: no re-ejecutar si ya procesamos este step en la sesión actual.
    if (this._processed.has(stepId)) {
      this._log(`handleMilestone: "${stepId}" ya procesado — ignorando`);
      return;
    }

    const step = this._registry.getStep(stepId);
    if (!step) {
      this._log(`handleMilestone: stepId desconocido "${stepId}" — ignorando`);
      return;
    }

    this._log(`handleMilestone: "${stepId}" (evento: ${enriched.event || 'n/a'})`);
    this._processed.add(stepId);

    const handler = this._handlers[stepId];
    if (handler) {
      // Ejecutar de forma async, sin bloquear el caller
      Promise.resolve()
        .then(() => handler(enriched))
        .catch(err => console.error(`[MilestoneReactor] error en handler "${stepId}":`, err.message));
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
    this._log('_onGithubAuthComplete');
    await this._persistStepComplete('github_auth');
    this._emitMilestone('github_auth', {
      username: enriched.data?.username || null,
      org:      enriched.data?.org      || null,
    });
    this._emitStepUiUpdate('github_auth', { phase: 'ESTABLISHED' });
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
   * Navega el onboarding de Chrome a la pantalla 'success' vía nucleus CLI.
   *
   * NOTA (Incógnita 5 resuelta, 2026-06-20):
   *   nucleus synapse onboarding <profileId> --step <screen>
   *   envía una señal de navegación al onboarding de un perfil en ejecución.
   *   No es necesario abrir una tab nueva.
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
      this._log('_onOnboardingSuccess: nucleus synapse onboarding --step success ok');
    } catch (err) {
      // No-fatal: el renderer puede igual mostrar la pantalla de éxito
      // porque ya recibió el IPC milestone:reached para __onboarding_complete__
      console.warn('[MilestoneReactor] _onOnboardingSuccess: nucleus call falló —', err.message);
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
      console.error(`[MilestoneReactor] _persistStepComplete("${stepId}") falló:`, e.message);
    }
  }

  // ── Logger ───────────────────────────────────────────────────────────────────

  _log(...args) {
    if (this._verbose) console.log('[MilestoneReactor]', ...args);
  }
}

module.exports = { MilestoneReactor, MILESTONE_IPC_CHANNEL, STEP_UPDATE_IPC_CHANNEL };
