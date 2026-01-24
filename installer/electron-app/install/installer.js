// installer.js - REFACTORED: Sentinel Delegation
// Fases 1-7: Electron instala software base (incluyendo sentinel.exe + blueprint.json)
// Fases 8-9: Sentinel crea perfiles, lanza y valida

const path = require('path');
const fs = require('fs-extra');
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
    await fs.emptyDir(nativeDir);
  } else {
    await fs.ensureDir(nativeDir);
  }
  logger.success('Native directory cleaned / prepared');
}

async function deployExtensionTemplate() {
  const templateDir = path.join(paths.binDir, 'extension');
  if (await fs.pathExists(templateDir)) {
    await fs.emptyDir(templateDir);
  }
  await installExtension();
  logger.success(`Extension template deployed → ${templateDir}`);
}

async function deployBinaries() {
  const brainDest    = path.join(paths.binDir, 'brain');
  const nativeDest   = path.join(paths.binDir, 'native');
  const sentinelDest = path.join(paths.binDir, 'sentinel');

  // Brain
  logger.info('Copying Brain service...');
  if (!await fs.pathExists(paths.brainSource)) {
    throw new Error(`Brain source not found: ${paths.brainSource}`);
  }
  await fs.copy(paths.brainSource, brainDest, { overwrite: true });

  const brainExe = path.join(brainDest, 'brain.exe');
  if (!await fs.pathExists(brainExe)) {
    throw new Error(`brain.exe not found after copy: ${brainExe}`);
  }
  logger.success('Brain service deployed');

  // Native Host + DLLs
  logger.info('Copying Native Host + DLLs...');
  const nativeSourceDir = path.dirname(paths.nativeSource);
  if (!await fs.pathExists(nativeSourceDir)) {
    throw new Error(`Native source directory not found: ${nativeSourceDir}`);
  }

  const files = await fs.readdir(nativeSourceDir);
  let copiedCount = 0;
  for (const file of files) {
    if (/\.(exe|dll)$/i.test(file)) {
      await fs.copy(
        path.join(nativeSourceDir, file),
        path.join(nativeDest, file),
        { overwrite: true }
      );
      copiedCount++;
    }
  }
  logger.success(`Native host deployed (${copiedCount} files)`);

  const hostPath = path.join(nativeDest, 'bloom-host.exe');
  if (!await fs.pathExists(hostPath)) {
    throw new Error(`bloom-host.exe not found: ${hostPath}`);
  }

  // Sentinel + blueprint.json
  logger.info('Copying Sentinel executable & configuration...');
  const sentinelSource     = path.join(nativeSourceDir, 'sentinel.exe');
  const blueprintSource    = path.join(nativeSourceDir, 'blueprint.json');

  if (!await fs.pathExists(sentinelSource)) {
    throw new Error(`sentinel.exe not found in source: ${sentinelSource}`);
  }

  await fs.ensureDir(sentinelDest);

  const sentinelDestPath = path.join(sentinelDest, 'sentinel.exe');
  await fs.copy(sentinelSource, sentinelDestPath, { overwrite: true });

  if (!await fs.pathExists(sentinelDestPath)) {
    throw new Error(`sentinel.exe not found after copy: ${sentinelDestPath}`);
  }

  let blueprintCopied = false;
  if (await fs.pathExists(blueprintSource)) {
    const blueprintDest = path.join(sentinelDest, 'blueprint.json');
    await fs.copy(blueprintSource, blueprintDest, { overwrite: true });
    blueprintCopied = true;
  }

  logger.success(`Sentinel deployed (${blueprintCopied ? 'exe + blueprint.json' : 'exe only'})`);

  // NSSM
  logger.info('Copying NSSM...');
  if (!await fs.pathExists(paths.nssmExe)) {
    throw new Error(`NSSM not found: ${paths.nssmExe}`);
  }
  const nssmDest = path.join(nativeDest, 'nssm.exe');
  await fs.copy(paths.nssmExe, nssmDest, { overwrite: true });
  logger.success('NSSM deployed');

  logger.success('All binaries deployed');
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
    // 1. Cleanup
    emitProgress(mainWindow, 'cleanup');
    await cleanupOldServices();
    await killAllBloomProcesses();
    await cleanNativeDir();

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

    // 8. Sentinel profile creation
    emitProgress(mainWindow, 'sentinel-handoff');
    const seedResult = await executeSentinelCommand([
      'seed',
      '--alias', 'MasterWorker',
      '--master',
      '--json'
    ]);

    if (!seedResult?.success) {
      throw new Error(`Sentinel seed failed: ${seedResult?.error || 'unknown'}`);
    }

    const profileId = seedResult.data?.uuid || seedResult.data?.id;
    if (!profileId) {
      throw new Error('No profile ID returned by Sentinel');
    }

    // 9. Launch & validation
    emitProgress(mainWindow, 'validation', 'Launching profile');
    await executeSentinelCommand(['launch', profileId, '--discovery', '--json']);

    emitProgress(mainWindow, 'validation', 'Final health check');
    const health = await executeSentinelCommand(['health', '--json']);

    logger.info(`Health check: ${health.connected ? `OK (port ${health.port})` : 'not connected yet (may still initialize)'}`);

    // 10. Config
    const config = {
      version: APP_VERSION,
      installed_at: new Date().toISOString(),
      installer_mode: 'sentinel-delegated',
      masterProfileId: profileId,
      chromium: {
        path: chromiumResult.chromiumPath,
        version: chromiumResult.version,
        size: chromiumResult.size
      },
      note: 'Managed by Sentinel'
    };

    await fs.writeJson(paths.configFile, config, { spaces: 2 });

    // Shortcuts (opcional)
    try {
      const { createLauncherShortcuts } = require('./launcher-creator');
      await createLauncherShortcuts({
        chromiumPath: chromiumResult.chromiumPath,
        profileId
      });
    } catch (e) {
      logger.warn('Could not create launcher shortcuts', e.message);
    }

    emitProgress(mainWindow, 'complete');
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