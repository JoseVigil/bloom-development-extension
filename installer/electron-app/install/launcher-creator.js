const { app } = require('electron');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const { paths } = require('../config/paths');

/**
 * Crea el launcher y los accesos directos
 */
async function createLauncherShortcuts() {
  try {
    console.log('🚀 Creating Bloom Launcher...');

    const launcherPath = paths.launcherExe;

    // Crear directorio de binarios
    await fs.ensureDir(paths.binDir);

    // Copiar el ejecutable actual como launcher
    await fs.copy(app.getPath('exe'), launcherPath, { overwrite: true });
    console.log(` ✅ Launcher created at: ${launcherPath}`);

    // Crear acceso directo en el escritorio
    await createShortcut(
      path.join(app.getPath('desktop'), 'Bloom Nucleus.lnk'),
      launcherPath,
      '--mode=launch',
      'Bloom Nucleus AI Hub'
    );
    console.log(' ✅ Desktop shortcut created');

    // Crear acceso directo en el menú de inicio
    const startMenuPath = path.join(
      app.getPath('appData'),
      'Microsoft',
      'Windows',
      'Start Menu',
      'Programs',
      'Bloom Nucleus'
    );
    await fs.ensureDir(startMenuPath);
    
    await createShortcut(
      path.join(startMenuPath, 'Bloom Nucleus.lnk'),
      launcherPath,
      '--mode=launch',
      'Bloom Nucleus AI Hub'
    );
    console.log(' ✅ Start Menu shortcut created');

    console.log('✅ Launcher and shortcuts created successfully');
    
    return {
      success: true,
      launcherPath
    };
  } catch (error) {
    console.error('❌ Error creating launcher shortcuts:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Crea un acceso directo usando VBScript
 */
async function createShortcut(linkPath, targetPath, args, description) {
  const vbsScript = `
Set oWS = WScript.CreateObject("WScript.Shell")
sLinkFile = "${linkPath.replace(/\\/g, '\\\\')}"
Set oLink = oWS.CreateShortcut(sLinkFile)
oLink.TargetPath = "${targetPath.replace(/\\/g, '\\\\')}"
oLink.Arguments = "${args}"
oLink.WorkingDirectory = "${path.dirname(targetPath).replace(/\\/g, '\\\\')}"
oLink.Description = "${description}"
oLink.IconLocation = "${path.join(__dirname, '..', 'assets', 'bloom.ico').replace(/\\/g, '\\\\')}"
oLink.Save`;

  const vbsPath = path.join(os.tmpdir(), `create-shortcut-${Date.now()}.vbs`);
  await fs.writeFile(vbsPath, vbsScript);

  return new Promise((resolve, reject) => {
    exec(`cscript //nologo "${vbsPath}"`, (error, stdout, stderr) => {
      fs.remove(vbsPath).catch(console.error);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

module.exports = {
  createLauncherShortcuts,
  createShortcut
};