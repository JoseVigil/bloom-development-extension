// renderer.js
// Script principal consolidado - Contiene toda la lógica del frontend

// ========================================================================
// 1. UI MANAGER
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
// INSTALLATION MANAGER - FLUJO AUTOMÁTICO COMPLETO
// Reemplaza la clase completa en renderer.js (líneas ~80-150)
// ========================================================================
class InstallationManager {
  constructor(api, uiManager) {
    this.api = api;
    this.ui = uiManager;
    this.extensionId = null;
    this.profileId = null;
  }

  async initialize() {
    this.ui.updateText('install-path', '%LOCALAPPDATA%\\BloomNucleus');
    this.ui.setButtonState('start-button', false, '🚀 INSTALAR BLOOM NUCLEUS');
    return { success: true };
  }

  async startInstallation() {
    console.log("🚀 [AUTO] Iniciando flujo automático...");
    this.ui.showScreen('installation-screen');

    try {
      // PASO 1: INSTALAR TODO
      console.log("📦 [AUTO] Llamando backend...");
      const result = await this.api.installService();
      
      if (!result.success) {
        throw new Error(result.error || "Error en instalación");
      }

      this.extensionId = result.extensionId;
      this.profileId = result.profileId;
      
      console.log("✅ [AUTO] Backend completó instalación");
      console.log("📊 Extension:", this.extensionId);
      console.log("📊 Profile:", this.profileId);
      
      this.ui.updateProgress(100, 100, "¡Instalación completa!");
      await this.sleep(800);

      // PASO 2: MOSTRAR PANTALLA SUCCESS
      console.log("🎨 [AUTO] Mostrando success screen...");
      this.ui.showScreen('success-screen');
      this.ui.updateText('final-extension-id', this.extensionId);
      this.ui.updateText('final-profile-id', this.profileId);
      
      await this.sleep(500);

      // PASO 3: LANZAR CHROME AUTOMÁTICAMENTE
      console.log("🚀 [AUTO] Lanzando Chrome automáticamente...");
      const launchResult = await this.api.launchGodMode();
      
      if (!launchResult.success) {
        throw new Error("Chrome no pudo iniciar: " + launchResult.error);
      }
      
      console.log("✅ [AUTO] Chrome ejecutado, PID:", launchResult.output);

      // PASO 4: OCULTAR BOTÓN Y MOSTRAR HEARTBEAT
      console.log("💓 [AUTO] Activando heartbeat...");
      const launchBtn = document.getElementById('launch-bloom-btn');
      if (launchBtn) launchBtn.style.display = 'none';
      
      this.ui.toggleElement('heartbeat-container', true);
      this.startHeartbeatMonitoring();

      return { success: true };
      
    } catch (error) {
      console.error("❌ [AUTO] Error en flujo:", error);
      this.ui.showError(error.message);
      return { success: false };
    }
  }

  startHeartbeatMonitoring() {
    console.log("💓 [Heartbeat] Iniciando polling...");
    
    let attempts = 0;
    const maxAttempts = 60;
    
    const interval = setInterval(async () => {
      attempts++;
      
      // Animar dot (titilante)
      const dot = document.getElementById('heartbeat-dot');
      if (dot) {
        dot.style.opacity = dot.style.opacity === '0.5' ? '1' : '0.5';
      }
      
      this.ui.updateText('heartbeat-status', 
        `Esperando conexión con Chrome... (${attempts}/${maxAttempts})`
      );
      
      // Verificar si extension conectó
      try {
        const status = await this.api.checkExtensionHeartbeat();
        console.log(`💓 [Heartbeat] Intento ${attempts}:`, status);
        
        if (status && status.chromeConnected) {
          clearInterval(interval);
          console.log("✅ [Heartbeat] ¡CONEXIÓN DETECTADA!");
          
          // Cambiar dot a verde
          if (dot) {
            dot.classList.remove('red');
            dot.classList.add('green');
            dot.style.opacity = '1';
          }
          
          // Ocultar heartbeat, mostrar success badge
          this.ui.toggleElement('heartbeat-container', false);
          this.ui.toggleElement('connection-success', true);
          
          // Abrir onboarding después de 1.5s
          setTimeout(() => {
            console.log("🌐 [Redirect] Abriendo localhost:5678...");
            this.api.openExternal('http://localhost:5678');
            
            // Cerrar instalador después de 3s
            setTimeout(() => {
              console.log("🏁 [Installer] Cerrando aplicación...");
              window.close();
            }, 3000);
          }, 1500);
          
          return;
        }
      } catch (error) {
        console.warn(`⚠️ [Heartbeat] Check ${attempts} falló:`, error.message);
      }
      
      // Timeout
      if (attempts >= maxAttempts) {
        clearInterval(interval);
        console.error("❌ [Heartbeat] Timeout alcanzado");
        
        this.ui.updateHTML('heartbeat-status', 
          '<strong style="color:#e53e3e;">No se detectó conexión después de 60 segundos</strong><br>' +
          '<small>Verifica que Chrome abrió y la extensión está activa</small>'
        );
        
        if (dot) {
          dot.classList.add('red');
          dot.style.opacity = '1';
        }
      }
      
    }, 1000);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ========================================================================
// 3. HEARTBEAT MANAGER
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

  startManualPolling() {
    console.log('🔄 Iniciando polling de heartbeat (manual)...');
    this.attempts = 0;
    
    this.interval = setInterval(async () => {
      this.attempts++;
      
      this.ui.updateText('heartbeat-status', 
        `Intento ${this.attempts}/${this.maxAttempts} - Esperando señal de Chrome...`
      );
      
      const status = await this.api.checkExtensionHeartbeat();
      
      if (status.chromeConnected) {
        console.log('✅ ¡Conexión detectada!');
        this.stop();
        return { success: true };
      }
      
      if (this.attempts >= this.maxAttempts) {
        this.stop();
        const error = 'Timeout: La extensión no se conectó en 90 segundos.\n\n' +
                      'Verifica que:\n' +
                      '1. Instalaste la extensión en Chrome\n' +
                      '2. La extensión está habilitada\n' +
                      '3. El servicio está corriendo';
        this.ui.showError(error);
      }
    }, this.pollInterval);
  }

  startHandshakePolling(onSuccess) {
    console.log('🔄 Iniciando polling de handshake (enterprise)...');
    this.attempts = 0;
    const MAX_ATTEMPTS = 30;
    const POLL_INTERVAL = 3000;
    
    this.interval = setInterval(async () => {
      this.attempts++;
      
      this.ui.animateHeartbeat('heartbeat-dot');
      
      this.ui.updateHTML('step2-message', `
        <p>Validando conexión con Chrome...</p>
        <p style="font-size: 12px; color: #a0aec0; margin-top: 5px;">
          Intento ${this.attempts}/${MAX_ATTEMPTS}
        </p>
      `);
      
      const status = await this.api.checkExtensionHeartbeat();
      
      if (status.chromeConnected) {
        this.stop();
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
                      '2. El registro se aplicó correctamente\n' +
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
// 4. EXTENSION INSTALLER (Versión Corregida en renderer.js)
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
      // LOG IMPORTANTE: Verificamos que tenemos la ruta
      console.log('📦 Archivo listo en:', this.currentCrxPath);
      return { success: true, path: result.crxPath };
    } else {
      this.ui.showError("No se pudo preparar el archivo CRX: " + result.error);
      return { success: false, error: result.error };
    }
  }

  // ESTA ES LA FUNCIÓN QUE CAMBIA
  setupDragAndDrop(elementId) {
    const cardEl = document.getElementById(elementId);
    
    // Verificación de seguridad
    if (!cardEl) {
      console.error(`❌ ERROR CRÍTICO: No encontré el elemento con ID '${elementId}'`);
      return;
    }

    console.log('✅ Elemento encontrado, configurando click para:', elementId);

    // 1. Estilo visual
    cardEl.style.cursor = 'pointer';
    cardEl.removeAttribute('draggable'); // Quitamos el drag viejo

    // 2. Limpiamos listeners viejos clonando el nodo
    const newElement = cardEl.cloneNode(true);
    cardEl.parentNode.replaceChild(newElement, cardEl);

    // 3. Agregamos el evento CLICK
    newElement.addEventListener('click', () => {
      console.log('🖱️ CLICK DETECTADO. Ruta actual:', this.currentCrxPath);
      
      if (this.currentCrxPath && this.currentCrxPath.length > 0) {
        // Llamada a la API
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
// EVENT LISTENERS SIMPLIFICADOS
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

  /**
   * WELCOME SCREEN: Solo botón "Instalar"
   */
  setupWelcomeScreen() {
    const startBtn = document.getElementById('start-button');
    if (!startBtn) return;
    
    startBtn.addEventListener('click', async () => {
      console.log("👆 [UI] Usuario hizo clic en Instalar");
      await this.installation.startInstallation();
    });
  }

  /**
   * SUCCESS SCREEN: Botón "Lanzar" + "Ver Logs"
   */
  setupSuccessScreen() {
    // Botón de lanzamiento
    const launchBtn = document.getElementById('launch-bloom-btn');
    if (launchBtn) {
      launchBtn.addEventListener('click', async () => {
        console.log("👆 [UI] Usuario hizo clic en LANZAR"); 
        console.log("🔍 [Debug] API disponible:", !!this.api.launchGodMode);        
        await this.installation.launchProfile();
      });
    }
    
    // Botón de logs
    const logsBtn = document.getElementById('final-view-logs-btn');
    if (logsBtn) {
      logsBtn.addEventListener('click', () => {
        console.log("👆 [UI] Usuario abrió carpeta de logs");
        this.api.openLogsFolder();
      });
    }
  }

  /**
   * ERROR SCREEN: Botón "Reintentar" + "Ver Logs"
   */
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
// MAIN APP INITIALIZATION
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

      console.log("🔧 [Installer] Inicializando Modo Dios...");

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