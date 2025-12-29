const { spawn } = require('child_process');
const { paths } = require('../config/paths');

/**
 * Ejecuta un comando del CLI de Brain
 */
function execBrainCommand(args, options = {}) {
  return new Promise((resolve, reject) => {
    const pythonPath = paths.pythonExe;
    const brainPath = paths.runtimeDir;  

    const child = spawn(pythonPath, ['-m', 'brain', ...args], {
      cwd: brainPath,
      env: { 
        ...process.env, 
        PYTHONPATH: brainPath,
        BLOOM_EXTENSION_PATH: paths.extensionBrainDir,
        PYTHONNOUSERSITE: '1'
      },
      ...options
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr, code });
      } else {
        reject(new Error(`Brain command failed: ${stderr || stdout}`));
      }
    });

    child.on('error', reject);
  });
}

module.exports = {
  execBrainCommand
};