// installer/electron-app/launch/launcher.js
/**
 * Inicializa el dashboard del modo Launch
 * Versión corregida 2026 - Solo envía eventos al renderer
 * NO carga health-monitor aquí (se carga en renderer vía <script>)
 */
async function runLaunchMode(mainWindow) {
  try {
    console.log('🎨 Initializing dashboard in launch mode...');

    // Ya no hacemos checks aquí - todo se maneja en renderer o main.js
    // Solo notificamos al renderer que estamos listos para el dashboard

    mainWindow.webContents.send('dashboard:ready', {
      message: 'Launch mode initialized',
      timestamp: new Date().toISOString()
    });

    // Opcional: cargar lista de perfiles si la tienes en otro módulo que NO use renderer-only code
    // Si profile-manager.js solo usa brain CLI, está bien
    const { listProfiles } = require('./profile-manager');
    try {
      const profiles = await listProfiles();
      mainWindow.webContents.send('profiles:list', profiles);
    } catch (err) {
      console.warn('Could not load profiles:', err.message);
    }

    console.log('✅ Dashboard ready signal sent to renderer');
  } catch (error) {
    console.error('❌ Dashboard initialization failed:', error);
    mainWindow.webContents.send('dashboard:error', {
      type: 'init',
      message: 'Failed to initialize dashboard',
      error: error.message
    });
  }
}

module.exports = {
  runLaunchMode
};