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
      console.warn(' ⚠️ locales/ folder not found (may not be needed in dev mode)');
    }

    // ✅ 4. FIXED: Copiar resources con manejo correcto de dev/prod
    const resourcesSource = path.join(sourceDir, 'resources');
    const resourcesDest = path.join(paths.binDir, 'resources');
    
    await fs.ensureDir(resourcesDest);
    
    if (await fs.pathExists(resourcesSource)) {
      // En PRODUCCIÓN: Copiar todo (incluyendo app.asar)
      if (app.isPackaged) {
        console.log(' 📦 [PROD] Copying resources folder...');
        await fs.copy(resourcesSource, resourcesDest, { 
          overwrite: true,
          filter: (src) => {
            // Excluir app.asar.unpacked si existe (ya está desempaquetado)
            return !src.includes('app.asar.unpacked');
          }
        });
        
        // Verificar app.asar
        const appAsarPath = path.join(resourcesDest, 'app.asar');
        if (await fs.pathExists(appAsarPath)) {
          const stats = await fs.stat(appAsarPath);
          console.log(` ✅ Resources copied (app.asar: ${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
        } else {
          console.warn(' ⚠️ app.asar not found (expected in packaged build)');
        }
      } else {
        // En DESARROLLO: Crear estructura mínima sin app.asar
        console.log(' 🔧 [DEV] Creating minimal resources structure...');
        
        // Crear un package.json mínimo para el launcher
        const minimalPackage = {
          name: 'bloom-nucleus-launcher',
          version: '1.0.0',
          main: 'launcher-main.js'
        };
        
        await fs.writeJson(
          path.join(resourcesDest, 'package.json'),
          minimalPackage,
          { spaces: 2 }
        );
        
        // Crear launcher-main.js que ejecuta brain profile launch
        const launcherMain = `
const { exec } = require('child_process');
const path = require('path');
const os = require('os');

// Determinar paths según plataforma
const platform = os.platform();
const homeDir = os.homedir();

let pythonPath, brainPath;

if (platform === 'win32') {
  pythonPath = path.join(process.env.LOCALAPPDATA, 'BloomNucleus', 'engine', 'runtime', 'python.exe');
  brainPath = path.join(process.env.LOCALAPPDATA, 'BloomNucleus', 'engine', 'runtime', 'Lib', 'site-packages', 'brain', '__main__.py');
} else if (platform === 'darwin') {
  pythonPath = path.join(homeDir, 'Library', 'Application Support', 'BloomNucleus', 'engine', 'runtime', 'bin', 'python3');
  brainPath = path.join(homeDir, 'Library', 'Application Support', 'BloomNucleus', 'engine', 'runtime', 'lib', 'python3.11', 'site-packages', 'brain', '__main__.py');
} else {
  pythonPath = path.join(homeDir, '.local', 'share', 'BloomNucleus', 'engine', 'runtime', 'bin', 'python3');
  brainPath = path.join(homeDir, '.local', 'share', 'BloomNucleus', 'engine', 'runtime', 'lib', 'python3.11', 'site-packages', 'brain', '__main__.py');
}

// Obtener modo desde args
const args = process.argv.slice(2);
const mode = args.find(arg => arg.startsWith('--mode='))?.split('=')[1] || 'launch';
const onboarding = args.includes('--onboarding');

// Construir comando
let command;
if (onboarding) {
  command = \`"\${pythonPath}" "\${brainPath}" --json profile launch MasterWorker --landing onboarding\`;
} else {
  command = \`"\${pythonPath}" "\${brainPath}" --json profile launch MasterWorker\`;
}

console.log('🚀 Launching Bloom Nucleus...');
console.log('Command:', command);

// Ejecutar
exec(command, (error, stdout, stderr) => {
  if (error) {
    console.error('❌ Launch error:', error);
    process.exit(1);
  }
  
  if (stderr) {
    console.warn('⚠️ stderr:', stderr);
  }
  
  console.log('✅ Launched successfully');
  console.log('Output:', stdout);
  
  // Mantener proceso abierto por 2s para mostrar output
  setTimeout(() => process.exit(0), 2000);
});
`;
        
        await fs.writeFile(
          path.join(resourcesDest, 'launcher-main.js'),
          launcherMain.trim()
        );
        
        console.log(' ✅ Minimal launcher structure created (dev mode)');
      }
    } else {
      console.warn(' ⚠️ resources/ folder not found - creating minimal structure...');
      await fs.ensureDir(resourcesDest);
      
      // Crear estructura mínima
      const minimalPackage = {
        name: 'bloom-nucleus-launcher',
        version: '1.0.0',
        main: 'index.js'
      };
      
      await fs.writeJson(
        path.join(resourcesDest, 'package.json'),
        minimalPackage,
        { spaces: 2 }
      );
    }

    // 5. Copiar swiftshader (opcional pero recomendado)
    const swiftshaderSource = path.join(sourceDir, 'swiftshader');
    const swiftshaderDest = path.join(paths.binDir, 'swiftshader');
    
    if (await fs.pathExists(swiftshaderSource)) {
      await fs.copy(swiftshaderSource, swiftshaderDest, { overwrite: true });
      console.log(' ✅ Swiftshader folder copied');
    }

    // ✅ 6. FIXED: Verificación más flexible
    console.log(' 🔍 Verifying launcher integrity...');
    const canExecute = await verifyLauncherIntegrity(paths.binDir, app.isPackaged);
    
    if (!canExecute.success) {
      console.warn(' ⚠️ Some dependencies missing:', canExecute.missing);
      console.warn(' 💡 Launcher may still work with minimal setup');
      // NO fallar la instalación por esto
    } else {
      console.log(' ✅ All critical dependencies present');
    }

    // 7. Crear shortcuts
    const iconPath = paths.bloomIcon || path.join(__dirname, '..', 'assets', 'bloom.ico');
    
    try {
      await createShortcut(
        path.join(os.homedir(), 'Desktop', 'Bloom Nucleus.lnk'),
        launcherPath,
        '--mode=launch',
        'Bloom Nucleus AI Hub',
        iconPath
      );
      console.log(' ✅ Desktop shortcut created');
    } catch (err) {
      console.warn(' ⚠️ Could not create desktop shortcut:', err.message);
    }

    try {
      const startMenuPath = path.join(
        os.homedir(),
        'AppData',
        'Roaming',
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
      console.warn(' ⚠️ Could not create start menu shortcut:', err.message);
    }

    console.log('✅ Launcher creation completed successfully');
    
    return {
      success: true,
      launcherPath,
      filesCopied: copiedCount,
      verified: canExecute.success
    };
  } catch (error) {
    console.error('❌ Error creating launcher:', error);
    
    // ✅ NO fallar la instalación completa por el launcher
    console.warn('⚠️ Launcher creation failed, but installation can continue');
    console.warn('💡 Use Brain CLI directly: brain profile launch MasterWorker');
    
    return {
      success: false,
      error: error.message,
      stack: error.stack,
      canContinue: true
    };
  }
}

/**
 * Verifica que las dependencias críticas existan
 * ✅ FIXED: Más flexible para dev/prod
 */
async function verifyLauncherIntegrity(binDir, isPackaged) {
  const critical = [
    'BloomLauncher.exe',
    'resources.pak'
  ];
  
  // Solo verificar app.asar en producción
  if (isPackaged) {
    critical.push(path.join('resources', 'app.asar'));
  } else {
    critical.push(path.join('resources', 'package.json'));
  }

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