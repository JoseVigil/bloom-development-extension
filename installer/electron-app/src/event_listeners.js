// event_listeners.js

export class EventListeners {
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
    this.api.onInstallationProgress((data) => this.ui.updateProgress(data.step, data.total, data.message));
    this.api.onServerStatus((data) => {
      if (data.status === 'checking') this.ui.setButtonState('open-onboarding-btn', true, 'Verificando...');
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
    if (skipBtn) skipBtn.addEventListener('click', () => this.ui.showScreen('manual-install-screen'));

    const continueBtn = document.getElementById('continue-from-service-btn');
    if (continueBtn) {
      continueBtn.addEventListener('click', async () => {
        this.ui.showScreen('manual-install-screen');
        await this.extension.prepareCrxFile();
      });
    }
  }

  setupManualInstallScreen() {
    this.extension.setupDragAndDrop('draggable-crx');

    this.extension.setupIdInput(
      'extension-id-input',
      'confirm-id-btn',
      'id-error-msg',
      async (extensionId) => {
        // CALLBACK DE ÉXITO: El ID se guardó y el REGISTRO DE WINDOWS se creó.
        
        // Vamos directo al handshake.
        this.ui.showScreen('handshake-screen');
        
        this.heartbeat.startHandshakePolling(async () => {
          console.log("🚀 Handshake OK.");
          await this.installation.finalizeSetup(extensionId);
          this.ui.showScreen('success-screen');
          
          // Abrir dashboard automáticamente
          const port = this.installation.getServicePort();
          this.api.openExternal(`http://localhost:${port}`);
        });
      }
    );

    const openChromeBtn = document.getElementById('open-chrome-ext-btn-manual');
    if (openChromeBtn) {
      openChromeBtn.addEventListener('click', () => this.extension.openChromeExtensions());
    }
  }

  setupHandshakeScreen() {
    /* El botón manual ya no es estrictamente necesario si el polling funciona, 
       pero lo dejamos por si acaso */
    const finishBtn = document.getElementById('finish-handshake-btn');
    if (finishBtn) {
      finishBtn.addEventListener('click', () => this.ui.showScreen('success-screen'));
    }
  }

  setupSuccessScreen() {
    const logsBtn = document.getElementById('final-view-logs-btn');
    if (logsBtn) logsBtn.addEventListener('click', () => this.api.openLogsFolder());

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
    if (retryBtn) retryBtn.addEventListener('click', () => location.reload());
  }
}