// installation_manager.js
// VERSIÓN CON BOTÓN DE REPARACIÓN INTEGRADO

export class InstallationManager {
  constructor(api, uiManager) {
    this.api = api;
    this.ui = uiManager;
    this.extensionId = null;
    this.profileId = null;
    this.brainDir = null;
  }

  /**
   * Inicializa la UI
   */
  async initialize() {
    this.ui.updateText('install-path', '%LOCALAPPDATA%\\BloomNucleus');
    this.ui.setButtonState('start-button', false, '🚀 INSTALAR BLOOM NUCLEUS');
    
    // Agregar listener para botón de reparación (si existe)
    const repairBtn = document.getElementById('repair-bridge-btn');
    if (repairBtn) {
      repairBtn.addEventListener('click', () => this.repairBridge());
    }
    
    return { success: true };
  }

  /**
   * INSTALACIÓN ATÓMICA
   */
  async startInstallation() {
    console.log("🚀 [AUTO] Iniciando flujo automático...");
    this.ui.showScreen('installation-screen');

    try {
      // 1. INSTALAR
      const result = await this.api.installService();
      if (!result.success) throw new Error(result.error);

      this.extensionId = result.extensionId;
      this.profileId = result.profileId;
      
      console.log("✅ [AUTO] Instalación completa");
      this.ui.updateProgress(100, 100, "¡Instalación completa!");
      await this.sleep(800);

      // 2. MOSTRAR SUCCESS CON HEARTBEAT
      this.ui.showScreen('success-screen');
      this.ui.updateText('final-extension-id', this.extensionId);
      this.ui.updateText('final-profile-id', this.profileId);
      
      // Mostrar botón de reparación (oculto por defecto)
      this.ui.toggleElement('repair-section', false);
      
      // 3. LANZAR CHROME AUTOMÁTICAMENTE
      console.log("🚀 [AUTO] Lanzando Chrome...");
      await this.sleep(500);
      
      const launchResult = await this.api.launchGodMode();
      if (!launchResult.success) {
        throw new Error("Error al lanzar Chrome: " + launchResult.error);
      }
      
      console.log("✅ [AUTO] Chrome lanzado, iniciando heartbeat...");
      
      // 4. MOSTRAR HEARTBEAT Y EMPEZAR POLLING
      this.ui.toggleElement('heartbeat-container', true);
      this.ui.toggleElement('launch-bloom-btn', false);
      this.startHeartbeatMonitoring();

      return { success: true };
      
    } catch (error) {
      console.error("❌ [AUTO] Error:", error);
      this.ui.showError(error.message);
      
      // Mostrar botón de reparación en caso de error
      this.ui.toggleElement('repair-section', true);
      
      return { success: false };
    }
  }

  /**
   * REPARAR BRIDGE (Nuevo)
   * Llama al backend para ejecutar repair-tools.js
   */
  async repairBridge() {
    console.log("🔧 [Repair] Iniciando reparación del bridge...");
    
    // Deshabilitar botón durante reparación
    const repairBtn = document.getElementById('repair-bridge-btn');
    if (repairBtn) {
      repairBtn.disabled = true;
      repairBtn.textContent = '🔧 Reparando...';
    }
    
    try {
      // Llamar al backend
      const result = await this.api.repairBridge();
      
      if (result.success) {
        console.log("✅ [Repair] Bridge reparado exitosamente");
        
        // Actualizar UI con nuevo Extension ID
        if (result.extensionId) {
          this.extensionId = result.extensionId;
          this.ui.updateText('final-extension-id', result.extensionId);
        }
        
        // Mostrar mensaje de éxito
        this.ui.showSuccessMessage('🎉 Bridge reparado. Intenta lanzar Chrome nuevamente.');
        
        // Re-habilitar botón de lanzamiento
        this.ui.toggleElement('launch-bloom-btn', true);
        
        // Ocultar botón de reparación
        this.ui.toggleElement('repair-section', false);
        
      } else {
        throw new Error(result.error || 'Error desconocido en reparación');
      }
      
    } catch (error) {
      console.error("❌ [Repair] Error:", error);
      this.ui.showError(`Error en reparación: ${error.message}`);
      
    } finally {
      // Re-habilitar botón
      if (repairBtn) {
        repairBtn.disabled = false;
        repairBtn.textContent = '🔧 Reparar Conexión';
      }
    }
  }

  /**
   * VALIDAR INSTALACIÓN (Nuevo)
   * Ejecuta diagnósticos y muestra resultados
   */
  async validateInstallation() {
    console.log("🔍 [Validation] Ejecutando validación...");
    
    try {
      const result = await this.api.validateInstallation();
      
      if (result.success) {
        console.log("✅ [Validation] Instalación válida");
        this.ui.showSuccessMessage('✅ Instalación válida - Todos los componentes OK');
      } else {
        console.warn("⚠️  [Validation] Instalación incompleta");
        
        // Mostrar detalles de qué falló
        const failedChecks = Object.entries(result.checks)
          .filter(([key, value]) => !value)
          .map(([key]) => key);
        
        this.ui.showWarning(`Componentes faltantes: ${failedChecks.join(', ')}`);
        
        // Ofrecer reparación
        this.ui.toggleElement('repair-section', true);
      }
      
      return result;
      
    } catch (error) {
      console.error("❌ [Validation] Error:", error);
      this.ui.showError(`Error en validación: ${error.message}`);
      return { success: false };
    }
  }

  startHeartbeatMonitoring() {
    console.log("💓 [Heartbeat] Iniciando...");
    
    let attempts = 0;
    const maxAttempts = 120;
    
    const interval = setInterval(async () => {
      attempts++;
      
      // Animar dot
      const dot = document.getElementById('heartbeat-dot');
      if (dot) {
        dot.style.opacity = dot.style.opacity === '0.5' ? '1' : '0.5';
      }
      
      this.ui.updateText('heartbeat-status', 
        `Esperando conexión... (${attempts}/${maxAttempts})`
      );
      
      // Verificar conexión
      try {
        const status = await this.api.checkExtensionHeartbeat();
        
        if (status && status.chromeConnected) {
          clearInterval(interval);
          console.log("✅ [Heartbeat] ¡CONECTADO!");
          
          // Cambiar a verde
          if (dot) {
            dot.classList.remove('red');
            dot.classList.add('green');
          }
          
          // Mostrar success
          this.ui.toggleElement('heartbeat-container', false);
          this.ui.toggleElement('connection-success', true);
          
          // REDIRIGIR A ONBOARDING
          setTimeout(() => {
            console.log("🌐 [Redirect] Abriendo onboarding...");
            this.api.openExternal('http://localhost:5678');
            
            // Cerrar instalador después de 3 segundos
            setTimeout(() => window.close(), 3000);
          }, 1500);
          
          return;
        }
      } catch (error) {
        console.warn("⚠️  [Heartbeat] Check falló:", error.message);
      }
      
      // Timeout
      if (attempts >= maxAttempts) {
        clearInterval(interval);
        this.ui.updateHTML('heartbeat-status', 
          '<strong style="color:#e53e3e;">No se detectó conexión</strong><br>' +
          '<small>Verifica que Chrome abrió correctamente</small>'
        );
        
        // Mostrar opción de reparación
        this.ui.toggleElement('repair-section', true);
      }
      
    }, 1000);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  showSuccessScreen() {
    this.ui.showScreen('success-screen');
    this.ui.updateText('final-extension-id', this.extensionId || 'N/A');
    this.ui.updateText('final-profile-id', this.profileId || 'N/A');
    this.ui.updateText('final-brain-dir', this.brainDir || 'N/A');
    console.log("✅ [Modo Dios] Instalación finalizada con éxito");
  }

  async launchProfile() {
    console.log("🚀 [Launch] Iniciando Chrome con perfil maestro...");
    this.ui.setButtonState('launch-bloom-btn', true, 'Iniciando Chrome...');
    
    try {
      const result = await this.api.launchGodMode();
      
      if (!result.success) {
        throw new Error(result.error || "Error al lanzar perfil");
      }
      
      this.ui.toggleElement('heartbeat-container', true);
      this.startHeartbeatMonitoring();
      console.log("✅ [Launch] Comando enviado. Chrome debería abrir ahora.");
      
    } catch (error) {
      console.error("❌ [Launch] Error:", error);
      alert("Error al lanzar Chrome: " + error.message);
      this.ui.setButtonState('launch-bloom-btn', false, '🚀 REINTENTAR');
      
      // Mostrar opción de reparación
      this.ui.toggleElement('repair-section', true);
    }
  }

  onHeartbeatSuccess() {
    console.log("✅ [Heartbeat] ¡Conexión detectada!");
    this.ui.setHeartbeatState('heartbeat-dot', true);
    this.ui.toggleElement('heartbeat-container', false);
    this.ui.toggleElement('connection-success', true);
    
    setTimeout(() => {
      console.log("🚪 [Installer] Cerrando automáticamente...");
      window.close();
    }, 5000);
  }

  onHeartbeatTimeout() {
    console.warn("⏱️ [Heartbeat] Timeout alcanzado");
    
    this.ui.updateHTML('heartbeat-status', `
      <strong style="color: #e53e3e;">No se detectó conexión</strong><br>
      <span style="font-size: 12px;">
        Verifica que Chrome abrió correctamente.<br>
        Intenta la opción de reparación abajo.
      </span>
    `);
    
    this.ui.setHeartbeatState('heartbeat-dot', false);
    
    // Mostrar sección de reparación
    this.ui.toggleElement('repair-section', true);
  }

  showErrorScreen(error) {
    this.ui.showScreen('error-screen');
    this.ui.updateText('error-message', error.message || "Error desconocido");
    this.ui.updateText('error-stack', error.stack || "Sin stack trace disponible");
    
    // Mostrar botón de reparación en pantalla de error
    this.ui.toggleElement('repair-section', true);
  }
}