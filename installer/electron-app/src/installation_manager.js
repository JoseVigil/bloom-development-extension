// installation_manager.js
// VERSIÓN MODO DIOS: Instalación atómica sin pasos intermedios

export class InstallationManager {
  constructor(api, uiManager) {
    this.api = api;
    this.ui = uiManager;
    this.extensionId = null;
    this.profileId = null;
    this.brainDir = null;
  }

  /**
   * Inicializa la UI (ya no necesita system info compleja)
   */
  async initialize() {
    this.ui.updateText('install-path', '%LOCALAPPDATA%\\BloomNucleus');
    this.ui.setButtonState('start-button', false, '🚀 INSTALAR BLOOM NUCLEUS');
    return { success: true };
  }

  /**
   * INSTALACIÓN ATÓMICA
   * Un solo paso que hace TODO en el backend
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
      this.ui.toggleElement('launch-bloom-btn', false); // Ocultar botón
      this.startHeartbeatMonitoring();

      return { success: true };
      
    } catch (error) {
      console.error("❌ [AUTO] Error:", error);
      this.ui.showError(error.message);
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
        console.warn("⚠️ [Heartbeat] Check falló:", error.message);
      }
      
      // Timeout
      if (attempts >= maxAttempts) {
        clearInterval(interval);
        this.ui.updateHTML('heartbeat-status', 
          '<strong style="color:#e53e3e;">No se detectó conexión</strong><br>' +
          '<small>Verifica que Chrome abrió correctamente</small>'
        );
      }
      
    }, 1000);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Muestra la pantalla de éxito con datos reales
   */
  showSuccessScreen() {
    this.ui.showScreen('success-screen');
    
    // Actualizar datos en la UI
    this.ui.updateText('final-extension-id', this.extensionId || 'N/A');
    this.ui.updateText('final-profile-id', this.profileId || 'N/A');
    this.ui.updateText('final-brain-dir', this.brainDir || 'N/A');
    
    console.log("✅ [Modo Dios] Instalación finalizada con éxito");
  }

  /**
   * LANZAMIENTO DEL PERFIL MAESTRO
   */
  async launchProfile() {
    console.log("🚀 [Launch] Iniciando Chrome con perfil maestro...");
    
    // 1. Deshabilitar botón durante lanzamiento
    this.ui.setButtonState('launch-bloom-btn', true, 'Iniciando Chrome...');
    
    try {
      // 2. Invocar backend
      const result = await this.api.launchGodMode();
      
      if (!result.success) {
        throw new Error(result.error || "Error al lanzar perfil");
      }
      
      // 3. Mostrar heartbeat
      this.ui.toggleElement('heartbeat-container', true);
      this.startHeartbeatMonitoring();
      
      console.log("✅ [Launch] Comando enviado. Chrome debería abrir ahora.");
      
    } catch (error) {
      console.error("❌ [Launch] Error:", error);
      alert("Error al lanzar Chrome: " + error.message);
      this.ui.setButtonState('launch-bloom-btn', false, '🚀 REINTENTAR');
    }
  }

  /**
   * MONITOREO POST-LAUNCH (Heartbeat Visual)
   */
  startHeartbeatMonitoring() {
    console.log("💓 [Heartbeat] Iniciando monitoreo de conexión...");
    
    let attempts = 0;
    const maxAttempts = 30; // 30 segundos
    
    const interval = setInterval(async () => {
      attempts++;
      
      // Animar el dot
      this.ui.animateHeartbeat('heartbeat-dot');
      
      // Actualizar contador
      this.ui.updateText('heartbeat-status', 
        `Intento ${attempts}/${maxAttempts} - Esperando señal de Chrome...`
      );
      
      // Verificar conexión (requiere handler en preload)
      try {
        const status = await this.api.checkExtensionHeartbeat();
        
        if (status && status.chromeConnected) {
          clearInterval(interval);
          this.onHeartbeatSuccess();
          return;
        }
      } catch (error) {
        console.warn("⚠️ [Heartbeat] Check falló:", error.message);
      }
      
      // Timeout
      if (attempts >= maxAttempts) {
        clearInterval(interval);
        this.onHeartbeatTimeout();
      }
      
    }, 1000);
  }

  /**
   * Callback cuando el heartbeat tiene éxito
   */
  onHeartbeatSuccess() {
    console.log("✅ [Heartbeat] ¡Conexión detectada!");
    
    // Cambiar dot a verde
    this.ui.setHeartbeatState('heartbeat-dot', true);
    
    // Ocultar heartbeat, mostrar success badge
    this.ui.toggleElement('heartbeat-container', false);
    this.ui.toggleElement('connection-success', true);
    
    // Opcional: Auto-cerrar después de 5 segundos
    setTimeout(() => {
      console.log("🏁 [Installer] Cerrando automáticamente...");
      window.close();
    }, 5000);
  }

  /**
   * Callback cuando el heartbeat expira
   */
  onHeartbeatTimeout() {
    console.warn("⏱️ [Heartbeat] Timeout alcanzado");
    
    this.ui.updateHTML('heartbeat-status', `
      <strong style="color: #e53e3e;">No se detectó conexión</strong><br>
      <span style="font-size: 12px;">
        Verifica que Chrome abrió correctamente.<br>
        Puedes cerrar el instalador e intentar más tarde.
      </span>
    `);
    
    // Mantener el dot rojo
    this.ui.setHeartbeatState('heartbeat-dot', false);
  }

  /**
   * Muestra pantalla de error con stack trace
   */
  showErrorScreen(error) {
    this.ui.showScreen('error-screen');
    this.ui.updateText('error-message', error.message || "Error desconocido");
    this.ui.updateText('error-stack', error.stack || "Sin stack trace disponible");
  }

  /**
   * Animación de los pasos durante la instalación
   */
  animateInstallationSteps() {
    const steps = [
      { id: 'detail-line-1', delay: 1000, text: '✓ Runtime Python copiado' },
      { id: 'detail-line-2', delay: 2000, text: '✓ Motor Brain instalado' },
      { id: 'detail-line-3', delay: 3000, text: '✓ Native Host registrado' },
      { id: 'detail-line-4', delay: 4000, text: '✓ Extension ID calculado' },
      { id: 'detail-line-5', delay: 5000, text: '✓ Perfil maestro creado' }
    ];
    
    steps.forEach(step => {
      setTimeout(() => {
        const el = document.getElementById(step.id);
        if (el) {
          el.textContent = step.text;
          el.style.color = '#48bb78';
        }
      }, step.delay);
    });
  }

  /**
   * Helper: Sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}