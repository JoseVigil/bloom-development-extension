console.log('[ONBOARDING-HANDLERS BUILD] marker-vault-diag-v1 — archivo confirmado en runtime main process');

// workspace/onboarding/ipc/onboarding-handlers.js
// Handlers IPC exclusivos del módulo onboarding.
// Paso 1: github_app_auth — steps como strings, poll lee completed_steps[] de nucleus.json
'use strict';

const fs   = require('fs');
const path = require('path');
const { ipcMain, dialog, app } = require('electron');
const { spawn } = require('child_process');
const { getLogger } = require('../../../shared/logger');
const { paths } = require('../../../shared/global_paths');
const { migrateToNestedSchema, getActiveOrg, getOrCreateOrg, getOrCreateProject, getActiveProject } = require('../../../shared/onboarding-schema');

const log = getLogger('onboarding');

// ── Steps válidos — espejo del JSON canónico en config/onboarding/onboarding_steps.json
// No se hardcodean reglas aquí, solo los IDs para validación local.
// v3.0.0 (2026-07-10): 'github_auth' (PAT clásico) retirado y reemplazado por
// 'github_app_auth' (GitHub App / Device Flow). Ver onboarding_steps.json _changelog.
// v3.1.0 (2026-07-25): 'project_create' retirado, partido en 'project_select'
// (produces project_name) + 'mandate_genesis' (produces genesis_mandate_id) —
// ver MANDATE-STEP-IMPLEMENTATION-PROMPT.md.
const ONBOARDING_STEP_IDS = [
  'nucleus_create',
  'vault_init',
  'github_app_auth',
  'google_auth',
  'ai_provider_setup',
  'project_select',
  'mandate_genesis',
];

function registerOnboardingHandlers(execNucleus, NUCLEUS_JSON, getWindow, getReactor, getRegistry, createWorkspaceWindow) {
  const { resolveEntryPoint } = require('../resolution-engine');

  // ── HANDLER: Lanzar Discovery en modo registro ──────────────────────────
  // Paso 1: github_app_auth es el primer step de Chrome/Discovery
  // (nucleus_create y vault_init lo preceden pero no pasan por Chrome).
  // Se pasan --override-service y --override-step en el launch para que
  // background.js los reciba con valores válidos desde el primer mensaje
  // del Native Messaging host. Sin estos flags, el config llega con
  // service:"" y step:"", y la guarda github en background.js nunca dispara.
  // La llamada onboarding:navigate que sigue sigue siendo necesaria para
  // señalar a discovery.js que muestre la pantalla correcta.
  ipcMain.handle('onboarding:launch-discovery', async (event, { email }) => {
    log.info('[IPC] onboarding:launch-discovery — email:', email || '(none)');
    try {
      const nucleusData = JSON.parse(fs.readFileSync(NUCLEUS_JSON, 'utf8'));
      const profileId = nucleusData.master_profile;
      if (!profileId) throw new Error('master_profile not found');

      // Detectar si el perfil ya tiene una sesión activa en profiles.json.
      // Si status === 'open' y handshake_confirmed, el pre-flight de nucleus
      // detecta la sesión existente y devuelve success:false. En ese caso
      // usamos --skip-preflight para hacer re-attach a la sesión corriendo.
      let skipPreflight = false;
      try {
        const profilesPath = path.join(path.dirname(NUCLEUS_JSON), 'profiles.json');
        const profilesData = JSON.parse(fs.readFileSync(profilesPath, 'utf8'));
        const profile = (profilesData.profiles || []).find(p => p.id === profileId);
        if (profile?.runtime_state?.status === 'open' && profile?.runtime_state?.handshake_confirmed) {
          skipPreflight = true;
          log.info('[IPC] onboarding:launch-discovery — session already open, using --skip-preflight');
        }
      } catch (e) {
        log.warn('[IPC] onboarding:launch-discovery — could not read profiles.json:', e.message);
      }

      const args = [
        '--json', 'synapse', 'launch', profileId,
        '--mode', 'discovery',
        '--override-register',  'true',
        '--override-heartbeat', 'false',
        '--override-service',   'github',
        '--override-step',      'github_app_auth',
      ];
      if (skipPreflight) args.push('--skip-preflight');
      if (email) args.push('--override-email', email);

      const result = await execNucleus(args, 30000);
      log.success('[IPC] onboarding:launch-discovery — ok');
      return { success: result.success !== false, profileId, result };
    } catch (err) {
      log.error('[IPC] onboarding:launch-discovery — FAILED:', err.message);
      return { success: false, error: err.message };
    }
  });

  // ── HELPER: Poll hasta que el perfil esté conectado a Brain ────────────
  // launch-discovery retorna ok cuando Brain confirma el spawn de Chrome,
  // NO cuando Chrome completa el handshake de 3 fases y registra el host
  // en profile_registry. Hay que esperar ese registro antes de llamar
  // nucleus synapse onboarding, o Brain responde "Profile not connected"
  // y SendOnboardingNavigateActivity falla por timeout.
  // Ver BLOOM_ONBOARDING_WORKFLOW_SPEC_v2_0.md §2 prerequisito "Host conectado a Brain".
  async function waitForProfileConnected(profileId, { timeoutMs = 30_000, intervalMs = 1_500 } = {}) {
    const deadline = Date.now() + timeoutMs;
    log.info(`[IPC] waitForProfileConnected — polling profile ${profileId} (timeout: ${timeoutMs}ms)`);
    while (Date.now() < deadline) {
      try {
        const status = await execNucleus(
          ['--json', 'synapse', 'status', profileId],
          5_000
        );
        // La respuesta real anida el estado bajo "status": { state, sentinel_running, ... }
        // (ver types/orchestration.go ProfileStatus). "CONNECTED" no es un ProfileState
        // válido — el estado real una vez que Sentinel está arriba y mandando heartbeats
        // es "RUNNING". sentinel_running se chequea como señal de respaldo por si hay
        // un estado transitorio (ej. DEGRADED/RECOVERING) con el sentinel igual activo.
        const profileState = status?.status;
        if (profileState?.state === 'RUNNING' || profileState?.sentinel_running === true) {
          log.info(`[IPC] waitForProfileConnected — profile ${profileId} is connected`);
          return true;
        }
        log.info(`[IPC] waitForProfileConnected — not yet connected (state: ${profileState?.state ?? 'unknown'}, sentinel_running: ${profileState?.sentinel_running ?? 'unknown'}), retrying...`);
      } catch (e) {
        // Brain puede estar ocupado arrancando — reintentar silenciosamente
        log.info(`[IPC] waitForProfileConnected — status check failed (${e.message}), retrying...`);
      }
      await new Promise(r => setTimeout(r, intervalMs));
    }
    log.warn(`[IPC] waitForProfileConnected — timeout after ${timeoutMs}ms, profile ${profileId} never connected`);
    return false;
  }

  // ── HANDLER: Enviar step de onboarding a Chrome ─────────────────────────
  // nucleus --json synapse onboarding <profileId> --step <step>
  // Retorna { success, profile_id, step, request_id, status: "routed" }
  //
  // IMPORTANTE: Espera a que el perfil esté conectado a Brain antes de llamar
  // nucleus synapse onboarding. launch-discovery ok ≠ profile connected.
  // Sin este gate, SendOnboardingNavigateActivity falla con routing timeout
  // porque Brain no tiene profile_registry[profileId] todavía.
  ipcMain.handle('onboarding:navigate', async (event, { step, email, service }) => {
    log.info('[IPC] onboarding:navigate — step:', step);

    // Helper para persistir el step en nucleus.json (siempre, incluso si nucleus falla)
    const persistStep = (step) => {
      try {
        const data = JSON.parse(fs.readFileSync(NUCLEUS_JSON, 'utf8'));
        data.onboarding = data.onboarding || {};
        data.onboarding.started      = true;
        data.onboarding.current_step = step;
        data.onboarding.updated_at   = new Date().toISOString();
        if (!data.onboarding.started_at) {
          data.onboarding.started_at = new Date().toISOString();
        }
        fs.writeFileSync(NUCLEUS_JSON, JSON.stringify(data, null, 2));
      } catch (e) {
        log.warn('[IPC] onboarding:navigate — failed to persist step locally:', e.message);
      }
    };

    try {
      const nucleusData = JSON.parse(fs.readFileSync(NUCLEUS_JSON, 'utf8'));
      const profileId = nucleusData.master_profile;
      if (!profileId) throw new Error('master_profile not found');

      // Gate: esperar a que el perfil esté conectado antes de navegar.
      // Chrome necesita completar el handshake de 3 fases con Brain para que
      // profile_registry[profileId] exista y el routing del mensaje funcione.
      const connected = await waitForProfileConnected(profileId, {
        timeoutMs: 30_000,
        intervalMs: 1_500,
      });

      if (!connected) {
        log.warn(`[IPC] onboarding:navigate — profile ${profileId} not connected after timeout, skipping nucleus call`);
        // navigate es no-fatal: Chrome ya está abierto con el step correcto
        // desde los flags --override-service / --override-step del launch.
        persistStep(step);
        return { success: true, step, status: 'skipped_not_connected' };
      }

      // NOTA: nucleus synapse onboarding solo acepta --step. El flag --service no existe.
      // El routing al provider lo determina el step ID. Ver log: "unknown flag: --service"
      const result = await execNucleus(
        ['--json', 'synapse', 'onboarding', profileId, '--step', step],
        15_000
      );

      const success = result.success !== false && result.status === 'routed';

      persistStep(step);
      log.success('[IPC] onboarding:navigate — ok:', JSON.stringify(result));
      return { success, result };
    } catch (err) {
      log.error('[IPC] onboarding:navigate — FAILED:', err.message);
      persistStep(step);
      return { success: false, error: err.message };
    }
  });

  // ── HANDLER: Polling de steps completados ───────────────────────────────
  // Brain escribe ONBOARDING_STEP_COMPLETE al EventBus cuando un step termina.
  // El comando `brain nucleus onboarding-complete --step <step>` persiste el step
  // en nucleus.json bajo onboarding.completed_steps[].
  // Este handler lee esa lista directamente — no llama a synapse status.
  //
  // CONTRATO ESPERADO en nucleus.json:
  //   { "onboarding": { "completed_steps": ["github_app_auth", ...] } }
  //
  // Si completed_steps no existe aún (Brain no escribió todavía), retorna todo false.
  ipcMain.handle('onboarding:poll-identity', async () => {
    log.info('[IPC] onboarding:poll-identity');
    try {
      const nucleusData = JSON.parse(fs.readFileSync(NUCLEUS_JSON, 'utf8'));

      const completedSteps = nucleusData.onboarding?.completed_steps || [];

      // Mapa de todos los steps posibles — presente para extensibilidad futura
      const steps = {};
      for (const id of ONBOARDING_STEP_IDS) {
        steps[id] = completedSteps.includes(id);
      }

      // Detección del token de la GitHub App (Device Flow):
      // 1. completed_steps[] contiene 'github_app_auth' (escrito por Brain o por mark-step-complete)
      // 2. Brain escribe onboarding.github_app_token cuando procesa GITHUB_APP_AUTHORIZED
      //    (convención "onboarding.<produces>" del step, ver onboarding_steps.json)
      //
      // v3.0.0 (2026-07-10): reemplaza la detección dual de PAT clásico
      // (github_token_fingerprint / github_token_stored / vault_github_stored),
      // que el Device Flow ya no escribe — esos campos quedaron muertos y
      // dejaban 'github_app_auth' sin forma de resolverse vía poll, aunque el
      // milestone ya hubiera llegado y quedara persistido en completed_steps[].
      // Se mantiene el nombre de campo tentativo (onboarding.github_app_token)
      // pendiente de confirmar contra milestone-reactor.js/step-verifiers.js
      // (no auditados en esta sesión) — si el reactor escribe otro nombre,
      // ajustar acá y en onboarding_steps.json en el mismo commit.
      const githubAppAuthorized = !!(
        nucleusData.onboarding?.github_app_token
      );
      if (githubAppAuthorized) {
        steps['github_app_auth'] = true;
        // Persistir en completed_steps para que relecturas futuras sean consistentes
        if (!completedSteps.includes('github_app_auth')) {
          completedSteps.push('github_app_auth');
          nucleusData.onboarding = nucleusData.onboarding || {};
          nucleusData.onboarding.completed_steps = completedSteps;
          try {
            fs.writeFileSync(NUCLEUS_JSON, JSON.stringify(nucleusData, null, 2));
          } catch (we) {
            log.warn('[IPC] onboarding:poll-identity — could not backfill completed_steps:', we.message);
          }
        }

        // FIX (gap "nucleus init --master nunca se invoca"): este backfill
        // escribe completed_steps directamente y NUNCA pasaba por
        // MilestoneReactor — por lo tanto _onGithubAuthComplete() (donde vive
        // el hook nuevo a _initOwnership()) no corría para este camino.
        // En vez de duplicar la llamada a "nucleus init --master" acá (mismo
        // tipo de lógica-en-dos-lugares-sin-sincronizar ya marcado como
        // deuda técnica en HANDOFF §4, sección 3.4 del duplicado
        // main_conductor.js/workspace-synapse-handlers.js), se reusa
        // reactor.handleMilestone() con el evento real del step
        // (GITHUB_APP_AUTHORIZED, ver cortex_events en milestone-registry.js)
        // para que termine en el mismo _onGithubAuthComplete(). El dedupe por
        // "stepId:event" de handleMilestone() ya garantiza que esto sea un
        // no-op si el evento real de Brain ya pasó por acá en esta sesión.
        try {
          const reactor = getReactor?.();
          if (reactor) {
            reactor.handleMilestone('github_app_auth', {
              type: 'ONBOARDING_MILESTONE',
              event: 'GITHUB_APP_AUTHORIZED',
              data: { username: nucleusData.onboarding?.github_username || null },
              _ts: Date.now(),
              _backfill: true,
            });
          } else {
            log.warn('[IPC] onboarding:poll-identity — reactor no disponible todavía, no se pudo reenganchar github_app_auth');
          }
        } catch (re) {
          log.warn('[IPC] onboarding:poll-identity — backfill reactor.handleMilestone falló:', re.message);
        }
      }

      log.success('[IPC] onboarding:poll-identity — ok:', JSON.stringify(steps));
      return { success: true, steps, completedSteps };
    } catch (err) {
      log.error('[IPC] onboarding:poll-identity — FAILED:', err.message);
      // Retorna todo false — el renderer sigue esperando
      const steps = {};
      for (const id of ONBOARDING_STEP_IDS) steps[id] = false;
      return { success: false, steps, completedSteps: [] };
    }
  });

  // ── HANDLER: Folder picker nativo ───────────────────────────────────────
  ipcMain.handle('onboarding:select-folder', async () => {
    const result = await dialog.showOpenDialog(getWindow(), {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Nucleus location',
      buttonLabel: 'Select'
    });
    if (result.canceled || !result.filePaths.length) {
      log.warn('[IPC] onboarding:select-folder — canceled');
      return { success: false, canceled: true };
    }
    return { success: true, path: result.filePaths[0] };
  });

  // ── HANDLER: Listar orgs de GitHub ──────────────────────────────────────
  ipcMain.handle('onboarding:list-orgs', async () => {
    try {
      const result = await execNucleus(['--json', 'github', 'list-orgs']);
      return { success: true, orgs: result.orgs || [] };
    } catch (err) {
      log.error('[IPC] onboarding:list-orgs — FAILED:', err.message);
      return { success: false, orgs: [], error: err.message };
    }
  });

  // ── HANDLER: Crear workspace con nucleus create (streaming de output) ────
  // Corrección #2: usa `nucleus create`, no `nucleus init`.
  // `nucleus init` corre en el step 3 (github_app_auth), después de tener github_id.
  // Este handler solo crea el árbol .bloom/.nucleus-{org}/ en disco.
  //
  // Payload:
  //   { org, path }             → nucleus create --org {org} --path {basePath}/{org}
  //   { temporary: true, path } → nucleus create --temporary --path {basePath}/bloom-workspace
  ipcMain.handle('onboarding:init-nucleus', async (event, { org, path: basePath, temporary }) => {
    // nucleus create --path espera la carpeta del proyecto nuevo, no el directorio padre.
    // El path correcto es: {basePath}/{org}  (ej: /home/jose/repos/elias-repos)
    // Para el caso temporary el binario resuelve el slug, usamos un placeholder de carpeta.
    const folderName  = temporary ? 'bloom-workspace' : org;
    const nucleusPath = require('path').join(basePath, folderName);

    log.info('[IPC] onboarding:init-nucleus — org:', org ?? '(temporary)', '| nucleusPath:', nucleusPath);

    // ── Guardado optimista PRE-spawn ─────────────────────────────────────
    // Si el usuario cierra la app mientras `nucleus create` está corriendo
    // (o justo antes de que el proceso termine), el bloque post-close de
    // abajo nunca llega a ejecutar y workspace_org/workspace_path quedan
    // sin persistir — el usuario pierde lo que tipeó. Para evitar esa
    // pérdida, escribimos el intento ANTES de spawnear, marcado como
    // pendiente. resumeOnboarding() en el renderer puede usar estos campos
    // para repoblar los inputs aunque nucleus_create no haya completado.
    try {
      const data = JSON.parse(fs.readFileSync(NUCLEUS_JSON, 'utf8'));
      data.onboarding = data.onboarding || {};
      data.onboarding.started    = true;
      data.onboarding.started_at = data.onboarding.started_at || new Date().toISOString();
      data.onboarding.workspace_path_pending = nucleusPath;
      data.onboarding.workspace_org_pending  = org || null;
      data.onboarding.updated_at = new Date().toISOString();
      fs.writeFileSync(NUCLEUS_JSON, JSON.stringify(data, null, 2));
      log.info('[IPC] onboarding:init-nucleus — pending state persisted before spawn');
    } catch (e) {
      log.warn('[IPC] onboarding:init-nucleus — could not persist pending state:', e.message);
    }

    return new Promise((resolve) => {
      const args = ['--json', 'create', '--path', nucleusPath];
      if (temporary) {
        args.push('--temporary');
      } else if (org) {
        args.push('--org', org);
      }
      const child = spawn(
        paths.nucleusExe,
        args,
        { windowsHide: true }
      );

      let stdoutOutput = '';
      let allOutput = '';

      child.stdout.on('data', d => {
        const line = d.toString().trim();
        if (!line) return;
        stdoutOutput += line + '\n';
        allOutput += line + '\n';
        event.sender.send('onboarding:init-line', { line, isError: false });
      });

      child.stderr.on('data', d => {
        const line = d.toString().trim();
        if (!line) return;
        allOutput += line + '\n';
        log.error('[IPC] onboarding:init-nucleus stderr:', line);
        event.sender.send('onboarding:init-line', { line, isError: true });
      });

      child.on('close', code => {
        if (code === 0) {
          log.success('[IPC] onboarding:init-nucleus — ok');

          // PASO 1: Calcular resolvedOrg PRIMERO desde el output JSON de nucleus create.
          // Si se usó --temporary, el binario asigna el slug internamente y lo incluye
          // en el JSON de salida. Necesitamos este valor antes de persistir en disco.
          let resolvedOrg = org || null;
          try {
            const jsonLine = stdoutOutput.split('\n').find(l => l.trim().startsWith('{'));
            if (jsonLine) {
              const parsed = JSON.parse(jsonLine);
              resolvedOrg = parsed.org || parsed.org_slug || resolvedOrg;
            }
          } catch (_) {
            // Output no-JSON — usar el org del payload (puede ser null en modo temporary)
          }

          // PASO 2: Persistir en nucleus.json.
          // workspace_org es crítico para el mecanismo de resume: get-resume-state lo
          // devuelve en workspaceState.org, y loadRepos() lo necesita para listar repos.
          // workspace_path es necesario para restaurar los inputs del workspace screen.
          //
          // Esta escritura es la fuente de verdad final. Los campos *_pending
          // (escritos antes del spawn) quedan obsoletos en este punto y se limpian
          // para no confundir un futuro resume con datos de un intento ya resuelto.
          try {
            const data = JSON.parse(fs.readFileSync(NUCLEUS_JSON, 'utf8'));
            data.onboarding = data.onboarding || {};

            data.onboarding.completed_steps = data.onboarding.completed_steps || [];
            if (!data.onboarding.completed_steps.includes('nucleus_create')) {
              data.onboarding.completed_steps.push('nucleus_create');
            }

            // getOrCreateOrg migra el esquema in-place y deja active_org_slug
            // apuntando acá — mismo comportamiento que antes (workspace_org
            // se pisaba siempre, para el caso de useExistingWorkspace()).
            // resolvedOrg puede venir null en modo --temporary; org_slug no
            // puede ser vacío (es la key de organizations[]), así que cae al
            // mismo 'bloom-local' que ya usa selection.selectedOrg en
            // step-workspace.js para el caso temporal.
            const orgSlug = resolvedOrg || 'bloom-local';
            getOrCreateOrg(data.onboarding, orgSlug, { workspacePath: nucleusPath });

            data.onboarding.updated_at = new Date().toISOString();

            // Limpiar el estado pendiente — ya tenemos el resultado definitivo.
            delete data.onboarding.workspace_path_pending;
            delete data.onboarding.workspace_org_pending;

            fs.writeFileSync(NUCLEUS_JSON, JSON.stringify(data, null, 2));
            log.success(
              '[IPC] onboarding:init-nucleus — nucleus_create persisted ' +
              '(path: ' + nucleusPath + ', org: ' + orgSlug + ')'
            );
          } catch (e) {
            // CRÍTICO: si esto falla, el usuario pierde el org/path aunque
            // `nucleus create` haya tenido éxito. Lo dejamos bien visible en logs
            // y devolvemos el dato igual en la respuesta IPC para que el renderer
            // pueda, como red de seguridad, reintentar la persistencia explícitamente
            // vía onboarding:mark-step-complete con datos extendidos.
            log.error('[IPC] onboarding:init-nucleus — COULD NOT PERSIST nucleus_create (org/path lost on disk!):', e.message);
          }

          resolve({ success: true, org: resolvedOrg, path: nucleusPath, output: allOutput });
        } else {
          log.error('[IPC] onboarding:init-nucleus — FAILED: exit code', code);
          resolve({ success: false, error: `Exit code ${code}`, output: allOutput });
        }
      });

      child.on('error', err => {
        log.error('[IPC] onboarding:init-nucleus — FAILED:', err.message);
        resolve({ success: false, error: err.message });
      });
    });
  });

  // ── HANDLER: Usar workspace existente (rama "ya existe" de nucleus_create) ──
  // FIX (diagnóstico sesión: "useExistingWorkspace() no persiste nada en
  // disco"): useExistingWorkspace() en step-workspace.js llamaba a
  // onboarding:mark-step-complete({ step: 'nucleus_create' }), pero
  // 'nucleus_create' está en FS_MARKER_STEPS (ver más abajo) y ese handler
  // lo RECHAZA siempre, a propósito — el guard existe para que nadie fuerce
  // el step vía el camino genérico del reactor sin persistir el artefacto
  // fs_marker real (workspace_path). Resultado: cuando la carpeta elegida
  // ya tenía una config de Bloom, el usuario apretaba "Usar la existente" y
  // el click no persistía org/path en ningún lado — el siguiente resume
  // volvía a preguntar por el workspace.
  //
  // Esta ruta es el equivalente de la rama de éxito de onboarding:init-nucleus
  // (mismo getOrCreateOrg, mismo completed_steps.push) pero sin spawnear
  // `nucleus create` — la carpeta ya existe, no hay nada que crear.
  ipcMain.handle('onboarding:use-existing-workspace', async (event, { org, path: workspacePath }) => {
    log.info('[IPC] onboarding:use-existing-workspace — org:', org || '(none)', '| path:', workspacePath);
    if (!workspacePath) {
      return { success: false, error: 'path is required' };
    }
    try {
      const data = JSON.parse(fs.readFileSync(NUCLEUS_JSON, 'utf8'));
      data.onboarding = data.onboarding || {};
      migrateToNestedSchema(data.onboarding);

      data.onboarding.completed_steps = data.onboarding.completed_steps || [];
      if (!data.onboarding.completed_steps.includes('nucleus_create')) {
        data.onboarding.completed_steps.push('nucleus_create');
      }

      // Mismo fallback que init-nucleus: org_slug no puede ser vacío (es la
      // key de organizations[]), así que un workspace temporal/sin org
      // detectada cae a 'bloom-local'.
      const orgSlug = org || 'bloom-local';
      getOrCreateOrg(data.onboarding, orgSlug, { workspacePath });

      // Limpiar cualquier resto de un intento pendiente anterior (mismo
      // patrón que la rama de éxito de init-nucleus).
      delete data.onboarding.workspace_path_pending;
      delete data.onboarding.workspace_org_pending;
      data.onboarding.updated_at = new Date().toISOString();

      fs.writeFileSync(NUCLEUS_JSON, JSON.stringify(data, null, 2));
      log.success('[IPC] onboarding:use-existing-workspace — ok (org:', orgSlug, ')');
      return { success: true, org: orgSlug, path: workspacePath };
    } catch (err) {
      log.error('[IPC] onboarding:use-existing-workspace — FAILED:', err.message);
      return { success: false, error: err.message };
    }
  });

  // ── HANDLER: Listar repos de una org ────────────────────────────────────
  ipcMain.handle('onboarding:list-repos', async (event, { org }) => {
    try {
      const result = await execNucleus(
        ['--json', 'github', 'list-repos', '--org', org]
      );
      return { success: true, repos: result.repos || [] };
    } catch (err) {
      log.error('[IPC] onboarding:list-repos — FAILED:', err.message);
      return { success: false, repos: [], error: err.message };
    }
  });

  // ── HANDLER: Persistir la selección de proyecto en PROJECT ──────────────
  // Se llama para AMBAS ramas de importSelectedProject() (step-project.js):
  // repo de GitHub (projectPath vacío) y carpeta local ya importada
  // (projectPath = destPath devuelto por onboarding:import-project). Guarda
  // de forma optimista antes de create-mandate, para que un resume
  // interrumpido no pierda la selección. create-mandate puede sobrescribir
  // project_path después con el valor definitivo — no hay conflicto.
  ipcMain.handle('onboarding:select-project', async (event, { projectName, projectPath }) => {
    log.info('[IPC] onboarding:select-project — projectName:', projectName, '| projectPath:', projectPath || '(none)');
    try {
      const data = JSON.parse(fs.readFileSync(NUCLEUS_JSON, 'utf8'));
      data.onboarding = data.onboarding || {};

      // FIX (auditoría multi-org): antes esto escribía project_name/project_path
      // como campos planos en la raíz de onboarding — exactamente lo que el
      // esquema anidado (shared/onboarding-schema.js) reemplaza. Un proyecto no
      // puede existir fuera de una organización, así que primero migramos
      // cualquier resto de esquema plano viejo y resolvemos la org activa.
      migrateToNestedSchema(data.onboarding);
      const org = getActiveOrg(data.onboarding);
      if (!org) {
        throw new Error(
          'No hay organización activa en nucleus.json — ¿se completó nucleus_create antes de seleccionar el proyecto?'
        );
      }

      // getOrCreateProject busca por project_name (todavía no tenemos
      // project_id en este punto del flujo) y deja active_project_id
      // apuntando al proyecto resuelto.
      const project = getOrCreateProject(data.onboarding, org, {
        projectName,
        projectPath: projectPath || null,
      });

      // Red de seguridad (mismo patrón que nucleus_create en init-nucleus, y
      // que create-mandate más abajo): pushear el propio stepId a
      // completed_steps[] acá, no solo depender de que MilestoneReactor lo
      // haga vía un milestone de Brain. project_select puede completarse sin
      // que Brain llegue a emitir PROJECT_CREATED (ej. selección de carpeta
      // local, que no pasa por Discovery/Chrome en absoluto).
      data.onboarding.completed_steps = data.onboarding.completed_steps || [];
      if (!data.onboarding.completed_steps.includes('project_select')) {
        data.onboarding.completed_steps.push('project_select');
      }
      data.onboarding.updated_at = new Date().toISOString();
      fs.writeFileSync(NUCLEUS_JSON, JSON.stringify(data, null, 2));
      return {
        success: true,
        project: {
          projectId: project.project_id,
          projectName: project.project_name,
          projectPath: project.project_path,
        },
      };
    } catch (err) {
      log.error('[IPC] onboarding:select-project — FAILED:', err.message);
      return { success: false, error: err.message };
    }
  });

  // ── HANDLER: Importar (copiar) un proyecto de carpeta local al root de
  // Nucleus, vía conductor/shared/project-copier.js ─────────────────────────
  // Ver PROJECT-COPIER-SPEC-AND-CONTEXT.md §2.3: corre ANTES de
  // create-mandate. destPath = path.join(workspace_path, project) —
  // convención confirmada con el usuario. Si destPath ya existe, falla con
  // error explícito (no sobrescribe, no genera sufijo automático).
  ipcMain.handle('onboarding:import-project', async (event, { project, sourcePath }) => {
    log.info('[IPC] onboarding:import-project — project:', project, '| sourcePath:', sourcePath);
    try {
      const { copyProject, resolveProjectDestPath } = require('../../../shared/project-copier');

      const data = JSON.parse(fs.readFileSync(NUCLEUS_JSON, 'utf8'));
      data.onboarding = data.onboarding || {};

      // FIX (auditoría multi-org): onboarding.workspace_path plano ya no existe
      // una vez migrado el esquema — vive en organizations[].workspace_path.
      // migrateToNestedSchema es idempotente, así que es seguro llamarla acá
      // aunque ya se haya corrido antes (ej. en nucleus_create o select-project).
      migrateToNestedSchema(data.onboarding);
      const org = getActiveOrg(data.onboarding);
      const workspacePath = org?.workspace_path;
      if (!workspacePath) {
        throw new Error('No hay organización activa con workspace_path — ¿se completó nucleus_create?');
      }

      const destPath = resolveProjectDestPath(workspacePath, project);

      // Colisión: fallar con error claro, no sobrescribir ni generar sufijo
      // (decisión de producto confirmada). project-copier.js no hace este
      // chequeo — es responsabilidad del caller, según su propio doc.
      const alreadyExists = await fs.promises.stat(destPath).then(() => true).catch(() => false);
      if (alreadyExists) {
        throw Object.assign(
          new Error(`Ya existe un proyecto con el nombre "${project}"`),
          { code: 'DEST_EXISTS' }
        );
      }

      const result = await copyProject({ sourcePath, destPath });

      try {
        // Igual que select-project: el proyecto cuelga de la org activa, no
        // de un campo plano en la raíz de onboarding.
        getOrCreateProject(data.onboarding, org, {
          projectName: project,
          projectPath: result.destPath,
        });
        data.onboarding.updated_at = new Date().toISOString();
        fs.writeFileSync(NUCLEUS_JSON, JSON.stringify(data, null, 2));
      } catch (e) {
        log.warn('[IPC] onboarding:import-project — could not persist project_path:', e.message);
      }

      log.success('[IPC] onboarding:import-project — ok:', result.destPath,
        '| gitExcluded:', result.gitExcluded.length);
      return { success: true, destPath: result.destPath, gitExcluded: result.gitExcluded };
    } catch (err) {
      log.error('[IPC] onboarding:import-project — FAILED:', err.message);
      return { success: false, error: err.message };
    }
  });

  // ── HANDLER: Crear Genesis Mandate ──────────────────────────────────────
  ipcMain.handle('onboarding:create-mandate', async (event, { project, projectPath, projectId }) => {
    try {
      // FIX: sin cwd, nucleus arranca desde el directorio de la app y busca
      // .bloom subiendo desde ahí — nunca lo encuentra, porque el .bloom
      // real vive dentro de workspace_path (árbol creado por nucleus_create).
      // Confirmado en producción: "no encontré carpeta .bloom subiendo
      // desde .../installer/conductor/workspace".
      const dataForCwd = JSON.parse(fs.readFileSync(NUCLEUS_JSON, 'utf8'));
      dataForCwd.onboarding = dataForCwd.onboarding || {};
      // FIX (auditoría multi-org): mismo caso que import-project — leer la
      // org activa en vez del campo plano onboarding.workspace_path.
      migrateToNestedSchema(dataForCwd.onboarding);
      const activeOrgForCwd = getActiveOrg(dataForCwd.onboarding);
      const workspacePath = activeOrgForCwd?.workspace_path;
      if (!workspacePath) {
        throw new Error('No hay organización activa con workspace_path — ¿se completó nucleus_create?');
      }
      if (!projectId) {
        throw new Error('onboarding:create-mandate requiere projectId');
      }
      const selectedProject = (activeOrgForCwd.projects || [])
        .find(candidate => candidate.project_id === projectId);
      if (!selectedProject) {
        throw new Error(`projectId ${projectId} no pertenece a la organización seleccionada`);
      }

      const result = await execNucleus([
        '--json', 'mandate', 'genesis',
        '--project', project,
        '--project-id', projectId,
        '--source', projectPath
      ], 15000, { cwd: workspacePath });
      if (result.success !== false) {
        try {
          // mandate_genesis tiene cortex_events: [] — Brain nunca confirma
          // este step, así que la persistencia de su artefacto (produces:
          // genesis_mandate_id) tiene que resolverse acá, síncronamente, no
          // esperando un milestone que no va a llegar. Ver
          // MANDATE-STEP-IMPLEMENTATION-PROMPT.md §3.2.
          //
          // OPEN ITEM sin confirmar contra el binario real: no sabemos con
          // certeza qué trae `nucleus mandate genesis --json` por stdout, así
          // que se prueban los nombres de campo más probables y, si ninguno
          // aparece, se genera un ID local — a step-verifiers.js (verify:
          // 'json_field') solo le importa que el campo sea truthy, no un
          // formato específico. Si se confirma el nombre real del campo que
          // devuelve el binario, ajustar este orden de preferencia.
          const mandateId = result.mandateId || result.mandate_id || result.id
            || result.genesis_mandate_id || `local-${Date.now()}`;

          const data = JSON.parse(fs.readFileSync(NUCLEUS_JSON, 'utf8'));
          data.onboarding = data.onboarding || {};
          migrateToNestedSchema(data.onboarding);

          // FIX (auditoría multi-org): project_path/genesis_mandate_id ya no
          // son campos planos — cuelgan del proyecto dentro de la org activa.
          // Reusamos getOrCreateProject con `project` (el nombre pasado por
          // el caller) para encontrar el mismo proyecto que ya creó
          // select-project/import-project más arriba en el flujo, en vez de
          // crear uno nuevo duplicado.
          const org = getActiveOrg(data.onboarding);
          if (!org) {
            throw new Error('No hay organización activa — no se puede asociar el mandate a ningún proyecto');
          }
          const proj = getOrCreateProject(data.onboarding, org, {
            projectId,
            projectName: project,
            projectPath,
          });
          proj.genesis_mandate_id = mandateId;

          // Red de seguridad — mismo patrón que project_select en
          // onboarding:select-project: pushear el propio stepId acá, no solo
          // confiar en un milestone push que en este step ni siquiera existe.
          data.onboarding.completed_steps = data.onboarding.completed_steps || [];
          if (!data.onboarding.completed_steps.includes('mandate_genesis')) {
            data.onboarding.completed_steps.push('mandate_genesis');
          }
          data.onboarding.updated_at = new Date().toISOString();
          fs.writeFileSync(NUCLEUS_JSON, JSON.stringify(data, null, 2));
          log.success('[IPC] onboarding:create-mandate — genesis_mandate_id persisted:', mandateId);
        } catch (e) {
          log.warn('[IPC] onboarding:create-mandate — could not persist project_path/genesis_mandate_id:', e.message);
        }
      }
      return { success: result.success !== false, result };
    } catch (err) {
      log.error('[IPC] onboarding:create-mandate — FAILED:', err.message);
      return { success: false, error: err.message };
    }
  });

  // ── HANDLER: Completar onboarding + handoff al workspace ────────────────
  // D-23 (BLOOM_Mandate_Genesis_Roadmap_Maestro_v3_2.md §1.2/§6, diseño
  // cerrado, Fase B): acá es donde se escribe onboarding.pending_genesis_launch
  // — el flag que le indica a Core "arrancá Genesis para este proyecto" al
  // bootear. Confirmado en Fase A que no existe ningún canal de Electron
  // (query string, additionalArguments, env var) para esto — createWorkspaceWindow
  // solo recibe la URL — así que se usa el mismo patrón que ya domina este
  // archivo: un flag persistido en nucleus.json, consumido y borrado por el
  // otro lado (ver 'onboarding:consume-pending-genesis-launch' más abajo).
  ipcMain.handle('onboarding:complete', async (event, { workspaceUrl, projectId }) => {
    log.info('[IPC] onboarding:complete — workspaceUrl:', workspaceUrl || 'http://localhost:5173');
    try {
      const nucleusData = JSON.parse(fs.readFileSync(NUCLEUS_JSON, 'utf8'));
      nucleusData.onboarding = {
        ...nucleusData.onboarding,
        completed:     true,
        completed_at:  new Date().toISOString(),
        workspace_url: workspaceUrl || 'http://localhost:5173',
        current_step:  'success'
      };

      // Resolver por identidad explícita, no por nombre ni por la noción de
      // "proyecto activo": puede haber varios proyectos operando a la vez.
      migrateToNestedSchema(nucleusData.onboarding);
      if (!projectId) {
        throw new Error('onboarding:complete requiere el projectId de la selección actual');
      }
      const matches = (nucleusData.onboarding.organizations || [])
        .flatMap(org => (org.projects || []).map(project => ({ org, project })))
        .filter(({ project }) => project.project_id === projectId);
      if (matches.length !== 1) {
        throw new Error(`projectId ${projectId} no identifica exactamente un proyecto persistido`);
      }
      const selectedProject = matches[0].project;
      if (!selectedProject.project_name) {
        throw new Error(`projectId ${projectId} no tiene project_name persistido`);
      }
      nucleusData.onboarding.pending_genesis_launch = {
        projectId:   selectedProject.project_id,
        project:     selectedProject.project_name,
        projectPath: selectedProject.project_path || '',
      };
      log.info(
        '[IPC] onboarding:complete — pending_genesis_launch escrito para projectId:',
        selectedProject.project_id,
        '| project:',
        selectedProject.project_name
      );

      fs.writeFileSync(NUCLEUS_JSON, JSON.stringify(nucleusData, null, 2));

      // Opción C: ventana nueva con preload_conductor.js (createWorkspaceWindow,
      // main_conductor.js) en vez de win.loadURL() sobre la ventana de onboarding.
      // El preload de una BrowserWindow se fija en su creación y no cambia con
      // loadURL() — reusar la ventana dejaba el preload de onboarding corriendo
      // contra core.html, causa raíz confirmada de que window.nucleus nunca
      // existiera del lado de Core (ver comentario de auditoría 19/07/2026 en
      // main_conductor.js sobre este mismo síntoma).
      const oldWindow = getWindow(); // guardar ANTES de crear la nueva — createWorkspaceWindow reasigna mainWindow

      createWorkspaceWindow(nucleusData.onboarding.workspace_url);

      if (oldWindow && !oldWindow.isDestroyed()) {
        oldWindow.close();
      }

      log.success('[IPC] onboarding:complete — ok, handoff a Core vía createWorkspaceWindow');
      return { success: true };
    } catch (err) {
      log.error('[IPC] onboarding:complete — FAILED:', err.message);
      return { success: false, error: err.message };
    }
  });

  // ── HANDLER: Consumir (leer + borrar) el flag de arranque de Genesis ────
  // D-23 — contraparte de 'onboarding:complete' de arriba. Lo llama Core al
  // bootear (ver webview/app/src/routes/+layout.svelte). Regla no negociable
  // del diseño (§1.2 del roadmap): esto CONSUME el flag, no solo lo lee — si
  // no se borra, cada apertura posterior de Core (sin venir de un Onboarding
  // recién cerrado) volvería a intentar arrancar Genesis. Devuelve
  // { success, pending: {project, projectPath} | null }.
  ipcMain.handle('onboarding:consume-pending-genesis-launch', async () => {
    log.info('[IPC] onboarding:consume-pending-genesis-launch');
    try {
      const data = JSON.parse(fs.readFileSync(NUCLEUS_JSON, 'utf8'));
      const pending = data.onboarding?.pending_genesis_launch || null;
      if (pending) {
        delete data.onboarding.pending_genesis_launch;
        data.onboarding.updated_at = new Date().toISOString();
        fs.writeFileSync(NUCLEUS_JSON, JSON.stringify(data, null, 2));
        log.success('[IPC] onboarding:consume-pending-genesis-launch — consumido y borrado:', JSON.stringify(pending));
      } else {
        log.info('[IPC] onboarding:consume-pending-genesis-launch — nada pendiente');
      }
      return { success: true, pending };
    } catch (err) {
      log.error('[IPC] onboarding:consume-pending-genesis-launch — FAILED:', err.message);
      return { success: false, pending: null, error: err.message };
    }
  });

  // ── HANDLER: Marcar un step como completado ─────────────────────────────
  // Llamado por el renderer cuando recibe confirmación externa (ej: Brain notifica
  // via bloom-host → extension → Conductor), o como fallback manual.
  //
  // FIX (auditoría 19/07/2026): antes esto escribía a mano un subconjunto de
  // los campos (solo onboarding.completed_steps[]), nunca onboarding.<produces>
  // (ej. ai_provider_key) — que es lo que resolveEntryPoint()/step-verifiers.js
  // usan para decidir el resume. El próximo resume volvía siempre al mismo
  // step aunque se llamara esto. Ahora reusa el camino 100% verificado que ya
  // usa un milestone real: MilestoneReactor.handleMilestone() → dispara el
  // handler nombrado del step → _persistStepComplete(), que escribe
  // completed_steps[] Y produces juntos, y emite milestone:reached al
  // renderer. Cero lógica nueva de persistencia acá.
  //
  // Steps con verify:'fs_marker' quedan bloqueados — ver FS_MARKER_STEPS más
  // abajo — porque _persistStepComplete puede corromper su artefacto o, en
  // el mejor caso, no sirve para nada.
  //
  // SYNC (25/07/2026 — split MANDATE de PROJECT): 'project_create' (el único
  // otro miembro histórico de esta lista) ya no existe. Sus dos reemplazos
  // en el SSOT v3.1.0 — project_select y mandate_genesis — son ambos
  // verify:'json_field', no fs_marker, así que no van acá.
  const FS_MARKER_STEPS = ['nucleus_create'];

  ipcMain.handle('onboarding:mark-step-complete', async (event, { step }) => {
    log.info('[IPC] onboarding:mark-step-complete — step:', step);
    if (!step || !ONBOARDING_STEP_IDS.includes(step)) {
      log.warn('[IPC] onboarding:mark-step-complete — unknown step:', step);
      return { success: false, error: `Unknown step: ${step}` };
    }
    // FIX: nucleus_create se verifica por artefacto real en filesystem
    // (fs_marker), no por un flag booleano. produces ('workspace_path') es
    // EL MISMO campo que step-verifiers.js usa como directorio en fs_marker
    // (verifyArgs.jsonField: 'onboarding.workspace_path'). Si
    // _persistStepComplete() escribe `true` ahí porque el path real todavía
    // no existe, path.join() en el verifier tira TypeError (catch → false) y
    // resolveEntryPoint() queda trabado en nucleus_create para siempre, sin
    // poder recuperarse solo editando completed_steps[] — hay que limpiar
    // nucleus.json a mano.
    //
    // SYNC (25/07/2026 — split MANDATE de PROJECT): project_select y
    // mandate_genesis (reemplazos de project_create) son verify:'json_field',
    // no fs_marker — no tienen este riesgo, por eso no están en
    // FS_MARKER_STEPS y sí pueden pasar por el camino normal de abajo.
    if (FS_MARKER_STEPS.includes(step)) {
      log.warn('[IPC] onboarding:mark-step-complete — rechazado, step fs_marker:', step);
      return {
        success: false,
        error: `"${step}" se verifica por artefacto en filesystem, no se puede forzar manualmente sin riesgo de corromper el resume`,
      };
    }
    try {
      const reactor = getReactor();
      if (!reactor) {
        return { success: false, error: 'reactor no inicializado todavía' };
      }
      // No se manda `event` en el enriched a propósito: algunos handlers del
      // reactor (ej. _onProjectSelectComplete, que discrimina PROJECT_CREATED
      // del resto de eventos de project_select) discriminan por
      // enriched.event === 'ALGO_ESPECIFICO' y devuelven sin persistir si no
      // matchea. Un enriched.event undefined no matchea ningún discriminador
      // != undefined, así que estos handlers proceden con normalidad —
      // dejamos el enriched "limpio" (sin event inventado) para que ningún
      // handler futuro con un discriminador similar se rompa silenciosamente
      // por un valor sintético que nunca vimos verificado contra el código real.
      reactor.handleMilestone(step, {
        type: 'ONBOARDING_MILESTONE',
        data: {},
        _manualOverride: true,
        _ts: Date.now(),
      });
      log.success('[IPC] onboarding:mark-step-complete — reconciliado vía reactor:', step);
      return { success: true, step };
    } catch (err) {
      log.error('[IPC] onboarding:mark-step-complete — FAILED:', err.message);
      return { success: false, error: err.message };
    }
  });

  // ── HANDLER: Estado de resume — leer progreso persistido ────────────────
  //
  // Llamado en DOMContentLoaded para detectar si hay un onboarding en curso.
  // Lee nucleus.json y devuelve qué steps están completados, cuál es el
  // current_step, y si el onboarding ya finalizó.
  //
  // Respuesta:
  //   {
  //     success: true,
  //     hasProgress: boolean,      // true si onboarding.started && !completed
  //     completed: boolean,        // true si onboarding.completed === true
  //     completedSteps: string[],  // ej: ['nucleus_create', 'github_app_auth']
  //     currentStep: string|null,  // último step navegado (persistido en navigate handler)
  //     workspaceState: {          // datos necesarios para restaurar variables globales
  //       path: string|null,
  //       org:  string|null,
  //       pending: boolean,        // true si path/org vienen de un intento interrumpido
  //                                 // (nucleus_create no llegó a completar el exit 0)
  //     }
  //   }
  ipcMain.handle('onboarding:get-resume-state', async () => {
    log.info('[IPC] onboarding:get-resume-state');
    try {
      const { stepId, produced } = resolveEntryPoint(getRegistry().steps, NUCLEUS_JSON);

      log.success('[IPC] onboarding:get-resume-state — ok:', JSON.stringify({ stepId, produced }));

      return { success: true, stepId, produced };
    } catch (err) {
      log.error('[IPC] onboarding:get-resume-state — FAILED:', err.message);
      // Fallback seguro: si el motor falla, arrancar desde el primer step
      // es preferible a bloquear el onboarding completo.
      return { success: false, stepId: getRegistry().steps[0]?.id ?? null, produced: [] };
    }
  });

  // ── HANDLER: Exponer el SSOT de steps al renderer ───────────────────────
  //
  // Fix Bug #1 (auditoría 16/07/2026): navigation.js (renderer) llamaba a
  // window.onboarding.getStepsConfig() desde su primer commit, pero este
  // handler nunca se había implementado — el renderer caía SIEMPRE a su
  // propio FALLBACK_STEPS embebido (con el orden viejo PAT), confirmado en
  // producción por conductor_onboarding_20260717.log:
  //   "navigation: window.onboarding.getStepsConfig no existe — usando
  //    fallback embebido."
  //
  // Devuelve getRegistry().steps — el MISMO array que ya usa
  // resolveEntryPoint() en onboarding:get-resume-state (línea de abajo).
  // No relee el JSON de disco: MilestoneRegistry ya lo cargó una vez en
  // loadSteps() al bootear (ver main_conductor.js). Un único punto de
  // lectura de disco para todo el proceso Main.
  ipcMain.handle('onboarding:get-steps-config', async () => {
    log.info('[IPC] onboarding:get-steps-config');
    try {
      const steps = getRegistry().steps;
      log.success(`[IPC] onboarding:get-steps-config — ok: ${steps.length} steps`);
      return { success: true, steps };
    } catch (err) {
      log.error('[IPC] onboarding:get-steps-config — FAILED:', err.message);
      return { success: false, steps: [], error: err.message };
    }
  });

  // ── HANDLER: Bridge de logging desde el renderer ────────────────────────
  ipcMain.handle('onboarding:log', async (event, { level, message }) => {
    const msg = `[RENDERER] ${message}`;
    if      (level === 'error') log.error(msg);
    else if (level === 'warn')  log.warn(msg);
    else                        log.info(msg);
    return { success: true };
  });

  // ── HANDLER: SynapseSimulator — inyectar milestone directamente al reactor ────────
  // Solo disponible en builds de desarrollo (!app.isPackaged).
  // Permite disparar handleMilestone() sin necesitar una cuenta real ni
  // que Brain emita el evento — útil para testear el flujo de UI completo.
  //
  // Payload: { stepId: string, data?: object }
  // Ejemplo: { stepId: 'github_app_auth', data: { username: 'test-user', org: 'bloom-labs' } }
  ipcMain.handle('synapse-simulator:inject-milestone', async (event, { stepId, data = {} }) => {
    if (app.isPackaged) {
      log.warn('[SYNAPSE_SIMULATOR] inject-milestone rechazado — build empaquetado');
      return { success: false, error: 'synapse-simulator not available in production builds' };
    }
    if (!stepId || typeof stepId !== 'string') {
      return { success: false, error: 'stepId is required' };
    }
    const reactor = getReactor?.();
    if (!reactor) {
      log.warn('[SYNAPSE_SIMULATOR] inject-milestone: reactor no disponible todavía');
      return { success: false, error: 'reactor not initialized — call after initOnboardingBridge()' };
    }
    log.info(`[SYNAPSE_SIMULATOR] inject-milestone → stepId: "${stepId}" data: ${JSON.stringify(data)}`);
    try {
      // Construir un enriched mínimo que el reactor entienda
      const enriched = {
        type:     'ONBOARDING_MILESTONE',
        event:    stepId.toUpperCase(),   // para que los handlers que inspeccionan enriched.event funcionen
        data,
        _ts:      Date.now(),
        _synapse_simulator: true,         // trazabilidad: este evento fue inyectado por synapse-simulator
      };
      reactor.handleMilestone(stepId, enriched);
      log.info(`[SYNAPSE_SIMULATOR] inject-milestone ok — "${stepId}"`);
      return { success: true, stepId };
    } catch (err) {
      log.error(`[SYNAPSE_SIMULATOR] inject-milestone error — "${stepId}":`, err.message);
      return { success: false, error: err.message };
    }
  });
  // ── HANDLER: Persistir datos de GitHub para el mecanismo de resume ──────────
  // Llamado por el renderer cuando el milestone de github_app_auth llega con payload
  // completo y Brain no escribió github_username en nucleus.json por su cuenta.
  //
  // Payload: { username: string, org: string|null }
  // NOTA: este handler persiste username/org para UI de resume — no toca
  // onboarding.github_app_token, que es el campo que poll-identity usa para
  // resolver el step (ver más arriba). Si Brain no escribe ese campo al
  // procesar GITHUB_APP_AUTHORIZED, poll-identity seguirá sin destrabar el
  // step aunque username/org ya estén guardados acá.
  ipcMain.handle('onboarding:persist-github-data', async (event, { username, org }) => {
    if (!username || typeof username !== 'string') {
      return { success: false, error: 'username is required' };
    }
    try {
      const data = JSON.parse(fs.readFileSync(NUCLEUS_JSON, 'utf8'));
      data.onboarding = data.onboarding || {};
      // Solo escribir si no están ya seteados (Brain tiene precedencia)
      if (!data.onboarding.github_username) {
        data.onboarding.github_username = username;
      }
      if (!data.onboarding.github_org && org) {
        data.onboarding.github_org = org;
      }
      data.onboarding.updated_at = new Date().toISOString();
      fs.writeFileSync(NUCLEUS_JSON, JSON.stringify(data, null, 2));
      log.success('[IPC] onboarding:persist-github-data — ok:', username);
      return { success: true };
    } catch (err) {
      log.error('[IPC] onboarding:persist-github-data — FAILED:', err.message);
      return { success: false, error: err.message };
    }
  });
}

module.exports = { registerOnboardingHandlers };
