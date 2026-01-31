/**
 * Installation Helpers - Shared utilities for post-install integration
 */

const net = require('net');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');

// Server ports
const UI_SERVER_PORT = 4123;
const WS_SERVER_PORT = 4124;
const UI_FALLBACK_PORT = 5888;

/**
 * Check if a server is running on given port
 * @param {number} port - Port to check
 * @param {number} timeout - Timeout in ms (default 30000)
 * @returns {Promise<boolean>}
 */
async function checkServerRunning(port, timeout = 30000) {
  const startTime = Date.now();
  const interval = 500;

  while (Date.now() - startTime < timeout) {
    const isRunning = await new Promise((resolve) => {
      const client = net.createConnection({ port, host: '127.0.0.1' }, () => {
        client.end();
        resolve(true);
      });

      client.on('error', () => {
        resolve(false);
      });

      client.setTimeout(1000, () => {
        client.destroy();
        resolve(false);
      });
    });

    if (isRunning) {
      console.log(`✓ Server detected on port ${port}`);
      return true;
    }

    await new Promise(resolve => setTimeout(resolve, interval));
  }

  console.log(`✗ Server not detected on port ${port} after ${timeout}ms`);
  return false;
}

/**
 * Find available port starting from preferred
 * @param {number} preferred - Preferred port
 * @param {number} maxAttempts - Max attempts (default 5)
 * @returns {Promise<number>}
 */
async function findAvailablePort(preferred, maxAttempts = 5) {
  for (let i = 0; i < maxAttempts; i++) {
    const port = preferred + i;
    const available = await isPortAvailable(port);
    if (available) return port;
  }
  throw new Error(`No available ports found starting from ${preferred}`);
}

/**
 * Check if port is available
 * @param {number} port
 * @returns {Promise<boolean>}
 */
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    
    server.listen(port, '127.0.0.1');
  });
}

/**
 * Get onboarding state from config
 * @param {string} configDir - Config directory path
 * @returns {Promise<object>}
 */
async function getOnboardingState(configDir) {
  const statePath = path.join(configDir, 'state', 'onboarding.json');
  
  try {
    if (await fs.pathExists(statePath)) {
      return await fs.readJson(statePath);
    }
  } catch (error) {
    console.warn('Could not read onboarding state:', error.message);
  }
  
  return {
    completed: false,
    currentStep: 'welcome',
    timestamp: null
  };
}

/**
 * Save onboarding state
 * @param {string} configDir - Config directory path
 * @param {object} state - State object
 */
async function saveOnboardingState(configDir, state) {
  const stateDir = path.join(configDir, 'state');
  await fs.ensureDir(stateDir);
  
  const statePath = path.join(stateDir, 'onboarding.json');
  await fs.writeJson(statePath, {
    ...state,
    lastUpdated: new Date().toISOString()
  }, { spaces: 2 });
}

/**
 * Check if UI server (SvelteKit) is running
 * @returns {Promise<boolean>}
 */
async function checkUIServerRunning() {
  return await checkServerRunning(UI_SERVER_PORT, 5000);
}

/**
 * Check if WebSocket server is running
 * @returns {Promise<boolean>}
 */
async function checkWSServerRunning() {
  return await checkServerRunning(WS_SERVER_PORT, 5000);
}

/**
 * Wait for all servers to be ready
 * @param {number} timeout - Total timeout in ms
 * @returns {Promise<object>}
 */
async function waitForServersReady(timeout = 30000) {
  console.log('Waiting for servers to be ready...');
  
  const startTime = Date.now();
  
  // Check UI server
  const uiReady = await checkServerRunning(UI_SERVER_PORT, timeout);
  
  if (!uiReady) {
    return {
      ready: false,
      error: 'UI server not responding',
      uiPort: null,
      wsPort: null
    };
  }
  
  const elapsed = Date.now() - startTime;
  const remainingTimeout = timeout - elapsed;
  
  // Check WS server (optional, may not be critical)
  const wsReady = await checkServerRunning(WS_SERVER_PORT, Math.max(remainingTimeout, 5000));
  
  return {
    ready: true,
    uiPort: UI_SERVER_PORT,
    wsPort: wsReady ? WS_SERVER_PORT : null,
    wsWarning: !wsReady ? 'WebSocket server not detected' : null
  };
}

/**
 * Get onboarding URL based on state
 * @param {object} state - Onboarding state
 * @param {number} port - UI server port
 * @returns {string}
 */
function getOnboardingURL(state, port = UI_SERVER_PORT) {
  const baseURL = `http://localhost:${port}`;
  
  if (state.completed) {
    return `${baseURL}/intents`;
  }
  
  // Start at root for wizard
  return baseURL;
}

/**
 * Verify service and servers health
 * @param {Function} checkServiceStatus - Function to check bloom service
 * @returns {Promise<object>}
 */
async function verifySystemHealth(checkServiceStatus) {
  const health = {
    service: false,
    uiServer: false,
    wsServer: false,
    errors: []
  };
  
  try {
    // Check Bloom service
    const serviceStatus = await checkServiceStatus();
    health.service = serviceStatus.running;
    
    if (!health.service) {
      health.errors.push('Bloom service not running');
    }
  } catch (error) {
    health.errors.push(`Service check failed: ${error.message}`);
  }
  
  try {
    // Check UI server
    health.uiServer = await checkUIServerRunning();
    if (!health.uiServer) {
      health.errors.push('UI server not accessible');
    }
  } catch (error) {
    health.errors.push(`UI server check failed: ${error.message}`);
  }
  
  try {
    // Check WS server (non-critical)
    health.wsServer = await checkWSServerRunning();
  } catch (error) {
    console.warn('WS server check failed:', error.message);
  }
  
  health.healthy = health.service && health.uiServer;
  
  return health;
}

/**
 * Migrate legacy config if exists
 * @param {string} configDir - New config directory
 * @returns {Promise<boolean>}
 */
async function migrateLegacyConfig(configDir) {
  const legacyDir = process.env.MYBASH_USER_DATA_DIR;
  
  if (!legacyDir || !await fs.pathExists(legacyDir)) {
    return false;
  }
  
  console.log(`Migrating legacy config from: ${legacyDir}`);
  
  try {
    const legacyConfigPath = path.join(legacyDir, 'config.json');
    if (await fs.pathExists(legacyConfigPath)) {
      const legacyConfig = await fs.readJson(legacyConfigPath);
      
      // Save to new location with migration flag
      const newConfigPath = path.join(configDir, 'config', 'migrated.json');
      await fs.writeJson(newConfigPath, {
        ...legacyConfig,
        migratedFrom: legacyDir,
        migratedAt: new Date().toISOString()
      }, { spaces: 2 });
      
      console.log('✓ Legacy config migrated');
      return true;
    }
  } catch (error) {
    console.error('Legacy migration failed:', error.message);
  }
  
  return false;
}

const WEBVIEW_SERVER_PORT = 4123;

async function waitForWebviewServer(timeout = 30000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const http = require('http');
      
      await new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:${WEBVIEW_SERVER_PORT}`, (res) => {
          resolve();
        });
        
        req.on('error', reject);
        req.setTimeout(2000, () => {
          req.destroy();
          reject(new Error('timeout'));
        });
      });
      
      return { ready: true, port: WEBVIEW_SERVER_PORT };
      
    } catch (error) {
      // Server no está listo, seguir esperando
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  return { ready: false, port: WEBVIEW_SERVER_PORT };
}

module.exports = {
  UI_SERVER_PORT,
  WS_SERVER_PORT,
  UI_FALLBACK_PORT,
  WEBVIEW_SERVER_PORT,
  checkServerRunning,
  findAvailablePort,
  isPortAvailable,
  getOnboardingState,
  saveOnboardingState,
  checkUIServerRunning,
  checkWSServerRunning,
  waitForServersReady,
  getOnboardingURL,
  verifySystemHealth,
  migrateLegacyConfig  
};