// service-installer-nucleus.js
// CRITICAL SERVICE - 24/7 Operational Hub
// Nucleus Service: Sistema nervioso central del ecosistema Bloom

const { exec, execSync, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const { paths } = require('../config/paths');

// ============================================================================
// CONFIGURACIÓN DEL SERVICIO CRÍTICO
// ============================================================================
const NUCLEUS_SERVICE_NAME = 'BloomNucleusService';
const NUCLEUS_DISPLAY_NAME = 'Bloom Nucleus Service';
const NUCLEUS_DESCRIPTION = 'Bloom Nucleus Service - Central orchestration hub, workflow engine, and system governance (24/7 critical operational service)';
const NUCLEUS_REGISTRY_SUBKEY = `SYSTEM\\CurrentControlSet\\Services\\${NUCLEUS_SERVICE_NAME}\\Parameters`;
const NUCLEUS_ENVIRONMENT_VALUE_NAME = 'AppEnvironmentExtra';
const MANAGED_AITAP_PROBE_ENVIRONMENT_NAMES = Object.freeze([
  'AITAP_MODELS_API_HEALTH_PROBE_ANTHROPIC_GRANT_ID',
  'AITAP_MODELS_API_HEALTH_PROBE_GEMINI_GRANT_ID',
]);

const READ_NUCLEUS_ENVIRONMENT_SCRIPT = [
  "$key = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey('" + NUCLEUS_REGISTRY_SUBKEY + "', $false)",
  'if ($null -eq $key) { exit 0 }',
  'try {',
  "  if (-not ($key.GetValueNames() -contains '" + NUCLEUS_ENVIRONMENT_VALUE_NAME + "')) { exit 0 }",
  "  if ($key.GetValueKind('" + NUCLEUS_ENVIRONMENT_VALUE_NAME + "') -ne [Microsoft.Win32.RegistryValueKind]::MultiString) { exit 0 }",
  "  [string[]]$entries = $key.GetValue('" + NUCLEUS_ENVIRONMENT_VALUE_NAME + "', $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)",
  '  if ($null -eq $entries) { exit 0 }',
  '  foreach ($entry in $entries) {',
  '    [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($entry))',
  '  }',
  '} finally { $key.Dispose() }',
].join('\n');

const WRITE_NUCLEUS_ENVIRONMENT_SCRIPT = [
  '$payload = [Console]::In.ReadToEnd() | ConvertFrom-Json',
  '[string[]]$entries = @($payload.entries)',
  "$key = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey('" + NUCLEUS_REGISTRY_SUBKEY + "', $true)",
  "if ($null -eq $key) { throw 'Nucleus service Parameters registry key not found' }",
  'try {',
  "  $key.SetValue('" + NUCLEUS_ENVIRONMENT_VALUE_NAME + "', $entries, [Microsoft.Win32.RegistryValueKind]::MultiString)",
  '} finally { $key.Dispose() }',
].join('\n');

// Configuración de reintentos y recuperación
const SERVICE_CONFIG = {
  START_TYPE: 'SERVICE_AUTO_START',
  RESTART_DELAY: 5000, // 5 segundos entre reintentos
  FAILURE_ACTIONS: {
    FIRST_FAILURE: 'restart',
    SECOND_FAILURE: 'restart',
    SUBSEQUENT_FAILURES: 'restart'
  },
  DEPENDENCIES: [], // Nucleus no depende de otros servicios Bloom
  PRIORITY: 'high' // Prioridad alta en el sistema
};

// ============================================================================
// HELPERS
// ============================================================================

function runCommand(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      // NSSM puede escribir en stderr aunque funcione
      if (error) {
        // Solo ignorar si stderr contiene "successfully"
        if (stderr.includes('successfully')) {
          return resolve(stdout || '');
        }
        // Error real - rechazar
        return reject(new Error(`Command failed: ${cmd}\nError: ${stderr || error.message}`));
      }
      resolve(stdout || '');
    });
  });
}

function serviceExists(serviceName) {
  try {
    const result = execSync(`sc query "${serviceName}"`, { stdio: 'pipe', encoding: 'utf8' });
    return !result.includes('does not exist');
  } catch {
    return false;
  }
}

function isValidManagedProbeValue(value) {
  return typeof value === 'string' && value.length > 0 && !/[\x00-\x1f\x7f]/.test(value);
}

function selectManagedAitapProbeEnvironment(existingEntries = []) {
  const managedNames = new Map(
    MANAGED_AITAP_PROBE_ENVIRONMENT_NAMES.map(name => [name.toUpperCase(), name])
  );
  const selected = new Map();

  for (const rawEntry of Array.isArray(existingEntries) ? existingEntries : []) {
    if (typeof rawEntry !== 'string') continue;
    const separatorIndex = rawEntry.indexOf('=');
    if (separatorIndex <= 0) continue;

    const rawName = rawEntry.slice(0, separatorIndex);
    const value = rawEntry.slice(separatorIndex + 1);
    const canonicalName = managedNames.get(rawName.toUpperCase());
    if (!canonicalName || !isValidManagedProbeValue(value)) continue;

    // Windows environment names are case-insensitive. Last valid entry wins,
    // matching the effective value of a duplicated environment assignment.
    selected.set(canonicalName, `${canonicalName}=${value}`);
  }

  return MANAGED_AITAP_PROBE_ENVIRONMENT_NAMES
    .filter(name => selected.has(name))
    .map(name => selected.get(name));
}

function readExistingNucleusServiceEnvironment(execFileSyncImpl = execFileSync) {
  const output = execFileSyncImpl(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', READ_NUCLEUS_ENVIRONMENT_SCRIPT],
    { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
  );

  return String(output || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => Buffer.from(line, 'base64').toString('utf8'));
}

function writeNucleusServiceEnvironment(envEntries, execFileSyncImpl = execFileSync) {
  const entries = Array.isArray(envEntries) ? envEntries : [];
  execFileSyncImpl(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', WRITE_NUCLEUS_ENVIRONMENT_SCRIPT],
    {
      input: JSON.stringify({ entries }),
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['pipe', 'ignore', 'pipe'],
    }
  );
}

function buildNucleusServiceEnvironment(
  userLocalAppData = process.env.LOCALAPPDATA,
  inheritedPath = process.env.PATH || '',
  existingEntries = []
) {
  if (!userLocalAppData) {
    throw new Error('LOCALAPPDATA is required to configure the Nucleus service environment');
  }

  const bloomRoot = path.join(userLocalAppData, 'BloomNucleus');
  const bloomBinDir = path.join(bloomRoot, 'bin');
  const bloomLogsDir = path.join(bloomRoot, 'logs');
  const bloomRuntimeDir = path.join(bloomBinDir, 'engine', 'runtime');
  const bloomPythonExe = path.join(bloomRuntimeDir, 'python.exe');
  const envEntries = [
    'PYTHONUNBUFFERED=1',
    'PYTHONIOENCODING=utf-8',
    'BLOOM_ENVIRONMENT=production',
    'NUCLEUS_MODE=service',
    `LOCALAPPDATA=${userLocalAppData}`,
    `BLOOM_ROOT=${bloomRoot}`,
    `BLOOM_BIN_DIR=${bloomBinDir}`,
    `BLOOM_LOGS_DIR=${bloomLogsDir}`,
    `BLOOM_DIR=${bloomRoot}`,
    `BLOOM_PYTHON_PATH=${bloomPythonExe}`,
    `PATH=${bloomRuntimeDir};${bloomBinDir}\\nucleus;${bloomBinDir}\\sentinel;${inheritedPath}`,
    ...selectManagedAitapProbeEnvironment(existingEntries),
  ];
  const envContent = envEntries.join('\0') + '\0';

  return {
    bloomRoot,
    bloomBinDir,
    bloomLogsDir,
    bloomRuntimeDir,
    bloomPythonExe,
    envEntries,
    envContent,
  };
}

// ============================================================================
// TELEMETRY REGISTRATION (CRITICAL STREAM)
// ============================================================================

async function registerNucleusTelemetry(logPath) {
  try {
    const nucleusExe = paths.nucleusExe || path.join(paths.binDir, 'nucleus', 'nucleus.exe');
    
    // Registrar como stream CRÍTICO (priority: 1)
    const cmd = `"${nucleusExe}" --json telemetry register --stream nucleus_service --label "🧠 NUCLEUS SERVICE" --path "${logPath}" --priority 1 --category nucleus --description "Nucleus background service log — records service startup, orchestration events and shutdown"`;
    
    const result = execSync(cmd, { 
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 5000
    });
    
    const jsonResult = JSON.parse(result);
    
    if (jsonResult.success) {
      console.log('📊 CRITICAL telemetry stream registered:', jsonResult.stream_id);
    } else {
      console.warn('⚠️ Telemetry registration warning:', jsonResult.message);
    }
  } catch (error) {
    console.warn('⚠️ Failed to register telemetry stream:', error.message);
    // No es crítico para la instalación, continuar
  }
}

// ============================================================================
// ROTACIÓN DE LOGS
// ============================================================================

async function rotateLogIfNeeded(logPath) {
  if (!fs.existsSync(logPath)) {
    return;
  }
  
  const stats = fs.statSync(logPath);
  const MAX_SIZE = 50 * 1024 * 1024; // 50MB para Nucleus (más que Brain)
  
  if (stats.size > MAX_SIZE) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const logDir = path.dirname(logPath);
    const logName = path.basename(logPath, '.log');
    const rotatedPath = path.join(logDir, `${logName}_${timestamp}.old.log`);
    
    console.log(`🔄 Rotating Nucleus log: ${path.basename(logPath)} → ${path.basename(rotatedPath)}`);
    await fs.move(logPath, rotatedPath);
    
    // Re-registrar telemetría con el nuevo archivo
    await registerNucleusTelemetry(logPath);
  }
}

// ============================================================================
// INSTALACIÓN DEL SERVICIO NUCLEUS
// ============================================================================

async function installNucleusService() {
  console.log('\n🧠 INSTALANDO SERVICIO CRÍTICO: Bloom Nucleus Service\n');

  // Read the only two Setup-managed values before NSSM removes the existing
  // service registry key during a repair. Values remain in memory and are never
  // logged, written to a temporary file, or placed on a process command line.
  const existingEnvironment = readExistingNucleusServiceEnvironment();
  const managedProbeEnvironment = selectManagedAitapProbeEnvironment(existingEnvironment);
  
  const nssmPath = paths.nssmExe;
  // FORZAR path correcto sin depender de paths.nucleusExe
  const nucleusExe = path.join(paths.binDir, 'nucleus', 'nucleus.exe');
  const workDir = path.dirname(nucleusExe);
  
  // 1. Validaciones
  if (!fs.existsSync(nssmPath)) {
    throw new Error(`NSSM not found at ${nssmPath}`);
  }
  if (!fs.existsSync(nucleusExe)) {
    throw new Error(`Nucleus binary not found at ${nucleusExe}`);
  }

  // 2. Limpieza preventiva
  if (serviceExists(NUCLEUS_SERVICE_NAME)) {
    console.log('🔄 Updating existing Nucleus service...');
    await removeNucleusService();
  }

  // 3. Crear estructura de logs
  const logDir = path.join(paths.logsDir, 'nucleus', 'service');
  await fs.ensureDir(logDir);
  const serviceLog = path.join(logDir, 'nucleus_service.log');

  // 4. Rotar log si existe y es muy grande
  await rotateLogIfNeeded(serviceLog);

  console.log(`🔧 Configuring NSSM for Nucleus...`);
  console.log(`   Binary: ${nucleusExe}`);
  console.log(`   WorkDir: ${workDir}`);
  console.log(`   Log: ${serviceLog}`);
  console.log(`   Mode: 24/7 Critical Service`);

  // ---------------------------------------------------------
  // SECUENCIA DE COMANDOS NSSM (CONFIGURACIÓN EXTENDIDA)
  // ---------------------------------------------------------
  
  // A. Instalar
  await runCommand(`"${nssmPath}" install "${NUCLEUS_SERVICE_NAME}" "${nucleusExe}"`);
  console.log('   ✓ Service installed');
  
  // B. Argumentos (Service Start)
  await runCommand(`"${nssmPath}" set "${NUCLEUS_SERVICE_NAME}" AppParameters "service start"`);
  console.log('   ✓ Arguments configured');
  
  // C. Directorio de Trabajo (CRÍTICO para PyInstaller/GoReleaser)
  await runCommand(`"${nssmPath}" set "${NUCLEUS_SERVICE_NAME}" AppDirectory "${workDir}"`);
  console.log('   ✓ Working directory set');
  
  // D. Variables de Entorno - USAR REGISTRO DIRECTAMENTE
  const {
    bloomRoot,
    bloomBinDir,
    bloomLogsDir,
    bloomPythonExe,
    envEntries,
  } = buildNucleusServiceEnvironment(
    process.env.LOCALAPPDATA,
    process.env.PATH || '',
    managedProbeEnvironment
  );

  // Write a native REG_MULTI_SZ. The JSON payload travels over stdin so no
  // environment values or Grant IDs are exposed in command arguments or logs.
  writeNucleusServiceEnvironment(envEntries);

  console.log('   ✓ Environment variables set via registry');
  console.log(`     BLOOM_ROOT: ${bloomRoot}`);
  console.log(`     BLOOM_BIN_DIR: ${bloomBinDir}`);
  console.log(`     BLOOM_LOGS_DIR: ${bloomLogsDir}`);
  console.log(`     BLOOM_PYTHON_PATH: ${bloomPythonExe}`);
  
  // E. Redirección de IO (LOG UNIFICADO)
  await runCommand(`"${nssmPath}" set "${NUCLEUS_SERVICE_NAME}" AppStdout "${serviceLog}"`);
  await runCommand(`"${nssmPath}" set "${NUCLEUS_SERVICE_NAME}" AppStderr "${serviceLog}"`);
  console.log('   ✓ Log redirection configured');
  
  // F. Configuración de Inicio y Recuperación
  await runCommand(`"${nssmPath}" set "${NUCLEUS_SERVICE_NAME}" Start ${SERVICE_CONFIG.START_TYPE}`);
  await runCommand(`"${nssmPath}" set "${NUCLEUS_SERVICE_NAME}" AppExit Default Restart`);
  
  // Configuración de delays entre reintentos (CRÍTICO para 24/7)
  await runCommand(`"${nssmPath}" set "${NUCLEUS_SERVICE_NAME}" AppRestartDelay ${SERVICE_CONFIG.RESTART_DELAY}`);
  
  // Display Name y Description
  await runCommand(`"${nssmPath}" set "${NUCLEUS_SERVICE_NAME}" DisplayName "${NUCLEUS_DISPLAY_NAME}"`);
  await runCommand(`"${nssmPath}" set "${NUCLEUS_SERVICE_NAME}" Description "${NUCLEUS_DESCRIPTION}"`);
  
  console.log('   ✓ Service recovery configuration complete');

  console.log('✅ Nucleus Service registered (24/7 Critical Operational Mode)');
}

// ============================================================================
// INICIO DEL SERVICIO NUCLEUS
// ============================================================================

async function startNucleusService() {
  console.log('🚀 Starting Nucleus Service...');
  
  try {
    execSync(`sc start "${NUCLEUS_SERVICE_NAME}"`, { stdio: 'ignore' });
    
    console.log('⏳ Waiting for Nucleus service start (5s)...');
    await new Promise(r => setTimeout(r, 5000));
    
    const status = execSync(`sc query "${NUCLEUS_SERVICE_NAME}"`, { encoding: 'utf8' });
    
    if (status.includes('RUNNING')) {
      console.log('✅ Nucleus Service is RUNNING');
      return true;
    } else if (status.includes('START_PENDING')) {
      console.log('✅ Nucleus Service is STARTING (will complete initialization in background)');
      return true;
    } else if (status.includes('STOPPED')) {
      throw new Error('Nucleus Service failed to start (status: STOPPED)');
    } else {
      throw new Error(`Nucleus Service in unexpected state: ${status}`);
    }
  } catch (e) {
    console.error(`❌ Failed to start Nucleus Service: ${e.message}`);
    
    try {
      const logDir = path.join(paths.logsDir, 'nucleus', 'service');
      const serviceLog = path.join(logDir, 'nucleus_service.log');
      if (fs.existsSync(serviceLog)) {
        const content = fs.readFileSync(serviceLog, 'utf8');
        console.error('📄 Last Nucleus Service Log:\n', content.slice(-1000));
      }
    } catch (_) {}
    
    return false;
  }
}

// ============================================================================
// REMOCIÓN DEL SERVICIO
// ============================================================================

async function removeNucleusService() {
  try {
    const nssmPath = paths.nssmExe;
    
    console.log('   Stopping Nucleus Service...');
    await runCommand(`"${nssmPath}" stop "${NUCLEUS_SERVICE_NAME}"`);
    
    await new Promise(r => setTimeout(r, 5000));
    
    console.log('   Removing Nucleus Service...');
    await runCommand(`"${nssmPath}" remove "${NUCLEUS_SERVICE_NAME}" confirm`);
    
    console.log('   ✓ Nucleus Service removed');
  } catch (e) {
    console.warn('   ⚠️ Service removal warning:', e.message);
  }
}

// ============================================================================
// HEALTH CHECK DEL SERVICIO NUCLEUS
// ============================================================================

async function checkNucleusHealth() {
  try {
    const nucleusExe = paths.nucleusExe || path.join(paths.binDir, 'nucleus', 'nucleus.exe');
    
    const result = execSync(`"${nucleusExe}" --json health`, {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true
    });
    
    const health = JSON.parse(result);
    
    return {
      success: health.success || false,
      state: health.state || 'unknown',
      components: health.components || {},
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      success: false,
      state: 'unreachable',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  installNucleusService,
  startNucleusService,
  removeNucleusService,
  checkNucleusHealth,
  buildNucleusServiceEnvironment,
  selectManagedAitapProbeEnvironment,
  readExistingNucleusServiceEnvironment,
  writeNucleusServiceEnvironment,
  MANAGED_AITAP_PROBE_ENVIRONMENT_NAMES,
  NUCLEUS_SERVICE_NAME,
  NUCLEUS_DISPLAY_NAME
};
