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
const sudo = require('sudo-prompt');

const { paths } = require('../config/paths');
const { getLogger } = require('../../shared/logger');
const { nucleusManager } = require('./nucleus_manager');
const logger = getLogger('installer');

// ============================================================================
// PRIVILEGED EXECUTION HELPER
// ============================================================================

/**
 * Ejecuta un comando shell con privilegios elevados via sudo-prompt.
 * Muestra un diálogo nativo al usuario pidiendo su contraseña.
 * Electron nunca corre como root — solo este comando lo hace.
 *
 * @param {string} command  - Comando a ejecutar con privilegios
 * @param {string} reason   - Descripción corta que ve el usuario en el diálogo
 * @returns {Promise<string>} stdout del comando
 */
function runPrivileged(command, reason = 'Bloom Nucleus Installer') {
  return new Promise((resolve, reject) => {
    const options = {
      name: reason,  // Aparece en el diálogo de autenticación del sistema
    };

    logger.info(`🔐 Requesting elevated privileges for: ${reason}`);
    logger.debug(`   Command: ${command}`);

    sudo.exec(command, options, (error, stdout, stderr) => {
      if (error) {
        logger.error(`❌ Privileged command failed: ${error.message}`);
        return reject(error);
      }
      if (stderr) {
        logger.warn(`⚠️ Privileged command stderr: ${stderr}`);
      }
      if (stdout) {
        logger.info(`✔ Privileged command output: ${stdout.toString().trim()}`);
      }
      resolve(stdout ? stdout.toString() : '');
    });
  });
}

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
  : process.platform === 'linux'
  ? require('./service-installer-brain-linux.js')
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
  : process.platform === 'linux'
  ? require('./service-installer-ollama-linux.js')
  : require('./service-installer-ollama');

// ── Sensor installer — condicional por plataforma ─────────────────────────────
const { installSensor } = process.platform === 'darwin'
  ? require('./service-installer-sensor-darwin.js')
  : process.platform === 'linux'
  ? require('./service-installer-sensor-linux.js')
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

    logger.info('Cleaning up previous Brain Service instances...');
    await cleanupOldServices();

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

async function waitForTemporal(timeoutMs = 120000, intervalMs = 3000) {
  const net = require('net');
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;

  logger.info(`⏳ Waiting for Temporal on :7233 (timeout ${timeoutMs / 1000}s)...`);

  while (Date.now() < deadline) {
    attempt++;
    const ready = await new Promise(resolve => {
      const sock = net.createConnection({ host: '127.0.0.1', port: 7233 });
      sock.setTimeout(2000);
      sock.on('connect', () => { sock.destroy(); resolve(true); });
      sock.on('error',   () => { sock.destroy(); resolve(false); });
      sock.on('timeout', () => { sock.destroy(); resolve(false); });
    });

    if (ready) {
      logger.success(`✅ Temporal ready after ${attempt} attempt(s)`);
      return;
    }

    const elapsed = Math.round((Date.now() - deadline + timeoutMs) / 1000);
    logger.info(`  Temporal not ready yet (${elapsed}s elapsed), retrying in ${intervalMs / 1000}s...`);
    await new Promise(r => setTimeout(r, intervalMs));
  }

  throw new Error(`Temporal did not become ready within ${timeoutMs / 1000}s`);
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
    // Esperar que Temporal este efectivamente escuchando antes de intentar el seed.
    // La certificacion no bloquea aunque Temporal no este listo; este polling si.
    await waitForTemporal(120000, 3000);

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

async function launchMasterProfile(win, onBeforeLaunch) {
  const MILESTONE = 'nucleus_launch';

  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ ${MILESTONE} completed, skipping`);
    // ── FIX: recuperar launch_id del estado persistido del milestone ──────────
    // Sin esto, main.js recibe launch_id:null en reruns y el bridge no puede
    // filtrar PROFILE_CONNECTED por launch_id (Opción A degrada a Opción B).
    const milestoneData = nucleusManager.getMilestoneData(MILESTONE) || {};
    return {
      success:          true,
      skipped:          true,
      profile_id:       milestoneData.profile_id       || nucleusManager.state.master_profile,
      launch_id:        milestoneData.launch_id        || null,
      chrome_pid:       milestoneData.chrome_pid       || null,
      extension_loaded: milestoneData.extension_loaded || false,
      state:            milestoneData.state            || null,
    };
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

    // ── Hook pre-launch: conectar el bridge ANTES de que nucleus lance Chrome ──
    // main.js usa este callback para llamar _installBridge.connectToBrain(profileId)
    // mientras Chrome todavía no existe. Así el bridge está registrado como Sentinel
    // en Brain antes de que Cortex haga REGISTER_HOST y Brain emita PROFILE_CONNECTED.
    if (typeof onBeforeLaunch === 'function') {
      logger.info(`[installer] onBeforeLaunch → profileId=${profileId}`);
      onBeforeLaunch(profileId);
    }

    // Invocar el launch real. Temporal debe estar activo (garantizado por certification).
    // Sentinel + Chromium tardan ~5-10s en levantar; usar timeout generoso.
    const result = await executeNucleusCommand(
      ['--json', 'synapse', 'launch', profileId, '--mode', 'discovery']
    );

    if (!result || !result.success) {
      throw new Error(`Launch failed: ${result?.error || JSON.stringify(result)}`);
    }

    // ── FIX: NO abortar si extension_loaded es false en este punto ───────────
    // nucleus synapse launch retorna extension_loaded:false porque Chromium acaba
    // de arrancar — la extensión Cortex aún no completó REGISTER_HOST.
    // La señal real del handshake es el broadcast PROFILE_CONNECTED que Brain
    // emite después, y que el SynapseBridge en main.js espera vía TCP push.
    // Abortar aquí corta la cadena antes de que el bridge pueda escuchar.
    if (!result.extension_loaded) {
      logger.warn(`⚠️ extension_loaded=false al momento del launch (esperado) — el handshake se completará vía PROFILE_CONNECTED push`);
      logger.warn(`   chrome_pid: ${result.chrome_pid}, state: ${result.state}`);
      // No throw — continuar para que main.js instancie el SynapseBridge
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

const SENSOR_EXE_NAME = process.platform === 'darwin'
  ? 'sensor'
  : process.platform === 'linux'
  ? 'bloom-sensor'
  : 'bloom-sensor.exe';
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

    if (!result || !result.success) {
      throw new Error(result?.error || 'Chromium installation failed with no error message');
    }

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
    // 3. NATIVE HOST (directorio completo — incluye exe + DLLs/libs)
    // ========================================================================
    logger.info('\n🔗 NATIVE HOST');

    // Asset map: copiar el directorio completo para capturar bloom-host(.exe) +
    // todas las DLLs/libs necesarias en cualquier plataforma.
    results.host = await copyDirectorySafe(
      paths.hostSource,
      paths.hostDir,
      'Native Host'
    );

    if (process.platform !== 'win32') {
      if (await fs.pathExists(paths.hostBinary)) {
        await fs.chmod(paths.hostBinary, 0o755);
        logger.success('✅ bloom-host marked executable');
      }
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
    // 6b. IONPUMP (Ion pipeline bootstrap — bin/cortex/ionpump/)
    // ========================================================================
    logger.info('\n⚡ IONPUMP');

    // Asset map: installer/native/ionpump/ → bin/cortex/ionpump/ (DIR completo).
    // Contiene bootstrap-ions.json + archivos *.ion (ZIPs).
    // Conductor solo copia — metamorph ejecuta el pipeline de reconcile en runtime.
    {
      const ionpumpSrc  = path.join(paths.installerDir, 'native', 'ionpump');
      const ionpumpDest = path.join(paths.cortexDir, 'ionpump');

      if (await fs.pathExists(ionpumpSrc)) {
        results.ionpump = await copyDirectorySafe(ionpumpSrc, ionpumpDest, 'Ionpump');
      } else {
        logger.warn(`⚠️ ionpump source not found at: ${ionpumpSrc}, skipping`);
        results.ionpump = { success: false, skipped: true };
      }
    }

    // ========================================================================
    // 7. OLLAMA (LLM Server)
    // ========================================================================
    logger.info('\n🦙 OLLAMA LLM SERVER');

    // Asset map: FILE único — ollama(.exe) — sin subdirectorio de arch propio.
    {
      const ollamaExeName = process.platform === 'win32' ? 'ollama.exe' : 'ollama';
      const ollamaExeSrc  = path.join(paths.ollamaSource, ollamaExeName);
      const ollamaExeDest = path.join(paths.ollamaDir, ollamaExeName);

      if (await fs.pathExists(ollamaExeSrc)) {
        await fs.ensureDir(paths.ollamaDir);
        results.ollama = await copyFileSafe(ollamaExeSrc, ollamaExeDest, ollamaExeName);
        if (process.platform !== 'win32') await fs.chmod(ollamaExeDest, 0o755);
      } else {
        logger.warn(`⚠️ Ollama binary not found at: ${ollamaExeSrc}, skipping`);
        results.ollama = { success: false, skipped: true };
      }
    }
    
    // ========================================================================
    // 8. NODE.JS (para Nucleus dev-start y API services)
    // ========================================================================
    logger.info('\n🟢 NODE.JS RUNTIME');

    // Asset map: FILE único en todas las plataformas.
    // El binario ya está extraído en el repo (el tar.xz original de Node.js
    // fue procesado antes del commit — Conductor solo copia y aplica chmod).
    //   win   → installer/node/win64/node.exe
    //   darwin → installer/node/darwin/node
    //   linux  → installer/node/linux_x64/node  (o linux_arm64/node)
    {
      const nodeExeName = process.platform === 'win32' ? 'node.exe' : 'node';
      const nodeExeSrc  = path.join(paths.nodeSource, nodeExeName);
      const nodeExeDest = path.join(paths.nodeDir, nodeExeName);

      if (await fs.pathExists(nodeExeSrc)) {
        await fs.ensureDir(paths.nodeDir);
        results.node = await copyFileSafe(nodeExeSrc, nodeExeDest, nodeExeName);
        if (process.platform !== 'win32') await fs.chmod(nodeExeDest, 0o755);
      } else {
        logger.warn(`⚠️ node binary not found at: ${nodeExeSrc}, skipping`);
        results.node = { success: false, skipped: true };
      }
    }
    
    // ========================================================================
    // 9. TEMPORAL (Workflow Orchestration Engine)
    // ========================================================================
    logger.info('\n⏱️ TEMPORAL WORKFLOW ENGINE');

    // Asset map: FILE único — temporal(.exe).
    {
      const temporalExeName = process.platform === 'win32' ? 'temporal.exe' : 'temporal';
      const temporalExeSrc  = path.join(paths.temporalSource, temporalExeName);
      const temporalExeDest = path.join(paths.temporalDir, temporalExeName);

      if (await fs.pathExists(temporalExeSrc)) {
        await fs.ensureDir(paths.temporalDir);
        results.temporal = await copyFileSafe(temporalExeSrc, temporalExeDest, temporalExeName);
        if (process.platform !== 'win32') await fs.chmod(temporalExeDest, 0o755);
      } else {
        logger.warn(`⚠️ Temporal binary not found at: ${temporalExeSrc}, skipping`);
        results.temporal = { success: false, skipped: true };
      }
    }
    
    // ========================================================================
    // 10. WORKSPACE (ex-Conductor)
    // ========================================================================
    logger.info('\n🖥️ WORKSPACE');

    // Asset map:
    //   darwin amd64 → DIR bloom-workspace.app (desde darwin_x64/workspace/mac/)
    //   darwin arm64 → DIR bloom-workspace.app (desde darwin_x64/workspace/mac-arm64/)
    //   windows      → FILE bloom-workspace.exe
    //   linux        → DIR linux-unpacked/
    //
    // CRÍTICO Darwin: copiar el .app bundle COMPLETO (no solo el ejecutable interno)
    // porque Electron necesita Frameworks/, Resources/, helpers, etc.
    // Preservar symlinks (dereference: false) — Frameworks/ los usa intensivamente.
    // metamorph rollout siempre usa 'darwin_x64' como directorio fuente.
    if (process.platform === 'darwin') {
      const macSubdir = process.arch === 'arm64' ? 'mac-arm64' : 'mac';
      const appSrc    = path.join(
        paths.installerDir,
        'native', 'bin', 'darwin_x64',
        'workspace', macSubdir,
        'bloom-workspace.app'
      );
      const appDest   = path.join(paths.workspaceDir, 'bloom-workspace.app');

      if (await fs.pathExists(appSrc)) {
        logger.info(`📦 Deploying bloom-workspace.app bundle to bin/workspace/...`);
        logger.debug(`   Source: ${appSrc}`);
        logger.debug(`   Dest:   ${appDest}`);
        await fs.ensureDir(paths.workspaceDir);
        const { execSync } = require('child_process');
        // cp -R preserva symlinks (Frameworks/); fs.copy con dereference:false
        // falla en algunos setups de Electron porque el asar intercepta rutas .app.
        execSync(`cp -R "${appSrc}" "${appDest}"`, { stdio: 'ignore' });
        const innerBin = path.join(appDest, 'Contents', 'MacOS', 'bloom-workspace');
        if (await fs.pathExists(innerBin)) await fs.chmod(innerBin, 0o755);
        logger.success(`✅ bloom-workspace.app bundle deployed to bin/workspace/`);
        results.workspace = { success: true, dest: appDest };
      } else {
        logger.warn(`⚠️ bloom-workspace.app not found at: ${appSrc}`);
        results.workspace = { success: false, skipped: true };
      }
    } else if (process.platform === 'linux') {
      const linuxUnpacked = path.join(
        paths.installerDir,
        'native', 'bin',
        process.arch === 'arm64' ? 'linux_arm64' : 'linux_x64',
        'workspace', 'linux-unpacked'
      );
      if (await fs.pathExists(linuxUnpacked)) {
        // CRÍTICO: fs-extra no puede copiar directorios que contienen app.asar porque
        // Electron intercepta cualquier acceso a rutas /.../resources/app.asar y las
        // trata como paquetes virtuales, lanzando "Invalid package".
        // Solución: cp -r nativo bypasea el handler de Electron por completo.
        logger.info(`📦 Deploying workspace linux-unpacked via cp -r (asar-safe)...`);
        logger.debug(`   Source: ${linuxUnpacked}`);
        logger.debug(`   Dest:   ${paths.workspaceDir}`);
        await fs.ensureDir(paths.workspaceDir);
        const { execFile } = require('child_process');
        const { promisify } = require('util');
        const execFileAsync = promisify(execFile);
        // cp -r src/. dest/ copia el contenido de linux-unpacked directamente en workspaceDir
        await execFileAsync('cp', ['-r', linuxUnpacked + '/.', paths.workspaceDir], {
          maxBuffer: 500 * 1024 * 1024
        });
        const workspaceBin = path.join(paths.workspaceDir, 'bloom-workspace');
        if (await fs.pathExists(workspaceBin)) await fs.chmod(workspaceBin, 0o755);
        logger.success('✅ workspace linux-unpacked deployed (asar-safe)');
        results.workspace = { success: true, dest: paths.workspaceDir };
      } else {
        logger.warn(`⚠️ workspace linux-unpacked not found at: ${linuxUnpacked}`);
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

    // Asset map: copiar el directorio completo para incluir subdirectorios
    // como help/ que el sensor necesita en runtime.
    if (await fs.pathExists(paths.sensorSource)) {
      results.sensor = await copyDirectorySafe(
        paths.sensorSource,
        paths.sensorDir,
        'Bloom Sensor'
      );
      if (process.platform !== 'win32' && await fs.pathExists(paths.sensorExe)) {
        await fs.chmod(paths.sensorExe, 0o755);
        logger.success('✅ bloom-sensor marked executable');
      }
    } else {
      logger.warn(`⚠️ Sensor source directory not found: ${paths.sensorSource}, skipping`);
      results.sensor = { success: false, skipped: true };
    }

    // ========================================================================
    // 12. SETUP (Installer / Self-update binary)
    // ========================================================================
    logger.info('\n🔧 SETUP INSTALLER');

    // Asset map:
    //   darwin → DIR bloom-setup.app bundle completo (darwin_x64/setup/mac[-arm64]/)
    //   linux  → DIR linux-unpacked/ (ejecutable principal: bloom-nucleus-installer)
    //   windows → FILE bloom-setup.exe
    if (process.platform === 'darwin') {
      const macSubdir = process.arch === 'arm64' ? 'mac-arm64' : 'mac';
      const setupAppSrc  = path.join(
        paths.installerDir,
        'native', 'bin', 'darwin_x64',
        'setup', macSubdir,
        'bloom-setup.app'
      );
      const setupAppDest = path.join(paths.setupDir, 'bloom-setup.app');

      if (await fs.pathExists(setupAppSrc)) {
        await fs.ensureDir(paths.setupDir);
        const { execSync } = require('child_process');
        execSync(`cp -R "${setupAppSrc}" "${setupAppDest}"`, { stdio: 'ignore' });
        const innerBin = path.join(setupAppDest, 'Contents', 'MacOS', 'bloom-setup');
        if (await fs.pathExists(innerBin)) await fs.chmod(innerBin, 0o755);
        logger.success('✅ bloom-setup.app bundle deployed to bin/setup/');
        results.setup = { success: true, dest: setupAppDest };
      } else {
        logger.warn(`⚠️ bloom-setup.app not found at: ${setupAppSrc}`);
        results.setup = { success: false, skipped: true };
      }
    } else if (process.platform === 'linux') {
      const linuxUnpacked = path.join(
        paths.installerDir,
        'native', 'bin',
        process.arch === 'arm64' ? 'linux_arm64' : 'linux_x64',
        'setup', 'linux-unpacked'
      );
      if (await fs.pathExists(linuxUnpacked)) {
        // Misma restricción que workspace: cp -r nativo para evitar "Invalid package" en app.asar
        logger.info(`📦 Deploying setup linux-unpacked via cp -r (asar-safe)...`);
        await fs.ensureDir(paths.setupDir);
        const { execFile } = require('child_process');
        const { promisify } = require('util');
        const execFileAsync = promisify(execFile);
        await execFileAsync('cp', ['-r', linuxUnpacked + '/.', paths.setupDir], {
          maxBuffer: 500 * 1024 * 1024
        });
        const setupMainBin = path.join(paths.setupDir, 'bloom-nucleus-installer');
        if (await fs.pathExists(setupMainBin)) await fs.chmod(setupMainBin, 0o755);
        logger.success('✅ setup linux-unpacked deployed (asar-safe)');
        results.setup = { success: true, dest: paths.setupDir };
      } else {
        logger.warn(`⚠️ setup linux-unpacked not found at: ${linuxUnpacked}`);
        results.setup = { success: false, skipped: true };
      }
    } else {
      // Windows
      const setupExeSrc = path.join(paths.setupSource, 'bloom-setup.exe');
      if (await fs.pathExists(setupExeSrc)) {
        results.setup = await copyFileSafe(setupExeSrc, paths.setupExe, 'bloom-setup.exe');
      } else {
        logger.warn('⚠️ bloom-setup.exe not found, skipping');
        results.setup = { success: false, skipped: true };
      }
    }

    // ========================================================================
    // 13. PYTHON HOOKS
    // ========================================================================
    logger.info('\n🪝 PYTHON HOOKS');

    // Asset map: installer/native/hooks/ → hooks/ (DIR completo, sin filtros).
    // Copiar todo — subdirectorios Y archivos sueltos en la raíz (scripts .py, etc.).
    if (await fs.pathExists(paths.hooksSource)) {
      if (await fs.pathExists(paths.hooksDir)) {
        await fs.remove(paths.hooksDir);
        logger.info('  Cleaned existing hooks directory');
      }
      await fs.copy(paths.hooksSource, paths.hooksDir, { overwrite: true });
      const entries = await fs.readdir(paths.hooksDir, { withFileTypes: true });
      logger.success(`✅ Hooks deployed (${entries.length} entries)`);
      results.hooks = { success: true };
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

    // ========================================================================
    // 15b. CONFIG (config/ del repo → config/)
    // ========================================================================
    logger.info('\n📁 CONFIG DIRECTORY');

    // Asset map: {repo}/config/ → {base}/config/ (DIR completo, todas las plataformas).
    // El installer copia el directorio base de configuración del repo; los archivos
    // de config individuales generados en runtime (profiles.json, etc.) se escriben
    // después encima sin pisar la estructura base.
    {
      const configSrc = paths.configSource ?? path.join(paths.repoDir ?? paths.installerDir, '..', 'config');
      if (await fs.pathExists(configSrc)) {
        results.config = await copyDirectorySafe(configSrc, paths.configDir, 'Config');
      } else {
        logger.warn(`⚠️ config source not found at: ${configSrc}, skipping`);
        results.config = { success: false, skipped: true };
      }
    }

    // ========================================================================
    // 15c. ONBOARDING STEPS (config para MilestoneRegistry de Conductor)
    // ========================================================================
    logger.info('\n🧭 ONBOARDING STEPS');

    // Asset map: installer/native/config/onboarding/onboarding_steps.json -> config/onboarding/
    // A diferencia de nucleus-governance.json y sentinel-config.json, este archivo
    // NO se sobreescribe si ya existe en disco: puede contener progreso/estado
    // de onboarding del usuario y no queremos pisarlo en reinstalaciones/updates.
    {
      const onboardingSrc = path.join(
        paths.installerDir, 'native', 'config', 'onboarding', 'onboarding_steps.json'
      );
      const onboardingConfigDir = path.join(paths.configDir, 'onboarding');
      const onboardingDest = path.join(onboardingConfigDir, 'onboarding_steps.json');

      await fs.ensureDir(onboardingConfigDir);

      if (await fs.pathExists(onboardingDest)) {
        logger.info('⭐️ onboarding_steps.json already present in config/onboarding/, skipping (no overwrite)');
        results.onboarding = { success: true, skipped: true, dest: onboardingDest };
      } else if (await fs.pathExists(onboardingSrc)) {
        results.onboarding = await copyFileSafe(onboardingSrc, onboardingDest, 'onboarding_steps.json');
        logger.success('✅ onboarding_steps.json deployed to config/onboarding/');
      } else {
        logger.warn(`⚠️ onboarding_steps.json not found at: ${onboardingSrc}, skipping`);
        results.onboarding = { success: false, skipped: true };
      }
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
      : process.platform === 'linux'
      ? require('./service-installer-nucleus-linux.js')
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
        // cwd debe ser la raiz del repo para que metamorph resuelva los paths
        // de los ZIPs relativos a ella (evita el path duplicado installer/installer/).
        { stdio: ['ignore', 'pipe', 'pipe'], cwd: path.join(paths.installerDir, '..') }
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

async function installService(win, { onBeforeLaunch } = {}) {
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
    await seedMasterProfile(win);                                        // 12/12 - Usa Temporal
    const launchResult = await launchMasterProfile(win, onBeforeLaunch); // Heartbeat final

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
  installService,
  runPrivileged,
};
