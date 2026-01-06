const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

class ChromeEnterpriseExtensionInstaller {
  constructor(systemPaths) {
    this.paths = systemPaths;
    this.platform = process.platform;
  }

  // =========================================================================
  //  MÉTODOS DE DETECCIÓN DE PERFILES
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

        if (stats.isDirectory() && (item === 'Default' || item.startsWith('Profile '))) {
          const prefsPath = path.join(itemPath, 'Preferences');
          
          if (await fs.pathExists(prefsPath)) {
            let profileName = item;
            let profileIcon = null;

            try {
              const prefs = await fs.readJson(prefsPath);
              if (prefs.profile && prefs.profile.name) {
                profileName = prefs.profile.name;
              }
              if (prefs.profile && prefs.profile.avatar_icon) {
                profileIcon = prefs.profile.avatar_icon;
              }
            } catch (err) {
              console.warn(`No se pudo leer preferencias para ${item}:`, err.message);
            }

            profiles.push({ 
              id: item,
              name: profileName,
              path: itemPath,
              icon: profileIcon
            });
          }
        }
      }
    } catch (error) {
      console.error('Error leyendo perfiles:', error);
      throw error; 
    }

    return profiles;
  }

  async isChromeRunning() {
    try {
      const cmd = this.platform === 'win32' ? 'tasklist /FI "IMAGENAME eq chrome.exe"' : 'pgrep chrome';
      const { stdout } = await execPromise(cmd);
      return stdout.toLowerCase().includes('chrome');
    } catch { 
      return false; 
    }
  }

  // =========================================================================
  //  INSTALACIÓN ENTERPRISE (SOLO HKCU)
  // =========================================================================

  async install(profilesIgnored) { 
    console.log('=== ENTERPRISE EXTENSION INSTALLER (HKCU) ===');

    // 1. Leer metadata desde chrome-extension/crx/id.json
    const idJsonPath = path.join(
      __dirname,
      '..',
      '..',
      'chrome-extension',
      'crx',
      'id.json'
    );
    
    if (!await fs.pathExists(idJsonPath)) {
      throw new Error(`CRITICAL: No se encontró id.json en ${idJsonPath}`);
    }
    
    const metadata = await fs.readJson(idJsonPath);
    const extensionId = metadata.id;
    const updateUrl = metadata.updateUrl || 'https://clients2.google.com/service/update2/crx';
    
    console.log(`🆔 ID: ${extensionId}`);
    console.log(`🔗 Update URL: ${updateUrl}`);

    // 2. Copiar CRX
    const destCrxPath = path.join(this.paths.hostInstallDir, 'extension.crx'); 
    await this.provisionCrxFile(destCrxPath);

    // 3. Aplicar políticas según plataforma
    if (this.platform === 'win32') {
      await this.applyWindowsPolicy(extensionId, updateUrl);
    } else if (this.platform === 'darwin') {
      await this.applyMacPolicy(extensionId, destCrxPath);
    } else {
      await this.applyLinuxPolicy(extensionId, destCrxPath);
    }

    // 4. Generar Native Manifest
    await this.generateNativeManifest(extensionId);
    await this.registerNativeHost();

    return { 
      success: true,
      method: 'enterprise',
      id: extensionId, 
      path: destCrxPath 
    };
  }

  async provisionCrxFile(destPath) {
    // CORREGIDO: Lee desde chrome-extension/crx/extension.crx
    const sourceCrx = path.join(
      __dirname,
      '..',
      '..',
      'chrome-extension',
      'crx',
      'extension.crx'
    );
    
    if (!await fs.pathExists(sourceCrx)) {
      throw new Error(`No se encontró el CRX en: ${sourceCrx}`);
    }
    
    await fs.ensureDir(path.dirname(destPath));
    await fs.copy(sourceCrx, destPath, { overwrite: true });
    console.log(`📦 CRX copiado desde: ${sourceCrx}`);
  }

  async applyWindowsPolicy(extensionId, updateUrl) {
    console.log('[Registry] Aplicando políticas en HKCU...');
    
    const policyValue = `${extensionId};${updateUrl}`;
    const basePath = 'HKCU\\Software\\Policies\\Google\\Chrome';
    
    try {
      // 1. ExtensionInstallForcelist
      const forcelistPath = `${basePath}\\ExtensionInstallForcelist`;
      await execPromise(`reg add "${forcelistPath}" /v "1" /t REG_SZ /d "${policyValue}" /f`);
      console.log(`✅ ExtensionInstallForcelist: ${policyValue}`);
      
      // 2. ExtensionInstallAllowlist (backup)
      const allowlistPath = `${basePath}\\ExtensionInstallAllowlist`;
      await execPromise(`reg add "${allowlistPath}" /v "1" /t REG_SZ /d "${extensionId}" /f`);
      console.log(`✅ ExtensionInstallAllowlist: ${extensionId}`);
      
      // Verificación
      const verifyCmd = `reg query "${forcelistPath}" /v "1"`;
      const { stdout } = await execPromise(verifyCmd);
      
      if (!stdout.includes(extensionId)) {
        throw new Error('Verificación falló: ID no encontrado en registry');
      }
      
      console.log('[Registry] ✅ Políticas aplicadas correctamente en HKCU');
      console.log('[Registry] ⚠️  IMPORTANTE: Cierra Chrome completamente y vuelve a abrirlo');
      
    } catch (e) {
      console.error('[Registry] ❌ Error:', e.message);
      throw new Error(`Falló registro en HKCU: ${e.message}`);
    }
  }

  async applyMacPolicy(extensionId, crxPath) {
    const destDir = path.join(os.homedir(), "Library/Application Support/Google/Chrome/External Extensions");
    await fs.ensureDir(destDir);
    const config = { 
      external_crx: crxPath, 
      external_version: "1.0.0" 
    };
    await fs.writeJson(path.join(destDir, `${extensionId}.json`), config, { spaces: 2 });
    console.log('✅ Política aplicada (macOS)');
  }

  async applyLinuxPolicy(extensionId, crxPath) {
    const destDir = path.join(os.homedir(), ".config/google-chrome/External Extensions");
    await fs.ensureDir(destDir);
    const config = { 
      external_crx: crxPath, 
      external_version: "1.0.0" 
    };
    await fs.writeJson(path.join(destDir, `${extensionId}.json`), config, { spaces: 2 });
    console.log('✅ Política aplicada (Linux)');
  }

  async generateNativeManifest(extensionId) {
    const hostBinary = this.platform === 'win32' ? 'bloom-host.exe' : 'bloom-host';
    const hostPath = path.join(this.paths.hostInstallDir, hostBinary);
    const manifestPath = path.join(this.paths.hostInstallDir, 'com.bloom.nucleus.bridge.json');
    
    const manifest = {
      name: 'com.bloom.nucleus.bridge',
      description: 'Bloom Bridge Host',
      path: hostPath.replace(/\\/g, '\\\\'),
      type: 'stdio',
      allowed_origins: [
        `chrome-extension://${extensionId}/`
      ]
    };

    await fs.writeJson(manifestPath, manifest, { spaces: 2 });
    console.log(`✅ Native Manifest generado: ${manifestPath}`);
    return manifestPath;
  }

  async registerNativeHost() {
    const manifestPath = path.join(this.paths.hostInstallDir, 'com.bloom.nucleus.bridge.json');
    
    if (this.platform === 'win32') {
      const regKey = 'HKCU\\SOFTWARE\\Google\\Chrome\\NativeMessagingHosts\\com.bloom.nucleus.bridge';
      const escapedPath = manifestPath.replace(/\\/g, '\\\\');
      
      try {
        await execPromise(`reg add "${regKey}" /ve /d "${escapedPath}" /f`);
        console.log('✅ Native Host registrado (HKCU)');
      } catch (e) {
        throw new Error(`Falló registro de Native Host: ${e.message}`);
      }
    } else if (this.platform === 'darwin') {
      const nativeMessagingDir = path.join(os.homedir(), 'Library/Application Support/Google/Chrome/NativeMessagingHosts');
      await fs.ensureDir(nativeMessagingDir);
      await fs.copy(manifestPath, path.join(nativeMessagingDir, 'com.bloom.nucleus.bridge.json'));
      console.log('✅ Native Host registrado (macOS)');
    } else {
      const nativeMessagingDir = path.join(os.homedir(), '.config/google-chrome/NativeMessagingHosts');
      await fs.ensureDir(nativeMessagingDir);
      await fs.copy(manifestPath, path.join(nativeMessagingDir, 'com.bloom.nucleus.bridge.json'));
      console.log('✅ Native Host registrado (Linux)');
    }
  }

  /**
   * Desinstala las políticas enterprise
   */
  async uninstall() {
    console.log('🗑️  Desinstalando políticas enterprise...');
    
    if (this.platform === 'win32') {
      try {
        await execPromise('reg delete "HKCU\\Software\\Policies\\Google\\Chrome\\ExtensionInstallForcelist" /f');
        await execPromise('reg delete "HKCU\\Software\\Policies\\Google\\Chrome\\ExtensionInstallAllowlist" /f');
        await execPromise('reg delete "HKCU\\SOFTWARE\\Google\\Chrome\\NativeMessagingHosts\\com.bloom.nucleus.bridge" /f');
        console.log('✅ Políticas eliminadas de HKCU');
      } catch (e) {
        console.log('ℹ️  Algunas políticas no existían');
      }
    }
    
    console.log('✅ Desinstalación enterprise completada');
    console.log('⚠️  Reinicia Chrome para aplicar cambios');
    
    return { success: true };
  }
}

module.exports = ChromeEnterpriseExtensionInstaller;