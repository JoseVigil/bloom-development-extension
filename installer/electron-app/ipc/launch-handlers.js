const { ipcMain } = require('electron');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { paths } = require('../config/paths');
const { APP_VERSION } = require('../config/constants');
const {
  checkHealthStatus,
  checkOnboardingStatus
} = require('../launch/health-monitor');
const {
  listProfiles,
  launchProfile,
  createProfile
} = require('../launch/profile-manager');

/**
 * Configura los handlers IPC para el modo lanzamiento
 */
function setupLaunchHandlers() {
  console.log('📡 Setting up Launch Mode IPC handlers...');

  // Health & Onboarding
  ipcMain.handle('health:check', async () => {
    return await checkHealthStatus();
  });

  ipcMain.handle('onboarding:status', async () => {
    return await checkOnboardingStatus();
  });

  // Profile Management
  ipcMain.handle('profile:list', async () => {
    return await listProfiles();
  });

  ipcMain.handle('profile:launch', async (event, { profileId, url }) => {
    return await launchProfile(profileId, url);
  });

  ipcMain.handle('profile:create', async (event, { name, type }) => {
    return await createProfile(name, type);
  });

  // Logs
  ipcMain.handle('logs:tail', async (event, { lines = 50 }) => {
    try {
      const logFile = path.join(paths.logsDir, 'brain.log');
      
      if (!await fs.pathExists(logFile)) {
        return { success: true, logs: [] };
      }

      const content = await fs.readFile(logFile, 'utf-8');
      const logLines = content.split('\n').slice(-lines);
      
      return { success: true, logs: logLines };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // System Info
  ipcMain.handle('system:info', async () => {
    return {
      platform: os.platform(),
      arch: os.arch(),
      version: APP_VERSION,
      paths: {
        bloomBase: paths.bloomBase,
        runtime: paths.runtimeDir,
        brain: paths.brainSource,
        native: paths.nativeDir,
        config: paths.configDir,
        logs: paths.logsDir
      }
    };
  });
}

module.exports = { setupLaunchHandlers };