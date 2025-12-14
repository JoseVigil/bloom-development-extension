const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

class ChromeExtensionInstaller {
  constructor(systemPaths) {
    this.paths = systemPaths;
    this.platform = process.platform;
  }

  // =========================================================================
  //  MÉTODOS DE DETECCIÓN DE PERFILES (RESTAURADOS)
  // =========================================================================

  getChromeUserDataDir() {
    if (this.platform === 'win32') {
      return path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data');
    } else if (this.platform === 'darwin') {
      return path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
    } else {
      return path.join(os.homedir(), '.config', 'google-chrome');
    }
  }

  async getProfiles() {
    const profiles = [];
    const userDataDir = this.getChromeUserDataDir();

    console.log(`Buscando perfiles en: ${userDataDir}`);

    if (!await fs.pathExists(userDataDir)) {
      console.warn("No se encontró directorio de datos de Chrome.");
      return [];
    }

    try {
      const items = await fs.readdir(userDataDir);
      
      for (const item of items) {
        const itemPath = path.join(userDataDir, item);
        const stats = await fs.stat(itemPath);

        // Buscamos carpetas 'Default' o 'Profile X'
        if (stats.isDirectory() && (item === 'Default' || item.startsWith('Profile '))) {
          const prefsPath = path.join(itemPath, 'Preferences');
          
          if (await fs.pathExists(prefsPath)) {
            let profileName = item; // Fallback al nombre de carpeta
            let profileIcon = null;

            try {
              // Leemos el JSON de preferencias para sacar el nombre real
              const prefs = await fs.readJson(prefsPath);
              if (prefs.profile && prefs.profile.name) {
                profileName = prefs.profile.name;
              }
              // Opcional: obtener avatar
              if (prefs.profile && prefs.profile.avatar_icon) {
                profileIcon = prefs.profile.avatar_icon;
              }
            } catch (err) {
              console.warn(`No se pudo leer preferencias para ${item}:`, err.message);
            }

            profiles.push({ 
              id: item,          // Nombre de carpeta (necesario para CLI)
              name: profileName, // Nombre legible (para UI)
              path: itemPath,
              icon: profileIcon
            });
          }
        }
      }
    } catch (error) {
      console.error('Error fatal leyendo perfiles:', error);
      throw error; 
    }

    return profiles;
  }

  async isChromeRunning() {
    try {
        const cmd = this.platform === 'win32' ? 'tasklist /FI "IMAGENAME eq chrome.exe"' : 'pgrep chrome';
        const { stdout } = await execPromise(cmd);
        return stdout.toLowerCase().includes('chrome');
    } catch { return false; }
  }

  // =========================================================================
  //  MÉTODOS DE INSTALACIÓN ENTERPRISE (SIN CAMBIOS)
  // =========================================================================

  async install(profilesIgnored) { 
    console.log('=== INICIANDO INSTALACIÓN DINÁMICA ===');

    // 1. LEER EL ID DINÁMICAMENTE
    if (!await fs.pathExists(this.paths.extensionId)) {
        throw new Error(`CRITICAL: No se encontró id.json en ${this.paths.extensionId}`);
    }
    const metadata = await fs.readJson(this.paths.extensionId);
    const extensionId = metadata.id;
    
    console.log(`🆔 ID Detectado para instalación: ${extensionId}`);

    // 2. Ruta del CRX origen y destino
    const destCrxPath = path.join(this.paths.hostInstallDir, 'extension.crx'); 
    
    // 3. Copiar .crx
    await this.provisionCrxFile(destCrxPath);

    // 4. Registrar en Windows usando el ID leído
    if (this.platform === 'win32') {
      await this.applyWindowsPolicy(extensionId, destCrxPath);
    } 
    // ... (mac/linux logic)

    // RETORNAMOS ID Y PATH
    return { 
      id: extensionId, 
      path: destCrxPath 
    };
  }


  async provisionCrxFile(destPath) {
    // Usamos la nueva ruta definida en main.js
    const sourceCrx = this.paths.extensionCrx; 
    
    if (await fs.pathExists(sourceCrx)) {
        await fs.ensureDir(path.dirname(destPath));
        await fs.copy(sourceCrx, destPath, { overwrite: true });
    } else {
        throw new Error(`No se encontró el CRX en: ${sourceCrx}`);
    }
  }

  // Modificar este método
  async applyWindowsPolicy(id, crxPath) {
      console.log(`[Registry] Registrando ID: ${id}`);
      console.log(`[Registry] CRX Path: ${crxPath}`);
      
      // Path del script externo
      const scriptPath = path.join(__dirname, 'registry-scripts', 'hkcu.ps1');
      
      // Verificar que el script existe
      if (!await fs.pathExists(scriptPath)) {
          throw new Error(`Script no encontrado: ${scriptPath}`);
      }
      
      // Verificar que el CRX existe
      if (!await fs.pathExists(crxPath)) {
          throw new Error(`CRX no encontrado: ${crxPath}`);
      }
      
      try {
          console.log(`[Registry] Ejecutando: ${scriptPath}`);
          
          // Ejecutar script externo con parámetros
          const { stdout, stderr } = await execPromise(
              `powershell -ExecutionPolicy Bypass -File "${scriptPath}" -ExtId "${id}" -CrxPath "${crxPath}"`,
              { timeout: 20000 }
          );
          
          console.log("[Registry] === SALIDA ===");
          console.log(stdout);
          
          if (stderr) {
              console.warn("[Registry] Warnings:", stderr);
          }
          
          // Verificar que se creó la clave principal
          const verifyCmd = `powershell -Command "Test-Path 'HKCU:\\Software\\Policies\\Google\\Chrome\\ExtensionInstallForcelist'"`;
          const { stdout: result } = await execPromise(verifyCmd);
          
          if (result.trim() !== 'True') {
              throw new Error('Forcelist no se creó en HKCU');
          }
          
          console.log("[Registry] ✅ Verificación exitosa");
          
      } catch (e) {
          console.error("[Registry] ❌ Error:", e);
          throw new Error(`Falló registro: ${e.message}`);
      }
  }
  
  async applyMacPolicy(id, crxPath) {
    const destDir = path.join(os.homedir(), "Library/Application Support/Google/Chrome/External Extensions");
    await fs.ensureDir(destDir);
    const config = { external_crx: crxPath, external_version: "1.0.0" };
    await fs.writeJson(path.join(destDir, `${id}.json`), config);
  }

  async applyLinuxPolicy(id, crxPath) {
    const destDir = path.join(os.homedir(), ".config/google-chrome/External Extensions"); // User scope
    await fs.ensureDir(destDir);
    const config = { external_crx: crxPath, external_version: "1.0.0" };
    await fs.writeJson(path.join(destDir, `${id}.json`), config);
  }
}

module.exports = ChromeExtensionInstaller;