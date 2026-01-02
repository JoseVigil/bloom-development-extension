// installer/electron-app/launch/health-monitor.js
// Este archivo SOLO se ejecuta en el RENDERER (gracias al <script> en HTML)

if (typeof document === 'undefined') {
  console.warn('health-monitor.js loaded in wrong context (main process?). Skipping.');
} else {
  console.log('🏥 Health monitor initializing in renderer...');

  const getIPC = () => {
    if (window.api && window.api.invoke) return window.api;
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      return { invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args) };
    }
    return null;
  };

  async function runHealthMonitor() {
    const ipc = getIPC();
    if (!ipc) {
      console.warn('⚠️ IPC not available - skipping health check');
      return;
    }

    try {
      const onboardingStatus = await ipc.invoke('onboarding:status');
      
      if (!onboardingStatus.success || !onboardingStatus.completed) {
        console.log('⏳ Skipping health checks - onboarding pending');
        document.dispatchEvent(new CustomEvent('health:update', {
          detail: { status: 'pending-onboarding', issues: [] }
        }));
        return;
      }

      const result = await ipc.invoke('health:check');
      
      if (result.success) {
        document.dispatchEvent(new CustomEvent('health:update', {
          detail: { status: result.status, issues: result.issues || [] }
        }));
      }
    } catch (error) {
      console.error('❌ Error in health monitor:', error);
    }
  }

  // Ejecuta cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      runHealthMonitor();
      setInterval(runHealthMonitor, 30000);
    });
  } else {
    runHealthMonitor();
    setInterval(runHealthMonitor, 30000);
  }
}