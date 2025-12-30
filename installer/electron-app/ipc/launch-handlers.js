const { ipcMain, shell } = require('electron');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process'); // Cambio de exec a spawn
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

  // ✅ HANDLER CORREGIDO PARA LAUNCHER
  ipcMain.handle('launcher:open', async (event, { onboarding = false }) => {
    const launcherPath = paths.launcherExe;
    
    console.log(`🚀 Opening launcher: ${launcherPath}`);
    console.log(`📌 Onboarding mode: ${onboarding}`);
    
    try {
      // Verificar existencia del ejecutable
      if (!await fs.pathExists(launcherPath)) {
        throw new Error(`BloomLauncher.exe not found at: ${launcherPath}`);
      }

      // Verificar dependencias críticas
      const binDir = path.dirname(launcherPath);
      const criticalFiles = [
        'resources.pak',
        path.join('resources', 'app.asar')
      ];

      for (const file of criticalFiles) {
        const filePath = path.join(binDir, file);
        if (!await fs.pathExists(filePath)) {
          console.warn(`⚠️ Missing dependency: ${filePath}`);
        }
      }

      // Construir argumentos como array (spawn requiere esto)
      const args = ['--mode=launch'];
      if (onboarding) {
        args.push('--onboarding');
      }

      console.log(`📋 Launch arguments:`, args);

      // Usar spawn en lugar de exec (mejor para argumentos complejos)
      return new Promise((resolve, reject) => {
        const child = spawn(launcherPath, args, {
          detached: true,
          stdio: 'ignore',
          cwd: binDir, // Importante: working directory
          windowsHide: false
        });

        // Desacoplar el proceso para que sobreviva al installer
        child.unref();

        // Timeout de 3 segundos para verificar que arrancó
        const timeout = setTimeout(() => {
          console.log('✅ BloomLauncher launched (detached)');
          resolve({ success: true });
        }, 3000);

        child.on('error', (error) => {
          clearTimeout(timeout);
          console.error('❌ Spawn error:', error);
          
          // Fallback: intentar con shell.openPath (solo abre, sin args)
          if (error.code === 'ENOENT' || error.code === 'EPERM') {
            console.log('🔄 Trying fallback: shell.openPath...');
            shell.openPath(launcherPath)
              .then(() => resolve({ 
                success: true, 
                warning: 'Launched without arguments (fallback)' 
              }))
              .catch(fallbackError => reject(new Error(
                `Both spawn and fallback failed: ${fallbackError.message}`
              )));
          } else {
            reject(error);
          }
        });

        child.on('exit', (code, signal) => {
          clearTimeout(timeout);
          if (code !== 0 && code !== null) {
            console.error(`❌ Process exited with code ${code}`);
            reject(new Error(`Launcher exited with code ${code}`));
          }
        });
      });

    } catch (error) {
      console.error('❌ Error in launcher:open handler:', error);
      throw new Error(`Failed to launch: ${error.message}`);
    }
  });

  console.log('✅ Launch Mode IPC handlers configured');
}

module.exports = { setupLaunchHandlers };