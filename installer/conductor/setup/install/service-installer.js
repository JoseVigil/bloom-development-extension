const { exec } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const { paths } = require('../config/paths');

// ============================================================================
// CONFIGURACIÓN DEL SERVICIO
// ============================================================================
const NEW_SERVICE_NAME = 'BloomBrainService';
const OLD_SERVICE_NAME = 'BloomNucleusHost';

// ============================================================================
// HELPERS
// ============================================================================

function runCommand(cmd) {
  return new Promise((resolve, reject) => {
    // Aumentamos el buffer para evitar cortes
    exec(cmd, { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      // NSSM a veces escribe en stderr aunque funcione.
      // Solo fallamos si el stdout está vacío y hay error real.
      if (error && !stderr.includes('successfully')) {
        console.warn(`⚠️ Command warning: ${cmd}\n   ${stderr}`);
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
// TELEMETRY
// ============================================================================

async function updateTelemetry(logPath) {
  const telemetryPath = path.join(paths.logsDir, 'telemetry.json');
  
  let telemetry = { active_streams: {} };
  
  // Leer telemetry existente
  if (fs.existsSync(telemetryPath)) {
    try {
      telemetry = await fs.readJson(telemetryPath);
    } catch (e) {
      console.warn('⚠️ Could not read telemetry.json, creating new one');
    }
  }
  
  // Actualizar entrada del servicio
  telemetry.active_streams.brain_service = {
    label: "⚙️ BRAIN SERVICE",
    path: logPath.replace(/\\/g, '/'), // Normalizar a forward slashes
    priority: 3,
    last_update: new Date().toISOString()
  };
  
  // Escribir telemetry actualizado
  await fs.writeJson(telemetryPath, telemetry, { spaces: 2 });
  console.log('📊 Telemetry updated');
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
  console.log('\n📦 INSTALANDO SERVICIO: BloomBrainService\n');
  
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
  
  // A. Instalar
  await runCommand(`"${nssmPath}" install "${NEW_SERVICE_NAME}" "${binaryPath}"`);
  
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
  await runCommand(`"${nssmPath}" set "${NEW_SERVICE_NAME}" DisplayName "Bloom Brain Service"`);

  // G. Actualizar telemetry
  await updateTelemetry(serviceLog);

  console.log('✅ Service registered.');
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