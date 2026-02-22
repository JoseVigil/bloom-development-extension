const { exec } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const { paths } = require('../config/paths');

// ============================================================================
// CONFIGURACIÓN DEL SERVICIO
// ============================================================================
const NEW_SERVICE_NAME = 'BloomBrainService';
const OLD_SERVICE_NAME = 'BloomNucleusHost';
const BRAIN_DISPLAY_NAME = 'Bloom Brain Service';
const BRAIN_DESCRIPTION = 'Bloom Brain Service - AI orchestration engine, LLM interface, and intelligent task processing (autonomous service)';

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
    const { execSync } = require('child_process');
    const result = execSync(`sc query "${serviceName}"`, { stdio: 'pipe', encoding: 'utf8' });
    return !result.includes('does not exist');
  } catch {
    return false;
  }
}

// ============================================================================
// TELEMETRY REGISTRATION
// ============================================================================

async function registerTelemetryStream(logPath) {
  try {
    const { execSync } = require('child_process');
    const nucleusExe = paths.nucleusExe || path.join(paths.binDir, 'nucleus', 'nucleus.exe');
    
    // Registrar stream usando nucleus telemetry register
    const cmd = `"${nucleusExe}" --json telemetry register --stream brain_service --label "⚙️ BRAIN SERVICE" --path "${logPath}" --priority 3 --category brain --description "Brain background service log — records service startup, heartbeat and shutdown events"`;
    
    const result = execSync(cmd, { 
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 5000
    });
    
    const jsonResult = JSON.parse(result);
    
    if (jsonResult.success) {
      console.log('📊 Telemetry stream registered:', jsonResult.stream_id);
    } else {
      console.warn('⚠️ Telemetry registration warning:', jsonResult.message);
    }
  } catch (error) {
    console.warn('⚠️ Failed to register telemetry stream:', error.message);
    // No es crítico, continuar
  }
}

// ============================================================================
// ROTACIÓN DE LOGS
// ============================================================================

async function rotateLogIfNeeded(logPath) {
  if (!fs.existsSync(logPath)) {
    return; // No hay nada que rotar
  }
  
  const stats = fs.statSync(logPath);
  const MAX_SIZE = 10 * 1024 * 1024; // 10MB
  
  if (stats.size > MAX_SIZE) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const logDir = path.dirname(logPath);
    const logName = path.basename(logPath, '.log');
    const rotatedPath = path.join(logDir, `${logName}_${timestamp}.old.log`);
    
    console.log(`🔄 Rotating log: ${path.basename(logPath)} → ${path.basename(rotatedPath)}`);
    await fs.move(logPath, rotatedPath);
    
    // Actualizar telemetry con el nuevo archivo (vacío)
    await updateTelemetry(logPath);
  }
}

// ============================================================================
// INSTALACIÓN
// ============================================================================

async function installWindowsService() {
  console.log('\n🤖 INSTALANDO SERVICIO DE IA: Bloom Brain Service\n');
  
  const nssmPath = paths.nssmExe;
  const binaryPath = paths.brainExe;
  const workDir = path.dirname(binaryPath);
  
  // 1. Validaciones
  if (!fs.existsSync(nssmPath)) throw new Error(`NSSM not found at ${nssmPath}`);
  if (!fs.existsSync(binaryPath)) throw new Error(`Brain binary not found at ${binaryPath}`);

  // 2. Limpieza preventiva
  if (serviceExists(NEW_SERVICE_NAME)) {
    console.log('🔄 Updating existing service...');
    await removeService(NEW_SERVICE_NAME);
  }

  // 3. Crear Logs en la nueva ubicación
  const logDir = path.join(paths.logsDir, 'brain', 'service');
  await fs.ensureDir(logDir);
  const serviceLog = path.join(logDir, 'brain_service.log');

  // 4. Rotar log si existe y es muy grande
  await rotateLogIfNeeded(serviceLog);

  console.log(`🔧 Configuring NSSM...`);
  console.log(`   Bin: ${binaryPath}`);
  console.log(`   Dir: ${workDir}`);
  console.log(`   Log: ${serviceLog}`);

  // ---------------------------------------------------------
  // SECUENCIA DE COMANDOS NSSM
  // ---------------------------------------------------------
  
  // A. Instalar con reintento (manejar "marked for deletion")
  let installAttempts = 0;
  const MAX_INSTALL_ATTEMPTS = 5;
  let installed = false;
  
  while (!installed && installAttempts < MAX_INSTALL_ATTEMPTS) {
    try {
      await runCommand(`"${nssmPath}" install "${NEW_SERVICE_NAME}" "${binaryPath}"`);
      installed = true;
    } catch (error) {
      installAttempts++;
      
      if (error.message.includes('marked for deletion')) {
        if (installAttempts < MAX_INSTALL_ATTEMPTS) {
          const waitTime = installAttempts * 1000; // Backoff: 1s, 2s, 3s, 4s
          console.log(`⚠️  Service marked for deletion, retrying in ${waitTime/1000}s... (attempt ${installAttempts}/${MAX_INSTALL_ATTEMPTS})`);
          await new Promise(r => setTimeout(r, waitTime));
        } else {
          throw new Error(`Failed to install service after ${MAX_INSTALL_ATTEMPTS} attempts. Service is still marked for deletion. Try rebooting or wait a few minutes.`);
        }
      } else {
        // Otro tipo de error, propagarlo inmediatamente
        throw error;
      }
    }
  }
  
  // B. Argumentos (Service Start)
  await runCommand(`"${nssmPath}" set "${NEW_SERVICE_NAME}" AppParameters "service start"`);
  
  // C. Directorio de Trabajo (VITAL para PyInstaller _internal)
  await runCommand(`"${nssmPath}" set "${NEW_SERVICE_NAME}" AppDirectory "${workDir}"`);
  
  // D. Variables de Entorno (VITAL para evitar crashes de IO)
  // Inyectamos LOCALAPPDATA para que sepa dónde guardar perfiles, y PYTHONUNBUFFERED para logs
  const envExtra = [
    `PYTHONUNBUFFERED=1`,
    `PYTHONIOENCODING=utf-8`,
    `LOCALAPPDATA=${paths.baseDir.replace('\\BloomNucleus', '')}` // Truco para obtener el root de Local
  ].join(' ');
  
  await runCommand(`"${nssmPath}" set "${NEW_SERVICE_NAME}" AppEnvironmentExtra "${envExtra}"`);
  
  // E. Redirección de IO (UN SOLO LOG para stdout Y stderr)
  await runCommand(`"${nssmPath}" set "${NEW_SERVICE_NAME}" AppStdout "${serviceLog}"`);
  await runCommand(`"${nssmPath}" set "${NEW_SERVICE_NAME}" AppStderr "${serviceLog}"`);
  
  // F. Configuración de Inicio
  await runCommand(`"${nssmPath}" set "${NEW_SERVICE_NAME}" Start SERVICE_AUTO_START`);
  await runCommand(`"${nssmPath}" set "${NEW_SERVICE_NAME}" AppExit Default Restart`);
  await runCommand(`"${nssmPath}" set "${NEW_SERVICE_NAME}" DisplayName "${BRAIN_DISPLAY_NAME}"`);
  await runCommand(`"${nssmPath}" set "${NEW_SERVICE_NAME}" Description "${BRAIN_DESCRIPTION}"`);
  console.log('   ✓ Service recovery configuration complete');

  // G. Registrar telemetry usando nucleus CLI
  await registerTelemetryStream(serviceLog);

  console.log('✅ Brain Service registered (Autonomous AI Mode)');
}

async function startService() {
  console.log('🚀 Starting Brain Service...');
  const { execSync } = require('child_process');
  
  try {
    // Intentamos iniciar
    execSync(`sc start "${NEW_SERVICE_NAME}"`, { stdio: 'ignore' });
    
    // Esperamos y verificamos
    console.log('⏳ Waiting for service warmup...');
    await new Promise(r => setTimeout(r, 3000));
    
    const status = execSync(`sc query "${NEW_SERVICE_NAME}"`, { encoding: 'utf8' });
    if (status.includes('RUNNING')) {
      console.log('✅ Service is RUNNING');
      return true;
    } else {
      throw new Error('Service state is not RUNNING after start command');
    }
  } catch (e) {
    console.error(`❌ Failed to start service: ${e.message}`);
    // Leemos el log de error para dar pistas
    try {
        const logDir = path.join(paths.logsDir, 'brain', 'service');
        const serviceLog = path.join(logDir, 'brain_service.log');
        if (fs.existsSync(serviceLog)) {
            const content = fs.readFileSync(serviceLog, 'utf8');
            console.error('📄 Last Service Log:\n', content.slice(-500));
        }
    } catch (_) {}
    return false;
  }
}

async function removeService(name) {
  try {
    const nssmPath = paths.nssmExe;
    await runCommand(`"${nssmPath}" stop "${name}"`);
    await runCommand(`"${nssmPath}" remove "${name}" confirm`);
    
    // Wait for Windows to fully release the service
    console.log('⏳ Waiting for service deletion to complete...');
    await new Promise(r => setTimeout(r, 2000));
    
    // Verificar que se haya eliminado completamente
    if (serviceExists(name)) {
      console.log('⚠️  Service still exists, forcing removal with sc delete...');
      const { execSync } = require('child_process');
      try {
        execSync(`sc delete "${name}"`, { stdio: 'ignore' });
        await new Promise(r => setTimeout(r, 2000));
      } catch (e) { /* Ignorar */ }
    }
  } catch (e) { /* Ignorar */ }
}

async function cleanupOldServices() {
    await removeService(OLD_SERVICE_NAME);
    await killAllBloomProcesses();
}

async function killAllBloomProcesses() {
    try {
        const { execSync } = require('child_process');
        execSync('taskkill /F /IM bloom-host.exe /T', { stdio: 'ignore' });
        // No matamos brain.exe aquí porque podría ser el servicio que acabamos de instalar
    } catch (e) {}
}

module.exports = {
  installWindowsService,
  startService,
  cleanupOldServices,
  killAllBloomProcesses,
  removeService,
  OLD_SERVICE_NAME,
  NEW_SERVICE_NAME
};