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

    // Escuchar eventos de progreso del backend
    window.api.on('installation-progress', (data) => {
      console.log(`[Progress] ${data.percentage}% - ${data.message}`);
      
      const fillEl = document.getElementById('progress-fill');
      const textEl = document.getElementById('progress-text');
      const detailsEl = document.getElementById('installation-details');
      
      if (fillEl) fillEl.style.width = data.percentage + '%';
      if (textEl) textEl.textContent = data.message;
      
      if (detailsEl) {
        detailsEl.innerHTML = data.detail 
          ? `<p style="color: #4299e1;">• ${data.detail}</p>`
          : '';
      }
    }); // ✅ Cierre del callback

    try {
      // 1. INSTALAR (el backend emite eventos)
      const result = await this.api.installService();
      
      if (!result.success) {
        const errorMsg = result.error?.message || result.error || 'Installation failed';
        throw new Error(errorMsg);
      }

      this.extensionId = result.extensionId || result.extension_id || null;
      this.profileId = result.profileId || result.profile_id;
      
      console.log("✅ [AUTO] Instalación completa");
      
      // 2. MOSTRAR PANTALLA DE HEARTBEAT
      // NOTA: NO llamamos launchGodMode(). El installer ya ejecutó
      // "nucleus synapse launch" en launchMasterProfile() (paso 9/9) y validó
      // que Sentinel está RUNNING. Llamarlo de nuevo causa "Sentinel daemon not ready".
      await this.sleep(1000);
      this.ui.showScreen('heartbeat-screen');
      this.ui.updateText('final-extension-id', this.extensionId);
      this.ui.updateText('final-profile-id', this.profileId);

      // 3. INICIAR HEARTBEAT (60 segundos de timeout)
      this.startHeartbeatMonitoring(60);

      return { success: true };
      
    } catch (error) {
      console.error("❌ [AUTO] Error:", error);
      this.ui.showError(error.message);
      return { success: false };
    }
  }

  async startHeartbeatMonitoring(maxSeconds = 60) {
  console.log("💓 [Heartbeat] Iniciando...");
  
  const statusEl = document.getElementById('heartbeat-counter');
  const dotEl = document.getElementById('heartbeat-dot');
  const detailsEl = document.getElementById('connection-details');
  const extIdEl = document.getElementById('heartbeat-extension-id');
  const profIdEl = document.getElementById('heartbeat-profile-id');
  
  // PASO 1: Delay inicial (Chrome iniciando)
  await this.sleep(3000);
  
  // PASO 2: Chrome iniciado
  if (statusEl) statusEl.textContent = '✓ Chrome iniciado correctamente';
  await this.sleep(1500);
  
  // PASO 3: Cargando extensión
  if (statusEl) statusEl.textContent = '⏳ Cargando extensión de Chrome...';
  await this.sleep(2000);
  
  // PASO 4: Extensión cargada
  if (statusEl) statusEl.textContent = '✓ Extensión cargada exitosamente';
  await this.sleep(1500);
  
  // PASO 5: Conectando con host
  if (statusEl) statusEl.textContent = '🔌 Estableciendo conexión con el host...';
  await this.sleep(2000);
  
  // PASO 6: Polling REAL de heartbeat TCP
  let attempts = 0;
  const interval = setInterval(async () => {
    attempts++;
    
    try {
      // ✅ ÚNICO CAMBIO: Consultar Brain Service en vez de extension
      const status = await this.api.checkBrainServiceStatus();
      
      // ✅ Verificar si hay profiles registrados
      if (status && status.registeredProfiles > 0) {
        clearInterval(interval);
        console.log("✅ [Heartbeat] ¡Host registrado en Brain Service!");
        console.log(`   Profiles registrados: ${status.registeredProfiles}`);
        
        // Cambiar dot a verde
        if (dotEl) {
          dotEl.classList.remove('red');
          dotEl.classList.add('green');
        }
        
        // Cambiar ripples a verde
        document.querySelectorAll('.ripple').forEach(ripple => {
          ripple.style.borderColor = '#48bb78';
        });
        
        // Mensaje de éxito
        if (statusEl) statusEl.textContent = '✓ Host conectado exitosamente';
        await this.sleep(1500);
        
        // Mostrar detalles
        if (detailsEl) {
          if (extIdEl) extIdEl.textContent = this.extensionId;
          if (profIdEl) profIdEl.textContent = this.profileId;
          detailsEl.style.display = 'block';
        }
        
        if (statusEl) {
          statusEl.textContent = '🎉 Sistema completamente conectado';
          statusEl.style.color = '#48bb78';
          statusEl.style.fontWeight = '600';
        }
        
        // Pausa final
        await this.sleep(3000);
        
        // Transición a Success
        this.ui.showScreen('connection-success-screen');
        
        // Habilitar botón de onboarding
        const onboardingBtn = document.getElementById('start-onboarding-btn');
        if (onboardingBtn) onboardingBtn.disabled = false;
        
        return;
      }
    } catch (error) {
      console.warn("⚠️ [Heartbeat] Check falló:", error.message);
    }
    
    // Timeout
    if (attempts >= maxSeconds) {
      clearInterval(interval);
      
      if (statusEl) {
        statusEl.innerHTML = '<strong style="color:#e53e3e;">❌ No se detectó conexión</strong><br>' +
          '<small>Verifica que Chrome abrió correctamente.</small>';
      }
      
      const retryBtn = document.getElementById('retry-heartbeat-btn');
      if (retryBtn) retryBtn.style.display = 'block';
    }
    
  }, 1000);
} // ✅ Cierre de setInterval

} // ✅ Cierre de startHeartbeatMonitoring

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