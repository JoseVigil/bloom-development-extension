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
      return path.join(installerRoot, 'native', 'bin', 'win32');
    case 'nssm':
      return path.join(installerRoot, 'native', 'nssm', 'win64');
    case 'extension':
      // ✅ FIXED: Usar installerRoot en vez de repoRoot
      return path.join(installerRoot, 'chrome-extension', 'src');
    case 'assets':
      return path.join(installerRoot, 'electron-app', 'assets');
    default:
      return path.join(installerRoot, 'resources', resourceName);
  }
};

// ============================================================================
// COMPUTED PATHS (sin getters, valores directos)
// ============================================================================
const pythonExe = platform === 'win32'
  ? path.join(baseDir, 'engine', 'runtime', 'python.exe')
  : path.join(baseDir, 'engine', 'runtime', 'bin', 'python3');

const brainDir = platform === 'win32'
  ? path.join(baseDir, 'engine', 'runtime', 'Lib', 'site-packages', 'brain')
  : path.join(baseDir, 'engine', 'runtime', 'lib', 'python3.11', 'site-packages', 'brain');

const hostBinary = platform === 'win32'
  ? path.join(baseDir, 'native', 'bloom-host.exe')
  : path.join(baseDir, 'native', 'bloom-host');

const manifestPath = (() => {
  if (platform === 'win32') {
    return path.join(baseDir, 'native', 'com.bloom.nucleus.bridge.json');
  } else if (platform === 'darwin') {
    return path.join(homeDir, 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts', 'com.bloom.nucleus.bridge.json');
  } else {
    return path.join(homeDir, '.config', 'google-chrome', 'NativeMessagingHosts', 'com.bloom.nucleus.bridge.json');
  }
})();

const assetsDir = (() => {
  if (app.isPackaged) {
    const unpackedAssets = path.join(process.resourcesPath, 'app.asar.unpacked', 'assets');
    const fs = require('fs');
    if (fs.existsSync(unpackedAssets)) {
      return unpackedAssets;
    }
    return path.join(process.resourcesPath, 'assets');
  }
  return path.join(__dirname, '..', 'assets');
})();

// ============================================================================
// PATHS OBJECT - ✅ FIXED: Todas las props son valores directos (no getters)
// ============================================================================
const paths = {
  // Base (✅ Alias agregado para compatibilidad con installer.js)
  baseDir,
  bloomBase: baseDir, // ✅ NUEVO: Alias para installer.js
  repoRoot,

  // Engine
  engineDir: path.join(baseDir, 'engine'),
  runtimeDir: path.join(baseDir, 'engine', 'runtime'),

  // Python executable (cross-platform) - ✅ FIXED: Ya no es getter
  pythonExe,

  // Brain package (cross-platform) - ✅ FIXED: Ya no es getter
  brainDir,

  // Extension (DUAL LOCATION)
  extensionDir: path.join(baseDir, 'extension'), // Legacy
  extensionBrainDir: path.join(baseDir, 'extensions', 'chrome'), // Brain CLI location

  // Native Host
  nativeDir: path.join(baseDir, 'native'),
  hostBinary,

  // Native Messaging Manifest (cross-platform) - ✅ FIXED: Ya no es getter
  manifestPath,

  // Profiles Directory
  profilesDir: path.join(baseDir, 'profiles'),

  // Config - ✅ NUEVO: configDir agregado para installer.js
  configDir: path.join(baseDir, 'config'),
  configFile: path.join(baseDir, 'nucleus.json'),

  // Logs
  logsDir: path.join(baseDir, 'logs'),
  installLog: path.join(baseDir, 'logs', 'install.log'),
  runtimeLog: path.join(baseDir, 'logs', 'runtime.log'),

  // Bin
  binDir: path.join(baseDir, 'bin'),
  launcherExe: path.join(baseDir, 'bin', 'BloomLauncher.exe'),

  // Assets - ✅ FIXED: Ya no es getter
  assetsDir,
  bloomIcon: path.join(assetsDir, 'bloom.ico'),

  // ============================================================================
  // SOURCE PATHS (de donde se copian los recursos)
  // ============================================================================
  runtimeSource: getResourcePath('runtime'),
  brainSource: getResourcePath('brain'),
  nativeSource: getResourcePath('native'),
  extensionSource: getResourcePath('extension'),
  nssmSource: getResourcePath('nssm'),

  // ✅ NUEVO: Desktop path (para shortcuts)
  desktop: path.join(homeDir, 'Desktop')
};

// ============================================================================
// VALIDACIÓN - Verificar que ningún path crítico sea undefined
// ============================================================================
const criticalPaths = [
  'baseDir', 'bloomBase', 'engineDir', 'runtimeDir', 'nativeDir',
  'extensionDir', 'configDir', 'binDir', 'logsDir'
];

for (const key of criticalPaths) {
  if (!paths[key]) {
    console.error(`❌ CRITICAL: Path '${key}' is undefined`);
    throw new Error(`Path configuration error: '${key}' is undefined`);
  }
}

console.log('✅ Paths initialized successfully');
console.log(`📁 Base directory: ${baseDir}`);

module.exports = { paths, getResourcePath };