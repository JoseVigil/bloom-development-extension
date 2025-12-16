// installation-manager.js
// Maneja toda la lógica del proceso de instalación

export class InstallationManager {
  constructor(api, uiManager) {
    this.api = api;
    this.ui = uiManager;
    this.servicePort = 5678;
    this.systemInfo = null;
  }

  /**
   * Inicializa el sistema y carga información
   */
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

  /**
   * Inicia el proceso de instalación
   */
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

  /**
   * Instala y configura el servicio
   */
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

  /**
   * Prepara extensión para instalación manual
   */
  async prepareExtension() {
    const result = await this.api.installExtension();
    
    if (result.success) {
      return { success: true, crxPath: result.crxPath };
    } else {
      this.ui.showError("No se pudo preparar el archivo CRX: " + result.error);
      return { success: false, error: result.error };
    }
  }

  /**
   * Actualiza el ID de la extensión en el sistema
   */
  async updateExtensionId(extensionId) {
    const result = await this.api.updateExtensionId(extensionId);
    
    if (!result.success) {
      return { success: false, error: result.error };
    }
    
    return { success: true };
  }

  /**
   * Finaliza la configuración
   */
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

  getServicePort() {
    return this.servicePort;
  }
}