// ipc/launch-handlers.js
const { ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const { paths } = require('../config/paths');

let mainWindow = null;

function setMainWindow(window) {
  mainWindow = window;
}

/**
 * ✅ MIGRATED: Helper to execute Brain CLI with direct execution
 */
async function execBrainJson(args, options = {}) {
  return new Promise((resolve, reject) => {
    const pythonPath = paths.pythonExe;
    const brainMainPy = path.join(paths.brainDir, '__main__.py');

    // ✅ Direct execution - python brain/__main__.py --json [command] [args]
    const fullArgs = [brainMainPy, '--json', ...args];

    console.log(`[launch-handlers] ${pythonPath} ${fullArgs.join(' ')}`);

    const child = spawn(pythonPath, fullArgs, {
      cwd: paths.brainDir,
      windowsHide: true,
      timeout: options.timeout || 15000,
      // ✅ NO PYTHONPATH needed - brain handles sys.path internally
      env: {
        ...process.env,
        PYTHONNOUSERSITE: '1'
      }
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    const timeoutId = setTimeout(() => {
      child.kill();
      reject(new Error(`Timeout after ${options.timeout || 15000}ms`));
    }, options.timeout || 15000);

    child.on('close', (code) => {
      clearTimeout(timeoutId);

      if (code !== 0) {
        reject(new Error(`Brain exited with code ${code}: ${stderr || stdout}`));
        return;
      }

      try {
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch (err) {
        reject(new Error(`Failed to parse JSON: ${err.message}\nOutput: ${stdout}`));
      }
    });

    child.on('error', (err) => {
      clearTimeout(timeoutId);
      reject(new Error(`Failed to spawn: ${err.message}`));
    });
  });
}

function setupLaunchHandlers() {
  console.log('📡 Setting up launch IPC handlers...');

  // ============================================================================
  // ONBOARDING STATUS
  // ============================================================================
  ipcMain.removeAllListeners('onboarding:status');
  ipcMain.handle('onboarding:status', async () => {
    try {
      const result = await execBrainJson(['health', 'onboarding-status'], {
        timeout: 15000
      });

      if (result.status !== 'success') {
        return { 
          success: false, 
          completed: false, 
          error: result.error || 'Invalid brain response' 
        };
      }

      return {
        success: true,
        completed: result.data.ready === true,
        current_step: result.data.current_step || 'unknown',
        details: result.data.details || {}
      };
    } catch (error) {
      console.error('❌ Onboarding status error:', error.message || error);
      return { 
        success: false, 
        completed: false, 
        error: error.message || 'Brain CLI failed' 
      };
    }
  });

  // ============================================================================
  // HEALTH CHECK
  // ============================================================================
  ipcMain.removeAllListeners('health:check');
  ipcMain.handle('health:check', async () => {
    try {
      // First check onboarding
      const onboardingResult = await ipcMain.handle('onboarding:status');

      if (!onboardingResult.success || !onboardingResult.completed) {
        return {
          success: true,
          status: 'pending-onboarding',
          message: 'Complete onboarding first'
        };
      }

      // Run full stack health check
      const result = await execBrainJson(['health', 'full-stack'], {
        timeout: 20000
      });

      return {
        success: true,
        status: result.status || 'unknown',
        checks: result.checks || [],
        issues: result.issues || []
      };
    } catch (error) {
      console.error('❌ Health check error:', error.message || error);
      return { 
        success: false, 
        status: 'error', 
        error: error.message || 'Unknown' 
      };
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

  console.log('✅ Launch IPC handlers registered (direct execution mode)');
}

module.exports = {
  setupLaunchHandlers,
  setMainWindow
};