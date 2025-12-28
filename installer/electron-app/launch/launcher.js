const { checkHealthStatus, checkOnboardingStatus } = require('./health-monitor');
const { listProfiles, launchProfile } = require('./profile-manager');

/**
 * Inicializa el dashboard del modo Launch
 */
async function runLaunchMode(mainWindow) {
  try {
    console.log('🎨 Initializing dashboard...');

    // Verificar salud del sistema
    const health = await checkHealthStatus();
    mainWindow.webContents.send('health:status', health);

    if (health.status !== 'ok') {
      console.warn('⚠️ Health check failed:', health);
      mainWindow.webContents.send('dashboard:error', {
        type: 'health',
        message: 'System health check failed. Please resolve issues before continuing.',
        details: health
      });
      return;
    }

    // Verificar estado de onboarding
    const onboarding = await checkOnboardingStatus();
    mainWindow.webContents.send('onboarding:status', onboarding);

    if (!onboarding.completed) {
      console.log('📝 Onboarding incomplete, launching onboarding flow...');
      await launchProfile('bloom-worker-profile', 'http://localhost:48215/onboarding');
    }

    // Cargar lista de perfiles
    const profiles = await listProfiles();
    mainWindow.webContents.send('profiles:list', profiles);

    console.log('✅ Dashboard initialized successfully');
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