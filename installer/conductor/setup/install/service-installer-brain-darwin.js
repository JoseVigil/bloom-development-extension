// service-installer-brain-darwin.js
// Equivalente macOS de service-installer-brain.js
// Reemplaza NSSM + sc.exe por launchd LaunchAgents

'use strict';

const fs           = require('fs-extra');
const path         = require('path');
const { execSync } = require('child_process');
const { paths }    = require('../config/paths');
const os           = require('os');

const NEW_SERVICE_NAME = 'com.bloom.brain';
const OLD_SERVICE_NAME = 'com.bloom.brain';
const PLIST_NAME       = `${NEW_SERVICE_NAME}.plist`;

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
        <string>service</string>
        <string>start</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${workDir}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>HOME</key>
        <string>${os.homedir()}</string>
        <key>PYTHONUNBUFFERED</key>
        <string>1</string>
        <key>PYTHONIOENCODING</key>
        <string>utf-8</string>
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

async function installWindowsService() {
  console.log('\n🤖 INSTALANDO BRAIN SERVICE (macOS LaunchAgent)\n');

  const binaryPath = paths.brainExe;

  if (!await fs.pathExists(binaryPath)) {
    throw new Error(`Brain binary not found: ${binaryPath}`);
  }

  await fs.chmod(binaryPath, 0o755);

  const logDir     = path.join(paths.logsDir, 'brain', 'service');
  await fs.ensureDir(logDir);
  const serviceLog = path.join(logDir, 'brain_service.log');

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
    console.log('✅ Brain LaunchAgent cargado');
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
  try { execSync('pkill -f "brain service"', { stdio: 'ignore' }); } catch (_) {}
}

module.exports = {
  installWindowsService,
  startService,
  removeService,
  cleanupOldServices,
  NEW_SERVICE_NAME,
  OLD_SERVICE_NAME,
};
