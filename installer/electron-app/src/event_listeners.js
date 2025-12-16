// event-listeners.js
// Centraliza todos los event listeners de la aplicación

export class EventListeners {
  constructor(api, uiManager, installationManager, heartbeatManager, extensionInstaller) {
    this.api = api;
    this.ui = uiManager;
    this.installation = installationManager;
    this.heartbeat = heartbeatManager;
    this.extension = extensionInstaller;
  }

  /**
   * Configura todos los listeners globales
   */
  setupAll() {
    this.setupAPIListeners();
    this.setupWelcomeScreen();
    this.setupServiceScreen();
    this.setupManualInstallScreen();
    this.setupHandshakeScreen();
    this.setupSuccessScreen();
    this.setupErrorScreen();
  }

  /**
   * Listeners del API (progress, server status, etc.)
   */
  setupAPIListeners() {
    // Progreso de instalación
    this.api.onInstallationProgress((data) => {
      this.ui.updateProgress(data.step, data.total, data.message);
    });

    // Estado del servidor (botón "Configurar Bloom")
    this.api.onServerStatus((data) => {
      if (data.status === 'checking') {
        this.ui.setButtonState('open-onboarding-btn', true, 'Verificando...');
      }
    });
  }

  /**
   * Welcome Screen
   */
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

  /**
   * Service Screen
   */
  setupServiceScreen() {
    // Botón retry
    const retryBtn = document.getElementById('retry-service-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', async () => {
        this.ui.toggleElement('service-error', false);
        this.ui.toggleElement('service-status-container', true);
        await this.installation.installService();
      });
    }

    // Botón skip (si se necesita en algún momento)
    const skipBtn = document.getElementById('skip-service-btn');
    if (skipBtn) {
      skipBtn.addEventListener('click', () => {
        console.log('Service skipped');
        this.ui.showScreen('manual-install-screen');
      });
    }

    // Botón continuar a instalación manual
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

  /**
   * Manual Install Screen
   */
  setupManualInstallScreen() {
    // Setup drag & drop
    this.extension.setupDragAndDrop('draggable-crx');

    // Setup ID input
    this.extension.setupIdInput(
      'extension-id-input',
      'confirm-id-btn',
      'id-error-msg',
      (extensionId) => {
        // Callback cuando ID es válido
        this.ui.toggleElement('manual-connection-status', true);
        this.heartbeat.startManualPolling();
      }
    );

    // Botón abrir Chrome extensions
    const openChromeBtn = document.getElementById('open-chrome-ext-btn-manual');
    if (openChromeBtn) {
      openChromeBtn.addEventListener('click', () => {
        this.extension.openChromeExtensions();
      });
    }
  }

  /**
   * Handshake Screen
   */
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

  /**
   * Success Screen
   */
  setupSuccessScreen() {
    // Ver logs
    const logsBtn = document.getElementById('final-view-logs-btn');
    if (logsBtn) {
      logsBtn.addEventListener('click', () => {
        this.api.openLogsFolder();
      });
    }

    // Configurar Bloom (onboarding)
    const onboardingBtn = document.getElementById('open-onboarding-btn');
    if (onboardingBtn) {
      onboardingBtn.addEventListener('click', async () => {
        await this.api.openBTIPConfig();
        setTimeout(() => window.close(), 3000);
      });
    }
  }

  /**
   * Error Screen
   */
  setupErrorScreen() {
    const retryBtn = document.getElementById('retry-button');
    
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        location.reload();
      });
    }
  }
}