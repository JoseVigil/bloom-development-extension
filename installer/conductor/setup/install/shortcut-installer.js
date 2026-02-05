const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const { paths } = require('../config/paths');
const { app } = require('electron');

async function createShortcuts() {
  console.log('\n🔗 CREATING SHORTCUTS');

  // 1. Definir rutas
  const currentExe = process.execPath; // El ejecutable que está corriendo ahora
  const targetExe = paths.launcherExe; // %LOCALAPPDATA%/BloomNucleus/bin/BloomLauncher.exe
  const iconPath = paths.bloomIcon; // Icono .ico

  // 2. Copiar el ejecutable a la carpeta de instalación (Si no existe o es viejo)
  // Esto transforma el "Instalador" en el "Launcher" residente.
  console.log(`📂 Deploying Launcher Executable...`);
  try {
    await fs.ensureDir(path.dirname(targetExe));
    await fs.copy(currentExe, targetExe, { overwrite: true });
    console.log(`✅ Launcher binary deployed to: ${targetExe}`);
  } catch (error) {
    // Si falla (ej: está abierto), intentamos seguir si ya existe
    if (fs.existsSync(targetExe)) {
      console.warn(`⚠️ Could not overwrite launcher (locked?), using existing one.`);
    } else {
      throw new Error(`Failed to copy launcher: ${error.message}`);
    }
  }

  // 3. Crear Acceso Directo en Escritorio (PowerShell)
  if (process.platform === 'win32') {
    const linkPath = path.join(paths.desktop, 'Bloom Nucleus.lnk');
    const startMenuDir = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Bloom Nucleus');
    
    // Script de PowerShell para crear el acceso directo
    // Importante: Agregamos '--launch' a los argumentos para forzar el modo correcto
    const psScript = `
      $ws = New-Object -ComObject WScript.Shell;
      $s = $ws.CreateShortcut('${linkPath}');
      $s.TargetPath = '${targetExe}';
      $s.Arguments = '--launch'; 
      $s.IconLocation = '${iconPath}';
      $s.WorkingDirectory = '${path.dirname(targetExe)}';
      $s.Description = 'Bloom Nucleus AI Orchestrator';
      $s.Save();
    `;

    try {
      execSync(`powershell -command "${psScript}"`, { stdio: 'ignore' });
      console.log('✅ Desktop shortcut created');
    } catch (e) {
      console.error('❌ Failed to create desktop shortcut:', e.message);
    }

    // 4. Crear Acceso en Menú Inicio (Opcional pero recomendado)
    try {
      await fs.ensureDir(startMenuDir);
      const startMenuLink = path.join(startMenuDir, 'Bloom Nucleus.lnk');
      const psScriptMenu = `
        $ws = New-Object -ComObject WScript.Shell;
        $s = $ws.CreateShortcut('${startMenuLink}');
        $s.TargetPath = '${targetExe}';
        $s.Arguments = '--launch';
        $s.IconLocation = '${iconPath}';
        $s.WorkingDirectory = '${path.dirname(targetExe)}';
        $s.Save();
      `;
      execSync(`powershell -command "${psScriptMenu}"`, { stdio: 'ignore' });
      console.log('✅ Start Menu shortcut created');
    } catch (e) {
      // No crítico
    }
  }
}

module.exports = { createShortcuts };