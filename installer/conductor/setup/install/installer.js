// install/installer.js
// Integrated with Nucleus Manager - Atomic Milestones
// FIXED: Temporal initialization with correct PATH
//
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔴 TELEMETRY POLICY — CRITICAL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// ❌ FORBIDDEN in Electron:
//    - Writing telemetry.json directly
//    - Creating telemetry.json.tmp
//    - Using TelemetryManager/TelemetryWriter
//    - Atomic writes with rename()
//    - ANY direct manipulation of telemetry.json
//
// ✅ REQUIRED:
//    - Create .log files in logs/electron/
//    - Register streams via: nucleus telemetry register
//    - Nucleus is the ONLY writer to telemetry.json
//
// If logs show "telemetry.json.tmp" or "rename telemetry" → IMPLEMENTATION IS INVALID
//
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const path = require('path');
const fs = require('fs-extra');
const { spawn } = require('child_process');
const { BrowserWindow } = require('electron');

const { paths } = require('../config/paths');
const { getLogger } = require('../../shared/logger');
const { nucleusManager } = require('./nucleus_manager');
const logger = getLogger('installer');

const {
  cleanupOldServices,
  installWindowsService,
  startService,
  NEW_SERVICE_NAME
} = require('./service-installer');

const { installRuntime } = require('./runtime-installer');
const { installChromium } = require('./chromium-installer');

const {
  deployAllBinaries,
  deployConductor,
  nucleusHealth,
  executeNucleusCommand,
  executeSentinelCommand,
  getNucleusExecutablePath,
  registerTelemetryStream
} = require('./installer_nucleus');

// ============================================================================
// PROGRESS REPORTING
// ============================================================================

function emitProgress(win, current, total, message) {
  if (win && win.webContents) {
    win.webContents.send('installation-progress', {
      current,
      total,
      percentage: Math.round((current / total) * 100),
      message
    });
  }
  logger.info(`[${current}/${total}] ${message}`);
}

// ============================================================================
// MILESTONE EXECUTORS
// ============================================================================

async function createDirectories(win) {
  const MILESTONE = 'directories';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ ${MILESTONE} completed, skipping`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);
  emitProgress(win, 1, 9, 'Creating directories...');

  try {
    logger.separator('CREATING DIRECTORIES');

    const dirs = [
      paths.binDir,
      paths.nucleusDir,
      paths.sentinelDir,
      paths.brainDir,
      paths.nativeDir,
      paths.ollamaDir,
      paths.cortexDir,
      paths.conductorDir,
      paths.chromeDir,
      paths.configDir,
      paths.engineDir,
      paths.runtimeDir,
      paths.profilesDir,
      paths.logsDir,
      paths.temporalDir  // ✅ Asegurar que temporal dir exista
    ];

    for (const dir of dirs) {
      await fs.ensureDir(dir);
      logger.success(`✔ ${path.basename(dir)}/`);
    }

    await nucleusManager.completeMilestone(MILESTONE, { dirs_created: dirs.length });
    return { success: true };

  } catch (error) {
    await nucleusManager.failMilestone(MILESTONE, error.message);
    throw error;
  }
}

async function runChromiumInstall(win) {
  const MILESTONE = 'chromium';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ ${MILESTONE} completed, skipping`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);
  emitProgress(win, 2, 9, 'Installing Chromium...');

  try {
    const result = await installChromium(win);
    await nucleusManager.completeMilestone(MILESTONE, result);
    return result;

  } catch (error) {
    await nucleusManager.failMilestone(MILESTONE, error.message);
    throw error;
  }
}

async function runRuntimeInstall(win) {
  const MILESTONE = 'brain_runtime';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ ${MILESTONE} completed, skipping`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);
  emitProgress(win, 3, 9, 'Installing Python Runtime...');

  try {
    // Remover servicio antes de instalar runtime (si existe)
    const { removeService } = require('./service-installer');
    
    logger.info('Stopping Brain Service before runtime install...');
    await removeService(NEW_SERVICE_NAME);
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s
    
    const result = await installRuntime(win);
    await nucleusManager.completeMilestone(MILESTONE, result);
    return result;

  } catch (error) {
    await nucleusManager.failMilestone(MILESTONE, error.message);
    throw error;
  }
}

async function runBinariesDeploy(win) {
  const MILESTONE = 'binaries';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ ${MILESTONE} completed, skipping`);
    return { success: true, skipped: true };
  }

  emitProgress(win, 4, 9, 'Deploying binaries (Nucleus, Sentinel, Brain, Alfred)...');

  try {
    const result = await deployAllBinaries(win);
    return result;

  } catch (error) {
    throw error;
  }
}

async function runConductorDeploy(win) {
  const MILESTONE = 'conductor';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ ${MILESTONE} completed, skipping`);
    return { success: true, skipped: true };
  }

  emitProgress(win, 5, 9, 'Deploying Conductor...');

  try {
    const result = await deployConductor(win);
    return result;

  } catch (error) {
    throw error;
  }
}

async function installBrainService(win) {
  const MILESTONE = 'brain_service_install';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ ${MILESTONE} completed, skipping`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);
  emitProgress(win, 6, 10, 'Installing Brain Service...');

  try {
    logger.separator('INSTALLING BRAIN SERVICE');

    // Ejecutar install-brain-service.bat desde el repo
    // __dirname = installer/conductor/setup/install/
    // scriptPath = installer/conductor/setup/scripts/install-brain-service.bat
    const scriptPath = path.join(__dirname, '..', 'scripts', 'install-brain-service.bat');
    
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`Script not found: ${scriptPath}`);
    }

    logger.info(`Executing: ${scriptPath}`);

    // Ejecutar con spawn (Electron ya tiene permisos elevados)
    const result = await new Promise((resolve, reject) => {
      const proc = spawn(scriptPath, [], {
        stdio: 'inherit',
        windowsVerbatimArguments: true
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          reject(new Error(`Brain Service installation failed with code ${code}`));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to execute script: ${err.message}`));
      });
    });

    await nucleusManager.completeMilestone(MILESTONE, { service_running: true });
    return result;

  } catch (error) {
    await nucleusManager.failMilestone(MILESTONE, error.message);
    throw error;
  }
}

// ============================================================================
// NUCLEUS SERVICE BOOT SEQUENCE
// ============================================================================

async function waitForNucleusReady(win) {
  const MILESTONE = 'nucleus_ready';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ ${MILESTONE} completed, skipping`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);
  emitProgress(win, 8, 10, 'Waiting for Nucleus Service to initialize...');

  try {
    logger.separator('WAITING FOR NUCLEUS BOOT SEQUENCE');
    logger.info('Nucleus Service is starting:');
    logger.info('  Phase 1: Temporal Server');
    logger.info('  Phase 2: Worker Manager');
    logger.info('  Phase 3: Ollama (via synapse)');
    logger.info('  Phase 4: Governance');
    logger.info('  Phase 5: Vault');
    logger.info('  Phase 6: Control Plane');

    const maxAttempts = 90; // 90 segundos para boot completo
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      attempts++;
      
      try {
        const health = await nucleusHealth();
        
        // Verificar componentes críticos
        const temporal = health.components?.temporal;
        const worker = health.components?.worker_manager;
        const ollama = health.components?.ollama;
        const controlPlane = health.components?.control_plane;
        
        const allReady = temporal?.healthy && 
                        worker?.healthy && 
                        ollama?.healthy && 
                        controlPlane?.healthy;
        
        if (allReady) {
          logger.success('✔ Nucleus Service fully operational');
          logger.info(`  ✓ Temporal: ${temporal.state} (port 7233)`);
          logger.info(`  ✓ Worker: ${worker.state}`);
          logger.info(`  ✓ Ollama: ${ollama.state}`);
          logger.info(`  ✓ Control Plane: ${controlPlane.state}`);
          
          await nucleusManager.completeMilestone(MILESTONE, health);
          return { success: true };
        }
        
        // Log progreso cada 5 intentos
        if (attempts % 5 === 0) {
          logger.info(`[${attempts}/${maxAttempts}] Boot in progress...`);
          logger.debug(`  Temporal: ${temporal?.state || 'pending'}`);
          logger.debug(`  Worker: ${worker?.state || 'pending'}`);
          logger.debug(`  Ollama: ${ollama?.state || 'pending'}`);
          logger.debug(`  Control Plane: ${controlPlane?.state || 'pending'}`);
        }
        
      } catch (err) {
        // Health check aún no disponible
        if (attempts % 10 === 0) {
          logger.debug(`Health endpoint not ready yet (attempt ${attempts})`);
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new Error('Nucleus Service boot sequence timeout after 90 seconds');

  } catch (error) {
    logger.error('Nucleus boot failed:', error.message);
    
    // Intentar obtener logs del servicio para diagnóstico
    try {
      const serviceLog = path.join(paths.logsDir, 'nucleus', 'service', `nucleus_service_${getDateStamp()}.log`);
      if (fs.existsSync(serviceLog)) {
        const lastLines = await fs.readFile(serviceLog, 'utf8');
        logger.error('Last service log output:');
        logger.error(lastLines.split('\n').slice(-20).join('\n'));
      }
    } catch (logErr) {
      // Ignorar errores al leer log
    }
    
    await nucleusManager.failMilestone(MILESTONE, error.message);
    throw error;
  }
}

function getDateStamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

async function seedMasterProfile(win) {
  const MILESTONE = 'nucleus_seed';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ ${MILESTONE} completed, skipping`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);
  emitProgress(win, 9, 10, 'Seeding Master Profile...');

  try {
    logger.separator('SEEDING MASTER PROFILE');

    // Usar Nucleus synapse launch con workflow de Temporal
    const result = await executeNucleusCommand([
      '--json',
      'synapse',
      'launch',
      '--register',
      '--role', 'master',
      '--save'
    ]);

    const profileId = result.profile_id || result.data?.uuid;

    if (!profileId) {
      throw new Error('Seed failed: no profile_id returned');
    }

    logger.success(`✔ Master profile: ${profileId}`);

    await nucleusManager.setMasterProfile(profileId);
    await nucleusManager.completeMilestone(MILESTONE, result);

    return { success: true, profile_id: profileId };

  } catch (error) {
    await nucleusManager.failMilestone(MILESTONE, error.message);
    throw error;
  }
}

async function installNucleusService(win) {
  const MILESTONE = 'nucleus_service_install';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ ${MILESTONE} completed, skipping`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);
  emitProgress(win, 9.5, 10, 'Installing Nucleus Service...');

  try {
    logger.separator('INSTALLING NUCLEUS SERVICE');

    // Ejecutar install-nucleus-service.bat desde el repo
    // __dirname = installer/conductor/setup/install/
    // scriptPath = installer/conductor/setup/scripts/install-nucleus-service.bat
    const scriptPath = path.join(__dirname, '..', 'scripts', 'install-nucleus-service.bat');
    
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`Script not found: ${scriptPath}`);
    }

    logger.info(`Executing: ${scriptPath}`);

    // Ejecutar con spawn (Electron ya tiene permisos elevados)
    const result = await new Promise((resolve, reject) => {
      const proc = spawn(scriptPath, [], {
        stdio: 'inherit',
        windowsVerbatimArguments: true
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          reject(new Error(`Nucleus Service installation failed with code ${code}`));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to execute script: ${err.message}`));
      });
    });

    await nucleusManager.completeMilestone(MILESTONE, { service_running: true });
    return result;

  } catch (error) {
    await nucleusManager.failMilestone(MILESTONE, error.message);
    throw error;
  }
}

async function runCertification(win) {
  const MILESTONE = 'certification';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ ${MILESTONE} completed, skipping`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);
  emitProgress(win, 10, 10, 'Running certification...');

  try {
    logger.separator('CERTIFICATION - NUCLEUS HEALTH CHECK');

    const healthResult = await nucleusHealth();

    // Nuevo formato: { success: boolean, state: string, components: {...} }
    if (!healthResult.success) {
      logger.warn('⚠️ Health check failed:');
      logger.warn(`  State: ${healthResult.state}`);
      logger.warn(`  Error: ${healthResult.error}`);
      
      // Log componentes unhealthy
      const components = healthResult.components || {};
      for (const [name, status] of Object.entries(components)) {
        if (!status.healthy) {
          logger.warn(`  ${name}: ${status.state} - ${status.error || 'N/A'}`);
        }
      }
      
      throw new Error(`Certification failed: ${healthResult.error}`);
    }

    // Verificar componentes críticos
    const critical = ['brain_service', 'temporal', 'worker_manager'];
    const unhealthy = critical.filter(c => !healthResult.components?.[c]?.healthy);
    
    if (unhealthy.length > 0) {
      throw new Error(`Critical components unhealthy: ${unhealthy.join(', ')}`);
    }

    logger.success('✅ SYSTEM CERTIFIED');
    logger.info('  Healthy components:');
    for (const [name, status] of Object.entries(healthResult.components || {})) {
      if (status.healthy) {
        logger.info(`    ✓ ${name}: ${status.state}`);
      }
    }

    await nucleusManager.completeMilestone(MILESTONE, healthResult);
    return { success: true };

  } catch (error) {
    await nucleusManager.failMilestone(MILESTONE, error.message);
    throw error;
  }
}

// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================

async function installService(win) {
  try {
    logger.separator('BLOOM NUCLEUS INSTALLATION');

    await nucleusManager.initialize();

    const summary = nucleusManager.getInstallationSummary();
    logger.info('Installation state:', summary);

    if (summary.next_milestone) {
      logger.info(`Resuming from: ${summary.next_milestone}`);
    }

    await createDirectories(win);
    await runChromiumInstall(win);
    await runRuntimeInstall(win);
    await runBinariesDeploy(win);
    await runConductorDeploy(win);
    await installBrainService(win);
    await installNucleusService(win);
    await waitForNucleusReady(win);
    await seedMasterProfile(win);
    await runCertification(win);

    await nucleusManager.markInstallationComplete();

    logger.success('🎉 INSTALLATION COMPLETE');

    if (win && win.webContents) {
      win.webContents.send('installation-complete', {
        success: true,
        profile_id: nucleusManager.state.master_profile
      });
    }

    return {
      success: true,
      profile_id: nucleusManager.state.master_profile
    };

  } catch (error) {
    logger.error('Installation failed:', error.message);

    if (win && win.webContents) {
      win.webContents.send('installation-error', {
        error: error.message,
        stack: error.stack
      });
    }

    throw error;
  }
}

module.exports = {
  installService
};