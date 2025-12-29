const { spawn } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const { paths } = require('../config/paths');
const { execBrainCommand } = require('./brain-commands');
const { profileWindows } = require('../core/window-manager');

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
    const brainPath = paths.runtimeDir;

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
    console.log(` 📂 Brain: ${brainPath}`);
    console.log(` 🔧 Command: python -m brain ${args.join(' ')}`);

    // ✅ CRÍTICO: Configurar variable de entorno con BLOOM_EXTENSION_PATH
    const launchEnv = {
      ...process.env,
      PYTHONPATH: brainPath,
      BLOOM_EXTENSION_PATH: paths.extensionBrainDir,  // ⬅️ FIX CRÍTICO
      PYTHONNOUSERSITE: '1'
    };

    console.log(` 🔑 ENV: BLOOM_EXTENSION_PATH=${launchEnv.BLOOM_EXTENSION_PATH}`);

    const child = spawn(pythonPath, ['-m', 'brain', ...args], {
      cwd: brainPath,
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