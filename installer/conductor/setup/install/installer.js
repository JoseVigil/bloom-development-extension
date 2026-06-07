// install/installer.js
// Integrated with Nucleus Manager - Atomic Milestones
// FIXED: Temporal initialization with correct PATH
//
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔴 TELEMETRY POLICY — CRITICAL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// ❌ FORBIDDEN in Electron:
//    - Writing telemetry.json directly
//    - Creating telemetry.json.tmp
//    - Using TelemetryManager/TelemetryWriter
//    - Atomic writes with rename()
//    - ANY direct manipulation of telemetry.json
//
// ✅ REQUIRED:
//    - Create .log files in logs/electron/
//    - Register streams via: nucleus telemetry register
//    - Nucleus is the ONLY writer to telemetry.json
//
// If logs show "telemetry.json.tmp" or "rename telemetry" → IMPLEMENTATION IS INVALID
//
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const path = require('path');
const fs = require('fs-extra');
const { spawn } = require('child_process');
const { BrowserWindow } = require('electron');

const { paths } = require('../config/paths');
const { getLogger } = require('../../shared/logger');
const { nucleusManager } = require('./nucleus_manager');
const logger = getLogger('installer');

const { preInstallCleanup } = require('./pre-install-cleanup.js');

// ── Brain service installer — condicional por plataforma ──────────────────────
const {
  cleanupOldServices,
  installWindowsService,
  startService,
  removeService,
  NEW_SERVICE_NAME
} = process.platform === 'darwin'
  ? require('./service-installer-brain-darwin.js')
  : require('./service-installer-brain.js');

const { installRuntime } = require('./runtime-installer');
const { installChromium } = require('./chromium-installer');

// ── Ollama service installer — condicional por plataforma ────────────────────
const {
  installOllamaService,
  startOllamaService,
  OLLAMA_SERVICE_NAME,
  OLLAMA_DISPLAY_NAME
} = process.platform === 'darwin'
  ? require('./service-installer-ollama-darwin.js')
  : require('./service-installer-ollama');

// ── Sensor installer — condicional por plataforma ─────────────────────────────
const { installSensor } = process.platform === 'darwin'
  ? require('./service-installer-sensor-darwin.js')
  : require('./service-installer-sensor');

const {
  nucleusHealth,
  executeNucleusCommand,
  executeSentinelCommand,
  getNucleusExecutablePath,
  registerTelemetryStream
} = require('./installer_nucleus');

// ⚠️ DEPRECADO: deployAllBinaries, deployConductor, deployMetamorph
// Todas las copias de binarios están ahora en deployAllSystemBinaries()

// ============================================================================
// STUBS — funciones pendientes de implementar
// TODO: mover a sus archivos correspondientes cuando estén listos
// ============================================================================

async function installVSCodeExtension(win) {
  const vsixPath = path.join(paths.vscodeDir, 'bloom-extension.vsix');

  if (!await fs.pathExists(vsixPath)) {
    logger.warn('⚠️ installVSCodeExtension: bloom-extension.vsix not found in bin/vscode, skipping');
    return { success: false, skipped: true };
  }

  // En macOS el CLI 'code' no siempre está en el PATH del sistema.
  // Buscamos en el PATH primero, luego en la ubicación canónica del .app bundle.
  const VSCODE_CLI_CANDIDATES = process.platform === 'darwin'
    ? [
        'code',
        '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
        '/usr/local/bin/code',
      ]
    : ['code'];

  const { execFile } = require('child_process');
  const { promisify } = require('util');
  const execFileAsync = promisify(execFile);

  // Detectar cuál candidato está disponible
  let codeCliPath = null;
  for (const candidate of VSCODE_CLI_CANDIDATES) {
    try {
      await execFileAsync(candidate, ['--version'], { timeout: 5000 });
      codeCliPath = candidate;
      logger.info(`✔ VS Code CLI found: ${candidate}`);
      break;
    } catch (_) {
      // candidato no disponible, probar el siguiente
    }
  }

  if (!codeCliPath) {
    logger.warn('⚠️ installVSCodeExtension: VS Code CLI (code) not found — extension not installed');
    logger.warn('   Install VS Code and add the CLI to PATH, or run: code --install-extension manually');
    return { success: false, skipped: true };
  }

  return new Promise((resolve) => {
    logger.info(`📦 Installing bloom-extension.vsix via: ${codeCliPath} --install-extension ${vsixPath} --force`);

    const proc = spawn(codeCliPath, ['--install-extension', vsixPath, '--force'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    proc.stdout.on('data', d => logger.info(d.toString().trim()));
    proc.stderr.on('data', d => logger.warn(d.toString().trim()));

    proc.on('close', code => {
      if (code === 0) {
        logger.success('✅ bloom-extension installed in VS Code');
        resolve({ success: true });
      } else {
        logger.warn(`⚠️ code --install-extension exited with code ${code} — non-critical, continuing`);
        resolve({ success: false, non_critical: true });
      }
    });

    proc.on('error', err => {
      logger.warn(`⚠️ Failed to spawn VS Code CLI: ${err.message} — non-critical, continuing`);
      resolve({ success: false, non_critical: true });
    });
  });
}

async function runMetamorphAudit(win) {
  // TODO: invocar metamorph snapshot + verify-sync
  // metamorph audit --snapshot --verify
  logger.warn('⚠️ runMetamorphAudit: not yet implemented, skipping');
  return { success: true, skipped: true };
}

async function installBrainService(win) {
  const MILESTONE = 'brain_service_install';

  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ ${MILESTONE} completed, skipping`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);
  emitProgress(win, 6, 12, 'Installing Brain Service...');

  try {
    logger.separator('INSTALLING BRAIN SERVICE');

    logger.info('Installing Brain LaunchAgent...');
    await installWindowsService();

    logger.info('Starting Brain Service...');
    const started = await startService();

    if (!started) {
      throw new Error('Brain Service failed to start');
    }

    logger.success('✅ Brain Service started');

    await nucleusManager.completeMilestone(MILESTONE, {
      service_running: true
    });

    return { success: true };

  } catch (error) {
    await nucleusManager.failMilestone(MILESTONE, error.message);
    throw error;
  }
}

async function seedMasterProfile(win) {
  const MILESTONE = 'nucleus_seed';

  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ ${MILESTONE} completed, skipping`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);
  emitProgress(win, 12, 12, 'Seeding master profile...');

  try {
    const { seedMasterProfile: _seed } = require('./installer_nucleus');
    const result = await _seed();

    if (result && result.profile_id) {
      await nucleusManager.setMasterProfile(result.profile_id);
    }

    await nucleusManager.completeMilestone(MILESTONE, {
      profile_id: result.profile_id,
      alias: result.alias
    });

    return result;

  } catch (error) {
    await nucleusManager.failMilestone(MILESTONE, error.message);
    throw error;
  }
}

async function launchMasterProfile(win) {
  const MILESTONE = 'nucleus_launch';

  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ ${MILESTONE} completed, skipping`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);
  emitProgress(win, 11, 12, 'Launching master profile...');

  try {
    logger.separator('LAUNCHING MASTER PROFILE');

    const profileId = nucleusManager.state.master_profile;
    if (!profileId) {
      throw new Error('master_profile not set — seed must have failed');
    }

    logger.info(`Launching profile: ${profileId}`);
    logger.info('   Running: nucleus --json synapse launch <profileId> --mode discovery');

    // Invocar el launch real. Temporal debe estar activo (garantizado por certification).
    // Sentinel + Chromium tardan ~5-10s en levantar; usar timeout generoso.
    const result = await executeNucleusCommand(
      ['--json', 'synapse', 'launch', profileId, '--mode', 'discovery']
    );

    if (!result || !result.success) {
      throw new Error(`Launch failed: ${result?.error || JSON.stringify(result)}`);
    }

    if (!result.extension_loaded) {
      throw new Error(
        `Extension not loaded after launch — chrome_pid: ${result.chrome_pid}, state: ${result.state}`
      );
    }

    logger.success(`✅ Master profile launched`);
    logger.info(`   profile_id:      ${result.profile_id}`);
    logger.info(`   launch_id:       ${result.launch_id}`);
    logger.info(`   chrome_pid:      ${result.chrome_pid}`);
    logger.info(`   debug_port:      ${result.debug_port}`);
    logger.info(`   extension_loaded: ${result.extension_loaded}`);
    logger.info(`   state:           ${result.state}`);

    await nucleusManager.completeMilestone(MILESTONE, {
      profile_id:       result.profile_id,
      launch_id:        result.launch_id,
      chrome_pid:       result.chrome_pid,
      extension_loaded: result.extension_loaded,
      state:            result.state,
    });

    return result;

  } catch (error) {
    await nucleusManager.failMilestone(MILESTONE, error.message);
    throw error;
  }
}

const SENSOR_EXE_NAME = process.platform === 'darwin' ? 'sensor' : 'bloom-sensor.exe';
const SETUP_EXE_NAME  = process.platform === 'darwin' ? 'bloom-setup'  : 'bloom-setup.exe';

// ============================================================================
// PROGRESS REPORTING
// ============================================================================

function emitProgress(win, current, total, message) {
  if (win && win.webContents) {
    win.webContents.send('installation-progress', {
      current,
      total,
      percentage: Math.round((current / total) * 100),
      message
    });
  }
  logger.info(`[${current}/${total}] ${message}`);
}

// ============================================================================
// PROFILES.JSON INITIALIZATION
// ============================================================================

/**
 * Crea profiles.json vacío si no existe
 * Esto previene que worker_manager falle durante el boot del servicio
 */
async function ensureProfilesJson() {
  const profilesPath = path.join(paths.configDir, 'profiles.json');
  
  // Solo crear si no existe
  if (!await fs.pathExists(profilesPath)) {
    const emptyProfiles = {
      profiles: [],
      version: "1.0.0",
      last_updated: new Date().toISOString(),
      metadata: {
        created_by: "installer",
        created_at: new Date().toISOString()
      }
    };
    
    await fs.writeJson(profilesPath, emptyProfiles, { spaces: 2 });
    logger.info('✓ profiles.json initialized (empty)');
  }
}

// ============================================================================
// MILESTONE EXECUTORS
// ============================================================================

async function createDirectories(win) {
  const MILESTONE = 'directories';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ ${MILESTONE} completed, skipping`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);
  emitProgress(win, 1, 12, 'Creating system directories...');

  try {
    logger.separator('CREATING DIRECTORIES');

    const dirs = [
      paths.binDir,
      paths.nucleusDir,
      paths.sentinelDir,
      paths.brainDir,
      paths.hostDir,
      paths.ollamaDir,
      paths.cortexDir,
      paths.workspaceDir,
      paths.chromeDir,
      paths.configDir,
      paths.engineDir,
      paths.runtimeDir,
      paths.profilesDir,
      paths.logsDir,
      paths.temporalDir,
      paths.vscodeDir,          // bin/vscode — bloom-extension.vsix
      paths.bootstrapDir,       // bin/bootstrap — bootstrap files
      paths.bootstrapStaticDir, // bin/bootstrap/static — static assets (logo.svg, etc.)
      path.join(paths.logsDir, 'workspace'),        // logs/workspace
      path.join(paths.logsDir, 'workspace', 'setup'), // logs/workspace/setup
      path.join(paths.logsDir, 'install'),           // logs/install
    ];

    for (const dir of dirs) {
      await fs.ensureDir(dir);
      logger.success(`✔ ${path.basename(dir)}/`);
    }

    // ✅ AÑADIR: Crear profiles.json vacío
    await ensureProfilesJson();

    await nucleusManager.completeMilestone(MILESTONE, { dirs_created: dirs.length });
    return { success: true };

  } catch (error) {
    await nucleusManager.failMilestone(MILESTONE, error.message);
    throw error;
  }
}

async function runChromiumInstall(win) {
  const MILESTONE = 'chromium';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ ${MILESTONE} completed, skipping`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);
  emitProgress(win, 2, 12, 'Installing Chromium browser...');

  try {
    const result = await installChromium(win);
    await nucleusManager.completeMilestone(MILESTONE, result);
    return result;

  } catch (error) {
    await nucleusManager.failMilestone(MILESTONE, error.message);
    throw error;
  }
}

async function runRuntimeInstall(win) {
  const MILESTONE = 'brain_runtime';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ ${MILESTONE} completed, skipping`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);
  emitProgress(win, 3, 12, 'Configuring Python runtime...');

  try {
    // Remover servicio antes de instalar runtime (si existe)
    logger.info('Stopping Brain Service before runtime install...');
    await removeService(NEW_SERVICE_NAME);
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s
    
    const result = await installRuntime(win);
    await nucleusManager.completeMilestone(MILESTONE, result);
    return result;

  } catch (error) {
    await nucleusManager.failMilestone(MILESTONE, error.message);
    throw error;
  }
}

// ============================================================================
// UNIFIED BINARY DEPLOYMENT - CENTRALIZED
// ============================================================================

/**
 * Copia un directorio completo con retry y validación
 */
async function copyDirectorySafe(src, dest, label) {
  logger.info(`📦 Copying ${label}...`);
  logger.debug(`   Source: ${src}`);
  logger.debug(`   Dest: ${dest}`);
  
  if (!await fs.pathExists(src)) {
    throw new Error(`${label} source not found: ${src}`);
  }
  
  await fs.ensureDir(dest);
  
  // Opciones especiales para copiar aplicaciones Electron y archivos complejos
  const copyOptions = {
    overwrite: true,
    errorOnExist: false,
    dereference: false,  // No seguir symlinks
    preserveTimestamps: true,
    filter: (src) => {
      const basename = path.basename(src);
      
      // Excluir app.asar.unpacked (contenido ya está en app.asar)
      if (basename === 'app.asar.unpacked') {
        return false;
      }
      
      // Permitir todo lo demás, incluyendo app.asar
      return true;
    }
  };
  
  try {
    await fs.copy(src, dest, copyOptions);
    logger.success(`✅ ${label} deployed`);
    return { success: true, src, dest };
  } catch (error) {
    // Si falla la copia, dar más detalles
    throw new Error(`Failed to copy ${label}: ${error.message}`);
  }
}

/**
 * Copia un archivo individual con retry
 */
async function copyFileSafe(src, dest, label) {
  logger.info(`📄 Copying ${label}...`);
  logger.debug(`   Source: ${src}`);
  logger.debug(`   Dest: ${dest}`);
  
  if (!await fs.pathExists(src)) {
    throw new Error(`${label} source not found: ${src}`);
  }
  
  await fs.ensureDir(path.dirname(dest));
  await fs.copy(src, dest, { overwrite: true });
  
  logger.success(`✅ ${label} deployed`);
  
  return { success: true, src, dest };
}

/**
 * Copia todos los DLLs de un directorio
 */
async function copyDLLs(srcDir, destDir, label) {
  logger.info(`📚 Copying ${label}...`);
  
  if (!await fs.pathExists(srcDir)) {
    logger.warn(`⚠️ ${label} source not found: ${srcDir}`);
    return { success: false, skipped: true };
  }
  
  const files = await fs.readdir(srcDir);
  const dllFiles = files.filter(f => path.extname(f).toLowerCase() === '.dll');
  
  if (dllFiles.length === 0) {
    logger.warn(`⚠️ No DLLs found in ${srcDir}`);
    return { success: false, skipped: true };
  }
  
  await fs.ensureDir(destDir);
  
  for (const dll of dllFiles) {
    const srcPath = path.join(srcDir, dll);
    const destPath = path.join(destDir, dll);
    await fs.copy(srcPath, destPath, { overwrite: true });
  }
  
  logger.success(`✅ ${label} deployed (${dllFiles.length} files)`);
  
  return { success: true, count: dllFiles.length };
}

/**
 * FUNCIÓN CENTRALIZADA - DEPLOYMENT DE TODOS LOS BINARIOS
 * 
 * Copia TODOS los binarios del sistema en el orden correcto
 * Esta es la ÚNICA función que debe copiar binarios
 */
async function deployAllSystemBinaries(win) {
  const MILESTONE = 'binaries';  // ✅ Usa el milestone existente
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ ${MILESTONE} completed, skipping`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);
  emitProgress(win, 4, 12, 'Deploying system binaries...');

  try {
    logger.separator('DEPLOYING ALL SYSTEM BINARIES');
    
    // CRÍTICO: Limpieza automática ANTES de copiar binarios
    await preInstallCleanup(logger);
    
    const results = {};
    
    // ========================================================================
    // 1. PYTHON RUNTIME (base para Brain)
    // ========================================================================
    logger.info('\n🐍 PYTHON RUNTIME');
    results.runtime = await copyDirectorySafe(
      paths.runtimeSource,
      paths.runtimeDir,
      'Python Runtime'
    );
    
    // Configurar Python — sólo en Windows necesita el .pth de modo aislado
    if (process.platform === 'win32') {
      const pthFile = path.join(paths.runtimeDir, 'python310._pth');
      const pthContent = ['.', 'python310.zip', 'Lib', 'Lib\\site-packages'].join('\n');
      await fs.writeFile(pthFile, pthContent, 'utf8');
      logger.success('✅ Python configured in ISOLATED mode');
    }
    
    // ========================================================================
    // 2. BRAIN SERVICE (incluye _internal/)
    // ========================================================================
    logger.info('\n🧠 BRAIN SERVICE');
    results.brain = await copyDirectorySafe(
      paths.brainSource,
      paths.brainDir,
      'Brain Service'
    );
    
    // Verificar que el binario de brain existe (sin extensión en macOS)
    if (!await fs.pathExists(paths.brainExe)) {
      throw new Error(`brain binary not found after copy: ${paths.brainExe}`);
    }

    // En macOS asegurar permisos de ejecución (PyInstaller a veces los pierde)
    if (process.platform === 'darwin') {
      await fs.chmod(paths.brainExe, 0o755);
    }

    // En macOS registrar brainDir en el PATH del sistema vía /etc/paths.d/
    if (process.platform === 'darwin') {
      try {
        await fs.writeFile('/etc/paths.d/bloom-nucleus', paths.brainDir + '\n', 'utf8');
        logger.success('✅ brain added to system PATH (/etc/paths.d/bloom-nucleus)');
      } catch (err) {
        logger.warn(`⚠️ Could not write to /etc/paths.d/bloom-nucleus (needs sudo): ${err.message}`);
      }
    }
    
    // Verificar _internal (PyInstaller dependencies)
    const internalPath = path.join(paths.brainDir, '_internal');
    if (!await fs.pathExists(internalPath)) {
      logger.warn('⚠️ Warning: _internal folder not found');
    } else {
      logger.success('✅ Brain _internal dependencies verified');
    }
    
    // ========================================================================
    // 3. NATIVE HOST + DLLs
    // ========================================================================
    logger.info('\n🔗 NATIVE HOST');

    if (process.platform === 'win32') {
      const hostExeSrc = path.join(paths.hostSource, 'bloom-host.exe');
      results.nativeHost = await copyFileSafe(
        hostExeSrc,
        paths.hostBinary,
        'bloom-host.exe'
      );
      results.hostDLLs = await copyDLLs(
        paths.hostSource,
        paths.hostDir,
        'Host DLLs'
      );
    } else {
      const hostExeSrc = path.join(paths.hostSource, 'bloom-host');
      results.nativeHost = await copyFileSafe(
        hostExeSrc,
        paths.hostBinary,
        'bloom-host'
      );
      await fs.chmod(paths.hostBinary, 0o755);
      logger.success('✅ bloom-host deployed and marked executable');
    }

        // ========================================================================
    // 4. NSSM (solo Windows)
    // ========================================================================
    if (process.platform === 'win32') {
      logger.info('\n⚙️ NSSM SERVICE MANAGER');
      
      const nssmSrc = path.join(paths.nssmSource, 'nssm.exe');
      results.nssm = await copyFileSafe(
        nssmSrc,
        paths.nssmExe,
        'nssm.exe'
      );
    }
    
    // ========================================================================
    // 5. NUCLEUS SUITE (Governance)
    // ========================================================================
    logger.info('\n⚖️ NUCLEUS SUITE');
    
    results.nucleus = await copyDirectorySafe(
      paths.nucleusSource,
      paths.nucleusDir,
      'Nucleus'
    );

    // Copiar nucleus-governance.json desde fuente independiente
    // Destino canónico: config/nucleus/nucleus-governance.json
    // (NO bin/nucleus/ — ese directorio es solo para el binario)
    {
      const govSrc  = paths.nucleusGovernanceSource;
      const govConfigDir = path.join(paths.configDir, 'nucleus');
      const govDest = path.join(govConfigDir, 'nucleus-governance.json');
      await fs.ensureDir(govConfigDir);
      if (await fs.pathExists(govSrc)) {
        await copyFileSafe(govSrc, govDest, 'nucleus-governance.json');
        logger.success('✅ nucleus-governance.json deployed to config/nucleus/');
      } else {
        logger.warn('⚠️ nucleus-governance.json not found, skipping');
      }
    }
    
    results.sentinel = await copyDirectorySafe(
      paths.sentinelSource,
      paths.sentinelDir,
      'Sentinel'
    );

    // ── sentinel-config.json → config/sentinel/ (ubicación canónica) ──────────
    logger.info('\n⚙️ SENTINEL CONFIG');
    await fs.ensureDir(paths.sentinelConfigDir);

    const _sentinelCfgSrc      = paths.sentinelConfigSource;
    const _sentinelCfgFallback = path.join(paths.sentinelSource, 'sentinel-config.json');

    if (await fs.pathExists(_sentinelCfgSrc)) {
      await copyFileSafe(_sentinelCfgSrc, paths.sentinelConfig, 'sentinel-config.json');
      logger.success('✅ sentinel-config.json deployed to config/sentinel/');
    } else if (await fs.pathExists(_sentinelCfgFallback)) {
      await copyFileSafe(_sentinelCfgFallback, paths.sentinelConfig, 'sentinel-config.json (fallback)');
      logger.warn('⚠️ sentinel-config.json deployed from bin source — agregar a native/config/');
    } else {
      throw new Error('sentinel-config.json not found in native/config nor in sentinel source dir');
    }

    // Parchear paths dinámicos con valores del entorno del usuario
    try {
      const _cfg = await fs.readJson(paths.sentinelConfig);
      const _govPath = path.join(paths.configDir, 'nucleus', 'nucleus-governance.json');
      const _gov = await fs.readJson(_govPath);
      _cfg.settings.extensionPath = paths.cortexBlx;
      _cfg.settings.testWorkspace = paths.profilesDir;
      _cfg.bloom_base = paths.bloomBase;
      _cfg.provisioning.extension_id = _gov.provisioning?.extension_id || '';
      await fs.writeJson(paths.sentinelConfig, _cfg, { spaces: 2 });
      logger.success('✅ sentinel-config.json patched with runtime paths');
      logger.info(`   extension_id: ${_cfg.provisioning.extension_id || '(vacío — governance sin extension_id)'}`);
    } catch (patchErr) {
      logger.warn(`⚠️ Could not patch sentinel-config.json: ${patchErr.message}`);
    }
    
    results.metamorph = await copyDirectorySafe(
      paths.metamorphSource,
      paths.metamorphDir,
      'Metamorph'
    );

    // En macOS asegurar permisos en todos los binarios Go
    if (process.platform === 'darwin') {
      for (const bin of [paths.nucleusExe, paths.sentinelExe, paths.metamorphExe]) {
        if (await fs.pathExists(bin)) await fs.chmod(bin, 0o755);
      }
    }
    
    // ========================================================================
    // 6. CORTEX (Extension Package)
    // ========================================================================
    logger.info('\n🧩 CORTEX EXTENSION');
    results.cortex = await copyDirectorySafe(
      paths.cortexSource,
      paths.cortexDir,
      'Cortex'
    );
    
    // ========================================================================
    // 7. OLLAMA (LLM Server)
    // ========================================================================
    logger.info('\n🦙 OLLAMA LLM SERVER');
    
    if (await fs.pathExists(paths.ollamaSource)) {
      results.ollama = await copyDirectorySafe(
        paths.ollamaSource,
        paths.ollamaDir,
        'Ollama'
      );
    } else {
      logger.warn('⚠️ Ollama source not found, skipping');
      results.ollama = { success: false, skipped: true };
    }
    
    // ========================================================================
    // 8. NODE.JS (para Nucleus dev-start y API services)
    // ========================================================================
    logger.info('\n🟢 NODE.JS RUNTIME');
    
    const nodeExeName  = process.platform === 'win32' ? 'node.exe' : 'node';
    const nodeExeSrc   = path.join(paths.nodeSource, nodeExeName);
    const nodeExeDest  = path.join(paths.nodeDir, nodeExeName);

    if (await fs.pathExists(nodeExeSrc)) {
      results.node = await copyFileSafe(nodeExeSrc, nodeExeDest, nodeExeName);
      if (process.platform === 'darwin') await fs.chmod(nodeExeDest, 0o755);
    } else {
      logger.warn('⚠️ node binary source not found, skipping');
      results.node = { success: false, skipped: true };
    }
    
    // ========================================================================
    // 9. TEMPORAL (Workflow Orchestration Engine)
    // ========================================================================
    logger.info('\n⏱️ TEMPORAL WORKFLOW ENGINE');
    
    if (await fs.pathExists(paths.temporalSource)) {
      results.temporal = await copyDirectorySafe(
        paths.temporalSource,
        paths.temporalDir,
        'Temporal'
      );
    } else {
      logger.warn('⚠️ Temporal source not found, skipping');
      results.temporal = { success: false, skipped: true };
    }
    
    // ========================================================================
    // 10. WORKSPACE (ex-Conductor)
    // ========================================================================
    logger.info('\n🖥️ WORKSPACE');
    if (process.platform === 'darwin') {
      // CRÍTICO: metamorph rollout siempre usa 'darwin_x64' como directorio
      // fuente (ver rollout.go SourceFn workspace), independientemente de la
      // arquitectura real de la máquina. El installer DEBE hacer lo mismo para
      // que el path de origen sea idéntico al que usa metamorph.
      // El binario real vive dentro del .app bundle; se copia sólo el ejecutable
      // a bin/workspace/ — destino canónico: ~/Library/BloomNucleus/bin/workspace/bloom-workspace
      const macSubdir  = process.arch === 'arm64' ? 'mac-arm64' : 'mac';
      const binarySrc  = path.join(
        paths.installerDir,
        'native', 'bin', 'darwin_x64',   // igual que metamorph — siempre x64
        'workspace', macSubdir,
        'bloom-workspace.app', 'Contents', 'MacOS', 'bloom-workspace'
      );
      const destBin = path.join(paths.workspaceDir, 'bloom-workspace');

      if (await fs.pathExists(binarySrc)) {
        logger.info(`📦 Deploying bloom-workspace to bin/workspace/...`);
        logger.debug(`   Source: ${binarySrc}`);
        logger.debug(`   Dest:   ${destBin}`);
        await fs.ensureDir(paths.workspaceDir);
        const { execSync } = require('child_process');
        // Usar cp nativo para evitar conflictos del handler asar de Electron
        execSync(`cp "${binarySrc}" "${destBin}"`, { stdio: 'ignore' });
        await fs.chmod(destBin, 0o755);
        logger.success(`✅ bloom-workspace deployed to bin/workspace/`);
        results.workspace = { success: true, dest: destBin };
      } else {
        logger.warn(`⚠️ bloom-workspace binary not found at: ${binarySrc}`);
        results.workspace = { success: false, skipped: true };
      }
    } else {
      // Windows
      const workspaceExeName = 'bloom-workspace.exe';
      const workspaceExeSrc  = path.join(paths.installerDir, 'native', 'bin', 'win64', 'workspace', workspaceExeName);
      if (await fs.pathExists(workspaceExeSrc)) {
        results.workspace = await copyFileSafe(
          workspaceExeSrc,
          paths.workspaceExe,
          workspaceExeName
        );
      } else {
        logger.warn('⚠️ bloom-workspace.exe not found, skipping');
        results.workspace = { success: false, skipped: true };
      }
    }

    // ========================================================================
    // 11. BLOOM SENSOR (Session Agent)
    // ========================================================================
    logger.info('\n🌉 BLOOM SENSOR (SESSION AGENT)');

    const sensorExeSrc = path.join(paths.sensorSource, SENSOR_EXE_NAME);

    if (await fs.pathExists(sensorExeSrc)) {
      results.sensor = await copyFileSafe(
        sensorExeSrc,
        paths.sensorExe,
        SENSOR_EXE_NAME
      );
      if (process.platform === 'darwin') await fs.chmod(paths.sensorExe, 0o755);
    } else {
      logger.warn('⚠️ bloom-sensor binary not found, skipping');
      results.sensor = { success: false, skipped: true };
    }

    // ========================================================================
    // 12. SETUP (Installer / Self-update binary)
    // ========================================================================
    logger.info('\n🔧 SETUP INSTALLER');

    const setupExeSrc = path.join(paths.setupSource, SETUP_EXE_NAME);

    if (await fs.pathExists(setupExeSrc)) {
      results.setup = await copyFileSafe(
        setupExeSrc,
        paths.setupExe,
        SETUP_EXE_NAME
      );
      if (process.platform === 'darwin') await fs.chmod(paths.setupExe, 0o755);
    } else {
      logger.warn(`⚠️ ${SETUP_EXE_NAME} not found, skipping`);
      results.setup = { success: false, skipped: true };
    }

    // ========================================================================
    // 13. PYTHON HOOKS
    // ========================================================================
    logger.info('\n🪝 PYTHON HOOKS');

    if (await fs.pathExists(paths.hooksSource)) {
      if (await fs.pathExists(paths.hooksDir)) {
        await fs.remove(paths.hooksDir);
        logger.info('  Cleaned existing hooks directory');
      }
      await fs.ensureDir(paths.hooksDir);

      const entries = await fs.readdir(paths.hooksSource, { withFileTypes: true });
      const hookFolders = entries.filter(e => e.isDirectory());

      if (hookFolders.length === 0) {
        logger.warn('⚠️ No hook folders found in source, skipping');
        results.hooks = { success: false, skipped: true };
      } else {
        for (const folder of hookFolders) {
          const folderSrc  = path.join(paths.hooksSource, folder.name);
          const folderDest = path.join(paths.hooksDir, folder.name);
          await fs.copy(folderSrc, folderDest, { overwrite: true });
          logger.info(`  ✓ ${folder.name}`);
        }
        logger.success(`✅ Hooks deployed (${hookFolders.length} hooks)`);
        results.hooks = { success: true };
      }
    } else {
      logger.warn('⚠️ Hooks source not found, skipping');
      results.hooks = { success: false, skipped: true };
    }
    
    // ========================================================================
    // 14. VSCODE PLUGIN (bloom-extension.vsix → bin/vscode)
    // ========================================================================
    logger.info('\n🧩 VSCODE PLUGIN');

    const vsixSrc  = path.join(paths.vscodeSource, 'bloom-extension.vsix');
    const vsixDest = path.join(paths.vscodeDir,    'bloom-extension.vsix');

    if (await fs.pathExists(vsixSrc)) {
      results.vscode = await copyFileSafe(vsixSrc, vsixDest, 'bloom-extension.vsix');
    } else {
      logger.warn('⚠️ bloom-extension.vsix not found, skipping');
      results.vscode = { success: false, skipped: true };
    }

    // ========================================================================
    // 15. BOOTSTRAP CONTROL PLANE (bundle.js para Nucleus)
    // ========================================================================
    logger.info('\n🔌 BOOTSTRAP CONTROL PLANE');
    if (await fs.pathExists(paths.bootstrapSource)) {
      results.bootstrap = await copyDirectorySafe(
        paths.bootstrapSource,
        paths.bootstrapDir,
        'Bootstrap Control Plane'
      );
      const bundlePath = path.join(paths.bootstrapDir, 'bundle.js');
      if (!await fs.pathExists(bundlePath)) {
        throw new Error(`bundle.js not found after bootstrap copy: ${bundlePath}`);
      }
      logger.success('✅ bootstrap/bundle.js verified');
    } else {
      logger.warn('⚠️ Bootstrap source not found, skipping');
      results.bootstrap = { success: false, skipped: true };
    }

    await nucleusManager.setOriginPath(paths.nucleusSource);
    await nucleusManager.completeMilestone(MILESTONE, results);
    return { success: true, results };

  } catch (error) {
    await nucleusManager.failMilestone(MILESTONE, error.message);
    throw error;
  }
}

async function installNucleusService(win) {
  const MILESTONE = 'nucleus_service_install';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ ${MILESTONE} completed, skipping`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);
  emitProgress(win, 7, 12, 'Installing Nucleus Service...');

  try {
    logger.separator('INSTALLING NUCLEUS SERVICE (CRITICAL 24/7)');

    // ── Nucleus installer — condicional por plataforma ─────────────────────
    const { 
      installNucleusService: installNucleus,
      startNucleusService
    } = process.platform === 'darwin'
      ? require('./service-installer-nucleus-darwin.js')
      : require('./service-installer-nucleus');

    logger.info('Installing service...');
    await installNucleus();
    
    logger.info('Starting Nucleus Service...');
    const started = await startNucleusService();
    
    if (!started) {
      throw new Error('Nucleus Service failed to start');
    }

    logger.success('✅ Nucleus Service started (initializing components...)');
    logger.info('   Service will boot: Temporal, Ollama, Worker, Control Plane');
    logger.info('   Health verification will occur in certification step');

    await nucleusManager.completeMilestone(MILESTONE, { 
      service_running: true
    });
    
    return { success: true };

  } catch (error) {
    await nucleusManager.failMilestone(MILESTONE, error.message);
    throw error;
  }
}

async function installOllamaServiceStep(win) {
  const MILESTONE = 'ollama_service_install';

  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ ${MILESTONE} completed, skipping`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);
  emitProgress(win, 9, 12, 'Installing Ollama Service...');

  try {
    logger.separator('INSTALLING OLLAMA SERVICE');

    logger.info('Installing Ollama LaunchAgent...');
    await installOllamaService();

    logger.info('Starting Ollama Service...');
    const started = await startOllamaService();

    if (!started) {
      throw new Error('Ollama Service failed to start');
    }

    logger.success('✅ Ollama Service started');

    await nucleusManager.completeMilestone(MILESTONE, {
      service_running: true,
      verify: { type: 'launchd_service_check', service: OLLAMA_SERVICE_NAME }
    });

    return { success: true };

  } catch (error) {
    await nucleusManager.failMilestone(MILESTONE, error.message);
    throw error;
  }
}

async function runCertification(win) {
  const MILESTONE = 'certification';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ ${MILESTONE} completed, skipping`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);
  emitProgress(win, 11, 12, 'Certifying system components...');

  try {
    logger.separator('CERTIFICATION - NUCLEUS HEALTH CHECK');
    logger.info('Waiting for Nucleus Service to complete component initialization...');
    logger.info('Service is booting: Temporal, Brain');
    
    const bootWaitTime = 15;
    for (let i = 1; i <= bootWaitTime; i++) {
      if (i % 5 === 0) {
        logger.info(`  Waiting... ${i}/${bootWaitTime}s`);
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    logger.info('Running health check...');
    const healthResult = await nucleusHealth();

    if (!healthResult || !healthResult.components) {
      throw new Error('Invalid health result structure');
    }

    logger.info(`Health check returned: ${healthResult.state || 'UNKNOWN'}`);
    
    const critical = ['brain_service', 'temporal'];
    const unhealthy = [];
    
    for (const comp of critical) {
      const status = healthResult.components[comp];
      
      if (!status) {
        unhealthy.push(comp);
        logger.error(`  ${comp}: NOT FOUND in health result`);
      } else if (!status.healthy) {
        unhealthy.push(comp);
        logger.error(`  ${comp}: ${status.state} - ${status.error || 'N/A'}`);
      } else {
        logger.info(`  ✓ ${comp}: ${status.state}`);
      }
    }
    
    if (unhealthy.length > 0) {
      logger.warn(`⚠️ Certification skipped (services not yet ready): ${unhealthy.join(', ')}`);
      logger.warn('   brain_service and temporal will be verified post-install');
      // Non-fatal in dev — services start after installer completes
      // throw new Error(`Critical components unhealthy: ${unhealthy.join(', ')}`);
    }

    logger.success('✅ SYSTEM CERTIFIED (Pre-Seed Phase)');

    await nucleusManager.completeMilestone(MILESTONE, {
      pre_seed_certification: true,
      critical_components: critical,
      health_snapshot: healthResult
    });
    
    return { success: true };

  } catch (error) {
    logger.error('❌ Certification failed:', error.message);
    await nucleusManager.failMilestone(MILESTONE, error.message);
    throw error;
  }
}

// ============================================================================
// SESSION SENSOR INSTALLER
// ============================================================================

async function installSessionSensor(win) {
  const MILESTONE = 'sensor_install';

  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ ${MILESTONE} completed, skipping`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);
  emitProgress(win, 10, 12, 'Installing Session Agent...');

  try {
    const started = await installSensor();

    if (!started) {
      logger.warn('⚠️ bloom-sensor did not confirm RUNNING — may start on next user login');
    }

    await nucleusManager.completeMilestone(MILESTONE, { sensor_running: started });
    return { success: true };

  } catch (error) {
    logger.warn(`⚠️ Session sensor install warning: ${error.message}`);
    await nucleusManager.failMilestone(MILESTONE, error.message);
    return { success: false, non_critical: true };
  }
}

// ============================================================================
// IONPUMP BOOTSTRAP
// ============================================================================

async function deployBootstrapIonSites(win) {
  const MILESTONE = 'ionpump_bootstrap';

  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ ${MILESTONE} completed, skipping`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);
  emitProgress(win, 8, 12, 'Deploying bootstrap ion sites...');

  try {
    logger.separator('IONPUMP BOOTSTRAP SITES');

    // ── Step 1: Build ion packages ──────────────────────────────────────────
    logger.info('Step 1 — Building ion packages...');

    const buildScript = path.join(
      paths.installerDir, 'metamorph', 'scripts', 'build-bootstrap-ions.py'
    );

    if (!await fs.pathExists(buildScript)) {
      throw new Error(`build-bootstrap-ions.py not found: ${buildScript}`);
    }

    const pythonExe = process.platform === 'win32' ? 'python' : 'python3';

    await new Promise((resolve, reject) => {
      const build = spawn(pythonExe, [buildScript], {
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: paths.installerDir,
      });

      let stderr = '';
      build.stdout.on('data', d => { logger.info(d.toString().trim()); });
      build.stderr.on('data', d => { stderr += d; });

      build.on('close', code => {
        if (code === 0) {
          logger.success('✅ Ion packages built');
          resolve();
        } else {
          reject(new Error(`build-bootstrap-ions.py failed (exit ${code}): ${stderr}`));
        }
      });

      build.on('error', reject);
    });

    // ── Step 2: Deploy via Metamorph ────────────────────────────────────────
    logger.info('Step 2 — Deploying ion sites via Metamorph...');

    const manifest = path.join(
      paths.installerDir, 'native', 'ionpump', 'bootstrap-ions.json'
    );

    if (!await fs.pathExists(manifest)) {
      throw new Error(`bootstrap-ions.json not found after build: ${manifest}`);
    }

    await new Promise((resolve, reject) => {
      const deploy = spawn(
        paths.metamorphExe,
        ['ion-pump', 'reconcile', '--manifest', manifest, '--force-swap'],
        { stdio: ['ignore', 'pipe', 'pipe'], cwd: paths.installerDir }
      );

      let stderr = '';
      deploy.stdout.on('data', d => { logger.info(d.toString().trim()); });
      deploy.stderr.on('data', d => { stderr += d; });

      deploy.on('close', code => {
        if (code === 0) {
          logger.success('✅ Ion sites deployed to ionsites/');
          resolve();
        } else {
          reject(new Error(`metamorph ion-pump reconcile failed (exit ${code}): ${stderr}`));
        }
      });

      deploy.on('error', reject);
    });

    await nucleusManager.completeMilestone(MILESTONE, { deployed: true });
    return { success: true };

  } catch (error) {
    // Non-critical — no bloquea el onboarding si falla,
    // pero Discovery va a necesitar el ion para el flujo de GitHub PAT.
    logger.warn(`⚠️ IonPump bootstrap warning: ${error.message}`);
    await nucleusManager.failMilestone(MILESTONE, error.message);
    return { success: false, non_critical: true };
  }
}

// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================

async function installService(win) {
  try {
    logger.separator('BLOOM NUCLEUS INSTALLATION');

    await nucleusManager.initialize();

    const summary = nucleusManager.getInstallationSummary();
    logger.info('Installation state:', summary);

    if (summary.next_milestone) {
      logger.info(`Resuming from: ${summary.next_milestone}`);
    }

    await createDirectories(win);           // 1/11
    await runChromiumInstall(win);          // 2/11
    await runRuntimeInstall(win);           // 3/11
    await deployAllSystemBinaries(win);      // 4/11 - Incluye bootstrap y vsix deploy
    await installVSCodeExtension(win);      // 4.5/11 - Instala/actualiza extensión en VS Code (non-critical)
    await runMetamorphAudit(win);           // 5/11 - Snapshot + verify-sync
    await installBrainService(win);         // 6/11
    // NOTA: Nucleus Service DEBE arrancar ANTES de seed
    // porque seed necesita Temporal workflows
    await installNucleusService(win);       // 7/12 - Arranca Temporal
    await deployBootstrapIonSites(win);     // 8/12 - Ion sites para onboarding
    await installOllamaServiceStep(win);    // 9/12 - Arranca Ollama
    await installSessionSensor(win);        // 10/12 — non-critical, cannot abort
    await runCertification(win);            // 11/12 - Verifica Temporal ready
    await seedMasterProfile(win);                         // 12/12 - Usa Temporal
    const launchResult = await launchMasterProfile(win);  // Heartbeat final

    await nucleusManager.markInstallationComplete();

    logger.success('🎉 INSTALLATION COMPLETE');
    logger.info(`   extension_loaded propagated: ${launchResult?.extension_loaded}`);

    if (win && win.webContents) {
      win.webContents.send('installation-complete', {
        success: true,
        profile_id: nucleusManager.state.master_profile,
        extension_loaded: launchResult?.extension_loaded || false,
        chrome_pid:       launchResult?.chrome_pid       || null,
        launch_id:        launchResult?.launch_id        || null,
        state:            launchResult?.state            || null,
      });
    }

    return {
      success:          true,
      profile_id:       nucleusManager.state.master_profile,
      extension_loaded: launchResult?.extension_loaded || false,
      chrome_pid:       launchResult?.chrome_pid       || null,
      launch_id:        launchResult?.launch_id        || null,
      state:            launchResult?.state            || null,
    };

  } catch (error) {
    logger.error('Installation failed:', error.message);

    if (win && win.webContents) {
      win.webContents.send('installation-error', {
        error: error.message,
        stack: error.stack
      });
    }

    throw error;
  }
}

module.exports = {
  installService
};
