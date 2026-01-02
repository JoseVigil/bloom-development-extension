// renderer_launch.js - Universal version
console.log('🚀 Renderer launch loaded');

// Espera a que window.api esté disponible (si existe preload)
// O usa ipcRenderer directamente (si nodeIntegration: true)
const getAPI = () => {
  if (window.api) return window.api;
  if (window.require) {
    const { ipcRenderer } = window.require('electron');
    return {
      on: (channel, callback) => ipcRenderer.on(channel, (e, ...args) => callback(...args))
    };
  }
  console.error('❌ No IPC available');
  return null;
};

document.addEventListener('DOMContentLoaded', () => {
  const api = getAPI();
  if (!api) {
    console.error('❌ Cannot initialize - no IPC bridge available');
    return;
  }

  // Listen for initialization
  api.on('app:initialized', (data) => {
    console.log('📨 App initialized:', data);
    
    if (data.needsOnboarding) {
      console.log('⏳ Onboarding needed - waiting for show-onboarding event');
    }
  });

  // CRITICAL: Listen for onboarding trigger
  api.on('show-onboarding', () => {
    console.log('📨 Received show-onboarding - redirecting to onboarding UI');
    
    // Hide dashboard
    const dashboard = document.querySelector('.dashboard-container');
    if (dashboard) {
      dashboard.style.display = 'none';
    }
    
    // Show spinner
    let spinner = document.getElementById('onboarding-spinner');
    if (!spinner) {
      spinner = document.createElement('div');
      spinner.id = 'onboarding-spinner';
      spinner.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(15,15,15,0.95); z-index: 9999; display: flex; align-items: center; justify-content: center; flex-direction: column;';
      spinner.innerHTML = `
        <div style="width: 60px; height: 60px; border: 4px solid #8b5cf6; border-top: 4px solid transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div>
        <p style="margin-top: 24px; color: #fff; font-size: 16px;">Loading Onboarding Wizard...</p>
        <p style="margin-top: 12px; color: #a1a1aa; font-size: 14px;">Opening at http://localhost:5173/onboarding</p>
      `;
      document.body.appendChild(spinner);
    }
    spinner.style.display = 'flex';
    
    // Redirect to onboarding
    setTimeout(() => {
      window.location.href = 'http://localhost:5173/onboarding';
    }, 500);
  });
});