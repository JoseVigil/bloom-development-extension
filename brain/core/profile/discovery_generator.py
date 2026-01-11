"""
Generador de página de discovery/validación para perfiles de Chrome.
Valida conexión Extension <-> Native Host durante instalación.
"""

import json
import os
import platform
import sys
from pathlib import Path
from typing import Dict, Any
from datetime import datetime


def generate_discovery_page(profile_path: Path, profile_data: Dict[str, Any]) -> None:
    """
    Genera página de discovery para validar conexión durante instalación.
    
    Args:
        profile_path: Path al directorio del perfil (e.g., profiles/abc-123/)
        profile_data: Dict con {id, alias, created_at}
    """
    discovery_dir = profile_path / "discovery"
    discovery_dir.mkdir(parents=True, exist_ok=True)
    
    # Leer Extension ID desde nucleus.json o manifest
    extension_id = _read_extension_id()
    
    # Generar archivos
    _generate_html(discovery_dir, profile_data, extension_id)
    _generate_css(discovery_dir)
    _generate_js(discovery_dir, extension_id)


def _read_extension_id() -> str:
    """
    Lee extensionId desde nucleus.json o desde manifest del native host.
    
    Returns:
        Extension ID o 'PLACEHOLDER' si no existe
    """
    try:
        base_dir = _get_base_directory()
        
        # Intentar primero desde nucleus.json
        nucleus_path = base_dir / "nucleus.json"
        if nucleus_path.exists():
            with open(nucleus_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
                extension_id = config.get('extensionId')
                if extension_id:
                    return extension_id
        
        # Fallback: leer desde manifest del native host
        manifest_path = base_dir / "native" / "com.bloom.nucleus.bridge.json"
        if manifest_path.exists():
            with open(manifest_path, 'r', encoding='utf-8') as f:
                manifest = json.load(f)
                origins = manifest.get('allowed_origins', [])
                if origins:
                    # Extraer ID de chrome-extension://EXTENSION_ID/
                    origin = origins[0]
                    extension_id = origin.replace('chrome-extension://', '').rstrip('/')
                    return extension_id
        
        print(f"⚠️  Extension ID not found", file=sys.stderr)
        return 'PLACEHOLDER'
        
    except Exception as e:
        print(f"⚠️  Error reading extension ID: {e}", file=sys.stderr)
        return 'PLACEHOLDER'


def _get_base_directory() -> Path:
    """Determina el directorio base según el sistema operativo"""
    system = platform.system()
    
    if system == "Windows":
        localappdata = os.environ.get("LOCALAPPDATA")
        if not localappdata:
            raise RuntimeError("Variable LOCALAPPDATA no encontrada")
        return Path(localappdata) / "BloomNucleus"
    
    elif system == "Darwin":  # macOS
        home = Path.home()
        return home / "Library" / "Application Support" / "BloomNucleus"
    
    else:  # Linux y otros
        home = Path.home()
        return home / ".local" / "share" / "BloomNucleus"


def _generate_html(discovery_dir: Path, profile_data: Dict[str, Any], extension_id: str) -> None:
    """Genera index.html con lógica de discovery"""
    
    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bloom Discovery - Validating Connection</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div id="app">
    <div class="discovery-container">
      <!-- Logo -->
      <div class="logo">B</div>
      
      <!-- Header -->
      <h1>Validando Conexión</h1>
      <p class="subtitle">Conectando extensión con instalador...</p>
      
      <!-- Heartbeat Animation -->
      <div class="heartbeat-wrapper">
        <div class="status-dot" id="status-dot"></div>
        <div class="ripple"></div>
        <div class="ripple ripple-delay-1"></div>
        <div class="ripple ripple-delay-2"></div>
        <div class="ripple ripple-delay-3"></div>
      </div>
      
      <!-- Status Message -->
      <div class="status-message" id="status-message">
        🔍 Buscando extensión...
      </div>
      
      <!-- Progress Info -->
      <div class="progress-info" id="progress-info">
        Intento <span id="attempt-count">0</span> de 60
      </div>
      
      <!-- Auto-close Notice -->
      <div class="auto-close-notice" id="auto-close-notice" style="display: none;">
        ✅ Esta página se cerrará automáticamente al completar la validación
      </div>
      
      <!-- Error State -->
      <div class="error-container" id="error-container" style="display: none;">
        <div class="error-icon">✕</div>
        <h2>Error de Conexión</h2>
        <p id="error-message">No se pudo establecer conexión con la extensión</p>
        <div class="error-details" id="error-details"></div>
      </div>
    </div>
  </div>

  <script>
    // Inject configuration
    window.BLOOM_CONFIG = {json.dumps({
        'extension_id': extension_id,
        'profile_id': profile_data.get('id'),
        'profile_alias': profile_data.get('alias'),
        'timestamp': datetime.now().isoformat()
    }, indent=2)};
  </script>
  
  <script src="script.js"></script>
</body>
</html>"""
    
    (discovery_dir / "index.html").write_text(html_content, encoding='utf-8')


def _generate_css(discovery_dir: Path) -> None:
    """Genera styles.css para discovery page"""
    
    css_content = """* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  background: linear-gradient(135deg, #0f0f23 0%, #1a0b2e 50%, #0f0f23 100%);
  color: white;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.discovery-container {
  text-align: center;
  max-width: 600px;
  padding: 40px;
}

.logo {
  width: 100px;
  height: 100px;
  border-radius: 24px;
  background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48px;
  font-weight: bold;
  box-shadow: 0 8px 32px rgba(147, 51, 234, 0.4);
  margin: 0 auto 40px;
}

h1 {
  font-size: 42px;
  font-weight: 800;
  background: linear-gradient(135deg, #a78bfa 0%, #f472b6 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  margin-bottom: 12px;
}

.subtitle {
  color: #94a3b8;
  font-size: 18px;
  margin-bottom: 60px;
}

/* Heartbeat Animation */
.heartbeat-wrapper {
  position: relative;
  width: 140px;
  height: 140px;
  margin: 0 auto 40px;
}

.status-dot {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 70px;
  height: 70px;
  border-radius: 50%;
  background: #ef4444;
  z-index: 2;
  box-shadow: 0 0 30px rgba(239, 68, 68, 0.6);
  transition: all 0.5s ease;
}

.status-dot.searching {
  background: #eab308;
  box-shadow: 0 0 30px rgba(234, 179, 8, 0.6);
}

.status-dot.connected {
  background: #22c55e;
  box-shadow: 0 0 30px rgba(34, 197, 94, 0.6);
}

.ripple {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 70px;
  height: 70px;
  border-radius: 50%;
  border: 3px solid #ef4444;
  opacity: 0;
  animation: ripple-effect 2s ease-out infinite;
}

.ripple-delay-1 {
  animation-delay: 0.5s;
}

.ripple-delay-2 {
  animation-delay: 1s;
}

.ripple-delay-3 {
  animation-delay: 1.5s;
}

.status-dot.searching ~ .ripple {
  border-color: #eab308;
}

.status-dot.connected ~ .ripple {
  border-color: #22c55e;
  animation: ripple-success 1s ease-out;
}

@keyframes ripple-effect {
  0% {
    width: 70px;
    height: 70px;
    opacity: 0.8;
  }
  100% {
    width: 160px;
    height: 160px;
    opacity: 0;
  }
}

@keyframes ripple-success {
  0% {
    width: 70px;
    height: 70px;
    opacity: 0.8;
  }
  100% {
    width: 200px;
    height: 200px;
    opacity: 0;
  }
}

/* Status Messages */
.status-message {
  font-size: 18px;
  color: #cbd5e1;
  margin-bottom: 20px;
  min-height: 28px;
  font-weight: 500;
}

.progress-info {
  font-size: 14px;
  color: #64748b;
  font-family: 'Courier New', monospace;
}

.auto-close-notice {
  margin-top: 40px;
  padding: 16px 24px;
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.3);
  border-radius: 12px;
  color: #86efac;
  font-size: 14px;
}

/* Error State */
.error-container {
  margin-top: 40px;
}

.error-icon {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: rgba(239, 68, 68, 0.2);
  border: 3px solid #ef4444;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48px;
  color: #ef4444;
  margin: 0 auto 20px;
}

.error-container h2 {
  font-size: 28px;
  color: #fca5a5;
  margin-bottom: 12px;
}

.error-container p {
  color: #cbd5e1;
  font-size: 16px;
  margin-bottom: 20px;
}

.error-details {
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 12px;
  padding: 16px;
  text-align: left;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  color: #94a3b8;
  max-height: 200px;
  overflow-y: auto;
}"""
    
    (discovery_dir / "styles.css").write_text(css_content, encoding='utf-8')


def _generate_js(discovery_dir: Path, extension_id: str) -> None:
    """Genera script.js con lógica de ping y discovery"""
    
    js_content = """// ============================================================================
// BLOOM DISCOVERY PAGE - CONNECTION VALIDATOR
// ============================================================================

const CONFIG = {
  MAX_ATTEMPTS: 60,
  PING_INTERVAL_MS: 1000,
  CLOSE_DELAY_MS: 2000
};

class DiscoveryValidator {
  constructor() {
    this.extensionId = window.BLOOM_CONFIG?.extension_id;
    this.attemptCount = 0;
    this.isConnected = false;
    this.pingInterval = null;
    
    // DOM elements
    this.statusDot = document.getElementById('status-dot');
    this.statusMessage = document.getElementById('status-message');
    this.progressInfo = document.getElementById('progress-info');
    this.attemptCountEl = document.getElementById('attempt-count');
    this.autoCloseNotice = document.getElementById('auto-close-notice');
    this.errorContainer = document.getElementById('error-container');
    this.errorMessage = document.getElementById('error-message');
    this.errorDetails = document.getElementById('error-details');
  }
  
  start() {
    console.log('[Bloom Discovery] Starting validation...');
    console.log('[Bloom Discovery] Extension ID:', this.extensionId);
    
    if (!this.extensionId || this.extensionId === 'PLACEHOLDER') {
      this.showError('Extension ID no disponible', {
        error: 'MISSING_EXTENSION_ID',
        config: window.BLOOM_CONFIG
      });
      return;
    }
    
    if (typeof chrome === 'undefined' || !chrome.runtime) {
      this.showError('Chrome runtime no disponible', {
        error: 'CHROME_RUNTIME_UNAVAILABLE',
        userAgent: navigator.userAgent
      });
      return;
    }
    
    this.updateStatus('searching');
    this.startPinging();
  }
  
  startPinging() {
    this.pingInterval = setInterval(() => {
      this.attemptCount++;
      this.updateAttemptCount();
      
      if (this.attemptCount > CONFIG.MAX_ATTEMPTS) {
        this.timeout();
        return;
      }
      
      this.sendPing();
      
    }, CONFIG.PING_INTERVAL_MS);
    
    // First ping immediately
    this.sendPing();
  }
  
  sendPing() {
    console.log(\`[Bloom Discovery] Ping attempt \${this.attemptCount}\`);
    
    try {
      // Usamos el ID de extensión inyectado por Python
      chrome.runtime.sendMessage(
        this.extensionId,
        { 
          command: 'ping',           // Comando simple
          source: 'discovery_page',  // Identificador vital para el router
          timestamp: Date.now() 
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.log('Ping failed:', chrome.runtime.lastError.message);
            return;
          }
          // El router ahora responde { status: "pong" }
          if (response && response.status === 'pong') {
            this.onConnectionSuccess(response);
          }
        }
      );
    } catch (error) { ... }
  }

  chrome.runtime.sendMessage(
    this.extensionId,
    {
        command: 'discovery_complete', // CLAVE: Coincide con background.js
        source: 'discovery_page',      // CLAVE: Coincide con background.js
        profile_id: window.BLOOM_CONFIG?.profile_id,
        timestamp: Date.now()
    }
    );

  notifyHost(pingResponse) {
    // Enviar notificación de éxito
    chrome.runtime.sendMessage(
      this.extensionId,
      {
        command: 'discovery_complete', // El router escuchará esto
        source: 'discovery_page',
        profile_id: window.BLOOM_CONFIG?.profile_id,
        // ... resto de datos ...
      }
    );
  }
  
  listenForClose() {
    // Listener para comando de cierre desde la extensión
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('[Bloom Discovery] Message received:', message);
      
      // Escuchar profile_closing (el perfil completo se está cerrando)
      if (message.command === 'profile_closing' || message.action === 'profile_closing') {
        console.log('[Bloom Discovery] Profile closing, preparing shutdown...');
        sendResponse({ status: 'acknowledged' });
        
        // La extensión cerrará todas las ventanas, solo limpiamos estado
        this.cleanup();
      }
      
      return true;
    });
    
    console.log('[Bloom Discovery] Listening for profile close command...');
  }
  
  cleanup() {
    // Limpiar recursos antes de que el perfil se cierre
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    console.log('[Bloom Discovery] Cleanup complete');
  }
  
  timeout() {
    console.error('[Bloom Discovery] Timeout reached');
    clearInterval(this.pingInterval);
    
    this.showError(
      `No se pudo conectar después de ${CONFIG.MAX_ATTEMPTS} intentos`,
      {
        extension_id: this.extensionId,
        attempts: this.attemptCount,
        chrome_available: typeof chrome !== 'undefined',
        runtime_available: typeof chrome?.runtime !== 'undefined'
      }
    );
  }
  
  updateStatus(status) {
    this.statusDot.className = `status-dot ${status}`;
    
    const messages = {
      searching: '🔍 Buscando extensión...',
      connected: '✅ Extensión conectada'
    };
    
    this.statusMessage.textContent = messages[status] || '';
  }
  
  updateAttemptCount() {
    this.attemptCountEl.textContent = this.attemptCount;
  }
  
  showError(message, details) {
    clearInterval(this.pingInterval);
    
    this.statusDot.style.display = 'none';
    document.querySelector('.heartbeat-wrapper').style.display = 'none';
    this.statusMessage.style.display = 'none';
    this.progressInfo.style.display = 'none';
    
    this.errorContainer.style.display = 'block';
    this.errorMessage.textContent = message;
    
    if (details) {
      this.errorDetails.textContent = JSON.stringify(details, null, 2);
    }
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  const validator = new DiscoveryValidator();
  validator.start();
});

// Prevent accidental close
window.addEventListener('beforeunload', (e) => {
  if (!window.BLOOM_VALIDATOR?.isConnected) {
    e.preventDefault();
    e.returnValue = '';
  }
});"""
    
    (discovery_dir / "script.js").write_text(js_content, encoding='utf-8')
