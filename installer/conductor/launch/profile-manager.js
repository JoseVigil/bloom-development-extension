const { spawn } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { paths } = require('../config/paths');
const { execBrainCommand } = require('./brain-commands');
const { profileWindows } = require('../core/window-manager');

/**
 * Get Brain __main__.py path based on platform
 * @returns {string} Path to brain/__main__.py
 */
function getBrainMainPath() {
  const platform = os.platform();
  const homeDir = os.homedir();
  
  if (platform === 'win32') {
    return path.join(
      homeDir,
      'AppData',
      'Local',
      'BloomNucleus',
      'engine',
      'runtime',
      'Lib',
      'site-packages',
      'brain',
      '__main__.py'
    );
  } else if (platform === 'darwin') {
    return path.join(
      homeDir,
      'Library',
      'Application Support',
      'BloomNucleus',
      'engine',
      'runtime',
      'lib',
      'python3.11',
      'site-packages',
      'brain',
      '__main__.py'
    );
  } else {
    // Linux
    return path.join(
      homeDir,
      '.local',
      'share',
      'BloomNucleus',
      'engine',
      'runtime',
      'lib',
      'python3.11',
      'site-packages',
      'brain',
      '__main__.py'
    );
  }
}

/**
 * Get runtime directory path
 * @returns {string} Path to runtime directory
 */
function getRuntimeDir() {
  const platform = os.platform();
  const homeDir = os.homedir();
  
  if (platform === 'win32') {
    return path.join(
      homeDir,
      'AppData',
      'Local',
      'BloomNucleus',
      'engine',
      'runtime',
      'Lib',
      'site-packages'
    );
  } else if (platform === 'darwin') {
    return path.join(
      homeDir,
      'Library',
      'Application Support',
      'BloomNucleus',
      'engine',
      'runtime',
      'lib',
      'python3.11',
      'site-packages'
    );
  } else {
    // Linux
    return path.join(
      homeDir,
      '.local',
      'share',
      'BloomNucleus',
      'engine',
      'runtime',
      'lib',
      'python3.11',
      'site-packages'
    );
  }
}

/**
 * Lista todos los perfiles disponibles
 */
async function listProfiles() {
  try {
    const result = await execBrainCommand(['profile', 'list', '--json']);
    return JSON.parse(result.stdout);
  } catch (error) {
    console.error('Profile list failed:', error);
    return [];
  }
}

/**
 * Lanza un perfil específico
 */
async function launchProfile(profileId, url = null) {
  try {
    console.log(`\n🚀 LAUNCHING PROFILE: ${profileId}`);
    
    const args = ['profile', 'launch', profileId];
    if (url) {
      args.push('--url', url);
    }

    const pythonPath = paths.pythonExe;
    const brainMainPath = getBrainMainPath();
    const runtimeDir = getRuntimeDir();

    // ✅ CRÍTICO: Verificar que extensión existe ANTES de lanzar
    if (!fs.existsSync(paths.extensionBrainDir)) {
      console.error(`❌ Extension not found at: ${paths.extensionBrainDir}`);
      throw new Error('Extension directory not found. Reinstall may be required.');
    }

    const manifestPath = path.join(paths.extensionBrainDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      console.error(`❌ manifest.json not found at: ${manifestPath}`);
      throw new Error('Extension manifest.json not found.');
    }

    console.log(` ✅ Extension verified at: ${paths.extensionBrainDir}`);
    console.log(` 📂 Python: ${pythonPath}`);
    console.log(` 📂 Brain: ${brainMainPath}`);
    console.log(` 🔧 Command: python "${brainMainPath}" --json ${args.join(' ')}`);

    // ✅ MIGRADO: Ya no necesita PYTHONPATH - brain lo maneja internamente
    const launchEnv = {
      ...process.env,
      BLOOM_EXTENSION_PATH: paths.extensionBrainDir,  // ⬅️ FIX CRÍTICO
      PYTHONNOUSERSITE: '1'
    };

    console.log(` 🔑 ENV: BLOOM_EXTENSION_PATH=${launchEnv.BLOOM_EXTENSION_PATH}`);

    // ✅ MIGRADO: Ejecución directa sin -m brain
    const child = spawn(pythonPath, [brainMainPath, '--json', ...args], {
      cwd: runtimeDir,
      env: launchEnv,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']  // ✅ Captura stdout/stderr para debug
    });

    // ✅ Logging temporal para debug
    child.stdout?.on('data', (data) => {
      console.log(`[Brain stdout] ${data.toString()}`);
    });

    child.stderr?.on('data', (data) => {
      console.error(`[Brain stderr] ${data.toString()}`);
    });

    child.on('error', (error) => {
      console.error(`❌ Profile launch error:`, error);
    });

    child.unref();

    profileWindows.set(profileId, {
      pid: child.pid,
      profileId
    });

    console.log(`Profile ${profileId} launched with PID ${child.pid}`);
    
    return {
      success: true,
      pid: child.pid
    };
  } catch (error) {
    console.error(`Error launching profile ${profileId}:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Crea un nuevo perfil
 */
async function createProfile(name, type) {
  try {
    const result = await execBrainCommand(['profile', 'create', name, '--type', type, '--json']);
    return JSON.parse(result.stdout);
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  listProfiles,
  launchProfile,
  createProfile
};