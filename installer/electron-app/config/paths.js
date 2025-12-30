const { app } = require('electron');
const path = require('path');

// ============================================================================
// RESOURCE PATH RESOLUTION - Fixed para asar.unpacked
// ============================================================================
const getResourcePath = (resourceName) => {
  if (app.isPackaged) {
    // En modo packaged, los recursos están en process.resourcesPath
    const finalName = resourceName === 'core' ? 'brain' : resourceName;
    const resourcePath = path.join(process.resourcesPath, finalName);
    
    // Verificar si existe en app.asar.unpacked (para recursos desempaquetados)
    const unpackedPath = path.join(process.resourcesPath, 'app.asar.unpacked', finalName);
    const fs = require('fs');
    
    // Si existe en unpacked, usar esa ruta
    if (fs.existsSync(unpackedPath)) {
      return unpackedPath;
    }
    
    return resourcePath;
  }
  
  // Modo desarrollo
  const installerRoot = path.join(__dirname, '..', '..');
  const repoRoot = path.join(__dirname, '..', '..', '..');
  
  switch (resourceName) {
    case 'runtime':
      return path.join(installerRoot, 'resources', 'runtime');
    case 'brain':
      return path.join(repoRoot, 'brain');
    case 'native':
      return path.join(installerRoot, 'native', 'bin', 'win32');
    case 'nssm':
      return path.join(installerRoot, 'native', 'nssm', 'win64');
    case 'extension':
      return path.join(installerRoot, 'chrome-extension', 'src');
    case 'assets':
      return path.join(installerRoot, 'electron-app', 'assets');
    default:
      return path.join(installerRoot, 'resources', resourceName);
  }
};

// ============================================================================
// PATHS OBJECT
// ============================================================================
const paths = {
  // Base directory en %LOCALAPPDATA%
  get bloomBase() {
    return process.platform === 'win32'
      ? path.join(process.env.LOCALAPPDATA, 'BloomNucleus')
      : path.join(app.getPath('home'), '.local', 'share', 'BloomNucleus');
  },
  
  // Engine directory (instalación de Python runtime)
  get engineDir() {
    return path.join(this.bloomBase, 'engine');
  },
  
  // Python runtime directory
  get runtimeDir() {
    return path.join(this.engineDir, 'runtime');
  },
  
  // Brain package directory
  get brainDir() {
    return path.join(this.runtimeDir, 'Lib', 'site-packages', 'brain');
  },
  
  // Native host binaries
  get nativeDir() {
    return path.join(this.bloomBase, 'native');
  },
  
  // Chrome extension directory
  get extensionDir() {
    return path.join(process.env.LOCALAPPDATA, 'BloomNucleus', 'extension');
  },
  
  // Configuration directory
  get configDir() {
    return path.join(this.bloomBase, 'config');
  },
  
  // Config file
  get configFile() {
    return path.join(this.configDir, 'installer-config.json');
  },
  
  // ⬅️ CRÍTICO: Bin directory para BloomLauncher
  get binDir() {
    return path.join(this.bloomBase, 'bin');
  },
  
  // Logs directory
  get logsDir() {
    return path.join(this.bloomBase, 'logs');
  },
  
  // ============================================================================
  // SOURCE PATHS (de donde se copian los recursos)
  // ============================================================================
  runtimeSource: getResourcePath('runtime'),
  brainSource: getResourcePath('brain'),
  nativeSource: getResourcePath('native'),
  extensionSource: getResourcePath('extension'),
  nssmSource: getResourcePath('nssm'),

  // Extension brain directory
  extensionBrainDir: path.join(
    process.env.LOCALAPPDATA, 
    'BloomNucleus', 
    'extensions', 
    'chrome'
  ),
  
  // ============================================================================
  // EXECUTABLE PATHS
  // ============================================================================
  
  // Python executable
  get pythonExe() {
    return path.join(this.runtimeDir, process.platform === 'win32' ? 'python.exe' : 'python3');
  },
  
  // Native host binary
  get hostBinary() {
    return path.join(this.nativeDir, process.platform === 'win32' ? 'bloom-host.exe' : 'bloom-host');
  },
  
  // NSSM service manager
  get nssmExe() {
    return path.join(this.nativeDir, 'nssm.exe');
  },
  
  // Native messaging manifest
  get manifestPath() {
    return path.join(this.nativeDir, 'com.bloom.nucleus.bridge.json');
  },
  
  // ⬅️ CRÍTICO: BloomLauncher executable
  get launcherExe() {
    return path.join(this.binDir, 'BloomLauncher.exe');
  },

  // ⬅️ NUEVO: Assets path (para iconos en shortcuts)
  get assetsDir() {
    if (app.isPackaged) {
      // En packaged, assets está en app.asar.unpacked o resources
      const unpackedAssets = path.join(process.resourcesPath, 'app.asar.unpacked', 'assets');
      const fs = require('fs');
      if (fs.existsSync(unpackedAssets)) {
        return unpackedAssets;
      }
      return path.join(process.resourcesPath, 'assets');
    }
    return path.join(__dirname, '..', 'assets');
  },

  get bloomIcon() {
    return path.join(this.assetsDir, 'bloom.ico');
  }
};

module.exports = { paths, getResourcePath };