// install/installer_nucleus.js
// Sistema de Hitos Atómicos - Deployments de Nucleus, Sentinel, Ollama, Conductor, Cortex

const path = require('path');
const fs = require('fs-extra');
const { spawn } = require('child_process');
const { paths } = require('../config/paths');
const { getLogger } = require('../src/logger');
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
        return reject(new Error(`Nucleus exited ${code}: ${stderr.trim()}`));
      }
      resolve(stdout.trim());
    });

    child.on('error', (err) => reject(err));
  });
}

async function nucleusHealth() {
  const output = await executeNucleusCommand(['--json', 'health']);
  return JSON.parse(output);
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
        // ✅ SOLO parsear stdout, ignorar stderr (logs)
        const cleanOutput = stdout.trim();
        
        // Buscar el JSON en el output (puede tener logs antes)
        const jsonMatch = cleanOutput.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]);
          resolve(result);
        } else {
          // Si no hay JSON, retornar el stdout tal cual
          resolve({ raw_output: cleanOutput });
        }
      } catch (e) {
        reject(new Error(`Failed to parse Sentinel JSON: ${e.message}\nOutput: ${stdout}`));
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
    logger.info(`⏭️ Milestone ${MILESTONE} ya completado, saltando Nucleus`);
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
    logger.info(`⏭️ Milestone ${MILESTONE} ya completado, saltando Sentinel`);
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

    // Smoke test - CAMBIADO: usar executeSentinelVersion que NO parsea JSON
    const version = await executeSentinelVersion();
    logger.success(`✓ Sentinel version: ${version}`);

    return { success: true };

  } catch (error) {
    logger.error('Sentinel deployment failed:', error.message);
    throw error;
  }
}

// NUEVA FUNCIÓN: ejecuta "sentinel version" SIN parsear JSON
async function executeSentinelVersion() {
  return new Promise((resolve, reject) => {
    const sentinelExe = getSentinelExecutablePath();

    if (!fs.existsSync(sentinelExe)) {
      return reject(new Error(`Sentinel not found: ${sentinelExe}`));
    }

    const child = spawn(sentinelExe, ['version'], {
      cwd: path.dirname(sentinelExe),
      windowsHide: true,
      timeout: 10000
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    child.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Sentinel exited ${code}: ${stderr.trim()}`));
      }
      // Retornar texto plano sin parsear
      resolve(stdout.trim());
    });

    child.on('error', (err) => reject(err));
  });
}

async function deployBrain(win) {
  const MILESTONE = 'binaries';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⏭️ Milestone ${MILESTONE} ya completado, saltando Brain`);
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
    logger.info(`⏭️ Milestone ${MILESTONE} ya completado, saltando Native Host`);
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

  // ✅ AGREGAR: Verificar sub-milestone
  if (await nucleusManager.isSubMilestoneCompleted(MILESTONE, 'ollama')) {
    logger.info(`⭐️ Sub-milestone ollama ya completado, saltando`);
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

    // ✅ MARCAR sub-milestone completado
    await nucleusManager.completeSubMilestone(MILESTONE, 'ollama');

    return { success: true };

  } catch (error) {
    logger.error('Ollama deployment failed:', error.message);
    throw error;
  }
}

async function deployCortex(win) {
  const MILESTONE = 'binaries';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⏭️ Milestone ${MILESTONE} ya completado, saltando Cortex`);
    return { success: true, skipped: true };
  }

  logger.separator('DEPLOYING CORTEX');

  try {
    await fs.ensureDir(paths.cortexDir);

    // Buscar bloom-cortex.blx o bloom-cortex-*.blx
    const cortexFiles = await fs.readdir(paths.cortexSource);
    const blxFile = cortexFiles.find(f => 
      f === 'bloom-cortex.blx' || 
      (f.startsWith('bloom-cortex-') && f.endsWith('.blx'))
    );
    
    if (!blxFile) {
      throw new Error('bloom-cortex.blx not found in source');
    }

    const cortexSource = path.join(paths.cortexSource, blxFile);
    
    // Copiar siempre como bloom-cortex.blx (normalizar nombre)
    await fs.copy(cortexSource, paths.cortexBlx, { overwrite: true });
    logger.success(`✓ ${blxFile} → bloom-cortex.blx`);

    return { success: true };

  } catch (error) {
    logger.error('Cortex deployment failed:', error.message);
    throw error;
  }
}

async function deployConductor(win) {
  const MILESTONE = 'conductor';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⏭️ Milestone ${MILESTONE} ya completado, saltando Conductor`);
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
    logger.info(`⏭️ Milestone ${MILESTONE} completado`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);

  try {
    // Cada componente verifica su propio sub-estado
    if (!await nucleusManager.isSubMilestoneCompleted(MILESTONE, 'nucleus')) {
      await deployNucleus(win);
      await nucleusManager.completeSubMilestone(MILESTONE, 'nucleus');
    }

    if (!await nucleusManager.isSubMilestoneCompleted(MILESTONE, 'sentinel')) {
      await deploySentinel(win);
      await nucleusManager.completeSubMilestone(MILESTONE, 'sentinel');
    }

    if (!await nucleusManager.isSubMilestoneCompleted(MILESTONE, 'brain')) {
      await deployBrain(win);
      await nucleusManager.completeSubMilestone(MILESTONE, 'brain');
    }

    if (!await nucleusManager.isSubMilestoneCompleted(MILESTONE, 'native')) {
      await deployNativeHost(win);
      await nucleusManager.completeSubMilestone(MILESTONE, 'native');
    }

    if (!await nucleusManager.isSubMilestoneCompleted(MILESTONE, 'ollama')) {
      await deployOllama(win);
      await nucleusManager.completeSubMilestone(MILESTONE, 'ollama');
    }

    if (!await nucleusManager.isSubMilestoneCompleted(MILESTONE, 'cortex')) {
      await deployCortex(win);
      await nucleusManager.completeSubMilestone(MILESTONE, 'cortex');
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
  deployConductor,
  deployAllBinaries,
  nucleusHealth,
  executeSentinelCommand
};