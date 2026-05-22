// service-installer-sensor-darwin.js
// Instala bloom-sensor como LaunchAgent del usuario actual.
// Registra el plist en ~/Library/LaunchAgents y lo carga con launchctl.
// No delega en `sensor install` — ese subcomando no existe en el binario Darwin.

'use strict';

const fs           = require('fs-extra');
const path         = require('path');
const os           = require('os');
const { execSync, spawn } = require('child_process');
const { paths }    = require('../config/paths');

// El binario se copia como 'bloom-sensor' (consistente con nucleus.json system_map)
const SENSOR_BIN_NAME  = 'bloom-sensor';
const LAUNCH_AGENT_ID  = 'com.bloom.sensor';
const PLIST_FILENAME   = `${LAUNCH_AGENT_ID}.plist`;
const LAUNCH_AGENTS_DIR = path.join(os.homedir(), 'Library', 'LaunchAgents');
const PLIST_PATH       = path.join(LAUNCH_AGENTS_DIR, PLIST_FILENAME);

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/** Genera el contenido del plist para launchd */
function buildPlist(sensorExe) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCH_AGENT_ID}</string>

  <key>ProgramArguments</key>
  <array>
    <string>${sensorExe}</string>
    <string>serve</string>
  </array>

  <!-- Reiniciar automáticamente si el proceso muere -->
  <key>KeepAlive</key>
  <true/>

  <!-- Arrancar junto con la sesión del usuario -->
  <key>RunAtLoad</key>
  <true/>

  <!-- Logs — launchd los crea si no existen -->
  <key>StandardOutPath</key>
  <string>${path.join(os.homedir(), 'Library', 'Logs', 'bloom-sensor.log')}</string>
  <key>StandardErrorPath</key>
  <string>${path.join(os.homedir(), 'Library', 'Logs', 'bloom-sensor.error.log')}</string>
</dict>
</plist>
`;
}

/** Intenta leer el PID del servicio desde launchctl (macOS 10.10+) */
function getSensorPid() {
  try {
    // `launchctl list <label>` devuelve una tabla; la primera columna es el PID (- si no corre)
    const out = execSync(`launchctl list ${LAUNCH_AGENT_ID} 2>/dev/null`, {
      encoding: 'utf8',
      stdio: 'pipe',
    }).trim();
    // Formato: PID  Status  Label
    const match = out.match(/^(\d+)\s+/m);
    return match ? parseInt(match[1], 10) : null;
  } catch (_) {
    return null;
  }
}

// ----------------------------------------------------------------------------
// installSensor
// ----------------------------------------------------------------------------

async function installSensor() {
  console.log('\n🌉 INSTALANDO AGENTE DE SESIÓN: bloom-sensor (macOS)\n');

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

  // 2. Detener y desregistrar instancia previa si existe
  console.log('🛑 Limpiando instancias previas...');
  try {
    // bootout no lanza error si el servicio no estaba cargado (macOS 10.11+)
    execSync(`launchctl bootout gui/$(id -u) ${PLIST_PATH} 2>/dev/null || true`, {
      shell: true,
      stdio: 'ignore',
    });
    await new Promise(r => setTimeout(r, 400));
    console.log('   ✓ LaunchAgent previo descargado (si existía)');
  } catch (_) {}

  // pkill por si el proceso corría fuera de launchd (e.g. inicio manual anterior)
  try {
    execSync(`pkill -f "${SENSOR_BIN_NAME}" 2>/dev/null || true`, {
      shell: true,
      stdio: 'ignore',
    });
    await new Promise(r => setTimeout(r, 300));
  } catch (_) {}

  // 3. Crear el directorio LaunchAgents si no existe
  await fs.ensureDir(LAUNCH_AGENTS_DIR);

  // 4. Escribir el plist
  console.log('📝 Registrando LaunchAgent...');
  await fs.writeFile(PLIST_PATH, buildPlist(sensorExe), 'utf8');
  // launchd requiere que el plist sea propiedad del usuario y no world-writable
  await fs.chmod(PLIST_PATH, 0o644);
  console.log(`   ✓ Plist escrito en: ${PLIST_PATH}`);

  // 5. Cargar el agente con launchctl (arranca inmediatamente por RunAtLoad=true)
  console.log('🚀 Cargando LaunchAgent (launchctl bootstrap)...');
  try {
    // bootstrap es el mecanismo moderno (macOS 10.11+); load es legacy pero sigue funcionando
    execSync(`launchctl bootstrap gui/$(id -u) ${PLIST_PATH}`, {
      shell: true,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    console.log('   ✓ launchctl bootstrap OK');
  } catch (err) {
    // Código 36 = servicio ya registrado — no es error fatal
    if (!err.message.includes('36')) {
      throw new Error(`launchctl bootstrap falló: ${err.message}`);
    }
    console.log('   ℹ️  El servicio ya estaba registrado, continuando...');
  }

  // 6. Esperar a que el proceso levante
  await new Promise(r => setTimeout(r, 1500));

  // 7. Verificar estado vía launchctl (no vía subcomando del binario)
  console.log('🔍 Verificando estado...');
  const pid = getSensorPid();

  if (pid) {
    console.log(`✅ bloom-sensor RUNNING  (PID ${pid})`);
    return true;
  }

  // Fallback: verificar con pgrep por si launchctl list tarda
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
  console.warn(`   Revisa los logs en: ~/Library/Logs/bloom-sensor.error.log`);
  return false;
}

// ----------------------------------------------------------------------------
// uninstallSensor
// ----------------------------------------------------------------------------

async function uninstallSensor() {
  console.log('🗑️  Removiendo bloom-sensor (macOS)...');

  // Descargar el agente de launchd
  try {
    execSync(`launchctl bootout gui/$(id -u) ${PLIST_PATH} 2>/dev/null || true`, {
      shell: true,
      stdio: 'ignore',
    });
    console.log('   ✓ LaunchAgent descargado');
  } catch (_) {}

  // Eliminar el plist
  if (await fs.pathExists(PLIST_PATH)) {
    await fs.remove(PLIST_PATH);
    console.log(`   ✓ Plist eliminado: ${PLIST_PATH}`);
  }

  // Matar cualquier proceso residual
  try {
    execSync(`pkill -f "${SENSOR_BIN_NAME}" 2>/dev/null || true`, {
      shell: true,
      stdio: 'ignore',
    });
  } catch (_) {}

  console.log('✅ bloom-sensor removido');
}

module.exports = { installSensor, uninstallSensor };
