// ============================================================================
// APPLICATION CONSTANTS
// ============================================================================

const IS_DEV = process.env.NODE_ENV === 'development';
const IS_LAUNCH_MODE = process.argv.includes('--mode=launch');
const APP_VERSION = '1.0.0';

const SERVICE_NAME = 'BloomNucleusHost';
const DEFAULT_PORT = 5678;

// URL patterns permitidas
const ALLOWED_URL_PATTERNS = [
  /^http:\/\/localhost:48215/,
  /^http:\/\/localhost:5678/,
  /^http:\/\/localhost:4124/,
  /^ws:\/\/localhost:4124/,
  /^file:\/\//
];

module.exports = {
  IS_DEV,
  IS_LAUNCH_MODE,
  APP_VERSION,
  SERVICE_NAME,
  DEFAULT_PORT,
  ALLOWED_URL_PATTERNS
};