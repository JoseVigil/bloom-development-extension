// installer.js - REFACTORED: Electron as Simple File Copier
// ============================================================================
// SIMPLIFIED INSTALLATION ORDER:
// 1. Cleanup (services + processes)
// 2. Create directories
// 3. Copy extension template to bin/extension/
// 4. Install runtime (Python engine)
// 5. Copy binaries (brain.exe to bin/brain/, bloom-host.exe to bin/native/)
// 6. Install and start Windows service
// 7. HANDOFF TO BRAIN: Execute `brain profile create MasterWorker --json`
// 8. HANDOFF TO BRAIN: Execute `brain profile launch MasterWorker --discovery`
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
// INSTALLATION STEPS
// ============================================================================
const INSTALLATION_STEPS = [
  { key: 'cleanup', percentage: 0, message: '🧹 Cleaning previous installation...' },
  { key: 'directories', percentage: 10, message: '📁 Creating directory structure...' },
  { key: 'extension-template', percentage: 25, message: '🧩 Copying extension template...' },
  { key: 'brain-runtime', percentage: 40, message: '⚙️ Installing Brain runtime (Python)...' },
  { key: 'binaries', percentage: 55, message: '🔧 Deploying binaries...' },
  { key: 'service', percentage: 70, message: '🚀 Installing Windows service...' },
  { key: 'brain-handoff', percentage: 85, message: '🤝 Handing off to Brain for profile setup...' },
  { key: 'validation', percentage: 95, message: '✅ Validating installation...' },
  { key: 'complete', percentage: 100, message: '✅ Installation completed successfully!' }
];

// ============================================================================
// STEP FUNCTIONS
// ============================================================================

/**
 * Create base directory structure
 * New structure:
 * - bin/brain/        (brain.exe + _internal)
 * - bin/native/       (bloom-host.exe)
 * - bin/extension/    (extension template - copied per profile by Brain)
 * - config/           (profiles.json managed by Brain)
 * - profiles/[UUID]/  (created by Brain)
 * - logs/             (general logs)
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
 * Brain will copy this per-profile to profiles/[UUID]/extension/
 */
async function deployExtensionTemplate() {
  console.log('\n🧩 DEPLOYING EXTENSION TEMPLATE');
  
  const templateDir = path.join(paths.binDir, 'extension');
  
  // Clean template directory
  if (await fs.pathExists(templateDir)) {
    await fs.emptyDir(templateDir);
  }
  
  // Copy extension source to template location
  await installExtension();
  
  console.log('✅ Extension template deployed to:', templateDir);
  return { success: true };
}

/**
 * Copy binaries to new unified structure
 * - brain.exe → bin/brain/brain.exe (with _internal folder)
 * - bloom-host.exe → bin/native/bloom-host.exe
 */
async function deployBinaries() {
  console.log('\n🔧 DEPLOYING BINARIES');
  
  const brainDest = path.join(paths.binDir, 'brain');
  const nativeDest = path.join(paths.binDir, 'native');
  
  // 1. Copy Brain (entire folder including _internal)
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
  
  // 2. Copy Native Host
  console.log('📦 Copying Native Host...');
  console.log(`   Source: ${paths.nativeSource}`);
  console.log(`   Dest:   ${nativeDest}`);
  
  if (!await fs.pathExists(paths.nativeSource)) {
    throw new Error(`Native source not found at: ${paths.nativeSource}`);
  }
  
  const hostDestPath = path.join(nativeDest, 'bloom-host.exe');
  await fs.copy(paths.nativeSource, hostDestPath, { overwrite: true });
  
  if (!await fs.pathExists(hostDestPath)) {
    throw new Error(`bloom-host.exe not found after copy: ${hostDestPath}`);
  }
  console.log('  ✅ Native host deployed');
  
  // 3. Copy NSSM for service management
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
 * BRAIN HANDOFF: Execute `brain profile create MasterWorker --json`
 * Brain will:
 * - Create profiles/[UUID]/ directory
 * - Copy extension template to profiles/[UUID]/extension/
 * - Create synapse config in profiles/[UUID]/synapse/com.bloom.synapse.[UUID].json
 * - Update config/profiles.json with path and net_log_path
 * - Register bridge in Windows Registry (HKCU or HKLM)
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
 * BRAIN HANDOFF: Execute `brain profile launch MasterWorker --discovery`
 * This validates the entire setup:
 * - Launches Chrome with network logging enabled
 * - Performs discovery/handshake with extension
 * - Validates Native Messaging bridge
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
      windowsHide: false, // Show Chrome for validation
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
// FULL INSTALLATION SEQUENCE
// ============================================================================
async function runFullInstallation(mainWindow = null) {
  // Check admin privileges
  if (process.platform === 'win32' && !(await isElevated())) {
    console.log('⚠️ Admin privileges required.');
    relaunchAsAdmin();
    return { success: false, relaunching: true, message: 'Relaunching as Admin...' };
  }

  console.log(`\n=== STARTING SIMPLIFIED BRAIN DEPLOYMENT ===\n`);

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
    // STEP 3: DEPLOY EXTENSION TEMPLATE
    // ========================================================================
    emitProgress(mainWindow, 'extension-template', 'Copying extension template');
    await deployExtensionTemplate();
    
    // ========================================================================
    // STEP 4: INSTALL PYTHON RUNTIME
    // ========================================================================
    emitProgress(mainWindow, 'brain-runtime', 'Installing Python runtime');
    await installRuntime();
    
    // ========================================================================
    // STEP 5: DEPLOY BINARIES
    // ========================================================================
    emitProgress(mainWindow, 'binaries', 'Deploying Brain and Native Host');
    await deployBinaries();
    
    // ========================================================================
    // STEP 6: INSTALL AND START SERVICE
    // ========================================================================
    emitProgress(mainWindow, 'service', 'Installing Windows service');
    await installWindowsService();
    const started = await startService();
    if (!started) {
      throw new Error("Failed to start Brain service");
    }
    
    // ========================================================================
    // STEP 7: BRAIN HANDOFF - PROFILE CREATION
    // ========================================================================
    emitProgress(mainWindow, 'brain-handoff', 'Brain creating profile and configuring network');
    const profileInfo = await createProfileViaBrain();
    console.log('✅ Profile created:', profileInfo);
    
    // ========================================================================
    // STEP 8: VALIDATION VIA BRAIN
    // ========================================================================
    emitProgress(mainWindow, 'validation', 'Validating installation via profile launch');
    
    // Note: This will launch Chrome for validation
    // In production, you might want to skip this or make it optional
    try {
      await validateInstallationViaBrain(profileInfo.profileId);
      console.log('✅ Installation validated successfully');
    } catch (validationError) {
      console.warn('⚠️ Validation warning:', validationError.message);
      console.log('ℹ️ Installation complete, but validation had issues');
    }
    
    // ========================================================================
    // STEP 9: SAVE MINIMAL CONFIG
    // ========================================================================
    console.log('💾 Saving minimal installer config...');
    const configPath = paths.configFile;
    const finalConfig = {
      version: APP_VERSION,
      installed_at: new Date().toISOString(),
      installer_mode: 'simplified',
      masterProfileId: profileInfo.profileId,
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

    console.log('\n=== DEPLOYMENT COMPLETED SUCCESSFULLY ===\n');
    console.log('📁 Installation structure:');
    console.log(`   Base: ${paths.bloomBase}`);
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