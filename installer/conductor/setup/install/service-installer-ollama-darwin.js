// service-installer-ollama-darwin.js
// Equivalente macOS de service-installer-nucleus-darwin.js para Ollama

'use strict';

const fs           = require('fs-extra');
const path         = require('path');
const { execSync } = require('child_process');
const { paths }    = require('../config/paths');
const os           = require('os');

const OLLAMA_SERVICE_NAME = 'com.bloom.ollama';
const OLLAMA_DISPLAY_NAME = 'Bloom Ollama Service';
const PLIST_NAME          = `${OLLAMA_SERVICE_NAME}.plist`;

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
    <string>${OLLAMA_SERVICE_NAME}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${binaryPath}</string>
        <string>serve</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${workDir}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>HOME</key>
        <string>${os.homedir()}</string>
        <key>OLLAMA_HOST</key>
        <string>127.0.0.1:11434</string>
        <key>OLLAMA_MODELS</key>
        <string>${path.join(os.homedir(), 'Library', 'BloomNucleus', 'models')}</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ThrottleInterval</key>
    <integer>15</integer>
    <key>StandardOutPath</key>
    <string>${logPath}</string>
    <key>StandardErrorPath</key>
    <string>${logPath}</string>
</dict>
</plist>`;
}

async function installOllamaService() {
  console.log('\n🦙 INSTALANDO OLLAMA SERVICE (macOS LaunchAgent)\n');

  const ollamaExe = path.join(paths.binDir, 'ollama', 'ollama');

  if (!await fs.pathExists(ollamaExe)) {
    throw new Error(`Ollama binary not found: ${ollamaExe}`);
  }

  await fs.chmod(ollamaExe, 0o755);

  const logDir     = path.join(paths.logsDir, 'ollama', 'service');
  await fs.ensureDir(logDir);
  const serviceLog = path.join(logDir, 'ollama_service.log');

  const launchAgentsDir = path.join(os.homedir(), 'Library', 'LaunchAgents');
  await fs.ensureDir(launchAgentsDir);

  const plistPath = getPlistPath();

  if (await fs.pathExists(plistPath)) {
    try { execSync(`launchctl unload "${plistPath}"`, { stdio: 'ignore' }); } catch (_) {}
    await fs.remove(plistPath);
  }

  await fs.writeFile(plistPath, generatePlist(ollamaExe, serviceLog), 'utf8');
  console.log(`✅ Ollama LaunchAgent plist escrito: ${plistPath}`);
  return true;
}

async function startOllamaService() {
  const plistPath = getPlistPath();
  try {
    execSync(`launchctl load "${plistPath}"`, { stdio: 'pipe' });
    await new Promise(r => setTimeout(r, 5000));
    let pid = '-';
    try {
      const listOutput = execSync(
        `launchctl list ${OLLAMA_SERVICE_NAME}`,
        { encoding: 'utf8', stdio: 'pipe' }
      );
      pid = listOutput.trim().split('\t')[0];
    } catch (_) {}
    if (pid && pid !== '-') {
      console.log(`✅ Ollama LaunchAgent corriendo (PID: ${pid})`);
    } else {
      console.log('✅ Ollama LaunchAgent cargado (PID pendiente — RunAtLoad lo arrancará)');
    }
    return true;
  } catch (e) {
    console.error(`❌ launchctl load falló: ${e.message}`);
    return false;
  }
}

async function removeOllamaService() {
  const plistPath = getPlistPath();
  try { execSync(`launchctl unload "${plistPath}"`, { stdio: 'ignore' }); } catch (_) {}
  try { await fs.remove(plistPath); } catch (_) {}
}

module.exports = {
  installOllamaService,
  startOllamaService,
  removeOllamaService,
  OLLAMA_SERVICE_NAME,
  OLLAMA_DISPLAY_NAME,
};
