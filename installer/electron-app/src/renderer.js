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
// 2. INSTALLATION MANAGER
// ========================================================================
class InstallationManager {
  constructor(api, uiManager) {
    this.api = api;
    this.ui = uiManager;
    this.servicePort = 5678;
    this.systemInfo = null;
  }

  async initialize() {
    try {
      if (!this.api) throw new Error("API not loaded");
      
      this.systemInfo = await this.api.getSystemInfo();
      
      // Actualizar UI con info del sistema
      this.ui.updateText('install-path', this.systemInfo.paths.hostInstallDir);
      this.ui.setButtonState('start-button', false, 'Comenzar Instalación');
      
      return { success: true };
    } catch (error) {
      console.error("Init failed:", error);
      this.ui.setButtonState('start-button', true, 'Error de carga');
      return { success: false, error: error.message };
    }
  }

  async startInstallation() {
    this.ui.showScreen('installation-screen');
    
    const result = await this.api.startInstallation({ devMode: true });
    
    if (result.success) {
      return { success: true };
    } else {
      this.ui.showError(result.error);
      return { success: false, error: result.error };
    }
  }

  async installService() {
    if (!this.systemInfo) {
      return { success: false, error: 'System info not loaded' };
    }

    // Verificar dependencias VC++ en Windows
    if (this.systemInfo.platform === 'win32') {
      this.ui.updateText('service-status-text', 'Verificando dependencias...');
      
      const preflight = await this.api.preflightChecks();
      if (!preflight.vcRedistInstalled) {
        this.ui.updateText('service-status-text', 'Instalando dependencias VC++...');
        await this.api.installVCRedist();
      }
    }

    // Iniciar servicio
    this.ui.updateText('service-status-text', 'Iniciando servicio...');
    const result = await this.api.installService();

    if (result.success) {
      this.servicePort = result.port;
      this.ui.updateText('detected-port', result.port);
      this.ui.hideSpinner('service-status-container', 'service-result');
      return { success: true, port: result.port };
    } else {
      this.ui.updateText('service-error-text', result.error);
      this.ui.toggleElement('service-status-container', false);
      this.ui.toggleElement('service-error', true);
      return { success: false, error: result.error };
    }
  }

  async finalizeSetup(extensionId) {
    const result = await this.api.finalizeSetup({ 
      extensionId: extensionId,
      profiles: [] 
    });

    if (result.success) {
      this.ui.updateText('final-port', this.servicePort);
      return { success: true };
    } else {
      return { success: false, error: result.error };
    }
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
// 5. EVENT LISTENERS
// ========================================================================
class EventListeners {
  constructor(api, uiManager, installationManager, heartbeatManager, extensionInstaller) {
    this.api = api;
    this.ui = uiManager;
    this.installation = installationManager;
    this.heartbeat = heartbeatManager;
    this.extension = extensionInstaller;
  }

  setupAll() {
    this.setupAPIListeners();
    this.setupWelcomeScreen();
    this.setupServiceScreen();
    this.setupManualInstallScreen();
    this.setupHandshakeScreen();
    this.setupSuccessScreen();
    this.setupErrorScreen();
  }

  setupAPIListeners() {
    this.api.onInstallationProgress((data) => {
      this.ui.updateProgress(data.step, data.total, data.message);
    });

    this.api.onServerStatus((data) => {
      if (data.status === 'checking') {
        this.ui.setButtonState('open-onboarding-btn', true, 'Verificando...');
      }
    });
  }

  setupWelcomeScreen() {
    const startBtn = document.getElementById('start-button');
    if (startBtn) {
      startBtn.addEventListener('click', async () => {
        const result = await this.installation.startInstallation();
        if (result.success) {
          this.ui.showScreen('service-screen');
          await this.installation.installService();
        }
      });
    }
  }

  setupServiceScreen() {
    const retryBtn = document.getElementById('retry-service-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', async () => {
        this.ui.toggleElement('service-error', false);
        this.ui.toggleElement('service-status-container', true);
        await this.installation.installService();
      });
    }

    const skipBtn = document.getElementById('skip-service-btn');
    if (skipBtn) {
      skipBtn.addEventListener('click', () => {
        this.ui.showScreen('manual-install-screen');
      });
    }

    const continueBtn = document.getElementById('continue-from-service-btn');
    if (continueBtn) {
      continueBtn.addEventListener('click', async () => {
        this.ui.showScreen('manual-install-screen');
        const result = await this.extension.prepareCrxFile();
        if (result.success) {
          console.log('✅ CRX preparado:', result.path);
        }
      });
    }
  }

  setupManualInstallScreen() {
    this.extension.setupDragAndDrop('draggable-crx');
    
    this.extension.setupIdInput(
      'extension-id-input',
      'confirm-id-btn',
      'id-error-msg',
      (extensionId) => {
        this.ui.toggleElement('manual-connection-status', true);
        this.heartbeat.startManualPolling();
      }
    );

    const openChromeBtn = document.getElementById('open-chrome-ext-btn-manual');
    if (openChromeBtn) {
      openChromeBtn.addEventListener('click', () => {
        this.extension.openChromeExtensions();
      });
    }
  }

  setupHandshakeScreen() {
    const finishBtn = document.getElementById('finish-handshake-btn');
    if (finishBtn) {
      finishBtn.addEventListener('click', async () => {
        const result = await this.installation.finalizeSetup('kalbnicbomhpdljbnkfhmjnibfjeninc');
        if (result.success) {
          this.ui.showScreen('success-screen');
        } else {
          this.ui.showError(result.error);
        }
      });
    }
  }

  setupSuccessScreen() {
    const logsBtn = document.getElementById('final-view-logs-btn');
    if (logsBtn) {
      logsBtn.addEventListener('click', () => {
        this.api.openLogsFolder();
      });
    }

    const onboardingBtn = document.getElementById('open-onboarding-btn');
    if (onboardingBtn) {
      onboardingBtn.addEventListener('click', async () => {
        await this.api.openBTIPConfig();
        setTimeout(() => window.close(), 3000);
      });
    }
  }

  setupErrorScreen() {
    const retryBtn = document.getElementById('retry-button');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        location.reload();
      });
    }
  }
}

// ========================================================================
// 6. MAIN APP INITIALIZATION
// ========================================================================
class BloomInstaller {
  constructor() {
    this.ui = null;
    this.installation = null;
    this.heartbeat = null;
    this.extension = null;
    this.events = null;
  }

  async init() {
    try {
      if (!window.api) {
        throw new Error("API not loaded");
      }

      this.ui = new UIManager();
      this.installation = new InstallationManager(window.api, this.ui);
      this.heartbeat = new HeartbeatManager(window.api, this.ui);
      this.extension = new ExtensionInstaller(window.api, this.ui);
      this.events = new EventListeners(
        window.api,
        this.ui,
        this.installation,
        this.heartbeat,
        this.extension
      );

      const result = await this.installation.initialize();
      
      if (!result.success) {
        console.error("Failed to initialize:", result.error);
        return;
      }

      this.events.setupAll();
      console.log('✅ Bloom Installer inicializado correctamente');

    } catch (error) {
      console.error("❌ Error crítico en inicialización:", error);
      this.ui?.showError("Error crítico: " + error.message);
    }
  }
}

const app = new BloomInstaller();
app.init();