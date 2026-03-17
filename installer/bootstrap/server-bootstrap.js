// installer/bootstrap/server-bootstrap.js
//
// ÚNICO archivo fuente del Control Plane bootstrap.
// Fuente canónica: installer/bootstrap/server-bootstrap.js
//
// ROL en el pipeline:
//   1. BUILD  → esbuild lo usa como entry point y produce bundle.js (standalone).
//              El bundle incluye WebSocketManager, startAPIServer y HeadlessUserManager
//              compilados desde out/ — sin dependencias externas en runtime.
//   2. NATIVE → build-all.py copia este archivo a installer/native/bin/bootstrap/
//              como referencia. No se ejecuta desde ahí.
//   3. RUNTIME → Nucleus (supervisor.go) lanza bundle.js, NUNCA este archivo.
//              Ver: internal/supervisor/service.go → bootControlPlane()
//
// Para buildear:
//   npm run build          (produce bundle.js en installer/native/bin/bootstrap/)
//   python build-all.py    (build completo, incluye bootstrap)
//
// Para desarrollo local (sin build):
//   Setear NODE_PATH=<repo>/out y correr con node directamente.
//   Los requires de abajo resuelven contra out/ vía NODE_PATH.

const path = require('path');
const fs = require('fs');
const net = require('net');

// ── Módulos compilados (TypeScript → JS) ────────────────────────────────────
// En build: esbuild resuelve estos paths y los incrusta en bundle.js.
// En dev:   requieren NODE_PATH=<repo>/out o paths relativos funcionando.
const { WebSocketManager } = require('../../out/server/WebSocketManager');
const { startAPIServer } = require('../../out/api/server');
const { HeadlessUserManager } = require('../../out/managers/HeadlessUserManager');

// ============================================
// ENVIRONMENT VALIDATION
// ============================================

// BLOOM_USER_ROLE is optional during pre-onboarding — the role is only known
// after the user creates or joins an organization. The Control Plane must be
// running before that can happen, so we start with 'pre-onboarding' as the
// default and Electron/Conductor updates nucleus.json + restarts the Bootstrap
// once the role is established.
const REQUIRED_ENV = [
  'BLOOM_VAULT_STATE',
  'BLOOM_WORKER_RUNNING'
];

function validateEnvironment() {
  const missing = REQUIRED_ENV.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.error('[Bootstrap] Missing environment variables:', missing);
    process.exit(1);
  }

  if (process.env.BLOOM_VAULT_STATE === 'LOCKED') {
    console.error('[Bootstrap] Vault is LOCKED - cannot start control plane');
    process.exit(1);
  }

  // CORRECCIÓN: El worker puede estar en proceso de conectarse cuando Go lanza
  // bundle.js. En ese caso Go pasa BLOOM_WORKER_RUNNING=false (valor real) en
  // lugar del "true" hardcodeado anterior. Rechazar el arranque por esto causaba
  // un loop: bundle crasheaba → health check lo relanzaba → volvía a crashear.
  //
  // El valor correcto es: arrancar igual y loguear un warning. El Control Plane
  // puede funcionar en modo degradado hasta que el worker se conecte. Las rutas
  // que dependen del worker fallarán con su propio error, que es más informativo.
  //
  // Sólo bloqueamos si BLOOM_WORKER_RUNNING es exactamente el string 'false'.
  // Si no está seteado (vacío, undefined), también arrancamos — puede ser una
  // sesión de desarrollo sin worker completo.
  if (process.env.BLOOM_WORKER_RUNNING === 'false') {
    console.warn('[Bootstrap] ⚠️  Temporal worker not connected — Control Plane starting in degraded mode');
    console.warn('[Bootstrap]    Workflow dispatch will fail until worker connects');
    // No hacer process.exit(1) — arrancar de todas formas
  }

  // Resolve role — fallback to 'pre-onboarding' until the user completes setup
  const role = process.env.BLOOM_USER_ROLE || 'pre-onboarding';
  process.env.BLOOM_USER_ROLE = role;

  console.log('[Bootstrap] ✅ Environment validated');
  console.log(`[Bootstrap]    Role: ${role}`);
  console.log(`[Bootstrap]    Vault: ${process.env.BLOOM_VAULT_STATE}`);
  console.log(`[Bootstrap]    Simulation: ${process.env.BLOOM_SIMULATION_MODE || 'false'}`);
}

// ============================================
// TELEMETRY UPDATE
// ============================================
async function updateTelemetry(streamId, data) {
  const lockfile = require('proper-lockfile');
  const logsDir = process.env.BLOOM_LOGS_DIR ||
    path.join(process.env.LOCALAPPDATA, 'BloomNucleus', 'logs');
  const telemetryPath = path.join(logsDir, 'telemetry.json');

  const release = await lockfile.lock(telemetryPath, {
    retries: { retries: 5, minTimeout: 50, maxTimeout: 200 }
  });

  try {
    let existing = { active_streams: {} };
    if (fs.existsSync(telemetryPath)) {
      existing = JSON.parse(fs.readFileSync(telemetryPath, 'utf8'));
    }
    if (!existing.active_streams) existing.active_streams = {};
    existing.active_streams[streamId] = {
      ...data,
      last_update: new Date().toISOString()
    };
    fs.writeFileSync(telemetryPath, JSON.stringify(existing, null, 2));
  } finally {
    await release();
  }
}

// ============================================
// PORT CHECK HELPER
// ============================================

// isPortOpen hace un check TCP sincrónico-compatible vía Promise.
// Se usa en bootstrap() que ya es async, por lo que podemos await acá.
// Timeout de 500ms — si el puerto no responde en ese tiempo, lo consideramos libre.
function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(500);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);   // puerto ocupado — alguien está escuchando
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);  // timeout — puerto libre
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);  // error de conexión — puerto libre
    });
    socket.connect(port, 'localhost');
  });
}

// ============================================
// SVELTE DEV SERVER
// ============================================

// CORRECCIÓN 1 — Guard de puerto:
//   Go (nucleus service start) ya levanta Svelte antes de lanzar bundle.js.
//   Sin este guard, bundle.js intentaba hacer spawn de un segundo proceso npm,
//   fallando con EINVAL (bajo NSSM) o EADDRINUSE (si llegaba a bindear).
//   Ahora verificamos el puerto 5173 antes de hacer cualquier spawn.
//
// CORRECCIÓN 2 — detached: false:
//   spawn('npm.cmd', ..., { detached: true, stdio: 'ignore' }) falla con
//   EINVAL en Windows cuando el proceso padre fue iniciado por NSSM (sin
//   terminal asignada). Es un bug conocido de Node.js en Win32: detached+
//   stdio:ignore en un proceso sin consola = error -4071 EINVAL.
//   Con detached: false el spawn funciona correctamente. Svelte igual
//   sobrevive al padre porque Go lo lanzó con CREATE_NEW_PROCESS_GROUP
//   (setSvelteProcAttr en service.go).
async function startSvelteDevServer() {
  const { spawn } = require('child_process');

  // Guard: si ya hay algo en puerto 5173, Svelte está corriendo — no spawnar.
  const svelteRunning = await isPortOpen(5173);
  if (svelteRunning) {
    console.log('[Bootstrap] ℹ️  Svelte dev server already running on port 5173 — skipping spawn');
    return null;
  }

  // La UI vive en <repoRoot>/webview/app.
  // BLOOM_DIR apunta directamente a la raíz del repo (calculado desde nucleus.json).
  // Fallback: BLOOM_NUCLEUS_PATH apunta a <repoRoot> directamente (no a .bloom).
  const bloomDir = process.env.BLOOM_DIR || '';
  const bloomNucleusPath = process.env.BLOOM_NUCLEUS_PATH || '';

  let repoRoot = '';
  if (bloomDir) {
    repoRoot = bloomDir;
  } else if (bloomNucleusPath) {
    repoRoot = path.dirname(bloomNucleusPath);
  }

  if (!repoRoot) {
    console.warn('[Bootstrap] ⚠️  Cannot locate repo root for Svelte dev server (BLOOM_DIR and BLOOM_NUCLEUS_PATH not set)');
    return null;
  }

  const svelteDir = path.join(repoRoot, 'webview', 'app');

  if (!fs.existsSync(path.join(svelteDir, 'vite.config.ts'))) {
    console.warn(`[Bootstrap] ⚠️  Svelte dev dir not found at ${svelteDir} — skipping`);
    return null;
  }

  // npm.cmd en Windows, npm en Unix
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

  const child = spawn(npmCmd, ['run', 'dev'], {
    cwd: svelteDir,
    detached: false,  // CORRECCIÓN: true causa EINVAL bajo NSSM en Windows
    stdio: 'ignore',  // no heredar stdin/stdout del bootstrap
  });

  child.unref(); // el event loop del padre no espera a este hijo

  console.log(`[Bootstrap] ✅ Svelte dev server starting: PID ${child.pid} (port 5173)`);
  console.log(`[Bootstrap]    CWD: ${svelteDir}`);

  return child;
}

// ============================================
// HEADLESS FILE WATCHER
// ============================================
function startHeadlessFileWatcher(wsManager) {
  const chokidar = require('chokidar');
  const bloomDir = process.env.BLOOM_NUCLEUS_PATH
    ? path.join(process.env.BLOOM_NUCLEUS_PATH, '.bloom')
    : null;

  if (!bloomDir) {
    console.warn('[Bootstrap] ⚠️  BLOOM_NUCLEUS_PATH not set — file watcher disabled');
    return null;
  }

  const watcher = chokidar.watch(`${bloomDir}/**/*`, {
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 }
  });

  watcher
    .on('change', (filePath) => {
      console.log(`[FileWatcher] btip:updated → ${filePath}`);
      wsManager.broadcast('btip:updated', { path: filePath });
    })
    .on('add', (filePath) => wsManager.broadcast('btip:updated', { path: filePath }))
    .on('unlink', (filePath) => wsManager.broadcast('btip:deleted', { path: filePath }))
    .on('error', (err) => console.error('[FileWatcher] Error:', err));

  console.log(`[Bootstrap] ✅ FileWatcher active on ${bloomDir}`);
  return watcher;
}

// ============================================
// MAIN BOOTSTRAP
// ============================================
async function bootstrap() {
  console.log('[Bootstrap] 🚀 Starting Nucleus Control Plane...');
  validateEnvironment();

  const wsManager = WebSocketManager.getInstance();
  const userManager = new HeadlessUserManager({
    storageDir: path.join(process.env.LOCALAPPDATA, 'BloomNucleus', 'users')
  });

  console.log('[Bootstrap] Starting WebSocket server (port 4124)...');
  await wsManager.start();
  await updateTelemetry('control_plane_websocket', {
    label: '🔌 WEBSOCKET SERVER',
    path: path.join(process.env.BLOOM_LOGS_DIR, 'server', `websocket_${Date.now()}.log`),
    priority: 2,
    pid: process.pid,
    port: 4124,
    state: 'READY'
  });

  console.log('[Bootstrap] Starting API server (port 48215)...');
  const apiServer = await startAPIServer({
    wsManager,
    userManager,
    port: 48215,
    role: process.env.BLOOM_USER_ROLE
  });

  await updateTelemetry('control_plane_api', {
    label: '📡 API SERVER',
    path: path.join(process.env.BLOOM_LOGS_DIR, 'server', `api_${Date.now()}.log`),
    priority: 2,
    pid: process.pid,
    port: 48215,
    state: 'READY'
  });

  const fileWatcher = startHeadlessFileWatcher(wsManager);

  // startSvelteDevServer es ahora async (usa await isPortOpen).
  // bootstrap() ya es async — podemos await acá sin cambiar la firma externa.
  const svelteServer = await startSvelteDevServer();

  console.log('[Bootstrap] ✅ Control Plane ready');
  console.log('[Bootstrap]    WebSocket: ws://localhost:4124');
  console.log('[Bootstrap]    API: http://localhost:48215');
  console.log('[Bootstrap]    Swagger: http://localhost:48215/api/docs');
  if (svelteServer) {
    console.log('[Bootstrap]    UI: http://localhost:5173');
  }

  process.on('SIGINT', async () => {
    console.log('[Bootstrap] 🛑 Shutting down...');
    if (fileWatcher) fileWatcher.close();
    if (svelteServer) svelteServer.kill();
    await wsManager.stop();
    await apiServer.close();
    process.exit(0);
  });
}

bootstrap().catch(err => {
  console.error('[Bootstrap] Fatal error:', err);
  process.exit(1);
});