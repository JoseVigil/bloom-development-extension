// brain-service-manager.js
// Módulo para gestionar el Brain Service desde Electron
// Se usa tanto en --install como en --launch

const { spawn, execSync } = require('child_process');
const path = require('path');
const { paths } = require('../config/paths');
const { getLogger } = require('../src/logger');

class BrainServiceManager {
  constructor() {
    this.brainExe = path.join(paths.binDir, 'brain', 'brain.exe');
    this.serviceProcess = null;
    this.isReady = false;
    this.healthCheckInterval = null;
    this.logger = getLogger('brain-service');
  }

  /**
   * Verifica si el Brain Service está corriendo
   */
  async checkStatus() {
    try {
      const result = execSync(`"${this.brainExe}" --json service status`, {
        encoding: 'utf8',
        timeout: 3000,
        windowsHide: true
      });
      
      const json = JSON.parse(result);
      this.logger.info('Brain Service Status:', json);
      
      return {
        running: json.data?.running || false,
        pid: json.data?.pid,
        activeClients: json.data?.active_clients || 0,
        registeredProfiles: json.data?.registered_profiles || 0
      };
    } catch (error) {
      this.logger.warn('Failed to check Brain Service status:', error.message);
      return { running: false };
    }
  }

  /**
   * Inicia el Brain Service si no está corriendo
   */
  async ensureRunning() {
    this.logger.info('Checking Brain Service...');
    
    const status = await this.checkStatus();
    
    if (status.running) {
      this.logger.success(`Brain Service already running (PID: ${status.pid})`);
      this.isReady = true;
      return { success: true, alreadyRunning: true };
    }
    
    this.logger.info('Starting Brain Service...');
    
    try {
      // Iniciar como proceso detached (daemon)
      const startProcess = spawn(this.brainExe, ['service', 'start'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        cwd: path.dirname(this.brainExe)
      });
      
      // Desacoplar del proceso padre
      startProcess.unref();
      
      // Esperar a que arranque (polling)
      const maxAttempts = 10;
      for (let i = 0; i < maxAttempts; i++) {
        await this.sleep(500);
        
        const checkStatus = await this.checkStatus();
        if (checkStatus.running) {
          this.logger.success(`Brain Service started successfully (PID: ${checkStatus.pid})`);
          this.isReady = true;
          return { success: true, pid: checkStatus.pid };
        }
      }
      
      throw new Error('Brain Service failed to start within 5 seconds');
      
    } catch (error) {
      this.logger.error('Failed to start Brain Service:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 🆕 NUEVO MÉTODO: Espera hasta que el servicio responda
   * Este es el método que faltaba y causaba el error
   */
  async waitUntilResponding(timeoutSeconds = 10) {
    this.logger.info(`Waiting for Brain Service to respond (timeout: ${timeoutSeconds}s)...`);
    
    const maxAttempts = timeoutSeconds * 2; // Check every 500ms
    
    for (let i = 0; i < maxAttempts; i++) {
      const status = await this.checkStatus();
      
      if (status.running && status.pid) {
        this.logger.success(`Brain Service is responding (PID: ${status.pid})`);
        return { 
          success: true, 
          pid: status.pid,
          activeClients: status.activeClients,
          registeredProfiles: status.registeredProfiles
        };
      }
      
      if (i % 4 === 0) { // Log every 2 seconds
        this.logger.info(`Attempt ${i + 1}/${maxAttempts} - Waiting for service...`);
      }
      
      await this.sleep(500);
    }
    
    this.logger.warn(`Brain Service did not respond within ${timeoutSeconds}s`);
    return { 
      success: false, 
      error: `Timeout waiting for Brain Service (${timeoutSeconds}s)` 
    };
  }

  /**
   * Inicia health checks periódicos
   */
  startHealthCheck(onDeath = null) {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    this.logger.info('Starting Brain Service health checks (every 10s)');
    
    this.healthCheckInterval = setInterval(async () => {
      const status = await this.checkStatus();
      
      if (!status.running) {
        this.logger.error('Brain Service died unexpectedly!');
        
        if (onDeath) {
          onDeath();
        }
        
        // Intentar reiniciar
        this.logger.info('Attempting to restart...');
        await this.ensureRunning();
      } else {
        this.logger.debug(`Health check OK (Clients: ${status.activeClients}, Profiles: ${status.registeredProfiles})`);
      }
    }, 10000);
  }

  /**
   * Detiene los health checks
   */
  stopHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      this.logger.info('Health checks stopped');
    }
  }

  /**
   * Verifica que un profile específico esté registrado
   */
  async waitForProfileRegistration(profileId, timeoutSeconds = 10) {
    this.logger.info(`Waiting for profile ${profileId.substring(0, 8)} to register...`);
    
    const startTime = Date.now();
    const timeoutMs = timeoutSeconds * 1000;
    
    while (Date.now() - startTime < timeoutMs) {
      const status = await this.checkStatus();
      
      if (status.registeredProfiles > 0) {
        this.logger.success(`Profile registered! (Total profiles: ${status.registeredProfiles})`);
        return { success: true };
      }
      
      await this.sleep(500);
    }
    
    this.logger.warn(`Timeout: Profile did not register within ${timeoutSeconds}s`);
    return { success: false, error: 'Profile registration timeout' };
  }

  /**
   * Para el servicio (solo para cleanup)
   */
  async stop() {
    try {
      this.logger.info('Stopping Brain Service...');
      
      execSync(`"${this.brainExe}" service stop`, {
        encoding: 'utf8',
        timeout: 5000,
        windowsHide: true
      });
      
      this.isReady = false;
      this.logger.success('Brain Service stopped');
      
    } catch (error) {
      this.logger.warn('Failed to stop Brain Service:', error.message);
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// INTEGRACIÓN CON INSTALLER.JS
// ============================================================================

/**
 * Helper para usar DESPUÉS de instalar el Windows Service
 * Verifica que el servicio esté respondiendo en puerto 5678
 */
async function ensureBrainServiceResponding(mainWindow = null) {
  const logger = getLogger('installer');
  logger.info('\n=== VERIFYING BRAIN SERVICE IS RESPONDING ===\n');
  
  const manager = new BrainServiceManager();
  
  // Usar el nuevo método waitUntilResponding
  const result = await manager.waitUntilResponding(10);
  
  if (!result.success) {
    throw new Error('Brain Service did not respond within 10 seconds after installation');
  }
  
  logger.success(`Brain Service confirmed responding (PID: ${result.pid})`);
  return manager;
}

/**
 * Helper para modo --launch
 * Arranca el servicio si no está corriendo (fallback)
 */
async function ensureBrainServiceForLaunch(mainWindow = null) {
  const logger = getLogger('launcher');
  logger.info('\n=== ENSURING BRAIN SERVICE FOR LAUNCH MODE ===\n');
  
  const manager = new BrainServiceManager();
  
  // Intentar arrancar (si no está corriendo)
  const result = await manager.ensureRunning();
  
  if (!result.success) {
    throw new Error(`Failed to ensure Brain Service: ${result.error}`);
  }
  
  logger.success('Brain Service confirmed running');
  
  return manager;
}

module.exports = { 
  BrainServiceManager,
  ensureBrainServiceResponding,      // Para --install (después de NSSM)
  ensureBrainServiceForLaunch        // Para --launch (fallback)
};