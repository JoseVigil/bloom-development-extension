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
    return path.join(process.env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local'), 'BloomNucleus');
  } else if (platform === 'darwin') {
    return path.join(homeDir, 'Library', 'Application Support', 'BloomNucleus');
  } else {
    return path.join(homeDir, '.local', 'share', 'BloomNucleus');
  }
};

const baseDir = getBaseDir();

// Repository root (for development) - WORKSPACE AWARE
// setup/ is now inside a workspace, so we need to go up 3 levels to reach the root
const repoRoot = path.join(__dirname, '..', '..', '..');

// ============================================================================
// RESOURCE PATH RESOLUTION
// ============================================================================
const getResourcePath = (resourceName) => {
  if (app.isPackaged) {
    const resourcePath = path.join(process.resourcesPath, resourceName);
    
    const fs = require('fs');
    const unpackedPath = path.join(process.resourcesPath, 'app.asar.unpacked', resourceName);
    
    if (fs.existsSync(unpackedPath)) {
      return unpackedPath;
    }
    
    return resourcePath;
  }

  // Development mode - workspace structure
  // We are in: conductor/setup/config/paths.js
  // Workspace root is: conductor/
  const workspaceRoot = path.join(__dirname, '..', '..');

  switch (resourceName) {
    case 'runtime':
      return path.join(workspaceRoot, '..', 'resources', 'runtime');
    case 'nucleus':
      return path.join(workspaceRoot, '..', 'native', 'bin', 'win32', 'nucleus');
    case 'sentinel':
      return path.join(workspaceRoot, '..', 'native', 'bin', 'win32', 'sentinel');
    case 'brain':
      return path.join(workspaceRoot, '..', 'native', 'bin', 'win32', 'brain');
    case 'native':
      return path.join(workspaceRoot, '..', 'native', 'bin', 'win32', 'host');
    case 'nssm':
      return path.join(workspaceRoot, '..', 'native', 'nssm', 'win32', 'nssm.exe');
    case 'ollama':
      return path.join(workspaceRoot, '..', 'ollama');
    case 'conductor':
      return path.join(workspaceRoot, '..', 'native', 'bin', 'win32', 'conductor');
    case 'cortex':
      return path.join(workspaceRoot, '..', 'native', 'bin', 'cortex');
    case 'chrome-win':
      return path.join(workspaceRoot, '..', 'chrome', 'chrome-win.zip');
    case 'chrome-mac':
      return path.join(workspaceRoot, '..', 'chrome', 'chrome-mac.zip');
    case 'chrome-linux':
      return path.join(workspaceRoot, '..', 'chrome', 'chrome-linux.zip');
    case 'assets':
      return path.join(workspaceRoot, 'setup', 'assets');
    default:
      return path.join(workspaceRoot, '..', 'resources', resourceName);
  }
};

// ============================================================================
// UNIFIED STRUCTURE PATHS
// New simplified structure:
// 
// BloomNucleus/
// ├── bin/
// │   ├── brain/
// │   │   ├── brain.exe
// │   │   └── _internal/          (PyInstaller dependencies)
// │   ├── native/
// │   │   ├── bloom-host.exe      (single binary for all profiles)
// │   │   └── nssm.exe
// │   └── extension/              (template - copied per profile by Brain)
// ├── config/
// │   ├── nucleus.json            (installer metadata)
// │   └── profiles.json           (managed by Brain CLI)
// ├── engine/
// │   └── runtime/                (embedded Python)
// ├── profiles/
// │   └── [UUID]/                 (created by Brain per profile)
// │       ├── extension/          (private extension copy)
// │       ├── synapse/            (private bridge config)
// │       │   └── com.bloom.synapse.[UUID].json
// │       └── chrome-data/        (Chrome user data)
// └── logs/
//     ├── install.log
//     ├── runtime.log
//     └── profiles/
//         └── [UUID]/
//             └── chrome_net.log  (network log per profile)
// ============================================================================

// ============================================================================
// COMPUTED PATHS
// ============================================================================
const pythonExe = platform === 'win32'
  ? path.join(baseDir, 'engine', 'runtime', 'python.exe')
  : path.join(baseDir, 'engine', 'runtime', 'bin', 'python3');

const brainExe = platform === 'win32'
  ? path.join(baseDir, 'bin', 'brain', 'brain.exe')
  : path.join(baseDir, 'bin', 'brain', 'brain');

const hostBinary = platform === 'win32'
  ? path.join(baseDir, 'bin', 'native', 'bloom-host.exe')
  : path.join(baseDir, 'bin', 'native', 'bloom-host');

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
// PATHS OBJECT - Unified Structure
// ============================================================================
const paths = {
  // Base directories
  baseDir,
  bloomBase: baseDir,
  installDir: baseDir,
  repoRoot,

  // Binary directory structure (NEW UNIFIED LAYOUT)
  binDir: path.join(baseDir, 'bin'),
  
  // Nucleus (Governance Layer)
  nucleusDir: path.join(baseDir, 'bin', 'nucleus'),
  nucleusExe: platform === 'win32'
    ? path.join(baseDir, 'bin', 'nucleus', 'nucleus.exe')
    : path.join(baseDir, 'bin', 'nucleus', 'nucleus'),
  nucleusConfig: path.join(baseDir, 'bin', 'nucleus', 'nucleus-governance.json'),
  
  // Sentinel (Operations Layer)
  sentinelDir: path.join(baseDir, 'bin', 'sentinel'),
  sentinelExe: platform === 'win32'
    ? path.join(baseDir, 'bin', 'sentinel', 'sentinel.exe')
    : path.join(baseDir, 'bin', 'sentinel', 'sentinel'),
  sentinelConfig: path.join(baseDir, 'bin', 'sentinel', 'sentinel-config.json'),
  
  // Brain (AI Engine)
  brainDir: path.join(baseDir, 'bin', 'brain'),
  brainExe,
  
  // Native Host + NSSM
  nativeDir: path.join(baseDir, 'bin', 'native'),
  hostBinary,
  nssmExe: platform === 'win32'
    ? path.join(baseDir, 'bin', 'native', 'nssm.exe')
    : null,
  
  // Ollama (LLM Runtime)
  ollamaDir: path.join(baseDir, 'bin', 'ollama'),
  ollamaExe: platform === 'win32'
    ? path.join(baseDir, 'bin', 'ollama', 'ollama.exe')
    : path.join(baseDir, 'bin', 'ollama', 'ollama'),
  
  // Conductor (Launcher - deployed by installer)
  conductorDir: path.join(baseDir, 'bin', 'conductor'),
  conductorExe: platform === 'win32'
    ? path.join(baseDir, 'bin', 'conductor', 'bloom-conductor.exe')
    : path.join(baseDir, 'bin', 'conductor', 'bloom-conductor'),
  
  // Cortex (Extension Package)
  cortexDir: path.join(baseDir, 'bin', 'cortex'),
  cortexBlx: path.join(baseDir, 'bin', 'cortex', 'bloom-cortex.blx'),
  
  // Chrome
  chromeDir: path.join(baseDir, 'bin', 'chrome-win'),
  chromeExe: platform === 'win32'
    ? path.join(baseDir, 'bin', 'chrome-win', 'chrome.exe')
    : null,
  
  // Extension template (copied per-profile by Brain)
  extensionDir: path.join(baseDir, 'bin', 'extension'),
  extensionTemplateDir: path.join(baseDir, 'bin', 'extension'),

  // Engine & Runtime Python
  engineDir: path.join(baseDir, 'engine'),
  runtimeDir: path.join(baseDir, 'engine', 'runtime'),
  pythonExe,

  // Profiles directory (managed by Brain)
  profilesDir: path.join(baseDir, 'profiles'),
  
  // Config directory
  configDir: path.join(baseDir, 'config'),
  configFile: path.join(baseDir, 'config', 'nucleus.json'),
  profilesConfig: path.join(baseDir, 'config', 'profiles.json'), // Managed by Brain

  // Logs
  logsDir: path.join(baseDir, 'logs'),
  installLog: path.join(baseDir, 'logs', 'install.log'),
  runtimeLog: path.join(baseDir, 'logs', 'runtime.log'),
  profileLogsDir: path.join(baseDir, 'logs', 'profiles'),

  // Assets
  assetsDir,
  bloomIcon: path.join(assetsDir, 'bloom.ico'),

  // Desktop (for shortcuts)
  desktop: path.join(homeDir, 'Desktop'),

  // ============================================================================
  // SOURCE PATHS (resources to copy during installation)
  // ============================================================================
  runtimeSource: getResourcePath('runtime'),
  nucleusSource: getResourcePath('nucleus'),
  sentinelSource: getResourcePath('sentinel'),
  brainSource: getResourcePath('brain'),
  nativeSource: getResourcePath('native'),
  nssmSource: getResourcePath('nssm'),
  ollamaSource: getResourcePath('ollama'),
  conductorSource: getResourcePath('conductor'),
  cortexSource: getResourcePath('cortex'),
  extensionSource: getResourcePath('extension'),
  chromeWinSource: getResourcePath('chrome-win'),
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get the path for a specific profile
 * @param {string} profileId - UUID or alias of the profile
 * @returns {string} - Full path to profile directory
 */
function getProfilePath(profileId) {
  return path.join(paths.profilesDir, profileId);
}

/**
 * Get profile-specific paths
 * @param {string} profileId - UUID or alias of the profile
 * @returns {Object} - Object with profile-specific paths
 */
function getProfilePaths(profileId) {
  const profileDir = getProfilePath(profileId);
  
  return {
    base: profileDir,
    extension: path.join(profileDir, 'extension'),
    synapse: path.join(profileDir, 'synapse'),
    synapseManifest: path.join(profileDir, 'synapse', `com.bloom.synapse.${profileId}.json`),
    chromeData: path.join(profileDir, 'chrome-data'),
    logs: path.join(paths.profileLogsDir, profileId),
    netLog: path.join(paths.profileLogsDir, profileId, 'chrome_net.log')
  };
}

/**
 * Get the synapse manifest path for a profile
 * This is where Brain creates the private bridge configuration
 * @param {string} profileId - UUID of the profile
 * @returns {string} - Full path to synapse manifest
 */
function getSynapseManifestPath(profileId) {
  return path.join(paths.profilesDir, profileId, 'synapse', `com.bloom.synapse.${profileId}.json`);
}

// ============================================================================
// VALIDATION
// ============================================================================
const criticalPaths = [
  'baseDir', 'bloomBase', 'binDir',
  'nucleusDir', 'nucleusExe',
  'sentinelDir', 'sentinelExe',
  'brainDir', 'brainExe',
  'nativeDir', 'hostBinary',
  'ollamaDir', 'ollamaExe',
  'conductorDir', 'cortexDir',
  'chromeDir',
  'extensionDir', 'engineDir', 'runtimeDir', 
  'configDir', 'profilesDir', 'logsDir'
];

for (const key of criticalPaths) {
  if (!paths[key]) {
    console.error(`❌ CRITICAL: Path '${key}' is undefined`);
    throw new Error(`Path configuration error: '${key}' is undefined`);
  }
}

console.log('✅ Paths initialized successfully (Unified Structure)');
console.log(`📁 Base directory: ${baseDir}`);
console.log(`⚖️ Nucleus binary: ${paths.nucleusExe}`);
console.log(`🎯 Sentinel binary: ${paths.sentinelExe}`);
console.log(`🧠 Brain binary: ${brainExe}`);
console.log(`🔗 Native host: ${hostBinary}`);
console.log(`🦙 Ollama binary: ${paths.ollamaExe}`);
console.log(`🎮 Conductor binary: ${paths.conductorExe}`);
console.log(`📦 Cortex package: ${paths.cortexBlx}`);
console.log(`👤 Profiles directory: ${paths.profilesDir}`);
console.log(`⚙️ Config directory: ${paths.configDir}`);

module.exports = { 
  paths, 
  getResourcePath,
  getProfilePath,
  getProfilePaths,
  getSynapseManifestPath
};