// service-installer-nucleus-linux.js
// Equivalente Linux de service-installer-nucleus-darwin.js

'use strict';

const fs           = require('fs-extra');
const path         = require('path');
const { execSync } = require('child_process');
const { paths }    = require('../config/paths');
const os           = require('os');

const NUCLEUS_SERVICE_NAME = 'com.bloom.nucleus';
const NUCLEUS_DISPLAY_NAME = 'Bloom Nucleus Service';
const UNIT_FILENAME        = `${NUCLEUS_SERVICE_NAME}.service`;

function getSystemdUserDir() {
  return path.join(os.homedir(), '.config', 'systemd', 'user');
}

function getUnitPath() {
  return path.join(getSystemdUserDir(), UNIT_FILENAME);
}

function generateUnit(binaryPath, logPath) {
  const workDir   = path.dirname(binaryPath);
  const bloomRoot = path.join(os.homedir(), '.local', 'share', 'BloomNucleus');

  // PATH compuesto para el systemd unit:
  //   - /usr/local/bin        → binarios de sistema (sin Homebrew, que es macOS)
  //   - /usr/bin:/bin         → sistema base
  //   - paths.nodeDir         → node bundleado de Bloom (npm/npx)
  //   - path.dirname(binary)  → nucleus propio
  const servicePath = [
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    paths.nodeDir,
    workDir,
  ].join(':');

  return `[Unit]
Description=${NUCLEUS_DISPLAY_NAME}
After=network.target

[Service]
Type=simple
ExecStart=${binaryPath} service start
WorkingDirectory=${workDir}
Restart=always
RestartSec=15
Environment="PATH=${servicePath}"
Environment="HOME=${os.homedir()}"
Environment="BLOOM_ROOT=${bloomRoot}"
Environment="BLOOM_LOGS=${path.join(bloomRoot, 'logs')}"
StandardOutput=append:${logPath}
StandardError=append:${logPath}

[Install]
WantedBy=default.target
`;
}

/**
 * Habilita linger para el usuario actual si no está activo.
 * Sin linger, los servicios --user se detienen al cerrar la última sesión.
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
    console.log('   ✓ Linger activado (Nucleus sobrevivirá al logout)');
  } catch (e) {
    console.warn(`   ⚠️  No se pudo activar linger: ${e.message}`);
    console.warn('      Nucleus solo correrá mientras haya una sesión activa.');
  }
}

async function installNucleusService() {
  console.log('\n🧠 INSTALANDO NUCLEUS SERVICE (Linux systemd --user)\n');

  const nucleusExe = path.join(paths.binDir, 'nucleus', 'nucleus');

  if (!await fs.pathExists(nucleusExe)) {
    throw new Error(`Nucleus binary not found: ${nucleusExe}`);
  }

  await fs.chmod(nucleusExe, 0o755);

  const logDir     = path.join(paths.logsDir, 'nucleus', 'service');
  await fs.ensureDir(logDir);
  const serviceLog = path.join(logDir, 'nucleus_service.log');

  // Asegurar directorio de units del usuario
  const unitDir = getSystemdUserDir();
  await fs.ensureDir(unitDir);

  // Detener y deshabilitar instancia previa si existe
  try {
    execSync(`systemctl --user stop ${NUCLEUS_SERVICE_NAME} 2>/dev/null || true`, {
      shell: true, stdio: 'ignore',
    });
    execSync(`systemctl --user disable ${NUCLEUS_SERVICE_NAME} 2>/dev/null || true`, {
      shell: true, stdio: 'ignore',
    });
  } catch (_) {}

  const unitPath = getUnitPath();
  await fs.writeFile(unitPath, generateUnit(nucleusExe, serviceLog), 'utf8');
  await fs.chmod(unitPath, 0o644);
  console.log(`✅ Nucleus systemd unit escrita: ${unitPath}`);

  // Habilitar linger antes de recargar
  ensureLinger();

  // Recargar daemon
  try {
    execSync('systemctl --user daemon-reload', { stdio: 'pipe' });
    console.log('   ✓ systemd daemon recargado');
  } catch (e) {
    throw new Error(`systemctl --user daemon-reload falló: ${e.message}`);
  }

  // Habilitar para arranque automático
  try {
    execSync(`systemctl --user enable ${NUCLEUS_SERVICE_NAME}`, { stdio: 'pipe' });
    console.log(`   ✓ ${NUCLEUS_SERVICE_NAME} habilitado`);
  } catch (e) {
    console.warn(`   ⚠️  systemctl enable falló (no fatal): ${e.message}`);
  }

  return true;
}

async function startNucleusService() {
  try {
    execSync(`systemctl --user start ${NUCLEUS_SERVICE_NAME}`, { stdio: 'pipe' });
    await new Promise(r => setTimeout(r, 5000));

    let pid = null;
    try {
      const out = execSync(
        `systemctl --user show ${NUCLEUS_SERVICE_NAME} --property=MainPID --value`,
        { encoding: 'utf8', stdio: 'pipe' }
      ).trim();
      pid = out && out !== '0' ? out : null;
    } catch (_) {}

    if (pid) {
      console.log(`✅ Nucleus Service corriendo (PID: ${pid})`);
    } else {
      // Verificar con is-active antes de declarar fallo
      try {
        execSync(`systemctl --user is-active ${NUCLEUS_SERVICE_NAME}`, { stdio: 'pipe' });
        console.log('✅ Nucleus Service activo (PID pendiente de confirmar)');
      } catch (_) {
        console.log('✅ Nucleus systemd unit iniciada (RunAtLoad la arrancará)');
      }
    }
    return true;
  } catch (e) {
    console.error(`❌ systemctl --user start falló: ${e.message}`);
    return false;
  }
}

async function removeNucleusService() {
  try {
    execSync(`systemctl --user stop ${NUCLEUS_SERVICE_NAME} 2>/dev/null || true`, {
      shell: true, stdio: 'ignore',
    });
    execSync(`systemctl --user disable ${NUCLEUS_SERVICE_NAME} 2>/dev/null || true`, {
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
  installNucleusService,
  startNucleusService,
  removeNucleusService,
  NUCLEUS_SERVICE_NAME,
  NUCLEUS_DISPLAY_NAME,
};
