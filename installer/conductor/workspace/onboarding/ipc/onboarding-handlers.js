console.log('[ONBOARDING-HANDLERS BUILD] marker-vault-diag-v1 — archivo confirmado en runtime main process');

// workspace/onboarding/ipc/onboarding-handlers.js
// Handlers IPC exclusivos del módulo onboarding.
// Paso 1: github_auth — steps como strings, poll lee completed_steps[] de nucleus.json
'use strict';

const fs   = require('fs');
const path = require('path');
const { ipcMain, dialog, app } = require('electron');
const { spawn } = require('child_process');
const { getLogger } = require('../../../shared/logger');
const { paths } = require('../../../shared/global_paths');

const log = getLogger('onboarding');

// ── Steps válidos — espejo del JSON canónico en config/onboarding/onboarding_steps.json
// No se hardcodean reglas aquí, solo los IDs para validación local.
const ONBOARDING_STEP_IDS = [
  'github_auth',
  'nucleus_create',
  'vault_init',
  'google_auth',
  'ai_provider_setup',
  'project_create',
];

function registerOnboardingHandlers(execNucleus, NUCLEUS_JSON, getWindow, getReactor) {

  // ── HANDLER: Lanzar Discovery en modo registro ──────────────────────────
  // Paso 1: github_auth es el primer step.
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
        '--override-step',      'github_auth',
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
  //   { "onboarding": { "completed_steps": ["github_auth", ...] } }
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

      // Detección dual del PAT de GitHub:
      // 1. completed_steps[] contiene 'github_auth' (escrito por Brain o por mark-step-complete)
      // 2. Brain escribe onboarding.github_token_fingerprint cuando procesa GITHUB_TOKEN_STORED
      // Cualquiera de las dos condiciones indica que el token llegó.
      const githubTokenStored = !!(
        nucleusData.onboarding?.github_token_fingerprint ||
        nucleusData.onboarding?.github_token_stored      ||
        nucleusData.onboarding?.vault_github_stored       // nombre alternativo que usa Brain
      );
      if (githubTokenStored) {
        steps['github_auth'] = true;
        // Persistir en completed_steps para que relecturas futuras sean consistentes
        if (!completedSteps.includes('github_auth')) {
          completedSteps.push('github_auth');
          nucleusData.onboarding = nucleusData.onboarding || {};
          nucleusData.onboarding.completed_steps = completedSteps;
          try {
            fs.writeFileSync(NUCLEUS_JSON, JSON.stringify(nucleusData, null, 2));
          } catch (we) {
            log.warn('[IPC] onboarding:poll-identity — could not backfill completed_steps:', we.message);
          }
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
  // `nucleus init` corre en el step 2 (github_auth), después de tener github_id.
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

      let allOutput = '';

      child.stdout.on('data', d => {
        const line = d.toString().trim();
        if (!line) return;
        allOutput += line + '\n';
        event.sender.send('onboarding:init-line', { line, isError: false });
      });

      child.stderr.on('data', d => {
        const line = d.toString().trim();
        if (!line) return;
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
            const jsonLine = allOutput.split('\n').find(l => l.trim().startsWith('{'));
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
            data.onboarding                  = data.onboarding || {};
            data.onboarding.completed_steps  = data.onboarding.completed_steps || [];

            if (!data.onboarding.completed_steps.includes('nucleus_create')) {
              data.onboarding.completed_steps.push('nucleus_create');
            }

            // Siempre actualizar path y org — puede que hayan cambiado si el usuario
            // retomó un workspace existente con useExistingWorkspace().
            data.onboarding.workspace_path = nucleusPath;
            data.onboarding.workspace_org  = resolvedOrg || null;
            data.onboarding.updated_at     = new Date().toISOString();

            // Limpiar el estado pendiente — ya tenemos el resultado definitivo.
            delete data.onboarding.workspace_path_pending;
            delete data.onboarding.workspace_org_pending;

            fs.writeFileSync(NUCLEUS_JSON, JSON.stringify(data, null, 2));
            log.success(
              '[IPC] onboarding:init-nucleus — nucleus_create persisted ' +
              '(path: ' + nucleusPath + ', org: ' + (resolvedOrg || '(temporary/unresolved)') + ')'
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

  // ── HANDLER: Crear Genesis Mandate ──────────────────────────────────────
  ipcMain.handle('onboarding:create-mandate', async (event, { project, projectPath }) => {
    try {
      const result = await execNucleus([
        '--json', 'mandate', 'create',
        '--project', project,
        '--path', projectPath
      ]);
      return { success: result.success !== false, result };
    } catch (err) {
      log.error('[IPC] onboarding:create-mandate — FAILED:', err.message);
      return { success: false, error: err.message };
    }
  });

  // ── HANDLER: Completar onboarding + handoff al workspace ────────────────
  ipcMain.handle('onboarding:complete', async (event, { workspaceUrl }) => {
    log.info('[IPC] onboarding:complete — workspaceUrl:', workspaceUrl || 'http://localhost:3000');
    try {
      const nucleusData = JSON.parse(fs.readFileSync(NUCLEUS_JSON, 'utf8'));
      nucleusData.onboarding = {
        ...nucleusData.onboarding,
        completed:     true,
        completed_at:  new Date().toISOString(),
        workspace_url: workspaceUrl || 'http://localhost:3000',
        current_step:  'success'
      };
      fs.writeFileSync(NUCLEUS_JSON, JSON.stringify(nucleusData, null, 2));

      const win = getWindow();
      if (win) {
        win.setResizable(true);
        win.setSize(1280, 800, true);
        win.center();
        await new Promise(r => setTimeout(r, 400));
        win.loadURL(nucleusData.onboarding.workspace_url);
        setTimeout(() => getWindow()?.maximize(), 600);
      }

      log.success('[IPC] onboarding:complete — ok');
      return { success: true };
    } catch (err) {
      log.error('[IPC] onboarding:complete — FAILED:', err.message);
      return { success: false, error: err.message };
    }
  });

  // ── HANDLER: Marcar un step como completado ─────────────────────────────
  // Llamado por el renderer cuando recibe confirmación externa (ej: Brain notifica
  // via bloom-host → extension → Conductor), o como fallback manual.
  // Escribe en onboarding.completed_steps[] en nucleus.json.
  ipcMain.handle('onboarding:mark-step-complete', async (event, { step }) => {
    log.info('[IPC] onboarding:mark-step-complete — step:', step);
    if (!step || !ONBOARDING_STEP_IDS.includes(step)) {
      log.warn('[IPC] onboarding:mark-step-complete — unknown step:', step);
      return { success: false, error: `Unknown step: ${step}` };
    }
    try {
      const data = JSON.parse(fs.readFileSync(NUCLEUS_JSON, 'utf8'));
      data.onboarding = data.onboarding || {};
      data.onboarding.completed_steps = data.onboarding.completed_steps || [];
      if (!data.onboarding.completed_steps.includes(step)) {
        data.onboarding.completed_steps.push(step);
        data.onboarding.updated_at = new Date().toISOString();
        fs.writeFileSync(NUCLEUS_JSON, JSON.stringify(data, null, 2));
        log.success('[IPC] onboarding:mark-step-complete — persisted:', step);
      } else {
        log.info('[IPC] onboarding:mark-step-complete — already present:', step);
      }
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
  //     completedSteps: string[],  // ej: ['nucleus_create', 'github_auth']
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
      const data = JSON.parse(fs.readFileSync(NUCLEUS_JSON, 'utf8'));
      const ob   = data.onboarding || {};

      const completedSteps = ob.completed_steps || [];
      const hasProgress    = !!ob.started && !ob.completed;
      const completed      = !!ob.completed;

      // Recuperar ruta y org del workspace — persistidos por onboarding:init-nucleus
      // al completar nucleus_create. Si nucleus_create no llegó a completar (ej: el
      // usuario cerró la app mientras `nucleus create` corría), caemos a los campos
      // *_pending escritos ANTES del spawn — así no se pierde lo que el usuario tipeó,
      // aunque el step formalmente no esté en completed_steps todavía.
      // Fallback final a bloom_base para builds más viejos sin estos campos.
      const bloomBase = data.system_map?.bloom_base || null;

      // github_username / github_org: persistidos opcionalmente por Brain cuando
      // procesa GITHUB_TOKEN_STORED. Permiten al renderer restaurar vault-username
      // y vault-org sin hacer un poll adicional al reabrir el onboarding.
      const workspaceState = {
        path:           ob.workspace_path  || ob.workspace_path_pending || (bloomBase ? require('path').dirname(bloomBase) : null),
        org:            ob.workspace_org   || ob.workspace_org_pending  || null,
        pending:        !ob.workspace_path && !!ob.workspace_path_pending,
        githubUsername: ob.github_username || ob.github_user || null,
        githubOrg:      ob.github_org      || ob.workspace_org || ob.workspace_org_pending || null,
      };

      log.success('[IPC] onboarding:get-resume-state — ok:', JSON.stringify({
        hasProgress, completed, completedSteps, currentStep: ob.current_step || null,
        workspaceState: { path: workspaceState.path, org: workspaceState.org },
      }));

      return {
        success:        true,
        hasProgress,
        completed,
        completedSteps,
        currentStep:    ob.current_step    || null,
        startedAt:      ob.started_at      || null,
        workspaceState,
      };
    } catch (err) {
      log.error('[IPC] onboarding:get-resume-state — FAILED:', err.message);
      return {
        success:        false,
        hasProgress:    false,
        completed:      false,
        completedSteps: [],
        currentStep:    null,
        workspaceState: { path: null, org: null, pending: false, githubUsername: null, githubOrg: null },
      };
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

  // ── HANDLER: Harness — inyectar milestone directamente al reactor ────────
  // Solo disponible en builds de desarrollo (!app.isPackaged).
  // Permite disparar handleMilestone() sin necesitar una cuenta real ni
  // que Brain emita el evento — útil para testear el flujo de UI completo.
  //
  // Payload: { stepId: string, data?: object }
  // Ejemplo: { stepId: 'github_auth', data: { username: 'test-user', org: 'bloom-labs' } }
  ipcMain.handle('harness:inject-milestone', async (event, { stepId, data = {} }) => {
    if (app.isPackaged) {
      log.warn('[HARNESS] inject-milestone rechazado — build empaquetado');
      return { success: false, error: 'harness not available in production builds' };
    }
    if (!stepId || typeof stepId !== 'string') {
      return { success: false, error: 'stepId is required' };
    }
    const reactor = getReactor?.();
    if (!reactor) {
      log.warn('[HARNESS] inject-milestone: reactor no disponible todavía');
      return { success: false, error: 'reactor not initialized — call after initOnboardingBridge()' };
    }
    log.info(`[HARNESS] inject-milestone → stepId: "${stepId}" data: ${JSON.stringify(data)}`);
    try {
      // Construir un enriched mínimo que el reactor entienda
      const enriched = {
        type:     'ONBOARDING_MILESTONE',
        event:    stepId.toUpperCase(),   // para que los handlers que inspeccionan enriched.event funcionen
        data,
        _ts:      Date.now(),
        _harness: true,                   // trazabilidad: este evento fue inyectado por harness
      };
      reactor.handleMilestone(stepId, enriched);
      log.info(`[HARNESS] inject-milestone ok — "${stepId}"`);
      return { success: true, stepId };
    } catch (err) {
      log.error(`[HARNESS] inject-milestone error — "${stepId}":`, err.message);
      return { success: false, error: err.message };
    }
  });
  // ── HANDLER: Persistir datos de GitHub para el mecanismo de resume ──────────
  // Llamado por el renderer cuando el milestone de github_auth llega con payload
  // completo y Brain no escribió github_username en nucleus.json por su cuenta.
  //
  // Payload: { username: string, org: string|null }
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