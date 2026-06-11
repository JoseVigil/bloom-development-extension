// service-installer-sensor-linux.js
// Equivalente Linux de service-installer-sensor-darwin.js
// Registra bloom-sensor como systemd --user unit.

'use strict';

const fs           = require('fs-extra');
const path         = require('path');
const os           = require('os');
const { execSync } = require('child_process');
const { paths }    = require('../config/paths');

const SENSOR_BIN_NAME    = 'bloom-sensor';
const SYSTEMD_SERVICE_ID = 'com.bloom.sensor';
const UNIT_FILENAME      = `${SYSTEMD_SERVICE_ID}.service`;

const SYSTEMD_USER_DIR = path.join(os.homedir(), '.config', 'systemd', 'user');
const UNIT_PATH        = path.join(SYSTEMD_USER_DIR, UNIT_FILENAME);

// Logs en el equivalente Linux de ~/Library/Logs/
const LOG_DIR    = path.join(os.homedir(), '.local', 'share', 'BloomNucleus', 'logs', 'sensor');
const LOG_PATH   = path.join(LOG_DIR, 'bloom-sensor.log');
const ERR_PATH   = path.join(LOG_DIR, 'bloom-sensor.error.log');

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/** Genera el contenido del unit file para systemd --user */
function buildUnit(sensorExe) {
  return `[Unit]
Description=Bloom Session Sensor
After=network.target

[Service]
Type=simple
ExecStart=${sensorExe} serve
Restart=always
RestartSec=5
Environment="HOME=${os.homedir()}"
StandardOutput=append:${LOG_PATH}
StandardError=append:${ERR_PATH}

[Install]
WantedBy=default.target
`;
}

/**
 * Intenta leer el MainPID del servicio desde systemd.
 * Devuelve el PID como número o null si el servicio no está corriendo.
 */
function getSensorPid() {
  try {
    const out = execSync(
      `systemctl --user show ${SYSTEMD_SERVICE_ID} --property=MainPID --value`,
      { encoding: 'utf8', stdio: 'pipe' }
    ).trim();
    const pid = parseInt(out, 10);
    return pid && pid !== 0 ? pid : null;
  } catch (_) {
    return null;
  }
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
    console.log('   ✓ Linger activado (bloom-sensor sobrevivirá al logout)');
  } catch (e) {
    // No es fatal — funciona mientras la sesión esté activa
    console.warn(`   ⚠️  No se pudo activar linger: ${e.message}`);
    console.warn('      bloom-sensor solo correrá mientras haya una sesión activa.');
  }
}

// ----------------------------------------------------------------------------
// installSensor
// ----------------------------------------------------------------------------

async function installSensor() {
  console.log('\n🌉 INSTALANDO AGENTE DE SESIÓN: bloom-sensor (Linux)\n');

  const sensorExe = path.join(paths.binDir, 'sensor', SENSOR_BIN_NAME);

  // 1. Verificar que el binario existe
  if (!await fs.pathExists(sensorExe)) {
    throw new Error(
      `bloom-sensor no encontrado en: ${sensorExe}\n` +
      `  Asegúrate de que el step de copia usa el nombre '${SENSOR_BIN_NAME}' ` +
      `(consistente con el system_map en nucleus.json).`
    );
  }

  await fs.chmod(sensorExe, 0o755);
  console.log(`   ✓ Binario: ${sensorExe}`);

  // 2. Crear directorios de log
  await fs.ensureDir(LOG_DIR);

  // 3. Detener y deshabilitar instancia previa si existe
  console.log('🛑 Limpiando instancias previas...');
  try {
    execSync(
      `systemctl --user stop ${SYSTEMD_SERVICE_ID} 2>/dev/null || true`,
      { shell: true, stdio: 'ignore' }
    );
    execSync(
      `systemctl --user disable ${SYSTEMD_SERVICE_ID} 2>/dev/null || true`,
      { shell: true, stdio: 'ignore' }
    );
    await new Promise(r => setTimeout(r, 400));
    console.log('   ✓ Servicio previo detenido (si existía)');
  } catch (_) {}

  // pkill por si el proceso corría fuera de systemd
  try {
    execSync(`pkill -f "${SENSOR_BIN_NAME}" 2>/dev/null || true`, {
      shell: true, stdio: 'ignore',
    });
    await new Promise(r => setTimeout(r, 300));
  } catch (_) {}

  // 4. Asegurar directorio de units
  await fs.ensureDir(SYSTEMD_USER_DIR);

  // 5. Escribir el unit file
  console.log('📝 Registrando systemd unit...');
  await fs.writeFile(UNIT_PATH, buildUnit(sensorExe), 'utf8');
  await fs.chmod(UNIT_PATH, 0o644);
  console.log(`   ✓ Unit escrita en: ${UNIT_PATH}`);

  // 6. Habilitar linger antes de recargar el daemon
  ensureLinger();

  // 7. Recargar el daemon para que vea la nueva unit
  console.log('🔄 Recargando systemd daemon...');
  try {
    execSync('systemctl --user daemon-reload', { stdio: 'pipe' });
    console.log('   ✓ daemon-reload OK');
  } catch (e) {
    throw new Error(`systemctl --user daemon-reload falló: ${e.message}`);
  }

  // 8. Habilitar para arranque automático
  try {
    execSync(`systemctl --user enable ${SYSTEMD_SERVICE_ID}`, { stdio: 'pipe' });
    console.log(`   ✓ ${SYSTEMD_SERVICE_ID} habilitado`);
  } catch (e) {
    console.warn(`   ⚠️  systemctl enable falló (no fatal): ${e.message}`);
  }

  // 9. Iniciar el servicio ahora
  console.log('🚀 Iniciando bloom-sensor...');
  try {
    execSync(`systemctl --user start ${SYSTEMD_SERVICE_ID}`, { stdio: 'pipe' });
    console.log('   ✓ systemctl start OK');
  } catch (err) {
    throw new Error(`systemctl --user start falló: ${err.message}`);
  }

  // 10. Esperar a que el proceso levante
  await new Promise(r => setTimeout(r, 1500));

  // 11. Verificar estado vía systemd
  console.log('🔍 Verificando estado...');
  const pid = getSensorPid();

  if (pid) {
    console.log(`✅ bloom-sensor RUNNING  (PID ${pid})`);
    return true;
  }

  // Fallback: is-active
  try {
    execSync(`systemctl --user is-active ${SYSTEMD_SERVICE_ID}`, { stdio: 'pipe' });
    console.log('✅ bloom-sensor ACTIVE (PID aún inicializando)');
    return true;
  } catch (_) {}

  // Fallback final: pgrep
  try {
    const pgrepOut = execSync(
      `pgrep -x "${SENSOR_BIN_NAME}" 2>/dev/null || pgrep -f "${SENSOR_BIN_NAME} serve" 2>/dev/null || true`,
      { shell: true, encoding: 'utf8', stdio: 'pipe' }
    ).trim();

    if (pgrepOut) {
      console.log(`✅ bloom-sensor RUNNING  (PID ${pgrepOut.split('\n')[0]})`);
      return true;
    }
  } catch (_) {}

  console.warn('⚠️  bloom-sensor no parece estar corriendo tras el arranque.');
  console.warn(`   Revisa los logs en: ${ERR_PATH}`);
  return false;
}

// ----------------------------------------------------------------------------
// uninstallSensor
// ----------------------------------------------------------------------------

async function uninstallSensor() {
  console.log('🗑️  Removiendo bloom-sensor (Linux)...');

  try {
    execSync(`systemctl --user stop ${SYSTEMD_SERVICE_ID} 2>/dev/null || true`, {
      shell: true, stdio: 'ignore',
    });
    execSync(`systemctl --user disable ${SYSTEMD_SERVICE_ID} 2>/dev/null || true`, {
      shell: true, stdio: 'ignore',
    });
    console.log('   ✓ Servicio detenido y deshabilitado');
  } catch (_) {}

  if (await fs.pathExists(UNIT_PATH)) {
    await fs.remove(UNIT_PATH);
    console.log(`   ✓ Unit eliminada: ${UNIT_PATH}`);
  }

  try {
    execSync('systemctl --user daemon-reload', { stdio: 'ignore' });
  } catch (_) {}

  // Matar cualquier proceso residual
  try {
    execSync(`pkill -f "${SENSOR_BIN_NAME}" 2>/dev/null || true`, {
      shell: true, stdio: 'ignore',
    });
  } catch (_) {}

  console.log('✅ bloom-sensor removido');
}

module.exports = { installSensor, uninstallSensor };
