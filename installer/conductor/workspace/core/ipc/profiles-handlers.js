// ipc/profiles-handlers.js — Bloom Conductor
// Handlers: nucleus:list-profiles, nucleus:launch-profile,
//           nucleus:create-profile, nucleus:get-installation
//
// Todos los comandos usan el flag --json delante del subcomando,
// siguiendo la convención de nucleus.exe:
//   nucleus --json <subcommand> [args]

'use strict';

const fs   = require('fs');
const path = require('path');
const { ipcMain } = require('electron');

/**
 * registerProfilesHandlers(execNucleus, NUCLEUS_JSON)
 *
 * @param {Function} execNucleus  - instancia compartida de execNucleus
 * @param {string}   NUCLEUS_JSON - path absoluto a nucleus.json
 * @param {object}   [logger=console] - logger de Core inyectado (getLogger('core'))
 */
function registerProfilesHandlers(execNucleus, NUCLEUS_JSON, logger = console) {

  // ── nucleus:list-profiles ───────────────────────────────────────────────
  // Comando: nucleus --json profile list
  //
  // Shape esperada del binario:
  // {
  //   "success": true,
  //   "profiles": [
  //     { "id": "prf_...", "name": "...", "state": "RUNNING"|"STOPPED", ... }
  //   ]
  // }
  //
  // Shape devuelta al renderer:
  // { success: true, profiles: [{ id, name, state, ... }] }
  ipcMain.handle('nucleus:list-profiles', async () => {
    try {
      const result = await execNucleus(['--json', 'profile', 'list'], 10000);
      logger.info(`[PROFILES] list-profiles → ${(result.profiles || []).length} perfiles`);
      return {
        success:  result.success !== false,
        profiles: result.profiles || []
      };
    } catch (err) {
      logger.error('[PROFILES] list-profiles failed:', err.message);
      return { success: false, profiles: [], error: err.message };
    }
  });

  // ── nucleus:launch-profile ──────────────────────────────────────────────
  // Comando: nucleus --json synapse launch <profileId>
  //
  // Shape esperada del binario:
  // { "success": true, "profile_id": "prf_..." }
  //
  // Shape devuelta al renderer:
  // { success: true, profileId }
  ipcMain.handle('nucleus:launch-profile', async (event, profileId) => {
    if (!profileId || typeof profileId !== 'string') {
      logger.warn('[PROFILES] launch-profile llamado sin profileId');
      return { success: false, error: 'profileId is required' };
    }
    logger.info(`[PROFILES] Lanzando perfil ${profileId}...`);
    try {
      const result = await execNucleus(
        ['--json', 'synapse', 'launch', profileId],
        30000
      );
      logger.info(`[PROFILES] Perfil ${profileId} lanzado. success=${result.success !== false}`);
      return {
        success:   result.success !== false,
        profileId,
        result
      };
    } catch (err) {
      logger.error(`[PROFILES] launch-profile ${profileId} failed:`, err.message);
      return { success: false, profileId, error: err.message };
    }
  });

  // ── nucleus:create-profile ──────────────────────────────────────────────
  // Comando: nucleus --json profile create --name <profileName>
  //
  // Shape esperada del binario:
  // { "success": true, "profile": { "id": "prf_...", "name": "..." } }
  //
  // Shape devuelta al renderer:
  // { success: true, profile: { id, name } }
  ipcMain.handle('nucleus:create-profile', async (event, profileName) => {
    if (!profileName || typeof profileName !== 'string' || !profileName.trim()) {
      logger.warn('[PROFILES] create-profile llamado sin profileName válido');
      return { success: false, error: 'profileName is required' };
    }
    try {
      const result = await execNucleus(
        ['--json', 'profile', 'create', '--name', profileName.trim()],
        15000
      );
      logger.info(`[PROFILES] Perfil creado: ${profileName.trim()}`);
      return {
        success: result.success !== false,
        profile: result.profile || null,
        result
      };
    } catch (err) {
      logger.error(`[PROFILES] create-profile "${profileName}" failed:`, err.message);
      return { success: false, profile: null, error: err.message };
    }
  });

  // ── nucleus:get-installation ────────────────────────────────────────────
  // Lee nucleus.json directamente — no invoca el binario.
  // El Conductor ya es dueño de este archivo (lo escribe en onboarding:complete).
  //
  // Shape devuelta al renderer:
  // {
  //   success: true,
  //   installation: { completed, version, ... },
  //   onboarding:   { completed, current_step, workspace_url, ... }
  // }
  ipcMain.handle('nucleus:get-installation', async () => {
    try {
      if (!fs.existsSync(NUCLEUS_JSON)) {
        logger.warn('[PROFILES] get-installation: nucleus.json no encontrado');
        return { success: false, error: 'nucleus.json not found' };
      }
      const data = JSON.parse(fs.readFileSync(NUCLEUS_JSON, 'utf8'));
      return {
        success:      true,
        installation: data.installation || null,
        onboarding:   data.onboarding   || null,
        raw:          data
      };
    } catch (err) {
      logger.error('[PROFILES] get-installation failed:', err.message);
      return { success: false, error: err.message };
    }
  });

}

module.exports = { registerProfilesHandlers };