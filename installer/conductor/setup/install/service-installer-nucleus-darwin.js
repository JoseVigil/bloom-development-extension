// service-installer-nucleus-darwin.js
// Equivalente macOS de service-installer-nucleus.js

'use strict';

const fs           = require('fs-extra');
const path         = require('path');
const { execSync } = require('child_process');
const { paths }    = require('../config/paths');
const os           = require('os');

const NUCLEUS_SERVICE_NAME = 'com.bloom.nucleus';
const NUCLEUS_DISPLAY_NAME = 'Bloom Nucleus Service';
const PLIST_NAME           = `${NUCLEUS_SERVICE_NAME}.plist`;

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
    <string>${NUCLEUS_SERVICE_NAME}</string>
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
        <key>BLOOM_ROOT</key>
        <string>${path.join(os.homedir(), 'Library', 'Application Support', 'BloomNucleus')}</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>
    <key>ThrottleInterval</key>
    <integer>15</integer>
    <key>StandardOutPath</key>
    <string>${logPath}</string>
    <key>StandardErrorPath</key>
    <string>${logPath}</string>
</dict>
</plist>`;
}

async function installNucleusService() {
  console.log('\n🧠 INSTALANDO NUCLEUS SERVICE (macOS LaunchAgent)\n');

  const nucleusExe = path.join(paths.binDir, 'nucleus', 'nucleus');

  if (!await fs.pathExists(nucleusExe)) {
    throw new Error(`Nucleus binary not found: ${nucleusExe}`);
  }

  await fs.chmod(nucleusExe, 0o755);

  const logDir     = path.join(paths.logsDir, 'nucleus', 'service');
  await fs.ensureDir(logDir);
  const serviceLog = path.join(logDir, 'nucleus_service.log');

  const launchAgentsDir = path.join(os.homedir(), 'Library', 'LaunchAgents');
  await fs.ensureDir(launchAgentsDir);

  const plistPath = getPlistPath();

  if (await fs.pathExists(plistPath)) {
    try { execSync(`launchctl unload "${plistPath}"`, { stdio: 'ignore' }); } catch (_) {}
    await fs.remove(plistPath);
  }

  await fs.writeFile(plistPath, generatePlist(nucleusExe, serviceLog), 'utf8');
  console.log(`✅ Nucleus LaunchAgent plist escrito: ${plistPath}`);
  return true;
}

async function startNucleusService() {
  const plistPath = getPlistPath();
  try {
    execSync(`launchctl load "${plistPath}"`, { stdio: 'pipe' });
    await new Promise(r => setTimeout(r, 5000));
    console.log('✅ Nucleus LaunchAgent cargado');
    return true;
  } catch (e) {
    console.error(`❌ launchctl load falló: ${e.message}`);
    return false;
  }
}

async function removeNucleusService() {
  const plistPath = getPlistPath();
  try { execSync(`launchctl unload "${plistPath}"`, { stdio: 'ignore' }); } catch (_) {}
  try { await fs.remove(plistPath); } catch (_) {}
}

module.exports = {
  installNucleusService,
  startNucleusService,
  removeNucleusService,
  NUCLEUS_SERVICE_NAME,
  NUCLEUS_DISPLAY_NAME,
};
