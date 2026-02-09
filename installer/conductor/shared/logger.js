// shared/logger.js
// Sistema de logging unificado para installer y conductor
// Logs se guardan en: C:\Users\{user}\AppData\Local\BloomNucleus\logs\

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
    this.basePath = basePath || path.join(process.env.LOCALAPPDATA, 'BloomNucleus', 'logs');
    this.telemetryPath = path.join(this.basePath, 'telemetry.json');
  }

  /**
   * Actualiza el archivo telemetry.json con la información del stream actual
   */
  async _updateTelemetry() {
    try {
      let telemetry = { active_streams: {} };
      
      if (await fs.pathExists(this.telemetryPath)) {
        telemetry = await fs.readJson(this.telemetryPath);
      }

      if (!telemetry.active_streams) telemetry.active_streams = {};

      let key, label;
      
      if (this.category === 'installer') {
        key = 'electron_install';
        label = '📥 ELECTRON INSTALL';
      } else if (this.category === 'conductor') {
        key = 'electron_conductor';
        label = '🎯 CONDUCTOR';
      } else {
        key = 'electron_launch';
        label = '⚡ ELECTRON LAUNCH';
      }
      
      telemetry.active_streams[key] = {
        label: label,
        path: this.logFile,
        priority: 2,
        last_update: new Date().toISOString()
      };

      await fs.writeJson(this.telemetryPath, telemetry, { spaces: 2 });
    } catch (error) {
      // Silently fail telemetry update to not interrupt logging
    }
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

      if (this.category === 'installer') {
        targetDir = path.join(this.basePath, 'install');
        filename = 'electron_install.log';
      } else if (this.category === 'conductor') {
        // ✅ Conductor con timestamp para evitar archivos grandes
        targetDir = path.join(this.basePath, 'conductor');
        const timestamp = this._getTimestamp();
        filename = `conductor_${timestamp}.log`;
      } else {
        // Por defecto para launcher o general
        filename = 'electron_launch.log';
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

      // Primera actualización de telemetría
      await this._updateTelemetry();

      console.log(`${COLORS.cyan}[Logger]${COLORS.reset} Initialized: ${this.logFile}`);
    } catch (error) {
      console.error(`${COLORS.red}[Logger]${COLORS.reset} Failed to initialize:`, error.message);
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
        
        // Actualizar telemetría periódicamente (en cada escritura importante)
        await this._updateTelemetry();
      } catch (error) {
        console.error(`${COLORS.red}[Logger]${COLORS.reset} Failed to write to file:`, error.message);
      }
    }
  }

  info(...args) { return this.writeLog('INFO', '📋', COLORS.blue, ...args); }
  success(...args) { return this.writeLog('SUCCESS', '✅', COLORS.green, ...args); }
  warn(...args) { return this.writeLog('WARN', '⚠️', COLORS.yellow, ...args); }
  error(...args) { return this.writeLog('ERROR', '❌', COLORS.red, ...args); }
  debug(...args) { return this.writeLog('DEBUG', '🔍', COLORS.gray, ...args); }
  step(...args) { return this.writeLog('STEP', '🔹', COLORS.magenta, ...args); }

  async separator(title = '') {
    if (!this.initialized) await this.initialize();
    const line = '='.repeat(80);
    const msg = title ? `\n${line}\n  ${title}\n${line}\n` : `\n${line}\n`;
    console.log(`${COLORS.cyan}${msg}${COLORS.reset}`);
    if (this.logFile) {
      try {
        await fs.appendFile(this.logFile, msg + '\n');
        await this._updateTelemetry();
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
        await logger._updateTelemetry();
      } catch (error) {}
    }
  }
  loggers.clear();
}

module.exports = {
  getLogger,
  closeAllLoggers
};