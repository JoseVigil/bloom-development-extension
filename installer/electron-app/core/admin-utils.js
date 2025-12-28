const { execSync, spawn } = require('child_process');
const { app } = require('electron');

/**
 * Verifica si el proceso tiene privilegios elevados (Windows)
 */
async function isElevated() {
  if (process.platform !== 'win32') return true;
  
  try {
    execSync('net session', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Relanza la aplicación con privilegios de administrador
 */
function relaunchAsAdmin() {
  const exe = process.execPath;
  const args = process.argv.slice(1).join(' ');
  
  spawn('powershell', [
    '-Command',
    `Start-Process "${exe}" -ArgumentList "${args}" -Verb RunAs`
  ], {
    detached: true,
    stdio: 'ignore'
  });
  
  app.quit();
}

module.exports = {
  isElevated,
  relaunchAsAdmin
};