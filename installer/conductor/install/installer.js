// installer.js - REFACTORED: Sentinel Delegation
// Fases 1-7: Electron instala software base (incluyendo sentinel.exe + blueprint.json)
// Fases 8-9: Sentinel crea perfiles, lanza y valida

const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');

const { paths } = require('../config/paths');
const { isElevated, relaunchAsAdmin } = require('../core/admin-utils');
const { getLogger } = require('../src/logger');

const logger = getLogger('installer');

const {
  cleanupOldServices,
  installWindowsService,
  startService,
  killAllBloomProcesses
} = require('./service-installer');

const { installRuntime } = require('./runtime-installer');
const { installExtension } = require('./extension-installer');
const { installChromium } = require('./chromium-installer');

const APP_VERSION = app?.getVersion() || process.env.npm_package_version || '1.0.0';

// ============================================================================
// BINARY VERSION UTILITIES
// ============================================================================
async function getBinaryVersion(exePath) {
  if (!await fs.pathExists(exePath)) {
    return 'not_found';
  }

  try {
    const stats = await fs.stat(exePath);
    const fileSize = stats.size;
    const modifiedTime = stats.mtime.toISOString();

    // Intentar ejecutar --version si es posible
    return new Promise((resolve) => {
      const child = spawn(exePath, ['--version'], {
        timeout: 3000,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore']
      });

      let output = '';
      child.stdout.on('data', (data) => { output += data.toString(); });

      child.on('close', () => {
        const version = output.trim() || `size:${fileSize}`;
        resolve({
          version,
          size: fileSize,
          modified: modifiedTime
        });
      });

      child.on('error', () => {
        resolve({
          version: `size:${fileSize}`,
          size: fileSize,
          modified: modifiedTime
        });
      });
    });
  } catch (err) {
    return {
      version: 'error',
      error: err.message
    };
  }
}

// ============================================================================
// SENTINEL UTILITIES
// ============================================================================
function getSentinelExecutablePath() {
  return path.join(paths.binDir, 'sentinel', 'sentinel.exe');
}

function parseCLIJson(stdout) {
  try {
    const lines = stdout.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          return JSON.parse(trimmed);
        } catch {
          continue;
        }
      }
    }

    const potentialJsons = stdout.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g) || [];
    if (potentialJsons.length > 0) {
      for (const candidate of potentialJsons) {
        try {
          return JSON.parse(candidate);
        } catch {
          continue;
        }
      }
    }

    let depth = 0;
    let start = -1;

    for (let i = 0; i < stdout.length; i++) {
      if (stdout[i] === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (stdout[i] === '}') {
        depth--;
        if (depth === 0 && start !== -1) {
          try {
            return JSON.parse(stdout.substring(start, i + 1));
          } catch {
            start = -1;
          }
        }
      }
    }

    throw new Error('No valid JSON found in Sentinel output');
  } catch (error) {
    throw new Error(`JSON parse failed: ${error.message}`);
  }
}

async function executeSentinelCommand(args) {
  return new Promise((resolve, reject) => {
    const sentinelExe = getSentinelExecutablePath();

    if (!fs.existsSync(sentinelExe)) {
      return reject(new Error(`Sentinel executable not found: ${sentinelExe}`));
    }

    logger.info(`Executing Sentinel: ${args.join(' ')}`);

    const child = spawn(sentinelExe, args, {
      cwd: path.dirname(sentinelExe),
      env: {
        ...process.env,
        LOCALAPPDATA: process.env.LOCALAPPDATA
      },
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data;
      logger.debug('[Sentinel stdout]', data.trim());
    });

    child.stderr.on('data', (data) => {
      stderr += data;
      logger.error('[Sentinel stderr]', data.trim());
    });

    child.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Sentinel command failed (code ${code}): ${stderr.trim() || 'no error message'}`));
      }

      try {
        const result = parseCLIJson(stdout);
        resolve(result);
      } catch (e) {
        reject(new Error(`Failed to parse Sentinel JSON: ${e.message}\n(raw: ${stdout.substring(0, 250)}...)`));
      }
    });

    child.on('error', (err) => reject(err));

    setTimeout(() => {
      if (!child.killed) {
        child.kill();
        reject(new Error('Sentinel command timeout after 30 seconds'));
      }
    }, 30000);
  });
}

// ============================================================================
// PROGRESS REPORTING
// ============================================================================
const INSTALLATION_STEPS = [
  { key: 'cleanup',            percentage: 0,   message: '🧹 Cleaning previous installation...' },
  { key: 'directories',        percentage: 8,   message: '📁 Creating directory structure...' },
  { key: 'chromium',           percentage: 20,  message: '🌐 Installing Chromium browser...' },
  { key: 'extension-template', percentage: 35,  message: '🧩 Preparing extension template...' },
  { key: 'brain-runtime',      percentage: 50,  message: '⚙️ Installing Brain runtime...' },
  { key: 'binaries',           percentage: 65,  message: '📦 Deploying binaries (Brain, Native, Sentinel)...' },
  { key: 'service',            percentage: 78,  message: '🚀 Installing & starting Windows service...' },
  { key: 'sentinel-handoff',   percentage: 88,  message: '🤖 Sentinel creating profile...' },
  { key: 'validation',         percentage: 95,  message: '✔️ Validating installation...' },
  { key: 'complete',           percentage: 100, message: '🎉 Installation completed!' }
];

function emitProgress(mainWindow, stepKey, detail = '') {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const step = INSTALLATION_STEPS.find(s => s.key === stepKey);
  if (!step) return;

  const stepIndex = INSTALLATION_STEPS.indexOf(step);
  const total = INSTALLATION_STEPS.length;

  mainWindow.webContents.send('installation-progress', {
    step: stepIndex + 1,
    total,
    percentage: step.percentage,
    message: step.message,
    detail: detail || ''
  });

  logger.info(`[${step.percentage}%] ${step.message}${detail ? ` → ${detail}` : ''}`);
}

// ============================================================================
// INDIVIDUAL STEPS (1–7)
// ============================================================================
async function createDirectories() {
  const dirs = [
    paths.bloomBase,
    paths.engineDir,
    paths.runtimeDir,
    paths.binDir,
    path.join(paths.binDir, 'brain'),
    path.join(paths.binDir, 'native'),
    path.join(paths.binDir, 'extension'),
    path.join(paths.binDir, 'sentinel'),
    paths.configDir,
    paths.profilesDir,
    paths.logsDir
  ];

  for (const dir of dirs) {
    await fs.ensureDir(dir);
  }
  logger.success('Directory structure created');
}

async function cleanNativeDir() {
  const nativeDir = path.join(paths.binDir, 'native');
  
  if (await fs.pathExists(nativeDir)) {
    // Intentar limpieza con manejo de archivos bloqueados
    try {
      await fs.emptyDir(nativeDir);
      logger.success('Native directory cleaned');
    } catch (error) {
      if (error.code === 'EPERM' || error.code === 'EBUSY') {
        logger.warn('Some files in native dir are locked - attempting forced cleanup');
        
        // Reintentar después de esperar
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        try {
          await fs.emptyDir(nativeDir);
          logger.success('Native directory cleaned (retry succeeded)');
        } catch (retryError) {
          logger.warn('Could not fully clean native dir - will overwrite files instead');
        }
      } else {
        throw error;
      }
    }
  } else {
    await fs.ensureDir(nativeDir);
    logger.success('Native directory created');
  }
}

async function deployExtensionTemplate() {
  const templateDir = path.join(paths.binDir, 'extension');
  if (await fs.pathExists(templateDir)) {
    await fs.emptyDir(templateDir);
  }
  await installExtension();
  logger.success(`Extension template deployed → ${templateDir}`);
}

// ============================================================================
// SOVEREIGN RUNTIME PROVISIONING
// ============================================================================

/**
 * Mapeo de componentes soberanos con sus manifests de verificación
 */
const SOVEREIGN_COMPONENTS = {
  sentinel: {
    sourceSubpath: 'sentinel',
    destSubpath: 'sentinel',
    criticalFiles: ['sentinel.exe', 'blueprint.json', 'help/sentinel_help.json']
  },
  nucleus: {
    sourceSubpath: 'nucleus',
    destSubpath: 'nucleus',
    criticalFiles: ['nucleus.exe', 'blueprint.json', 'help/nucleus_help.json']
  },
  brain: {
    sourceSubpath: 'brain',
    destSubpath: 'brain',
    criticalFiles: [
      'brain.exe',
      'help/brain-ai-full.json',
      'help/brain-ai-schema.json',
      'help/brain-legacy.json'
    ]
  },
  host: {
    sourceSubpath: 'host',
    destSubpath: 'native',
    criticalFiles: ['bloom-host.exe']
  },
  cortex: {
    sourceSubpath: 'cortex',
    destSubpath: 'cortex',
    criticalFiles: ['bloom-cortex.blx'],
    immutable: true
  }
};

/**
 * Obtiene directorio base de binarios según entorno
 */
function getNativeBinariesRoot() {
  const platform = os.platform();
  const arch = process.arch;

  // Determinar OS path
  let osPath;
  if (platform === 'win32') {
    osPath = 'win32';
  } else if (platform === 'linux') {
    osPath = 'linux';
  } else if (platform === 'darwin') {
    osPath = arch === 'arm64' ? 'darwin/arm64' : 'darwin/x64';
  } else {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  // Determinar base path según packaging
  let basePath;
  if (app.isPackaged) {
    basePath = path.join(process.resourcesPath, 'native', 'bin');
  } else {
    basePath = path.join(__dirname, '..', '..', 'native', 'bin');
  }

  return path.join(basePath, osPath);
}

/**
 * Verifica integridad de componente desplegado (Smoke Test)
 */
async function verifySovereignComponent(componentName, destDir, manifest) {
  const missing = [];
  
  for (const criticalFile of manifest.criticalFiles) {
    const filePath = path.join(destDir, criticalFile);
    
    if (!await fs.pathExists(filePath)) {
      missing.push(criticalFile);
      continue;
    }

    // Verificar tamaño > 0 (especialmente para .blx)
    const stats = await fs.stat(filePath);
    if (stats.size === 0) {
      throw new Error(`Critical file '${criticalFile}' is empty (0 bytes)`);
    }

    // Si es componente inmutable, aplicar read-only
    if (manifest.immutable && process.platform === 'win32') {
      try {
        await applyReadOnlyAttribute(filePath);
        logger.info(`🔒 ${criticalFile} set as read-only (immutable)`);
      } catch (err) {
        logger.warn(`Could not set read-only: ${err.message}`);
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Component '${componentName}' deployment FAILED - Missing critical files: ${missing.join(', ')}`
    );
  }

  logger.success(`✓ ${componentName} integrity verified`);
}

/**
 * Aplica atributo read-only en Windows
 */
async function applyReadOnlyAttribute(filePath) {
  if (process.platform !== 'win32') return;

  return new Promise((resolve, reject) => {
    const { exec } = require('child_process');
    exec(`attrib +R "${filePath}"`, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Aplica permisos ejecutables en sistemas Unix
 */
async function applyUnixPermissions(destDir) {
  if (process.platform === 'win32') return;

  try {
    const files = await fs.readdir(destDir, { withFileTypes: true });
    
    for (const file of files) {
      const filePath = path.join(destDir, file.name);
      
      if (file.isFile() && !file.name.includes('.')) {
        // Binario sin extensión (Unix)
        await fs.chmod(filePath, 0o755);
      } else if (file.isDirectory()) {
        // Recursivo en subdirectorios
        await applyUnixPermissions(filePath);
      }
    }
  } catch (err) {
    logger.warn(`Could not apply Unix permissions: ${err.message}`);
  }
}

/**
 * DEPLOYMENT ATÓMICO DE RUNTIME SOBERANO
 */
async function deployBinaries() {
  logger.separator('SOVEREIGN RUNTIME PROVISIONING');
  
  const nativeBinRoot = getNativeBinariesRoot();
  logger.info(`Source root: ${nativeBinRoot}`);
  logger.info(`Destination: ${paths.binDir}`);

  // Verificar que origen existe
  if (!await fs.pathExists(nativeBinRoot)) {
    throw new Error(`Native binaries root not found: ${nativeBinRoot}`);
  }

  let deployedCount = 0;

  // Deployment atómico de cada componente
  for (const [componentName, manifest] of Object.entries(SOVEREIGN_COMPONENTS)) {
    logger.info(`Deploying ${componentName}...`);

    const sourceDir = path.join(nativeBinRoot, manifest.sourceSubpath);
    const destDir = path.join(paths.binDir, manifest.destSubpath);

    // Verificar que origen del componente existe
    if (!await fs.pathExists(sourceDir)) {
      throw new Error(`Component source not found: ${sourceDir}`);
    }

    // Crear destino si no existe
    await fs.ensureDir(destDir);

    // COPIA RECURSIVA ATÓMICA (incluye help/, _internal/, DLLs)
    await fs.copy(sourceDir, destDir, {
      overwrite: true,
      recursive: true,
      preserveTimestamps: true
    });

    // SMOKE TEST: Verificar archivos críticos
    await verifySovereignComponent(componentName, destDir, manifest);

    // Unix: Aplicar permisos ejecutables
    await applyUnixPermissions(destDir);

    deployedCount++;
    
    // Log especial para Cortex (núcleo cognitivo)
    if (componentName === 'cortex') {
      const blxPath = path.join(destDir, 'bloom-cortex.blx');
      const stats = await fs.stat(blxPath);
      logger.success(`[CORTEX] Núcleo cognitivo desplegado en bin/cortex/ (${Math.round(stats.size / 1024)}KB)`);
    } else {
      logger.success(`${componentName} deployed → ${destDir}`);
    }
  }

  // NSSM (Windows service manager)
  if (process.platform === 'win32') {
    logger.info('Deploying NSSM...');
    
    if (!await fs.pathExists(paths.nssmExe)) {
      throw new Error(`NSSM not found: ${paths.nssmExe}`);
    }
    
    const nssmDest = path.join(paths.binDir, 'native', 'nssm.exe');
    await fs.copy(paths.nssmExe, nssmDest, { overwrite: true });
    
    logger.success('NSSM deployed');
  }

  logger.separator(`SOVEREIGN RUNTIME READY (${deployedCount} components)`);
}

// ============================================================================
// LAUNCHER SELF-DEPLOYMENT
// ============================================================================

/**
 * Despliega el ejecutable actual como launcher permanente
 */
async function deployLauncher(binDir) {
  logger.separator('LAUNCHER DEPLOYMENT');
  
  const launcherDir = path.join(binDir, 'launcher');
  await fs.ensureDir(launcherDir);

  // SELF-COPY: Copiar ejecutable actual
  const currentExe = process.execPath;
  const launcherExe = path.join(launcherDir, 'bloom-launcher.exe');

  logger.info(`Self-deploying: ${currentExe} → ${launcherExe}`);
  
  try {
    await fs.copy(currentExe, launcherExe, { overwrite: true });
  } catch (err) {
    throw new Error(`Failed to copy launcher executable: ${err.message}`);
  }

  // VERIFICACIÓN
  if (!await fs.pathExists(launcherExe)) {
    throw new Error('Launcher deployment failed: executable not found after copy');
  }

  const stats = await fs.stat(launcherExe);
  logger.success(`Launcher deployed (${Math.round(stats.size / 1024 / 1024)}MB)`);

  // SHORTCUTS
  await createSystemShortcuts(launcherExe);

  logger.separator('LAUNCHER READY');
}

/**
 * Crea accesos directos del sistema (Escritorio + Start Menu)
 */
async function createSystemShortcuts(launcherExe) {
  if (process.platform !== 'win32') {
    logger.info('Skipping shortcuts (non-Windows platform)');
    return;
  }

  logger.info('Creating system shortcuts...');

  const shell = require('electron').shell;
  const desktopPath = path.join(os.homedir(), 'Desktop');
  const startMenuPath = path.join(
    process.env.APPDATA,
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs'
  );

  const shortcutName = 'Bloom Nucleus.lnk';
  const targets = [
    { path: path.join(desktopPath, shortcutName), name: 'Desktop' },
    { path: path.join(startMenuPath, shortcutName), name: 'Start Menu' }
  ];

  for (const target of targets) {
    try {
      await createWindowsShortcut(launcherExe, target.path);
      logger.success(`✓ ${target.name} shortcut created`);
    } catch (err) {
      logger.warn(`Could not create ${target.name} shortcut: ${err.message}`);
    }
  }
}

/**
 * Crea shortcut Windows usando shell32 COM
 */
async function createWindowsShortcut(targetExe, shortcutPath) {
  return new Promise((resolve, reject) => {
    // Usar PowerShell para crear shortcut con argumentos
    const ps = spawn('powershell.exe', [
      '-NoProfile',
      '-Command',
      `$ws = New-Object -ComObject WScript.Shell; ` +
      `$s = $ws.CreateShortcut('${shortcutPath}'); ` +
      `$s.TargetPath = '${targetExe}'; ` +
      `$s.Arguments = '--launch'; ` +
      `$s.WorkingDirectory = '${path.dirname(targetExe)}'; ` +
      `$s.Description = 'Bloom Nucleus - AI Browser Automation'; ` +
      `$s.Save()`
    ], {
      windowsHide: true,
      timeout: 5000
    });

    let stderr = '';
    ps.stderr.on('data', (data) => { stderr += data; });

    ps.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`PowerShell failed (code ${code}): ${stderr}`));
      } else {
        resolve();
      }
    });

    ps.on('error', reject);
  });
}


// ============================================================================
// MAIN INSTALL FLOW
// ============================================================================
async function runFullInstallation(mainWindow = null) {
  if (process.platform === 'win32' && !(await isElevated())) {
    logger.warn('Admin privileges required → relaunching elevated');
    relaunchAsAdmin();
    return { success: false, relaunching: true, message: 'Relaunching as Administrator...' };
  }

  logger.separator('BLOOM NUCLEUS INSTALLATION START');
  logger.info(`Version:     ${APP_VERSION}`);
  logger.info(`Install dir: ${paths.bloomBase}`);

  try {
    // 1. Cleanup - CRÍTICO: Detener servicios ANTES de borrar archivos
    emitProgress(mainWindow, 'cleanup');
    await cleanupOldServices();  // Detiene y desinstala servicios
    await killAllBloomProcesses();  // Mata procesos restantes
    
    // Esperar a que archivos se liberen
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await cleanNativeDir();  // Ahora sí es seguro limpiar

    // 2. Directories
    emitProgress(mainWindow, 'directories');
    await createDirectories();

    // 3. Chromium
    emitProgress(mainWindow, 'chromium');
    const chromiumResult = await installChromium();
    if (!chromiumResult?.success) {
      throw new Error(`Chromium installation failed: ${chromiumResult?.error || 'unknown'}`);
    }

    // 4. Extension template
    emitProgress(mainWindow, 'extension-template');
    await deployExtensionTemplate();

    // 5. Python runtime
    emitProgress(mainWindow, 'brain-runtime');
    await installRuntime();

    // 6. Binaries (incluye sentinel + blueprint)
    emitProgress(mainWindow, 'binaries');
    await deployBinaries();

    // 7. Service
    emitProgress(mainWindow, 'service');
    await installWindowsService();
    const started = await startService();
    if (!started) {
      throw new Error('Failed to start Brain service');
    }

    // 7.5. Crear nucleus.json ANTES de seed (Brain lo requiere)
    logger.info('Creating minimal nucleus.json for Brain...');
    const nucleusPath = path.join(paths.configDir, 'nucleus.json');
    const nucleusConfig = {
      timestamp: new Date().toISOString(),
      onboarding_completed: false,
      executables_valid: true,
      master_profile: null,  // Se llenará después de seed
      system_map: {
        brain_exe: path.join(paths.binDir, 'brain', 'brain.exe'),
        brain_service: 'running',
        browser_engine: 'chromium',
        chrome_exe: chromiumResult.chromiumPath,
        extension_id: null,  // Se llenará en seed
        operational_mode: 'production'
      },
      services: [
        { name: 'Core Bridge', port: 5678, active: true },
        { name: 'Extension API', port: 3001, active: false },
        { name: 'Svelte Dev', port: 5173, active: false }
      ]
    };

    await fs.writeJson(nucleusPath, nucleusConfig, { spaces: 2 });
    logger.success('nucleus.json created (minimal)');

    // 8. Sentinel profile creation
    emitProgress(mainWindow, 'sentinel-handoff');
    const seedResult = await executeSentinelCommand([
      '--json',
      'seed',
      'MasterWorker',
      'true'
    ]);

    if (!seedResult?.success) {
      throw new Error(`Sentinel seed failed: ${seedResult?.error || 'unknown'}`);
    }

    const profileId = seedResult.data?.uuid || seedResult.data?.id;
    if (!profileId) {
      throw new Error('No profile ID returned by Sentinel');
    }

    logger.success(`Profile created: ${profileId}`);

    // Actualizar nucleus.json con profileId y versiones
    nucleusConfig.master_profile = profileId;
    nucleusConfig.timestamp = new Date().toISOString();
    
    // SNAPSHOT DE VERSIONES (Manifest de Binarios)
    nucleusConfig.binary_versions = {
      brain: await getBinaryVersion(path.join(paths.binDir, 'brain', 'brain.exe')),
      sentinel: await getBinaryVersion(path.join(paths.binDir, 'sentinel', 'sentinel.exe')),
      host: await getBinaryVersion(path.join(paths.binDir, 'native', 'bloom-host.exe')),
      chromium: chromiumResult.version || 'unknown'
    };
    
    // INSTALACIÓN COMPLETADA, ONBOARDING PENDIENTE
    nucleusConfig.installation = {
      completed: true,
      completed_at: new Date().toISOString()
    };
    nucleusConfig.onboarding = {
      completed: false,
      started: false
    };
    
    await fs.writeJson(nucleusPath, nucleusConfig, { spaces: 2 });
    logger.success('nucleus.json updated: installation.completed=true, onboarding.completed=false');

    // 9. DISCOVERY HEARTBEAT (Validación Silenciosa)
    emitProgress(mainWindow, 'validation', 'Discovery heartbeat test');
    logger.info('Launching discovery heartbeat (--override-heartbeat=true)...');
    
    const discoveryResult = await executeSentinelCommand([
      '--json',
      'launch',
      profileId,
      '--mode', 'discovery',
      '--override-heartbeat=true',
      '--override-register=false'
    ]);

    if (!discoveryResult?.success) {
      logger.warn(`Discovery launch warning: ${discoveryResult?.error || 'unknown'}`);
    }

    // Esperar 5 segundos para que handshake complete
    logger.info('Waiting 5s for handshake to complete...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // CERTIFICACIÓN: Health check final
    emitProgress(mainWindow, 'validation', 'Certificación de tubería');
    const health = await executeSentinelCommand(['--json', 'health']);

    if (!health.connected) {
      throw new Error('Health check failed: Brain service not responding');
    }

    logger.success(`✅ CERTIFICADO: Tubería Brain-Sentinel-Host operativa (port ${health.port})`);
    logger.info(`Profiles registered: ${health.profiles_registered || 0}`);

    // 10. LAUNCHER SELF-DEPLOYMENT & SHORTCUTS
    emitProgress(mainWindow, 'complete', 'Deploying launcher');
    await deployLauncher(paths.binDir);

    emitProgress(mainWindow, 'complete', 'Installation complete');
    logger.separator('INSTALLATION COMPLETED SUCCESSFULLY');
    logger.separator('INSTALLATION COMPLETED SUCCESSFULLY');

    return {
      success: true,
      profileId,
      chromiumPath: chromiumResult.chromiumPath,
      version: APP_VERSION
    };

  } catch (err) {
    logger.separator('INSTALLATION FAILED');
    logger.error(err.message);
    if (err.stack) logger.error(err.stack);

    try { await cleanupOldServices(); } catch {}

    return {
      success: false,
      error: err.message,
      stack: err.stack
    };
  }
}

module.exports = {
  runFullInstallation,
  createDirectories,
  cleanNativeDir,
  deployBinaries,
  executeSentinelCommand
};