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
//              Ver: internal/supervisor/supervisor.go → bootControlPlane()
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

// ── Módulos compilados (TypeScript → JS) ────────────────────────────────────
// En build: esbuild resuelve estos paths y los incrusta en bundle.js.
// En dev:   requieren NODE_PATH=<repo>/out o paths relativos funcionando.
const { WebSocketManager } = require('../../out/server/WebSocketManager');
const { startAPIServer } = require('../../out/api/server');
const { HeadlessUserManager } = require('../../out/managers/HeadlessUserManager');

// ============================================
// ENVIRONMENT VALIDATION
// ============================================
const REQUIRED_ENV = [
  'BLOOM_USER_ROLE',
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
  if (process.env.BLOOM_WORKER_RUNNING !== 'true') {
    console.error('[Bootstrap] Temporal worker is not running');
    process.exit(1);
  }
  console.log('[Bootstrap] ✅ Environment validated');
  console.log(`[Bootstrap]    Role: ${process.env.BLOOM_USER_ROLE}`);
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

  console.log('[Bootstrap] ✅ Control Plane ready');
  console.log('[Bootstrap]    WebSocket: ws://localhost:4124');
  console.log('[Bootstrap]    API: http://localhost:48215');
  console.log('[Bootstrap]    Swagger: http://localhost:48215/api/docs');

  process.on('SIGINT', async () => {
    console.log('[Bootstrap] 🛑 Shutting down...');
    if (fileWatcher) fileWatcher.close();
    await wsManager.stop();
    await apiServer.close();
    process.exit(0);
  });
}

bootstrap().catch(err => {
  console.error('[Bootstrap] Fatal error:', err);
  process.exit(1);
});