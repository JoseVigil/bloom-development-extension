// workspace/onboarding/ipc/onboarding-handlers.js
// Handlers IPC exclusivos del módulo onboarding.
'use strict';

const fs   = require('fs');
const { ipcMain, dialog } = require('electron');
const { spawn } = require('child_process');
const { getLogger } = require('../../../shared/logger');
const { paths } = require('../../../shared/global_paths');

const log = getLogger('onboarding');

function registerOnboardingHandlers(execNucleus, NUCLEUS_JSON, getWindow) {

  // ── HANDLER: Lanzar Discovery en modo registro ──────────────────────────
  ipcMain.handle('onboarding:launch-discovery', async (event, { email }) => {
    log.info('[IPC] onboarding:launch-discovery — email:', email || '(none)');
    try {
      const nucleusData = JSON.parse(fs.readFileSync(NUCLEUS_JSON, 'utf8'));
      const profileId = nucleusData.master_profile;
      if (!profileId) throw new Error('master_profile not found');

      const args = [
        '--json', 'synapse', 'launch', profileId,
        '--mode', 'discovery',
        '--override-register', 'true',
        '--override-heartbeat', 'false',
        '--override-service', 'google'   
      ];
      if (email) args.push('--override-email', email);

      const result = await execNucleus(args, 30000);
      log.success('[IPC] onboarding:launch-discovery — ok');
      return { success: result.success !== false, profileId, result };
    } catch (err) {
      log.error('[IPC] onboarding:launch-discovery — FAILED:', err.message);
      return { success: false, error: err.message };
    }
  });

  // ── HANDLER: Enviar step de onboarding a Chrome ─────────────────────────
  ipcMain.handle('onboarding:navigate', async (event, { step, email, service }) => {
    log.info('[IPC] onboarding:navigate — step:', step);

    // Helper para persistir el step en nucleus.json (siempre, independiente de nucleus)
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

      // nucleus --json synapse onboarding <profileId> --step <step>
      const result = await execNucleus(
        ['--json', 'synapse', 'onboarding', profileId, '--step', step],
        10000
      );

      // result esperado: { success: true, profile_id, step, request_id, status: "routed" }
      const success = result.success !== false && result.status === 'routed';

      persistStep(step);
      log.success('[IPC] onboarding:navigate — ok:', JSON.stringify(result));
      return { success, result };
    } catch (err) {
      log.error('[IPC] onboarding:navigate — FAILED:', err.message);
      // Persistir localmente igual para no perder el estado de UI
      persistStep(step);
      return { success: false, error: err.message };
    }
  });

  // ── HANDLER: Polling de identidad ───────────────────────────────────────
  ipcMain.handle('onboarding:poll-identity', async () => {
    log.info('[IPC] onboarding:poll-identity');
    try {
      const nucleusData = JSON.parse(fs.readFileSync(NUCLEUS_JSON, 'utf8'));

      // NOTA: nucleus --json synapse status NO devuelve campo identity.
      // Su response es: { success, status: { profile_id, state, sentinel_running, ... } }
      // Las cuentas autenticadas las escribe Brain en nucleus.json bajo onboarding.accounts[]
      // cuando el usuario se autentica en Chrome via Cortex. Leemos directo de ahi.

      const accounts = nucleusData.onboarding?.accounts || [];
      const resolved = {
        google: accounts.some(a => a.provider === 'google' && a.status === 'active'),
        gemini: accounts.some(a => a.provider === 'gemini' && a.status === 'active'),
        github: accounts.some(a => a.provider === 'github' && a.status === 'active')
      };

      log.success('[IPC] onboarding:poll-identity — ok:', JSON.stringify(resolved));
      return { success: true, accounts: resolved };
    } catch (err) {
      log.error('[IPC] onboarding:poll-identity — FAILED:', err.message);
      return { success: false, accounts: { google: false, gemini: false, github: false } };
    }
  });

  // ── HANDLER: Folder picker nativo ───────────────────────────────────────
  // FIX: usa getWindow() en lugar de mainWindow (que era undefined en este scope)
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
  // FIX: usa getWindow() en lugar de mainWindow (que era undefined en este scope)
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