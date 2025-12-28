const { app } = require('electron');
const path = require('path');

// ============================================================================
// RESOURCE PATH RESOLUTION
// ============================================================================
const getResourcePath = (resourceName) => {
  if (app.isPackaged) {
    const finalName = resourceName === 'core' ? 'brain' : resourceName;
    return path.join(process.resourcesPath, finalName);
  }
  
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
  get bloomBase() {
    return process.platform === 'win32'
      ? path.join(process.env.LOCALAPPDATA, 'BloomNucleus')
      : path.join(app.getPath('home'), '.local', 'share', 'BloomNucleus');
  },
  
  get engineDir() {
    return path.join(this.bloomBase, 'engine');
  },
  
  get runtimeDir() {
    return path.join(this.engineDir, 'runtime');
  },
  
  get brainDir() {
    return path.join(this.runtimeDir, 'Lib', 'site-packages', 'brain');
  },
  
  get nativeDir() {
    return path.join(this.bloomBase, 'native');
  },
  
  get extensionDir() {
    return path.join(this.bloomBase, 'extension');
  },
  
  get configDir() {
    return path.join(this.bloomBase, 'config');
  },
  
  get configFile() {
    return path.join(this.configDir, 'installer-config.json');
  },
  
  get binDir() {
    return path.join(this.bloomBase, 'bin');
  },
  
  get logsDir() {
    return path.join(this.bloomBase, 'logs');
  },
  
  // Source paths
  runtimeSource: getResourcePath('runtime'),
  brainSource: getResourcePath('brain'),
  nativeSource: getResourcePath('native'),
  extensionSource: getResourcePath('extension'),
  nssmSource: getResourcePath('nssm'),
  
  // Executable paths
  get pythonExe() {
    return path.join(this.runtimeDir, process.platform === 'win32' ? 'python.exe' : 'python3');
  },
  
  get hostBinary() {
    return path.join(this.nativeDir, process.platform === 'win32' ? 'bloom-host.exe' : 'bloom-host');
  },
  
  get nssmExe() {
    return path.join(this.nativeDir, 'nssm.exe');
  },
  
  get manifestPath() {
    return path.join(this.nativeDir, 'com.bloom.nucleus.bridge.json');
  },
  
  get launcherExe() {
    return path.join(this.binDir, 'BloomLauncher.exe');
  }
};

module.exports = { paths, getResourcePath };