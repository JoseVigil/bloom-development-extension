const { app } = require('electron');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const { paths } = require('../config/paths');

async function createLauncherShortcuts() {
  try {
    console.log('🚀 Creating Bloom Launcher...');

    const launcherPath = paths.launcherExe;
    const sourceExe = app.getPath('exe');
    const sourceDir = path.dirname(sourceExe);

    await fs.ensureDir(paths.binDir);

    // Copiar ejecutable
    await fs.copy(sourceExe, launcherPath, { overwrite: true });
    console.log(` ✅ Launcher created at: ${launcherPath}`);

    // Copiar DLLs necesarias
    const requiredDlls = [
      'ffmpeg.dll',
      'libGLESv2.dll',
      'libEGL.dll',
      'vk_swiftshader.dll',
      'vulkan-1.dll',
      'd3dcompiler_47.dll',
      'chrome_100_percent.pak',
      'chrome_200_percent.pak',
      'resources.pak',
      'v8_context_snapshot.bin',
      'snapshot_blob.bin',
      'icudtl.dat'
    ];

    console.log(' 📦 Copying Electron dependencies...');
    let copiedCount = 0;

    for (const dll of requiredDlls) {
      const sourcePath = path.join(sourceDir, dll);
      const destPath = path.join(paths.binDir, dll);

      if (await fs.pathExists(sourcePath)) {
        await fs.copy(sourcePath, destPath, { overwrite: true });
        copiedCount++;
      }
    }

    console.log(` 📊 Copied: ${copiedCount} files`);

    // Copiar carpeta locales
    const localesSource = path.join(sourceDir, 'locales');
    const localesDest = path.join(paths.binDir, 'locales');
    
    if (await fs.pathExists(localesSource)) {
      await fs.copy(localesSource, localesDest, { overwrite: true });
      console.log(' ✅ Locales folder copied');
    }

    // Copiar carpeta resources
    const resourcesSource = path.join(sourceDir, 'resources');
    const resourcesDest = path.join(paths.binDir, 'resources');
    
    if (await fs.pathExists(resourcesSource)) {
      await fs.copy(resourcesSource, resourcesDest, { overwrite: true });
      console.log(' ✅ Resources folder copied');
    }

    // Crear shortcuts
    await createShortcut(
      path.join(app.getPath('desktop'), 'Bloom Nucleus.lnk'),
      launcherPath,
      '--mode=launch',
      'Bloom Nucleus AI Hub'
    );
    console.log(' ✅ Desktop shortcut created');

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
      launcherPath,
      filescopied: copiedCount
    };
  } catch (error) {
    console.error('❌ Error creating launcher shortcuts:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

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