// service-installer-opencode-darwin.js
// Equivalente macOS de service-installer-opencode.js
// Reemplaza NSSM + sc.exe por launchd LaunchAgents

'use strict';

const fs           = require('fs-extra');
const path         = require('path');
const { execSync } = require('child_process');
const { paths }    = require('../config/paths');
const os           = require('os');

const NEW_SERVICE_NAME = 'com.bloom.opencode';
const OLD_SERVICE_NAME = null; // no había versión previa a migrar
const PLIST_NAME       = `${NEW_SERVICE_NAME}.plist`;

// ASUNCIÓN: puerto y flag por defecto de `opencode serve`. Confirmar con
// `opencode serve --help` — si difiere, ajustar OPENCODE_PORT y generatePlist().
const OPENCODE_PORT = process.env.BLOOM_OPENCODE_PORT || '4096';

function getPlistPath() {
  return path.join(os.homedir(), 'Library', 'LaunchAgents', PLIST_NAME);
}

function generatePlist(binaryPath, logPath) {
  const workDir = path.dirname(binaryPath);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${NEW_SERVICE_NAME}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${binaryPath}</string>
        <string>serve</string>
        <string>--port</string>
        <string>${OPENCODE_PORT}</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${workDir}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>HOME</key>
        <string>${os.homedir()}</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>
    <key>ThrottleInterval</key>
    <integer>10</integer>
    <key>StandardOutPath</key>
    <string>${logPath}</string>
    <key>StandardErrorPath</key>
    <string>${logPath}</string>
</dict>
</plist>`;
}

// ============================================================================
// PORT READINESS CHECK (mismo patrón autocontenido que la variante Windows)
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
  console.log('\n🧠 INSTALANDO OPENCODE SERVICE (macOS LaunchAgent)\n');

  const binaryPath = paths.opencodeExe;
  if (!await fs.pathExists(binaryPath)) {
    throw new Error(`OpenCode binary not found: ${binaryPath}`);
  }

  await fs.chmod(binaryPath, 0o755);

  const logDir = path.join(paths.logsDir, 'opencode', 'service');
  await fs.ensureDir(logDir);
  const serviceLog = path.join(logDir, 'opencode_service.log');

  const launchAgentsDir = path.join(os.homedir(), 'Library', 'LaunchAgents');
  await fs.ensureDir(launchAgentsDir);

  const plistPath = getPlistPath();

  if (await fs.pathExists(plistPath)) {
    try { execSync(`launchctl unload "${plistPath}"`, { stdio: 'ignore' }); } catch (_) {}
    await fs.remove(plistPath);
  }

  await fs.writeFile(plistPath, generatePlist(binaryPath, serviceLog), 'utf8');
  console.log(`✅ LaunchAgent plist escrito: ${plistPath}`);
  return true;
}

async function startService() {
  const plistPath = getPlistPath();
  try {
    execSync(`launchctl load "${plistPath}"`, { stdio: 'pipe' });
    await new Promise(r => setTimeout(r, 2000));
    console.log('✅ OpenCode LaunchAgent cargado');

    const ready = await waitForOpencodeReady();
    if (!ready) {
      console.warn('⚠️  LaunchAgent cargado pero el puerto no respondió a tiempo (no fatal, se reintenta en certification).');
    }

    return true;
  } catch (e) {
    console.error(`❌ launchctl load falló: ${e.message}`);
    return false;
  }
}

async function removeService() {
  const plistPath = getPlistPath();
  try { execSync(`launchctl unload "${plistPath}"`, { stdio: 'ignore' }); } catch (_) {}
  try { await fs.remove(plistPath); } catch (_) {}
}

async function cleanupOldServices() {
  await removeService();
  try { execSync('pkill -f "opencode serve"', { stdio: 'ignore' }); } catch (_) {}
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
