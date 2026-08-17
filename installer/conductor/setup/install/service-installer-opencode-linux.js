// service-installer-opencode-linux.js
// Equivalente Linux de service-installer-opencode-darwin.js
// Reemplaza launchd LaunchAgents por systemd --user units

'use strict';

const fs           = require('fs-extra');
const path         = require('path');
const { execSync } = require('child_process');
const { paths }    = require('../config/paths');
const os           = require('os');

const NEW_SERVICE_NAME = 'com.bloom.opencode';
const OLD_SERVICE_NAME = null; // no había versión previa a migrar
const UNIT_FILENAME    = `${NEW_SERVICE_NAME}.service`;

// ASUNCIÓN: puerto y flag por defecto de `opencode serve`. Confirmar con
// `opencode serve --help` — si difiere, ajustar OPENCODE_PORT y generateUnit().
const OPENCODE_PORT = process.env.BLOOM_OPENCODE_PORT || '4096';

function getSystemdUserDir() {
  return path.join(os.homedir(), '.config', 'systemd', 'user');
}

function getUnitPath() {
  return path.join(getSystemdUserDir(), UNIT_FILENAME);
}

function generateUnit(binaryPath, logPath) {
  const workDir = path.dirname(binaryPath);
  return `[Unit]
Description=Bloom OpenCode Service
After=network.target

[Service]
Type=simple
ExecStart=${binaryPath} serve --port ${OPENCODE_PORT}
WorkingDirectory=${workDir}
Restart=on-failure
RestartSec=10
Environment="HOME=${os.homedir()}"
StandardOutput=append:${logPath}
StandardError=append:${logPath}

[Install]
WantedBy=default.target
`;
}

/**
 * Habilita linger para el usuario actual si no está activo.
 * Necesario para que los servicios --user corran sin sesión abierta.
 */
function ensureLinger() {
  try {
    const out = execSync(`loginctl show-user ${os.userInfo().username} 2>/dev/null || true`, {
      shell: true,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    if (out.includes('Linger=yes')) {
      console.log('   ✓ Linger ya activo');
      return;
    }
  } catch (_) {}

  try {
    execSync(`loginctl enable-linger ${os.userInfo().username}`, { stdio: 'pipe' });
    console.log('   ✓ Linger activado (los servicios sobreviven al logout)');
  } catch (e) {
    console.warn(`   ⚠️  No se pudo activar linger: ${e.message}`);
    console.warn('      Los servicios solo correrán mientras haya una sesión activa.');
  }
}

// ============================================================================
// PORT READINESS CHECK (mismo patrón autocontenido que las otras variantes)
// ============================================================================

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

async function installWindowsService() {
  console.log('\n🧠 INSTALANDO OPENCODE SERVICE (Linux systemd --user)\n');

  const binaryPath = paths.opencodeExe;
  if (!await fs.pathExists(binaryPath)) {
    throw new Error(`OpenCode binary not found: ${binaryPath}`);
  }

  await fs.chmod(binaryPath, 0o755);

  const logDir = path.join(paths.logsDir, 'opencode', 'service');
  await fs.ensureDir(logDir);
  const serviceLog = path.join(logDir, 'opencode_service.log');

  const unitDir = getSystemdUserDir();
  await fs.ensureDir(unitDir);

  try {
    execSync(`systemctl --user stop ${NEW_SERVICE_NAME} 2>/dev/null || true`, { shell: true, stdio: 'ignore' });
    execSync(`systemctl --user disable ${NEW_SERVICE_NAME} 2>/dev/null || true`, { shell: true, stdio: 'ignore' });
  } catch (_) {}

  const unitPath = getUnitPath();
  await fs.writeFile(unitPath, generateUnit(binaryPath, serviceLog), 'utf8');
  await fs.chmod(unitPath, 0o644);
  console.log(`✅ systemd unit escrita: ${unitPath}`);

  ensureLinger();

  try {
    execSync('systemctl --user daemon-reload', { stdio: 'pipe' });
    console.log('   ✓ systemd daemon recargado');
  } catch (e) {
    throw new Error(`systemctl --user daemon-reload falló: ${e.message}`);
  }

  try {
    execSync(`systemctl --user enable ${NEW_SERVICE_NAME}`, { stdio: 'pipe' });
    console.log(`   ✓ ${NEW_SERVICE_NAME} habilitado (arrancará al login)`);
  } catch (e) {
    console.warn(`   ⚠️  systemctl enable falló (no fatal): ${e.message}`);
  }

  return true;
}

async function startService() {
  try {
    execSync(`systemctl --user start ${NEW_SERVICE_NAME}`, { stdio: 'pipe' });
    await new Promise(r => setTimeout(r, 2000));
    console.log('✅ OpenCode systemd unit iniciada');

    const ready = await waitForOpencodeReady();
    if (!ready) {
      console.warn('⚠️  Unit iniciada pero el puerto no respondió a tiempo (no fatal, se reintenta en certification).');
    }

    return true;
  } catch (e) {
    console.error(`❌ systemctl --user start falló: ${e.message}`);
    return false;
  }
}

async function removeService() {
  try {
    execSync(`systemctl --user stop ${NEW_SERVICE_NAME} 2>/dev/null || true`, { shell: true, stdio: 'ignore' });
    execSync(`systemctl --user disable ${NEW_SERVICE_NAME} 2>/dev/null || true`, { shell: true, stdio: 'ignore' });
  } catch (_) {}

  const unitPath = getUnitPath();
  try { await fs.remove(unitPath); } catch (_) {}

  try {
    execSync('systemctl --user daemon-reload', { stdio: 'ignore' });
  } catch (_) {}
}

async function cleanupOldServices() {
  await removeService();
  try { execSync('pkill -f "opencode serve"', { stdio: 'ignore' }); } catch (_) {}
  await new Promise(r => setTimeout(r, 1500));
}

module.exports = {
  installWindowsService,
  startService,
  removeService,
  cleanupOldServices,
  waitForOpencodeReady,
  NEW_SERVICE_NAME,
  OLD_SERVICE_NAME,
};
