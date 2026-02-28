// service-installer-sensor.js
// Instalación de bloom-sensor como agente de sesión de usuario
// NO es un servicio NSSM — se registra en HKCU\Run del usuario actual
// Esto lo hace correr en Session 1 (sesión interactiva) al login del usuario

const path = require('path');
const fs = require('fs-extra');
const { execSync } = require('child_process');
const { paths } = require('../config/paths');

const SENSOR_EXE_NAME = 'bloom-sensor.exe';

// ============================================================================
// INSTALACIÓN
// ============================================================================

async function installSensor() {
  console.log('\n🌉 INSTALANDO AGENTE DE SESIÓN: bloom-sensor\n');

  const sensorExe = path.join(paths.binDir, 'sensor', SENSOR_EXE_NAME);

  if (!fs.existsSync(sensorExe)) {
    throw new Error(`bloom-sensor.exe no encontrado en: ${sensorExe}`);
  }

  // ── LIMPIEZA PREVIA ───────────────────────────────────────────
  // Detener bloom-launcher legacy si está corriendo
  console.log('🛑 Limpiando instancias previas...');

  // Detener bloom-sensor previo si existe
  try {
    execSync(`taskkill /F /IM ${SENSOR_EXE_NAME}`, { stdio: 'ignore' });
    console.log(`   ✓ ${SENSOR_EXE_NAME} previo detenido`);
  } catch (_) {}

  // Dar tiempo a que libere el named pipe antes de arrancar la nueva instancia
  await new Promise(r => setTimeout(r, 500));
  // bloom-sensor reemplaza automáticamente la clave BloomLauncher en HKCU\Run
  // durante su propio proceso de install — no requiere limpieza manual del registro
  // ─────────────────────────────────────────────────────────────

  // Registrar en HKCU\Run (sin admin, pertenece al usuario)
  console.log('📝 Registrando en HKCU\\Run...');
  const result = execSync(
    `"${sensorExe}" install`,
    { encoding: 'utf8', stdio: 'pipe' }
  );
  console.log(`   ${result.trim()}`);

  // Arrancar inmediatamente (sin esperar al próximo login)
  console.log('🚀 Arrancando bloom-sensor...');
  const { spawn } = require('child_process');
  spawn(sensorExe, ['serve'], {
    detached: true,
    stdio: 'ignore'
  }).unref();

  // Verificar que esté corriendo
  await new Promise(r => setTimeout(r, 1500));

  const status = execSync(
    `"${sensorExe}" status`,
    { encoding: 'utf8', stdio: 'pipe' }
  ).trim();

  if (status === 'RUNNING') {
    console.log('✅ bloom-sensor RUNNING (agente de sesión activo)');
    return true;
  } else {
    console.warn(`⚠️  bloom-sensor status: ${status}`);
    return false;
  }
}

// ============================================================================
// DESINSTALACIÓN
// ============================================================================

async function uninstallSensor() {
  const sensorExe = path.join(paths.binDir, 'sensor', SENSOR_EXE_NAME);

  if (fs.existsSync(sensorExe)) {
    try {
      execSync(`"${sensorExe}" uninstall`, { stdio: 'ignore' });
    } catch (_) {}
  }

  // Matar proceso si está corriendo
  try {
    execSync(`taskkill /F /IM ${SENSOR_EXE_NAME}`, { stdio: 'ignore' });
  } catch (_) {}

  console.log('✅ bloom-sensor removido');
}

module.exports = { installSensor, uninstallSensor };