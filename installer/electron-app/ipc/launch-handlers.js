// ipc/launch-handlers.js
const { ipcMain } = require('electron');
const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');

const execAsync = promisify(exec);

let mainWindow = null;

function setMainWindow(window) {
  mainWindow = window;
}

function setupLaunchHandlers() {
  console.log('📡 Setting up launch IPC handlers...');

  const projectRoot = path.join(__dirname, '..'); // electron-app/

  // ============================================================================
  // ONBOARDING STATUS
  // ============================================================================
  ipcMain.removeAllListeners('onboarding:status');
  ipcMain.handle('onboarding:status', async () => {
    try {
      const brainCommand = process.platform === 'win32'
        ? 'python -m brain --json health onboarding-check'
        : 'python3 -m brain --json health onboarding-check';

      const { stdout } = await execAsync(brainCommand, {
        cwd: projectRoot,
        windowsHide: true,
        timeout: 15000
      });

      const result = JSON.parse(stdout);

      if (result.status !== 'success') {
        return { success: false, completed: false, error: 'Invalid brain response' };
      }

      return {
        success: true,
        completed: result.data.ready === true,
        current_step: result.data.current_step || 'unknown',
        details: result.data.details || {}
      };
    } catch (error) {
      console.error('❌ Onboarding status error:', error.message || error);
      return { success: false, completed: false, error: error.message || 'Brain CLI failed' };
    }
  });

  // ============================================================================
  // HEALTH CHECK
  // ============================================================================
  ipcMain.removeAllListeners('health:check');
  ipcMain.handle('health:check', async () => {
    try {
      const onboardingResult = await ipcMain.handle('onboarding:status');

      if (!onboardingResult.success || !onboardingResult.completed) {
        return {
          success: true,
          status: 'pending-onboarding',
          message: 'Complete onboarding first'
        };
      }

      const brainCommand = process.platform === 'win32'
        ? 'python -m brain --json health full-stack'
        : 'python3 -m brain --json health full-stack';

      const { stdout } = await execAsync(brainCommand, {
        cwd: projectRoot,
        windowsHide: true,
        timeout: 20000
      });

      const result = JSON.parse(stdout);

      return {
        success: true,
        status: result.status || 'unknown',
        checks: result.checks || [],
        issues: result.issues || []
      };
    } catch (error) {
      console.error('❌ Health check error:', error.message || error);
      return { success: false, status: 'error', error: error.message || 'Unknown' };
    }
  });

  // ============================================================================
  // APP INFO & SHELL
  // ============================================================================
  ipcMain.removeAllListeners('app:info');
  ipcMain.handle('app:info', () => ({
    success: true,
    version: '1.0.0',
    mode: 'launch',
    platform: process.platform
  }));

  ipcMain.removeAllListeners('shell:openExternal');
  ipcMain.handle('shell:openExternal', async (event, url) => {
    const { shell } = require('electron');
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  console.log('✅ Launch IPC handlers registered');
}

module.exports = {
  setupLaunchHandlers,
  setMainWindow
};