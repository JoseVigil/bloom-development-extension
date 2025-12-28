const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');
const { exec, execSync, spawn } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const os = require('os');

// ============================================================================
// CONSTANTS & MODE DETECTION
// ============================================================================

const IS_DEV = process.env.NODE_ENV === 'development';
const IS_LAUNCH_MODE = process.argv.includes('--mode=launch');
const APP_VERSION = '1.0.0';

console.log(`
╔═══════════════════════════════════════════╗
║   🌸 BLOOM NUCLEUS ${IS_LAUNCH_MODE ? 'LAUNCHER' : 'INSTALLER'}           ║
║   Mode: ${IS_LAUNCH_MODE ? 'LAUNCH' : 'INSTALL'}                        ║
║   Version: ${APP_VERSION}                       ║
╚═══════════════════════════════════════════╝
`);

// ============================================================================
// PATHS CONFIGURATION
// ============================================================================

const getResourcePath = (resourceName) => {
  if (app.isPackaged) {
    const finalName = resourceName === 'core' ? 'brain' : resourceName;
    return path.join(process.resourcesPath, finalName);
  }
  const installerRoot = path.join(__dirname, '..'); 
  const repoRoot = path.join(__dirname, '..', '..');

  switch (resourceName) {
    case 'runtime': return path.join(installerRoot, 'resources', 'runtime');
    case 'brain':   return path.join(repoRoot, 'brain');
    case 'native':  return path.join(installerRoot, 'native', 'bin', 'win32');
    case 'nssm':    return path.join(installerRoot, 'native', 'nssm', 'win64');
    case 'extension': return path.join(installerRoot, 'chrome-extension', 'src');
    case 'assets': return path.join(installerRoot, 'electron-app', 'assets');
    default: return path.join(installerRoot, 'resources', resourceName);
  }
};

const SERVICE_NAME = 'BloomNucleusHost';
const DEFAULT_PORT = 5678;

const paths = {
  get bloomBase() {
    return process.platform === 'win32' 
      ? path.join(process.env.LOCALAPPDATA, 'BloomNucleus')
      : path.join(app.getPath('home'), '.local', 'share', 'BloomNucleus');
  },
  
  get engineDir() { return path.join(this.bloomBase, 'engine'); },
  get runtimeDir() { return path.join(this.engineDir, 'runtime'); },
  get brainDir()   { return path.join(this.runtimeDir, 'brain'); },
  get nativeDir()  { return path.join(this.bloomBase, 'native'); },
  get extensionDir() { return path.join(this.bloomBase, 'extension'); },
  get configDir()  { return path.join(this.bloomBase, 'config'); },
  get configFile() { return path.join(this.configDir, 'installer-config.json'); },
  get binDir()     { return path.join(this.bloomBase, 'bin'); },
  get logsDir()    { return path.join(this.bloomBase, 'logs'); },

  runtimeSource: getResourcePath('runtime'),
  brainSource:   getResourcePath('brain'),
  nativeSource:  getResourcePath('native'),
  extensionSource: getResourcePath('extension'),
  nssmSource:    getResourcePath('nssm'),

  get pythonExe() {
    return path.join(this.runtimeDir, process.platform === 'win32' ? 'python.exe' : 'python3');
  },
  get hostBinary() {
    return path.join(this.nativeDir, process.platform === 'win32' ? 'bloom-host.exe' : 'bloom-host');
  },
  get nssmExe() {
    return path.join(this.nativeDir, 'nssm.exe');
  },
  get manifestPath() {
    return path.join(this.nativeDir, 'com.bloom.nucleus.bridge.json');
  },
  get launcherExe() {
    return path.join(this.binDir, 'BloomLauncher.exe');
  }
};

// ============================================================================
// GLOBAL STATE
// ============================================================================

let mainWindow = null;
let profileWindows = new Map();

// ============================================================================
// WINDOW CREATION - DUAL MODE
// ============================================================================

function createWindow() {
  const windowConfig = {
    width: IS_LAUNCH_MODE ? 1400 : 900,
    height: IS_LAUNCH_MODE ? 900 : 600,
    minWidth: IS_LAUNCH_MODE ? 1000 : 800,
    minHeight: IS_LAUNCH_MODE ? 600 : 500,
    backgroundColor: '#1a1a1a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false
    },
    icon: path.join(__dirname, 'assets', 'bloom.ico'),
    show: false,
    frame: true,
    title: IS_LAUNCH_MODE ? 'Bloom Nucleus Launcher' : 'Bloom Nucleus Installer'
  };

  mainWindow = new BrowserWindow(windowConfig);

  // Load appropriate HTML based on mode
  const htmlPath = IS_LAUNCH_MODE 
    ? path.join(__dirname, 'src', 'launch', 'index_launch.html')
    : path.join(__dirname, 'src', 'index.html');

  console.log(`📄 Loading UI: ${htmlPath}`);
  mainWindow.loadFile(htmlPath);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (IS_DEV) {
      mainWindow.webContents.openDevTools();
    }
  });

  // Security: Prevent navigation
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedUrl(url)) {
      event.preventDefault();
      console.warn(`🚫 Blocked navigation to: ${url}`);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    profileWindows.forEach(win => {
      if (win && !win.isDestroyed()) win.close();
    });
    profileWindows.clear();
  });

  setupMenu();
}

function setupMenu() {
  const template = [
    {
      label: 'File',
      submenu: [{ role: 'quit' }]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Open Logs Folder',
          click: () => shell.openPath(paths.logsDir)
        },
        {
          label: 'Documentation',
          click: () => shell.openExternal('http://localhost:48215/docs')
        },
        { type: 'separator' },
        {
          label: `Version ${APP_VERSION}`,
          enabled: false
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function isAllowedUrl(url) {
  const allowedPatterns = [
    /^http:\/\/localhost:48215/,
    /^http:\/\/localhost:5678/,
    /^http:\/\/localhost:4124/,
    /^ws:\/\/localhost:4124/,
    /^file:\/\//
  ];
  return allowedPatterns.some(pattern => pattern.test(url));
}

// ============================================================================
// ADMIN PRIVILEGES CHECK
// ============================================================================

async function isElevated() {
  if (process.platform !== 'win32') return true;
  try {
    execSync('net session', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function relaunchAsAdmin() {
  const exe = process.execPath;
  const args = process.argv.slice(1).join(' ');

  spawn('powershell', [
    '-Command',
    `Start-Process "${exe}" -ArgumentList "${args}" -Verb RunAs`
  ], {
    detached: true,
    stdio: 'ignore'
  });

  app.quit();
}

// ============================================================================
// INSTALLATION LOGIC (EXISTING - MAINTAINED)
// ============================================================================

async function createDirectories() {
  const dirs = [
    paths.bloomBase, 
    paths.engineDir, 
    paths.runtimeDir, 
    paths.nativeDir, 
    paths.extensionDir, 
    paths.configDir,
    paths.binDir,
    paths.logsDir
  ];
  for (const d of dirs) await fs.ensureDir(d);
  console.log('✅ Directories created');
}

async function cleanupProcesses() {
  if (process.platform === 'win32') {
    await removeService(SERVICE_NAME);
    try { 
      execSync('taskkill /F /IM bloom-host.exe /T', { stdio: 'ignore' }); 
    } catch (e) {}
  }
  
  if (await fs.pathExists(paths.brainDir)) {
    console.log("🧹 Removing old brain/ from runtime...");
    await fs.remove(paths.brainDir);
  }
  
  await fs.emptyDir(paths.extensionDir);
  console.log('✅ Cleanup completed');
}

async function installCore() {
  console.log("📦 Installing AI Engine (Python runtime only)...");
  if (!fs.existsSync(paths.runtimeSource)) {
    throw new Error("Runtime Source not found. Run 'npm run prepare:runtime'");
  }
  
  await fs.copy(paths.runtimeSource, paths.runtimeDir, { 
    overwrite: true,
    filter: (src) => !src.includes('brain')
  });
  
  console.log("   ✅ Python runtime installed");
  console.log("   ℹ️  Brain will run from plugin directly");
}

function serviceExists(name) {
  try {
    execSync(`sc query ${name}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function removeService(name) {
  if (!serviceExists(name)) {
    console.log(`   ℹ️  Service ${name} doesn't exist, skipping cleanup`);
    return;
  }

  console.log(`   🧹 Removing existing service: ${name}`);
  
  const nssm = paths.nssmExe;
  
  if (fs.existsSync(nssm)) {
    try {
      console.log(`   🛑 Stopping with NSSM...`);
      execSync(`"${nssm}" stop ${name}`, { stdio: 'ignore', timeout: 10000 });
      await new Promise(r => setTimeout(r, 3000));
      
      console.log(`   🗑️  Removing with NSSM...`);
      execSync(`"${nssm}" remove ${name} confirm`, { stdio: 'ignore', timeout: 10000 });
      
      for (let i = 0; i < 10; i++) {
        if (!serviceExists(name)) {
          console.log(`   ✅ Service removed with NSSM`);
          return;
        }
        await new Promise(r => setTimeout(r, 1000));
      }
      console.warn(`   ⚠️  NSSM didn't remove service completely`);
    } catch (nssmError) {
      console.warn(`   ⚠️  NSSM failed:`, nssmError.message);
    }
  }

  try {
    console.log(`   💀 Terminating bloom-host.exe processes...`);
    execSync('taskkill /F /IM bloom-host.exe /T', { stdio: 'ignore', timeout: 5000 });
    await new Promise(r => setTimeout(r, 2000));
  } catch {}

  try {
    console.log(`   🛑 Stopping with PowerShell...`);
    execSync(`powershell -Command "Stop-Service -Name '${name}' -Force -ErrorAction SilentlyContinue"`, { 
      stdio: 'ignore',
      timeout: 10000 
    });
    await new Promise(r => setTimeout(r, 3000));
  } catch {}

  try {
    console.log(`   🛑 Stopping with sc...`);
    execSync(`sc stop ${name}`, { stdio: 'ignore', timeout: 5000 });
    await new Promise(r => setTimeout(r, 2000));
  } catch {}

  console.log(`   ⏳ Waiting for complete stop...`);
  let stopped = false;
  for (let i = 0; i < 20; i++) {
    try {
      const out = execSync(`sc query ${name}`, { timeout: 3000 }).toString();
      if (out.includes('STOPPED') || !out.includes('RUNNING')) {
        console.log(`   ✅ Service stopped`);
        stopped = true;
        break;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }

  if (!stopped) {
    console.warn(`   ⚠️  Service not responding, forcing deletion...`);
  }

  try {
    console.log(`   🗑️  Deleting service with sc delete...`);
    execSync(`sc delete ${name}`, { stdio: 'pipe', timeout: 5000 });
    await new Promise(r => setTimeout(r, 3000));
  } catch (delErr) {
    console.warn(`   ⚠️  sc delete failed:`, delErr.message);
  }

  console.log(`   ⏳ Waiting for complete deletion...`);
  for (let i = 0; i < 20; i++) {
    if (!serviceExists(name)) {
      console.log(`   ✅ Service completely removed`);
      return;
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  console.warn(`   ⚠️  Service still exists after all attempts`);
  console.warn(`   💡 Attempting to continue anyway...`);
}

async function installWindowsService() {
  const binary = paths.hostBinary;
  const nssm = paths.nssmExe;

  if (!fs.existsSync(binary)) {
    throw new Error(`Host binary not found: ${binary}`);
  }

  console.log("🔧 Configuring Windows service with NSSM...");

  await removeService(SERVICE_NAME);

  if (!fs.existsSync(nssm)) {
    console.warn("   ⚠️  NSSM not found, trying direct sc...");
    await installWindowsServiceDirect();
    return;
  }

  if (serviceExists(SERVICE_NAME)) {
    console.warn("   ⚠️  Service still exists and couldn't be removed");
    console.warn("   💡 Attempting to reconfigure existing service...");
    
    try {
      execSync(`"${nssm}" set ${SERVICE_NAME} Application "${binary}"`, { stdio: 'ignore' });
      execSync(`"${nssm}" set ${SERVICE_NAME} AppParameters "--server --port=${DEFAULT_PORT}"`, { stdio: 'ignore' });
      execSync(`"${nssm}" set ${SERVICE_NAME} AppDirectory "${paths.nativeDir}"`, { stdio: 'ignore' });
      
      console.log(`   🚀 Starting reconfigured service: ${SERVICE_NAME}`);
      execSync(`"${nssm}" start ${SERVICE_NAME}`, { stdio: 'pipe' });
      console.log("   ✅ Service reconfigured and started");
      return;
    } catch (reconfigError) {
      console.error("   ❌ Couldn't reconfigure existing service");
      throw new Error(`Service ${SERVICE_NAME} exists and can't be modified. Run manually: sc delete ${SERVICE_NAME}`);
    }
  }

  console.log(`   ➕ Installing service with NSSM: ${SERVICE_NAME}`);
  
  try {
    execSync(
      `"${nssm}" install ${SERVICE_NAME} "${binary}" --server --port=${DEFAULT_PORT}`,
      { stdio: 'pipe' }
    );
  } catch (installError) {
    console.error("   ❌ Error installing service:", installError.message);
    throw new Error(`Couldn't install service: ${installError.message}`);
  }

  try {
    execSync(`"${nssm}" set ${SERVICE_NAME} Description "Bloom Nucleus Native Messaging Host"`, { stdio: 'ignore' });
    execSync(`"${nssm}" set ${SERVICE_NAME} Start SERVICE_AUTO_START`, { stdio: 'ignore' });
    execSync(`"${nssm}" set ${SERVICE_NAME} AppDirectory "${paths.nativeDir}"`, { stdio: 'ignore' });
    execSync(`"${nssm}" set ${SERVICE_NAME} AppExit Default Restart`, { stdio: 'ignore' });
  } catch {}

  console.log(`   🚀 Starting service: ${SERVICE_NAME}`);
  try {
    execSync(`"${nssm}" start ${SERVICE_NAME}`, { stdio: 'pipe' });
    console.log("   ✅ Windows service installed and started with NSSM");
  } catch (startError) {
    console.warn("   ⚠️  Service installed but couldn't start");
    console.warn("   📋 Error:", startError.message);
    
    try {
      execSync(`sc start ${SERVICE_NAME}`, { stdio: 'inherit' });
      console.log("   ✅ Service started with sc");
    } catch {
      console.warn("   ⚠️  Service will start automatically on next reboot");
    }
  }
}

async function installWindowsServiceDirect() {
  const binary = paths.hostBinary;

  console.log("🔧 Configuring Windows service (direct mode)...");

  const binPath = `"${binary}" --server --port=${DEFAULT_PORT}`;

  console.log(`   ➕ Creating service: ${SERVICE_NAME}`);
  execSync(
    `sc create ${SERVICE_NAME} binPath= "${binPath}" start= auto DisplayName= "Bloom Nucleus Host"`,
    { stdio: 'inherit' }
  );

  console.log(`   🔧 Configuring auto-recovery`);
  execSync(
    `sc failure ${SERVICE_NAME} reset= 86400 actions= restart/60000`,
    { stdio: 'inherit' }
  );

  console.log(`   🚀 Starting service: ${SERVICE_NAME}`);
  try {
    execSync(`sc start ${SERVICE_NAME}`, { stdio: 'pipe' });
    console.log("   ✅ Service started");
  } catch (startError) {
    console.warn("   ⚠️  Error 1053: Binary doesn't respond as Windows service");
    console.warn("   💡 Solution: Service requires NSSM or compilation as service");
    console.warn("   ℹ️  Service will start automatically on next reboot");
  }
}

async function installNativeHost() {
  console.log("📦 Installing Native Host...");
  if (!fs.existsSync(paths.nativeSource)) {
    throw new Error("Native Source not found at: " + paths.nativeSource);
  }
  
  const hostExe = path.join(paths.nativeSource, 'bloom-host.exe');
  if (!fs.existsSync(hostExe)) {
    throw new Error(`bloom-host.exe not found in: ${paths.nativeSource}`);
  }
  
  await fs.copy(paths.nativeSource, paths.nativeDir, { overwrite: true });
  console.log("   ✅ Files copied");
  
  if (fs.existsSync(paths.nssmSource)) {
    const nssmExe = path.join(paths.nssmSource, 'nssm.exe');
    if (fs.existsSync(nssmExe)) {
      await fs.copy(nssmExe, paths.nssmExe, { overwrite: true });
      console.log("   ✅ NSSM copied");
    }
  }
  
  if (process.platform === 'win32') {
    await installWindowsService();
  } else {
    await startNativeHost();
  }
}

async function startNativeHost() {
  console.log("🚀 Starting Native Host...");
  
  const hostExe = paths.hostBinary;
  
  if (!fs.existsSync(hostExe)) {
    throw new Error(`Host binary not found: ${hostExe}`);
  }
  
  const hostProcess = spawn(hostExe, [], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  
  hostProcess.unref();
  
  console.log(`   ✅ Host started (PID: ${hostProcess.pid})`);
  
  const config = fs.existsSync(paths.configFile) ? await fs.readJson(paths.configFile) : {};
  config.hostPid = hostProcess.pid;
  await fs.writeJson(paths.configFile, config, { spaces: 2 });
}

async function installExtension() {
  console.log("📦 Deploying Extension (Unpacked)...");
  if (!fs.existsSync(paths.extensionSource)) {
    throw new Error("Extension Source not found");
  }
  await fs.copy(paths.extensionSource, paths.extensionDir, { overwrite: true });
}

async function configureBridge() {
  console.log("🔗 Configuring Native Bridge...");

  const extManifestPath = path.join(paths.extensionDir, 'manifest.json');
  if (!fs.existsSync(extManifestPath)) {
    throw new Error("Extension manifest not found in destination");
  }
  
  const extManifest = await fs.readJson(extManifestPath);
  if (!extManifest.key) {
    throw new Error("Extension doesn't have a fixed 'key' in manifest.json");
  }
  
  const extensionId = calculateExtensionId(extManifest.key);
  console.log(`   🆔 Calculated ID: ${extensionId}`);

  const hostManifest = {
    name: "com.bloom.nucleus.bridge",
    description: "Bloom Nucleus Host",
    path: paths.hostBinary,
    type: "stdio",
    allowed_origins: [ `chrome-extension://${extensionId}/` ]
  };
  await fs.writeJson(paths.manifestPath, hostManifest, { spaces: 2 });

  if (process.platform === 'win32') {
    const regKey = 'HKCU\\SOFTWARE\\Google\\Chrome\\NativeMessagingHosts\\com.bloom.nucleus.bridge';
    const jsonPath = paths.manifestPath.replace(/\\/g, '\\\\');
    const cmd = `reg add "${regKey}" /ve /d "${jsonPath}" /f`;
    await execPromise(cmd);
    console.log("   ✅ Host registered in HKCU");
  }

  return extensionId;
}

function calculateExtensionId(base64Key) {
  const buffer = Buffer.from(base64Key, 'base64');
  const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 32);
  
  return hash.split('').map(char => {
    const code = parseInt(char, 16);
    return String.fromCharCode(97 + code);
  }).join('');
}

async function initializeBrainProfile() {
  console.log("🧠 Initializing Master Profile...");
  
  const python = paths.pythonExe;
  const brainPath = paths.brainSource;
  
  const pthFile = path.join(paths.runtimeDir, 'python310._pth');
  const pthContent = [
    '.',
    'python310.zip',
    path.dirname(brainPath),
    path.join(brainPath, 'libs'),
    'import site'
  ].join('\n');
  
  await fs.writeFile(pthFile, pthContent, 'utf8');
  console.log("   ✅ python310._pth:", pthContent.split('\n').join(', '));
  
  const command = `"${python}" -m brain --json profile create "Master Worker"`;

  try {
    const { stdout } = await execPromise(command, { 
      timeout: 15000,
      cwd: paths.runtimeDir
    });
    
    console.log("   → Response:", stdout.trim());
    
    let result = JSON.parse(stdout);
    let profileId = result.data?.id || result.id;

    if (!profileId && Array.isArray(result)) {
      profileId = result[0]?.id;
    }

    if (!profileId) throw new Error("Couldn't get Profile ID");
    
    console.log(`   👤 Profile Ready: ${profileId}`);
    
    await fs.ensureDir(paths.configDir);
    const config = fs.existsSync(paths.configFile) ? await fs.readJson(paths.configFile) : {};
    config.masterProfileId = profileId;
    await fs.writeJson(paths.configFile, config, { spaces: 2 });

    return profileId;
  } catch (error) {
    console.error("Error creating profile:", error);
    throw new Error(`Failed to create profile: ${error.message}`);
  }
}

// ============================================================================
// LAUNCHER CREATION (POST-INSTALL)
// ============================================================================

async function createLauncherShortcuts() {
  try {
    console.log('🚀 Creating Bloom Launcher...');
    
    const launcherPath = paths.launcherExe;
    
    // Copy current executable to bin as BloomLauncher.exe
    await fs.ensureDir(paths.binDir);
    await fs.copy(app.getPath('exe'), launcherPath, { overwrite: true });
    
    console.log(`   ✅ Launcher created at: ${launcherPath}`);

    // Create desktop shortcut
    await createShortcut(
      path.join(app.getPath('desktop'), 'Bloom Nucleus.lnk'),
      launcherPath,
      '--mode=launch',
      'Bloom Nucleus AI Hub'
    );
    console.log('   ✅ Desktop shortcut created');

    // Create start menu shortcut
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
      'Bloom Nucleus AI Hub'
    );
    console.log('   ✅ Start Menu shortcut created');

    console.log('✅ Launcher and shortcuts created successfully');
    return { success: true, launcherPath };
  } catch (error) {
    console.error('❌ Error creating launcher shortcuts:', error);
    return { success: false, error: error.message };
  }
}

async function createShortcut(linkPath, targetPath, args, description) {
  const vbsScript = `
    Set oWS = WScript.CreateObject("WScript.Shell")
    sLinkFile = "${linkPath.replace(/\\/g, '\\\\')}"
    Set oLink = oWS.CreateShortcut(sLinkFile)
    oLink.TargetPath = "${targetPath.replace(/\\/g, '\\\\')}"
    oLink.Arguments = "${args}"
    oLink.WorkingDirectory = "${path.dirname(targetPath).replace(/\\/g, '\\\\')}"
    oLink.Description = "${description}"
    oLink.IconLocation = "${path.join(__dirname, 'assets', 'bloom.ico').replace(/\\/g, '\\\\')}"
    oLink.Save
  `;

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

// ============================================================================
// BRAIN CLI HELPERS (FOR LAUNCH MODE)
// ============================================================================

function execBrainCommand(args, options = {}) {
  return new Promise((resolve, reject) => {
    const pythonPath = paths.pythonExe;
    const brainPath = paths.brainSource;
    
    const child = spawn(pythonPath, ['-m', 'brain', ...args], {
      cwd: brainPath,
      env: { ...process.env, PYTHONPATH: brainPath },
      ...options
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr, code });
      } else {
        reject(new Error(`Brain command failed: ${stderr || stdout}`));
      }
    });

    child.on('error', reject);
  });
}

async function checkHealthStatus() {
  try {
    const result = await execBrainCommand(['health', 'check-all', '--json']);
    return JSON.parse(result.stdout);
  } catch (error) {
    console.error('Health check failed:', error);
    return { status: 'error', error: error.message };
  }
}

async function checkOnboardingStatus() {
  try {
    const result = await execBrainCommand(['health', 'onboarding-status', '--json']);
    return JSON.parse(result.stdout);
  } catch (error) {
    console.error('Onboarding status check failed:', error);
    return { completed: false, error: error.message };
  }
}

async function listProfiles() {
  try {
    const result = await execBrainCommand(['profile', 'list', '--json']);
    return JSON.parse(result.stdout);
  } catch (error) {
    console.error('Profile list failed:', error);
    return [];
  }
}

async function launchProfile(profileId, url = null) {
  try {
    const args = ['profile', 'launch', profileId];
    if (url) {
      args.push('--url', url);
    }

    const pythonPath = paths.pythonExe;
    const brainPath = paths.brainSource;

    const child = spawn(pythonPath, ['-m', 'brain', ...args], {
      cwd: brainPath,
      env: { ...process.env, PYTHONPATH: brainPath },
      detached: true,
      stdio: 'ignore'
    });

    child.unref();

    profileWindows.set(profileId, { pid: child.pid, profileId });

    console.log(`Profile ${profileId} launched with PID ${child.pid}`);
    return { success: true, pid: child.pid };
  } catch (error) {
    console.error(`Error launching profile ${profileId}:`, error);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// IPC HANDLERS - INSTALL MODE
// ============================================================================

function setupInstallModeHandlers() {
  console.log('📡 Setting up Install Mode IPC handlers...');

  ipcMain.handle('brain:install-extension', async () => {
    try {
      if (process.platform === 'win32' && !(await isElevated())) {
        console.log('⚠️  Admin privileges required for service installation.');
        console.log('🔄 Requesting elevation...');
        relaunchAsAdmin();
        return { success: false, relaunching: true, message: 'Relaunching with admin privileges...' };
      }

      console.log(`=== STARTING GOD MODE DEPLOYMENT (${process.platform}) ===`);
      await cleanupProcesses();
      await createDirectories();
      await installCore();
      await installNativeHost();
      await installExtension();
      const extensionId = await configureBridge();
      const profileId = await initializeBrainProfile();
      
      // 🆕 CREATE LAUNCHER AFTER SUCCESSFUL INSTALL
      const launcherResult = await createLauncherShortcuts();
      
      console.log('=== DEPLOYMENT COMPLETED SUCCESSFULLY ===');
      
      return { 
        success: true, 
        extensionId, 
        profileId,
        launcherCreated: launcherResult.success,
        launcherPath: launcherResult.launcherPath
      };
    } catch (error) {
      console.error('❌ FATAL ERROR IN INSTALLATION:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('brain:launch', async () => {
    try {
      const config = await fs.readJson(paths.configFile);
      const profileId = config.masterProfileId;
      if (!profileId) throw new Error("No master profile found");
      
      const cmd = `"${paths.pythonExe}" -m brain --json profile launch "${profileId}" --url "https://chatgpt.com"`;
      
      console.log("🚀 EXECUTING:", cmd);
      
      const output = execSync(cmd, { 
        cwd: paths.runtimeDir,
        encoding: 'utf8',
        timeout: 10000
      });
      
      console.log("✅ OUTPUT:", output);
      return { success: true, output };
      
    } catch (error) {
      console.error("❌ ERROR:", error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('extension:heartbeat', async () => {
    try {
      const net = require('net');
      
      return new Promise((resolve) => {
        const client = new net.Socket();
        
        client.setTimeout(2000);
        
        client.connect(DEFAULT_PORT, '127.0.0.1', () => {
          client.destroy();
          resolve({ chromeConnected: true });
        });
        
        client.on('error', () => {
          resolve({ chromeConnected: false });
        });
        
        client.on('timeout', () => {
          client.destroy();
          resolve({ chromeConnected: false });
        });
      });
    } catch (error) {
      return { chromeConnected: false, error: error.message };
    }
  });

  ipcMain.handle('preflight-checks', async () => {
    return {
      hasAdmin: await isElevated(),
      diskSpace: true,
      vcRedistInstalled: await checkVCRedistInstalled()
    };
  });
}

// ============================================================================
// IPC HANDLERS - LAUNCH MODE
// ============================================================================

function setupLaunchModeHandlers() {
  console.log('📡 Setting up Launch Mode IPC handlers...');

  ipcMain.handle('health:check', async () => {
    return await checkHealthStatus();
  });

  ipcMain.handle('onboarding:status', async () => {
    return await checkOnboardingStatus();
  });

  ipcMain.handle('profile:list', async () => {
    return await listProfiles();
  });

  ipcMain.handle('profile:launch', async (event, { profileId, url }) => {
    return await launchProfile(profileId, url);
  });

  ipcMain.handle('profile:create', async (event, { name, type }) => {
    try {
      const result = await execBrainCommand(['profile', 'create', name, '--type', type, '--json']);
      return JSON.parse(result.stdout);
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('logs:tail', async (event, { lines = 50 }) => {
    try {
      const logFile = path.join(paths.logsDir, 'brain.log');
      if (!await fs.pathExists(logFile)) {
        return { success: true, logs: [] };
      }
      const content = await fs.readFile(logFile, 'utf-8');
      const logLines = content.split('\n').slice(-lines);
      return { success: true, logs: logLines };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('system:info', async () => {
    return {
      platform: os.platform(),
      arch: os.arch(),
      version: APP_VERSION,
      paths: {
        bloomBase: paths.bloomBase,
        runtime: paths.runtimeDir,
        brain: paths.brainSource,
        native: paths.nativeDir,
        config: paths.configDir,
        logs: paths.logsDir
      }
    };
  });
}

// ============================================================================
// SHARED IPC HANDLERS
// ============================================================================

function setupSharedHandlers() {
  console.log('📡 Setting up Shared IPC handlers...');

  ipcMain.handle('open-logs-folder', async () => {
    await fs.ensureDir(paths.logsDir);
    await shell.openPath(paths.logsDir);
    return { success: true };
  });

  ipcMain.handle('open-url', async (event, url) => {
    if (isAllowedUrl(url)) {
      await shell.openExternal(url);
      return { success: true };
    }
    return { success: false, error: 'URL not allowed' };
  });

  ipcMain.handle('open-folder', async (event, folderPath) => {
    await shell.openPath(folderPath);
    return { success: true };
  });

  ipcMain.handle('open-chrome-extensions', async () => {
    await shell.openExternal('chrome://extensions/');
    return { success: true };
  });

  ipcMain.handle('open-external', async (event, url) => {
    await shell.openExternal(url);
    return { success: true };
  });

  ipcMain.handle('get-app-info', () => {
    return {
      version: APP_VERSION,
      mode: IS_LAUNCH_MODE ? 'launch' : 'install',
      isDev: IS_DEV,
      platform: process.platform
    };
  });
}

async function checkVCRedistInstalled() {
  if (process.platform !== 'win32') return true;
  
  try {
    const systemRoot = process.env.SystemRoot || 'C:\\Windows';
    const system32 = path.join(systemRoot, 'System32');
    const requiredDlls = ['vcruntime140.dll', 'msvcp140.dll'];
    
    for (const dll of requiredDlls) {
      const exists = await fs.pathExists(path.join(system32, dll));
      if (!exists) return false;
    }
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// DASHBOARD INITIALIZATION (Launch Mode Only)
// ============================================================================

async function initializeDashboard() {
  try {
    console.log('🎨 Initializing dashboard...');

    const health = await checkHealthStatus();
    mainWindow.webContents.send('health:status', health);

    if (health.status !== 'ok') {
      console.warn('⚠️  Health check failed:', health);
      mainWindow.webContents.send('dashboard:error', {
        type: 'health',
        message: 'System health check failed. Please resolve issues before continuing.',
        details: health
      });
      return;
    }

    const onboarding = await checkOnboardingStatus();
    mainWindow.webContents.send('onboarding:status', onboarding);

    if (!onboarding.completed) {
      console.log('📝 Onboarding incomplete, launching onboarding flow...');
      await launchProfile('bloom-worker-profile', 'http://localhost:48215/onboarding');
    }

    const profiles = await listProfiles();
    mainWindow.webContents.send('profiles:list', profiles);

    console.log('✅ Dashboard initialized successfully');
  } catch (error) {
    console.error('❌ Dashboard initialization failed:', error);
    mainWindow.webContents.send('dashboard:error', {
      type: 'init',
      message: 'Failed to initialize dashboard',
      error: error.message
    });
  }
}

// ============================================================================
// APP LIFECYCLE
// ============================================================================

app.whenReady().then(() => {
  createWindow();

  setupSharedHandlers();
  
  if (IS_LAUNCH_MODE) {
    setupLaunchModeHandlers();
    
    mainWindow.webContents.once('did-finish-load', () => {
      initializeDashboard();
    });
  } else {
    setupInstallModeHandlers();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  profileWindows.forEach((info, profileId) => {
    console.log(`Closing profile: ${profileId}`);
  });
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('error', {
      type: 'fatal',
      message: error.message,
      stack: error.stack
    });
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
});