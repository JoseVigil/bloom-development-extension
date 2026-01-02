// installer/electron-app/src/launch/renderer_launch.js
// CORREGIDO: Con fallback si no existe el build de SvelteKit

const DEV_SERVER_URL = 'http://localhost:5173';

let PROD_BUILD_PATH = null;
let currentView = 'dashboard';
let isDevMode = false;

// ============================================================================
// INIT
// ============================================================================
window.addEventListener('DOMContentLoaded', async () => {
  console.log('🌸 Renderer Launch initializing...');
  
  showLoading('Initializing...');
  
  try {
    const webviewPath = await window.electronAPI.getPath('webview-build');
    PROD_BUILD_PATH = 'file://' + webviewPath.replace(/\\/g, '/');
    console.log('📦 Webview build path:', PROD_BUILD_PATH);
    
    isDevMode = await checkDevServer();
    console.log(`📋 Mode: ${isDevMode ? 'DEV (localhost:5173)' : 'PROD (static build)'}`);
    
    setupEventListeners();
    
    window.electronAPI.on('app:initialized', (data) => {
      console.log('📨 App initialized:', data);
      hideLoading();
    });

    window.electronAPI.on('show-onboarding', () => {
      console.log('📨 Received show-onboarding event');
      showOnboarding();
    });

    window.electronAPI.on('show-dashboard', () => {
      console.log('📨 Received show-dashboard event');
      showDashboard();
    });
    
  } catch (error) {
    console.error('❌ Initialization error:', error);
    hideLoading();
    showError('Failed to initialize application: ' + error.message);
  }
});

// ============================================================================
// LOADING OVERLAY
// ============================================================================
function showLoading(message = 'Loading...') {
  const overlay = document.getElementById('loading-overlay');
  const text = document.getElementById('loading-text');
  if (overlay) {
    overlay.classList.add('active');
    if (text) text.textContent = message;
  }
}

function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.classList.remove('active');
  }
}

// ============================================================================
// DEV SERVER CHECK
// ============================================================================
async function checkDevServer() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    
    const response = await fetch(DEV_SERVER_URL, { 
      method: 'HEAD',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    console.warn('⚠️ Dev server not available:', error.message);
    return false;
  }
}

// ============================================================================
// VIEW MANAGEMENT
// ============================================================================
function showOnboarding() {
  console.log('🧑‍✈️ Showing Onboarding Wizard...');
  currentView = 'onboarding';
  
  const dashboardContainer = document.getElementById('dashboard-container');
  const fullscreenContainer = document.getElementById('fullscreen-container');
  const iframe = document.getElementById('content-iframe');
  
  if (!iframe) {
    console.error('❌ Iframe not found');
    showError('Critical error: iframe element not found in DOM');
    return;
  }
  
  if (!isDevMode && !PROD_BUILD_PATH) {
    console.error('❌ PROD_BUILD_PATH not initialized');
    showError('Failed to load onboarding: path not resolved');
    return;
  }
  
  // Construir URL de onboarding
  const onboardingUrl = isDevMode 
    ? `${DEV_SERVER_URL}/onboarding`
    : `${PROD_BUILD_PATH}#/onboarding`;
    
  console.log('🔗 Loading onboarding from:', onboardingUrl);
  
  // Cambiar layout
  if (dashboardContainer) dashboardContainer.classList.add('hidden');
  if (fullscreenContainer) fullscreenContainer.classList.add('active');
  
  // Cargar iframe con timeout de seguridad
  showLoading('Loading onboarding wizard...');
  
  let loaded = false;
  
  iframe.onload = () => {
    if (loaded) return;
    loaded = true;
    console.log('✅ Onboarding iframe loaded');
    hideLoading();
    initCopilot();
  };
  
  iframe.onerror = (err) => {
    console.error('❌ Onboarding iframe failed to load:', err);
    loaded = true;
    hideLoading();
    showFallbackOnboarding();
  };
  
  // Timeout de seguridad: si después de 5 segundos no cargó, mostrar fallback
  setTimeout(() => {
    if (!loaded) {
      console.warn('⏰ Iframe loading timeout - checking state');
      console.log('🔍 Iframe contentDocument:', iframe.contentDocument);
      console.log('🔍 Iframe contentWindow:', iframe.contentWindow);
      
      // Intentar detectar si hay contenido
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc || !doc.body || doc.body.children.length === 0) {
          console.error('❌ Iframe empty or inaccessible');
          loaded = true;
          hideLoading();
          showFallbackOnboarding();
        } else {
          console.log('✅ Iframe has content, hiding loading');
          loaded = true;
          hideLoading();
        }
      } catch (e) {
        console.error('❌ Cannot access iframe content:', e);
        loaded = true;
        hideLoading();
        showFallbackOnboarding();
      }
    }
  }, 5000);
  
  iframe.src = onboardingUrl;
}

// ============================================================================
// FALLBACK ONBOARDING (si no hay build de SvelteKit)
// ============================================================================
function showFallbackOnboarding() {
  console.log('🔄 Showing fallback onboarding');
  
  const fullscreenContainer = document.getElementById('fullscreen-container');
  if (!fullscreenContainer) return;
  
  // Crear contenido de fallback
  const fallbackHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 40px; text-align: center; background: var(--bg-primary); color: var(--text-primary);">
      <div style="max-width: 600px;">
        <h1 style="font-size: 48px; margin-bottom: 16px;">🌸</h1>
        <h2 style="font-size: 32px; margin-bottom: 24px; color: var(--accent-primary);">Welcome to Bloom Nucleus</h2>
        
        <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 12px; padding: 32px; margin-bottom: 24px;">
          <p style="font-size: 16px; line-height: 1.6; color: var(--text-secondary); margin-bottom: 24px;">
            The onboarding interface is not available yet. This happens when:
          </p>
          <ul style="text-align: left; color: var(--text-secondary); margin-bottom: 24px; padding-left: 20px;">
            <li style="margin-bottom: 8px;">The SvelteKit app hasn't been built yet</li>
            <li style="margin-bottom: 8px;">The dev server is not running</li>
            <li>Build files are missing or corrupted</li>
          </ul>
          
          <div style="background: var(--bg-tertiary); border-radius: 8px; padding: 16px; margin-bottom: 24px;">
            <p style="font-size: 14px; color: var(--text-primary); margin-bottom: 8px; font-weight: 600;">To fix this:</p>
            <pre style="text-align: left; font-size: 12px; color: var(--accent-primary); font-family: monospace;">cd webview/app
npm install
npm run build</pre>
          </div>
          
          <p style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">
            Or start the dev server:
          </p>
          <pre style="text-align: left; font-size: 12px; color: var(--accent-primary); font-family: monospace; background: var(--bg-tertiary); padding: 12px; border-radius: 8px;">npm run dev</pre>
        </div>
        
        <div style="display: flex; gap: 12px; justify-content: center;">
          <button onclick="window.location.reload()" style="padding: 12px 24px; background: var(--accent-primary); color: white; border: none; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer;">
            Retry
          </button>
          <button onclick="window.bloomLauncher.navigateTo('dashboard')" style="padding: 12px 24px; background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer;">
            Skip to Dashboard
          </button>
        </div>
      </div>
    </div>
  `;
  
  fullscreenContainer.innerHTML = fallbackHTML;
}

function showDashboard() {
  console.log('📊 Showing Dashboard...');
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
// NAVIGATION
// ============================================================================
function navigateTo(route) {
  console.log('🔄 Navigation request:', route);
  if (route === 'dashboard') {
    showDashboard();
  } else if (route === 'onboarding') {
    showOnboarding();
  }
}

// ============================================================================
// ERROR DISPLAY
// ============================================================================
function showError(message) {
  const errorDiv = document.createElement('div');
  errorDiv.className = 'error-banner';
  errorDiv.innerHTML = `
    <span class="error-icon">⚠️</span>
    <div class="error-content">
      <h4>Error</h4>
      <p>${message}</p>
    </div>
  `;
  
  const activeContainer = document.querySelector('.fullscreen-container.active, .dashboard-container:not(.hidden)');
  if (activeContainer) {
    activeContainer.insertBefore(errorDiv, activeContainer.firstChild);
  } else {
    document.body.insertBefore(errorDiv, document.body.firstChild);
  }
  
  setTimeout(() => errorDiv.remove(), 10000);
}

// ============================================================================
// COPILOT INTEGRATION
// ============================================================================
function initCopilot() {
  console.log('🧑‍✈️ Initializing Copilot for onboarding...');
  
  if (window.websocketStore) {
    window.websocketStore.connect('ws://localhost:4124');
    
    const chatContainer = document.getElementById('copilot-chat');
    if (chatContainer) {
      window.websocketStore.on('copilot.chunk', (chunk) => {
        console.log('📨 Copilot chunk received:', chunk);
        if (window.marked) {
          chatContainer.innerHTML += window.marked.parse(chunk);
          chatContainer.scrollTop = chatContainer.scrollHeight;
        }
      });
      
      const historyKey = 'copilot_onboarding_history';
      let history = JSON.parse(localStorage.getItem(historyKey) || '[]');
      history.forEach((msg) => {
        if (window.marked) {
          chatContainer.innerHTML += `<div class="message">${window.marked.parse(msg)}</div>`;
        }
      });
      
      window.addEventListener('copilot:send', (event) => {
        const text = event.detail.text;
        window.websocketStore.sendCopilotPrompt('onboarding', text);
        history.push(text);
        localStorage.setItem(historyKey, JSON.stringify(history));
      });
      
      window.websocketStore.on('copilot.suggestion', (sug) => {
        const suggestionsContainer = document.getElementById('copilot-suggestions');
        if (suggestionsContainer) {
          suggestionsContainer.innerHTML += `<button class="sug-btn">${sug}</button>`;
        }
      });
    }
    
    window.electronAPI.healthCheck().then((result) => {
      if (result.status !== 'ok' || !result.checks.websocket) {
        console.warn('⚠️ WebSocket down - Copilot limited');
        if (chatContainer) {
          chatContainer.innerHTML = '<p>⚠️ Copilot offline. Por favor, completa el onboarding manualmente.</p>';
        }
      }
    }).catch(err => {
      console.error('Health check failed:', err);
    });
  } else {
    console.warn('⚠️ websocketStore not available - Copilot disabled');
  }
}

function cleanupCopilot() {
  if (window.websocketStore) {
    window.websocketStore.disconnect();
  }
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================
function setupEventListeners() {
  window.electronAPI.on('services:status', (status) => {
    console.log('📨 Services status:', status);
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
  isDevMode: () => isDevMode
};

console.log('✅ Bloom Launcher renderer initialized');