const INSTALL_STRATEGY = {
  MANUAL: 'manual',
  ENTERPRISE: 'enterprise'
};

// Toggle aquí para cambiar estrategia
const CURRENT_STRATEGY = INSTALL_STRATEGY.MANUAL;

const HEARTBEAT_CHECK_INTERVAL = 2000; // 2 segundos
const HEARTBEAT_MAX_ATTEMPTS = 45;     // 90 segundos total

module.exports = {
  INSTALL_STRATEGY,
  CURRENT_STRATEGY,
  HEARTBEAT_CHECK_INTERVAL,
  HEARTBEAT_MAX_ATTEMPTS
};