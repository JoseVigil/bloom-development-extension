// service-installer-sensor-darwin.js
// Equivalente macOS de service-installer-sensor.js
// En Windows el sensor se registra en HKCU\Run via `bloom-sensor install`
// En macOS hace lo mismo via LaunchAgent, delegando en el propio binario

'use strict';

const fs           = require('fs-extra');
const path         = require('path');
const { execSync, spawn } = require('child_process');
const { paths }    = require('../config/paths');

const SENSOR_BIN_NAME = 'bloom-sensor';

async function installSensor() {
  console.log('\n🌉 INSTALANDO AGENTE DE SESIÓN: bloom-sensor (macOS)\n');

  const sensorExe = path.join(paths.binDir, 'sensor', SENSOR_BIN_NAME);

  if (!await fs.pathExists(sensorExe)) {
    throw new Error(`bloom-sensor no encontrado en: ${sensorExe}`);
  }

  await fs.chmod(sensorExe, 0o755);

  // Detener instancia previa si existe
  console.log('🛑 Limpiando instancias previas...');
  try {
    execSync(`pkill -f "${SENSOR_BIN_NAME}"`, { stdio: 'ignore' });
    await new Promise(r => setTimeout(r, 500));
    console.log(`   ✓ ${SENSOR_BIN_NAME} previo detenido`);
  } catch (_) {}

  // El binario bloom-sensor maneja su propio registro como LaunchAgent
  // via `bloom-sensor install` — mismo contrato que en Windows con HKCU\Run
  console.log('📝 Registrando LaunchAgent...');
  const result = execSync(`"${sensorExe}" install`, { encoding: 'utf8', stdio: 'pipe' });
  console.log(`   ${result.trim()}`);

  // Arrancar inmediatamente sin esperar al próximo login
  console.log('🚀 Arrancando bloom-sensor...');
  spawn(sensorExe, ['serve'], {
    detached: true,
    stdio: 'ignore'
  }).unref();

  await new Promise(r => setTimeout(r, 1500));

  // Verificar estado
  try {
    const status = execSync(`"${sensorExe}" status`, { encoding: 'utf8', stdio: 'pipe' }).trim();
    if (status === 'RUNNING') {
      console.log('✅ bloom-sensor RUNNING');
      return true;
    } else {
      console.warn(`⚠️  bloom-sensor status: ${status}`);
      return false;
    }
  } catch (_) {
    console.warn('⚠️  No se pudo verificar el estado de bloom-sensor');
    return false;
  }
}

async function uninstallSensor() {
  const sensorExe = path.join(paths.binDir, 'sensor', SENSOR_BIN_NAME);

  if (await fs.pathExists(sensorExe)) {
    try { execSync(`"${sensorExe}" uninstall`, { stdio: 'ignore' }); } catch (_) {}
  }

  try { execSync(`pkill -f "${SENSOR_BIN_NAME}"`, { stdio: 'ignore' }); } catch (_) {}

  console.log('✅ bloom-sensor removido');
}

module.exports = { installSensor, uninstallSensor };
