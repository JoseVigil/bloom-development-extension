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
   * Instala y arranca el servicio, dejándolo listo para cuando se instale la extensión.
   */
  async installService() {
      if (!this.systemInfo) {
        return { success: false, error: 'System info not loaded' };
      }

      try {
        // 1. Verificar dependencias (VC++ en Windows)
        if (this.systemInfo.platform === 'win32') {
          this.ui.updateText('service-status-text', 'Verificando dependencias...');
          const preflight = await this.api.preflightChecks();
          
          if (!preflight.vcRedistInstalled) {
            this.ui.updateText('service-status-text', 'Instalando dependencias VC++...');
            await this.api.installVCRedist();
          }
        }

        // 2. Instalar y Arrancar el Servicio
        this.ui.updateText('service-status-text', 'Instalando e iniciando servicio...');
        
        // Asumimos que tu api.installService() hace la copia Y el arranque del proceso
        const result = await this.api.installService();

        if (result.success) {
          // Guardamos el puerto que nos devuelve el backend
          this.servicePort = result.port || 5678;
          
          // 3. ACTUALIZACIÓN UI: Éxito
          this.ui.updateText('service-status-text', 'Servicio activo y escuchando.');
          this.ui.updateText('detected-port', this.servicePort);
          
          // Ocultamos el spinner y mostramos el panel de resultado positivo
          this.ui.hideSpinner('service-status-container', 'service-result');
          
          console.log(`✅ Servicio instalado y corriendo en puerto ${this.servicePort}`);
          
          // Retornamos true para que el Instalador avance a la pantalla de la Extensión
          return { success: true, port: this.servicePort };

        } else {
          // Fallo en la instalación o arranque
          throw new Error(result.error || "No se pudo iniciar el servicio.");
        }

      } catch (error) {
        console.error("❌ Error en installService:", error);
        
        this.ui.updateText('service-error-text', error.message || error);
        this.ui.toggleElement('service-status-container', false);
        this.ui.toggleElement('service-error', true);
        
        return { success: false, error: error.message };
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