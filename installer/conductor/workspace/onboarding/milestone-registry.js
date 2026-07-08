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
    // FIX (auditoría Synapse v3, §2 — bug crítico google_auth/ACCOUNT_REGISTERED):
    // ACCOUNT_REGISTERED es un evento genérico compartido con google_auth,
    // discriminado por el campo "service" del payload (confirmado en
    // GithubAuthFlow._saveToken() / GoogleAuthFlow._confirmLogin() de
    // discovery.js). El sufijo ":github" le dice a loadSteps() que este
    // mapeo solo aplica cuando payload.service === 'github' — ver
    // resolveEvent() más abajo.
    cortex_events:      ['GITHUB_PAT_DETECTED', 'GITHUB_TOKEN_STORED', 'ACCOUNT_REGISTERED:github'],
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
    // FIX (auditoría Synapse v3, §2): GOOGLE_AUTH_COMPLETE nunca se
    // implementó (confirmado 💀 en el catálogo maestro, §3) — de facto fue
    // reemplazado por ACCOUNT_REGISTERED genérico sin migrar este mapeo,
    // que es la causa raíz del bug. Se retira el evento muerto y se agrega
    // el discriminado real. Si en algún momento aparece evidencia de que
    // GOOGLE_AUTH_COMPLETE sí se emite en algún lugar no auditado, se puede
    // sumar de nuevo sin sufijo.
    cortex_events:      ['ACCOUNT_REGISTERED:google'],
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
    //
    // FIX (auditoría Synapse v3, §2 — bug crítico google_auth/ACCOUNT_REGISTERED):
    // el mapa era plano por nombre de evento, así que un evento genérico
    // compartido por dos steps (ej. ACCOUNT_REGISTERED para github_auth y
    // google_auth) siempre resolvía al primero que se registraba, sin
    // importar el "service" real del payload. Ahora un cortex_event puede
    // declararse como "EVENTO:service" (ver FALLBACK_STEPS) para indicar que
    // necesita discriminación. En ese caso el valor guardado en
    // _eventToStepId no es un stepId (string) sino un Map<service, stepId>
    // — resolveEvent() distingue ambos casos en tiempo de lectura.
    this._eventToStepId.clear();
    for (const step of this._steps) {
      for (const rawEvent of (step.cortex_events || [])) {
        const [evName, service] = rawEvent.split(':');
        const key = evName.toUpperCase();

        if (service) {
          let bucket = this._eventToStepId.get(key);
          if (bucket instanceof Map) {
            // ya es un bucket discriminado — sumar este service
          } else if (bucket !== undefined) {
            // había un mapeo plano previo para esta misma clave — no debería
            // pasar si todos los steps que comparten el evento lo declaran
            // discriminado, pero no lo pisamos en silencio.
            console.warn(
              `[MilestoneRegistry] "${key}" ya estaba mapeado de forma plana a "${bucket}" — se ignora ese mapeo al agregar la variante discriminada "${key}:${service}" de "${step.id}". Revisar si el step "${bucket}" también necesita sufijo ":service".`
            );
            bucket = new Map();
            this._eventToStepId.set(key, bucket);
          } else {
            bucket = new Map();
            this._eventToStepId.set(key, bucket);
          }

          if (bucket.has(service)) {
            console.warn(
              `[MilestoneRegistry] evento duplicado "${key}:${service}" en steps "${bucket.get(service)}" y "${step.id}" — se usa el primero`
            );
          } else {
            bucket.set(service, step.id);
          }
        } else {
          const existing = this._eventToStepId.get(key);
          if (existing instanceof Map) {
            console.warn(
              `[MilestoneRegistry] "${key}" ya está registrado como evento discriminado por service — se ignora el registro plano de "${step.id}". Si "${step.id}" también necesita discriminarse, agregale el sufijo ":service" en su cortex_events.`
            );
          } else if (existing) {
            console.warn(
              `[MilestoneRegistry] evento duplicado "${key}" en steps "${existing}" y "${step.id}" — se usa el primero`
            );
          } else {
            this._eventToStepId.set(key, step.id);
          }
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
   * FIX (auditoría Synapse v3, §2): algunos eventos son genéricos y están
   * mapeados a más de un step, discriminados por el campo "service" del
   * payload (ver ACCOUNT_REGISTERED → github_auth | google_auth). Para esos
   * casos hay que pasar el payload/enriched del mensaje como segundo
   * argumento, o resolveEvent no puede saber a cuál de los dos steps
   * corresponde y devuelve null (con warning) en vez de adivinar.
   *
   * CALLERS: este cambio de firma requiere actualizar los dos lugares que
   * llaman a resolveEvent() — main_conductor.js y workspace-synapse-handlers.js
   * (lógica duplicada, ver auditoría §2 "medio") — para que pasen
   * `enriched.data ?? enriched` como segundo argumento. No tocado en este
   * pase porque esos archivos no están disponibles todavía en este chat.
   *
   * @param {string} cortexEvent  Ej: 'GITHUB_TOKEN_STORED' o 'ACCOUNT_REGISTERED'
   * @param {object} [payload]    El enriched/data del mensaje. Necesario solo
   *                              para eventos discriminados por service.
   * @returns {string|null}       Ej: 'github_auth', o null si no hay mapeo
   *                              (o si hacía falta "service" y no llegó).
   */
  resolveEvent(cortexEvent, payload = null) {
    if (!cortexEvent) return null;
    const key = cortexEvent.toUpperCase();
    const entry = this._eventToStepId.get(key);
    if (entry === undefined) return null;

    if (entry instanceof Map) {
      const service = payload?.service ?? payload?.data?.service ?? null;
      if (!service) {
        console.warn(
          `[MilestoneRegistry] resolveEvent: "${key}" requiere "service" en el payload para discriminar (candidatos: ${[...entry.keys()].join(', ')}) y no llegó ninguno — devolviendo null en vez de adivinar`
        );
        return null;
      }
      const stepId = entry.get(service) ?? null;
      if (!stepId) {
        console.warn(
          `[MilestoneRegistry] resolveEvent: "${key}:${service}" no tiene step mapeado (candidatos: ${[...entry.keys()].join(', ')})`
        );
      }
      return stepId;
    }

    return entry;
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
