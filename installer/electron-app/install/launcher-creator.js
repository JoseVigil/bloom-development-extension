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

    // 2. Copiar DLLs individuales necesarios para Electron
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
      } else {
        console.warn(` ⚠️  Not found: ${dll}`);
      }
    }

    console.log(` 📊 Individual files: ${copiedCount}/${requiredDlls.length}`);

    // 3. Copiar carpeta locales COMPLETA
    const localesSource = path.join(sourceDir, 'locales');
    const localesDest = path.join(paths.binDir, 'locales');
    
    if (await fs.pathExists(localesSource)) {
      await fs.copy(localesSource, localesDest, { overwrite: true });
      const localesFiles = await fs.readdir(localesDest);
      console.log(` ✅ Locales: ${localesFiles.length} files`);
    } else {
      console.error(' ❌ CRITICAL: locales/ not found');
    }

    // 4. CRÍTICO: Copiar carpeta resources/ con app.asar
    const resourcesSource = path.join(sourceDir, 'resources');
    const resourcesDest = path.join(paths.binDir, 'resources');
    
    console.log(' 📂 Copying resources folder...');
    console.log(`    Source: ${resourcesSource}`);
    console.log(`    Dest:   ${resourcesDest}`);
    
    if (await fs.pathExists(resourcesSource)) {
      // Copiar toda la carpeta resources/
      await fs.copy(resourcesSource, resourcesDest, { 
        overwrite: true,
        errorOnExist: false,
        recursive: true
      });
      
      // Verificar app.asar
      const appAsarPath = path.join(resourcesDest, 'app.asar');
      
      if (await fs.pathExists(appAsarPath)) {
        const stats = await fs.stat(appAsarPath);
        console.log(` ✅ app.asar copied (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
      } else {
        // Si no existe app.asar, buscar en app.asar.unpacked
        const unpackedDir = path.join(resourcesSource, 'app.asar.unpacked');
        if (await fs.pathExists(unpackedDir)) {
          console.log(' 📦 Found app.asar.unpacked, copying...');
          await fs.copy(
            unpackedDir, 
            path.join(resourcesDest, 'app.asar.unpacked'),
            { overwrite: true, recursive: true }
          );
        }
        
        // En desarrollo, copiar directamente el código
        const appDir = path.join(resourcesSource, 'app');
        if (await fs.pathExists(appDir)) {
          console.log(' 📦 Development mode: copying app folder...');
          await fs.copy(
            appDir,
            path.join(resourcesDest, 'app'),
            { overwrite: true, recursive: true }
          );
        } else {
          console.error(' ❌ CRITICAL: No app.asar, app.asar.unpacked, or app/ folder found!');
        }
      }
    } else {
      console.error(' ❌ CRITICAL: resources/ folder not found at:', resourcesSource);
    }

    // 5. Copiar swiftshader (para rendering GPU)
    const swiftshaderSource = path.join(sourceDir, 'swiftshader');
    const swiftshaderDest = path.join(paths.binDir, 'swiftshader');
    
    if (await fs.pathExists(swiftshaderSource)) {
      await fs.copy(swiftshaderSource, swiftshaderDest, { overwrite: true });
      console.log(' ✅ Swiftshader copied');
    }

    // 6. VERIFICACIÓN CRÍTICA
    console.log(' 🔍 Verifying launcher integrity...');
    const verification = await verifyLauncherIntegrity(paths.binDir);
    
    if (!verification.success) {
      console.error(' ❌ Verification failed!');
      console.error('    Missing files:', verification.missing);
      
      // No fallar completamente, pero advertir
      console.warn(' ⚠️  Continuing anyway, launcher might not work properly');
    } else {
      console.log(' ✅ All critical files present');
    }

    // 7. Crear shortcuts con icono correcto
    const iconPath = paths.bloomIcon;
    
    try {
      await createShortcut(
        path.join(app.getPath('desktop'), 'Bloom Nucleus.lnk'),
        launcherPath,
        '--mode=launch',
        'Bloom Nucleus AI Hub',
        iconPath
      );
      console.log(' ✅ Desktop shortcut created');
    } catch (err) {
      console.warn(' ⚠️  Desktop shortcut failed:', err.message);
    }

    try {
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
    } catch (err) {
      console.warn(' ⚠️  Start Menu shortcut failed:', err.message);
    }

    console.log('✅ Launcher creation completed');
    
    return {
      success: true,
      launcherPath,
      filescopied: copiedCount,
      verified: verification.success,
      warnings: verification.missing.length > 0 ? verification.missing : undefined
    };
    
  } catch (error) {
    console.error('❌ Error creating launcher:', error);
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
    path.join('locales', 'en-US.pak')
  ];

  // app.asar O app.asar.unpacked O app/ folder
  const appAsarPath = path.join(binDir, 'resources', 'app.asar');
  const appUnpackedPath = path.join(binDir, 'resources', 'app.asar.unpacked');
  const appFolderPath = path.join(binDir, 'resources', 'app');
  
  const hasAppCode = await fs.pathExists(appAsarPath) || 
                      await fs.pathExists(appUnpackedPath) ||
                      await fs.pathExists(appFolderPath);

  const missing = [];

  for (const file of critical) {
    const filePath = path.join(binDir, file);
    if (!await fs.pathExists(filePath)) {
      missing.push(file);
    }
  }

  if (!hasAppCode) {
    missing.push('resources/app.asar (or app.asar.unpacked or app/)');
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