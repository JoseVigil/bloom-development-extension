const { BrowserWindow } = require('electron');
const path = require('path');
const { IS_DEV, ALLOWED_URL_PATTERNS } = require('../config/constants');
const { setupMenu } = require('./menu-builder');

// Mapa de ventanas de perfiles (para Launch Mode)
const profileWindows = new Map();

/**
 * Verifica si una URL está permitida
 */
function isAllowedUrl(url) {
  return ALLOWED_URL_PATTERNS.some(pattern => pattern.test(url));
}

/**
 * Crea la ventana principal según el modo
 */
function createMainWindow(isLaunchMode) {
  const windowConfig = {
    width: isLaunchMode ? 1400 : 900,
    height: isLaunchMode ? 900 : 800,
    minWidth: isLaunchMode ? 1000 : 800,
    minHeight: isLaunchMode ? 600 : 500,
    backgroundColor: '#1a1a1a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: isLaunchMode
        ? path.join(__dirname, '..', 'launch', 'preload_launch.js')
        : path.join(__dirname, '..', 'preload.js'),
      sandbox: false,
      devTools: true,
      // === CLAVE: Esto permite cargar file:// locales ===
      webSecurity: IS_DEV ? false : true  // Desactiva solo en desarrollo
    },
    icon: path.join(__dirname, '..', 'assets', 'bloom.ico'),
    show: false,
    frame: true,
    title: isLaunchMode ? 'Bloom Nucleus Launcher' : 'Bloom Nucleus Installer'
  };

  const mainWindow = new BrowserWindow(windowConfig);

  // En desarrollo y Launch Mode, cargar desde Vite dev server
  if (IS_DEV && isLaunchMode) {
    const devServerUrl = 'http://localhost:5173/';
    console.log(`🚀 Loading dev server: ${devServerUrl}`);
    mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools();
  } else {
    // En producción o Installer mode, cargar archivo HTML
    const htmlPath = isLaunchMode
      ? path.join(__dirname, '..', 'src', 'launch', 'index_launch.html')
      : path.join(__dirname, '..', 'src', 'index.html');

    console.log(`📄 Loading UI: ${htmlPath}`);
    mainWindow.loadFile(htmlPath);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (IS_DEV && !isLaunchMode) {
      // Solo abrir DevTools automáticamente en Installer mode
      mainWindow.webContents.openDevTools();
    }
  });

  // Workaround opcional para intentar eliminar referencias a autofillPrivate en DevTools
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.executeJavaScript(`
      if (window.chrome && window.chrome.autofillPrivate) {
        delete window.chrome.autofillPrivate;
      }
    `).catch(() => {});
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    // Permitir navegación a localhost en desarrollo
    if (IS_DEV && url.startsWith('http://localhost:')) {
      return;
    }
    if (!isAllowedUrl(url)) {
      event.preventDefault();
      console.warn(`🚫 Blocked navigation to: ${url}`);
    }
  });

  mainWindow.on('closed', () => {
    profileWindows.forEach(win => {
      if (win && !win.isDestroyed()) win.close();
    });
    profileWindows.clear();
  });

  setupMenu(mainWindow);

  return mainWindow;
}

module.exports = {
  createMainWindow,
  profileWindows,
  isAllowedUrl
};