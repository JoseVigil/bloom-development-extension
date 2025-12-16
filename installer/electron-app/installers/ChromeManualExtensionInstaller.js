const path = require('path');
const fs = require('fs-extra');

class ChromeManualExtensionInstaller {
  constructor(systemPaths) {
    this.paths = systemPaths;
    this.platform = process.platform;
  }

  /**
   * Instalación manual: Solo provisiona el CRX en ubicación accesible
   * El usuario debe arrastrar el archivo a chrome://extensions/
   */
  async install() {
    console.log('=== MANUAL EXTENSION INSTALLER ===');
    
    const destCrx = path.join(this.paths.hostInstallDir, 'extension.crx');
    const idMetadata = await this.getExtensionId();
    
    // Copiar CRX a ubicación final
    await this.provisionCrxFile(destCrx);
    
    // Generar Native Manifest con el ID correcto
    await this.generateNativeManifest(idMetadata.id);
    await this.registerNativeHost();
    
    console.log(`✅ CRX copiado: ${destCrx}`);
    console.log(`🆔 Extension ID: ${idMetadata.id}`);
    console.log('📋 Usuario debe instalar manualmente');
    
    return {
      success: true,
      method: 'manual',
      extensionId: idMetadata.id,
      crxPath: destCrx,
      instructions: {
        step1: 'Abre Chrome (cualquier perfil)',
        step2: 'Ve a chrome://extensions/',
        step3: 'Activa "Modo de desarrollador"',
        step4: `Arrastra el archivo: ${path.basename(destCrx)}`
      }
    };
  }

  async getExtensionId() {
    const idJsonPath = this.paths.extensionId;
    if (!await fs.pathExists(idJsonPath)) {
      throw new Error(`ID metadata no encontrado: ${idJsonPath}`);
    }
    return await fs.readJson(idJsonPath);
  }

  async provisionCrxFile(destPath) {
    const sourceCrx = this.paths.extensionCrx;
    
    if (!await fs.pathExists(sourceCrx)) {
      throw new Error(`CRX no encontrado: ${sourceCrx}`);
    }
    
    await fs.ensureDir(path.dirname(destPath));
    await fs.copy(sourceCrx, destPath, { overwrite: true });
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
      allowed_origins: [`chrome-extension://${extensionId}/`]
    };

    await fs.writeJson(manifestPath, manifest, { spaces: 2 });
    console.log(`✅ Native Manifest generado: ${manifestPath}`);
    return manifestPath;
  }

  async registerNativeHost() {
    const manifestPath = path.join(this.paths.hostInstallDir, 'com.bloom.nucleus.bridge.json');
    
    if (this.platform === 'win32') {
      await this.registerWindowsNativeHost(manifestPath);
    } else if (this.platform === 'darwin') {
      await this.registerMacNativeHost(manifestPath);
    } else {
      await this.registerLinuxNativeHost(manifestPath);
    }
  }

  async registerWindowsNativeHost(manifestPath) {
    // CORRECCIÓN: Definir correctamente las dependencias
    const util = require('util');
    const exec = require('child_process').exec;
    const execPromise = util.promisify(exec);

    const regKey = 'HKCU\\SOFTWARE\\Google\\Chrome\\NativeMessagingHosts\\com.bloom.nucleus.bridge';
    const escapedPath = manifestPath.replace(/\\/g, '\\\\');
      
    try {
      // El resto sigue igual...
      const psCommand = `New-Item -Path "Registry::${regKey}" -Force | New-ItemProperty -Name "(Default)" -Value "${escapedPath}" -Force`;
      await execPromise(`powershell -Command "${psCommand}"`, { shell: 'powershell.exe' });
      console.log('✅ Native Host registrado (Windows)');
    } catch (error) {
      const command = `reg add "${regKey}" /ve /d "${escapedPath}" /f`;
      await execPromise(command);
      console.log('✅ Native Host registrado (Windows fallback)');
    }
  }

  async registerMacNativeHost(manifestPath) {
    const nativeMessagingDir = path.join(
      require('os').homedir(),
      'Library/Application Support/Google/Chrome/NativeMessagingHosts'
    );
    await fs.ensureDir(nativeMessagingDir);
    const destPath = path.join(nativeMessagingDir, 'com.bloom.nucleus.bridge.json');
    await fs.copy(manifestPath, destPath);
    console.log('✅ Native Host registrado (macOS)');
  }

  async registerLinuxNativeHost(manifestPath) {
    const nativeMessagingDir = path.join(
      require('os').homedir(),
      '.config/google-chrome/NativeMessagingHosts'
    );
    await fs.ensureDir(nativeMessagingDir);
    const destPath = path.join(nativeMessagingDir, 'com.bloom.nucleus.bridge.json');
    await fs.copy(manifestPath, destPath);
    console.log('✅ Native Host registrado (Linux)');
  }
}

module.exports = ChromeManualExtensionInstaller;