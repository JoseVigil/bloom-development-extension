// ============================================================================
// DISCOVERY - THIN UI
// ============================================================================

const CONFIG = {
  MAX_ATTEMPTS: 60,
  PING_INTERVAL: 1000,
  CLOSE_DELAY: 20000
};

class DiscoveryValidator {
  constructor() {
    this.extensionId = self.SYNAPSE_CONFIG?.extension_id;
    this.attemptCount = 0;
    this.isConnected = false;
    this.pingInterval = null;
    this.discoveryCompleted = false;

    this.statusDot = document.getElementById('status-dot');
    this.statusMessage = document.getElementById('status-message');
    this.attemptCountEl = document.getElementById('attempt-count');
    this.autoCloseNotice = document.getElementById('auto-close-notice');
    this.errorContainer = document.getElementById('error-container');
  }

  start() {
    console.log('[Discovery] Starting');

    this.releaseLock();

    if (!this.extensionId) {
      this.showError('Extension ID not available');
      return;
    }

    this.updateStatus('searching');
    this.setupStorageListener();
    this.startPinging();
  }

  setupStorageListener() {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.synapseStatus) {
        const status = changes.synapseStatus.newValue;
        if (!status) return;

        console.log('[Discovery] Storage:', status.command);

        if (status.command === 'system_ready') {
          this.handleSystemReady(status.payload);
        }
      }
    });
  }

  startPinging() {
    this.pingInterval = setInterval(() => {
      this.attemptCount++;
      this.updateAttemptCount();

      if (this.attemptCount > CONFIG.MAX_ATTEMPTS) {
        this.timeout();
        return;
      }

      this.sendPing();
    }, CONFIG.PING_INTERVAL);
  }

  sendPing() {
    if (!chrome.runtime?.id) return;

    chrome.runtime.sendMessage(
      { command: 'check_handshake_status' },
      (resp) => {
        if (chrome.runtime.lastError) return;
        if (resp?.handshake_confirmed) {
          this.handleSystemReady(resp);
        }
      }
    );
  }

  handleSystemReady(payload) {
    if (this.discoveryCompleted) return;

    this.discoveryCompleted = true;
    this.isConnected = true;
    clearInterval(this.pingInterval);

    console.log('[Discovery] ✓ SYSTEM_READY');

    this.updateStatus('connected');
    this.statusMessage.textContent = '✅ Extensión conectada';
    this.autoCloseNotice.style.display = 'block';

    if (payload.profile_id) {
      document.getElementById('profile-id').textContent = `Profile: ${payload.profile_id}`;
    }
    if (payload.profile_alias) {
      document.getElementById('profile-alias').textContent = `Alias: ${payload.profile_alias}`;
    }

    document.getElementById('timestamp').textContent = `Conectado: ${new Date().toLocaleTimeString()}`;

    this.notifyHost(payload);

    setTimeout(() => window.close(), CONFIG.CLOSE_DELAY);
  }

  notifyHost(payload) {
    chrome.runtime.sendMessage({
      event: 'DISCOVERY_COMPLETE',
      payload: {
        profile_id: self.SYNAPSE_CONFIG?.profileId,
        profile_alias: self.SYNAPSE_CONFIG?.profile_alias,
        launch_id: self.SYNAPSE_CONFIG?.launchId,
        timestamp: Date.now()
      }
    });
  }

  async releaseLock() {
    try {
      await chrome.storage.local.remove('discovery_open_lock');
      console.log('[Discovery] Lock released');
    } catch (e) {
      console.warn('[Discovery] Lock release failed:', e);
    }
  }

  timeout() {
    console.error('[Discovery] Timeout:', CONFIG.MAX_ATTEMPTS);
    clearInterval(this.pingInterval);
    this.showError(`Timeout después de ${CONFIG.MAX_ATTEMPTS} intentos`);
  }

  updateStatus(status) {
    this.statusDot.className = `status-dot ${status}`;

    const msgs = {
      searching: '🔍 Buscando extensión...',
      connected: '✅ Extensión conectada'
    };

    this.statusMessage.textContent = msgs[status] || '';
  }

  updateAttemptCount() {
    this.attemptCountEl.textContent = this.attemptCount;
  }

  showError(msg) {
    clearInterval(this.pingInterval);
    this.errorContainer.style.display = 'block';
    document.getElementById('error-message').textContent = msg;
  }
}

// ============================================================================
// INIT
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  await chrome.storage.local.remove('discovery_open_lock');
  window.BLOOM_VALIDATOR = new DiscoveryValidator();
  window.BLOOM_VALIDATOR.start();
});