const { Menu, shell } = require('electron');
const { paths } = require('../config/paths');
const { APP_VERSION } = require('../config/constants');

function setupMenu(mainWindow) {
  const template = [
    {
      label: 'File',
      submenu: [{ role: 'quit' }]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Open Logs Folder',
          click: () => shell.openPath(paths.logsDir)
        },
        {
          label: 'Documentation',
          click: () => shell.openExternal('http://localhost:48215/docs')
        },
        { type: 'separator' },
        {
          label: `Version ${APP_VERSION}`,
          enabled: false
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

module.exports = { setupMenu };