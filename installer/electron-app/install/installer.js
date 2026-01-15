// installer.js - REFACTORED: Electron as Simple File Copier + Chromium
// ============================================================================
// INSTALLATION ORDER:
// 1. Cleanup (services + processes)
// 2. Create directories
// 3. Install Chromium (NEW) ← CRITICAL DEPENDENCY
// 4. Copy extension template to bin/extension/
// 5. Install runtime (Python engine)
// 6. Copy binaries (brain.exe, bloom-host.exe)
// 7. Install and start Windows service
// 8. HANDOFF TO BRAIN: Create profile
// 9. HANDOFF TO BRAIN: Launch profile for validation
// ============================================================================

const path = require('path');
const fs = require('fs-extra');
const { paths } = require('../config/paths');
const { isElevated, relaunchAsAdmin } = require('../core/admin-utils');
const { BrowserWindow, app } = require('electron');
const { execFile, spawn } = require('child_process');

// Importers
const { 
  cleanupOldServices, 
  installWindowsService, 
  startService, 
  killAllBloomProcesses 
} = require('./service-installer');
const { installRuntime } = require('./runtime-installer');
const { installExtension } = require('./extension-installer');
const { installChromium } = require('./chromium-installer'); // 🆕 NEW IMPORT

const APP_VERSION = app ? app.getVersion() : process.env.npm_package_version || '1.0.0';

// ============================================================================
// PROGRESS TRACKING
// ============================================================================
function emitProgress(mainWindow, stepKey, detail = '') {
  const step = INSTALLATION_STEPS.find(s => s.key === stepKey);
  if (!step) return;

  const stepIndex = INSTALLATION_STEPS.indexOf(step);
  const totalSteps = INSTALLATION_STEPS.length;

  mainWindow?.webContents.send('installation-progress', {
    step: stepIndex + 1,
    total: totalSteps,
    percentage: step.percentage,
    message: step.message,
    detail: detail || ''
  });

  console.log(`[${step.percentage}%] ${step.message}${detail ? ' - ' + detail : ''}`);
}

// ============================================================================
// INSTALLATION STEPS (UPDATED WITH CHROMIUM)
// ============================================================================
const INSTALLATION_STEPS = [
  { key: 'cleanup', percentage: 0, message: '🧹 Cleaning previous installation...' },
  { key: 'directories', percentage: 8, message: '📁 Creating directory structure...' },
  { key: 'chromium', percentage: 20, message: '🌐 Installing Chromium browser...' }, // 🆕 NEW STEP
  { key: 'extension-template', percentage: 35, message: '🧩 Copying extension template...' },
  { key: 'brain-runtime', percentage: 50, message: '⚙️ Installing Brain runtime (Python)...' },
  { key: 'binaries', percentage: 65, message: '🔧 Deploying binaries...' },
  { key: 'service', percentage: 78, message: '🚀 Installing Windows service...' },
  { key: 'brain-handoff', percentage: 88, message: '🤝 Handing off to Brain for profile setup...' },
  { key: 'validation', percentage: 95, message: '✅ Validating installation...' },
  { key: 'complete', percentage: 100, message: '✅ Installation completed successfully!' }
];

// ============================================================================
// STEP FUNCTIONS (EXISTING - NO CHANGES)
// ============================================================================

/**
 * Create base directory structure
 */
async function createDirectories() {
  const dirs = [
    paths.bloomBase,
    paths.engineDir,
    paths.runtimeDir,
    paths.binDir,
    path.join(paths.binDir, 'brain'),
    path.join(paths.binDir, 'native'),
    path.join(paths.binDir, 'extension'),
    paths.configDir,
    paths.profilesDir,
    paths.logsDir
  ];
  
  for (const d of dirs) {
    await fs.ensureDir(d);
  }
  
  console.log('✅ Directory structure created');
}

/**
 * Clean native directory preserving structure
 */
async function cleanNativeDir() {
  console.log('\n🧹 CLEANING NATIVE DIRECTORY');
  try {
    const nativeDir = path.join(paths.binDir, 'native');
    if (await fs.pathExists(nativeDir)) {
      const files = await fs.readdir(nativeDir);
      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (['.exe', '.json', '.dll', '.log'].includes(ext)) {
          await fs.remove(path.join(nativeDir, file));
        }
      }
    } else {
      await fs.ensureDir(nativeDir);
    }
    console.log('✅ Native directory cleaned');
  } catch (e) {
    console.warn('⚠️ Could not clean native dir completely:', e.message);
  }
}

/**
 * Copy extension as TEMPLATE to bin/extension/
 */
async function deployExtensionTemplate() {
  console.log('\n🧩 DEPLOYING EXTENSION TEMPLATE');
  
  const templateDir = path.join(paths.binDir, 'extension');
  
  if (await fs.pathExists(templateDir)) {
    await fs.emptyDir(templateDir);
  }
  
  await installExtension();
  
  console.log('✅ Extension template deployed to:', templateDir);
  return { success: true };
}

/**
 * Copy binaries to unified structure
 */
async function deployBinaries() {
  console.log('\n🔧 DEPLOYING BINARIES');
  
  const brainDest = path.join(paths.binDir, 'brain');
  const nativeDest = path.join(paths.binDir, 'native');
  
  // 1. Copy Brain
  console.log('📦 Copying Brain service...');
  console.log(`   Source: ${paths.brainSource}`);
  console.log(`   Dest:   ${brainDest}`);
  
  if (!await fs.pathExists(paths.brainSource)) {
    throw new Error(`Brain source not found at: ${paths.brainSource}\n💡 Run 'python scripts/build_brain.py'`);
  }
  
  await fs.copy(paths.brainSource, brainDest, { overwrite: true });
  
  const brainExePath = path.join(brainDest, 'brain.exe');
  if (!await fs.pathExists(brainExePath)) {
    throw new Error(`brain.exe not found after copy: ${brainExePath}`);
  }
  console.log('  ✅ Brain service deployed');
  
  // 2. Copy Native Host + DLLs
  console.log('📦 Copying Native Host + DLLs...');
  
  const nativeSourceDir = path.dirname(paths.nativeSource);
  console.log(`   Source Dir: ${nativeSourceDir}`);
  console.log(`   Dest Dir:   ${nativeDest}`);
  
  if (!await fs.pathExists(nativeSourceDir)) {
    throw new Error(`Native source directory not found at: ${nativeSourceDir}`);
  }
  
  const sourceFiles = await fs.readdir(nativeSourceDir);
  
  let copiedFiles = [];
  for (const file of sourceFiles) {
    const ext = path.extname(file).toLowerCase();
    if (['.exe', '.dll'].includes(ext)) {
      const sourcePath = path.join(nativeSourceDir, file);
      const destPath = path.join(nativeDest, file);
      
      await fs.copy(sourcePath, destPath, { overwrite: true });
      copiedFiles.push(file);
      console.log(`  ✅ Copied: ${file}`);
    }
  }
  
  console.log(`  ✅ Native host deployed (${copiedFiles.length} files)`);
  
  const hostDestPath = path.join(nativeDest, 'bloom-host.exe');
  if (!await fs.pathExists(hostDestPath)) {
    throw new Error(`bloom-host.exe not found after copy: ${hostDestPath}`);
  }
  
  // 3. Copy NSSM
  console.log('📦 Copying NSSM...');
  const nssmSource = paths.nssmExe;
  const nssmDest = path.join(nativeDest, 'nssm.exe');
  
  if (!await fs.pathExists(nssmSource)) {
    throw new Error(`NSSM not found at: ${nssmSource}`);
  }
  
  await fs.copy(nssmSource, nssmDest, { overwrite: true });
  console.log('  ✅ NSSM deployed');
  
  console.log('✅ All binaries deployed');
}

/**
 * BRAIN HANDOFF: Create profile
 */
async function createProfileViaBrain() {
  console.log('\n🤝 HANDING OFF TO BRAIN: Creating Master Profile');
  
  return new Promise((resolve, reject) => {
    const brainExe = path.join(paths.binDir, 'brain', 'brain.exe');
    
    if (!fs.existsSync(brainExe)) {
      return reject(new Error(`Brain executable not found at: ${brainExe}`));
    }

    const args = ['--json', 'profile', 'create', 'MasterWorker'];
    
    console.log(`Executing: "${brainExe}" ${args.join(' ')}`);

    const child = spawn(brainExe, args, {
      cwd: path.dirname(brainExe),
      windowsHide: false,
      env: { 
        ...process.env,
        LOCALAPPDATA: process.env.LOCALAPPDATA,
        BLOOM_EXTENSION_TEMPLATE: path.join(paths.binDir, 'extension'),
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
        PYTHONLEGACYWINDOWSSTDIO: '0',
        PYTHONUNBUFFERED: '1'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code !== 0 && !stdout) {
        return reject(new Error(`Brain CLI failed: ${stderr}`));
      }

      try {
        const jsonStart = stdout.indexOf('{');
        if (jsonStart === -1) {
          throw new Error(`No JSON in output: ${stdout}`);
        }
        
        const jsonStr = stdout.substring(jsonStart, stdout.lastIndexOf('}') + 1);
        const response = JSON.parse(jsonStr);
        
        const profileData = response.data || response;
        const profileId = profileData.id || profileData.uuid;
        
        if (!profileId) {
          throw new Error('Profile ID missing');
        }
        
        console.log(`✅ Profile Created: ${profileId}`);
        
        resolve({
          profileId,
          alias: profileData.alias,
          path: profileData.path,
          netLogPath: profileData.net_log_path
        });
        
      } catch (parseError) {
        console.error("❌ Parse Error:", stdout);
        
        if (stdout.includes('MasterWorker') || stdout.includes('already exists')) {
          return resolve({ profileId: "MasterWorker", fallback: true });
        }
        
        reject(new Error(`Parse failed: ${parseError.message}`));
      }
    });
  });
}

/**
 * BRAIN HANDOFF: Validate installation via profile launch
 */
async function validateInstallationViaBrain(profileId) {
  console.log('\n✅ VALIDATION: Launching profile for discovery');
  
  return new Promise((resolve, reject) => {
    const brainExe = path.join(paths.binDir, 'brain', 'brain.exe');
    
    if (!fs.existsSync(brainExe)) {
      return reject(new Error(`Brain executable not found at: ${brainExe}`));
    }

    const args = ['profile', 'launch', profileId, '--discovery'];
    
    console.log(`Executing: "${brainExe}" ${args.join(' ')}`);

    const child = spawn(brainExe, args, {
      cwd: path.dirname(brainExe),
      windowsHide: false,
      env: { 
        ...process.env,
        LOCALAPPDATA: process.env.LOCALAPPDATA,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
        PYTHONLEGACYWINDOWSSTDIO: '0'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
      console.log('[Brain]', data.toString().trim());
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
      console.error('[Brain Error]', data.toString().trim());
    });

    child.on('close', (code) => {
      if (code !== 0) {
        console.error(`❌ Validation failed with code ${code}`);
        console.error('Stderr:', stderr);
        return reject(new Error(`Validation failed: ${stderr || 'Unknown error'}`));
      }

      console.log('✅ Profile launched successfully');
      console.log('ℹ️ Chrome should be running with the extension loaded');
      console.log('ℹ️ Check logs for handshake confirmation');
      
      resolve({
        success: true,
        stdout,
        stderr
      });
    });

    child.on('error', (error) => {
      reject(new Error(`Failed to launch validation: ${error.message}`));
    });
  });
}

// ============================================================================
// FULL INSTALLATION SEQUENCE (UPDATED WITH CHROMIUM)
// ============================================================================
async function runFullInstallation(mainWindow = null) {
  // Check admin privileges
  if (process.platform === 'win32' && !(await isElevated())) {
    console.log('⚠️ Admin privileges required.');
    relaunchAsAdmin();
    return { success: false, relaunching: true, message: 'Relaunching as Admin...' };
  }

  console.log(`\n=== STARTING BLOOM NUCLEUS INSTALLATION ===\n`);

  try {
    // ========================================================================
    // STEP 1: CLEANUP
    // ========================================================================
    emitProgress(mainWindow, 'cleanup', 'Stopping services and killing processes');
    await cleanupOldServices();
    await killAllBloomProcesses();
    await cleanNativeDir();
    
    // ========================================================================
    // STEP 2: CREATE DIRECTORY STRUCTURE
    // ========================================================================
    emitProgress(mainWindow, 'directories', 'Creating unified directory structure');
    await createDirectories();

    // ========================================================================
    // STEP 3: INSTALL CHROMIUM (🆕 NEW CRITICAL STEP)
    // ========================================================================
    emitProgress(mainWindow, 'chromium', 'Extracting Chromium browser (~300MB, may take 30s)');
    
    const chromiumResult = await installChromium();
    
    if (!chromiumResult.success) {
      throw new Error(`Chromium installation failed: ${chromiumResult.error}`);
    }
    
    console.log('✅ Chromium installed successfully at:', chromiumResult.chromiumPath);
    
    // ========================================================================
    // STEP 4: DEPLOY EXTENSION TEMPLATE
    // ========================================================================
    emitProgress(mainWindow, 'extension-template', 'Copying extension template');
    await deployExtensionTemplate();
    
    // ========================================================================
    // STEP 5: INSTALL PYTHON RUNTIME
    // ========================================================================
    emitProgress(mainWindow, 'brain-runtime', 'Installing Python runtime');
    await installRuntime();
    
    // ========================================================================
    // STEP 6: DEPLOY BINARIES
    // ========================================================================
    emitProgress(mainWindow, 'binaries', 'Deploying Brain and Native Host');
    await deployBinaries();
    
    // ========================================================================
    // STEP 7: INSTALL AND START SERVICE
    // ========================================================================
    emitProgress(mainWindow, 'service', 'Installing Windows service');
    await installWindowsService();
    const started = await startService();
    if (!started) {
      throw new Error("Failed to start Brain service");
    }
    
    // ========================================================================
    // STEP 8: BRAIN HANDOFF - PROFILE CREATION
    // ========================================================================
    emitProgress(mainWindow, 'brain-handoff', 'Brain creating profile and configuring network');
    const profileInfo = await createProfileViaBrain();
    console.log('✅ Profile created:', profileInfo);
    
    // ========================================================================
    // STEP 9: VALIDATION VIA BRAIN
    // ========================================================================
    emitProgress(mainWindow, 'validation', 'Validating installation via profile launch');
    
    try {
      await validateInstallationViaBrain(profileInfo.profileId);
      console.log('✅ Installation validated successfully');
    } catch (validationError) {
      console.warn('⚠️ Validation warning:', validationError.message);
      console.log('ℹ️ Installation complete, but validation had issues');
    }
    
    // ========================================================================
    // STEP 10: SAVE CONFIG
    // ========================================================================
    console.log('💾 Saving installer config...');
    const configPath = paths.configFile;
    const finalConfig = {
      version: APP_VERSION,
      installed_at: new Date().toISOString(),
      installer_mode: 'simplified',
      masterProfileId: profileInfo.profileId,
      chromium: {
        path: chromiumResult.chromiumPath,
        version: chromiumResult.version,
        size: chromiumResult.size
      },
      note: 'Profiles and network configuration managed by Brain CLI'
    };
    await fs.writeJson(configPath, finalConfig, { spaces: 2 });

    // ========================================================================
    // COMPLETION
    // ========================================================================
    emitProgress(mainWindow, 'complete', 'Installation completed successfully');
    
    // Create launcher shortcuts
    try {
      const { createLauncherShortcuts } = require('./launcher-creator');
      const launcherResult = await createLauncherShortcuts();
      console.log('✅ Launcher shortcuts created:', launcherResult.success);
    } catch (launcherError) {
      console.warn('⚠️ Could not create launcher shortcuts:', launcherError.message);
    }

    console.log('\n=== INSTALLATION COMPLETED SUCCESSFULLY ===\n');
    console.log('📍 Installation structure:');
    console.log(`   Base: ${paths.bloomBase}`);
    console.log(`   Chromium: ${chromiumResult.chromiumPath}`);
    console.log(`   Brain: ${path.join(paths.binDir, 'brain', 'brain.exe')}`);
    console.log(`   Native Host: ${path.join(paths.binDir, 'native', 'bloom-host.exe')}`);
    console.log(`   Extension Template: ${path.join(paths.binDir, 'extension')}`);
    console.log(`   Profiles: ${paths.profilesDir}`);
    console.log(`   Config: ${paths.configDir}`);
    console.log('\n💡 Use "brain profile list" to see profile details');
    console.log('💡 Use "brain profile launch MasterWorker" to start working');

    return {
      success: true,
      profileId: profileInfo.profileId,
      profilePath: profileInfo.path,
      chromiumPath: chromiumResult.chromiumPath,
      version: APP_VERSION
    };

  } catch (error) {
    console.error('\n❌ FATAL ERROR IN INSTALLATION:', error);
    
    // Cleanup on failure
    await cleanupOldServices().catch(() => {});
    
    return { 
      success: false, 
      error: error.message,
      stack: error.stack 
    };
  }
}

module.exports = {
  runFullInstallation,
  createDirectories,
  cleanNativeDir,
  createProfileViaBrain,
  validateInstallationViaBrain
};