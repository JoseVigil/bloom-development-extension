// installation_manager.js
// Maneja la UI durante la instalación "Zero Config"

export class InstallationManager {
  constructor(api, uiManager) {
    this.api = api;
    this.ui = uiManager;
  }

  /**
   * Inicializa la UI con datos básicos
   */
  async initialize() {
    // Ya no necesitamos pedir info del sistema compleja, sabemos que va a %LOCALAPPDATA%
    this.ui.updateText('install-path', '%LOCALAPPDATA%\\BloomNucleus');
    this.ui.setButtonState('start-button', false, 'Instalar Bloom Nucleus');
    return { success: true };
  }

  /**
   * Ejecuta la instalación completa (Atomic Operation)
   * Delega todo el trabajo sucio al proceso principal (main.js)
   */
  async startInstallation() {
    console.log("🚀 Iniciando instalación Modo Dios...");
    
    // 1. Cambiar a pantalla de progreso
    this.ui.showScreen('installation-screen');
    this.ui.updateProgress(10, 100, "Iniciando despliegue de componentes...");

    try {
      // 2. LLAMADA ÚNICA AL BACKEND
      // main.js se encarga de: Copiar archivos -> Configurar Python -> Registrar Host -> Crear Perfil
      const result = await this.api.installService();

      if (result.success) {
        // 3. ÉXITO
        this.ui.updateProgress(100, 100, "¡Configuración completa!");
        
        // Transición a pantalla final
        this.ui.showScreen('success-screen');
        
        // Mostrar datos reales devueltos por el backend
        this.ui.updateHTML('final-status-list', `
            <li>Motor IA: <strong>Instalado</strong></li>
            <li>Extension ID: <code>${result.extensionId || 'Calculado'}</code></li>
            <li>Perfil Maestro: <code>${result.profileId || 'Creado'}</code></li>
        `);
        
        return { success: true };
      } else {
        // 4. ERROR CONTROLADO
        throw new Error(result.error);
      }

    } catch (error) {
      console.error("Installation failed:", error);
      this.ui.showError(error.message || "Error desconocido en la instalación.");
      return { success: false, error: error.message };
    }
  }
}