const { spawn } = require('child_process');
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
    const args = ['profile', 'launch', profileId];
    if (url) {
      args.push('--url', url);
    }

    const pythonPath = paths.pythonExe;
    const brainPath = paths.runtimeDir; 

    const child = spawn(pythonPath, ['-m', 'brain', ...args], {
      cwd: brainPath,
      env: { ...process.env, PYTHONPATH: brainPath },
      detached: true,
      stdio: 'ignore'
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