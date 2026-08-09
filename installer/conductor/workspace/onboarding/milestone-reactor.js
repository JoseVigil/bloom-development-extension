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

    // FIX (auditoría Synapse v3, §2 — bug crítico "allBlockingDone"):
    // Set separado, indexado SOLO por stepId (nunca "stepId:event"), que
    // refleja "este step ya completó" sin importar cuántos eventos internos
    // lo compusieron. _processed no sirve para esto porque sus claves son
    // compuestas ("stepId:event") por diseño — ver comentario en
    // handleMilestone(). blockingSteps.every() debe evaluar contra este Set,
    // nunca contra _processed directamente.
    this._completedSteps = new Set();

    // Set separado para dedupe de EMISIÓN al renderer (Bug 3).
    // _processed usa clave "stepId:event" porque github_auth necesita procesar
    // varios eventos del mismo step (ACCOUNT_REGISTERED abre Landing,
    // GITHUB_TOKEN_STORED no). Pero eso permite que ambos eventos lleguen a
    // _emitMilestone/_emitStepUiUpdate y el renderer vea el milestone dos veces.
    // _emitted usa clave solo "stepId" — el renderer se notifica una única vez
    // por step, sin importar cuántos eventos internos lo compongan.
    this._emitted = new Set();

    // Mapa de stepId → handler. Permite extensión sin tocar el switch.
    //
    // FIX (auditoría 16/07/2026, Bug #5): la key era 'github_auth' (stepId
    // PAT retirado). MilestoneRegistry resuelve GITHUB_APP_AUTHORIZED al
    // stepId real 'github_app_auth', que nunca matcheaba esta key — el
    // evento caía siempre en _defaultReaction() genérico, y
    // _onGithubAuthComplete() (con la lógica de abrir Landing y de incluir
    // username/org en el milestone) quedaba muerto en la práctica.
    this._handlers = {
      github_app_auth:   (enriched) => this._onGithubAuthComplete(enriched),
      nucleus_create:    (enriched) => this._onNucleusCreateComplete(enriched),
      vault_init:        (enriched) => this._onVaultInitComplete(enriched),
      google_auth:       (enriched) => this._onGoogleAuthComplete(enriched),
      ai_provider_setup: (enriched) => this._onAiProviderSetupComplete(enriched),
      project_select:    (enriched) => this._onProjectSelectComplete(enriched),
      mandate_genesis:   (enriched) => this._onMandateGenesisComplete(enriched),
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
      // FIX (auditoría Synapse v3, §2): nucleus.json guarda stepIds pelados
      // ("vault_init", no "vault_init:VAULT_INITIALIZED"). Antes esto se
      // agregaba a _processed, mezclando formato de clave con el compuesto
      // que usa handleMilestone() en la sesión activa — lo cual además
      // rompía silenciosamente el chequeo de allBlockingDone. Ahora va a
      // _completedSteps, que es exactamente el Set bare-stepId que ese
      // chequeo necesita. _processed queda intacto para su único propósito:
      // dedupe por evento dentro de la sesión activa.
      for (const stepId of completed) {
        this._completedSteps.add(stepId);
      }
      this._log(`rehydrateFromDisk: ${this._completedSteps.size} steps ya completados`);
    } catch (e) {
      this._log(`rehydrateFromDisk: no se pudo leer nucleus.json — ${e.message}`);
    }
  }

  // ── Handlers por step ───────────────────────────────────────────────────────

  // FIX (auditoría 16/07/2026, Bug #5): parametrizado por stepId en vez de
  // hardcodear 'github_auth' — así, si el id vuelve a cambiar en el futuro,
  // alcanza con actualizar la key del mapa _handlers de arriba y este
  // método sigue funcionando sin tocarlo.
  async _onGithubAuthComplete(enriched, stepId = 'github_app_auth') {
    this._log(`_onGithubAuthComplete (evento: ${enriched.event || 'n/a'})`);
    await this._persistStepComplete(stepId, this._registry.getStep(stepId));

    // Bug 3 fix: github_app_auth puede recibir varios eventos Cortex
    // distintos (ACCOUNT_REGISTERED, GITHUB_TOKEN_STORED, GITHUB_PAT_DETECTED...)
    // y el guard de handleMilestone() los deja pasar a todos a propósito,
    // porque cada uno puede requerir una reacción distinta (ver
    // _openLandingTab más abajo). Pero la notificación al renderer
    // (milestone:reached / step-ui-update) debe emitirse una sola vez por
    // step, no una vez por evento interno — de lo contrario el stepper
    // recibe el mismo milestone duplicado en el mismo segundo. Se dedupea
    // por stepId solamente.
    if (!this._emitted.has(stepId)) {
      this._emitted.add(stepId);
      this._emitMilestone(stepId, {
        username: enriched.data?.username || null,
        org:      enriched.data?.org      || null,
      });
      this._emitStepUiUpdate(stepId, { phase: 'ESTABLISHED' });
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

    // FIX (gap confirmado leyendo create.go/ownership.go/onboarding-handlers.js
    // completos): nada en el pipeline invocaba nunca "nucleus init --github-id
    // <handle> --master", pese a que create.go documenta ese paso como parte
    // de la secuencia post-create y ownership.go lo implementa. Resultado
    // verificado contra un nucleus.json real con onboarding.completed:true:
    // .ownership.json nunca se genera.
    //
    // Se engancha acá (no en poll-identity) porque este es el único lugar
    // donde ya llega enriched.data con contexto real del evento de Brain
    // (username), en vez de tener que re-leerlo de un campo de nucleus.json
    // que hoy no se escribe de forma confiable (ver _resolveGithubHandle).
    const handle = this._resolveGithubHandle(enriched);
    await this._initOwnership(handle);
  }

  // ── nucleus init --master ───────────────────────────────────────────────────

  /**
   * Resuelve el github handle a pasarle a --github-id.
   *
   * NO CONFIRMADO (ver HANDOFF-github-app-batcave-synapse.md / prompt de esta
   * sesión, punto 1): no hay evidencia en el código auditado de que Brain
   * escriba el username en algún campo de nucleus.json al procesar
   * GITHUB_APP_AUTHORIZED, ni de que enriched.data.username venga poblado en
   * ese evento real (solo se confirmó el shape para ACCOUNT_REGISTERED en
   * comentarios existentes, no se confirmó contra Brain). Se intenta, en
   * orden:
   *   1. enriched.data.username — si Brain lo manda en el payload del evento.
   *   2. onboarding.github_username en nucleus.json — si el renderer ya llamó
   *      a onboarding:persist-github-data para este perfil.
   * Si ninguno existe, devuelve null a propósito. _initOwnership() NO debe
   * inventar un fallback (ej. 'unknown', el nombre de la org) — un
   * --github-id incorrecto queda escrito en .ownership.json de forma
   * permanente (init rechaza correr dos veces, ver ownership.go), así que
   * un handle falso es peor que no correr el comando.
   */
  _resolveGithubHandle(enriched) {
    if (enriched?.data?.username) return enriched.data.username;
    try {
      const data = JSON.parse(fs.readFileSync(this._NUCLEUS_JSON, 'utf8'));
      return data.onboarding?.github_username || null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Resuelve el workspace path a usar como `cwd` del subprocess "nucleus".
   *
   * FIX (causa raíz del incidente ".ownership.json no se crea" — auditoría
   * 2026-08-09): este método no existía. _initOwnership() spawneaba
   * "nucleus init" sin tercer argumento de opciones — a diferencia de
   * onboarding:init-nucleus (onboarding-handlers.js), que sí pasa
   * { cwd: workspacePath } por el mismo bug ya documentado y corregido ahí
   * ("sin cwd, nucleus arranca desde el directorio de la app y busca
   * .bloom subiendo desde ahí"). Confirmado además del lado Go: sin cwd
   * explícito, el proceso hijo hereda el cwd del Conductor, y
   * core.ResolveNucleusRoot() (org_context.go) escanea hacia arriba desde
   * el cwd del proceso — nunca sube desde el workspace real, así que el
   * scan de ".bloom/.nucleus-{org}/" siempre falla ahí, GetOwnershipPath()
   * devuelve error, y "nucleus init" sale con exit 1 imprimiendo
   * "Error: no active organization: ..." — mensaje real, pero a stdout,
   * que _execNucleus no capturaba en el log de error (ver fix de logging
   * más abajo en _initOwnership).
   *
   * SCHEMA CONFIRMADO (contra nucleus.json real, corrida 2026-08-09 —
   * corrige un intento anterior de este mismo fix que adivinó mal el
   * shape): onboarding-handlers.js persiste el workspace vía
   * getOrCreateOrg(data.onboarding, orgSlug, { workspacePath }) en
   * shared/onboarding-schema.js, que escribe:
   *
   *   data.onboarding.organizations = [
   *     { org_slug: "elias-repos", workspace_path: "/path/to/ws", ... }
   *   ]
   *   data.onboarding.active_org_slug = "elias-repos"
   *
   * NO es data.organizations (raíz) ni projects[].path (ese array es para
   * proyectos vinculados dentro de la org, no el workspace en sí) ni se
   * matchea por master_profile (ese es el profile de Chrome/Synapse, no
   * tiene relación con el org slug). Se matchea por org_slug ===
   * active_org_slug.
   */
  _resolveWorkspacePath() {
    try {
      const data = JSON.parse(fs.readFileSync(this._NUCLEUS_JSON, 'utf8'));

      const orgs = data.onboarding?.organizations;
      if (Array.isArray(orgs) && orgs.length > 0) {
        const activeSlug = data.onboarding?.active_org_slug;
        const org = orgs.find(o => o?.org_slug === activeSlug) || orgs[orgs.length - 1];
        if (org?.workspace_path) return org.workspace_path;
      }
    } catch (e) {
      this._log(`_resolveWorkspacePath: no se pudo leer nucleus.json — ${e.message}`);
    }
    return null;
  }

  /**
   * Invoca "nucleus init --github-id <handle> --master", mismo patrón de
   * subprocess que ya usa onboarding:init-nucleus para "nucleus create"
   * (spawn vía execNucleus inyectado, no acceso directo al binario acá).
   *
   * Guardas:
   *   - No corre si no hay handle real (ver _resolveGithubHandle).
   *   - Guard cross-path contra doble-spawn: poll-identity (onboarding-
   *     handlers.js) puede completar github_app_auth por la vía de backfill,
   *     que reusa handleMilestone() y por lo tanto termina llamando acá
   *     también — onboarding.ownership_init_status en nucleus.json es la
   *     fuente de verdad compartida entre ambos call sites (in-memory por sí
   *     solo no alcanza: son procesos/paths de código distintos que pueden
   *     ejecutarse en el mismo tick de Electron main).
   *   - No hay rollback de completed_steps si esto falla: github_app_auth ya
   *     representa un hecho real y verdadero (el Device Flow completó, el
   *     token es válido) — revertirlo sería incorrecto. Solo se deja
   *     ownership_init_status:'failed', visible en logs y en nucleus.json,
   *     para que sea reintentable en el futuro en vez de silenciarse.
   */
  async _initOwnership(githubHandle) {
    if (!githubHandle) {
      this._logger.warn(
        '[MilestoneReactor] _initOwnership: sin github handle disponible ' +
        '(ni enriched.data.username ni onboarding.github_username) — no se ' +
        'invoca "nucleus init --master" para evitar escribir un --github-id ' +
        'inventado en .ownership.json. Pendiente: confirmar si Brain escribe ' +
        'el username al procesar GITHUB_APP_AUTHORIZED.'
      );
      return;
    }

    try {
      const data = JSON.parse(fs.readFileSync(this._NUCLEUS_JSON, 'utf8'));
      data.onboarding = data.onboarding || {};
      const status = data.onboarding.ownership_init_status;
      if (status === 'done' || status === 'in_progress') {
        this._log(`_initOwnership: status ya es "${status}" — no se reinvoca`);
        return;
      }
      data.onboarding.ownership_init_status = 'in_progress';
      data.onboarding.updated_at = new Date().toISOString();
      fs.writeFileSync(this._NUCLEUS_JSON, JSON.stringify(data, null, 2));
    } catch (e) {
      this._logger.warn('[MilestoneReactor] _initOwnership: no se pudo leer/escribir el guard de estado —', e.message);
      return;
    }

    // FIX (causa raíz confirmada — ver _resolveWorkspacePath arriba): sin
    // cwd, este spawn heredaba el directorio del proceso Conductor, no el
    // del workspace real, y "nucleus init" fallaba siempre con "no active
    // organization" al no encontrar ".bloom/.nucleus-{org}/" subiendo desde
    // ahí. Si no logramos resolver el workspace path, preferimos todavía
    // intentar sin cwd (mismo comportamiento previo) antes que no correr
    // el comando — el guard de _resolveGithubHandle ya cubre el caso "no
    // corras con datos inventados"; acá el handle sí es real, solo puede
    // faltar el cwd.
    const workspacePath = this._resolveWorkspacePath();
    if (!workspacePath) {
      this._log('_initOwnership: no se pudo resolver workspace_path — se invoca sin cwd explícito (puede fallar por resolución de org, ver ResolveNucleusRoot en org_context.go)');
    }

    this._log(`_initOwnership: nucleus init --github-id ${githubHandle} --master` +
      (workspacePath ? ` (cwd: ${workspacePath})` : ''));
    try {
      await this._execNucleus(
        ['--json', 'init', '--github-id', githubHandle, '--master'],
        15_000,
        workspacePath ? { cwd: workspacePath } : undefined
      );
      this._log('_initOwnership: ok — .ownership.json creado');
      this._setOwnershipStatus('done');
    } catch (err) {
      // ownership.go: init sobre un registro ya existente imprime "Organization
      // already initialized" y sale con exit 1 — no es una falla real, es la
      // idempotencia esperada si esto ya corrió (ej. en una sesión anterior,
      // o vía el otro call site en poll-identity).
      //
      // FIX (logging — mismo incidente, parte 2): el bug real no estaba acá,
      // estaba en execNucleus (main_conductor.js): stdout se capturaba pero
      // nunca se adjuntaba al Error rechazado cuando exit != 0 y stdout no
      // era JSON — exactamente el caso de ownership.go, que imprime su
      // mensaje de error a stdout, no a stderr, antes de os.Exit(1). Con
      // execNucleus corregido, err.message ya incluye el stdout capturado
      // (ver "| stdout: ..." en el mensaje) — no hace falta reconstruirlo
      // acá. err.stdout/err.stderr quedan disponibles como propiedades
      // estructuradas por si algún caller las necesita por separado.
      if (/already initialized/i.test(err.message || '')) {
        this._log('_initOwnership: ya estaba inicializado (idempotente) — ok');
        this._setOwnershipStatus('done');
        return;
      }
      this._logger.error('[MilestoneReactor] _initOwnership FALLÓ:', err.message || '(sin mensaje)');
      this._setOwnershipStatus('failed');
    }
  }

  _setOwnershipStatus(status) {
    try {
      const data = JSON.parse(fs.readFileSync(this._NUCLEUS_JSON, 'utf8'));
      data.onboarding = data.onboarding || {};
      data.onboarding.ownership_init_status = status;
      data.onboarding.updated_at = new Date().toISOString();
      fs.writeFileSync(this._NUCLEUS_JSON, JSON.stringify(data, null, 2));
    } catch (e) {
      this._logger.warn('[MilestoneReactor] _setOwnershipStatus: no se pudo persistir —', e.message);
    }
  }

  async _onNucleusCreateComplete(enriched) {
    this._log('_onNucleusCreateComplete');
    await this._persistStepComplete('nucleus_create', this._registry.getStep('nucleus_create'));
    this._emitMilestone('nucleus_create', {});
    this._emitStepUiUpdate('nucleus_create', { phase: 'ESTABLISHED' });
  }

  async _onVaultInitComplete(enriched) {
    this._log('_onVaultInitComplete');
    await this._persistStepComplete('vault_init', this._registry.getStep('vault_init'));
    this._emitMilestone('vault_init', {});
    this._emitStepUiUpdate('vault_init', { phase: 'ESTABLISHED' });
  }

  async _onGoogleAuthComplete(enriched) {
    // FIX (auditoría 19/07/2026, sesión de noche): GOOGLE_LOGIN_DETECTED es un
    // evento precursor, no la finalización del step — Cortex detectó la sesión
    // de Google pero todavía no confirmó el registro de la cuenta (eso lo hace
    // ACCOUNT_REGISTERED:google, más abajo). Reaccionar solo con feedback de UI:
    // no persistir en nucleus.json, no emitir milestone:reached. Mismo patrón de
    // dispatch-por-evento que ya usa _onGithubAuthComplete para distinguir
    // ACCOUNT_REGISTERED de sus eventos secundarios.
    if (enriched.event === 'GOOGLE_LOGIN_DETECTED') {
      this._log('_onGoogleAuthComplete: GOOGLE_LOGIN_DETECTED (precursor, sin persistir)');
      this._emitStepUiUpdate('google_auth', { phase: 'LOGIN_DETECTED' });
      return;
    }

    this._log('_onGoogleAuthComplete');
    await this._persistStepComplete('google_auth', this._registry.getStep('google_auth'));
    this._emitMilestone('google_auth', {
      email: enriched.data?.email || null,
    });
    this._emitStepUiUpdate('google_auth', { phase: 'ESTABLISHED' });
  }

  async _onAiProviderSetupComplete(enriched) {
    this._log('_onAiProviderSetupComplete');
    await this._persistStepComplete('ai_provider_setup', this._registry.getStep('ai_provider_setup'));
    this._emitMilestone('ai_provider_setup', {
      provider: enriched.data?.provider || null,
    });
    this._emitStepUiUpdate('ai_provider_setup', { phase: 'ESTABLISHED' });
  }

  async _onProjectSelectComplete(enriched) {
    this._log(`_onProjectSelectComplete (evento: ${enriched.event || 'n/a'})`);

    // FIX (auditoría Synapse v3, §2 — bug medio "DISCOVERY_COMPLETE cierra
    // project_select antes de tiempo"): discovery.js emite DISCOVERY_COMPLETE
    // apenas el handshake inicial (ping/pong) tiene éxito, ANTES de que
    // arranque cualquier step real del onboarding. Pero project_select lo
    // tiene listado en cortex_events junto a PROJECT_CREATED (semántica OR
    // del registry), así que sin discriminar, este handler completaba
    // project_select con solo el handshake, no con el proyecto real elegido.
    // Igual que _onGithubAuthComplete discrimina ACCOUNT_REGISTERED del
    // resto de eventos de github_auth, acá discriminamos PROJECT_CREATED
    // del resto: solo PROJECT_CREATED representa la finalización real de
    // este step. DISCOVERY_COMPLETE ya cumplió su propósito en otro punto
    // del flujo (confirmar el handshake) -- no le corresponde completar
    // project_select, así que se ignora acá sin persistir ni emitir nada.
    if (enriched.event && enriched.event !== 'PROJECT_CREATED') {
      this._log(`_onProjectSelectComplete: evento "${enriched.event}" no completa project_select -- ignorando`);
      return;
    }

    await this._persistStepComplete('project_select', this._registry.getStep('project_select'));
    this._emitMilestone('project_select', {
      project: enriched.data?.project || null,
    });
    this._emitStepUiUpdate('project_select', { phase: 'ESTABLISHED' });
  }

  async _onMandateGenesisComplete(enriched) {
    await this._persistStepComplete('mandate_genesis', this._registry.getStep('mandate_genesis'));
    this._emitMilestone('mandate_genesis', {
      mandateId: enriched.data?.mandateId || null,
    });
    this._emitStepUiUpdate('mandate_genesis', { phase: 'ESTABLISHED' });

    // Verificar si todos los steps bloqueantes están completos.
    // FIX (auditoría Synapse v3, §2): antes comparaba contra _processed, cuyas
    // claves son compuestas ("stepId:event") y nunca matchean un s.id pelado
    // — allBlockingDone daba false siempre. Ahora compara contra
    // _completedSteps, que sí es bare-stepId.
    const allBlockingDone = this._registry.blockingSteps.every(
      s => this._completedSteps.has(s.id)
    );

    if (allBlockingDone) {
      await this._onOnboardingSuccess();
    }
  }

  // ── Reacción genérica ───────────────────────────────────────────────────────

  async _defaultReaction(stepId, enriched) {
    this._log(`_defaultReaction: "${stepId}"`);
    await this._persistStepComplete(stepId, this._registry.getStep(stepId));
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

  // FIX (auditoría multi-org, sesión de migración a organizations[]/projects[]):
  // estos son los `produces` de steps cuyo valor real YA NO vive en un campo
  // plano de la raíz de onboarding — viven anidados dentro de
  // organizations[]/projects[] (ver shared/onboarding-schema.js). El código
  // de más abajo persistía `data.onboarding[step.produces] = true` como
  // fallback cuando "el campo todavía no tiene un valor real", pero con el
  // esquema anidado ESE CAMPO PLANO NUNCA EXISTE — el chequeo `existing ===
  // undefined` siempre da true y el fallback pisaba (o creaba) un booleano
  // suelto en la raíz (ej. onboarding.project_name = true) que conviven con
  // el dato real dentro de organizations[]. Eso no rompe organizations[]
  // directamente, pero sí corrompe el resume: si el proyecto real todavía no
  // existe cuando esto corre, step-verifiers.js (vía
  // buildFlatOnboardingView) puede leer ese `true` residual como si el step
  // ya hubiera producido su artefacto, sin que exista ningún proyecto real.
  // Mismo tipo de riesgo que ya está documentado y mitigado para
  // 'nucleus_create' en FS_MARKER_STEPS (ipc/onboarding-handlers.js) — acá
  // aplicamos el mismo principio: para estos produces, NUNCA escribir el
  // fallback `true`. El valor real ya lo persiste el handler IPC específico
  // (onboarding:init-nucleus, onboarding:use-existing-workspace,
  // onboarding:select-project, onboarding:import-project,
  // onboarding:create-mandate) ANTES de que el milestone llegue acá — si por
  // algún motivo no lo hizo, es preferible que el step quede "no producido"
  // (resume se queda ahí, recuperable) a que quede falsamente "producido"
  // (resume avanza sobre un dato que no existe, silencioso y difícil de
  // diagnosticar).
  static NESTED_PRODUCES_FIELDS = new Set([
    'workspace_path', 'workspace_org',
    'project_path', 'project_name',
    'genesis_mandate_id',
  ]);

  /**
   * Persiste un step en onboarding.completed_steps[] de nucleus.json.
   * Idempotente en disco — no duplica si ya existe.
   */
  async _persistStepComplete(stepId, step = null) {
    // FIX (auditoría Synapse v3, §2): registrar acá, no en el caller, para
    // que _completedSteps quede correcto sin importar qué handler llame a
    // este método (todos pasan por acá) y sin duplicar esta línea en cada
    // uno de los seis handlers de arriba.
    this._completedSteps.add(stepId);
    try {
      const data = JSON.parse(fs.readFileSync(this._NUCLEUS_JSON, 'utf8'));
      data.onboarding = data.onboarding || {};
      data.onboarding.completed_steps = data.onboarding.completed_steps || [];

      if (!data.onboarding.completed_steps.includes(stepId)) {
        data.onboarding.completed_steps.push(stepId);
        // Requerimiento 1 (resume inteligente): además del flag en completed_steps,
        // persistir el artefacto real bajo su nombre `produces`, para que
        // step-verifiers.js pueda confirmarlo sin depender de un puntero a "último paso".
        //
        // FIX (corrupción de artefactos fs_marker): esto NO debe pisar con un
        // booleano un valor ya escrito por otro handler más específico. Steps
        // como nucleus_create producen "workspace_path", que onboarding:init-nucleus
        // (ipc/onboarding-handlers.js) ya persiste como el path real ANTES de que
        // este método corra — sobreescribirlo acá con `true` rompe fs_marker
        // (necesita el path real para construir jsonField/dir) y resetea el resume
        // al primer step. Solo default a `true` si el campo todavía no tiene un
        // valor real (steps sin persistencia propia, ej: vault_initialized,
        // github_app_token, google_account, ai_provider_key).
        if (step?.produces) {
          if (MilestoneReactor.NESTED_PRODUCES_FIELDS.has(step.produces)) {
            // Ver comentario grande sobre NESTED_PRODUCES_FIELDS más arriba:
            // este produces vive en organizations[]/projects[], no en un
            // campo plano. El handler IPC específico ya lo persistió (o el
            // step no debería estar marcándose completo). No escribir nada
            // acá — ni el valor real (no sabríamos a qué org/proyecto
            // pertenece desde este método genérico) ni un `true` de relleno.
            this._log(`_persistStepComplete: "${step.produces}" es nested (organizations[]/projects[]) — no se toca desde acá`);
          } else {
            const existing = data.onboarding[step.produces];
            if (existing === undefined || existing === null || existing === false) {
              data.onboarding[step.produces] = true;
            } else {
              this._log(`_persistStepComplete: "${step.produces}" ya tiene valor real (${JSON.stringify(existing)}) — no se pisa`);
            }
          }
        }
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
