// service-installer-ollama-linux.js
// Equivalente Linux de service-installer-ollama-darwin.js

'use strict';

const fs           = require('fs-extra');
const path         = require('path');
const { execSync } = require('child_process');
const { paths }    = require('../config/paths');
const os           = require('os');

const OLLAMA_SERVICE_NAME = 'com.bloom.ollama';
const OLLAMA_DISPLAY_NAME = 'Bloom Ollama Service';
const UNIT_FILENAME       = `${OLLAMA_SERVICE_NAME}.service`;

function getSystemdUserDir() {
  return path.join(os.homedir(), '.config', 'systemd', 'user');
}

function getUnitPath() {
  return path.join(getSystemdUserDir(), UNIT_FILENAME);
}

function generateUnit(binaryPath, logPath) {
  const workDir     = path.dirname(binaryPath);
  // En Linux los modelos van en XDG_DATA_HOME equivalente
  const ollamaModels = path.join(os.homedir(), '.local', 'share', 'BloomNucleus', 'models');

  return `[Unit]
Description=${OLLAMA_DISPLAY_NAME}
After=network.target

[Service]
Type=simple
ExecStart=${binaryPath} serve
WorkingDirectory=${workDir}
Restart=always
RestartSec=15
Environment="HOME=${os.homedir()}"
Environment="OLLAMA_HOST=127.0.0.1:11434"
Environment="OLLAMA_MODELS=${ollamaModels}"
StandardOutput=append:${logPath}
StandardError=append:${logPath}

[Install]
WantedBy=default.target
`;
}

/**
 * Habilita linger para el usuario actual si no está activo.
 */
function ensureLinger() {
  const username = os.userInfo().username;
  try {
    const out = execSync(`loginctl show-user ${username} 2>/dev/null || true`, {
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
    execSync(`loginctl enable-linger ${username}`, { stdio: 'pipe' });
    console.log('   ✓ Linger activado');
  } catch (e) {
    console.warn(`   ⚠️  No se pudo activar linger: ${e.message}`);
  }
}

async function installOllamaService() {
  console.log('\n🦙 INSTALANDO OLLAMA SERVICE (Linux systemd --user)\n');

  const ollamaExe = path.join(paths.binDir, 'ollama', 'ollama');

  if (!await fs.pathExists(ollamaExe)) {
    throw new Error(`Ollama binary not found: ${ollamaExe}`);
  }

  await fs.chmod(ollamaExe, 0o755);

  const logDir     = path.join(paths.logsDir, 'ollama', 'service');
  await fs.ensureDir(logDir);
  const serviceLog = path.join(logDir, 'ollama_service.log');

  const unitDir = getSystemdUserDir();
  await fs.ensureDir(unitDir);

  // Detener instancia previa
  try {
    execSync(`systemctl --user stop ${OLLAMA_SERVICE_NAME} 2>/dev/null || true`, {
      shell: true, stdio: 'ignore',
    });
    execSync(`systemctl --user disable ${OLLAMA_SERVICE_NAME} 2>/dev/null || true`, {
      shell: true, stdio: 'ignore',
    });
  } catch (_) {}

  const unitPath = getUnitPath();
  await fs.writeFile(unitPath, generateUnit(ollamaExe, serviceLog), 'utf8');
  await fs.chmod(unitPath, 0o644);
  console.log(`✅ Ollama systemd unit escrita: ${unitPath}`);

  ensureLinger();

  try {
    execSync('systemctl --user daemon-reload', { stdio: 'pipe' });
    console.log('   ✓ systemd daemon recargado');
  } catch (e) {
    throw new Error(`systemctl --user daemon-reload falló: ${e.message}`);
  }

  try {
    execSync(`systemctl --user enable ${OLLAMA_SERVICE_NAME}`, { stdio: 'pipe' });
    console.log(`   ✓ ${OLLAMA_SERVICE_NAME} habilitado`);
  } catch (e) {
    console.warn(`   ⚠️  systemctl enable falló (no fatal): ${e.message}`);
  }

  return true;
}

async function startOllamaService() {
  try {
    execSync(`systemctl --user start ${OLLAMA_SERVICE_NAME}`, { stdio: 'pipe' });
    await new Promise(r => setTimeout(r, 5000));

    let pid = null;
    try {
      const out = execSync(
        `systemctl --user show ${OLLAMA_SERVICE_NAME} --property=MainPID --value`,
        { encoding: 'utf8', stdio: 'pipe' }
      ).trim();
      pid = out && out !== '0' ? out : null;
    } catch (_) {}

    if (pid) {
      console.log(`✅ Ollama Service corriendo (PID: ${pid})`);
    } else {
      try {
        execSync(`systemctl --user is-active ${OLLAMA_SERVICE_NAME}`, { stdio: 'pipe' });
        console.log('✅ Ollama Service activo');
      } catch (_) {
        console.log('✅ Ollama systemd unit iniciada');
      }
    }
    return true;
  } catch (e) {
    console.error(`❌ systemctl --user start falló: ${e.message}`);
    return false;
  }
}

async function removeOllamaService() {
  try {
    execSync(`systemctl --user stop ${OLLAMA_SERVICE_NAME} 2>/dev/null || true`, {
      shell: true, stdio: 'ignore',
    });
    execSync(`systemctl --user disable ${OLLAMA_SERVICE_NAME} 2>/dev/null || true`, {
      shell: true, stdio: 'ignore',
    });
  } catch (_) {}

  const unitPath = getUnitPath();
  try { await fs.remove(unitPath); } catch (_) {}

  try {
    execSync('systemctl --user daemon-reload', { stdio: 'ignore' });
  } catch (_) {}
}

module.exports = {
  installOllamaService,
  startOllamaService,
  removeOllamaService,
  OLLAMA_SERVICE_NAME,
  OLLAMA_DISPLAY_NAME,
};
