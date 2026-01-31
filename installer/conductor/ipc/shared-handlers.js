const { ipcMain, shell } = require('electron');
const fs = require('fs-extra');
const { paths } = require('../config/paths');
const { APP_VERSION, IS_LAUNCH_MODE, IS_DEV } = require('../config/constants');
const { isAllowedUrl } = require('../core/window-manager');

/**
 * Configura los handlers IPC compartidos entre ambos modos
 */
function setupSharedHandlers() {
  console.log('📡 Setting up Shared IPC handlers...');

  // Abrir carpeta de logs
  ipcMain.handle('open-logs-folder', async () => {
    await fs.ensureDir(paths.logsDir);
    await shell.openPath(paths.logsDir);
    return { success: true };
  });

  // Abrir URL permitida
  ipcMain.handle('open-url', async (event, url) => {
    if (isAllowedUrl(url)) {
      await shell.openExternal(url);
      return { success: true };
    }
    return { success: false, error: 'URL not allowed' };
  });

  // Abrir carpeta
  ipcMain.handle('open-folder', async (event, folderPath) => {
    await shell.openPath(folderPath);
    return { success: true };
  });

  // Abrir extensiones de Chrome
  ipcMain.handle('open-chrome-extensions', async () => {
    await shell.openExternal('chrome://extensions/');
    return { success: true };
  });

  // Abrir URL externa
  ipcMain.handle('open-external', async (event, url) => {
    await shell.openExternal(url);
    return { success: true };
  });

  // Obtener información de la aplicación
  ipcMain.handle('get-app-info', () => {
    return {
      version: APP_VERSION,
      mode: IS_LAUNCH_MODE ? 'launch' : 'install',
      isDev: IS_DEV,
      platform: process.platform
    };
  });
}

module.exports = { setupSharedHandlers };