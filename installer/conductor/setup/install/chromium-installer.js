// chromium-installer.js - Chromium Binary Deployment (FIXED)
// ============================================================================
// RESPONSIBILITY: Extract and deploy Chromium browser to bin/chrome-{platform}/
// - Windows: bin/chrome-win/chrome.exe
// - macOS: bin/chrome-mac/Chromium.app/Contents/MacOS/Chromium
// - Validates executable after extraction
// - Handles platform-specific permissions
// ============================================================================

const fs = require('fs-extra');
const path = require('path');
const { paths, getResourcePath } = require('../config/paths');
const os = require('os');

let extract;
try {
  extract = require('extract-zip');
} catch (e) {
  console.warn('⚠️ extract-zip not found, will use fallback method');
  extract = null;
}

const platform = os.platform();

// ============================================================================
// CHROMIUM PATHS
// ============================================================================

function getChromiumPaths() {
  const isWindows = platform === 'win32';
  const isMac = platform === 'darwin';
  
  if (isWindows) {
    return {
      zipPath: getResourcePath('chrome-win'),
      destDir: path.join(paths.binDir, 'chrome-win'),
      exePath: path.join(paths.binDir, 'chrome-win', 'chrome.exe'),
      zipName: 'chrome-win.zip'
    };
  } else if (isMac) {
    return {
      zipPath: getResourcePath('chrome-mac'),
      destDir: path.join(paths.binDir, 'chrome-mac'),
      exePath: path.join(paths.binDir, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
      zipName: 'chrome-mac.zip'
    };
  } else {
    return {
      zipPath: getResourcePath('chrome-linux'),
      destDir: path.join(paths.binDir, 'chrome-linux'),
      exePath: path.join(paths.binDir, 'chrome-linux', 'chrome'),
      zipName: 'chrome-linux.tar.xz',
      isTarXz: true
    };
  }
}

// ============================================================================
// EXTRACTION FUNCTIONS
// ============================================================================

async function extractWithLibrary(zipPath, destDir) {
  console.log('📦 Extracting with extract-zip library...');
  
  if (!extract) {
    throw new Error('extract-zip library not available');
  }
  
  await extract(zipPath, { dir: path.resolve(destDir) });
  console.log('✅ Extraction completed');
}

async function extractWithNative(zipPath, destDir) {
  console.log('📦 Extracting with native unzip...');
  
  const { execFile } = require('child_process');
  const { promisify } = require('util');
  const execFileAsync = promisify(execFile);
  
  if (platform === 'win32') {
    const psCommand = `Expand-Archive -Path "${zipPath}" -DestinationPath "${destDir}" -Force`;
    
    try {
      await execFileAsync('powershell.exe', ['-Command', psCommand], {
        windowsHide: true,
        maxBuffer: 50 * 1024 * 1024
      });
    } catch (error) {
      throw new Error(`PowerShell extraction failed: ${error.message}`);
    }
  } else {
    try {
      await execFileAsync('unzip', ['-q', '-o', zipPath, '-d', destDir], {
        maxBuffer: 50 * 1024 * 1024
      });
    } catch (error) {
      throw new Error(`Unzip failed: ${error.message}`);
    }
  }
  
  console.log('✅ Native extraction completed');
}

async function extractWithTarXz(archivePath, destDir) {
  console.log('📦 Extracting with tar xz...');
  const { execFile } = require('child_process');
  const { promisify } = require('util');
  const execFileAsync = promisify(execFile);
  await execFileAsync('tar', ['-xJf', archivePath, '-C', destDir], {
    maxBuffer: 500 * 1024 * 1024
  });
  console.log('✅ tar.xz extraction completed');
}

async function extractChromiumZip(zipPath, tempDir) {
  console.log(`\n🌐 EXTRACTING CHROMIUM`);
  console.log(`   Source: ${zipPath}`);
  console.log(`   Temp: ${tempDir}`);
  
  await fs.ensureDir(tempDir);

  // Linux usa tar.xz; win/mac usan zip
  if (platform === 'linux') {
    await extractWithTarXz(zipPath, tempDir);
    return;
  }
  
  try {
    if (extract) {
      await extractWithLibrary(zipPath, tempDir);
    } else {
      await extractWithNative(zipPath, tempDir);
    }
  } catch (error) {
    console.error('❌ Primary extraction method failed, trying fallback...');
    
    if (extract) {
      await extractWithNative(zipPath, tempDir);
    } else {
      throw error;
    }
  }
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

async function setExecutablePermissions(exePath) {
  if (platform === 'win32') {
    return;
  }
  
  console.log('🔓 Setting executable permissions...');
  
  try {
    await fs.chmod(exePath, 0o755);
    
    if (platform === 'linux') {
      // Asset map: chrome-sandbox requiere chmod 4755 (setuid root) para sandbox.
      // Si falla (sin privilegios), loggear warning y continuar — el browser puede
      // arrancar con --no-sandbox como fallback documentado.
      const sandboxPath = path.join(path.dirname(exePath), 'chrome-sandbox');
      if (await fs.pathExists(sandboxPath)) {
        try {
          const { execFile } = require('child_process');
          const { promisify } = require('util');
          const execFileAsync = promisify(execFile);
          await execFileAsync('sudo', ['chown', 'root:root', sandboxPath]);
          await execFileAsync('sudo', ['chmod', '4755', sandboxPath]);
          console.log('✅ chrome-sandbox setuid root applied');
        } catch (e) {
          console.warn('⚠️ chrome-sandbox chmod 4755 failed (no sudo?) — browser will require --no-sandbox:', e.message);
        }
      }
    }

    if (platform === 'darwin') {
      const helpersDir = path.join(path.dirname(exePath), '..', '..', 'Helpers');
      
      if (await fs.pathExists(helpersDir)) {
        const helpers = await fs.readdir(helpersDir);
        
        for (const helper of helpers) {
          const helperPath = path.join(helpersDir, helper);
          const stats = await fs.stat(helperPath);
          
          if (stats.isFile() || stats.isDirectory()) {
            await fs.chmod(helperPath, 0o755).catch(() => {});
          }
        }
      }
    }
    
    console.log('✅ Permissions set successfully');
  } catch (error) {
    console.warn('⚠️ Could not set all permissions:', error.message);
  }
}

async function validateChromiumExecutable(exePath) {
  console.log('\n🔍 VALIDATING CHROMIUM EXECUTABLE');
  console.log(`   Path: ${exePath}`);
  
  if (!await fs.pathExists(exePath)) {
    throw new Error(`Chromium executable not found at: ${exePath}`);
  }
  
  console.log('✅ Executable file exists');
  
  try {
    await fs.access(exePath, fs.constants.R_OK);
    console.log('✅ Executable is readable');
  } catch (error) {
    throw new Error(`Chromium executable is not accessible: ${error.message}`);
  }
  
  if (platform !== 'win32') {
    try {
      await fs.access(exePath, fs.constants.X_OK);
      console.log('✅ Executable has execute permission');
    } catch (error) {
      console.warn('⚠️ Execute permission check failed, attempting to fix...');
      await setExecutablePermissions(exePath);
      
      await fs.access(exePath, fs.constants.X_OK);
      console.log('✅ Execute permission fixed');
    }
  }
  
  const stats = await fs.stat(exePath);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
  console.log(`✅ Executable size: ${sizeMB} MB`);
  
  if (stats.size < 50 * 1024 * 1024) {
    console.warn('⚠️ Warning: Chromium executable seems unusually small');
  }
  
  return { success: true, size: stats.size, sizeMB };
}

async function runSmokeTest(exePath) {
  console.log('\n🔬 RUNNING SMOKE TEST');
  
  const { execFile } = require('child_process');
  const { promisify } = require('util');
  const execFileAsync = promisify(execFile);
  
  // Creamos una ruta temporal para el test para que no intente usar el perfil del sistema
  const tempProfile = path.join(os.tmpdir(), `bloom_smoke_${Date.now()}`);
  
  try {
    // AÑADIMOS LOS ARGUMENTOS DE SILENCIO AQUÍ
    const { stdout, stderr } = await execFileAsync(exePath, [
      '--version',
      `--user-data-dir=${tempProfile}`, // Evita el error de "Preferences"
      '--no-first-run',                // Salta el wizard
      '--no-default-browser-check',     // Salta el aviso de navegador predeterminado
      '--headless'                      // No abre ventana (más seguro para un test)
    ], {
      timeout: 10000,
      windowsHide: true
    });
    
    // Limpiamos el perfil temporal después del test
    await fs.remove(tempProfile).catch(() => {});
    
    const version = stdout.trim() || stderr.trim();
    console.log(`✅ Chromium version: ${version}`);
    
    return { success: true, version };
  } catch (error) {
    console.warn('⚠️ Smoke test failed (non-fatal):', error.message);
    // Intentar limpiar por si acaso
    await fs.remove(tempProfile).catch(() => {});
    return { success: false, error: error.message };
  }
}

// ============================================================================
// CLEANUP FUNCTIONS
// ============================================================================

async function cleanChromiumDir(destDir) {
  console.log('\n🧹 CLEANING CHROMIUM DIRECTORY');
  
  if (await fs.pathExists(destDir)) {
    console.log(`   Removing: ${destDir}`);
    
    try {
      await fs.remove(destDir);
      console.log('✅ Old Chromium removed');
    } catch (error) {
      console.warn('⚠️ Could not fully clean directory:', error.message);
      
      try {
        await fs.emptyDir(destDir);
        console.log('✅ Directory emptied');
      } catch (e) {
        throw new Error(`Cannot clean Chromium directory: ${e.message}`);
      }
    }
  } else {
    console.log('   No existing installation found');
  }
  
  await fs.ensureDir(destDir);
}

async function cleanupOnFailure(destDir) {
  console.log('\n🧹 CLEANUP ON FAILURE');
  
  try {
    await fs.remove(destDir);
    console.log('✅ Partial extraction cleaned up');
  } catch (error) {
    console.error('❌ Could not cleanup:', error.message);
  }
}

// ============================================================================
// MAIN INSTALLATION FUNCTION
// ============================================================================

async function installChromium() {
  console.log('\n🌐 CHROMIUM INSTALLATION');
  console.log('='.repeat(60));
  
  const chromiumPaths = getChromiumPaths();
  const { zipPath, destDir, exePath, zipName } = chromiumPaths;
  
  console.log(`\n📋 Platform: ${platform}`);
  console.log(`📋 Archive: ${zipName}`);
  
  try {
    // STEP 1: Locate source ZIP
    console.log('\n📍 STEP 1: LOCATING SOURCE ZIP');
    console.log(`   Looking for: ${zipPath}`);
    
    if (!await fs.pathExists(zipPath)) {
      throw new Error(
        `Chromium ZIP not found at: ${zipPath}\n` +
        `💡 Expected location:\n` +
        `   Development: installer/chrome/${zipName}\n` +
        `   Production: resources/chrome/${zipName}`
      );
    }
    
    const zipStats = await fs.stat(zipPath);
    const zipSizeMB = (zipStats.size / 1024 / 1024).toFixed(2);
    console.log(`✅ ZIP found: ${zipSizeMB} MB`);
    
    if (zipStats.size < 50 * 1024 * 1024) {
      throw new Error(`ZIP file seems corrupted (too small: ${zipSizeMB} MB)`);
    }
    
    // STEP 2: Clean destination directory
    console.log('\n📍 STEP 2: PREPARING DESTINATION');
    await cleanChromiumDir(destDir);
    
    // STEP 3: Extract ZIP to temp location
    console.log('\n📍 STEP 3: EXTRACTING CHROMIUM');
    const tempDir = path.join(paths.binDir, '_chromium_temp');
    await fs.ensureDir(tempDir);
    
    try {
      await extractChromiumZip(zipPath, tempDir);
      
      // Check extracted structure
      const extractedContents = await fs.readdir(tempDir);
      console.log(`   Extracted contents: ${extractedContents.join(', ')}`);
      
      // Detect the actual root folder dynamically — tar archives (especially
      // ungoogled-chromium) use versioned names like
      // "ungoogled-chromium-146.0.7680.177-1-x86_64_linux/" instead of
      // the generic "chrome-linux/" we used to hardcode.
      const subDirs = [];
      for (const item of extractedContents) {
        const itemStat = await fs.stat(path.join(tempDir, item));
        if (itemStat.isDirectory()) subDirs.push(item);
      }

      if (subDirs.length === 1) {
        // Normal case: archive has exactly one root folder (e.g. ungoogled-chromium-*)
        console.log(`   Found single root folder: ${subDirs[0]}`);
        await fs.move(path.join(tempDir, subDirs[0]), destDir, { overwrite: true });
      } else {
        // Files/multiple dirs sitting directly in temp — move each item individually
        // (avoids fs.move(tempDir→destDir) swapping the directory node itself)
        console.log(`   No single root folder, moving ${extractedContents.length} items individually`);
        for (const item of extractedContents) {
          await fs.move(path.join(tempDir, item), path.join(destDir, item), { overwrite: true });
        }
      }
      
      // Clean temp
      await fs.remove(tempDir).catch(() => {});
      
    } catch (extractError) {
      await fs.remove(tempDir).catch(() => {});
      throw extractError;
    }
    
    // STEP 4: Set permissions (macOS/Linux)
    if (platform !== 'win32') {
      console.log('\n📍 STEP 4: SETTING PERMISSIONS');
      await setExecutablePermissions(exePath);
    }
    
    // STEP 5: Validate executable
    console.log('\n📍 STEP 5: VALIDATING EXECUTABLE');
    const validation = await validateChromiumExecutable(exePath);
    
    // STEP 6: Optional smoke test
    console.log('\n📍 STEP 6: SMOKE TEST (OPTIONAL)');
    const smokeTest = await runSmokeTest(exePath);
    
    // SUCCESS
    console.log('\n' + '='.repeat(60));
    console.log('✅ CHROMIUM INSTALLED SUCCESSFULLY');
    console.log('='.repeat(60));
    console.log(`\n📍 Chromium Location: ${exePath}`);
    console.log(`📦 Size: ${validation.sizeMB} MB`);
    if (smokeTest.success) {
      console.log(`📖 Version: ${smokeTest.version}`);
    }
    console.log('\n💡 Chromium is now ready for profile launches');
    
    return {
      success: true,
      chromiumPath: exePath,
      destDir,
      size: validation.size,
      version: smokeTest.version || 'unknown'
    };
    
  } catch (error) {
    console.error('\n❌ CHROMIUM INSTALLATION FAILED');
    console.error(`Error: ${error.message}`);
    
    await cleanupOnFailure(destDir);
    
    // Re-throw so installer.js failMilestone() catches it and doesn't mark
    // chromium milestone as completed when it actually failed.
    throw error;
  }
}

// ============================================================================
// VERIFICATION FUNCTIONS
// ============================================================================

async function isChromiumInstalled() {
  const { exePath } = getChromiumPaths();
  
  try {
    if (await fs.pathExists(exePath)) {
      await fs.access(exePath, fs.constants.R_OK);
      return { installed: true, path: exePath };
    }
  } catch (error) {
    // File exists but not accessible
  }
  
  return { installed: false };
}

async function getChromiumInfo() {
  const status = await isChromiumInstalled();
  
  if (!status.installed) {
    return null;
  }
  
  const stats = await fs.stat(status.path);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
  
  let version = 'unknown';
  try {
    const smokeTest = await runSmokeTest(status.path);
    if (smokeTest.success) {
      version = smokeTest.version;
    }
  } catch (e) {
    // Ignore
  }
  
  return {
    path: status.path,
    size: stats.size,
    sizeMB,
    version
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  installChromium,
  isChromiumInstalled,
  getChromiumInfo,
  validateChromiumExecutable,
  runSmokeTest,
  getChromiumPaths,
  cleanChromiumDir
};