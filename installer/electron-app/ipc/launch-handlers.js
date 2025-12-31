// ipc/launch-handlers.js
const { ipcMain } = require('electron');
const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');

const execAsync = promisify(exec);

let mainWindow = null;

function setupLaunchHandlers() {
  console.log('📡 Setting up launch IPC handlers...');

  // ============================================================================
  // ONBOARDING HANDLERS
  // ============================================================================

  ipcMain.handle('onboarding:status', async () => {
    try {
      const brainPath = path.join(__dirname, '..', 'brain', 'brain.py');
      const { stdout } = await execAsync(`python "${brainPath}" onboarding status --json`);
      
      const result = JSON.parse(stdout);
      console.log('✅ Onboarding status:', result);
      
      return {
        success: true,
        completed: result.completed || false,
        steps: result.steps || {}
      };
    } catch (error) {
      console.error('❌ Error checking onboarding status:', error);
      return {
        success: false,
        completed: false,
        error: error.message
      };
    }
  });

  ipcMain.handle('onboarding:complete', async (event, data) => {
    try {
      const brainPath = path.join(__dirname, '..', 'brain', 'brain.py');
      await execAsync(`python "${brainPath}" onboarding complete`);
      
      console.log('✅ Onboarding marked as complete');
      
      // Notify all windows
      if (mainWindow) {
        mainWindow.webContents.send('onboarding:completed');
      }
      
      return { success: true };
    } catch (error) {
      console.error('❌ Error completing onboarding:', error);
      return {
        success: false,
        error: error.message
      };
    }
  });

  ipcMain.handle('onboarding:reset', async () => {
    try {
      const brainPath = path.join(__dirname, '..', 'brain', 'brain.py');
      await execAsync(`python "${brainPath}" onboarding reset`);
      
      console.log('🔄 Onboarding reset');
      
      return { success: true };
    } catch (error) {
      console.error('❌ Error resetting onboarding:', error);
      return {
        success: false,
        error: error.message
      };
    }
  });

  // ============================================================================
  // HEALTH CHECK HANDLERS
  // ============================================================================

  ipcMain.handle('health:check', async () => {
    try {
      // Only run health checks if onboarding is complete
      const onboardingResult = await ipcMain.handle('onboarding:status', {});
      
      if (!onboardingResult.completed) {
        return {
          success: true,
          status: 'pending-onboarding',
          message: 'Health checks disabled until onboarding is complete'
        };
      }

      const brainPath = path.join(__dirname, '..', 'brain', 'brain.py');
      const { stdout } = await execAsync(`python "${brainPath}" health check --json`);
      
      const result = JSON.parse(stdout);
      
      return {
        success: true,
        status: result.status || 'unknown',
        checks: result.checks || [],
        issues: result.issues || []
      };
    } catch (error) {
      console.error('❌ Error running health check:', error);
      return {
        success: false,
        status: 'error',
        error: error.message
      };
    }
  });

  // ============================================================================
  // PROFILE MANAGEMENT
  // ============================================================================

  ipcMain.handle('profiles:list', async () => {
    try {
      const brainPath = path.join(__dirname, '..', 'brain', 'brain.py');
      const { stdout } = await execAsync(`python "${brainPath}" profiles list --json`);
      
      const result = JSON.parse(stdout);
      
      return {
        success: true,
        profiles: result.profiles || []
      };
    } catch (error) {
      console.error('❌ Error listing profiles:', error);
      return {
        success: false,
        profiles: [],
        error: error.message
      };
    }
  });

  ipcMain.handle('profiles:launch', async (event, profileId, url) => {
    try {
      const brainPath = path.join(__dirname, '..', 'brain', 'brain.py');
      const urlArg = url ? `--url "${url}"` : '';
      const { stdout } = await execAsync(`python "${brainPath}" profiles launch "${profileId}" ${urlArg}`);
      
      const result = JSON.parse(stdout);
      
      return {
        success: true,
        pid: result.pid,
        profileId
      };
    } catch (error) {
      console.error('❌ Error launching profile:', error);
      return {
        success: false,
        error: error.message
      };
    }
  });

  // ============================================================================
  // APP INFO
  // ============================================================================

  ipcMain.handle('app:info', async () => {
    return {
      success: true,
      version: require('../package.json').version,
      mode: 'launch',
      platform: process.platform
    };
  });

  // ============================================================================
  // LOGS
  // ============================================================================

  ipcMain.handle('logs:tail', async (event, lines = 50) => {
    try {
      const fs = require('fs');
      const logPath = path.join(__dirname, '..', 'logs', 'bloom.log');
      
      if (!fs.existsSync(logPath)) {
        return {
          success: true,
          logs: []
        };
      }

      const content = fs.readFileSync(logPath, 'utf-8');
      const allLines = content.split('\n').filter(line => line.trim());
      const lastLines = allLines.slice(-lines);
      
      return {
        success: true,
        logs: lastLines
      };
    } catch (error) {
      console.error('❌ Error tailing logs:', error);
      return {
        success: false,
        logs: [],
        error: error.message
      };
    }
  });

  ipcMain.handle('logs:open-folder', async () => {
    try {
      const { shell } = require('electron');
      const logDir = path.join(__dirname, '..', 'logs');
      await shell.openPath(logDir);
      
      return { success: true };
    } catch (error) {
      console.error('❌ Error opening logs folder:', error);
      return {
        success: false,
        error: error.message
      };
    }
  });

  // ============================================================================
  // SHELL COMMANDS
  // ============================================================================

  ipcMain.handle('shell:openExternal', async (event, url) => {
    try {
      const { shell } = require('electron');
      await shell.openExternal(url);
      
      return { success: true };
    } catch (error) {
      console.error('❌ Error opening external URL:', error);
      return {
        success: false,
        error: error.message
      };
    }
  });

  console.log('✅ Launch IPC handlers registered');
}

function setMainWindow(window) {
  mainWindow = window;
}

module.exports = {
  setupLaunchHandlers,
  setMainWindow
};