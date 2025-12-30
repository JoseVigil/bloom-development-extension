const { ipcMain, shell, app } = require('electron'); // ← AGREGADO app
const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
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

  // ✅ HANDLER CORREGIDO PARA LAUNCHER (CON SOPORTE DESARROLLO)
  ipcMain.handle('launcher:open', async (event, { onboarding = false } = {}) => {
    try {
      // 🔧 MODO DESARROLLO: Usar proceso principal directamente
      if (!app.isPackaged) {
        console.log('🔧 Development mode detected - launching main process');
        
        const mainPath = path.join(__dirname, '..', 'main.js');
        const electronPath = process.execPath;
        
        const args = [
          mainPath,
          '--mode=launch',
          ...(onboarding ? ['--onboarding'] : [])
        ];
        
        console.log('📋 Dev launch:', electronPath);
        console.log('📋 Args:', args);
        
        return new Promise((resolve, reject) => {
          const child = spawn(electronPath, args, {
            detached: true,
            stdio: 'ignore',
            windowsHide: false
          });
          
          child.unref();
          
          const timeout = setTimeout(() => {
            console.log('✅ Launcher started in development mode');
            resolve({ success: true, mode: 'development' });
          }, 2000);
          
          child.on('error', (error) => {
            clearTimeout(timeout);
            console.error('❌ Dev launch error:', error);
            reject(error);
          });
        });
      }
      
      // 📦 MODO PRODUCCIÓN: Usar BloomLauncher.exe copiado
      const launcherPath = paths.launcherExe;
      
      console.log(`🚀 Opening launcher: ${launcherPath}`);
      console.log(`📌 Onboarding mode: ${onboarding}`);
      
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

      // Construir argumentos
      const args = ['--mode=launch'];
      if (onboarding) {
        args.push('--onboarding');
      }

      console.log(`📋 Launch arguments:`, args);

      // Lanzar proceso
      return new Promise((resolve, reject) => {
        const child = spawn(launcherPath, args, {
          detached: true,
          stdio: 'ignore',
          cwd: binDir,
          windowsHide: false
        });

        child.unref();

        const timeout = setTimeout(() => {
          console.log('✅ BloomLauncher launched (production)');
          resolve({ success: true, mode: 'production' });
        }, 3000);

        child.on('error', (error) => {
          clearTimeout(timeout);
          console.error('❌ Spawn error:', error);
          
          // Fallback: intentar con shell.openPath
          if (error.code === 'ENOENT' || error.code === 'EPERM') {
            console.log('🔄 Trying fallback: shell.openPath...');
            shell.openPath(launcherPath)
              .then(() => resolve({ 
                success: true, 
                mode: 'production',
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

  /**
   * Handler para diagnosticar problemas del launcher
   */
  ipcMain.handle('launcher:diagnose', async () => {
    console.log('\n🔍 === DIAGNÓSTICO DEL LAUNCHER ===\n');
    
    const diagnosis = {
      mode: app.isPackaged ? 'production' : 'development',
      timestamp: new Date().toISOString(),
      checks: {}
    };

    try {
      // Check 1: Ejecutable principal del installer
      const mainExe = app.getPath('exe');
      const mainDir = path.dirname(mainExe);
      
      diagnosis.checks.installer = {
        exe: mainExe,
        dir: mainDir,
        isPackaged: app.isPackaged
      };

      // Listar contenido del directorio del installer
      if (await fs.pathExists(mainDir)) {
        diagnosis.checks.installer.contents = await fs.readdir(mainDir);
      }

      // Check 2: Resources del installer
      const installerResourcesDir = path.join(mainDir, 'resources');
      diagnosis.checks.installerResources = {
        path: installerResourcesDir,
        exists: await fs.pathExists(installerResourcesDir)
      };

      if (diagnosis.checks.installerResources.exists) {
        const files = await fs.readdir(installerResourcesDir);
        diagnosis.checks.installerResources.contents = [];
        
        for (const file of files) {
          const filePath = path.join(installerResourcesDir, file);
          const stats = await fs.stat(filePath);
          diagnosis.checks.installerResources.contents.push({
            name: file,
            isDirectory: stats.isDirectory(),
            size: stats.size,
            sizeMB: (stats.size / 1024 / 1024).toFixed(2)
          });
        }
      }

      // Check 3: BloomLauncher.exe
      diagnosis.checks.launcher = {
        path: paths.launcherExe || path.join(paths.bin, 'BloomLauncher.exe'),
        exists: await fs.pathExists(paths.launcherExe || path.join(paths.bin, 'BloomLauncher.exe'))
      };

      if (diagnosis.checks.launcher.exists) {
        const stats = await fs.stat(diagnosis.checks.launcher.path);
        diagnosis.checks.launcher.size = stats.size;
        diagnosis.checks.launcher.sizeMB = (stats.size / 1024 / 1024).toFixed(2);
      }

      // Check 4: bin/ directory
      diagnosis.checks.bin = {
        path: paths.bin,
        exists: await fs.pathExists(paths.bin)
      };

      if (diagnosis.checks.bin.exists) {
        const files = await fs.readdir(paths.bin);
        diagnosis.checks.bin.contents = [];
        
        for (const file of files) {
          const filePath = path.join(paths.bin, file);
          const stats = await fs.stat(filePath);
          diagnosis.checks.bin.contents.push({
            name: file,
            isDirectory: stats.isDirectory(),
            size: stats.size,
            sizeMB: (stats.size / 1024 / 1024).toFixed(2)
          });
        }
      }

      // Check 5: Launcher resources
      const launcherResourcesDir = path.join(paths.bin, 'resources');
      diagnosis.checks.launcherResources = {
        path: launcherResourcesDir,
        exists: await fs.pathExists(launcherResourcesDir)
      };

      if (diagnosis.checks.launcherResources.exists) {
        const files = await fs.readdir(launcherResourcesDir);
        diagnosis.checks.launcherResources.contents = [];
        
        for (const file of files) {
          const filePath = path.join(launcherResourcesDir, file);
          const stats = await fs.stat(filePath);
          diagnosis.checks.launcherResources.contents.push({
            name: file,
            isDirectory: stats.isDirectory(),
            size: stats.size,
            sizeMB: (stats.size / 1024 / 1024).toFixed(2)
          });
        }
      }

      // Check 6: app.asar específicamente
      const appAsarPath = path.join(launcherResourcesDir, 'app.asar');
      diagnosis.checks.appAsar = {
        path: appAsarPath,
        exists: await fs.pathExists(appAsarPath)
      };

      if (diagnosis.checks.appAsar.exists) {
        const stats = await fs.stat(appAsarPath);
        diagnosis.checks.appAsar.size = stats.size;
        diagnosis.checks.appAsar.sizeMB = (stats.size / 1024 / 1024).toFixed(2);
      }

      // Resumen
      diagnosis.valid = 
        diagnosis.checks.launcher.exists &&
        diagnosis.checks.launcherResources.exists &&
        diagnosis.checks.appAsar.exists;

      console.log('📊 RESUMEN DEL DIAGNÓSTICO:');
      console.log(`   Modo: ${diagnosis.mode}`);
      console.log(`   Launcher EXE: ${diagnosis.checks.launcher.exists ? '✅' : '❌'}`);
      console.log(`   Resources Dir: ${diagnosis.checks.launcherResources.exists ? '✅' : '❌'}`);
      console.log(`   app.asar: ${diagnosis.checks.appAsar.exists ? '✅' : '❌'}`);
      console.log(`   Estado: ${diagnosis.valid ? '✅ VÁLIDO' : '❌ INVÁLIDO'}\n`);

      return diagnosis;

    } catch (error) {
      diagnosis.error = error.message;
      diagnosis.stack = error.stack;
      console.error('❌ Error en diagnóstico:', error.message, '\n');
      return diagnosis;
    }
  });

  console.log('✅ Launch Mode IPC handlers configured');
}

module.exports = { setupLaunchHandlers };