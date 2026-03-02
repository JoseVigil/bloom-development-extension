// renderer.js - REFACTORED: Adaptado para usar TCP heartbeat
// ✅ Mantiene toda la lógica UI original
// ✅ Solo actualiza llamadas API para compatibilidad TCP

// ========================================================================
// 1. UI MANAGER (Sin Cambios)
// ========================================================================
class UIManager {
  constructor() {
    this.currentScreen = 'welcome-screen';
  }

  showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById(screenId);
    if (screen) {
      screen.classList.add('active');
      this.currentScreen = screenId;
    }
  }

  updateProgress(step, total, message) {
    const percentage = (step / total) * 100;
    const fillEl = document.getElementById('progress-fill');
    const textEl = document.getElementById('progress-text');
    
    if (fillEl) fillEl.style.width = percentage + '%';
    if (textEl) textEl.textContent = `Paso ${step}/${total}: ${message}`;
  }

  showSpinner(containerId) {
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = '<div class="spinner"></div>';
      container.style.display = 'block';
    }
  }

  hideSpinner(containerId, contentId) {
    const container = document.getElementById(containerId);
    const content = document.getElementById(contentId);
    
    if (container) container.style.display = 'none';
    if (content) content.style.display = 'block';
  }

  showError(message) {
    const errorMsgEl = document.getElementById('error-message');
    if (errorMsgEl) errorMsgEl.textContent = message;
    this.showScreen('error-screen');
  }

  updateText(elementId, text) {
    const el = document.getElementById(elementId);
    if (el) el.textContent = text;
  }

  updateHTML(elementId, html) {
    const el = document.getElementById(elementId);
    if (el) el.innerHTML = html;
  }

  setButtonState(buttonId, disabled, text = null) {
    const btn = document.getElementById(buttonId);
    if (btn) {
      btn.disabled = disabled;
      if (text) btn.textContent = text;
    }
  }

  toggleElement(elementId, show) {
    const el = document.getElementById(elementId);
    if (el) el.style.display = show ? 'block' : 'none';
  }

  animateHeartbeat(dotId) {
    const dot = document.getElementById(dotId);
    if (dot) {
      dot.style.opacity = dot.style.opacity === '0.5' ? '1' : '0.5';
    }
  }

  setHeartbeatState(dotId, connected) {
    const dot = document.getElementById(dotId);
    if (dot) {
      dot.classList.remove('red', 'green');
      dot.classList.add(connected ? 'green' : 'red');
    }
  }
}

// ========================================================================
// 2. INSTALLATION MANAGER (Lógica Original + TCP Compatible)
// ========================================================================
class InstallationManager {
  constructor(api, uiManager) {
    this.api = api;
    this.ui = uiManager;
    this.extensionId = null;
    this.profileId = null;
    this.sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  }

  async initialize() {
    this.ui.updateText('install-path', '%LOCALAPPDATA%\\BloomNucleus');
    this.ui.setButtonState('start-button', false, '🚀 INSTALAR BLOOM NUCLEUS');
    return { success: true };
  }

  async startInstallation() {
    console.log("🚀 [AUTO] Iniciando flujo automático...");
    this.ui.showScreen('installation-screen');

    // ── Registrar listeners ANTES de llamar installService ──────────────────
    // Así no perdemos ningún evento aunque lleguen durante la instalación.

    // 1. Progreso de instalación → barra de progreso
    window.api.on('installation-progress', (data) => {
      const step = data.current ?? data.step ?? 0;
      const total = data.total ?? 10;
      const percentage = data.percentage ?? Math.round((step / total) * 100);
      console.log(`[Progress] ${percentage}% [${step}/${total}] ${data.message}`);

      const fillEl = document.getElementById('progress-fill');
      const textEl = document.getElementById('progress-text');
      const detailsEl = document.getElementById('installation-details');

      if (fillEl) fillEl.style.width = percentage + '%';
      if (textEl) textEl.textContent = `Paso ${step}/${total}: ${data.message}`;
      if (detailsEl) {
        detailsEl.innerHTML = data.detail
          ? `<p style="color:#4299e1;">• ${data.detail}</p>` : '';
      }
    });

    // 2. Heartbeat starting → mostrar pantalla heartbeat INMEDIATAMENTE
    window.api.on('heartbeat:starting', (data) => {
      console.log("🔴 [Semáforo] heartbeat:starting → pantalla heartbeat");
      this.profileId = data.profile_id || this.profileId;
      this.ui.showScreen('heartbeat-screen');
    });

    // 3. Launch done → círculo amarillo (Sentinel lanzado, esperando handshake)
    window.api.on('heartbeat:launch-done', (data) => {
      console.log("🟡 [Semáforo] heartbeat:launch-done → amarillo");
      this.profileId = data.profile_id || this.profileId;
      const circle = document.getElementById('heartbeat-circle');
      if (circle) {
        circle.classList.remove('synapse', 'connected');
        circle.classList.add('synapse');
      }
      const sub = document.getElementById('heartbeat-sub');
      if (sub) sub.textContent = 'Sentinel activo · Esperando handshake con extensión...';
    });

    // 4. Validated → círculo verde → avanzar
    window.api.on('heartbeat:validated', async (data) => {
      console.log("🟢 [Semáforo] heartbeat:validated → verde");
      this.profileId = data.profile_id || this.profileId;
      const circle = document.getElementById('heartbeat-circle');
      if (circle) {
        circle.classList.remove('synapse');
        circle.classList.add('connected');
      }
      const sub = document.getElementById('heartbeat-sub');
      if (sub) sub.textContent = 'Perfil conectado · Handshake exitoso';
      await this.sleep(1800);
      this.ui.showScreen('connection-success-screen');
      const ob = document.getElementById('start-onboarding-btn');
      if (ob) ob.disabled = false;
    });

    try {
      // ── Lanzar instalación (bloqueante, los eventos ya están escuchando) ──
      const result = await this.api.installService();

      if (!result.success) {
        throw new Error(result.error?.message || result.error || 'Installation failed');
      }

      this.extensionId = result.extensionId || result.extension_id || null;
      this.profileId = result.profileId || result.profile_id || this.profileId;

      console.log("✅ [AUTO] installService() resolvió. Profile:", this.profileId);

      // Si heartbeat:validated ya llegó (y cambió la pantalla), no hacer nada más.
      // Si por algún motivo no llegó, activar polling de respaldo.
      if (this.ui.currentScreen !== 'connection-success-screen') {
        this._startHeartbeatFallbackPoll();
      }

      return { success: true };

    } catch (error) {
      console.error("❌ [AUTO] Error:", error);
      this.ui.showError(error.message);
      return { success: false };
    }
  }

  // Polling de respaldo: por si heartbeat:validated nunca llegó pero el sistema ya está OK
  _startHeartbeatFallbackPoll() {
    console.log("🔁 [Fallback poll] Iniciando polling de respaldo...");
    let attempts = 0;
    const MAX = 40; // 40 × 3s = 120s

    const poll = setInterval(async () => {
      if (this.ui.currentScreen === 'connection-success-screen') {
        clearInterval(poll); return;
      }
      attempts++;
      try {
        const status = await this.api.checkBrainServiceStatus();
        console.log(`[Fallback poll ${attempts}] running=${status?.running} profiles=${status?.registeredProfiles}`);

        if (status && (status.running || status.registeredProfiles > 0)) {
          clearInterval(poll);
          // Disparar verde manualmente
          const circle = document.getElementById('heartbeat-circle');
          if (circle) { circle.classList.remove('synapse'); circle.classList.add('connected'); }
          const sub = document.getElementById('heartbeat-sub');
          if (sub) sub.textContent = 'Perfil conectado · Handshake exitoso';
          await this.sleep(1800);
          this.ui.showScreen('connection-success-screen');
          return;
        }
      } catch (e) { console.warn('[Fallback poll] error:', e.message); }

      if (attempts >= MAX) {
        clearInterval(poll);
        // Timeout: mostrar botón reintentar
        const sub = document.getElementById('heartbeat-sub');
        if (sub) sub.textContent = 'Sin respuesta · Verifica los logs';
        const retry = document.getElementById('retry-heartbeat-btn');
        if (retry) retry.style.display = 'block';
      }
    }, 3000);
  }

} // ── end InstallationManager ──

// ========================================================================
// 3. HEARTBEAT MANAGER (Adaptado para TCP)
// ========================================================================
class HeartbeatManager {
  constructor(api, uiManager) {
    this.api = api;
    this.ui = uiManager;
    this.interval = null;
    this.attempts = 0;
    this.maxAttempts = 45;
    this.pollInterval = 2000;
  }

  start() {
    console.log('🔄 Iniciando polling de heartbeat (manual)...');
    this.attempts = 0;
    
    this.interval = setInterval(async () => {
      this.attempts++;
      
      this.ui.updateText('heartbeat-status', 
        `Intento ${this.attempts}/${this.maxAttempts} - Esperando señal de Chrome...`
      );
      
      // ✅ REFACTORED: Usa TCP heartbeat
      const status = await this.api.checkExtensionHeartbeat();
      
      if (status.chromeConnected) {
        console.log('✅ ¡Conexión detectada via TCP!');
        console.log(`   Latencia: ${status.latency}ms`);
        this.stop();
        return { success: true };
      }
      
      // Timeout
      if (this.attempts >= this.maxAttempts) {
        this.stop();
        const error = 'Timeout: La extensión no se conectó en 90 segundos.\n\n' +
                      'Verifica que:\n' +
                      '1. Instalaste la extensión en Chrome\n' +
                      '2. La extensión está habilitada\n' +
                      '3. El Native Host está corriendo (puerto 5678)';
        this.ui.showError(error);
        return { success: false, error };
      }
    }, this.pollInterval);
  }

  startHandshakePolling(onSuccess) {
    console.log('🔄 Iniciando validación estricta de conexión (TCP)...');
    this.attempts = 0;
    const MAX_ATTEMPTS = 30;
    const POLL_INTERVAL = 3000;
    
    this.interval = setInterval(async () => {
      this.attempts++;
      
      this.ui.animateHeartbeat('heartbeat-dot');
      
      this.ui.updateHTML('step2-message', `
        <p>Validando conexión con Chrome via TCP...</p>
        <p style="font-size: 12px; color: #a0aec0; margin-top: 5px;">
          Intento ${this.attempts}/${MAX_ATTEMPTS}
        </p>
      `);
      
      // ✅ REFACTORED: Usa TCP heartbeat
      const status = await this.api.checkExtensionHeartbeat();
      
      if (status.chromeConnected) {
        this.stop();
        console.log('✅ Handshake TCP exitoso');
        console.log(`   Latencia: ${status.latency}ms`);
        
        this.ui.setHeartbeatState('heartbeat-dot', true);
        this.ui.toggleElement('step-waiting-chrome', false);
        this.ui.toggleElement('step-success', true);
        this.ui.updateText('handshake-title', 'Sincronizado');
        
        if (onSuccess) onSuccess();
        return;
      }
      
      if (this.attempts >= MAX_ATTEMPTS) {
        this.stop();
        const error = `Timeout: Chrome no respondió después de ${MAX_ATTEMPTS * 3} segundos.\n` +
                      'Verifica:\n' +
                      '1. Chrome se cerró completamente antes de reabrir\n' +
                      '2. El Native Host está corriendo (puerto 5678)\n' +
                      '3. No hay políticas de dominio bloqueando extensiones';
        this.ui.showError(error);
      }
    }, POLL_INTERVAL);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      this.attempts = 0;
    }
  }
}

// ========================================================================
// 4. EXTENSION INSTALLER (Sin Cambios - No usa heartbeat directamente)
// ========================================================================
class ExtensionInstaller {
  constructor(api, uiManager) {
    this.api = api;
    this.ui = uiManager;
    this.currentCrxPath = '';
  }

  async prepareCrxFile() {
    const result = await this.api.installExtension();
    
    if (result.success) {
      this.currentCrxPath = result.crxPath;
      console.log('📦 Archivo listo en:', this.currentCrxPath);
      return { success: true, path: result.crxPath };
    } else {
      this.ui.showError("No se pudo preparar el archivo CRX: " + result.error);
      return { success: false, error: result.error };
    }
  }

  setupDragAndDrop(elementId) {
    const cardEl = document.getElementById(elementId);
    
    if (!cardEl) {
      console.error(`❌ ERROR CRÍTICO: No encontré el elemento con ID '${elementId}'`);
      return;
    }

    console.log('✅ Elemento encontrado, configurando click para:', elementId);

    cardEl.style.cursor = 'pointer';
    cardEl.removeAttribute('draggable');

    const newElement = cardEl.cloneNode(true);
    cardEl.parentNode.replaceChild(newElement, cardEl);

    newElement.addEventListener('click', () => {
      console.log('🖱️ CLICK DETECTADO. Ruta actual:', this.currentCrxPath);
      
      if (this.currentCrxPath && this.currentCrxPath.length > 0) {
        this.api.showItemInFolder(this.currentCrxPath);
      } else {
        alert("⚠️ El archivo aún no está listo. Espera unos segundos.");
        console.warn("Click fallido: currentCrxPath está vacío");
      }
    });
  }

  validateExtensionId(extensionId) {
    const trimmedId = extensionId.trim();
    if (!/^[a-z]{32}$/.test(trimmedId)) {
      return { valid: false, error: "El ID debe tener 32 letras minúsculas (a-z)" };
    }
    return { valid: true, id: trimmedId };
  }

  setupIdInput(inputId, buttonId, errorMsgId, onSuccess) {
    const input = document.getElementById(inputId);
    const button = document.getElementById(buttonId);
    const errorMsg = document.getElementById(errorMsgId);

    if (!input || !button) return;

    button.addEventListener('click', async () => {
      const validation = this.validateExtensionId(input.value);
      
      if (!validation.valid) {
        if (errorMsg) {
          errorMsg.style.display = 'block';
          errorMsg.textContent = validation.error;
        }
        return;
      }
      
      if (errorMsg) errorMsg.style.display = 'none';
      this.ui.setButtonState(buttonId, true, 'Configurando...');

      const updateResult = await this.api.updateExtensionId(validation.id);
      
      if (!updateResult.success) {
        this.ui.showError("Error: " + updateResult.error);
        this.ui.setButtonState(buttonId, false, 'Conectar');
        return;
      }

      if (onSuccess) onSuccess(validation.id);
    });
  }

  openChromeExtensions() {
    this.api.openChromeExtensions();
  }
}

// ========================================================================
// 5. EVENT LISTENERS (Sin Cambios - Lógica Original)
// ========================================================================
class EventListeners {
  constructor(api, uiManager, installationManager) {
    this.api = api;
    this.ui = uiManager;
    this.installation = installationManager;
  }

  setupAll() {
    this.setupWelcomeScreen();
    this.setupSuccessScreen();
    this.setupErrorScreen();
  }

  setupWelcomeScreen() {
    const startBtn = document.getElementById('start-button');
    if (!startBtn) return;
    
    startBtn.addEventListener('click', async () => {
      console.log("👆 [UI] Usuario hizo clic en Instalar");
      await this.installation.startInstallation();
    });
  }

  setupSuccessScreen() {
    const launchBtn = document.getElementById('launch-bloom-btn');
    if (launchBtn) {
      launchBtn.addEventListener('click', async () => {
        console.log("👆 [UI] Usuario hizo clic en LANZAR"); 
        console.log("🔍 [Debug] API disponible:", !!this.api.launchGodMode);        
        await this.installation.launchProfile();
      });
    }
    
    const logsBtn = document.getElementById('final-view-logs-btn');
    if (logsBtn) {
      logsBtn.addEventListener('click', () => {
        console.log("👆 [UI] Usuario abrió carpeta de logs");
        this.api.openLogsFolder();
      });
    }

    const onboardingBtn = document.getElementById('start-onboarding-btn');
    if (onboardingBtn) {
      onboardingBtn.addEventListener('click', async () => {
        console.log("👆 [UI] Usuario inicia onboarding");
        
        const result = await this.api.launchBloomLauncher(true);
        
        if (result.success) {
          console.log("✅ Launcher abierto con onboarding");
          setTimeout(() => window.close(), 2000);
        } else {
          console.error("❌ Error abriendo launcher:", result.error);
        }
      });
    }
  }

  setupErrorScreen() {
    const retryBtn = document.getElementById('retry-button');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        console.log("👆 [UI] Usuario reintentó instalación");
        location.reload();
      });
    }
    
    const errorLogsBtn = document.getElementById('view-error-logs-btn');
    if (errorLogsBtn) {
      errorLogsBtn.addEventListener('click', () => {
        this.api.openLogsFolder();
      });
    }
  }
}

// ========================================================================
// 6. MAIN APP INITIALIZATION (Sin Cambios)
// ========================================================================
class BloomInstaller {
  constructor() {
    this.ui = null;
    this.installation = null;
    this.events = null;
  }

  async init() {
    try {
      if (!window.api) {
        throw new Error("API not loaded - preload.js failed");
      }

      console.log("🔧 [Installer] Inicializando...");

      // Instanciar managers
      this.ui = new UIManager();
      this.installation = new InstallationManager(window.api, this.ui);
      this.events = new EventListeners(window.api, this.ui, this.installation);

      // Inicializar UI
      const result = await this.installation.initialize();
      
      if (!result.success) {
        console.error("❌ [Installer] Inicialización falló:", result.error);
        return;
      }

      // Setup listeners
      this.events.setupAll();
      
      console.log("✅ [Installer] Sistema listo. Esperando acción del usuario.");

    } catch (error) {
      console.error("💥 [Installer] Error crítico en inicialización:", error);
      this.ui?.showError("Error crítico: " + error.message);
    }
  }
}

// Auto-init cuando el DOM esté listo
const app = new BloomInstaller();
app.init();