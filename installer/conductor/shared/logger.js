// shared/logger.js
// Sistema de logging unificado para installer y conductor
// Logs se guardan en: C:\Users\{user}\AppData\Local\BloomNucleus\logs\
//
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🟢 TELEMETRY POLICY — FINAL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// ✅ THIS MODULE ONLY WRITES .log FILES
//
// Telemetry registration:
//    - Applications invoke: nucleus telemetry register <stream_id> <log_path>
//    - Nucleus is the ONLY writer to telemetry.json
//    - Logger never touches telemetry.json
//
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// STREAMS REGISTRADOS:
//
//  Módulo       stream_id              subcarpeta                    source
//  ─────────────────────────────────────────────────────────────────────────
//  setup        conductor_setup        logs/conductor/setup/         conductor
//  onboarding   conductor_onboarding   logs/conductor/onboarding/    conductor
//  core         conductor_core         logs/conductor/core/          conductor
//
// Filename pattern: <stream_id>_YYYYMMDD.log
// Priority: 2 (Important) para todos los módulos conductor
//
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const fs = require('fs-extra');
const path = require('path');

const COLORS = {
  reset:   '\x1b[0m',
  bright:  '\x1b[1m',
  red:     '\x1b[31m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  cyan:    '\x1b[36m',
  gray:    '\x1b[90m'
};

// ── STREAM DEFINITIONS ─────────────────────────────────────────────────────
// Fuente de verdad para todos los streams de telemetría de Electron.
// stream_id es ESTABLE Y PERMANENTE — nunca incluir timestamps aquí.
// El timestamp va solo en el filename del log file.
//
// Campos:
//   streamId    → ID estable registrado en telemetry.json
//   streamLabel → Label visible en el dashboard de telemetría
//   subfolder   → Subcarpeta dentro de logs/conductor/
//   source      → Binario que escribe el log (siempre 'conductor' para Electron)
//   category    → Categoría de telemetría (ver BLOOM_NUCLEUS_LOGGING_SPEC.md)
//   priority    → 1=Critical, 2=Important, 3=Informational
//   description → Descripción del stream para telemetry.json
const STREAM_DEFINITIONS = {
  installer: {
    streamId:    'conductor_setup',
    streamLabel: '🔧 BLOOM SETUP',
    subfolder:   'setup',
    source:      'conductor',
    category:    'conductor',
    priority:    '2',
    description: 'Bloom Setup installer log — one file per install attempt, captures full installation flow, milestone progress and binary deployment'
  },
  onboarding: {
    streamId:    'conductor_onboarding',
    streamLabel: '🚀 CONDUCTOR ONBOARDING',
    subfolder:   'onboarding',
    source:      'conductor',
    category:    'conductor',
    priority:    '2',
    description: 'Conductor onboarding log — full onboarding flow from boot to completion, IPC calls, screen transitions and nucleus.exe invocations'
  },
  core: {
    streamId:    'conductor_core',
    streamLabel: '🖥️ CONDUCTOR CORE',
    subfolder:   'core',
    source:      'conductor',
    category:    'conductor',
    priority:    '2',
    description: 'Conductor core workspace log — daily workspace session, profile management, health checks and nucleus.exe interactions'
  }
};

// Fallback para categorías no definidas explícitamente
const DEFAULT_STREAM = {
  streamId:    'conductor_general',
  streamLabel: '📋 CONDUCTOR GENERAL',
  subfolder:   'general',
  source:      'conductor',
  category:    'conductor',
  priority:    '2',
  description: 'Conductor general log'
};

// ── LOGGER CLASS ───────────────────────────────────────────────────────────
class Logger {
  constructor(category = 'general', basePath = null) {
    this.category = category;
    this.logFile  = null;
    this.initialized        = false;
    this.telemetryRegistered = false;
    this.streamId    = null;
    this.streamLabel = null;
    this.streamMeta  = null;
    this.basePath = basePath || path.join(
      process.env.LOCALAPPDATA || path.join(require('os').homedir(), 'AppData', 'Local'),
      'BloomNucleus',
      'logs'
    );
  }

  /**
   * Genera string de fecha YYYYMMDD para filenames
   */
  _getDateStr() {
    return new Date().toISOString().slice(0, 10).replace(/-/g, '');
  }

  /**
   * Inicializa el logger: resuelve el stream definition, crea el directorio
   * y el archivo de log con su header.
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Resolver stream definition según categoría
      const def = STREAM_DEFINITIONS[this.category] || DEFAULT_STREAM;

      this.streamId    = def.streamId;
      this.streamLabel = def.streamLabel;
      this.streamMeta  = def;

      // Construir path: logs/conductor/<subfolder>/
      const targetDir = path.join(this.basePath, 'conductor', def.subfolder);
      await fs.ensureDir(targetDir);

      // Filename: <stream_id>_YYYYMMDD.log
      const filename = `${def.streamId}_${this._getDateStr()}.log`;
      this.logFile = path.join(targetDir, filename);

      const header = [
        '',
        '='.repeat(80),
        `  ${this.category.toUpperCase()} LOG`,
        `  Stream:  ${def.streamId}`,
        `  Started: ${new Date().toISOString()}`,
        `  File:    ${this.logFile}`,
        '='.repeat(80),
        ''
      ].join('\n');

      await fs.appendFile(this.logFile, header);
      this.initialized = true;

      console.log(`${COLORS.cyan}[Logger]${COLORS.reset} Initialized: ${this.logFile}`);

    } catch (error) {
      console.error(`${COLORS.red}[Logger]${COLORS.reset} Failed to initialize:`, error.message);
    }
  }

  /**
   * Registra el stream en telemetry.json vía nucleus telemetry register.
   *
   * POLÍTICA:
   *   - Nucleus es el ÚNICO writer de telemetry.json
   *   - Este método solo invoca el CLI, nunca modifica el JSON directamente
   *   - Falla silenciosamente si nucleus.exe no está disponible
   *   - Se invoca UNA SOLA VEZ por sesión (primer write del logger)
   */
  async _registerTelemetry() {
    try {
      const nucleusExe = path.join(
        process.env.LOCALAPPDATA || path.join(require('os').homedir(), 'AppData', 'Local'),
        'BloomNucleus', 'bin', 'nucleus', 'nucleus.exe'
      );

      if (!fs.existsSync(nucleusExe)) {
        console.log(`${COLORS.gray}[Logger]${COLORS.reset} Nucleus not available yet, skipping telemetry registration`);
        return;
      }

      const def = this.streamMeta;

      // Normalizar path para nucleus (siempre forward slashes)
      const normalizedLogPath = this.logFile.replace(/\\/g, '/');

      const args = [
        'telemetry', 'register',
        '--stream',      def.streamId,
        '--label',       def.streamLabel,
        '--path',        normalizedLogPath,
        '--priority',    def.priority,
        '--category',    def.category,
        '--source',      def.source,        // FIX: --source ahora se pasa correctamente
        '--description', def.description
      ];

      const { spawn } = require('child_process');
      const child = spawn(nucleusExe, args, {
        windowsHide: true,
        timeout: 5000
      });

      child.on('close', (code) => {
        if (code === 0) {
          console.log(`${COLORS.green}[Logger]${COLORS.reset} Telemetry registered: ${def.streamId}`);
        } else {
          console.log(`${COLORS.gray}[Logger]${COLORS.reset} Telemetry registration failed (code ${code}), continuing anyway`);
        }
      });

      child.on('error', (err) => {
        console.log(`${COLORS.gray}[Logger]${COLORS.reset} Telemetry registration error (expected if nucleus not ready):`, err.message);
      });

    } catch (error) {
      // Silenciar — telemetría es opcional, nunca debe bloquear el flujo
      console.log(`${COLORS.gray}[Logger]${COLORS.reset} Could not register telemetry (continuing anyway):`, error.message);
    }
  }

  /**
   * Escribe un mensaje en consola y en el archivo de log.
   * Registra telemetría en el primer write de la sesión.
   */
  async writeLog(level, emoji, color, ...args) {
    if (!this.initialized) {
      await this.initialize();
    }

    const timestamp = new Date().toISOString();
    const prefix    = `[${this.category.toUpperCase()}]`;

    const message = args.map(arg =>
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');

    console.log(`${color}${emoji} ${prefix}${COLORS.reset} ${message}`);

    if (this.logFile) {
      try {
        await fs.appendFile(this.logFile, `[${timestamp}] [${level}] ${prefix} ${message}\n`);

        // Registrar telemetría UNA SOLA VEZ por sesión, en el primer write
        if (!this.telemetryRegistered && this.streamId && this.streamMeta) {
          this.telemetryRegistered = true;
          await this._registerTelemetry();
        }
      } catch (error) {
        console.error(`${COLORS.red}[Logger]${COLORS.reset} Failed to write to file:`, error.message);
      }
    }
  }

  // ── PUBLIC API ─────────────────────────────────────────────────────────
  info(...args)    { return this.writeLog('INFO',    '[INFO]',    COLORS.blue,    ...args); }
  success(...args) { return this.writeLog('SUCCESS', '[OK]',      COLORS.green,   ...args); }
  warn(...args)    { return this.writeLog('WARN',    '[WARN]',    COLORS.yellow,  ...args); }
  error(...args)   { return this.writeLog('ERROR',   '[ERROR]',   COLORS.red,     ...args); }
  debug(...args)   { return this.writeLog('DEBUG',   '[DEBUG]',   COLORS.gray,    ...args); }
  step(...args)    { return this.writeLog('STEP',    '[STEP]',    COLORS.magenta, ...args); }

  async separator(title = '') {
    if (!this.initialized) await this.initialize();
    const line = '='.repeat(80);
    const msg  = title ? `\n${line}\n  ${title}\n${line}\n` : `\n${line}\n`;
    console.log(`${COLORS.cyan}${msg}${COLORS.reset}`);
    if (this.logFile) {
      try {
        await fs.appendFile(this.logFile, msg + '\n');
      } catch (_) {}
    }
  }
}

// ── SINGLETON REGISTRY ─────────────────────────────────────────────────────
const loggers = new Map();

/**
 * Obtiene o crea un logger para la categoría dada.
 *
 * Categorías válidas:
 *   'installer'   → setup/main.js y install/*.js
 *   'onboarding'  → workspace/onboarding/
 *   'core'        → workspace/core/
 *
 * @param {string} category
 * @param {string|null} basePath  Override del directorio base de logs (opcional)
 */
function getLogger(category = 'general', basePath = null) {
  const key = `${category}_${basePath || 'default'}`;
  if (!loggers.has(key)) {
    const logger = new Logger(category, basePath);
    logger.initialize();
    loggers.set(key, logger);
  }
  return loggers.get(key);
}

async function closeAllLoggers() {
  for (const [, logger] of loggers.entries()) {
    if (logger.logFile) {
      try {
        await fs.appendFile(
          logger.logFile,
          `\n[${new Date().toISOString()}] Logger closed\n\n`
        );
      } catch (_) {}
    }
  }
  loggers.clear();
}

module.exports = {
  getLogger,
  closeAllLoggers
};