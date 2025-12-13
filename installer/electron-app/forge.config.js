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
      path.join(__dirname, '..', '..', 'core')
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
      requestedExecutionLevel: 'requireAdministrator'
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
        name: 'BloomNucleusInstaller',
        setupIcon: path.join(__dirname, 'assets', 'bloom.ico'),
        iconUrl: 'https://raw.githubusercontent.com/electron/electron/main/shell/browser/resources/win/electron.ico',
        loadingGif: path.join(__dirname, 'assets', 'installer.gif'),
        authors: 'BTIP Studio',
        description: 'Bloom Nucleus - Local automation server',
        noMsi: true
      }
    },
    {
      name: '@electron-forge/maker-dmg',
      config: {
        name: 'BloomNucleusInstaller',
        icon: path.join(__dirname, 'assets', 'icon.icns'),
        background: path.join(__dirname, 'assets', 'dmg-background.png'),
        format: 'ULFO',
        overwrite: true,
        additionalDMGOptions: {
          window: {
            size: {
              width: 660,
              height: 400
            }
          }
        }
      }
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          maintainer: 'BTIP Studio',
          homepage: 'https://bloom.local',
          icon: path.join(__dirname, 'assets', 'icon.png'),
          categories: ['Development', 'Utility'],
          section: 'devel'
        }
      }
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {
        options: {
          maintainer: 'BTIP Studio',
          homepage: 'https://bloom.local',
          icon: path.join(__dirname, 'assets', 'icon.png'),
          categories: ['Development', 'Utility']
        }
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
      
      const nativeDir = path.join(__dirname, '..', 'native');
      if (!fs.existsSync(nativeDir)) {
        console.warn('WARNING: Native binaries directory not found');
      }
    },
    postPackage: async (forgeConfig, options) => {
      console.log('Post-package: Copying additional resources...');
      
      const outputPath = options.outputPaths[0];
      const resourcesPath = path.join(outputPath, 'resources');
      
      const chromeExtPath = path.join(__dirname, '..', 'chrome-extension');
      if (fs.existsSync(chromeExtPath)) {
        const destExtPath = path.join(resourcesPath, 'chrome-extension');
        fs.cpSync(chromeExtPath, destExtPath, { recursive: true });
        console.log('✓ Chrome extension copied');
      }
      
      const configPath = path.join(__dirname, 'installer-config.json');
      if (fs.existsSync(configPath)) {
        const destConfigPath = path.join(resourcesPath, 'installer-config.json');
        fs.copyFileSync(configPath, destConfigPath);
        console.log('✓ Config copied');
      }
    },
    postMake: async (forgeConfig, makeResults) => {
      console.log('Post-make: Build complete');
      console.log('Artifacts:', makeResults.map(r => r.artifacts).flat());
    }
  }
};

function copyRecursive(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach(childItemName => {
      copyRecursive(
        path.join(src, childItemName),
        path.join(dest, childItemName)
      );
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}