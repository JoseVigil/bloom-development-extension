const { app } = require('electron');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const { paths } = require('../config/paths');

async function createLauncherShortcuts() {
  try {
    console.log('🚀 Creating Bloom Launcher with complete dependencies...');

    const launcherPath = paths.launcherExe;
    const sourceExe = app.getPath('exe');
    const sourceDir = path.dirname(sourceExe);

    await fs.ensureDir(paths.binDir);

    // 1. Copiar ejecutable principal
    await fs.copy(sourceExe, launcherPath, { overwrite: true });
    console.log(` ✅ Launcher executable: ${launcherPath}`);

    // 2. Copiar DLLs individuales
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

    console.log(' 📦 Copying individual dependencies...');
    let copiedCount = 0;

    for (const dll of requiredDlls) {
      const sourcePath = path.join(sourceDir, dll);
      const destPath = path.join(paths.binDir, dll);

      if (await fs.pathExists(sourcePath)) {
        await fs.copy(sourcePath, destPath, { overwrite: true });
        copiedCount++;
      } else {
        console.warn(` ⚠️ Missing: ${dll}`);
      }
    }

    console.log(` 📊 Individual files copied: ${copiedCount}/${requiredDlls.length}`);

    // 3. Copiar carpeta locales COMPLETA
    const localesSource = path.join(sourceDir, 'locales');
    const localesDest = path.join(paths.binDir, 'locales');
    
    if (await fs.pathExists(localesSource)) {
      await fs.copy(localesSource, localesDest, { overwrite: true });
      const localesFiles = await fs.readdir(localesDest);
      console.log(` ✅ Locales folder: ${localesFiles.length} files`);
    } else {
      console.error(' ❌ CRITICAL: locales/ folder not found!');
    }

    // 4. Copiar carpeta resources COMPLETA (incluyendo app.asar)
    const resourcesSource = path.join(sourceDir, 'resources');
    const resourcesDest = path.join(paths.binDir, 'resources');
    
    if (await fs.pathExists(resourcesSource)) {
      await fs.copy(resourcesSource, resourcesDest, { overwrite: true });
      
      // Verificar archivos críticos
      const appAsarPath = path.join(resourcesDest, 'app.asar');
      const appAsarExists = await fs.pathExists(appAsarPath);
      
      if (appAsarExists) {
        const stats = await fs.stat(appAsarPath);
        console.log(` ✅ Resources folder copied (app.asar: ${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
      } else {
        console.error(' ❌ CRITICAL: app.asar not found in resources!');
      }
    } else {
      console.error(' ❌ CRITICAL: resources/ folder not found!');
    }

    // 5. Copiar swiftshader (opcional pero recomendado)
    const swiftshaderSource = path.join(sourceDir, 'swiftshader');
    const swiftshaderDest = path.join(paths.binDir, 'swiftshader');
    
    if (await fs.pathExists(swiftshaderSource)) {
      await fs.copy(swiftshaderSource, swiftshaderDest, { overwrite: true });
      console.log(' ✅ Swiftshader folder copied');
    }

    // 6. Verificar que el launcher puede ejecutarse
    console.log(' 🔍 Verifying launcher integrity...');
    const canExecute = await verifyLauncherIntegrity(paths.binDir);
    
    if (!canExecute.success) {
      console.error(' ❌ Launcher verification failed:', canExecute.missing);
      return {
        success: false,
        error: 'Missing critical dependencies',
        missing: canExecute.missing
      };
    }

    // 7. Crear shortcuts
    const iconPath = path.join(__dirname, '..', 'assets', 'bloom.ico');
    
    await createShortcut(
      path.join(app.getPath('desktop'), 'Bloom Nucleus.lnk'),
      launcherPath,
      '--mode=launch',
      'Bloom Nucleus AI Hub',
      iconPath
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
      'Bloom Nucleus AI Hub',
      iconPath
    );
    console.log(' ✅ Start Menu shortcut created');

    console.log('✅ Launcher creation completed successfully');
    
    return {
      success: true,
      launcherPath,
      filescopied: copiedCount,
      verified: true
    };
  } catch (error) {
    console.error('❌ Error creating launcher shortcuts:', error);
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
}

/**
 * Verifica que todas las dependencias críticas existan
 */
async function verifyLauncherIntegrity(binDir) {
  const critical = [
    'BloomLauncher.exe',
    'resources.pak',
    path.join('resources', 'app.asar'),
    path.join('locales', 'en-US.pak')
  ];

  const missing = [];

  for (const file of critical) {
    const filePath = path.join(binDir, file);
    if (!await fs.pathExists(filePath)) {
      missing.push(file);
    }
  }

  return {
    success: missing.length === 0,
    missing
  };
}

/**
 * Crea un shortcut de Windows usando VBScript
 */
async function createShortcut(linkPath, targetPath, args, description, iconPath) {
  const vbsScript = `
Set oWS = WScript.CreateObject("WScript.Shell")
sLinkFile = "${linkPath.replace(/\\/g, '\\\\')}"
Set oLink = oWS.CreateShortcut(sLinkFile)
oLink.TargetPath = "${targetPath.replace(/\\/g, '\\\\')}"
oLink.Arguments = "${args}"
oLink.WorkingDirectory = "${path.dirname(targetPath).replace(/\\/g, '\\\\')}"
oLink.Description = "${description}"
oLink.IconLocation = "${iconPath.replace(/\\/g, '\\\\')}"
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
  createShortcut,
  verifyLauncherIntegrity
};