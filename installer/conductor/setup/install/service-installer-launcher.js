// service-installer-launcher.js
// Instalación de bloom-launcher como agente de sesión de usuario
// NO es un servicio NSSM — se registra en HKCU\Run del usuario actual
// Esto lo hace correr en Session 1 (sesión interactiva) al login del usuario

const path = require('path');
const fs = require('fs-extra');
const { execSync } = require('child_process');
const { paths } = require('../config/paths');

const LAUNCHER_EXE_NAME = 'bloom-launcher.exe';

// ============================================================================
// INSTALACIÓN
// ============================================================================

async function installLauncher() {
  console.log('\n🌉 INSTALANDO AGENTE DE SESIÓN: bloom-launcher\n');

  const launcherExe = path.join(paths.binDir, 'launcher', LAUNCHER_EXE_NAME);

  if (!fs.existsSync(launcherExe)) {
    throw new Error(`bloom-launcher.exe no encontrado en: ${launcherExe}`);
  }

  // ── LIMPIEZA PREVIA ───────────────────────────────────────────
  // Detener instancia anterior si existe (reinstalación limpia)
  console.log('🛑 Limpiando instancia previa...');
  try {
    execSync(`taskkill /F /IM ${LAUNCHER_EXE_NAME}`, { stdio: 'ignore' });
    console.log('   ✓ Proceso previo detenido');
  } catch (_) {}

  try {
    execSync(`"${launcherExe}" uninstall`, { stdio: 'ignore' });
    console.log('   ✓ Registro HKCU\\Run limpiado');
  } catch (_) {}

  // Dar tiempo a que libere el named pipe antes de arrancar la nueva instancia
  await new Promise(r => setTimeout(r, 500));
  // ─────────────────────────────────────────────────────────────

  // Registrar en HKCU\Run (sin admin, pertenece al usuario)
  console.log('📝 Registrando en HKCU\\Run...');
  const result = execSync(
    `"${launcherExe}" install`,
    { encoding: 'utf8', stdio: 'pipe' }
  );
  console.log(`   ${result.trim()}`);

  // Arrancar inmediatamente (sin esperar al próximo login)
  console.log('🚀 Arrancando bloom-launcher...');
  const { spawn } = require('child_process');
  spawn(launcherExe, ['serve'], {
    detached: true,
    stdio: 'ignore'
  }).unref();

  // Verificar que esté corriendo
  await new Promise(r => setTimeout(r, 1500));

  const status = execSync(
    `"${launcherExe}" status`,
    { encoding: 'utf8', stdio: 'pipe' }
  ).trim();

  if (status === 'RUNNING') {
    console.log('✅ bloom-launcher RUNNING (agente de sesión activo)');
    return true;
  } else {
    console.warn(`⚠️  bloom-launcher status: ${status}`);
    return false;
  }
}

// ============================================================================
// DESINSTALACIÓN
// ============================================================================

async function uninstallLauncher() {
  const launcherExe = path.join(paths.binDir, 'launcher', LAUNCHER_EXE_NAME);

  if (fs.existsSync(launcherExe)) {
    try {
      execSync(`"${launcherExe}" uninstall`, { stdio: 'ignore' });
    } catch (_) {}
  }

  // Matar proceso si está corriendo
  try {
    execSync(`taskkill /F /IM ${LAUNCHER_EXE_NAME}`, { stdio: 'ignore' });
  } catch (_) {}

  console.log('✅ bloom-launcher removido');
}

module.exports = { installLauncher, uninstallLauncher };