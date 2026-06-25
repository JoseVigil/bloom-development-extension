'use strict';

/**
 * conductor/onboarding/milestone-registry.js
 *
 * Fuente de verdad en runtime de los steps del onboarding.
 * Lee onboarding_steps.json del disco (BloomRoot/config/onboarding/) y
 * cae a una constante hardcoded si el archivo no existe todavía.
 *
 * El hardcode es idéntico al JSON canónico del repo —
 * cualquier divergencia entre ambos es un bug de sincronización.
 *
 * Responsabilidades:
 *   1. Cargar los steps al arrancar (loadSteps)
 *   2. Resolver nombre de evento Cortex → stepId  (resolveEvent)
 *   3. Exponer la lista de steps para el MilestoneReactor
 *   4. Extender ONBOARDING_EVENTS en runtime con eventos declarados en el JSON
 *
 * Uso:
 *   const registry = new MilestoneRegistry({ bloomRoot, ONBOARDING_EVENTS });
 *   registry.loadSteps();                       // llamar una vez al arrancar
 *   const stepId = registry.resolveEvent('GITHUB_TOKEN_STORED'); // → 'github_auth'
 *   const steps  = registry.steps;              // array completo
 *
 * REQUERIMIENTO PENDIENTE (Cambio 2 de 8):
 *   El setup debe copiar onboarding_steps.json a
 *   <BloomRoot>/config/onboarding/onboarding_steps.json durante la instalación.
 *   Hasta que ese deploy exista, este módulo usa el fallback hardcoded.
 */

const fs   = require('fs');
const path = require('path');

// ─── Fallback hardcoded ───────────────────────────────────────────────────────
//
// Fuente: bloom-development-extension/installer/native/config/onboarding/onboarding_steps.json
// Sincronizar manualmente si se agregan steps nuevos al JSON canónico.
//
// Cada step tiene:
//   id              — identificador canónico (string, coincide con ONBOARDING_STEP_IDS)
//   label           — texto para la UI
//   screen          — pantalla del stepper que corresponde al step
//   vault_required  — si el vault debe estar inicializado para llegar aquí
//   requires        — lista de produces de steps previos que deben existir
//   produces        — artefacto que este step genera
//   blocking        — si este step debe completar antes de llamar _onOnboardingSuccess()
//   cortex_events   — lista de eventos Brain/Cortex que confirman este step
//   conductor_reaction — acción que el MilestoneReactor debe ejecutar al completar
//
const FALLBACK_STEPS = [
  {
    id:                 'nucleus_create',
    label:              'Configurar workspace',
    screen:             'nucleus-create',
    vault_required:     false,
    requires:           [],
    produces:           'nucleus_path',
    blocking:           true,
    cortex_events:      [],             // iniciado por Conductor, no por Brain
    conductor_reaction: 'markStepComplete',
  },
  {
    id:                 'github_auth',
    label:              'Conectar GitHub',
    screen:             'github-login',
    vault_required:     false,
    requires:           ['nucleus_path'],
    produces:           'github_token',
    blocking:           true,
    cortex_events:      ['GITHUB_PAT_DETECTED', 'GITHUB_TOKEN_STORED', 'ACCOUNT_REGISTERED'],
    conductor_reaction: 'markStepComplete',
  },
  {
    id:                 'vault_init',
    label:              'Inicializar Vault',
    screen:             'vault-init',
    vault_required:     false,
    requires:           ['github_token', 'nucleus_path'],
    produces:           'vault_initialized',
    blocking:           true,
    cortex_events:      ['VAULT_INITIALIZED', 'VAULT_INIT'],
    conductor_reaction: 'markStepComplete',
  },
  {
    id:                 'google_auth',
    label:              'Conectar Google',
    screen:             'google-login',
    vault_required:     true,
    requires:           ['vault_initialized'],
    produces:           'google_account',
    blocking:           false,
    cortex_events:      ['GOOGLE_AUTH_COMPLETE'],
    conductor_reaction: 'markStepComplete',
  },
  {
    id:                 'ai_provider_setup',
    label:              'Configurar proveedor de IA',
    screen:             'provider-select',
    vault_required:     true,
    requires:           ['vault_initialized'],
    produces:           'ai_provider_key',
    blocking:           false,
    cortex_events:      ['AI_PROVIDER_CONFIGURED'],
    conductor_reaction: 'markStepComplete',
  },
  {
    id:                 'project_create',
    label:              'Crear proyecto',
    screen:             'project-create',
    vault_required:     true,
    requires:           ['vault_initialized', 'github_token'],
    produces:           'project_mandate',
    blocking:           true,
    cortex_events:      ['PROJECT_CREATED', 'DISCOVERY_COMPLETE'],
    conductor_reaction: 'onOnboardingSuccess',
  },
];

// ─── MilestoneRegistry ────────────────────────────────────────────────────────

class MilestoneRegistry {
  /**
   * @param {object}  opts
   * @param {string}  opts.bloomRoot         Path al BloomRoot de la plataforma actual
   * @param {Set}     opts.ONBOARDING_EVENTS Set exportado por synapse-bridge.js
   *                                         Se extiende en runtime con los cortex_events del JSON
   */
  constructor({ bloomRoot, ONBOARDING_EVENTS }) {
    this._bloomRoot        = bloomRoot;
    this._ONBOARDING_EVENTS = ONBOARDING_EVENTS;
    this._steps            = [];
    this._eventToStepId    = new Map();  // 'GITHUB_TOKEN_STORED' → 'github_auth'
    this._loaded           = false;
  }

  // ── API pública ─────────────────────────────────────────────────────────────

  /**
   * Carga los steps desde disco o cae al fallback hardcoded.
   * Llamar una vez al arrancar, antes de registrar handlers.
   * Sincrónico — el archivo es pequeño (<2 KB) y se lee una sola vez.
   *
   * @returns {this}
   */
  loadSteps() {
    const diskPath = path.join(
      this._bloomRoot,
      'config', 'onboarding', 'onboarding_steps.json'
    );

    let raw = null;
    try {
      raw = JSON.parse(fs.readFileSync(diskPath, 'utf8'));
      console.log('[MilestoneRegistry] steps cargados desde disco:', diskPath);
    } catch (e) {
      const reason = e.code === 'ENOENT'
        ? 'archivo no encontrado (setup no deployó el JSON todavía)'
        : e.message;
      console.warn(`[MilestoneRegistry] fallback a constante hardcoded — ${reason}`);
    }

    // Usar los steps del disco si el JSON tiene el campo "steps"; si no, hardcode.
    const steps = raw?.steps ?? FALLBACK_STEPS;

    // Validar que cada step tiene los campos mínimos necesarios
    this._steps = steps.map(step => this._normalizeStep(step));

    // Construir mapa inverso: evento Cortex → stepId
    this._eventToStepId.clear();
    for (const step of this._steps) {
      for (const ev of (step.cortex_events || [])) {
        const key = ev.toUpperCase();
        if (this._eventToStepId.has(key)) {
          console.warn(
            `[MilestoneRegistry] evento duplicado "${key}" en steps "${this._eventToStepId.get(key)}" y "${step.id}" — se usa el primero`
          );
        } else {
          this._eventToStepId.set(key, step.id);
        }
      }
    }

    // Extender ONBOARDING_EVENTS con cualquier evento declarado en el JSON
    // que no estuviera ya en el Set del bridge.
    let extended = 0;
    for (const [ev] of this._eventToStepId) {
      if (!this._ONBOARDING_EVENTS.has(ev)) {
        this._ONBOARDING_EVENTS.add(ev);
        extended++;
      }
    }
    if (extended > 0) {
      console.log(`[MilestoneRegistry] ONBOARDING_EVENTS extendido con ${extended} evento(s) del JSON`);
    }

    this._loaded = true;
    console.log(
      `[MilestoneRegistry] ${this._steps.length} steps cargados, ` +
      `${this._eventToStepId.size} eventos mapeados`
    );
    return this;
  }

  /**
   * Resuelve un nombre de evento Cortex al stepId correspondiente.
   *
   * @param {string} cortexEvent  Ej: 'GITHUB_TOKEN_STORED'
   * @returns {string|null}       Ej: 'github_auth', o null si no hay mapeo
   */
  resolveEvent(cortexEvent) {
    if (!cortexEvent) return null;
    return this._eventToStepId.get(cortexEvent.toUpperCase()) ?? null;
  }

  /**
   * Devuelve el step con el id dado, o null si no existe.
   *
   * @param {string} stepId
   * @returns {object|null}
   */
  getStep(stepId) {
    return this._steps.find(s => s.id === stepId) ?? null;
  }

  /**
   * Lista de steps en orden de onboarding_steps.json.
   * @returns {object[]}
   */
  get steps() {
    return this._steps;
  }

  /**
   * Lista de steps con blocking: true — estos deben completar antes de
   * que MilestoneReactor llame _onOnboardingSuccess().
   * @returns {object[]}
   */
  get blockingSteps() {
    return this._steps.filter(s => s.blocking);
  }

  /**
   * true si loadSteps() se llamó exitosamente.
   * @returns {boolean}
   */
  get isLoaded() {
    return this._loaded;
  }

  // ── Internals ────────────────────────────────────────────────────────────────

  /**
   * Normaliza un step del JSON asegurando que tiene los campos mínimos.
   * Los campos de runtime (blocking, cortex_events, conductor_reaction) tienen
   * defaults seguros si el JSON viene del disco sin ellos (compatibilidad futura).
   */
  _normalizeStep(raw) {
    return {
      id:                 raw.id                 ?? '',
      label:              raw.label              ?? raw.id ?? '',
      screen:             raw.screen             ?? '',
      vault_required:     raw.vault_required     ?? false,
      requires:           raw.requires           ?? [],
      produces:           raw.produces           ?? '',
      blocking:           raw.blocking           ?? false,
      cortex_events:      raw.cortex_events      ?? [],
      conductor_reaction: raw.conductor_reaction ?? 'markStepComplete',
    };
  }
}

module.exports = { MilestoneRegistry, FALLBACK_STEPS };
