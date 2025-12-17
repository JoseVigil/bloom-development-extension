// heartbeat-manager.js
// Maneja toda la lógica de polling y verificación de conexión

export class HeartbeatManager {
  constructor(api, uiManager) {
    this.api = api;
    this.ui = uiManager;
    this.interval = null;
    this.attempts = 0;
    this.maxAttempts = 45;
    this.pollInterval = 2000;
  }

  /**
   * Inicia el polling de heartbeat (versión manual)
   */
  startManualPolling() {
    console.log('🔄 Iniciando polling de heartbeat (manual)...');
    this.attempts = 0;
    
    this.interval = setInterval(async () => {
      this.attempts++;
      
      // Actualizar UI
      this.ui.updateText('heartbeat-status', 
        `Intento ${this.attempts}/${this.maxAttempts} - Esperando señal de Chrome...`
      );
      
      // Verificar conexión
      const status = await this.api.checkExtensionHeartbeat();
      
      if (status.chromeConnected) {
        console.log('✅ ¡Conexión detectada!');
        this.stop();
        return { success: true };
      }
      
      // Timeout
      if (this.attempts >= this.maxAttempts) {
        this.stop();
        const error = 'Timeout: La extensión no se conectó en 90 segundos.\n\n' +
                      'Verifica que:\n' +
                      '1. Instalaste la extensión en Chrome\n' +
                      '2. La extensión está habilitada\n' +
                      '3. El servicio está corriendo';
        this.ui.showError(error);
        return { success: false, error };
      }
    }, this.pollInterval);
  }

  /**
   * Inicia el polling de handshake (versión enterprise)
   */
  startHandshakePolling(onSuccess) {
      console.log('🔄 Iniciando validación estricta de conexión...');
      this.attempts = 0;
      const MAX_ATTEMPTS = 60; // 60 intentos
      const POLL_INTERVAL = 1000; // 1 segundo (más rápido)
      
      // Actualizamos la UI inicial del handshake
      this.ui.updateHTML('step2-message', `
          <strong>Esperando a Chrome...</strong>
          <ul style="text-align:left; margin-top:10px; font-size:13px; color:#4a5568;">
              <li>1. Ve a <code>chrome://extensions</code></li>
              <li>2. Busca "Bloom Nucleus"</li>
              <li>3. <b>Haz clic en el icono de Recargar (⟳)</b></li>
          </ul>
      `);

      this.interval = setInterval(async () => {
        this.attempts++;
        this.ui.animateHeartbeat('heartbeat-dot');
        
        // Chequeo real
        const status = await this.api.checkExtensionHeartbeat();
        
        if (status.chromeConnected) {
          this.stop();
          // Feedback visual inmediato
          this.ui.setHeartbeatState('heartbeat-dot', true);
          this.ui.updateText('handshake-title', '¡Conexión Exitosa!');
          
          // Pequeño delay para que el usuario vea el check verde antes de cambiar
          setTimeout(() => {
              if (onSuccess) onSuccess();
          }, 1000);
          return;
        }
        
        // Manejo del Timeout (Error bloqueante)
        if (this.attempts >= MAX_ATTEMPTS) {
          this.stop();
          this.ui.showError(
              "No se detectó la conexión con Chrome.\n\n" +
              "El instalador no puede continuar sin verificar que la extensión funcione.\n" +
              "Asegúrate de haber recargado la extensión y que el ID sea correcto."
          );
        }
      }, POLL_INTERVAL);
  }

  /**
   * Detiene el polling
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      this.attempts = 0;
    }
  }

  /**
   * Reinicia el contador
   */
  reset() {
    this.stop();
    this.attempts = 0;
  }

  /**
   * Configura parámetros personalizados
   */
  configure(maxAttempts, pollInterval) {
    this.maxAttempts = maxAttempts;
    this.pollInterval = pollInterval;
  }
}
