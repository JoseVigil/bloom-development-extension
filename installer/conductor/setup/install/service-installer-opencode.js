const { exec } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const { paths } = require('../config/paths');

// ============================================================================
// CONFIGURACIÓN DEL SERVICIO
// ============================================================================
const NEW_SERVICE_NAME = 'BloomOpencodeService';
const OLD_SERVICE_NAME = null; // no había versión previa a migrar
const OPENCODE_DISPLAY_NAME = 'Bloom OpenCode Service';
const OPENCODE_DESCRIPTION = 'Bloom OpenCode Service - persistent coding agent server (autonomous service)';

// Validado contra el binario Windows empaquetado: `opencode serve` acepta
// `--port` y usa 127.0.0.1 como hostname por defecto.
const OPENCODE_PORT = process.env.BLOOM_OPENCODE_PORT || '4096';

// ============================================================================
// HELPERS
// ============================================================================

function runCommand(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      // NSSM puede escribir en stderr aunque funcione
      if (error) {
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
// PORT READINESS CHECK (health check propio, igual patrón que waitForTemporal)
// ============================================================================

/**
 * Verifica que `opencode serve` esté escuchando en su puerto.
 * No depende de que nucleus/Go agregue un componente `opencode_service`
 * al health check — este chequeo es autocontenido en la capa JS,
 * igual que installer.js hace con Temporal vía waitForTemporal().
 */
function isPortOpen(port, host = '127.0.0.1', timeoutMs = 2000) {
  const net = require('net');
  return new Promise(resolve => {
    const sock = net.createConnection({ host, port });
    sock.setTimeout(timeoutMs);
    sock.on('connect', () => { sock.destroy(); resolve(true); });
    sock.on('error', () => { sock.destroy(); resolve(false); });
    sock.on('timeout', () => { sock.destroy(); resolve(false); });
  });
}

async function waitForOpencodeReady(timeoutMs = 30000, intervalMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;

  while (Date.now() < deadline) {
    attempt++;
    if (await isPortOpen(Number(OPENCODE_PORT))) {
      console.log(`✅ OpenCode Service respondiendo en :${OPENCODE_PORT} (intento ${attempt})`);
      return true;
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }

  console.error(`❌ OpenCode Service no respondió en :${OPENCODE_PORT} dentro de ${timeoutMs / 1000}s`);
  return false;
}

// ============================================================================
// TELEMETRY REGISTRATION
// ============================================================================

async function registerTelemetryStream(logPath) {
  try {
    const { execSync } = require('child_process');
    const nucleusExe = paths.nucleusExe || path.join(paths.binDir, 'nucleus', 'nucleus.exe');

    const cmd = `"${nucleusExe}" --json telemetry register --stream opencode_service --label "🧠 OPENCODE SERVICE" --path "${logPath}" --priority 3 --category opencode --description "OpenCode background service log — records startup, heartbeat and shutdown events"`;

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
  if (!fs.existsSync(logPath)) return;

  const stats = fs.statSync(logPath);
  const MAX_SIZE = 10 * 1024 * 1024; // 10MB

  if (stats.size > MAX_SIZE) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const logDir = path.dirname(logPath);
    const logName = path.basename(logPath, '.log');
    const rotatedPath = path.join(logDir, `${logName}_${timestamp}.old.log`);

    console.log(`🔄 Rotating log: ${path.basename(logPath)} → ${path.basename(rotatedPath)}`);
    await fs.move(logPath, rotatedPath);
  }
}

// ============================================================================
// INSTALACIÓN
// ============================================================================

async function installWindowsService() {
  console.log('\n🧠 INSTALANDO SERVICIO: Bloom OpenCode Service\n');

  const nssmPath = paths.nssmExe;
  const binaryPath = paths.opencodeExe;
  const workDir = path.dirname(binaryPath);

  if (!fs.existsSync(nssmPath)) throw new Error(`NSSM not found at ${nssmPath}`);
  if (!fs.existsSync(binaryPath)) throw new Error(`OpenCode binary not found at ${binaryPath}`);

  if (serviceExists(NEW_SERVICE_NAME)) {
    console.log('🔄 Updating existing service...');
    await removeService(NEW_SERVICE_NAME);
  }

  const logDir = path.join(paths.logsDir, 'opencode', 'service');
  await fs.ensureDir(logDir);
  const serviceLog = path.join(logDir, 'opencode_service.log');
  await rotateLogIfNeeded(serviceLog);

  console.log(`🔧 Configuring NSSM...`);
  console.log(`   Bin: ${binaryPath}`);
  console.log(`   Dir: ${workDir}`);
  console.log(`   Log: ${serviceLog}`);

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
          const waitTime = installAttempts * 1000;
          console.log(`⚠️  Service marked for deletion, retrying in ${waitTime / 1000}s... (attempt ${installAttempts}/${MAX_INSTALL_ATTEMPTS})`);
          await new Promise(r => setTimeout(r, waitTime));
        } else {
          throw new Error(`Failed to install service after ${MAX_INSTALL_ATTEMPTS} attempts. Service is still marked for deletion. Try rebooting or wait a few minutes.`);
        }
      } else {
        throw error;
      }
    }
  }

  await runCommand(`"${nssmPath}" set "${NEW_SERVICE_NAME}" AppParameters "serve --port ${OPENCODE_PORT}"`);
  await runCommand(`"${nssmPath}" set "${NEW_SERVICE_NAME}" AppDirectory "${workDir}"`);

  const envExtra = [
    `LOCALAPPDATA=${paths.baseDir.replace('\\BloomNucleus', '')}`,
  ].join(' ');
  await runCommand(`"${nssmPath}" set "${NEW_SERVICE_NAME}" AppEnvironmentExtra "${envExtra}"`);

  await runCommand(`"${nssmPath}" set "${NEW_SERVICE_NAME}" AppStdout "${serviceLog}"`);
  await runCommand(`"${nssmPath}" set "${NEW_SERVICE_NAME}" AppStderr "${serviceLog}"`);

  await runCommand(`"${nssmPath}" set "${NEW_SERVICE_NAME}" Start SERVICE_AUTO_START`);
  await runCommand(`"${nssmPath}" set "${NEW_SERVICE_NAME}" AppExit Default Restart`);
  await runCommand(`"${nssmPath}" set "${NEW_SERVICE_NAME}" DisplayName "${OPENCODE_DISPLAY_NAME}"`);
  await runCommand(`"${nssmPath}" set "${NEW_SERVICE_NAME}" Description "${OPENCODE_DESCRIPTION}"`);
  console.log('   ✓ Service recovery configuration complete');

  await registerTelemetryStream(serviceLog);

  console.log('✅ OpenCode Service registered');
}

async function startService() {
  console.log('🚀 Starting OpenCode Service...');
  const { execSync } = require('child_process');

  try {
    execSync(`sc start "${NEW_SERVICE_NAME}"`, { stdio: 'ignore' });

    console.log('⏳ Waiting for service warmup...');
    await new Promise(r => setTimeout(r, 3000));

    const status = execSync(`sc query "${NEW_SERVICE_NAME}"`, { encoding: 'utf8' });
    if (!status.includes('RUNNING')) {
      throw new Error('Service state is not RUNNING after start command');
    }
    console.log('✅ Service is RUNNING');

    // Health check propio: además del estado SCM, confirmar que `serve`
    // esté realmente escuchando en el puerto — mismo patrón que Temporal.
    const ready = await waitForOpencodeReady();
    if (!ready) {
      console.warn('⚠️  Service RUNNING pero el puerto no respondió a tiempo (no fatal, se reintenta en certification).');
    }

    return true;
  } catch (e) {
    console.error(`❌ Failed to start service: ${e.message}`);
    try {
      const logDir = path.join(paths.logsDir, 'opencode', 'service');
      const serviceLog = path.join(logDir, 'opencode_service.log');
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

    console.log('⏳ Waiting for service deletion to complete...');
    await new Promise(r => setTimeout(r, 2000));

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
  try {
    const { execSync } = require('child_process');
    execSync('taskkill /F /IM opencode.exe /T', { stdio: 'ignore' });
  } catch (e) {}
}

module.exports = {
  installWindowsService,
  startService,
  cleanupOldServices,
  removeService,
  waitForOpencodeReady,
  OLD_SERVICE_NAME,
  NEW_SERVICE_NAME,
  OPENCODE_DISPLAY_NAME,
};
