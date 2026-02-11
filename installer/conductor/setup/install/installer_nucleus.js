// install/installer_nucleus.js
// Sistema de Hitos Atómicos - Deployments de Nucleus, Sentinel, Ollama, Conductor, Cortex
// FIXED: JSON parsing now handles stdout logs from binaries
// FIXED: Lazy logger initialization to prevent premature telemetry writes

const path = require('path');
const fs = require('fs-extra');
const { spawn } = require('child_process');
const { paths } = require('../config/paths');
const { getLogger } = require('../../shared/logger');
const { nucleusManager } = require('./nucleus_manager');

// ⚠️ LAZY INITIALIZATION - No inicializar logger hasta que paths esté configurado
let logger = null;

function ensureLogger() {
  if (!logger) {
    logger = getLogger('installer');
  }
  return logger;
}

// ============================================================================
// NUCLEUS UTILITIES
// ============================================================================

function getNucleusExecutablePath() {
  return paths.nucleusExe;
}

async function executeNucleusCommand(args) {
  const log = ensureLogger();
  
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
              
              // Cuando las llaves se balancean, termina el JSON
              if (braceCount === 0) {
                break;
              }
            }
          }
          
          if (jsonLines.length === 0) {
            throw new Error('No JSON found in output');
          }
          
          const jsonText = jsonLines.join('\n');
          const parsed = JSON.parse(jsonText);
          resolve(parsed);
          
        } catch (parseError) {
          log.error('Failed to parse JSON from Nucleus output');
          log.error('Raw stdout:', stdout);
          reject(new Error(`JSON parse failed: ${parseError.message}`));
        }
      } else {
        resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      }
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn nucleus: ${err.message}`));
    });
  });
}

async function executeSentinelCommand(args) {
  const log = ensureLogger();
  
  return new Promise((resolve, reject) => {
    const sentinelExe = paths.sentinelExe;

    if (!fs.existsSync(sentinelExe)) {
      return reject(new Error(`Sentinel executable not found: ${sentinelExe}`));
    }

    const child = spawn(sentinelExe, args, {
      cwd: path.dirname(sentinelExe),
      windowsHide: true,
      timeout: 30000
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    child.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Sentinel exited ${code}: ${stderr}`));
      }
      resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn sentinel: ${err.message}`));
    });
  });
}

// ============================================================================
// DEPLOYMENT FUNCTIONS
// ============================================================================

async function deployAllBinaries() {
  const log = ensureLogger();
  
  log.separator('DEPLOYING BINARIES');

  const binaries = [
    { name: 'nucleus.exe', source: paths.nucleusSource },
    { name: 'sentinel.exe', source: paths.sentinelSource },
    { name: 'cortex.exe', source: paths.cortexSource }
  ];

  for (const bin of binaries) {
    const targetPath = path.join(paths.binDir, bin.name);
    
    if (fs.existsSync(targetPath)) {
      log.info(`✓ ${bin.name} already exists, skipping`);
      continue;
    }

    if (!fs.existsSync(bin.source)) {
      throw new Error(`Source not found: ${bin.source}`);
    }

    log.info(`Copying ${bin.name}...`);
    await fs.copy(bin.source, targetPath);
    log.success(`✓ ${bin.name} deployed`);
  }

  // Deploy NSSM
  const arch = process.arch === 'x64' ? 'win64' : 'win32';
  const nssmSource = path.join(__dirname, '..', '..', 'native', 'nssm', arch, 'nssm.exe');
  
  if (!fs.existsSync(nssmSource)) {
    throw new Error(`NSSM not found: ${nssmSource}`);
  }
  
  log.info('Copying NSSM...');
  await fs.copy(nssmSource, paths.nssmExe);
  log.success('✓ NSSM deployed');

  log.success('All binaries deployed');
}

async function deployConductor(win) {
  const log = ensureLogger();
  const MILESTONE = 'conductor';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    log.info(`⭐️ Milestone ${MILESTONE} ya completado, saltando Conductor`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);

  log.separator('DEPLOYING CONDUCTOR');

  try {
    await fs.ensureDir(paths.conductorDir);

    // Copy bloom-conductor.exe from resources
    const conductorSource = path.join(paths.conductorSource, 'bloom-conductor.exe');
    
    if (!await fs.pathExists(conductorSource)) {
      throw new Error('bloom-conductor.exe not found in resources');
    }

    await fs.copy(conductorSource, paths.conductorExe, { overwrite: true });
    log.success('✓ bloom-conductor.exe');

    await nucleusManager.completeMilestone(MILESTONE, { deployed: true });

    return { success: true };

  } catch (error) {
    await nucleusManager.failMilestone(MILESTONE, error.message);
    throw error;
  }
}

async function nucleusHealth() {
  const log = ensureLogger();
  
  log.info('Checking Nucleus health...');

  try {
    const result = await executeNucleusCommand(['health']);
    log.success('✓ Nucleus health check passed');
    return result;
  } catch (error) {
    log.error('❌ Nucleus health check failed:', error.message);
    throw error;
  }
}

// ============================================================================
// OLLAMA MANAGEMENT
// ============================================================================

async function checkOllamaInstalled() {
  const log = ensureLogger();
  
  try {
    const result = await executeNucleusCommand(['ollama', 'check', '--json']);
    
    if (result && result.installed === true) {
      log.success(`✓ Ollama detected: v${result.version || 'unknown'}`);
      return true;
    }
    
    log.warn('Ollama not installed');
    return false;
    
  } catch (error) {
    log.error('Failed to check Ollama:', error.message);
    return false;
  }
}

async function installOllama() {
  const log = ensureLogger();
  
  log.separator('INSTALLING OLLAMA');
  log.info('Starting Ollama installation via Nucleus...');

  try {
    const result = await executeNucleusCommand(['ollama', 'install', '--json']);
    
    if (result && result.success) {
      log.success('✓ Ollama installed successfully');
      log.info(`   Version: ${result.version || 'unknown'}`);
      return true;
    } else {
      throw new Error(result?.error || 'Unknown installation error');
    }
    
  } catch (error) {
    log.error('❌ Ollama installation failed:', error.message);
    throw error;
  }
}

async function ensureOllamaRunning() {
  const log = ensureLogger();
  
  log.info('Ensuring Ollama service is running...');

  try {
    const result = await executeNucleusCommand(['ollama', 'start', '--json']);
    
    if (result && result.running === true) {
      log.success('✓ Ollama service is running');
      return true;
    } else {
      throw new Error(result?.error || 'Failed to start Ollama');
    }
    
  } catch (error) {
    log.error('❌ Failed to start Ollama:', error.message);
    throw error;
  }
}

async function pullOllamaModel(modelName) {
  const log = ensureLogger();
  
  log.info(`Pulling model: ${modelName}...`);

  try {
    const result = await executeNucleusCommand(['ollama', 'pull', modelName, '--json']);
    
    if (result && result.success) {
      log.success(`✓ Model ${modelName} pulled successfully`);
      return true;
    } else {
      throw new Error(result?.error || 'Unknown pull error');
    }
    
  } catch (error) {
    log.error(`❌ Failed to pull ${modelName}:`, error.message);
    throw error;
  }
}

async function ensureOllamaModels() {
  const log = ensureLogger();
  
  log.separator('VERIFYING OLLAMA MODELS');

  const requiredModels = ['qwen2.5:0.5b'];

  for (const model of requiredModels) {
    log.info(`Checking ${model}...`);
    
    try {
      const result = await executeNucleusCommand(['ollama', 'list', '--json']);
      
      if (result && result.models) {
        const modelExists = result.models.some(m => m.name.startsWith(model));
        
        if (modelExists) {
          log.success(`✓ ${model} already available`);
          continue;
        }
      }
      
      // Modelo no encontrado, intentar descargarlo
      log.warn(`${model} not found, pulling...`);
      await pullOllamaModel(model);
      
    } catch (error) {
      log.error(`Failed to verify/pull ${model}:`, error.message);
      throw error;
    }
  }

  log.success('All required models verified');
}

// ============================================================================
// PROFILE SEEDING
// ============================================================================

async function seedMasterProfile() {
  const log = ensureLogger();
  
  log.separator('SEEDING MASTER PROFILE');
  log.info('Initializing master profile via Nucleus...');

  try {
    const result = await executeNucleusCommand(['profile', 'seed', 'master', '--json']);
    
    if (result && result.success) {
      log.success('✓ Master profile seeded');
      log.info(`   Profile ID: ${result.profile_id || 'unknown'}`);
      log.info(`   Location: ${result.path || 'unknown'}`);
      return result;
    } else {
      throw new Error(result?.error || 'Seed operation failed');
    }
    
  } catch (error) {
    log.error('❌ Profile seeding failed:', error.message);
    throw error;
  }
}

// ============================================================================
// CERTIFICATION
// ============================================================================

async function runCertification() {
  const log = ensureLogger();
  
  log.separator('RUNNING CERTIFICATION');
  log.info('Certifying installation via Nucleus...');

  try {
    const result = await executeNucleusCommand(['certify', '--json']);
    
    if (result && result.success) {
      log.success('✓ Certification PASSED');
      log.info('   System Status:', result.status || 'operational');
      
      if (result.checks) {
        for (const [key, value] of Object.entries(result.checks)) {
          const status = value === true ? '✓' : '✗';
          log.info(`   ${status} ${key}`);
        }
      }
      
      return result;
    } else {
      throw new Error(result?.error || 'Certification failed');
    }
    
  } catch (error) {
    log.error('❌ Certification failed:', error.message);
    throw error;
  }
}

// ============================================================================
// NUCLEUS SERVICE STATUS
// ============================================================================

async function waitForNucleusReady(maxRetries = 30, intervalMs = 1000) {
  const log = ensureLogger();
  
  log.info('Waiting for Nucleus service to be ready...');

  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await executeNucleusCommand(['health', '--json']);
      
      if (result && result.healthy === true) {
        log.success('✓ Nucleus service is ready');
        return true;
      }
      
    } catch (error) {
      // Service not ready yet, continue retrying
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));
    
    if ((i + 1) % 5 === 0) {
      log.info(`   Still waiting... (${i + 1}/${maxRetries})`);
    }
  }

  throw new Error('Nucleus service failed to become ready');
}

async function checkNucleusServiceStatus() {
  const log = ensureLogger();
  
  try {
    const result = await executeNucleusCommand(['service', 'status', '--json']);
    
    if (result && result.running === true) {
      log.success('✓ Nucleus service is running');
      log.info(`   PID: ${result.pid || 'unknown'}`);
      return true;
    } else {
      log.warn('Nucleus service is not running');
      return false;
    }
    
  } catch (error) {
    log.error('Failed to check service status:', error.message);
    return false;
  }
}

// ============================================================================
// BRAIN SERVICE MANAGEMENT
// ============================================================================

async function checkBrainServiceStatus() {
  const log = ensureLogger();
  
  try {
    const result = await executeSentinelCommand(['service', 'status', '--json']);
    
    if (result && result.running === true) {
      log.success('✓ Brain service is running');
      return true;
    } else {
      log.warn('Brain service is not running');
      return false;
    }
    
  } catch (error) {
    log.error('Failed to check Brain service:', error.message);
    return false;
  }
}

async function startBrainService() {
  const log = ensureLogger();
  
  log.info('Starting Brain service via Sentinel...');

  try {
    const result = await executeSentinelCommand(['service', 'start', '--json']);
    
    if (result && result.success) {
      log.success('✓ Brain service started');
      return true;
    } else {
      throw new Error(result?.error || 'Failed to start service');
    }
    
  } catch (error) {
    log.error('❌ Failed to start Brain service:', error.message);
    throw error;
  }
}

// ============================================================================
// TELEMETRY REGISTRATION
// ============================================================================

async function registerTelemetryStream(streamId, label, logPath, priority = 2) {
  const log = ensureLogger();
  
  log.info(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  log.info(`Registering telemetry stream via Nucleus CLI`);
  log.info(`  Stream ID: ${streamId}`);
  log.info(`  Label: ${label}`);
  log.info(`  Log Path: ${logPath}`);
  log.info(`  Priority: ${priority}`);
  log.info(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  // Validar que el archivo .log exista
  if (!fs.existsSync(logPath)) {
    const error = new Error(`Log file does not exist: ${logPath}`);
    log.error(`❌ ${error.message}`);
    throw error;
  }

  // Validar que Nucleus esté disponible
  const nucleusExe = getNucleusExecutablePath();
  if (!fs.existsSync(nucleusExe)) {
    const error = new Error(`Nucleus executable not found: ${nucleusExe}`);
    log.error(`❌ ${error.message}`);
    throw error;
  }

  try {
    // Ejecutar comando de registro
    const result = await executeNucleusCommand([
      'telemetry',
      'register',
      '--stream', streamId,
      '--label', label,
      '--path', logPath,
      '--priority', String(priority)
    ]);

    log.success(`✅ Stream registered successfully: ${streamId}`);
    log.info(`   Nucleus updated telemetry.json atomically`);
    log.info(`   Application will ONLY write to: ${logPath}`);
    
    return result;

  } catch (error) {
    log.error(`❌ Failed to register stream ${streamId}:`, error.message);
    log.error(`   This is a critical failure - telemetry will be incomplete`);
    throw error;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  deployAllBinaries,
  deployConductor,
  nucleusHealth,
  checkOllamaInstalled,
  installOllama,
  ensureOllamaRunning,
  ensureOllamaModels,
  seedMasterProfile,
  runCertification,
  waitForNucleusReady,
  checkNucleusServiceStatus,
  checkBrainServiceStatus,
  startBrainService,
  executeNucleusCommand,
  executeSentinelCommand,
  getNucleusExecutablePath,
  registerTelemetryStream
};