'use strict';

const fs = require('fs');
const { spawn } = require('child_process');
const { ipcMain } = require('electron');

function execJson(exe, args, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', code => {
      clearTimeout(timer);
      if (timedOut) { reject(new Error('timeout')); return; }
      let result;
      try {
        result = JSON.parse(stdout.trim());
      } catch (error) {
        reject(new Error(stdout.trim() ? error.message : (stderr.trim() || `exit_${code}`)));
        return;
      }
      if (code !== 0 || result.status === 'error') reject(new Error(result.error?.code || `exit_${code}`));
      else resolve(result);
    });
  });
}

function registerIntelligenceSupplyHandlers(execNucleus, nucleusConfigPath, aitapExe, logger = console) {
  ipcMain.handle('core:intelligence-supply-read', async () => {
    let selection;
    try {
      const config = JSON.parse(fs.readFileSync(nucleusConfigPath, 'utf8'));
      const onboarding = config.onboarding || {};
      selection = {
        source: 'conductor',
        org_slug: onboarding.active_org_slug || null,
        project_id: onboarding.active_project_id || null
      };
    } catch (error) {
      selection = { source: 'conductor', org_slug: null, project_id: null, error: 'selection_unavailable' };
      logger.warn('[SUPPLY] selection unavailable:', error.message);
    }

    const capture = async (source, operation) => {
      try { return { source, status: 'available', result: await operation() }; }
      catch (error) {
        logger.warn(`[SUPPLY] ${source} read unavailable:`, error.message);
        return { source, status: 'unavailable', error: error.message };
      }
    };

    const nucleus = selection.org_slug
      ? await capture('nucleus', () => execNucleus(['--json', 'authority', 'supply-read', selection.org_slug, selection.project_id || '-']))
      : { source: 'nucleus', status: 'unavailable', error: 'selection_unavailable' };
    const [availability, consumption] = await Promise.all([
      capture('aitap', () => execJson(aitapExe, ['--json', 'local', 'preflight'])),
      capture('aitap', () => execJson(aitapExe, ['--json', 'accounting', 'usage']))
    ]);
    return { read_at: new Date().toISOString(), selection, nucleus, availability, consumption };
  });
}

module.exports = { registerIntelligenceSupplyHandlers };
