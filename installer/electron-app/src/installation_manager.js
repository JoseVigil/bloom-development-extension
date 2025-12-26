export class InstallationManager {
  constructor(api, uiManager) {
    this.api = api;
    this.ui = uiManager;
    this.servicePort = 5678;
    this.systemInfo = null;
    this.profileId = null; // ✅ NUEVO: Guardar ID del perfil
  }

  /**
   * FASE 1: Despliegue de Artefactos
   */
  async startInstallation() {
    this.ui.showScreen('installation-screen');
    
    const result = await this.api.startInstallation({ devMode: true });
    
    if (!result.success) {
      this.ui.showError(result.error);
      return { success: false, error: result.error };
    }
    
    return { success: true };
  }

  /**
   * FASE 2: Validar Motor IA
   */
  async validateEngine() {
    try {
      this.ui.updateText('service-status-text', 'Validando Bloom AI Engine...');
      
      const status = await this.api.checkBrainStatus();
      
      if (!status.success) {
        throw new Error('El motor IA no responde correctamente');
      }
      
      this.ui.updateText('service-status-text', '✅ Motor validado');
      return { success: true };
      
    } catch (error) {
      this.ui.showError(`Error validando motor: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * FASE 3: Crear Perfil "Modo Dios"
   */
  async createMasterProfile() {
    try {
      this.ui.updateText('service-status-text', 'Creando perfil maestro...');
      
      const result = await this.api.createMasterProfile();
      
      if (!result.success) {
        throw new Error(result.error);
      }
      
      this.profileId = result.profileId;
      this.ui.updateText('service-status-text', `✅ Perfil creado: ${this.profileId.substring(0, 8)}...`);
      
      return { success: true, profileId: this.profileId };
      
    } catch (error) {
      this.ui.showError(`Error creando perfil: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * FASE 4: Preparar Extensión (sin instalar aún)
   */
  async prepareExtension() {
    try {
      this.ui.updateText('service-status-text', 'Preparando extensión...');
      
      const result = await this.api.installExtension();
      
      if (!result.success) {
        throw new Error(result.error);
      }
      
      this.ui.updateText('service-status-text', '✅ Extensión lista');
      return { success: true, crxPath: result.crxPath };
      
    } catch (error) {
      this.ui.showError(`Error preparando extensión: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * FASE 5: Registrar Native Host (Estrategia APPEND)
   */
  async registerNativeHost(extensionId) {
    try {
      this.ui.updateText('service-status-text', 'Registrando Native Host...');
      
      const result = await this.api.updateExtensionId(extensionId);
      
      if (!result.success) {
        throw new Error(result.error);
      }
      
      this.ui.updateText('service-status-text', '✅ Host registrado');
      return { success: true };
      
    } catch (error) {
      this.ui.showError(`Error registrando host: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * FASE 6: Lanzar Chrome (El Host se inicia AHORA como hijo)
   */
  async launchMasterProfile() {
    try {
      if (!this.profileId) {
        throw new Error('No hay perfil creado');
      }
      
      this.ui.updateText('service-status-text', 'Lanzando Chrome...');
      
      const result = await this.api.launchMasterProfile(this.profileId);
      
      if (!result.success) {
        throw new Error(result.error);
      }
      
      this.ui.updateText('service-status-text', '✅ Chrome abierto');
      return { success: true };
      
    } catch (error) {
      this.ui.showError(`Error lanzando Chrome: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Flujo completo (llamado desde UI)
   */
  async runFullInstallation(extensionId) {
    // FASE 1: Despliegue
    let result = await this.startInstallation();
    if (!result.success) return result;
    
    this.ui.showScreen('service-screen');
    
    // FASE 2: Validar Motor
    result = await this.validateEngine();
    if (!result.success) return result;
    
    // FASE 3: Crear Perfil
    result = await this.createMasterProfile();
    if (!result.success) return result;
    
    // FASE 4: Preparar Extensión
    result = await this.prepareExtension();
    if (!result.success) return result;
    
    // FASE 5: Registrar Host
    result = await this.registerNativeHost(extensionId);
    if (!result.success) return result;
    
    // FASE 6: Lanzar Chrome (Host se inicia como hijo)
    result = await this.launchMasterProfile();
    if (!result.success) return result;
    
    return { success: true };
  }
}