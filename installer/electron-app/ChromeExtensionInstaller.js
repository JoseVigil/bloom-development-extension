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
    
    // NO convertir a file:// para External Extensions
    const normalPath = crxPath; // Dejar como C:\Program Files\...
    const fileUrl = 'file:///' + crxPath.split(path.sep).join('/'); // Solo para Forcelist
    
    const tempScriptPath = path.join(require('os').tmpdir(), `bloom-registry-${Date.now()}.ps1`);
    
    const psScript = `
    # Bloom Nucleus - Extension Installer (HKCU Strategy)
    $ErrorActionPreference = 'Stop'

    $ExtId = "${id}"
    $CrxPath = "${normalPath}"
    $CrxUrl = "${fileUrl}"

    Write-Host "=== BLOOM REGISTRY INSTALLER ==="
    Write-Host "Extension ID: $ExtId"
    Write-Host "CRX Path: $CrxPath"
    Write-Host "CRX URL: $CrxUrl"
    Write-Host ""

    # ========================================================================
    # ESCRIBIR EN HKCU (Current User - Chrome puede leer sin admin)
    # ========================================================================

    $PolicyPath = "HKCU:\\Software\\Policies\\Google\\Chrome"
    $ForcelistKey = "$PolicyPath\\ExtensionInstallForcelist"

    Write-Host "[1/4] Configurando Forcelist (HKCU)..."
    if (!(Test-Path $ForcelistKey)) { 
        New-Item -Path $ForcelistKey -Force | Out-Null 
    }
    New-ItemProperty -Path $ForcelistKey -Name "1" -Value "$ExtId;$CrxUrl" -PropertyType String -Force | Out-Null
    Write-Host "  OK - Forcelist creado (usa file:// URL)"

    Write-Host "[2/4] Configurando ExtensionSettings (HKCU)..."
    $SettingsKey = "$PolicyPath\\ExtensionSettings"
    if (!(Test-Path $SettingsKey)) { 
        New-Item -Path $SettingsKey -Force | Out-Null 
    }

    $ExtSettingsKey = "$SettingsKey\\$ExtId"
    if (!(Test-Path $ExtSettingsKey)) { 
        New-Item -Path $ExtSettingsKey -Force | Out-Null 
    }

    New-ItemProperty -Path $ExtSettingsKey -Name "installation_mode" -Value "force_installed" -PropertyType String -Force | Out-Null
    New-ItemProperty -Path $ExtSettingsKey -Name "update_url" -Value "$CrxUrl" -PropertyType String -Force | Out-Null
    Write-Host "  OK - ExtensionSettings creado"

    Write-Host "[3/4] Configurando External Extensions (HKCU)..."
    $ExtPath = "HKCU:\\Software\\Google\\Chrome\\Extensions\\$ExtId"
    if (!(Test-Path $ExtPath)) { 
        New-Item -Path $ExtPath -Force | Out-Null 
    }

    # CRITICO: Usar "path" en lugar de "external_crx" para External Extensions
    New-ItemProperty -Path $ExtPath -Name "path" -Value "$CrxPath" -PropertyType String -Force | Out-Null
    New-ItemProperty -Path $ExtPath -Name "version" -Value "1.0.0" -PropertyType String -Force | Out-Null
    Write-Host "  OK - External Extensions creado (usa path nativo)"

    Write-Host "[4/4] Configurando Allowlist (HKCU)..."
    $AllowlistKey = "$PolicyPath\\ExtensionInstallAllowlist"
    if (!(Test-Path $AllowlistKey)) { 
        New-Item -Path $AllowlistKey -Force | Out-Null 
    }
    New-ItemProperty -Path $AllowlistKey -Name "1" -Value "$ExtId" -PropertyType String -Force | Out-Null
    Write-Host "  OK - Allowlist creado"

    Write-Host ""
    Write-Host "========================================="
    Write-Host "REGISTRO COMPLETADO EN HKCU"
    Write-Host "Forcelist: file:// URL"
    Write-Host "External: path nativo Windows"
    Write-Host "========================================="
    `;

        try {
            await require('fs-extra').writeFile(tempScriptPath, psScript, 'utf8');
            console.log(`[Registry] Script: ${tempScriptPath}`);
            
            const { stdout, stderr } = await execPromise(
                `powershell -ExecutionPolicy Bypass -File "${tempScriptPath}"`,
                { timeout: 15000 }
            );
            
            console.log("[Registry] === SALIDA ===");
            console.log(stdout);
            
            if (stderr) {
                console.warn("[Registry] Warnings:", stderr);
            }
            
            await require('fs-extra').unlink(tempScriptPath).catch(() => {});
            
            const verifyCmd = `powershell -Command "Test-Path 'HKCU:\\Software\\Policies\\Google\\Chrome\\ExtensionInstallForcelist'"`;
            const { stdout: result } = await execPromise(verifyCmd);
            
            if (result.trim() !== 'True') {
                throw new Error('No se pudo crear Forcelist en HKCU');
            }
            
            console.log("[Registry] ✅ Claves creadas en HKCU");
            
        } catch (e) {
            console.error("[Registry] ❌ Error:", e);
            try { 
                await require('fs-extra').unlink(tempScriptPath); 
            } catch {}
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