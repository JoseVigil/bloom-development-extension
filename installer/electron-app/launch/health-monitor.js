const { execBrainCommand } = require('./brain-commands');

/**
 * Verifica el estado de salud del sistema
 */
async function checkHealthStatus() {
  try {
    const result = await execBrainCommand(['health', 'check-all', '--json']);
    return JSON.parse(result.stdout);
  } catch (error) {
    console.error('Health check failed:', error);
    return {
      status: 'error',
      error: error.message
    };
  }
}

/**
 * Verifica el estado del onboarding
 */
async function checkOnboardingStatus() {
  try {
    const result = await execBrainCommand(['health', 'onboarding-status', '--json']);
    return JSON.parse(result.stdout);
  } catch (error) {
    console.error('Onboarding status check failed:', error);
    return {
      completed: false,
      error: error.message
    };
  }
}

module.exports = {
  checkHealthStatus,
  checkOnboardingStatus
};