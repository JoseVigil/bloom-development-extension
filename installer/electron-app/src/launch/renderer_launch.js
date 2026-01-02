// installer/electron-app/src/launch/renderer_launch.js
// VERSIÓN CON DEBUG COMPLETO Y MANEJO DE ERRORES

const DEV_SERVER_URL = 'http://localhost:5173';
const WS_URL = 'ws://localhost:4124';
const API_URL = 'http://localhost:48215';

let PROD_BUILD_PATH = null;
let currentView = 'dashboard';
let isDevMode = false;
let debugInfo = {
  devServerAvailable: false,
  apiAvailable: false,
  wsAvailable: false,
  iframeLoaded: false,
  lastError: null
};

// ============================================================================
// INIT CON DEBUG EXTENDIDO
// ============================================================================
window.addEventListener('DOMContentLoaded', async () => {
  console.log('🌸 [INIT] Renderer Launch initializing...');
  console.log('🔍 [INIT] Current location:', window.location.href);
  
  showLoading('Initializing...');
  
  try {
    // 1. Verificar servicios ANTES de intentar cargar
    console.log('🔍 [INIT] Checking services availability...');
    await checkServicesHealth();
    
    // 2. Determinar modo (dev vs prod)
    const webviewPath = await window.electronAPI.getPath('webview-build');
    PROD_BUILD_PATH = 'file://' + webviewPath.replace(/\\/g, '/');
    console.log('📦 [INIT] Webview build path:', PROD_BUILD_PATH);
    
    isDevMode = debugInfo.devServerAvailable;
    console.log(`🔧 [INIT] Mode: ${isDevMode ? 'DEV (localhost:5173)' : 'PROD (static build)'}`);
    
    // 3. Mostrar estado de servicios
    displayServiceStatus();
    
    // 4. Setup listeners
    setupEventListeners();
    
    // 5. Escuchar eventos de Electron
    window.electronAPI.on('app:initialized', (data) => {
      console.log('📨 [EVENT] App initialized:', data);
      hideLoading();
    });

    window.electronAPI.on('show-onboarding', () => {
      console.log('📨 [EVENT] Received show-onboarding event');
      showOnboarding();
    });

    window.electronAPI.on('show-dashboard', () => {
      console.log('📨 [EVENT] Received show-dashboard event');
      showDashboard();
    });
    
  } catch (error) {
    console.error('❌ [INIT] Initialization error:', error);
    debugInfo.lastError = error.message;
    hideLoading();
    showError('Failed to initialize application: ' + error.message);
  }
});

// ============================================================================
// HEALTH CHECKS DE SERVICIOS
// ============================================================================
async function checkServicesHealth() {
  console.log('🏥 [HEALTH] Starting health checks...');
  
  const checks = {
    devServer: checkService(DEV_SERVER_URL, 'Dev Server'),
    api: checkService(API_URL, 'API')
  };
  
  const results = await Promise.allSettled(Object.values(checks));
  
  debugInfo.devServerAvailable = results[0].status === 'fulfilled' && results[0].value;
  debugInfo.apiAvailable = results[1].status === 'fulfilled' && results[1].value;
  
  console.log('🏥 [HEALTH] Final status:', {
    devServer: debugInfo.devServerAvailable ? '✅ ONLINE' : '❌ OFFLINE',
    api: debugInfo.apiAvailable ? '✅ ONLINE' : '❌ OFFLINE'
  });
  
  // Si API responde pero no devuelve OK, loggear más info
  if (!debugInfo.apiAvailable) {
    console.warn('⚠️ [HEALTH] API check failed. Trying to get more info...');
    try {
      const response = await fetch(`${API_URL}/`, { method: 'GET' });
      const text = await response.text();
      console.log('📝 [HEALTH] API root response:', text.substring(0, 200));
    } catch (e) {
      console.error('❌ [HEALTH] Could not fetch API root:', e.message);
    }
  }
}

async function checkService(baseUrl, name) {
  // Lista de rutas posibles para health check
  const possibleRoutes = [
    '/api/v1/health',
    '/health',
    '/api/health',
    '/'
  ];
  
  console.log(`🏥 [HEALTH] Checking ${name} at ${baseUrl}...`);
  
  for (const route of possibleRoutes) {
    try {
      const url = baseUrl + route;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      
      const response = await fetch(url, { 
        method: 'HEAD',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        console.log(`✅ [HEALTH] ${name} OK at ${url} (${response.status})`);
        return true;
      } else {
        console.log(`⚠️ [HEALTH] ${name} responded ${response.status} at ${url}`);
      }
    } catch (error) {
      console.log(`❌ [HEALTH] ${name} failed at ${baseUrl}${route}: ${error.message}`);
    }
  }
  
  console.warn(`❌ [HEALTH] ${name} unavailable - tried all routes`);
  return false;
}

function displayServiceStatus() {
  const statusDiv = document.createElement('div');
  statusDiv.id = 'debug-status';
  statusDiv.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    background: rgba(0,0,0,0.8);
    color: white;
    padding: 12px;
    border-radius: 8px;
    font-family: monospace;
    font-size: 11px;
    z-index: 10000;
    max-width: 250px;
  `;
  
  statusDiv.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 8px;">🔍 Debug Status</div>
    <div>Dev Server: ${debugInfo.devServerAvailable ? '✅' : '❌ OFFLINE'}</div>
    <div>API (48215): ${debugInfo.apiAvailable ? '✅' : '❌ OFFLINE'}</div>
    <div>Mode: ${isDevMode ? 'DEV' : 'PROD'}</div>
    <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #444;">
      <button onclick="window.location.reload()" style="padding: 4px 8px; background: #4CAF50; border: none; border-radius: 4px; color: white; cursor: pointer;">Reload</button>
    </div>
  `;
  
  document.body.appendChild(statusDiv);
}

// ============================================================================
// LOADING OVERLAY
// ============================================================================
function showLoading(message = 'Loading...') {
  console.log('⏳ [UI] Showing loading:', message);
  const overlay = document.getElementById('loading-overlay');
  const text = document.getElementById('loading-text');
  if (overlay) {
    overlay.classList.add('active');
    if (text) text.textContent = message;
  }
}

function hideLoading() {
  console.log('✅ [UI] Hiding loading');
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.classList.remove('active');
  }
}

// ============================================================================
// VIEW MANAGEMENT CON DEBUG
// ============================================================================
function showOnboarding() {
  console.log('🧑‍✈️ [VIEW] Showing Onboarding Wizard...');
  currentView = 'onboarding';
  
  const dashboardContainer = document.getElementById('dashboard-container');
  const fullscreenContainer = document.getElementById('fullscreen-container');
  const iframe = document.getElementById('content-iframe');
  
  if (!iframe) {
    console.error('❌ [VIEW] Iframe not found in DOM');
    showError('Critical error: iframe element not found');
    return;
  }
  
  // CRÍTICO: Si los servicios no están disponibles, mostrar mensaje de ayuda
  if (!debugInfo.devServerAvailable && !PROD_BUILD_PATH) {
    console.error('❌ [VIEW] No dev server AND no build path - cannot load onboarding');
    showFallbackOnboarding();
    return;
  }
  
  // Si API no está disponible, advertir pero continuar
  if (!debugInfo.apiAvailable) {
    console.warn('⚠️ [VIEW] API not available - onboarding may have limited functionality');
    showWarning('Backend API is not running. Some features may not work. Please ensure the VSCode extension is running (F5).');
  }
  
  // Construir URL de onboarding
  const onboardingUrl = isDevMode 
    ? `${DEV_SERVER_URL}/onboarding`
    : `${PROD_BUILD_PATH}#/onboarding`;
    
  console.log('🔗 [VIEW] Loading onboarding from:', onboardingUrl);
  
  // Cambiar layout
  if (dashboardContainer) dashboardContainer.classList.add('hidden');
  if (fullscreenContainer) fullscreenContainer.classList.add('active');
  
  // Cargar iframe con manejo mejorado
  showLoading('Loading onboarding wizard...');
  
  let loadTimeout;
  let loaded = false;
  
  iframe.onload = () => {
    if (loaded) return;
    loaded = true;
    clearTimeout(loadTimeout);
    
    console.log('✅ [IFRAME] Onboarding iframe loaded successfully');
    debugInfo.iframeLoaded = true;
    
    // Esperar un poco más para que Svelte inicialice
    setTimeout(() => {
      hideLoading();
      console.log('🎨 [IFRAME] Svelte app should be initialized now');
    }, 500);
  };
  
  iframe.onerror = (err) => {
    if (loaded) return;
    loaded = true;
    clearTimeout(loadTimeout);
    
    console.error('❌ [IFRAME] Failed to load:', err);
    debugInfo.lastError = 'Iframe load error';
    hideLoading();
    showFallbackOnboarding();
  };
  
  // Timeout más largo: 10 segundos
  loadTimeout = setTimeout(() => {
    if (loaded) return;
    
    console.warn('⏰ [IFRAME] Loading timeout (10s) - checking state...');
    
    // NO intentar acceder a contentDocument por CORS
    // En su lugar, asumimos que si no hubo onload después de 10s, hay problema
    console.error('❌ [IFRAME] Timeout reached without onload event');
    
    if (isDevMode) {
      console.log('💡 [IFRAME] Dev mode: Check if SvelteKit dev server is running on port 5173');
      showError('Timeout loading onboarding. Is the SvelteKit dev server running? (npm run dev in webview/app)');
    } else {
      console.log('💡 [IFRAME] Prod mode: Check if build exists');
      showFallbackOnboarding();
    }
    
    loaded = true;
    hideLoading();
  }, 10000); // 10 segundos
  
  console.log('🚀 [IFRAME] Setting iframe.src to:', onboardingUrl);
  iframe.src = onboardingUrl;
}

// ============================================================================
// FALLBACK Y WARNINGS
// ============================================================================
function showWarning(message) {
  console.warn('⚠️ [WARNING]', message);
  
  const warningDiv = document.createElement('div');
  warningDiv.className = 'warning-banner';
  warningDiv.style.cssText = `
    position: fixed;
    top: 60px;
    left: 50%;
    transform: translateX(-50%);
    background: #ff9800;
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    z-index: 9999;
    max-width: 600px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;
  warningDiv.innerHTML = `
    <strong>⚠️ Warning:</strong> ${message}
    <button onclick="this.parentElement.remove()" style="margin-left: 12px; padding: 4px 8px; background: rgba(255,255,255,0.2); border: none; border-radius: 4px; cursor: pointer;">Dismiss</button>
  `;
  
  document.body.appendChild(warningDiv);
  
  setTimeout(() => warningDiv.remove(), 15000);
}

function showFallbackOnboarding() {
  console.log('📄 [FALLBACK] Showing fallback onboarding message');
  
  const fullscreenContainer = document.getElementById('fullscreen-container');
  if (!fullscreenContainer) return;
  
  const troubleshootingSteps = [];
  
  if (!debugInfo.devServerAvailable) {
    troubleshootingSteps.push({
      title: 'Start SvelteKit Dev Server',
      commands: [
        'cd webview/app',
        'npm install',
        'npm run dev'
      ],
      note: 'This starts the development server on port 5173'
    });
  }
  
  if (!debugInfo.apiAvailable) {
    troubleshootingSteps.push({
      title: 'Start VSCode Extension (Backend)',
      commands: [
        'Open bloom-development-extension in VSCode',
        'Press F5 to launch extension',
        'Check Output panel > Extension Host'
      ],
      note: 'This starts the API server on port 48215 and WebSocket on 4124'
    });
  }
  
  const stepsHTML = troubleshootingSteps.map((step, idx) => `
    <div style="background: var(--bg-tertiary); border-radius: 8px; padding: 16px; margin-bottom: 16px;">
      <p style="font-size: 14px; color: var(--text-primary); margin-bottom: 8px; font-weight: 600;">
        ${idx + 1}. ${step.title}
      </p>
      <pre style="text-align: left; font-size: 12px; color: var(--accent-primary); font-family: monospace; background: rgba(0,0,0,0.3); padding: 12px; border-radius: 6px; overflow-x: auto;">${step.commands.join('\n')}</pre>
      <p style="font-size: 12px; color: var(--text-secondary); margin-top: 8px;">
        💡 ${step.note}
      </p>
    </div>
  `).join('');
  
  fullscreenContainer.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 40px; text-align: center; background: var(--bg-primary); color: var(--text-primary);">
      <div style="max-width: 700px;">
        <h1 style="font-size: 48px; margin-bottom: 16px;">🌸</h1>
        <h2 style="font-size: 32px; margin-bottom: 24px; color: var(--accent-primary);">Onboarding Setup Required</h2>
        
        <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 12px; padding: 32px; margin-bottom: 24px;">
          <p style="font-size: 16px; line-height: 1.6; color: var(--text-secondary); margin-bottom: 24px;">
            The onboarding interface requires the following services to be running:
          </p>
          
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 24px;">
            <div style="padding: 12px; background: var(--bg-tertiary); border-radius: 8px;">
              <div style="font-size: 24px; margin-bottom: 4px;">${debugInfo.devServerAvailable ? '✅' : '❌'}</div>
              <div style="font-size: 12px; color: var(--text-secondary);">Dev Server (5173)</div>
            </div>
            <div style="padding: 12px; background: var(--bg-tertiary); border-radius: 8px;">
              <div style="font-size: 24px; margin-bottom: 4px;">${debugInfo.apiAvailable ? '✅' : '❌'}</div>
              <div style="font-size: 12px; color: var(--text-secondary);">API Server (48215)</div>
            </div>
          </div>
          
          ${stepsHTML}
          
          <div style="background: rgba(255, 152, 0, 0.1); border-left: 4px solid #ff9800; padding: 12px; border-radius: 4px; text-align: left; margin-top: 16px;">
            <p style="font-size: 13px; color: var(--text-secondary); margin: 0;">
              <strong>💡 Quick Fix:</strong> Make sure you've run <code style="background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 3px;">npm run dev:webview</code> in the root directory and pressed <code style="background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 3px;">F5</code> in VSCode to start the extension.
            </p>
          </div>
        </div>
        
        <div style="display: flex; gap: 12px; justify-content: center;">
          <button onclick="window.location.reload()" style="padding: 12px 24px; background: var(--accent-primary); color: white; border: none; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer;">
            🔄 Retry
          </button>
          <button onclick="window.open('http://localhost:5173/onboarding')" style="padding: 12px 24px; background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer;">
            🌐 Open in Browser
          </button>
        </div>
        
        <div style="margin-top: 24px; padding: 16px; background: rgba(0,0,0,0.2); border-radius: 8px;">
          <details>
            <summary style="cursor: pointer; font-size: 13px; color: var(--text-secondary);">🔍 Debug Information</summary>
            <pre style="text-align: left; font-size: 11px; margin-top: 12px; color: var(--text-secondary); font-family: monospace;">${JSON.stringify(debugInfo, null, 2)}</pre>
          </details>
        </div>
      </div>
    </div>
  `;
}

function showDashboard() {
  console.log('📊 [VIEW] Showing Dashboard...');
  currentView = 'dashboard';
  
  const dashboardContainer = document.getElementById('dashboard-container');
  const fullscreenContainer = document.getElementById('fullscreen-container');
  const iframe = document.getElementById('content-iframe');
  
  if (dashboardContainer) dashboardContainer.classList.remove('hidden');
  if (fullscreenContainer) fullscreenContainer.classList.remove('active');
  
  if (iframe) iframe.src = 'about:blank';
  
  hideLoading();
  cleanupCopilot();
}

// ============================================================================
// ERROR DISPLAY
// ============================================================================
function showError(message) {
  console.error('🚨 [ERROR]', message);
  
  const errorDiv = document.createElement('div');
  errorDiv.className = 'error-banner';
  errorDiv.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #f44336;
    color: white;
    padding: 16px 24px;
    border-radius: 8px;
    z-index: 10000;
    max-width: 600px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;
  errorDiv.innerHTML = `
    <div style="display: flex; align-items: center; gap: 12px;">
      <span style="font-size: 24px;">⚠️</span>
      <div style="flex: 1;">
        <h4 style="margin: 0 0 4px 0; font-size: 14px;">Error</h4>
        <p style="margin: 0; font-size: 13px;">${message}</p>
      </div>
      <button onclick="this.parentElement.parentElement.remove()" style="padding: 4px 8px; background: rgba(255,255,255,0.2); border: none; border-radius: 4px; cursor: pointer;">✕</button>
    </div>
  `;
  
  document.body.appendChild(errorDiv);
  
  setTimeout(() => errorDiv.remove(), 15000);
}

// ============================================================================
// COPILOT (sin cambios)
// ============================================================================
function initCopilot() {
  console.log('🤖 [COPILOT] Initializing...');
  
  // ... resto del código de copilot sin cambios ...
}

function cleanupCopilot() {
  if (window.websocketStore) {
    window.websocketStore.disconnect();
  }
}

// ============================================================================
// NAVIGATION
// ============================================================================
function navigateTo(route) {
  console.log('🔄 [NAV] Navigation request:', route);
  if (route === 'dashboard') {
    showDashboard();
  } else if (route === 'onboarding') {
    showOnboarding();
  }
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================
function setupEventListeners() {
  window.electronAPI.on('services:status', (status) => {
    console.log('📨 [EVENT] Services status:', status);
    updateStatusIndicator(status);
  });
  
  window.navigateTo = navigateTo;
}

function updateStatusIndicator(status) {
  const dot = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  
  if (!dot || !text) return;
  
  const allHealthy = status.api && status.websocket && status.brain;
  
  if (allHealthy) {
    dot.style.background = 'var(--success)';
    text.textContent = 'System OK';
  } else {
    dot.style.background = 'var(--warning)';
    text.textContent = 'Issues detected';
  }
}

// ============================================================================
// EXPORTS
// ============================================================================
window.bloomLauncher = {
  navigateTo,
  getCurrentView: () => currentView,
  isDevMode: () => isDevMode,
  getDebugInfo: () => debugInfo,
  recheckServices: checkServicesHealth
};

console.log('✅ [INIT] Bloom Launcher renderer initialized with debug support');