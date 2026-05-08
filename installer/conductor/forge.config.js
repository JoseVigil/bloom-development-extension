const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const path = require('path');
const fs = require('fs');

module.exports = {
  packagerConfig: {
    asar: false,
    icon: path.join(__dirname, 'assets', 'electron'),
    extraResource: [
      path.join(__dirname, 'assets'),
      path.join(__dirname, '..', 'native'),
      path.join(__dirname, '..', '..', 'brain'),
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
      requestedExecutionLevel: 'asInvoker'
    },

    // ── Firma macOS ────────────────────────────────────────────────────────
    // APPLE_IDENTITY: el nombre exacto del certificado en Keychain
    // Ejemplo: "Developer ID Application: BTIP Studio (XXXXXXXXXX)"
    osxSign: process.env.APPLE_IDENTITY ? {
      identity: process.env.APPLE_IDENTITY,
      hardenedRuntime: true,
      // entitlements.plist debe estar en la misma carpeta que forge.config.js
      entitlements: path.join(__dirname, 'entitlements.plist'),
      'entitlements-inherit': path.join(__dirname, 'entitlements.plist'),
      'signature-flags': 'library'
    } : undefined,

    // ── Notarización macOS ─────────────────────────────────────────────────
    // Usa notarytool (API nueva de Apple — la anterior fue deprecada en 2023)
    // Variables de entorno requeridas:
    //   APPLE_ID        → tu Apple ID (email de la cuenta Developer)
    //   APPLE_TEAM_ID   → Team ID, visible en developer.apple.com (10 chars)
    //   APPLE_PASSWORD  → App-Specific Password generado en appleid.apple.com
    //                     (NO es tu password de Apple ID)
    osxNotarize: process.env.APPLE_ID ? {
      tool: 'notarytool',
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
        iconUrl: 'https://raw.githubusercontent.com/electron/electron/main/shell/browser/resources/win/electron.ico',
        loadingGif: path.join(__dirname, 'assets', 'installer.gif'),
        authors: 'BTIP Studio',
        description: 'Bloom Nucleus - Local automation server',
        noMsi: true,
        perMachine: false
      }
    },
    {
      name: '@electron-forge/maker-dmg',
      config: {
        name: 'BloomNucleusHub',
        icon: path.join(__dirname, 'assets', 'bloom.icns'),
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

      // ── Verificación del runtime según plataforma ──────────────────────
      const IS_DARWIN = process.platform === 'darwin';
      const runtimeDir = path.join(__dirname, '..', 'resources', 'runtime');

      if (IS_DARWIN) {
        // En macOS el runtime de Python es un binario Mach-O sin extensión
        const pythonBin = path.join(runtimeDir, 'bin', 'python3');
        if (!fs.existsSync(pythonBin)) {
          console.warn(
            '⚠️  Python Runtime no detectado en: ' + pythonBin + '\n' +
            '   Ejecutá build_brain.sh para generar el bundle de PyInstaller.'
          );
        } else {
          console.log('✅ Python Runtime (macOS) detectado.');
        }

        // Verificar que entitlements.plist existe — si falta, osxSign falla
        const entitlements = path.join(__dirname, 'entitlements.plist');
        if (!fs.existsSync(entitlements)) {
          throw new Error(
            'entitlements.plist no encontrado en: ' + entitlements + '\n' +
            'Es requerido para firma con Hardened Runtime en macOS.'
          );
        }
        console.log('✅ entitlements.plist encontrado.');

      } else {
        // Windows: verificar python.exe del runtime portable
        const pythonExe = path.join(runtimeDir, 'python.exe');
        if (!fs.existsSync(pythonExe)) {
          console.warn(
            '⚠️  Python Runtime no detectado en: ' + pythonExe + '\n' +
            '   Asegurate de haber ejecutado el script de setup del runtime.\n' +
            '   (En desarrollo puro puede ser normal, pero fallará en producción)'
          );
        } else {
          console.log('✅ Python Runtime (Windows) detectado.');
        }
      }
    },

    postPackage: async (forgeConfig, options) => {
      console.log('Post-package: Final checks...');
    }
  }
};
