// workspace/onboarding/ipc/onboarding-handlers.js
// Handlers IPC exclusivos del módulo onboarding.
// Paso 1: github_auth — steps como strings, poll lee completed_steps[] de nucleus.json
'use strict';

const fs   = require('fs');
const path = require('path');
const { ipcMain, dialog } = require('electron');
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

function registerOnboardingHandlers(execNucleus, NUCLEUS_JSON, getWindow) {

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

  // ── HANDLER: Inicializar Nucleus con streaming de output ────────────────
  ipcMain.handle('onboarding:init-nucleus', async (event, { org, path: nucleusPath }) => {
    log.info('[IPC] onboarding:init-nucleus — org:', org, '| path:', nucleusPath);
    return new Promise((resolve) => {
      const child = spawn(
        paths.nucleusExe,
        ['init', '--org', org, '--path', nucleusPath],
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
          // Fix C: persistir nucleus_create en completed_steps.
          // El reactor nunca recibe un evento Cortex para este step (cortex_events: []),
          // así que es responsabilidad del handler marcarlo al completar el proceso.
          try {
            const data = JSON.parse(fs.readFileSync(NUCLEUS_JSON, 'utf8'));
            data.onboarding = data.onboarding || {};
            data.onboarding.completed_steps = data.onboarding.completed_steps || [];
            if (!data.onboarding.completed_steps.includes('nucleus_create')) {
              data.onboarding.completed_steps.push('nucleus_create');
              data.onboarding.updated_at = new Date().toISOString();
              fs.writeFileSync(NUCLEUS_JSON, JSON.stringify(data, null, 2));
              log.success('[IPC] onboarding:init-nucleus — nucleus_create persisted in completed_steps');
            }
          } catch (e) {
            log.warn('[IPC] onboarding:init-nucleus — could not persist nucleus_create:', e.message);
          }
          resolve({ success: true, output: allOutput });
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

  // ── HANDLER: Bridge de logging desde el renderer ────────────────────────
  ipcMain.handle('onboarding:log', async (event, { level, message }) => {
    const msg = `[RENDERER] ${message}`;
    if      (level === 'error') log.error(msg);
    else if (level === 'warn')  log.warn(msg);
    else                        log.info(msg);
    return { success: true };
  });
}

module.exports = { registerOnboardingHandlers };