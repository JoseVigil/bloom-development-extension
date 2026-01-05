const { app } = require('electron');
const path = require('path');
const os = require('os');

const platform = os.platform();
const homeDir = os.homedir();

// ============================================================================
// BASE DIRECTORY - Cross-platform (Windows, macOS, Linux)
// ============================================================================
const getBaseDir = () => {
  if (platform === 'win32') {
    return path.join(process.env.LOCALAPPDATA, 'BloomNucleus');
  } else if (platform === 'darwin') {
    return path.join(homeDir, 'Library', 'Application Support', 'BloomNucleus');
  } else {
    return path.join(homeDir, '.local', 'share', 'BloomNucleus');
  }
};

const baseDir = getBaseDir();

// Repository root (for development)
const repoRoot = path.join(__dirname, '..', '..', '..');

// ============================================================================
// RESOURCE PATH RESOLUTION - Mantiene soporte para packaged (asar.unpacked)
// ============================================================================
const getResourcePath = (resourceName) => {
  if (app.isPackaged) {
    const finalName = resourceName === 'core' ? 'brain' : resourceName;
    const resourcePath = path.join(process.resourcesPath, finalName);
    
    const fs = require('fs');
    const unpackedPath = path.join(process.resourcesPath, 'app.asar.unpacked', finalName);
    
    if (fs.existsSync(unpackedPath)) {
      return unpackedPath;
    }
    
    return resourcePath;
  }

  // Modo desarrollo
  const installerRoot = path.join(__dirname, '..', '..');

  switch (resourceName) {
    case 'runtime':
      return path.join(installerRoot, 'resources', 'runtime');
    case 'brain':
      return path.join(repoRoot, 'brain');
    case 'native':
      return path.join(installerRoot, 'native', 'bin', 'win32'); // mantener por ahora, se puede ajustar si cambias a native-host
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
// PATHS OBJECT - Actualizado con las modificaciones
// ============================================================================
const paths = {
  // Base
  baseDir,
  repoRoot,

  // Engine
  engineDir: path.join(baseDir, 'engine'),
  runtimeDir: path.join(baseDir, 'engine', 'runtime'),

  // Python executable (cross-platform)
  get pythonExe() {
    return platform === 'win32'
      ? path.join(baseDir, 'engine', 'runtime', 'python.exe')
      : path.join(baseDir, 'engine', 'runtime', 'bin', 'python3');
  },

  // Brain package (cross-platform)
  get brainDir() {
    return platform === 'win32'
      ? path.join(baseDir, 'engine', 'runtime', 'Lib', 'site-packages', 'brain')
      : path.join(baseDir, 'engine', 'runtime', 'lib', 'python3.11', 'site-packages', 'brain');
  },

  // Extension (DUAL LOCATION)
  extensionDir: path.join(baseDir, 'extension'), // Legacy
  extensionBrainDir: path.join(baseDir, 'extensions', 'chrome'), // Brain CLI location

  // Native Host
  nativeDir: path.join(baseDir, 'native'),
  hostBinary: platform === 'win32'
    ? path.join(baseDir, 'native', 'bloom-host.exe')
    : path.join(baseDir, 'native', 'bloom-host'),

  // Native Messaging Manifest (cross-platform)
  get manifestPath() {
    if (platform === 'win32') {
      return path.join(baseDir, 'native', 'com.bloom.nucleus.bridge.json');
    } else if (platform === 'darwin') {
      return path.join(homeDir, 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts', 'com.bloom.nucleus.bridge.json');
    } else {
      return path.join(homeDir, '.config', 'google-chrome', 'NativeMessagingHosts', 'com.bloom.nucleus.bridge.json');
    }
  },

  // 🆕 Profiles Directory
  profilesDir: path.join(baseDir, 'profiles'),

  // Config
  configFile: path.join(baseDir, 'nucleus.json'),

  // Logs
  logsDir: path.join(baseDir, 'logs'),

  // ============================================================================
  // SOURCE PATHS (de donde se copian los recursos)
  // ============================================================================
  runtimeSource: getResourcePath('runtime'),
  brainSource: getResourcePath('brain'),
  nativeSource: getResourcePath('native'), // si cambiaste el nombre a native-host, ajusta aquí
  extensionSource: getResourcePath('extension'),
  nssmSource: getResourcePath('nssm'),

  // Mantiene las rutas críticas que tenías antes (puedes quitarlas si ya no las usas)
  get binDir() {
    return path.join(baseDir, 'bin');
  },
  get launcherExe() {
    return path.join(baseDir, 'bin', 'BloomLauncher.exe');
  },
  get assetsDir() {
    if (app.isPackaged) {
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