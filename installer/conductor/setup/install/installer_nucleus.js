// install/installer_nucleus.js
// Sistema de Hitos Atómicos - Deployments de Nucleus, Sentinel, Ollama, Conductor, Cortex
// FIXED: JSON parsing now handles stdout logs from binaries

const path = require('path');
const fs = require('fs-extra');
const { spawn } = require('child_process');
const { paths } = require('../config/paths');
const { getLogger } = require('../../shared/logger');
const { nucleusManager } = require('./nucleus_manager');

const logger = getLogger('installer');

// ============================================================================
// NUCLEUS UTILITIES
// ============================================================================

function getNucleusExecutablePath() {
  return paths.nucleusExe;
}

async function executeNucleusCommand(args) {
  return new Promise((resolve, reject) => {
    const nucleusExe = getNucleusExecutablePath();

    if (!fs.existsSync(nucleusExe)) {
      return reject(new Error(`Nucleus executable not found: ${nucleusExe}`));
    }

    const child = spawn(nucleusExe, args, {
      cwd: path.dirname(nucleusExe),
      windowsHide: true,
      timeout: 60000
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    child.on('close', (code) => {
      if (code !== 0) {
        // Include both stdout and stderr in error message for better debugging
        const errorDetails = [];
        if (stderr.trim()) errorDetails.push(`stderr: ${stderr.trim()}`);
        if (stdout.trim()) errorDetails.push(`stdout: ${stdout.trim()}`);
        
        const errorMsg = errorDetails.length > 0 
          ? errorDetails.join('\n') 
          : 'No error message provided';
          
        return reject(new Error(`Nucleus exited ${code}: ${errorMsg}`));
      }
      
      // Si es --json, parsear extrayendo solo el JSON válido
      if (args.includes('--json')) {
        try {
          // Extraer solo el JSON válido usando un parser incremental
          const lines = stdout.split('\n');
          let jsonStart = -1;
          let braceCount = 0;
          let inJson = false;
          let jsonLines = [];
          
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Detectar inicio de JSON
            if (!inJson && (line.startsWith('{') || line.startsWith('['))) {
              inJson = true;
              jsonStart = i;
            }
            
            if (inJson) {
              jsonLines.push(lines[i]);
              
              // Contar llaves para detectar fin del JSON
              for (const char of line) {
                if (char === '{' || char === '[') braceCount++;
                if (char === '}' || char === ']') braceCount--;
              }
              
              // JSON completo cuando braceCount vuelve a 0
              if (braceCount === 0) {
                break;
              }
            }
          }
          
          if (jsonLines.length === 0) {
            return reject(new Error(`No JSON found in Nucleus output: ${stdout.trim()}`));
          }
          
          const jsonStr = jsonLines.join('\n').trim();
          resolve(JSON.parse(jsonStr));
        } catch (e) {
          reject(new Error(`Failed to parse Nucleus JSON: ${e.message}\nOutput: ${stdout.slice(0, 200)}`));
        }
      } else {
        resolve(stdout.trim());
      }
    });

    child.on('error', (err) => reject(err));
  });
}

async function nucleusHealth() {
  const output = await executeNucleusCommand(['--json', 'info']);
  return output;
}

// ============================================================================
// SENTINEL UTILITIES
// ============================================================================

function getSentinelExecutablePath() {
  return paths.sentinelExe;
}

async function executeSentinelCommand(args) {
  return new Promise((resolve, reject) => {
    const sentinelExe = getSentinelExecutablePath();

    if (!fs.existsSync(sentinelExe)) {
      return reject(new Error(`Sentinel not found: ${sentinelExe}`));
    }

    const child = spawn(sentinelExe, args, {
      cwd: path.dirname(sentinelExe),
      windowsHide: true,
      timeout: 60000
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    child.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Sentinel exited ${code}: ${stderr.trim()}`));
      }
      
      try {
        // Extraer solo el JSON válido usando un parser incremental
        const lines = stdout.split('\n');
        let jsonStart = -1;
        let braceCount = 0;
        let inJson = false;
        let jsonLines = [];
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          
          // Detectar inicio de JSON
          if (!inJson && (line.startsWith('{') || line.startsWith('['))) {
            inJson = true;
            jsonStart = i;
          }
          
          if (inJson) {
            jsonLines.push(lines[i]);
            
            // Contar llaves para detectar fin del JSON
            for (const char of line) {
              if (char === '{' || char === '[') braceCount++;
              if (char === '}' || char === ']') braceCount--;
            }
            
            // JSON completo cuando braceCount vuelve a 0
            if (braceCount === 0) {
              break;
            }
          }
        }
        
        if (jsonLines.length === 0) {
          return reject(new Error(`No JSON found in Sentinel output: ${stdout.trim()}`));
        }
        
        const jsonStr = jsonLines.join('\n').trim();
        const result = JSON.parse(jsonStr);
        resolve(result);
      } catch (e) {
        reject(new Error(`Failed to parse Sentinel JSON: ${e.message}\nOutput: ${stdout.slice(0, 200)}`));
      }
    });

    child.on('error', (err) => reject(err));
  });
}

// ============================================================================
// DEPLOY FUNCTIONS
// ============================================================================

async function deployNucleus(win) {
  const MILESTONE = 'binaries'; // Nucleus es parte de binaries
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ Milestone ${MILESTONE} ya completado, saltando Nucleus`);
    return { success: true, skipped: true };
  }

  logger.separator('DEPLOYING NUCLEUS (Governance Layer)');

  try {
    await fs.ensureDir(paths.nucleusDir);

    // Copy nucleus.exe
    const nucleusExeSource = path.join(paths.nucleusSource, 'nucleus.exe');
    await fs.copy(nucleusExeSource, paths.nucleusExe, { overwrite: true });
    logger.success('✓ nucleus.exe');

    // Copy nucleus-governance.json (renamed from blueprint.json)
    const blueprintSource = path.join(paths.nucleusSource, 'blueprint.json');
    if (await fs.pathExists(blueprintSource)) {
      await fs.copy(blueprintSource, paths.nucleusConfig, { overwrite: true });
      logger.success('✓ nucleus-governance.json');
    }

    // Copy help/ folder
    const helpSource = path.join(paths.nucleusSource, 'help');
    if (await fs.pathExists(helpSource)) {
      await fs.copy(helpSource, path.join(paths.nucleusDir, 'help'), { overwrite: true });
      logger.success('✓ help/');
    }

    // Smoke test
    const version = await executeNucleusCommand(['version']);
    logger.success(`✓ Nucleus version: ${version}`);

    return { success: true };

  } catch (error) {
    logger.error('Nucleus deployment failed:', error.message);
    throw error;
  }
}

async function deploySentinel(win) {
  const MILESTONE = 'binaries';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ Milestone ${MILESTONE} ya completado, saltando Sentinel`);
    return { success: true, skipped: true };
  }

  logger.separator('DEPLOYING SENTINEL (Operations Layer)');

  try {
    await fs.ensureDir(paths.sentinelDir);

    // Copy sentinel.exe
    const sentinelExeSource = path.join(paths.sentinelSource, 'sentinel.exe');
    await fs.copy(sentinelExeSource, paths.sentinelExe, { overwrite: true });
    logger.success('✓ sentinel.exe');

    // Copy sentinel-config.json
    const configSource = path.join(paths.sentinelSource, 'sentinel-config.json');
    if (await fs.pathExists(configSource)) {
      await fs.copy(configSource, paths.sentinelConfig, { overwrite: true });
      logger.success('✓ sentinel-config.json');
    }

    // Copy help/
    const helpSource = path.join(paths.sentinelSource, 'help');
    if (await fs.pathExists(helpSource)) {
      await fs.copy(helpSource, path.join(paths.sentinelDir, 'help'), { overwrite: true });
      logger.success('✓ help/');
    }

    // Smoke test - NOW USES --json flag
    const versionInfo = await executeSentinelCommand(['--json', 'version']);
    logger.success(`✓ Sentinel version: ${versionInfo.full_release || versionInfo.version}`);

    return { success: true };

  } catch (error) {
    logger.error('Sentinel deployment failed:', error.message);
    throw error;
  }
}

async function deployBrain(win) {
  const MILESTONE = 'binaries';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ Milestone ${MILESTONE} ya completado, saltando Brain`);
    return { success: true, skipped: true };
  }

  logger.separator('DEPLOYING BRAIN');

  try {
    await fs.ensureDir(paths.brainDir);

    // Copy brain.exe
    const brainExeSource = path.join(paths.brainSource, 'brain.exe');
    await fs.copy(brainExeSource, paths.brainExe, { overwrite: true });
    logger.success('✓ brain.exe');

    // Copy _internal/ folder
    const internalSource = path.join(paths.brainSource, '_internal');
    const internalDest = path.join(paths.brainDir, '_internal');
    await fs.copy(internalSource, internalDest, { overwrite: true });
    logger.success('✓ _internal/');

    return { success: true };

  } catch (error) {
    logger.error('Brain deployment failed:', error.message);
    throw error;
  }
}

async function deployNativeHost(win) {
  const MILESTONE = 'binaries';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ Milestone ${MILESTONE} ya completado, saltando Native Host`);
    return { success: true, skipped: true };
  }

  logger.separator('DEPLOYING NATIVE HOST');

  try {
    await fs.ensureDir(paths.nativeDir);

    // Copy bloom-host.exe
    const hostExeSource = path.join(paths.nativeSource, 'bloom-host.exe');
    await fs.copy(hostExeSource, paths.hostBinary, { overwrite: true });
    logger.success('✓ bloom-host.exe');

    // Copy libwinpthread-1.dll (CRITICAL dependency)
    const dllSource = path.join(paths.nativeSource, 'libwinpthread-1.dll');
    const dllDest = path.join(paths.nativeDir, 'libwinpthread-1.dll');
    await fs.copy(dllSource, dllDest, { overwrite: true });
    logger.success('✓ libwinpthread-1.dll');

    // Copy nssm.exe
    await fs.copy(paths.nssmSource, paths.nssmExe, { overwrite: true });
    logger.success('✓ nssm.exe');

    return { success: true };

  } catch (error) {
    logger.error('Native Host deployment failed:', error.message);
    throw error;
  }
}

async function deployOllama(win) {
  const MILESTONE = 'binaries';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ Milestone ${MILESTONE} ya completado, saltando Ollama`);
    return { success: true, skipped: true };
  }

  logger.separator('DEPLOYING OLLAMA');

  try {
    await fs.ensureDir(paths.ollamaDir);

    // Copy ollama.exe
    const ollamaExeSource = path.join(paths.ollamaSource, 'ollama.exe');
    await fs.copy(ollamaExeSource, paths.ollamaExe, { overwrite: true });
    logger.success('✓ ollama.exe');

    // Copy lib/ folder with CUDA/Vulkan subdirs
    const libSource = path.join(paths.ollamaSource, 'lib');
    const libDest = path.join(paths.ollamaDir, 'lib');
    
    if (await fs.pathExists(libSource)) {
      await fs.copy(libSource, libDest, { overwrite: true });
      logger.success('✓ lib/cuda_v12/');
      logger.success('✓ lib/cuda_v13/');
      logger.success('✓ lib/vulkan/');
    }

    return { success: true };

  } catch (error) {
    logger.error('Ollama deployment failed:', error.message);
    throw error;
  }
}

async function deployCortex(win) {
  const MILESTONE = 'binaries';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ Milestone ${MILESTONE} ya completado, saltando Cortex`);
    return { success: true, skipped: true };
  }

  logger.separator('DEPLOYING CORTEX');

  try {
    await fs.ensureDir(paths.cortexDir);

    // Copy bloom-cortex.blx (fixed filename)
    const cortexSource = path.join(paths.cortexSource, 'bloom-cortex.blx');
    
    if (!await fs.pathExists(cortexSource)) {
      throw new Error(`bloom-cortex.blx not found at: ${cortexSource}`);
    }

    await fs.copy(cortexSource, paths.cortexBlx, { overwrite: true });
    logger.success('✓ bloom-cortex.blx');

    return { success: true };

  } catch (error) {
    logger.error('Cortex deployment failed:', error.message);
    throw error;
  }
}

async function deployNode(win) {
  logger.separator('DEPLOYING NODE.JS');

  try {
    await fs.ensureDir(paths.nodeDir);

    // Copy node.exe - fix path if nodeSource is incorrect
    let nodeExeSource = path.join(paths.nodeSource, 'node.exe');
    
    // Check if path has double 'installer' and fix it
    if (!await fs.pathExists(nodeExeSource)) {
      // Try alternate path without double 'installer'
      const altPath = nodeExeSource.replace(/installer[\\\/]installer[\\\/]/, 'installer/');
      if (await fs.pathExists(altPath)) {
        nodeExeSource = altPath;
        logger.warn(`⚠️ Fixed path: ${nodeExeSource}`);
      } else {
        throw new Error(`node.exe not found at: ${nodeExeSource} or ${altPath}`);
      }
    }

    await fs.copy(nodeExeSource, paths.nodeExe, { overwrite: true });
    logger.success('✓ node.exe');

    return { success: true };

  } catch (error) {
    logger.error('Node deployment failed:', error.message);
    throw error;
  }
}

async function deployTemporal(win) {
  const MILESTONE = 'binaries';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ Milestone ${MILESTONE} ya completado, saltando Temporal`);
    return { success: true, skipped: true };
  }

  logger.separator('DEPLOYING TEMPORAL');

  try {
    // Ensure temporal directory exists (use paths.temporalDir or construct it)
    const temporalDir = paths.temporalDir || path.join(paths.binDir, 'temporal');
    await fs.ensureDir(temporalDir);

    // Determine source path - use same pattern as other sources
    // paths.nucleusSource points to installer/native/bin/win32/nucleus
    // So installer root is 4 levels up from there
    let temporalSource;
    if (paths.temporalSource) {
      temporalSource = paths.temporalSource;
    } else if (paths.nucleusSource) {
      // Go up from installer/native/bin/win32/nucleus to installer/
      const installerRoot = path.dirname(path.dirname(path.dirname(path.dirname(paths.nucleusSource))));
      temporalSource = path.join(installerRoot, 'temporal');
    } else {
      throw new Error('Cannot determine temporal source path - paths.temporalSource and paths.nucleusSource are both undefined');
    }
    
    const temporalExeSource = path.join(temporalSource, 'temporal.exe');
    
    if (!await fs.pathExists(temporalExeSource)) {
      throw new Error(`temporal.exe not found at: ${temporalExeSource}`);
    }

    const temporalExe = paths.temporalExe || path.join(temporalDir, 'temporal.exe');
    await fs.copy(temporalExeSource, temporalExe, { overwrite: true });
    logger.success('✓ temporal.exe');

    return { success: true };

  } catch (error) {
    logger.error('Temporal deployment failed:', error.message);
    throw error;
  }
}

async function deployConductor(win) {
  const MILESTONE = 'conductor';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ Milestone ${MILESTONE} ya completado, saltando Conductor`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);

  logger.separator('DEPLOYING CONDUCTOR');

  try {
    await fs.ensureDir(paths.conductorDir);

    // Copy bloom-conductor.exe from resources
    const conductorSource = path.join(paths.conductorSource, 'bloom-conductor.exe');
    
    if (!await fs.pathExists(conductorSource)) {
      throw new Error('bloom-conductor.exe not found in resources');
    }

    await fs.copy(conductorSource, paths.conductorExe, { overwrite: true });
    logger.success('✓ bloom-conductor.exe');

    await nucleusManager.completeMilestone(MILESTONE, { deployed: true });

    return { success: true };

  } catch (error) {
    await nucleusManager.failMilestone(MILESTONE, error.message);
    throw error;
  }
}

// ============================================================================
// ORCHESTRATION
// ============================================================================

async function deployAllBinaries(win) {
  const MILESTONE = 'binaries';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ Milestone ${MILESTONE} ya completado`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);

  try {
    // Sub-milestones individuales
    if (!nucleusManager.isSubMilestoneCompleted(MILESTONE, 'nucleus')) {
      await deployNucleus(win);
      await nucleusManager.completeSubMilestone(MILESTONE, 'nucleus');
    }

    if (!nucleusManager.isSubMilestoneCompleted(MILESTONE, 'sentinel')) {
      await deploySentinel(win);
      await nucleusManager.completeSubMilestone(MILESTONE, 'sentinel');
    }

    if (!nucleusManager.isSubMilestoneCompleted(MILESTONE, 'brain')) {
      await deployBrain(win);
      await nucleusManager.completeSubMilestone(MILESTONE, 'brain');
    }

    if (!nucleusManager.isSubMilestoneCompleted(MILESTONE, 'native')) {
      await deployNativeHost(win);
      await nucleusManager.completeSubMilestone(MILESTONE, 'native');
    }

    if (!nucleusManager.isSubMilestoneCompleted(MILESTONE, 'ollama')) {
      await deployOllama(win);
      await nucleusManager.completeSubMilestone(MILESTONE, 'ollama');
    }

    if (!nucleusManager.isSubMilestoneCompleted(MILESTONE, 'cortex')) {
      await deployCortex(win);
      await nucleusManager.completeSubMilestone(MILESTONE, 'cortex');
    }

    if (!nucleusManager.isSubMilestoneCompleted(MILESTONE, 'node')) {
      await deployNode(win);
      await nucleusManager.completeSubMilestone(MILESTONE, 'node');
    }

    if (!nucleusManager.isSubMilestoneCompleted(MILESTONE, 'temporal')) {
      await deployTemporal(win);
      await nucleusManager.completeSubMilestone(MILESTONE, 'temporal');
    }

    await nucleusManager.completeMilestone(MILESTONE, { all_binaries_deployed: true });

    return { success: true };

  } catch (error) {
    await nucleusManager.failMilestone(MILESTONE, error.message);
    throw error;
  }
}

module.exports = {
  deployNucleus,
  deploySentinel,
  deployBrain,
  deployNativeHost,
  deployOllama,
  deployCortex,
  deployNode,
  deployTemporal,
  deployConductor,
  deployAllBinaries,
  nucleusHealth,
  executeNucleusCommand,
  executeSentinelCommand,
  getNucleusExecutablePath
};