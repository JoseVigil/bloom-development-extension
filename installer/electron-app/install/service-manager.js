// brain-service-manager.js
// MÃ³dulo para gestionar el Brain Service desde Electron

const { spawn, execSync } = require('child_process');
const path = require('path');
const { paths } = require('../config/paths');
const { getLogger } = require('../src/logger');
const net = require('net');

class BrainServiceManager {
  constructor() {
    this.brainExe = path.join(paths.binDir, 'brain', 'brain.exe');
    this.serviceProcess = null;
    this.isReady = false;
    this.healthCheckInterval = null;
    this.logger = getLogger('brain-service');
    
    // Arrow function para preservar contexto
    this.sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  }

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
      const startProcess = spawn(this.brainExe, ['service', 'start'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        cwd: path.dirname(this.brainExe)
      });
      
      startProcess.unref();
      
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

  async _isPortOpen(port, host = '127.0.0.1') {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      const timeout = 1000;

      socket.setTimeout(timeout);
      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });

      socket.on('error', () => {
        socket.destroy();
        resolve(false);
      });

      socket.connect(port, host);
    });
  }

  async waitUntilResponding(timeoutSeconds = 80) {
    this.logger.info(`Waiting for Brain Service on 127.0.0.1:5678 (timeout: ${timeoutSeconds}s)...`);
    
    const startTime = Date.now();
    const timeoutMs = timeoutSeconds * 1000;
    
    while (Date.now() - startTime < timeoutMs) {
      const portOpen = await this._isPortOpen(5678, '127.0.0.1');
      
      if (portOpen) {
        const status = await this.checkStatus();
        
        if (status.running) {
          this.logger.success(`âœ… Brain Service is ALIVE (PID: ${status.pid})`);
          return { success: true, pid: status.pid };
        } else {
          this.logger.warn(`âš ï¸ Port 5678 is open, but CLI status is lagging. Proceeding...`);
          return { success: true, pid: 'detected_via_port' };
        }
      }

      await this.sleep(1000);
    }
    
    return { success: false, error: 'Timeout' };
  }

  startHealthCheck(onDeath = null) {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    this.logger.info('Starting Brain Service health checks (every 10s)');
    
    this.healthCheckInterval = setInterval(async () => {
      const status = await this.checkStatus();
      
      if (!status.running) {
        this.logger.error('Brain Service died unexpectedly!');
        
        if (onDeath) onDeath();
        
        this.logger.info('Attempting to restart...');
        await this.ensureRunning();
      } else {
        this.logger.debug(`Health check OK (Clients: ${status.activeClients}, Profiles: ${status.registeredProfiles})`);
      }
    }, 10000);
  }

  stopHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      this.logger.info('Health checks stopped');
    }
  }

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
}

async function ensureBrainServiceResponding(mainWindow = null) {
  const logger = getLogger('installer');
  logger.info('\n=== VERIFYING BRAIN SERVICE IS RESPONDING ===\n');
  
  const manager = new BrainServiceManager();
  const result = await manager.waitUntilResponding(10);
  
  if (!result.success) {
    throw new Error('Brain Service did not respond within 10 seconds after installation');
  }
  
  logger.success(`Brain Service confirmed responding (PID: ${result.pid})`);
  return manager;
}

async function ensureBrainServiceForLaunch(mainWindow = null) {
  const logger = getLogger('launcher');
  logger.info('\n=== ENSURING BRAIN SERVICE FOR LAUNCH MODE ===\n');
  
  const manager = new BrainServiceManager();
  const result = await manager.ensureRunning();
  
  if (!result.success) {
    throw new Error(`Failed to ensure Brain Service: ${result.error}`);
  }
  
  logger.success('Brain Service confirmed running');
  return manager;
}

module.exports = { 
  BrainServiceManager,
  ensureBrainServiceResponding,
  ensureBrainServiceForLaunch
};