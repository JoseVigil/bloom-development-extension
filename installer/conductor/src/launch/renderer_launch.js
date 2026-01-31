// installer/electron-app/src/launch/renderer_launch.js
// FIXED: Detección TCP robusta de dev server via IPC

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
  lastError: null,
  backendReady: false
};

// ============================================================================
// INIT WITH BACKEND VERIFICATION FIRST
// ============================================================================
window.addEventListener('DOMContentLoaded', async () => {
  console.log('🌸 [INIT] Renderer Launch initializing...');

  showLoading('Checking backend services...');

  try {
    // 1. CRITICAL: Verify backend is ready BEFORE loading iframe
    console.log('🔍 [INIT] Step 1: Verifying backend availability...');
    const backendReady = await waitForBackend();

    if (!backendReady) {
      console.error('❌ [INIT] Backend not ready after timeout');
      showFallbackOnboarding();
      return;
    }

    console.log('✅ [INIT] Backend ready!');
    debugInfo.backendReady = true;

    // 2. Check dev server availability (NUEVA LÓGICA TCP)
    console.log('🔍 [INIT] Step 2: Checking dev server with TCP...');
    await checkServicesHealth();

    // 3. Determine mode
    const webviewPath = await window.electronAPI.getPath('webview-build');
    PROD_BUILD_PATH = 'file://' + webviewPath.replace(/\\/g, '/');
    isDevMode = debugInfo.devServerAvailable;

    console.log(`📦 [INIT] Mode: ${isDevMode ? 'DEV' : 'PROD'}`);
    console.log(`📦 [INIT] Build path: ${PROD_BUILD_PATH}`);

    // 4. Display status
    displayServiceStatus();

    // 5. Setup listeners
    setupEventListeners();

    // 6. Listen for Electron events
    window.electronAPI.on('app:initialized', (data) => {
      console.log('📨 [EVENT] App initialized:', data);
      hideLoading();
    });

    window.electronAPI.on('show-onboarding', () => {
      console.log('📨 [EVENT] Show onboarding');
      showOnboarding();
    });

    window.electronAPI.on('show-dashboard', () => {
      console.log('📨 [EVENT] Show dashboard');
      showDashboard();
    });

  } catch (error) {
    console.error('❌ [INIT] Fatal error:', error);
    debugInfo.lastError = error.message;
    hideLoading();
    showError('Initialization failed: ' + error.message);
  }
});

// ============================================================================
// WAIT FOR BACKEND (API + WS)
// ============================================================================
async function waitForBackend(maxAttempts = 20, delayMs = 500) {
  console.log(`⏳ [BACKEND] Waiting for backend (max ${maxAttempts * delayMs / 1000}s)...`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`[BACKEND] Attempt ${attempt}/${maxAttempts}...`);

    const apiOk = await checkService(API_URL, 'API', false);
    const wsOk = await checkWebSocket();

    if (apiOk && wsOk) {
      console.log('✅ [BACKEND] Both API and WebSocket are ready!');
      debugInfo.apiAvailable = true;
      debugInfo.wsAvailable = true;
      return true;
    }

    if (attempt < maxAttempts) {
      console.log(`⏳ [BACKEND] Not ready yet, waiting ${delayMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  console.error('❌ [BACKEND] Timeout waiting for backend');
  return false;
}

async function checkWebSocket() {
  return new Promise((resolve) => {
    try {
      const ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        console.log('✅ [WS] Connected successfully');
        ws.close();
        resolve(true);
      };

      ws.onerror = (err) => {
        console.log('❌ [WS] Connection failed:', err);
        resolve(false);
      };

      setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          ws.close();
          resolve(false);
        }
      }, 2000);
    } catch (error) {
      console.log('❌ [WS] Error:', error);
      resolve(false);
    }
  });
}

// ============================================================================
// SERVICE HEALTH CHECKS (NUEVA LÓGICA TCP PARA DEV SERVER)
// ============================================================================
async function checkServicesHealth() {
  console.log('🔍 [HEALTH] Checking services...');
  
  // ✨ NUEVO: Usar TCP check via IPC para dev server (más confiable)
  debugInfo.devServerAvailable = await checkDevServerTCP();
  
  // API check con HTTP (como antes)
  debugInfo.apiAvailable = await checkService(API_URL, 'API', true);
  
  console.log('🔍 [HEALTH] Results:', {
    devServer: debugInfo.devServerAvailable ? '✅' : '❌',
    api: debugInfo.apiAvailable ? '✅' : '❌'
  });
}

/**
 * ✨ NUEVO: Verificación TCP robusta del dev server via IPC
 * Evita problemas de CORS y timing con fetch()
 */
async function checkDevServerTCP() {
  try {
    console.log('🔍 [TCP] Checking port 5173 via IPC...');
    const isOpen = await window.electronAPI.checkPort(5173, 'localhost');
    
    if (isOpen) {
      console.log('✅ [TCP] Dev server (port 5173) is OPEN');
      return true;
    } else {
      console.log('❌ [TCP] Dev server (port 5173) is CLOSED');
      return false;
    }
  } catch (error) {
    console.error('❌ [TCP] Error checking port:', error);
    return false;
  }
}

/**
 * Verificación HTTP para servicios backend (API)
 */
async function checkService(baseUrl, name, verbose = true) {
  const routes = ['/health', '/api/v1/health', '/'];
  
  if (verbose) console.log(`🔍 [HEALTH] Checking ${name} at ${baseUrl}...`);
  
  for (const route of routes) {
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
        if (verbose) console.log(`✅ [HEALTH] ${name} OK at ${route}`);
        return true;
      }
    } catch (error) {
      if (verbose) console.log(`❌ [HEALTH] ${name} failed at ${baseUrl}${route}`);
    }
  }
  
  if (verbose) console.warn(`❌ [HEALTH] ${name} unavailable`);
  return false;
}

// ============================================================================
// LOADING OVERLAY
// ============================================================================
function showLoading(message = 'Loading...') {
  console.log('⏳ [UI] Loading:', message);
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
  if (overlay) overlay.classList.remove('active');
}

// ============================================================================
// VIEW MANAGEMENT
// ============================================================================
function showOnboarding() {
  console.log('🧑‍✈️ [VIEW] Showing Onboarding...');
  currentView = 'onboarding';

  const dashboardContainer = document.getElementById('dashboard-container');
  const fullscreenContainer = document.getElementById('fullscreen-container');
  const iframe = document.getElementById('content-iframe');

  if (!iframe) {
    console.error('❌ [VIEW] Iframe not found');
    showError('Critical error: iframe element not found');
    return;
  }

  // CRITICAL: Backend must be ready
  if (!debugInfo.backendReady || !debugInfo.apiAvailable) {
    console.error('❌ [VIEW] Backend not ready');
    showFallbackOnboarding();
    return;
  }

  // Build URL (usando isDevMode detectado con TCP)
  const onboardingUrl = isDevMode
    ? `${DEV_SERVER_URL}/onboarding`
    : `${PROD_BUILD_PATH}#/onboarding`;

  console.log('🔗 [VIEW] Loading:', onboardingUrl);
  console.log('🔗 [VIEW] isDevMode:', isDevMode);

  // Update layout
  if (dashboardContainer) dashboardContainer.classList.add('hidden');
  if (fullscreenContainer) fullscreenContainer.classList.add('active');

  // Load iframe with improved handling
  showLoading('Loading onboarding wizard...');

  let loaded = false;

  iframe.onload = () => {
    if (loaded) return;
    loaded = true;

    console.log('✅ [IFRAME] Loaded successfully');
    debugInfo.iframeLoaded = true;

    // Wait for Svelte to initialize
    setTimeout(() => {
      hideLoading();
      console.log('🎨 [IFRAME] App should be ready');
    }, 1000);
  };

  iframe.onerror = () => {
    if (loaded) return;
    loaded = true;

    console.error('❌ [IFRAME] Load error');
    hideLoading();
    showFallbackOnboarding();
  };

  // Longer timeout: 15s
  setTimeout(() => {
    if (!loaded) {
      console.error('❌ [IFRAME] Timeout (15s)');
      loaded = true;
      hideLoading();
      showFallbackOnboarding();
    }
  }, 15000);

  console.log('🚀 [IFRAME] Setting src...');
  iframe.src = onboardingUrl;
}

function showDashboard() {
  console.log('📊 [VIEW] Showing Dashboard');
  currentView = 'dashboard';

  const dashboardContainer = document.getElementById('dashboard-container');
  const fullscreenContainer = document.getElementById('fullscreen-container');
  const iframe = document.getElementById('content-iframe');

  if (dashboardContainer) dashboardContainer.classList.remove('hidden');
  if (fullscreenContainer) fullscreenContainer.classList.remove('active');
  if (iframe) iframe.src = 'about:blank';

  hideLoading();
}

// ============================================================================
// STATUS DISPLAY
// ============================================================================
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
    <div>API (48215): ${debugInfo.apiAvailable ? '✅' : '❌'}</div>
    <div>WS (4124): ${debugInfo.wsAvailable ? '✅' : '❌'}</div>
    <div>Dev (5173): ${debugInfo.devServerAvailable ? '✅ TCP' : '❌'}</div>
    <div>Backend: ${debugInfo.backendReady ? '✅' : '❌'}</div>
    <div>Mode: ${isDevMode ? 'DEV' : 'PROD'}</div>
    <div style="margin-top: 8px;">
      <button onclick="window.location.reload()" style="padding: 4px 8px; background: #4CAF50; border: none; border-radius: 4px; color: white; cursor: pointer;">Reload</button>
    </div>
  `;

  document.body.appendChild(statusDiv);
}

// ============================================================================
// FALLBACK UI
// ============================================================================
function showFallbackOnboarding() {
  console.log('🔄 [FALLBACK] Showing troubleshooting guide');

  const fullscreenContainer = document.getElementById('fullscreen-container');
  if (!fullscreenContainer) return;

  const issues = [];

  if (!debugInfo.apiAvailable) {
    issues.push({
      title: '❌ API Server Not Running (Port 48215)',
      steps: [
        '1. Open VSCode in bloom-development-extension folder',
        '2. Press F5 to start Extension Host',
        '3. Check Output → "Extension Host" panel',
        '4. Look for: "Bloom Extension FULLY ACTIVE"',
        '5. Verify: curl http://localhost:48215/health'
      ]
    });
  }

  if (!debugInfo.wsAvailable) {
    issues.push({
      title: '❌ WebSocket Server Not Running (Port 4124)',
      steps: [
        '1. WebSocket starts with API server',
        '2. If API is running, check Output panel for errors',
        '3. Verify: netstat -an | findstr "4124"'
      ]
    });
  }

  if (!debugInfo.devServerAvailable) {
    issues.push({
      title: '⚠️ Dev Server Not Running (Port 5173)',
      steps: [
        '1. cd webview/app',
        '2. npm install',
        '3. npm run dev',
        '4. Wait for "ready in Xms" message',
        '5. Note: TCP check via IPC'
      ]
    });
  }

  const issuesHTML = issues.map(issue => `
    <div style="background: var(--bg-tertiary); border-radius: 8px; padding: 16px; margin-bottom: 16px;">
      <h3 style="margin: 0 0 12px 0; font-size: 16px;">${issue.title}</h3>
      <pre style="font-size: 11px; line-height: 1.6; color: var(--accent-primary);">${issue.steps.join('\n')}</pre>
    </div>
  `).join('');

  fullscreenContainer.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 40px; text-align: center;">
      <h1 style="font-size: 48px; margin-bottom: 16px;">🌸</h1>
      <h2 style="font-size: 32px; margin-bottom: 24px;">Backend Services Required</h2>
      
      <div style="max-width: 700px; background: var(--bg-secondary); border-radius: 12px; padding: 32px; margin-bottom: 24px;">
        ${issuesHTML}
        
        <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--border-color);">
          <h3 style="margin: 0 0 12px 0;">🚀 Quick Start</h3>
          <pre style="text-align: left; font-size: 12px; line-height: 1.6; color: var(--text-secondary);">Terminal 1: cd webview/app && npm run dev
Terminal 2: Open VSCode → Press F5
Terminal 3: npx electron main.js --mode=launch --dev</pre>
        </div>
      </div>
      
      <div style="display: flex; gap: 12px;">
        <button onclick="window.location.reload()" style="padding: 12px 24px; background: #4CAF50; color: white; border: none; border-radius: 6px; cursor: pointer;">🔄 Retry</button>
        <button onclick="window.open('http://localhost:48215/api/docs')" style="padding: 12px 24px; background: #2196F3; color: white; border: none; border-radius: 6px; cursor: pointer;">📚 Open Swagger</button>
      </div>
      
      <details style="margin-top: 24px; padding: 16px; background: rgba(0,0,0,0.2); border-radius: 8px;">
        <summary style="cursor: pointer;">🔍 Debug Info</summary>
        <pre style="text-align: left; font-size: 11px; margin-top: 12px;">${JSON.stringify(debugInfo, null, 2)}</pre>
      </details>
    </div>
  `;
}

function showError(message) {
  console.error('🚨 [ERROR]', message);

  const errorDiv = document.createElement('div');
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
  `;
  errorDiv.innerHTML = `
    <strong>⚠️ Error:</strong> ${message}
    <button onclick="this.parentElement.remove()" style="margin-left: 12px; padding: 4px 8px; background: rgba(255,255,255,0.2); border: none; border-radius: 4px; cursor: pointer;">✕</button>
  `;

  document.body.appendChild(errorDiv);
  setTimeout(() => errorDiv.remove(), 10000);
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================
function setupEventListeners() {
  window.electronAPI.on('services:status', (status) => {
    console.log('📨 [EVENT] Services status:', status);
  });

  window.navigateTo = (route) => {
    console.log('🔀 [NAV]', route);
    if (route === 'dashboard') showDashboard();
    else if (route === 'onboarding') showOnboarding();
  };
}

// ============================================================================
// EXPORTS
// ============================================================================
window.bloomLauncher = {
  navigateTo: window.navigateTo,
  getCurrentView: () => currentView,
  isDevMode: () => isDevMode,
  getDebugInfo: () => debugInfo,
  recheckServices: checkServicesHealth
};

console.log('✅ [INIT] Renderer initialized');