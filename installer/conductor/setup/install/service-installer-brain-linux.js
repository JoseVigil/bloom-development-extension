// service-installer-brain-linux.js
// Equivalente Linux de service-installer-brain-darwin.js
// Reemplaza launchd LaunchAgents por systemd --user units

'use strict';

const fs           = require('fs-extra');
const path         = require('path');
const { execSync } = require('child_process');
const { paths }    = require('../config/paths');
const os           = require('os');

const NEW_SERVICE_NAME = 'com.bloom.brain';
const OLD_SERVICE_NAME = 'com.bloom.brain';
const UNIT_FILENAME    = `${NEW_SERVICE_NAME}.service`;

function getSystemdUserDir() {
  return path.join(os.homedir(), '.config', 'systemd', 'user');
}

function getUnitPath() {
  return path.join(getSystemdUserDir(), UNIT_FILENAME);
}

function generateUnit(binaryPath, logPath) {
  const workDir = path.dirname(binaryPath);
  return `[Unit]
Description=Bloom Brain Service
After=network.target

[Service]
Type=simple
ExecStart=${binaryPath} service start
WorkingDirectory=${workDir}
Restart=on-failure
RestartSec=10
Environment="HOME=${os.homedir()}"
Environment="PYTHONUNBUFFERED=1"
Environment="PYTHONIOENCODING=utf-8"
StandardOutput=append:${logPath}
StandardError=append:${logPath}

[Install]
WantedBy=default.target
`;
}

/**
 * Verifica que systemd --user esté disponible en esta sesión.
 * Requiere que DBUS_SESSION_BUS_ADDRESS esté seteada o que el usuario
 * tenga linger habilitado y un bus de sesión corriendo.
 */
function checkSystemdUserAvailable() {
  try {
    execSync('systemctl --user status', { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch (e) {
    // exit code != 0 es normal si no hay servicios activos; lo que importa es que no tire ENOENT
    if (e.code === 'ENOENT') return false;
    return true;
  }
}

/**
 * Habilita linger para el usuario actual si no está activo.
 * Linger es necesario para que los servicios --user corran sin sesión abierta.
 * loginctl enable-linger puede requerir sudo en algunas configuraciones,
 * pero en Ubuntu moderno un usuario normal puede habilitarlo para sí mismo.
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
    execSync(`loginctl enable-linger ${os.userInfo().username}`, {
      stdio: 'pipe',
    });
    console.log('   ✓ Linger activado (los servicios sobreviven al logout)');
  } catch (e) {
    // No es fatal — el servicio corre igual mientras haya sesión activa
    console.warn(`   ⚠️  No se pudo activar linger: ${e.message}`);
    console.warn('      Los servicios solo correrán mientras haya una sesión activa.');
  }
}

async function installWindowsService() {
  console.log('\n🤖 INSTALANDO BRAIN SERVICE (Linux systemd --user)\n');

  const binaryPath = paths.brainExe;

  if (!await fs.pathExists(binaryPath)) {
    throw new Error(`Brain binary not found: ${binaryPath}`);
  }

  await fs.chmod(binaryPath, 0o755);

  const logDir     = path.join(paths.logsDir, 'brain', 'service');
  await fs.ensureDir(logDir);
  const serviceLog = path.join(logDir, 'brain_service.log');

  // Asegurar directorio de units del usuario
  const unitDir = getSystemdUserDir();
  await fs.ensureDir(unitDir);

  // Detener y deshabilitar instancia previa si existe
  try {
    execSync(`systemctl --user stop ${NEW_SERVICE_NAME} 2>/dev/null || true`, {
      shell: true, stdio: 'ignore',
    });
    execSync(`systemctl --user disable ${NEW_SERVICE_NAME} 2>/dev/null || true`, {
      shell: true, stdio: 'ignore',
    });
  } catch (_) {}

  const unitPath = getUnitPath();
  await fs.writeFile(unitPath, generateUnit(binaryPath, serviceLog), 'utf8');
  await fs.chmod(unitPath, 0o644);
  console.log(`✅ systemd unit escrita: ${unitPath}`);

  // Habilitar linger antes de recargar el daemon
  ensureLinger();

  // Recargar el daemon para que vea la nueva unit
  try {
    execSync('systemctl --user daemon-reload', { stdio: 'pipe' });
    console.log('   ✓ systemd daemon recargado');
  } catch (e) {
    throw new Error(`systemctl --user daemon-reload falló: ${e.message}`);
  }

  // Habilitar para que arranque al login
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
    console.log('✅ Brain systemd unit iniciada');
    return true;
  } catch (e) {
    console.error(`❌ systemctl --user start falló: ${e.message}`);
    return false;
  }
}

async function removeService() {
  try {
    execSync(`systemctl --user stop ${NEW_SERVICE_NAME} 2>/dev/null || true`, {
      shell: true, stdio: 'ignore',
    });
    execSync(`systemctl --user disable ${NEW_SERVICE_NAME} 2>/dev/null || true`, {
      shell: true, stdio: 'ignore',
    });
  } catch (_) {}

  const unitPath = getUnitPath();
  try { await fs.remove(unitPath); } catch (_) {}

  try {
    execSync('systemctl --user daemon-reload', { stdio: 'ignore' });
  } catch (_) {}
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
