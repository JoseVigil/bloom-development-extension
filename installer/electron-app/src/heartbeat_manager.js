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
    console.log('🔄 Iniciando polling de handshake (enterprise)...');
    this.attempts = 0;
    const MAX_ATTEMPTS = 30;
    const POLL_INTERVAL = 3000;
    
    this.interval = setInterval(async () => {
      this.attempts++;
      
      // Animación visual
      this.ui.animateHeartbeat('heartbeat-dot');
      
      // Actualizar contador
      this.ui.updateHTML('step2-message', `
        <p>Validando conexión con Chrome...</p>
        <p style="font-size: 12px; color: #a0aec0; margin-top: 5px;">
          Intento ${this.attempts}/${MAX_ATTEMPTS}
        </p>
      `);
      
      // Verificar estado
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
      
      // Timeout
      if (this.attempts >= MAX_ATTEMPTS) {
        this.stop();
        const error = `Timeout: Chrome no respondió después de ${MAX_ATTEMPTS * 3} segundos.\n` +
                      'Verifica:\n' +
                      '1. Chrome se cerró completamente antes de reabrir\n' +
                      '2. El registro se aplicó correctamente (ejecuta regedit como Admin)\n' +
                      '3. No hay políticas de dominio bloqueando extensiones';
        this.ui.showError(error);
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
