const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const path = require('path');
const fs = require('fs');

module.exports = {
  packagerConfig: {
    asar: false, // Importante: false para que Python pueda leer sus archivos sin problemas
    icon: path.join(__dirname, 'assets', 'electron'),
    extraResource: [
      path.join(__dirname, 'assets'),
      path.join(__dirname, '..', 'native'),
      // CORRECCIÓN CRÍTICA: Cambiado de 'core' a 'brain'
      path.join(__dirname, '..', '..', 'brain'),
      // Incluimos la extensión compilada (ajusta 'out' o 'src' según donde esté tu build final)
      path.join(__dirname, '..', '..', 'src') 
    ],
    ignore: (filePath) => {
      if (!filePath) return false;
      
      const ignorePatterns = [
        /^\/node_modules/,
        /^\/out/,
        /^\/dist/,
        /^\/build/,
        /^\/test/,
        /^\/docs/,
        /^\/\.git/,
        /^\/\.vscode/,
        /^\/\.gitignore/,
        /^\/\.env/,
        /^\/package-lock\.json/,
        /^\/npm-debug\.log/,
        /^\/__pycache__/,
        // CORRECCIÓN: Permitimos .py, solo ignoramos compilados y specs
        /\.pyc$/,
        /\.spec$/
      ];
      
      return ignorePatterns.some(pattern => pattern.test(filePath));
    },
    win32metadata: {
      CompanyName: 'BTIP Studio',
      FileDescription: 'Bloom Nucleus Installer',
      ProductName: 'Bloom Nucleus',
      InternalName: 'BloomNucleusInstaller',
      OriginalFilename: 'bloom-nucleus-installer.exe',
      // USER MODE: No pide admin
      requestedExecutionLevel: 'asInvoker'
    },
    osxSign: {
      identity: process.env.APPLE_IDENTITY || undefined,
      hardenedRuntime: true,
      entitlements: 'entitlements.plist',
      'entitlements-inherit': 'entitlements.plist',
      'signature-flags': 'library'
    },
    osxNotarize: process.env.APPLE_ID ? {
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID
    } : undefined
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'BloomNucleusHub',
        setupIcon: path.join(__dirname, 'assets', 'bloom.ico'),
        // Url placeholder, puedes cambiarla o quitarla
        iconUrl: 'https://raw.githubusercontent.com/electron/electron/main/shell/browser/resources/win/electron.ico',
        loadingGif: path.join(__dirname, 'assets', 'installer.gif'),
        authors: 'BTIP Studio',
        description: 'Bloom Nucleus - Local automation server',
        noMsi: true,
        // USER MODE: Instalación en AppData
        perMachine: false 
      }
    },
    {
      name: '@electron-forge/maker-dmg',
      config: {
        name: 'BloomNucleusHub',
        icon: path.join(__dirname, 'assets', 'icon.icns'),
        format: 'ULFO',
        overwrite: true
      }
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'linux', 'win32']
    }
  ],
  plugins: [
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: false,
      [FuseV1Options.OnlyLoadAppFromAsar]: false
    })
  ],
  hooks: {
      prePackage: async (forgeConfig, options) => {
      console.log('Pre-package: Validating assets...');
      
      const assetsDir = path.join(__dirname, 'assets');
      if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir, { recursive: true });
      }
      
      const runtimeDir = path.join(__dirname, '..', 'resources', 'runtime');
      const pythonExe = path.join(runtimeDir, 'python.exe');
      
      // Verificación estricta del Runtime antes de empaquetar
      if (!fs.existsSync(pythonExe)) {
        console.warn(
          '⚠️ ADVERTENCIA: Python Runtime no detectado en: ' + pythonExe + '\n' +
          '   Asegúrate de haber ejecutado el script de setup del runtime.\n' +
          '   (Si estás en desarrollo puro, esto puede ser normal, pero fallará en producción)'
        );
      } else {
        console.log('✅ Python Runtime detectado.');
      }
    },
    postPackage: async (forgeConfig, options) => {
      console.log('Post-package: Final checks...');
      // Aquí puedes agregar lógica extra si necesitas copiar algo manual
    }
  }
};