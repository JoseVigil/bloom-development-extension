// diagnostic-entry.js — Worker de diagnóstico TEMPORAL para el build
// empaquetado de bloom-workspace.
//
// Contexto (sesión de investigación backend_identity_check / Runner E2E,
// 2026-09-21): `npm run dev:linux` (electron . --no-sandbox, sin empaquetar)
// abre la ventana de onboarding normalmente. El binario empaquetado
// (bin/workspace/bloom-workspace, instalado en producción) NO abre ninguna
// ventana y no imprime absolutamente nada por stdout/stderr en 150s de
// espera — ni siquiera el "[Logger] Initialized: ..." que main_conductor.js
// debería loguear de forma síncrona al arrancar. Este archivo existe
// exclusivamente para aislar en qué punto exacto se cuelga o crashea el
// build empaquetado. NO es parte del producto.
//
// Cómo se activa: reemplazando temporalmente "main" en package.json por
// "diagnostic-entry.js" (en vez de "main_conductor.js") para UN build de
// diagnóstico — nunca dejarlo así en un build real. Ver instructivo de
// integración para los pasos exactos de build/uso/revert.
//
// Principio de diseño: todo se escribe a disco de forma SÍNCRONA
// (fs.appendFileSync), nunca solo por consola. Si el proceso termina
// abruptamente (crash nativo, SIGKILL de un timeout externo) un
// console.log corriente puede perderse antes de flushear — un
// appendFileSync no.

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const LOG_PATH = path.join(os.homedir(), '.local', 'share', 'BloomNucleus', 'logs', 'DIAGNOSTIC_bloom_workspace.log');

// Asegurar que el directorio de logs exista — main_conductor.js normalmente
// lo crea vía Logger, pero acá corremos ANTES de requerir ese módulo.
try {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
} catch (e) {
  // Si esto falla ya es información valiosa en sí misma — lo intentamos
  // loguear más abajo apenas diag() esté definida.
}

let _seq = 0;
function diag(tag, data) {
  _seq += 1;
  const line = `[${new Date().toISOString()}] #${_seq} [${tag}] ${data !== undefined ? safeStringify(data) : ''}\n`;
  try {
    fs.appendFileSync(LOG_PATH, line);
  } catch (e) {
    try { process.stderr.write(`[diag-fallback] ${line}`); } catch (_) { /* no-op */ }
  }
  // También a stderr — por si esta corrida puntual SÍ deja ver la consola
  // (por ejemplo corriendo el binario a mano en una terminal).
  try { process.stderr.write(`[DIAG] ${line}`); } catch (_) { /* no-op */ }
}

function safeStringify(data) {
  try {
    return JSON.stringify(data);
  } catch (e) {
    return `[no serializable: ${e.message}]`;
  }
}

diag('RUN_START', {
  pid: process.pid,
  argv: process.argv,
  execPath: process.execPath,
  cwd: process.cwd(),
  __dirname,
  platform: process.platform,
  arch: process.arch,
});
diag('PROCESS_VERSIONS', process.versions);
diag('PROCESS_ENV_RELEVANT', {
  DISPLAY: process.env.DISPLAY,
  WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY,
  XDG_SESSION_TYPE: process.env.XDG_SESSION_TYPE,
  XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR,
  HAS_DBUS_SESSION_BUS_ADDRESS: !!process.env.DBUS_SESSION_BUS_ADDRESS,
  HOME: process.env.HOME,
  BLOOM_NUCLEUS_BASE_DIR_OVERRIDE: process.env.BLOOM_NUCLEUS_BASE_DIR_OVERRIDE,
  NODE_ENV: process.env.NODE_ENV,
  ELECTRON_RUN_AS_NODE: process.env.ELECTRON_RUN_AS_NODE,
});

process.on('uncaughtException', (err) => {
  diag('UNCAUGHT_EXCEPTION', { message: err && err.message, stack: err && err.stack });
});
process.on('unhandledRejection', (reason) => {
  diag('UNHANDLED_REJECTION', {
    reason: String(reason),
    stack: reason && reason.stack,
  });
});
process.on('warning', (warning) => {
  diag('PROCESS_WARNING', { message: warning && warning.message, stack: warning && warning.stack });
});
process.on('exit', (code) => {
  diag('PROCESS_EXIT', { code });
});
process.on('SIGTERM', () => diag('PROCESS_SIGTERM'));
process.on('SIGINT', () => diag('PROCESS_SIGINT'));

// Watchdog — si esta línea deja de aparecer en el log, el event loop se
// congeló de forma síncrona en vez de que el proceso termine. Distingue
// "colgado" de "muerto".
setInterval(() => diag('WATCHDOG_ALIVE'), 3000).unref();

let electron;
try {
  electron = require('electron');
  diag('ELECTRON_REQUIRE_OK', {
    hasApp: !!electron.app,
    isPackaged: electron.app && electron.app.isPackaged,
    resourcesPath: process.resourcesPath,
  });
} catch (e) {
  diag('ELECTRON_REQUIRE_FAILED', { message: e.message, stack: e.stack });
  throw e;
}

const { app, dialog } = electron;

app.on('ready', () => diag('APP_EVENT_ready'));
app.on('window-all-closed', () => diag('APP_EVENT_window-all-closed'));
app.on('browser-window-created', (_e, win) => diag('APP_EVENT_browser-window-created', { id: win.id }));
// child-process-gone cubre GPU/Renderer/Sandbox-helper/Utility — si el
// sandbox de Chromium es el problema (hipótesis principal de esta sesión:
// dev:linux corre con --no-sandbox explícito, el binario empaquetado no),
// esto debería mostrar reason:'launch-failed' para type:'GPU' o
// type:'Sandbox helper'.
app.on('child-process-gone', (_e, details) => diag('APP_EVENT_child-process-gone', details));
app.on('render-process-gone', (_e, _webContents, details) => diag('APP_EVENT_render-process-gone', details));
app.on('gpu-info-update', () => diag('APP_EVENT_gpu-info-update'));
app.on('certificate-error', () => diag('APP_EVENT_certificate-error'));

app.whenReady().then(() => {
  diag('APP_WHENREADY_RESOLVED', {
    gpuFeatureStatus: safeCall(() => app.getGPUFeatureStatus()),
    commandLineSwitches: safeCall(() => app.commandLine.getSwitches()),
  });
}).catch((e) => diag('APP_WHENREADY_REJECTED', { message: e.message, stack: e.stack }));

function safeCall(fn) {
  try {
    return fn();
  } catch (e) {
    return `ERROR: ${e.message}`;
  }
}

// Interceptar diálogos nativos — si main_conductor.js muestra
// "Installation Required" / "Installation Incomplete" / "Services Failed to
// Start" (ver app.whenReady() en main_conductor.js), esto debería aparecer
// ANTES de que el proceso quede colgado esperando un click que nadie va a
// dar en una corrida sin usuario interactivo.
const _origShowMessageBox = dialog.showMessageBox.bind(dialog);
dialog.showMessageBox = (...args) => {
  diag('DIALOG_showMessageBox_CALLED', { args: safeStringifyArgs(args) });
  return _origShowMessageBox(...args);
};
const _origShowErrorBox = dialog.showErrorBox.bind(dialog);
dialog.showErrorBox = (...args) => {
  diag('DIALOG_showErrorBox_CALLED', { args: safeStringifyArgs(args) });
  return _origShowErrorBox(...args);
};

function safeStringifyArgs(args) {
  try {
    return JSON.parse(JSON.stringify(args));
  } catch (e) {
    return '[unserializable]';
  }
}

// Verificar ANTES de requerir main_conductor.js que los extraFiles
// (shared/logger.js, shared/global_paths.js — copiados fuera del asar por
// electron-builder) están efectivamente donde main_conductor.js los va a
// buscar. Si esto falla acá, es la causa raíz y main_conductor.js ni
// siquiera llega a intentar loguear nada.
const _sharedDir = app.isPackaged
  ? path.join(process.resourcesPath, 'shared')
  : path.join(__dirname, '..', 'shared');
diag('SHARED_DIR_RESOLVED', { sharedDir: _sharedDir, exists: fs.existsSync(_sharedDir) });
for (const mod of ['logger', 'global_paths']) {
  const modPath = path.join(_sharedDir, mod);
  try {
    require.resolve(modPath);
    diag('SHARED_MODULE_RESOLVABLE', { mod, modPath });
  } catch (e) {
    diag('SHARED_MODULE_NOT_RESOLVABLE', { mod, modPath, message: e.message });
  }
}

diag('REQUIRING_MAIN_CONDUCTOR', { path: path.join(__dirname, 'main_conductor.js') });
try {
  require('./main_conductor.js');
  diag('MAIN_CONDUCTOR_REQUIRE_OK');
} catch (e) {
  diag('MAIN_CONDUCTOR_REQUIRE_THREW', { message: e.message, stack: e.stack });
  throw e;
}
