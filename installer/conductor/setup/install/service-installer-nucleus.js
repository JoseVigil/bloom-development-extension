// service-installer-nucleus.js
// CRITICAL SERVICE - 24/7 Operational Hub
// Nucleus Service: Sistema nervioso central del ecosistema Bloom

const { exec, execSync } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const { paths } = require('../config/paths');

// ============================================================================
// CONFIGURACIÓN DEL SERVICIO CRÍTICO
// ============================================================================
const NUCLEUS_SERVICE_NAME = 'BloomNucleusService';
const NUCLEUS_DISPLAY_NAME = 'Bloom Nucleus - Core Orchestrator';
const NUCLEUS_DESCRIPTION = 'Bloom Nucleus Service - Central orchestration hub, workflow engine, and system governance (24/7 critical service)';

// Configuración de reintentos y recuperación
const SERVICE_CONFIG = {
  START_TYPE: 'SERVICE_AUTO_START',
  RESTART_DELAY: 5000, // 5 segundos entre reintentos
  FAILURE_ACTIONS: {
    FIRST_FAILURE: 'restart',
    SECOND_FAILURE: 'restart',
    SUBSEQUENT_FAILURES: 'restart'
  },
  DEPENDENCIES: [], // Nucleus no depende de otros servicios Bloom
  PRIORITY: 'high' // Prioridad alta en el sistema
};

// ============================================================================
// HELPERS
// ============================================================================

function runCommand(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      // NSSM puede escribir en stderr aunque funcione
      if (error) {
        // Solo ignorar si stderr contiene "successfully"
        if (stderr.includes('successfully')) {
          return resolve(stdout || '');
        }
        // Error real - rechazar
        return reject(new Error(`Command failed: ${cmd}\nError: ${stderr || error.message}`));
      }
      resolve(stdout || '');
    });
  });
}

function serviceExists(serviceName) {
  try {
    const result = execSync(`sc query "${serviceName}"`, { stdio: 'pipe', encoding: 'utf8' });
    return !result.includes('does not exist');
  } catch {
    return false;
  }
}

// ============================================================================
// TELEMETRY REGISTRATION (CRITICAL STREAM)
// ============================================================================

async function registerNucleusTelemetry(logPath) {
  try {
    const nucleusExe = paths.nucleusExe || path.join(paths.binDir, 'nucleus', 'nucleus.exe');
    
    // Registrar como stream CRÍTICO (priority: 1)
    const cmd = `"${nucleusExe}" --json telemetry register --stream nucleus_service --label "🧠 NUCLEUS SERVICE" --path "${logPath}" --priority 1`;
    
    const result = execSync(cmd, { 
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 5000
    });
    
    const jsonResult = JSON.parse(result);
    
    if (jsonResult.success) {
      console.log('📊 CRITICAL telemetry stream registered:', jsonResult.stream_id);
    } else {
      console.warn('⚠️ Telemetry registration warning:', jsonResult.message);
    }
  } catch (error) {
    console.warn('⚠️ Failed to register telemetry stream:', error.message);
    // No es crítico para la instalación, continuar
  }
}

// ============================================================================
// ROTACIÓN DE LOGS
// ============================================================================

async function rotateLogIfNeeded(logPath) {
  if (!fs.existsSync(logPath)) {
    return;
  }
  
  const stats = fs.statSync(logPath);
  const MAX_SIZE = 50 * 1024 * 1024; // 50MB para Nucleus (más que Brain)
  
  if (stats.size > MAX_SIZE) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const logDir = path.dirname(logPath);
    const logName = path.basename(logPath, '.log');
    const rotatedPath = path.join(logDir, `${logName}_${timestamp}.old.log`);
    
    console.log(`🔄 Rotating Nucleus log: ${path.basename(logPath)} → ${path.basename(rotatedPath)}`);
    await fs.move(logPath, rotatedPath);
    
    // Re-registrar telemetría con el nuevo archivo
    await registerNucleusTelemetry(logPath);
  }
}

// ============================================================================
// INSTALACIÓN DEL SERVICIO NUCLEUS
// ============================================================================

async function installNucleusService() {
  console.log('\n🧠 INSTALANDO SERVICIO CRÍTICO: Bloom Nucleus Service\n');
  
  const nssmPath = paths.nssmExe;
  // FORZAR path correcto sin depender de paths.nucleusExe
  const nucleusExe = path.join(paths.binDir, 'nucleus', 'nucleus.exe');
  const workDir = path.dirname(nucleusExe);
  
  // 1. Validaciones
  if (!fs.existsSync(nssmPath)) {
    throw new Error(`NSSM not found at ${nssmPath}`);
  }
  if (!fs.existsSync(nucleusExe)) {
    throw new Error(`Nucleus binary not found at ${nucleusExe}`);
  }

  // 2. Limpieza preventiva
  if (serviceExists(NUCLEUS_SERVICE_NAME)) {
    console.log('🔄 Updating existing Nucleus service...');
    await removeNucleusService();
  }

  // 3. Crear estructura de logs
  const logDir = path.join(paths.logsDir, 'nucleus', 'service');
  await fs.ensureDir(logDir);
  const serviceLog = path.join(logDir, 'nucleus_service.log');

  // 4. Rotar log si existe y es muy grande
  await rotateLogIfNeeded(serviceLog);

  console.log(`🔧 Configuring NSSM for Nucleus...`);
  console.log(`   Binary: ${nucleusExe}`);
  console.log(`   WorkDir: ${workDir}`);
  console.log(`   Log: ${serviceLog}`);
  console.log(`   Mode: 24/7 Critical Service`);

  // ---------------------------------------------------------
  // SECUENCIA DE COMANDOS NSSM (CONFIGURACIÓN EXTENDIDA)
  // ---------------------------------------------------------
  
  // A. Instalar
  await runCommand(`"${nssmPath}" install "${NUCLEUS_SERVICE_NAME}" "${nucleusExe}"`);
  console.log('   ✓ Service installed');
  
  // B. Argumentos (Service Start)
  await runCommand(`"${nssmPath}" set "${NUCLEUS_SERVICE_NAME}" AppParameters "service start"`);
  console.log('   ✓ Arguments configured');
  
  // C. Directorio de Trabajo (CRÍTICO para PyInstaller/GoReleaser)
  await runCommand(`"${nssmPath}" set "${NUCLEUS_SERVICE_NAME}" AppDirectory "${workDir}"`);
  console.log('   ✓ Working directory set');
  
  // D. Variables de Entorno
  const envExtra = [
    `PYTHONUNBUFFERED=1`,
    `PYTHONIOENCODING=utf-8`,
    `BLOOM_ENVIRONMENT=production`,
    `NUCLEUS_MODE=service`,
    `LOCALAPPDATA=${process.env.LOCALAPPDATA}`
  ].join(' ');
  
  await runCommand(`"${nssmPath}" set "${NUCLEUS_SERVICE_NAME}" AppEnvironmentExtra "${envExtra}"`);
  console.log('   ✓ Environment variables set');
  
  // E. Redirección de IO (LOG UNIFICADO)
  await runCommand(`"${nssmPath}" set "${NUCLEUS_SERVICE_NAME}" AppStdout "${serviceLog}"`);
  await runCommand(`"${nssmPath}" set "${NUCLEUS_SERVICE_NAME}" AppStderr "${serviceLog}"`);
  console.log('   ✓ Log redirection configured');
  
  // F. Configuración de Inicio y Recuperación
  await runCommand(`"${nssmPath}" set "${NUCLEUS_SERVICE_NAME}" Start ${SERVICE_CONFIG.START_TYPE}`);
  await runCommand(`"${nssmPath}" set "${NUCLEUS_SERVICE_NAME}" AppExit Default Restart`);
  
  // Configuración de delays entre reintentos (CRÍTICO para 24/7)
  await runCommand(`"${nssmPath}" set "${NUCLEUS_SERVICE_NAME}" AppRestartDelay ${SERVICE_CONFIG.RESTART_DELAY}`);
  
  // Display Name y Description
  await runCommand(`"${nssmPath}" set "${NUCLEUS_SERVICE_NAME}" DisplayName "${NUCLEUS_DISPLAY_NAME}"`);
  await runCommand(`"${nssmPath}" set "${NUCLEUS_SERVICE_NAME}" Description "${NUCLEUS_DESCRIPTION}"`);
  
  console.log('   ✓ Service recovery configuration complete');

  // G. Registrar telemetría como stream CRÍTICO
  // NOTA: Deshabilitado temporalmente - se registrará después del primer arranque
  // await registerNucleusTelemetry(serviceLog);

  console.log('✅ Nucleus Service registered (24/7 Critical Mode)');
}

// ============================================================================
// INICIO DEL SERVICIO NUCLEUS
// ============================================================================

async function startNucleusService() {
  console.log('🚀 Starting Nucleus Service...');
  
  try {
    // Intentar iniciar
    execSync(`sc start "${NUCLEUS_SERVICE_NAME}"`, { stdio: 'ignore' });
    
    // Esperar warmup (Nucleus puede tardar más que Brain)
    console.log('⏳ Waiting for Nucleus warmup (10s)...');
    await new Promise(r => setTimeout(r, 10000));
    
    const status = execSync(`sc query "${NUCLEUS_SERVICE_NAME}"`, { encoding: 'utf8' });
    
    if (status.includes('RUNNING')) {
      console.log('✅ Nucleus Service is RUNNING');
      return true;
    } else if (status.includes('START_PENDING')) {
      console.warn('⚠️ Nucleus Service is START_PENDING (may need more time)');
      return false;
    } else {
      throw new Error('Nucleus Service state is not RUNNING after start command');
    }
  } catch (e) {
    console.error(`❌ Failed to start Nucleus Service: ${e.message}`);
    
    // Leer log para diagnóstico
    try {
      const logDir = path.join(paths.logsDir, 'nucleus', 'service');
      const serviceLog = path.join(logDir, 'nucleus_service.log');
      if (fs.existsSync(serviceLog)) {
        const content = fs.readFileSync(serviceLog, 'utf8');
        console.error('📄 Last Nucleus Service Log:\n', content.slice(-1000));
      }
    } catch (_) {}
    
    return false;
  }
}

// ============================================================================
// REMOCIÓN DEL SERVICIO
// ============================================================================

async function removeNucleusService() {
  try {
    const nssmPath = paths.nssmExe;
    
    console.log('   Stopping Nucleus Service...');
    await runCommand(`"${nssmPath}" stop "${NUCLEUS_SERVICE_NAME}"`);
    
    // Esperar más tiempo para Nucleus (es más complejo)
    await new Promise(r => setTimeout(r, 5000));
    
    console.log('   Removing Nucleus Service...');
    await runCommand(`"${nssmPath}" remove "${NUCLEUS_SERVICE_NAME}" confirm`);
    
    console.log('   ✓ Nucleus Service removed');
  } catch (e) {
    console.warn('   ⚠️ Service removal warning:', e.message);
  }
}

// ============================================================================
// HEALTH CHECK DEL SERVICIO NUCLEUS
// ============================================================================

async function checkNucleusHealth() {
  try {
    const nucleusExe = paths.nucleusExe || path.join(paths.binDir, 'nucleus', 'nucleus.exe');
    
    const result = execSync(`"${nucleusExe}" --json health`, {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true
    });
    
    const health = JSON.parse(result);
    
    return {
      success: health.success || false,
      state: health.state || 'unknown',
      components: health.components || {},
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      success: false,
      state: 'unreachable',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  installNucleusService,
  startNucleusService,
  removeNucleusService,
  checkNucleusHealth,
  NUCLEUS_SERVICE_NAME,
  NUCLEUS_DISPLAY_NAME
};