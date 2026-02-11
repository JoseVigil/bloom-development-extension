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

const fs = require('fs-extra');
const path = require('path');

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

class Logger {
  constructor(category = 'general', basePath = null) {
    this.category = category;
    this.logFile = null;
    this.initialized = false;
    this.telemetryRegistered = false;
    this.streamId = null;
    this.streamLabel = null;
    this.basePath = basePath || path.join(process.env.LOCALAPPDATA, 'BloomNucleus', 'logs');
  }

  /**
   * Genera timestamp para nombre de archivo
   */
  _getTimestamp() {
    const now = new Date();
    return now.toISOString()
      .replace(/:/g, '-')
      .replace(/\..+/, '')
      .replace('T', '_');
  }

  /**
   * Inicializa el logger y crea el archivo de log
   */
  async initialize() {
    if (this.initialized) return;

    try {
      let targetDir = this.basePath;
      let filename;
      this.streamId = null;
      this.streamLabel = null;

      if (this.category === 'installer') {
        targetDir = path.join(this.basePath, 'install');
        const timestamp = this._getTimestamp();
        filename = `electron_install_${timestamp}.log`;
        this.streamId = `electron_install_${timestamp}`;
        this.streamLabel = '🔥 ELECTRON INSTALL';
      } else if (this.category === 'conductor') {
        targetDir = path.join(this.basePath, 'conductor');
        const timestamp = this._getTimestamp();
        filename = `conductor_launch_${timestamp}.log`;
        this.streamId = `conductor_launch_${timestamp}`;
        this.streamLabel = '🚀 CONDUCTOR LAUNCH';
      } else {
        // Por defecto para launcher
        targetDir = path.join(this.basePath, 'conductor');
        const timestamp = this._getTimestamp();
        filename = `conductor_launch_${timestamp}.log`;
        this.streamId = `conductor_launch_${timestamp}`;
        this.streamLabel = '🚀 CONDUCTOR LAUNCH';
      }

      // Asegurar que el directorio existe
      await fs.ensureDir(targetDir);
      this.logFile = path.join(targetDir, filename);

      const header = `
================================================================================
${this.category.toUpperCase()} LOG
Started: ${new Date().toISOString()}
Log File: ${this.logFile}
================================================================================
`;
      
      await fs.appendFile(this.logFile, header);
      this.initialized = true;

      console.log(`${COLORS.cyan}[Logger]${COLORS.reset} Initialized: ${this.logFile}`);

      // NO registrar telemetría aquí - se hará en el primer writeLog

    } catch (error) {
      console.error(`${COLORS.red}[Logger]${COLORS.reset} Failed to initialize:`, error.message);
    }
  }

  /**
   * Registra el stream en telemetry.json vía Nucleus CLI
   * NOTA: Esta operación es OPCIONAL y falla silenciosamente si nucleus.exe no existe
   */
  async _registerTelemetry(streamId, label) {
    try {
      const nucleusExe = path.join(
        process.env.LOCALAPPDATA,
        'BloomNucleus',
        'bin',
        'nucleus',
        'nucleus.exe'
      );

      // Si nucleus.exe no existe, simplemente retornar sin error
      if (!fs.existsSync(nucleusExe)) {
        console.log(`${COLORS.gray}[Logger]${COLORS.reset} Nucleus not available yet, skipping telemetry registration`);
        return;
      }

      const { spawn } = require('child_process');
      
      const child = spawn(nucleusExe, [
        'telemetry',
        'register',
        '--stream', streamId,
        '--label', label,
        '--path', this.logFile,
        '--priority', '2'
      ], {
        windowsHide: true,
        timeout: 5000
      });

      child.on('close', (code) => {
        if (code === 0) {
          console.log(`${COLORS.green}[Logger]${COLORS.reset} Telemetry registered: ${streamId}`);
        } else {
          console.log(`${COLORS.gray}[Logger]${COLORS.reset} Telemetry registration failed (code ${code}), continuing anyway`);
        }
      });

      child.on('error', (err) => {
        console.log(`${COLORS.gray}[Logger]${COLORS.reset} Telemetry registration error (expected if nucleus not ready):`, err.message);
      });

    } catch (error) {
      // Silenciar cualquier error - la telemetría es opcional
      console.log(`${COLORS.gray}[Logger]${COLORS.reset} Could not register telemetry (continuing anyway):`, error.message);
    }
  }

  /**
   * Escribe un mensaje en consola y archivo
   */
  async writeLog(level, emoji, color, ...args) {
    if (!this.initialized) {
      await this.initialize();
    }

    const timestamp = new Date().toISOString();
    const prefix = `[${this.category.toUpperCase()}]`;
    
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');

    const consoleMsg = `${color}${emoji} ${prefix}${COLORS.reset} ${message}`;
    console.log(consoleMsg);

    if (this.logFile) {
      try {
        const fileMsg = `[${timestamp}] [${level}] ${prefix} ${message}\n`;
        await fs.appendFile(this.logFile, fileMsg);
        
        // Intentar registrar telemetría SOLO la primera vez que se escribe un log
        // y SOLO si tenemos streamId configurado
        if (!this.telemetryRegistered && this.streamId && this.streamLabel) {
          this.telemetryRegistered = true;
          await this._registerTelemetry(this.streamId, this.streamLabel);
        }
      } catch (error) {
        console.error(`${COLORS.red}[Logger]${COLORS.reset} Failed to write to file:`, error.message);
      }
    }
  }

  info(...args) { return this.writeLog('INFO', '[INFO]', COLORS.blue, ...args); }
  success(...args) { return this.writeLog('SUCCESS', '[OK]', COLORS.green, ...args); }
  warn(...args) { return this.writeLog('WARN', '[WARN]', COLORS.yellow, ...args); }
  error(...args) { return this.writeLog('ERROR', '[ERROR]', COLORS.red, ...args); }
  debug(...args) { return this.writeLog('DEBUG', '[DEBUG]', COLORS.gray, ...args); }
  step(...args) { return this.writeLog('STEP', '[STEP]', COLORS.magenta, ...args); }

  async separator(title = '') {
    if (!this.initialized) await this.initialize();
    const line = '='.repeat(80);
    const msg = title ? `\n${line}\n  ${title}\n${line}\n` : `\n${line}\n`;
    console.log(`${COLORS.cyan}${msg}${COLORS.reset}`);
    if (this.logFile) {
      try {
        await fs.appendFile(this.logFile, msg + '\n');
      } catch (error) {}
    }
  }
}

const loggers = new Map();

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
  for (const [key, logger] of loggers.entries()) {
    if (logger.logFile) {
      try {
        const footer = `\n[${new Date().toISOString()}] Logger closed\n\n`;
        await fs.appendFile(logger.logFile, footer);
      } catch (error) {}
    }
  }
  loggers.clear();
}

module.exports = {
  getLogger,
  closeAllLoggers
};