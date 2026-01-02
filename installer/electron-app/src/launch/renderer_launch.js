// installer/electron-app/src/launch/renderer_launch.js

const DEV_SERVER_URL = 'http://localhost:5173';
const PROD_BUILD_PATH = 'file://' + window.electronAPI.path.join(__dirname, '../../../webview/app/build/index.html');

let currentView = 'dashboard'; // 'dashboard' | 'onboarding'
let isDevMode = false;

// ============================================================================
// INIT
// ============================================================================
window.addEventListener('DOMContentLoaded', async () => {
  console.log('🌸 Renderer Launch initializing...');
  
  // Check if dev server is available
  isDevMode = await checkDevServer();
  console.log(`📋 Mode: ${isDevMode ? 'DEV (localhost:5173)' : 'PROD (static build)'}`);
  
  setupEventListeners();
  
  // Wait for backend initialization
  window.electronAPI.on('app:initialized', (data) => {
    console.log('📨 App initialized:', data);
    if (data.needsOnboarding) {
      showOnboarding();
    } else {
      showDashboard();
    }
  });
});

// ============================================================================
// DEV SERVER CHECK (MEJORADO)
// ============================================================================
async function checkDevServer() {
  try {
    // Intenta con timeout para no bloquear si el servidor no responde
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
  
  const iframe = document.getElementById('content-iframe');
  if (!iframe) {
    console.error('❌ Iframe not found');
    return;
  }
  
  // Carga onboarding específico
  const onboardingUrl = isDevMode 
    ? `${DEV_SERVER_URL}/onboarding`
    : `${PROD_BUILD_PATH}#/onboarding`;
    
  iframe.src = onboardingUrl;
  
  // Inicializa Copilot para onboarding
  initCopilot();
}

function showDashboard() {
  console.log('📊 Showing Dashboard...');
  currentView = 'dashboard';
  
  const iframe = document.getElementById('content-iframe');
  if (!iframe) {
    console.error('❌ Iframe not found');
    return;
  }
  
  const dashboardUrl = isDevMode 
    ? `${DEV_SERVER_URL}/dashboard`
    : `${PROD_BUILD_PATH}#/dashboard`;
    
  iframe.src = dashboardUrl;
  
  // Limpia Copilot si estaba activo
  cleanupCopilot();
}

// ============================================================================
// COPILOT INTEGRATION (Para onboarding: streaming, historial, sugerencias, markdown)
// ============================================================================
function initCopilot() {
  console.log('🧑‍✈️ Initializing Copilot for onboarding...');
  
  // Asumiendo websocketStore de Svelte está disponible via window (o import si bundled)
  // Nota: En contexto Electron, asume websocket.ts expuesto o cargado
  if (window.websocketStore) {
    window.websocketStore.connect('ws://localhost:4124');
    
    // Streaming y render markdown
    const chatContainer = document.getElementById('copilot-chat'); // Asume existe en wizard
    if (chatContainer) {
      window.websocketStore.on('copilot.chunk', (chunk) => {
        console.log('📨 Copilot chunk received:', chunk);
        const marked = window.marked; // Asume marked.js cargado via <script> en HTML o bundle
        chatContainer.innerHTML += marked.parse(chunk);
        chatContainer.scrollTop = chatContainer.scrollHeight; // Auto-scroll
      });
      
      // Historial via localStorage
      const historyKey = 'copilot_onboarding_history';
      let history = JSON.parse(localStorage.getItem(historyKey) || '[]');
      history.forEach((msg) => {
        chatContainer.innerHTML += `<div class="message">${marked.parse(msg)}</div>`;
      });
      
      // Guardar nuevo mensaje (ejemplo: on send)
      window.addEventListener('copilot:send', (event) => {
        const text = event.detail.text;
        window.websocketStore.sendCopilotPrompt('onboarding', text);
        history.push(text);
        localStorage.setItem(historyKey, JSON.stringify(history));
      });
      
      // Sugerencias (ejemplo: pre-cargadas o via WS)
      window.websocketStore.on('copilot.suggestion', (sug) => {
        const suggestionsContainer = document.getElementById('copilot-suggestions');
        if (suggestionsContainer) {
          suggestionsContainer.innerHTML += `<button class="sug-btn">${sug}</button>`;
        }
      });
    }
    
    // Verificar WS health
    window.electronAPI.healthCheck().then((result) => {
      if (result.status !== 'ok' || !result.checks.websocket) {
        console.warn('⚠️ WebSocket down - Copilot limited');
        // Fallback: Mensaje estático
        chatContainer.innerHTML = '<p>⚠️ Copilot offline. Por favor, completa el onboarding manualmente.</p>';
      }
    });
  } else {
    console.warn('⚠️ websocketStore not available - Copilot disabled');
  }
}

function cleanupCopilot() {
  // Limpia listeners si needed
  if (window.websocketStore) {
    window.websocketStore.disconnect();
  }
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================
function setupEventListeners() {
  // Backend → Frontend events
  window.electronAPI.on('show-onboarding', () => {
    console.log('📨 Received show-onboarding event');
    showOnboarding();
  });
  
  window.electronAPI.on('show-dashboard', () => {
    console.log('📨 Received show-dashboard event');
    showDashboard();
  });
  
  window.electronAPI.on('services:status', (status) => {
    console.log('📨 Services status:', status);
    updateStatusIndicator(status);
  });
  
  // Expose navigation to iframe (for SvelteKit app to call)
  window.navigateTo = (route) => {
    console.log('📄 Navigation request:', route);
    if (route === 'dashboard') {
      showDashboard();
    } else if (route === 'onboarding') {
      showOnboarding();
    }
  };
}

function updateStatusIndicator(status) {
  const indicator = document.getElementById('status-indicator');
  if (!indicator) return;
  
  const allHealthy = status.api && status.websocket && status.brain;
  indicator.className = allHealthy ? 'status-healthy' : 'status-warning';
  indicator.title = `API: ${status.api ? '✅' : '❌'} | WS: ${status.websocket ? '✅' : '❌'} | Brain: ${status.brain ? '✅' : '❌'}`;
}

// ============================================================================
// EXPORTS FOR IFRAME COMMUNICATION
// ============================================================================
window.bloomLauncher = {
  navigateTo,
  getCurrentView: () => currentView,
  isDevMode: () => isDevMode
};