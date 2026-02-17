const { ipcMain, BrowserWindow } = require('electron');
const fs = require('fs-extra');
const { execSync } = require('child_process');
const net = require('net');
const path = require('path');
const { installService } = require('../install/installer');
const { paths } = require('../config/paths');
const { DEFAULT_PORT } = require('../config/constants');
const { isElevated } = require('../core/admin-utils');

/**
 * Verifica si VC++ Redistributable está instalado
 */
async function checkVCRedistInstalled() {
  if (process.platform !== 'win32') return true;
  
  try {
    const systemRoot = process.env.SystemRoot || 'C:\\Windows';
    const system32 = require('path').join(systemRoot, 'System32');
    const requiredDlls = ['vcruntime140.dll', 'msvcp140.dll'];

    for (const dll of requiredDlls) {
      const exists = await fs.pathExists(require('path').join(system32, dll));
      if (!exists) return false;
    }
    
    return true;
  } catch {
    return false;
  }
}



  /**
   * Configura los handlers IPC para el modo instalación
   */
  function setupInstallHandlers() {
    console.log('📡 Setting up Install Mode IPC handlers...');
    

    // Handler principal de instalación
    ipcMain.handle('brain:install-extension', async () => {
    const mainWindow = BrowserWindow.getFocusedWindow();
    return await installService(mainWindow);
  });

  // Handler para lanzar el perfil maestro después de la instalación
  ipcMain.handle('brain:launch', async () => {
    try {
      const config = await fs.readJson(paths.configFile);
      const profileId = config.masterProfileId;
      
      if (!profileId) {
        throw new Error("No master profile found");
      }

      // ✅ Verificar si el perfil necesita seed
      const synapseManifest = path.join(
        paths.profilesDir, 
        profileId, 
        'synapse', 
        `com.bloom.synapse.${profileId}.json`
      );

      if (!await fs.pathExists(synapseManifest)) {
        console.log("🌱 Profile needs seeding first");
        
        // Ejecutar seed
        const seedCmd = `"${paths.nucleusExe}" seed --profile "${profileId}"`;
        execSync(seedCmd, { 
          encoding: 'utf8',
          timeout: 30000 
        });
        
        console.log("✅ Seed completed");
      }

      // Solo ahora ejecutar launch
      const launchCmd = `"${paths.nucleusExe}" launch --profile "${profileId}"`;
      const output = execSync(launchCmd, {
        encoding: 'utf8',
        timeout: 10000
      });

      return { success: true, output };

    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Handler para verificar conexión con la extensión
  ipcMain.handle('extension:heartbeat', async () => {
    try {
      return new Promise((resolve) => {
        const client = new net.Socket();
        client.setTimeout(2000);

        client.connect(DEFAULT_PORT, '127.0.0.1', () => {
          client.destroy();
          resolve({ chromeConnected: true });
        });

        client.on('error', () => {
          resolve({ chromeConnected: false });
        });

        client.on('timeout', () => {
          client.destroy();
          resolve({ chromeConnected: false });
        });
      });
    } catch (error) {
      return { chromeConnected: false, error: error.message };
    }
  });

  // Handler para verificaciones previas
  ipcMain.handle('preflight-checks', async () => {
    return {
      hasAdmin: await isElevated(),
      diskSpace: true,
      vcRedistInstalled: await checkVCRedistInstalled()
    };
  });
}

module.exports = { setupInstallHandlers };