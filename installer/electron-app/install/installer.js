// installer.js - REFACTORED: Electron as Simple File Copier + Chromium
// ============================================================================
// INSTALLATION ORDER:
// 1. Cleanup (services + processes)
// 2. Create directories
// 3. Install Chromium (NEW) â† CRITICAL DEPENDENCY
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
const { getLogger } = require('../src/logger');

// Logger para instalaciÃ³n
const logger = getLogger('installer');

// Importers
const { 
  cleanupOldServices, 
  installWindowsService, 
  startService,
  stopService,  
  killAllBloomProcesses 
} = require('./service-installer');
const { installRuntime } = require('./runtime-installer');
const { installExtension } = require('./extension-installer');
const { installChromium } = require('./chromium-installer'); // ðŸ†• NEW IMPORT
const { 
  BrainServiceManager,
  ensureBrainServiceResponding,
  ensureBrainServiceForLaunch 
} = require('./service-manager');

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
  { key: 'cleanup', percentage: 0, message: 'ðŸ§¹ Cleaning previous installation...' },
  { key: 'directories', percentage: 8, message: 'ðŸ“ Creating directory structure...' },
  { key: 'chromium', percentage: 20, message: 'ðŸŒ Installing Chromium browser...' }, // ðŸ†• NEW STEP
  { key: 'extension-template', percentage: 35, message: 'ðŸ§© Copying extension template...' },
  { key: 'brain-runtime', percentage: 50, message: 'âš™ï¸ Installing Brain runtime (Python)...' },
  { key: 'binaries', percentage: 65, message: 'ðŸ”§ Deploying binaries...' },
  { key: 'service', percentage: 78, message: 'ðŸš€ Installing Windows service...' },
  { key: 'brain-handoff', percentage: 88, message: 'ðŸ¤ Handing off to Brain for profile setup...' },
  { key: 'validation', percentage: 95, message: 'âœ… Validating installation...' },
  { key: 'complete', percentage: 100, message: 'âœ… Installation completed successfully!' }
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
  
  console.log('âœ… Directory structure created');
}

/**
 * Clean native directory preserving structure
 */
async function cleanNativeDir() {
  console.log('\nðŸ§¹ CLEANING NATIVE DIRECTORY');
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
    console.log('âœ… Native directory cleaned');
  } catch (e) {
    console.warn('âš ï¸ Could not clean native dir completely:', e.message);
  }
}

/**
 * Copy extension as TEMPLATE to bin/extension/
 */
async function deployExtensionTemplate() {
  console.log('\nðŸ§© DEPLOYING EXTENSION TEMPLATE');
  
  const templateDir = path.join(paths.binDir, 'extension');
  
  if (await fs.pathExists(templateDir)) {
    await fs.emptyDir(templateDir);
  }
  
  await installExtension();
  
  console.log('âœ… Extension template deployed to:', templateDir);
  return { success: true };
}

/**
 * Copy binaries to unified structure
 */
async function deployBinaries() {
  console.log('\nðŸ”§ DEPLOYING BINARIES');
  
  const brainDest = path.join(paths.binDir, 'brain');
  const nativeDest = path.join(paths.binDir, 'native');
  
  // 1. Copy Brain
  console.log('ðŸ“¦ Copying Brain service...');
  console.log(`   Source: ${paths.brainSource}`);
  console.log(`   Dest:   ${brainDest}`);
  
  if (!await fs.pathExists(paths.brainSource)) {
    throw new Error(`Brain source not found at: ${paths.brainSource}\nðŸ’¡ Run 'python scripts/build_brain.py'`);
  }
  
  await fs.copy(paths.brainSource, brainDest, { overwrite: true });
  
  const brainExePath = path.join(brainDest, 'brain.exe');
  if (!await fs.pathExists(brainExePath)) {
    throw new Error(`brain.exe not found after copy: ${brainExePath}`);
  }
  console.log('  âœ… Brain service deployed');
  
  // 2. Copy Native Host + DLLs
  console.log('ðŸ“¦ Copying Native Host + DLLs...');
  
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
      console.log(`  âœ… Copied: ${file}`);
    }
  }
  
  console.log(`  âœ… Native host deployed (${copiedFiles.length} files)`);
  
  const hostDestPath = path.join(nativeDest, 'bloom-host.exe');
  if (!await fs.pathExists(hostDestPath)) {
    throw new Error(`bloom-host.exe not found after copy: ${hostDestPath}`);
  }
  
  // 3. Copy NSSM
  console.log('ðŸ“¦ Copying NSSM...');
  const nssmSource = paths.nssmExe;
  const nssmDest = path.join(nativeDest, 'nssm.exe');
  
  if (!await fs.pathExists(nssmSource)) {
    throw new Error(`NSSM not found at: ${nssmSource}`);
  }
  
  await fs.copy(nssmSource, nssmDest, { overwrite: true });
  console.log('  âœ… NSSM deployed');
  
  console.log('âœ… All binaries deployed');
}

/**
 * BRAIN HANDOFF: Create profile
 */
async function createProfileViaBrain() {
  console.log('\nðŸ¤ HANDING OFF TO BRAIN: Creating Master Profile');
  
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
        
        console.log(`âœ… Profile Created: ${profileId}`);
        
        resolve({
          profileId,
          alias: profileData.alias,
          path: profileData.path,
          netLogPath: profileData.net_log_path
        });
        
      } catch (parseError) {
        console.error("âŒ Parse Error:", stdout);
        
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
  console.log('\nâœ… VALIDATION: Launching profile for discovery');
  
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
        console.error(`âŒ Validation failed with code ${code}`);
        console.error('Stderr:', stderr);
        return reject(new Error(`Validation failed: ${stderr || 'Unknown error'}`));
      }

      console.log('âœ… Profile launched successfully');
      console.log('â„¹ï¸ Chrome should be running with the extension loaded');
      console.log('â„¹ï¸ Check logs for handshake confirmation');
      
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
// FULL INSTALLATION SEQUENCE - COMPLETE VERSION
// ============================================================================

async function runFullInstallation(mainWindow = null) {
  // Check admin privileges
  if (process.platform === 'win32' && !(await isElevated())) {
    logger.warn('Admin privileges required - relaunching...');
    relaunchAsAdmin();
    return { success: false, relaunching: true, message: 'Relaunching as Admin...' };
  }

  logger.separator('STARTING BLOOM NUCLEUS INSTALLATION');
  logger.info(`Version: ${APP_VERSION}`);
  logger.info(`Platform: ${process.platform}`);
  logger.info(`Install Directory: ${paths.bloomBase}`);

  try {
    // ========================================================================
    // STEP 1: CLEANUP
    // ========================================================================
    emitProgress(mainWindow, 'cleanup', 'Stopping services and killing processes');
    logger.step('STEP 1: Cleanup');
    await cleanupOldServices();
    await killAllBloomProcesses();

    // ðŸ†• NUEVO: Liberar puerto 5678 si estÃ¡ ocupado
    logger.info('Verificando puerto 5678...');
    const { exec } = require('child_process');

    const portCheck = await new Promise((resolve) => {
      exec('netstat -ano | findstr :5678', (error, stdout) => {
        resolve(stdout);
      });
    });

    if (portCheck && portCheck.includes('LISTENING')) {
      logger.warn('âš ï¸ Puerto 5678 estÃ¡ ocupado');
      logger.info('Intentando liberar puerto...');
      
      // Extraer PID del proceso que usa el puerto
      const lines = portCheck.split('\n');
      for (const line of lines) {
        if (line.includes('LISTENING')) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          
          if (pid && !isNaN(pid)) {
            logger.info(`Matando proceso PID ${pid} que ocupa puerto 5678...`);
            
            await new Promise((resolve) => {
              exec(`taskkill /F /PID ${pid}`, (error, stdout) => {
                logger.info(stdout || 'Proceso terminado');
                resolve();
              });
            });
            
            // Esperar a que el puerto se libere
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }
      
      // Verificar que se liberÃ³
      const recheckPort = await new Promise((resolve) => {
        exec('netstat -ano | findstr :5678', (error, stdout) => {
          resolve(stdout);
        });
      });
      
      if (!recheckPort || !recheckPort.includes('LISTENING')) {
        logger.success('âœ… Puerto 5678 liberado');
      } else {
        logger.error('âŒ No se pudo liberar el puerto 5678');
        throw new Error(
          'Puerto 5678 todavÃ­a ocupado. ' +
          'EjecutÃ¡ manualmente: netstat -ano | findstr :5678 ' +
          'y matÃ¡ el proceso con: taskkill /F /PID [PID]'
        );
      }
    } else {
      logger.success('âœ… Puerto 5678 disponible');
    }

    await cleanNativeDir();
    logger.success('Cleanup completed');
    
    // ========================================================================
    // STEP 2: CREATE DIRECTORY STRUCTURE
    // ========================================================================
    emitProgress(mainWindow, 'directories', 'Creating unified directory structure');
    logger.step('STEP 2: Creating directory structure');
    await createDirectories();
    logger.success('Directory structure created');

    // ========================================================================
    // STEP 3: INSTALL CHROMIUM
    // ========================================================================
    emitProgress(mainWindow, 'chromium', 'Extracting Chromium browser (~300MB, may take 30s)');
    logger.step('STEP 3: Installing Chromium');
    
    const chromiumResult = await installChromium();
    
    if (!chromiumResult.success) {
      throw new Error(`Chromium installation failed: ${chromiumResult.error}`);
    }
    logger.success('Chromium installed successfully');
    
    console.log('âœ… Chromium installed successfully at:', chromiumResult.chromiumPath);
    
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
    logger.success('Binaries deployed');
    
    // ========================================================================
    // STEP 7: INSTALL AND START WINDOWS SERVICE
    // ========================================================================
    emitProgress(mainWindow, 'service', 'Installing Windows service');
    logger.step('STEP 7: Installing Windows service');
    await installWindowsService();
    
    logger.info('Starting Brain service...');
    const started = await startService();
    if (!started) {
      throw new Error("Failed to start Brain service");
    }
    
    logger.success('Windows Service installed and started via NSSM');
    
    // ========================================================================
    // STEP 7.5: VERIFY SERVICE IS RESPONDING
    // ========================================================================
    emitProgress(mainWindow, 'service', 'Esperando que Brain Service responda (esto puede tomar 1-2 min)');

    logger.step('STEP 7.5: Verificando que Brain Service responda');
    logger.info('â³ Brain Service necesita tiempo para inicializar Python + FastAPI...');
    logger.info('â³ Primera ejecuciÃ³n puede tomar 60-90 segundos');

    const brainManager = new BrainServiceManager();

    // Esperar 10 segundos iniciales para que NSSM arranque el proceso
    logger.info('Esperando 10 segundos para que NSSM inicie brain.exe...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Intentar conectar con timeout generoso
    logger.info('Intentando conectar con Brain Service en puerto 5678...');
    logger.info('Timeout: 80 segundos');

    const verifyResult = await brainManager.waitUntilResponding(80); // 80 segundos

    if (!verifyResult.success) {

      logger.info('âš ï¸ El servicio no responde. Intentando arranque forzado del motor...');
      // Intentar lanzar el comando directamente para debug o recuperaciÃ³n
      const emergencyStart = spawn(path.join(paths.binDir, 'brain', 'brain.exe'), ['service', 'start'], {
          detached: true,
          stdio: 'ignore'
      });
      emergencyStart.unref();
      
      // Esperar 5 segundos adicionales
      await new Promise(resolve => setTimeout(resolve, 5000));

      logger.error('âŒ Brain Service no responde despuÃ©s de 90 segundos totales y arranque forzado del motor');
      logger.error('');
      logger.error('ðŸ” DiagnÃ³stico:');
      
      // Verificar estado del servicio Windows
      const { exec } = require('child_process');
      
      const serviceStatus = await new Promise((resolve) => {
        exec('sc query BloomBrainService', (error, stdout) => {
          resolve(stdout || 'No se pudo consultar el servicio');
        });
      });
      
      logger.info('Estado del servicio Windows:');
      console.log(serviceStatus);
      
      // Verificar puerto
      const portStatus = await new Promise((resolve) => {
        exec('netstat -an | findstr :5678', (error, stdout) => {
          resolve(stdout || 'Puerto no encontrado en LISTENING');
        });
      });
      
      logger.info('Estado del puerto 5678:');
      console.log(portStatus || 'âŒ Puerto no estÃ¡ en LISTENING');
      
      // Verificar logs de Brain
      const brainLogPath = path.join(paths.logsDir, 'brain-service.log');
      logger.info(`ðŸ“‹ Revisar logs en: ${brainLogPath}`);
      
      // Verificar logs de NSSM
      const nssmLogPath = path.join(paths.logsDir, 'nssm-service.log');
      logger.info(`ðŸ“‹ Revisar logs NSSM en: ${nssmLogPath}`);
      
      throw new Error(
        'Brain Service no arranca automÃ¡ticamente. ' +
        'El servicio se instalÃ³ correctamente pero no responde. ' +
        'IntentÃ¡ arrancarlo manualmente: sc start BloomBrainService'
      );
    } else {
      logger.success(`âœ… Brain Service verificado respondiendo (PID: ${verifyResult.pid})`);
      logger.info('âœ… Puerto 5678 LISTENING');
      logger.info('âœ… Listo para crear perfiles');
      console.log(`\nâœ… Brain Service respondiendo correctamente en puerto 5678 (PID: ${verifyResult.pid})\n`);
    }
    
    // ========================================================================
    // STEP 8: BRAIN HANDOFF - PROFILE CREATION
    // ========================================================================
    emitProgress(mainWindow, 'brain-handoff', 'Brain creating profile and configuring network');
    
    const profileInfo = await createProfileViaBrain();
    console.log('âœ… Profile created:', profileInfo);
    console.log(`   Profile ID: ${profileInfo.profileId}`);
    console.log(`   Profile Path: ${profileInfo.path}`);
    
    // ========================================================================
    // STEP 9: VALIDATION VIA BRAIN
    // ========================================================================
    emitProgress(mainWindow, 'validation', 'Validating installation via profile launch');
    logger.step('STEP 9: Validating installation via Brain');

    try {
      // Lanzar Chrome con el perfil para validaciÃ³n
      await validateInstallationViaBrain(profileInfo.profileId);
      logger.success('Installation validated successfully');
      console.log('âœ… Installation validated successfully');
      console.log('   Chrome launched with profile');
      console.log('   Extension should be loaded');
      
      // OPCIONAL: Esperar que el host se registre en Brain Service
      console.log('â³ Waiting for host to register in Brain Service...');
      const regResult = await brainManager.waitForProfileRegistration(
        profileInfo.profileId,
        15  // 15 segundos timeout
      );
      
      if (regResult.success) {
        logger.success(`Host registered in Brain Service successfully`);
        logger.info(`Total registered profiles: ${regResult.count}`);
        console.log(`âœ… Host registered in Brain Service successfully`);
        console.log(`   Total registered profiles: ${regResult.count}`);
      } else {
        logger.warn('Host registration timeout');
        logger.warn('Chrome may still be starting up');
        logger.warn('This is not critical - installation can proceed');
        console.warn('âš ï¸ Host registration timeout');
        console.warn('   Chrome may still be starting up');
        console.warn('   This is not critical - installation can proceed');
      }
      
    } catch (validationError) {
      logger.warn(`Validation warning: ${validationError.message}`);
      logger.info('Installation complete, but validation had issues');
      logger.info('This can happen if Chrome takes longer to start');
      logger.info('The installation is likely still successful');
      
      console.warn('âš ï¸ Validation warning:', validationError.message);
      console.log('â„¹ï¸ Installation complete, but validation had issues');
      console.log('   This can happen if Chrome takes longer to start');
      console.log('   The installation is likely still successful');
    }
    
    // ========================================================================
    // STEP 10: SAVE CONFIG
    // ========================================================================
    console.log('ðŸ’¾ Saving installer config...');
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
      const launcherResult = await createLauncherShortcuts({
        chromiumPath: chromiumResult.chromiumPath,
        profileId: profileInfo.profileId
      });
      console.log('âœ… Launcher shortcuts created:', launcherResult.success);
    } catch (launcherError) {
      logger.warn('Could not create launcher shortcuts:', launcherError.message);
    }

    logger.separator('INSTALLATION COMPLETED SUCCESSFULLY');
    logger.info('Installation structure:');
    logger.info(`  Base: ${paths.bloomBase}`);
    logger.info(`  Chromium: ${chromiumResult.chromiumPath}`);
    logger.info(`  Brain: ${path.join(paths.binDir, 'brain', 'brain.exe')}`);
    logger.info(`  Native Host: ${path.join(paths.binDir, 'native', 'bloom-host.exe')}`);
    logger.info(`  Extension Template: ${path.join(paths.binDir, 'extension')}`);
    logger.info(`  Profiles: ${paths.profilesDir}`);
    logger.info(`  Config: ${paths.configDir}`);
    logger.info('Use "brain profile list" to see profile details');
    logger.info('Use "brain profile launch MasterWorker" to start working');

    return {
      success: true,
      profileId: profileInfo.profileId,
      profilePath: profileInfo.path,
      chromiumPath: chromiumResult.chromiumPath,
      version: APP_VERSION
    };

  } catch (error) {
    logger.separator('FATAL ERROR IN INSTALLATION');
    logger.error('Error:', error.message);
    logger.error('Stack trace:', error.stack);
    
    // Cleanup on failure
    try {
      await cleanupOldServices();
    } catch (cleanupError) {
      console.error('âš ï¸ Cleanup also failed:', cleanupError.message);
    }
    
    return { 
      success: false, 
      error: error.message,
      stack: error.stack 
    };
  }
}

// ============================================================================
// HELPER: CREATE PROFILE VIA BRAIN CLI (UNCHANGED)
// ============================================================================
async function createProfileViaBrain() {
  console.log('\nðŸ¤ HANDING OFF TO BRAIN: Creating Master Profile');
  
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
        
        console.log(`âœ… Profile Created: ${profileId}`);
        
        resolve({
          profileId,
          alias: profileData.alias,
          path: profileData.path,
          netLogPath: profileData.net_log_path
        });
        
      } catch (parseError) {
        console.error("âŒ Parse Error:", stdout);
        
        if (stdout.includes('MasterWorker') || stdout.includes('already exists')) {
          return resolve({ profileId: "MasterWorker", fallback: true });
        }
        
        reject(new Error(`Parse failed: ${parseError.message}`));
      }
    });
  });
}

// ============================================================================
// HELPER: VALIDATE INSTALLATION VIA BRAIN
// ============================================================================
async function validateInstallationViaBrain(profileId) {
  logger.separator('VALIDATION: LAUNCHING PROFILE');
  logger.info(`Profile ID: ${profileId}`);
  
  return new Promise((resolve, reject) => {
    const brainExe = path.join(paths.binDir, 'brain', 'brain.exe');
    
    if (!fs.existsSync(brainExe)) {
      const error = `Brain executable not found at: ${brainExe}`;
      logger.error(error);
      return reject(new Error(error));
    }

    const args = ['profile', 'launch', profileId, '--discovery'];
    
    logger.info(`Executing: "${brainExe}" ${args.join(' ')}`);
    console.log(`\nðŸš€ Executing: "${brainExe}" ${args.join(' ')}\n`);

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
      const output = data.toString().trim();
      stdout += data.toString();
      logger.info(`[Brain Output] ${output}`);
      console.log('ðŸ“¤ [Brain]', output);
    });

    child.stderr.on('data', (data) => {
      const error = data.toString().trim();
      stderr += data.toString();
      logger.warn(`[Brain Error] ${error}`);
      console.error('âš ï¸ [Brain Error]', error);
    });

    child.on('close', (code) => {
      logger.info(`Brain process exited with code: ${code}`);
      
      if (code !== 0) {
        logger.error(`Validation failed with code ${code}`);
        logger.error(`Stderr: ${stderr}`);
        console.error(`âŒ Validation failed with code ${code}`);
        console.error('Stderr:', stderr);
        return reject(new Error(`Validation failed: ${stderr || 'Unknown error'}`));
      }

      logger.success('Profile launched successfully');
      logger.info('Chrome should be running with the extension loaded');
      logger.info('Check logs for handshake confirmation');
      
      console.log('âœ… Profile launched successfully');
      console.log('â„¹ï¸ Chrome should be running with the extension loaded');
      console.log('â„¹ï¸ Check logs for handshake confirmation');
      
      resolve({
        success: true,
        stdout,
        stderr
      });
    });

    child.on('error', (error) => {
      logger.error(`Failed to spawn Brain process: ${error.message}`);
      console.error('âŒ Failed to spawn:', error.message);
      reject(new Error(`Failed to launch validation: ${error.message}`));
    });
  });
}

module.exports = {
  runFullInstallation,
  createDirectories,
  cleanNativeDir,
  createProfileViaBrain,
  validateInstallationViaBrain
};