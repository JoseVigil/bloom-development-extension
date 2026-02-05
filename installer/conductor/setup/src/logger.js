// logger.js
// Sistema de logging con archivos separados para installer y launcher
// Logs se guardan en: C:\Users\{user}\AppData\Local\BloomNucleus\logs\

const fs = require('fs-extra');
const path = require('path');
const { paths } = require('../config/paths');

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
  constructor(category = 'general') {
    this.category = category;
    this.logFile = null;
    this.initialized = false;
    this.telemetryPath = path.join(paths.logsDir, 'telemetry.json');
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

      const isInstaller = this.category === 'installer';
      const key = isInstaller ? 'electron_install' : 'electron_launch';
      const label = isInstaller ? '📥 ELECTRON INSTALL' : '⚡ ELECTRON LAUNCH';
      
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
   * Inicializa el logger y crea el archivo de log
   */
  async initialize() {
    if (this.initialized) return;

    try {
      let targetDir = paths.logsDir;
      let filename;

      if (this.category === 'installer') {
        targetDir = path.join(paths.logsDir, 'install');
        filename = 'electron_install.log';
      } else {
        // Por defecto para launcher o general
        filename = 'electron_launch.log';
      }

      // Asegurar que el directorio (base o /install) existe
      await fs.ensureDir(targetDir);
      this.logFile = path.join(targetDir, filename);

      const header = `
================================================================================
${this.category.toUpperCase()} LOG
Started: ${new Date().toISOString()}
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

function getLogger(category = 'general') {
  if (!loggers.has(category)) {
    const logger = new Logger(category);
    logger.initialize();
    loggers.set(category, logger);
  }
  return loggers.get(category);
}

async function closeAllLoggers() {
  for (const [category, logger] of loggers.entries()) {
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