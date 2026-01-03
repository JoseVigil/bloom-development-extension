const { spawn } = require('child_process');
const { paths } = require('../config/paths');
const path = require('path');

/**
 * Ejecuta un comando del CLI de Brain
 * 
 * ✅ MIGRATED: Uses direct execution with runtime Python
 * ❌ OLD: python -m brain (required PYTHONPATH)
 * ✅ NEW: python brain/__main__.py (no PYTHONPATH needed)
 */
function execBrainCommand(args, options = {}) {
  return new Promise((resolve, reject) => {
    const pythonPath = paths.pythonExe;
    
    // ✅ CRITICAL: Use brain/__main__.py for direct execution
    const brainMainPy = path.join(paths.brainDir, '__main__.py');

    // ✅ NEW: Direct execution - python brain/__main__.py [args]
    const fullArgs = [brainMainPy, ...args];

    console.log(`[brain-commands] Executing: ${pythonPath} ${fullArgs.join(' ')}`);

    const child = spawn(pythonPath, fullArgs, {
      cwd: paths.brainDir,
      env: { 
        ...process.env,
        // ✅ NO PYTHONPATH needed - brain injects sys.path internally
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
        reject(new Error(`Brain command failed (code ${code}): ${stderr || stdout}`));
      }
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn brain: ${err.message}`));
    });
  });
}

module.exports = {
  execBrainCommand
};