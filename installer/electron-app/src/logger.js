// logger.js
// Sistema de logging con archivos separados para installer y launcher
// Logs se guardan en: C:\Users\{user}\AppData\Local\BloomNucleus\logs\

const fs = require('fs-extra');
const path = require('path');
const { paths } = require('../config/paths');

// Colores para consola (solo visual, no se guardan en archivo)
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
  }

  /**
   * Inicializa el logger y crea el archivo de log
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Asegurar que el directorio de logs existe
      await fs.ensureDir(paths.logsDir);

      // Determinar el nombre del archivo basado en la categoría
      let filename;
      if (this.category === 'installer') {
        filename = 'installation.log';
      } else if (this.category === 'launcher') {
        filename = 'launcher.log';
      } else {
        filename = `${this.category}.log`;
      }

      this.logFile = path.join(paths.logsDir, filename);

      // Crear header en el archivo
      const header = `
================================================================================
${this.category.toUpperCase()} LOG
Started: ${new Date().toISOString()}
================================================================================
`;
      
      await fs.appendFile(this.logFile, header);
      this.initialized = true;

      console.log(`${COLORS.cyan}[Logger]${COLORS.reset} Initialized: ${this.logFile}`);
    } catch (error) {
      console.error(`${COLORS.red}[Logger]${COLORS.reset} Failed to initialize:`, error.message);
    }
  }

  /**
   * Escribe un mensaje en consola y archivo
   */
  async writeLog(level, emoji, color, ...args) {
    // Asegurar inicialización
    if (!this.initialized) {
      await this.initialize();
    }

    const timestamp = new Date().toISOString();
    const prefix = `[${this.category.toUpperCase()}]`;
    
    // Construir mensaje
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');

    // Log a consola (con color y emoji)
    const consoleMsg = `${color}${emoji} ${prefix}${COLORS.reset} ${message}`;
    console.log(consoleMsg);

    // Log a archivo (sin color, formato limpio)
    if (this.logFile) {
      try {
        const fileMsg = `[${timestamp}] [${level}] ${prefix} ${message}\n`;
        await fs.appendFile(this.logFile, fileMsg);
      } catch (error) {
        console.error(`${COLORS.red}[Logger]${COLORS.reset} Failed to write to file:`, error.message);
      }
    }
  }

  // Métodos de logging públicos
  info(...args) {
    return this.writeLog('INFO', '📋', COLORS.blue, ...args);
  }

  success(...args) {
    return this.writeLog('SUCCESS', '✅', COLORS.green, ...args);
  }

  warn(...args) {
    return this.writeLog('WARN', '⚠️', COLORS.yellow, ...args);
  }

  error(...args) {
    return this.writeLog('ERROR', '❌', COLORS.red, ...args);
  }

  debug(...args) {
    return this.writeLog('DEBUG', '🔍', COLORS.gray, ...args);
  }

  step(...args) {
    return this.writeLog('STEP', '🔹', COLORS.magenta, ...args);
  }

  /**
   * Escribe un separador visual en el log
   */
  async separator(title = '') {
    if (!this.initialized) {
      await this.initialize();
    }

    const line = '='.repeat(80);
    const msg = title ? `\n${line}\n  ${title}\n${line}\n` : `\n${line}\n`;
    
    console.log(`${COLORS.cyan}${msg}${COLORS.reset}`);
    
    if (this.logFile) {
      try {
        await fs.appendFile(this.logFile, msg + '\n');
      } catch (error) {
        // Silently fail
      }
    }
  }
}

// ============================================================================
// SINGLETON PATTERN - Un logger por categoría
// ============================================================================

const loggers = new Map();

/**
 * Obtiene o crea un logger para una categoría específica
 * @param {string} category - 'installer', 'launcher', 'brain-service', etc.
 */
function getLogger(category = 'general') {
  if (!loggers.has(category)) {
    const logger = new Logger(category);
    logger.initialize(); // Inicializar inmediatamente
    loggers.set(category, logger);
  }
  return loggers.get(category);
}

/**
 * Cierra todos los loggers (llamar al finalizar la app)
 */
async function closeAllLoggers() {
  for (const [category, logger] of loggers.entries()) {
    if (logger.logFile) {
      try {
        const footer = `\n[${new Date().toISOString()}] Logger closed\n\n`;
        await fs.appendFile(logger.logFile, footer);
      } catch (error) {
        // Silently fail
      }
    }
  }
  loggers.clear();
}

module.exports = {
  getLogger,
  closeAllLoggers
};