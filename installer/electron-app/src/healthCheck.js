/**
 * Health Check Manager for Bloom Nucleus Stack Verification
 * Handles API polling, CLI fallback, retries, and comprehensive error reporting
 * 
 * @file installer/src/healthCheck.js
 * @module HealthCheckManager
 * @requires node-fetch
 * @requires child_process
 */

const fetch = require('node-fetch');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * @typedef {Object} HealthCheckResult
 * @property {boolean} success - Whether health check passed
 * @property {string} method - Method used ('api', 'cli', 'none')
 * @property {Object} data - Health data response
 * @property {string} [error] - Error message if failed
 * @property {number} attempt - Number of attempts made
 */

/**
 * @typedef {Object} HealthCheckOptions
 * @property {string} [apiUrl] - API endpoint URL
 * @property {number} [maxRetries] - Maximum retry attempts
 * @property {number} [retryDelay] - Delay between retries (ms)
 * @property {number} [requestTimeout] - Timeout per request (ms)
 * @property {boolean} [verbose] - Enable verbose logging
 * @property {string} [logFile] - Path to log file
 */

class HealthCheckManager {
  /**
   * Create a health check manager
   * @param {HealthCheckOptions} options - Configuration options
   */
  constructor(options = {}) {
    this.apiUrl = options.apiUrl || 'http://localhost:48215/api/v1/health';
    this.maxRetries = options.maxRetries || 10;
    this.retryDelay = options.retryDelay || 5000; // 5 seconds
    this.requestTimeout = options.requestTimeout || 5000; // 5 seconds
    this.verbose = options.verbose || false;
    this.logFile = options.logFile || path.join(
      process.env.LOCALAPPDATA || process.env.HOME,
      'BloomNucleus',
      'logs',
      'installer.log'
    );
    
    this.ensureLogDir();
  }

  /**
   * Ensure log directory exists
   * @private
   */
  ensureLogDir() {
    const logDir = path.dirname(this.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  /**
   * Log message to file with timestamp
   * @param {string} level - Log level (INFO, WARN, ERROR, DEBUG)
   * @param {string} component - Component name
   * @param {string} message - Log message
   */
  log(level, component, message) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] [${component}] ${message}\n`;
    
    if (this.verbose) {
      console.log(logEntry.trim());
    }
    
    try {
      fs.appendFileSync(this.logFile, logEntry);
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  /**
   * Execute full health check with retries and fallback
   * @param {Function} [progressCallback] - Optional callback for progress updates
   * @returns {Promise<HealthCheckResult>}
   */
  async executeHealthCheck(progressCallback = null) {
    this.log('INFO', 'HealthCheck', 'Starting full health verification');
    this.log('INFO', 'HealthCheck', `Config: maxRetries=${this.maxRetries}, retryDelay=${this.retryDelay}ms`);
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      this.log('INFO', 'HealthCheck', `Attempt ${attempt}/${this.maxRetries}`);
      
      // Report progress
      if (progressCallback) {
        progressCallback({
          attempt,
          maxAttempts: this.maxRetries,
          message: `Verificando componentes (intento ${attempt}/${this.maxRetries})...`
        });
      }
      
      try {
        // Try API first
        this.log('INFO', 'HealthCheck', 'Attempting API health check');
        const result = await this.checkViaAPI();
        
        if (result.success && result.data.status === 'ok') {
          this.log('INFO', 'HealthCheck', `✓ Health check PASSED via API (score: ${result.data.overall_health_score || 'N/A'})`);
          return {
            success: true,
            method: 'api',
            data: result.data,
            attempt
          };
        } else if (result.data && result.data.status === 'partial') {
          this.log('WARN', 'HealthCheck', 'Partial health detected - some components failing');
          return {
            success: false,
            method: 'api',
            data: result.data,
            error: 'Partial health - some components failing',
            attempt
          };
        }
        
        this.log('WARN', 'HealthCheck', `API check returned non-ok status: ${result.data?.status || 'unknown'}`);
        
      } catch (apiError) {
        this.log('WARN', 'HealthCheck', `API check failed: ${apiError.message}`);
        
        // Fallback to CLI
        this.log('INFO', 'HealthCheck', 'Attempting CLI fallback');
        try {
          const cliResult = await this.checkViaCLI();
          
          if (cliResult.success && cliResult.data.status === 'ok') {
            this.log('INFO', 'HealthCheck', '✓ Health check PASSED via CLI fallback');
            return {
              success: true,
              method: 'cli',
              data: cliResult.data,
              attempt
            };
          }
          
          this.log('WARN', 'HealthCheck', `CLI check returned non-ok status: ${cliResult.data?.status || 'unknown'}`);
          
        } catch (cliError) {
          this.log('ERROR', 'HealthCheck', `CLI fallback failed: ${cliError.message}`);
        }
      }
      
      // Wait before retry (except on last attempt)
      if (attempt < this.maxRetries) {
        this.log('INFO', 'HealthCheck', `Waiting ${this.retryDelay}ms before retry`);
        await this.sleep(this.retryDelay);
      }
    }
    
    // All retries exhausted
    this.log('ERROR', 'HealthCheck', `✗ All health check attempts FAILED after ${this.maxRetries} retries`);
    return {
      success: false,
      method: 'none',
      error: `Health checks failed after ${this.maxRetries} retries`,
      attempt: this.maxRetries
    };
  }

  /**
   * Check health via REST API
   * @returns {Promise<{success: boolean, data: Object}>}
   * @private
   */
  async checkViaAPI() {
    this.log('INFO', 'API', `Fetching ${this.apiUrl}`);
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeout);
    
    try {
      const response = await fetch(this.apiUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'BloomNucleus-Installer/1.0',
          'Accept': 'application/json'
        }
      });
      
      clearTimeout(timeout);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      this.log('INFO', 'API', `Response received: status="${data.status}", score=${data.overall_health_score || 'N/A'}`);
      this.log('DEBUG', 'API', `Full response: ${JSON.stringify(data)}`);
      
      return { success: true, data };
      
    } catch (error) {
      clearTimeout(timeout);
      
      if (error.name === 'AbortError') {
        const timeoutError = new Error(`API request timeout (${this.requestTimeout}ms)`);
        this.log('ERROR', 'API', timeoutError.message);
        throw timeoutError;
      }
      
      this.log('ERROR', 'API', `Request failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check health via Brain CLI (fallback method)
   * @returns {Promise<{success: boolean, data: Object}>}
   * @private
   */
  async checkViaCLI() {
    this.log('INFO', 'CLI', 'Executing: brain health full-stack --json');
    
    return new Promise((resolve, reject) => {
      const bloomDir = path.join(
        process.env.LOCALAPPDATA || process.env.HOME,
        'BloomNucleus'
      );
      
      const pythonPath = path.join(bloomDir, 'python', 'python.exe');
      
      // Check if Python exists
      if (!fs.existsSync(pythonPath)) {
        const error = new Error(`Python runtime not found at ${pythonPath}`);
        this.log('ERROR', 'CLI', error.message);
        reject(error);
        return;
      }
      
      this.log('DEBUG', 'CLI', `Python path: ${pythonPath}`);
      this.log('DEBUG', 'CLI', `Working directory: ${bloomDir}`);
      
      const brainMainPath = getBrainMainPath(bloomDir); // Helper function
      const proc = spawn(pythonPath, [brainMainPath, '--json', 'health', 'full-stack'], {
        cwd: bloomDir,
        timeout: 15000,
        windowsHide: true
      });
      
      let stdout = '';
      let stderr = '';
      
      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
        this.log('DEBUG', 'CLI', `stderr: ${data.toString().trim()}`);
      });
      
      proc.on('close', (code) => {
        this.log('INFO', 'CLI', `Process exited with code ${code}`);
        
        if (code === 0) {
          try {
            const data = JSON.parse(stdout);
            this.log('INFO', 'CLI', 'Successfully parsed CLI JSON output');
            this.log('DEBUG', 'CLI', `Parsed data: ${JSON.stringify(data)}`);
            resolve({ success: true, data });
          } catch (parseError) {
            this.log('ERROR', 'CLI', `Failed to parse JSON: ${parseError.message}`);
            this.log('DEBUG', 'CLI', `Raw stdout: ${stdout}`);
            reject(new Error('Failed to parse CLI output as JSON'));
          }
        } else {
          const error = new Error(`CLI process exited with code ${code}`);
          this.log('ERROR', 'CLI', error.message);
          if (stderr) {
            this.log('ERROR', 'CLI', `stderr output: ${stderr}`);
          }
          reject(error);
        }
      });
      
      proc.on('error', (error) => {
        this.log('ERROR', 'CLI', `Process spawn error: ${error.message}`);
        reject(error);
      });
    });
  }

  /**
   * Get Brain __main__.py path based on Bloom directory
   * @param {string} bloomDir - Bloom installation directory
   * @returns {string} Path to brain/__main__.py
   * @private
   */
  getBrainMainPath(bloomDir) {
    const platform = require('os').platform();
    
    if (platform === 'win32') {
      return path.join(bloomDir, 'engine', 'runtime', 'Lib', 'site-packages', 'brain', '__main__.py');
    } else if (platform === 'darwin') {
      return path.join(bloomDir, 'engine', 'runtime', 'lib', 'python3.11', 'site-packages', 'brain', '__main__.py');
    } else {
      return path.join(bloomDir, 'engine', 'runtime', 'lib', 'python3.11', 'site-packages', 'brain', '__main__.py');
    }
  }

  /**
   * Get user-friendly error message based on health data
   * @param {Object} healthData - Health check response data
   * @returns {string} User-friendly error message
   */
  getUserFriendlyError(healthData) {
    if (!healthData || !healthData.details) {
      return 'No se pudo verificar el estado del sistema. Los servicios pueden no estar respondiendo.';
    }
    
    const details = healthData.details;
    const issues = [];
    
    // Check each component
    if (details.host && details.host.status !== 'connected') {
      issues.push('🔴 Servicio Host: bloom-host.exe no responde\n   → Verifica que el servicio esté ejecutándose en Servicios de Windows');
    }
    
    if (details.api && details.api.status !== 'online') {
      issues.push('🔴 API REST: No disponible en puerto 48215\n   → Verifica que el plugin de VSCode esté activo');
    }
    
    if (details.extension && details.extension.status !== 'installed') {
      issues.push('🔴 Extensión Chrome: No detectada o no instalada\n   → Reinstala la extensión desde Chrome Web Store');
    }
    
    if (details.brain && details.brain.status !== 'ok') {
      issues.push('🔴 Brain CLI: No responde correctamente\n   → Verifica la instalación de Python y dependencias');
    }
    
    if (details.onboarding && !details.onboarding.ready) {
      issues.push('⚠️  Onboarding: Configuración incompleta\n   → Algunos pasos de configuración están pendientes');
    }
    
    if (issues.length === 0) {
      return 'Estado del sistema parcial o inestable. Revisa los logs para más detalles.';
    }
    
    return issues.join('\n\n');
  }

  /**
   * Get health summary for display
   * @param {Object} healthData - Health check response data
   * @returns {Object} Summary object with component statuses
   */
  getHealthSummary(healthData) {
    if (!healthData || !healthData.details) {
      return { overall: 'unknown', components: [] };
    }
    
    const components = [];
    const details = healthData.details;
    
    if (details.host) {
      components.push({
        name: 'Host Service',
        status: details.host.status,
        icon: details.host.status === 'connected' ? '✅' : '❌'
      });
    }
    
    if (details.api) {
      components.push({
        name: 'REST API',
        status: details.api.status,
        icon: details.api.status === 'online' ? '✅' : '❌'
      });
    }
    
    if (details.extension) {
      components.push({
        name: 'Chrome Extension',
        status: details.extension.status,
        icon: details.extension.status === 'installed' ? '✅' : '❌'
      });
    }
    
    if (details.brain) {
      components.push({
        name: 'Brain CLI',
        status: details.brain.status,
        icon: details.brain.status === 'ok' ? '✅' : '❌'
      });
    }
    
    return {
      overall: healthData.status,
      score: healthData.overall_health_score,
      components
    };
  }

  /**
   * Sleep utility for delays
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   * @private
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get log file path
   * @returns {string} Path to log file
   */
  getLogPath() {
    return this.logFile;
  }
}

module.exports = HealthCheckManager;