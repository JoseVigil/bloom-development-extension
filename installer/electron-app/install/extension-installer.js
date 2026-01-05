// install/extension-installer.js - LIMPIO: Solo funciones necesarias
const fs = require('fs-extra');
const path = require('path');
const { paths } = require('../config/paths');
const os = require('os');
const { generateExtensionId } = require('../../scripts/extension-utils');

/**
 * Copia la extensión desde source (repo) hacia AppData/extension
 */
async function installExtension() {
  console.log('\n🧩 INSTALLING CHROME EXTENSION');
  
  const extensionSource = paths.extensionSource;
  console.log('📂 Extension source:', extensionSource);
  
  if (!await fs.pathExists(extensionSource)) {
    console.error('❌ Extension source not found:', extensionSource);
    
    const alternativePath = path.join(__dirname, '..', '..', 'chrome-extension', 'src');
    console.log('🔍 Trying alternative path:', alternativePath);
    
    if (await fs.pathExists(alternativePath)) {
      console.log('✅ Found extension at alternative path');
      await copyExtensionFiles(alternativePath);
      return { success: true };
    }
    
    throw new Error(`Extension source not found: ${extensionSource}`);
  }
  
  await copyExtensionFiles(extensionSource);
  
  console.log('✅ Extension installed successfully');
  return { success: true };
}

/**
 * Copia los archivos de la extensión al destino en AppData
 */
async function copyExtensionFiles(sourceDir) {
  const destDir = paths.extensionDir;
  
  console.log(`📋 Copying extension files...`);
  console.log(`   Source: ${sourceDir}`);
  console.log(`   Dest:   ${destDir}`);
  
  if (await fs.pathExists(destDir)) {
    console.log('🧹 Cleaning old extension directory...');
    await fs.emptyDir(destDir);
  } else {
    await fs.ensureDir(destDir);
  }
  
  await fs.copy(sourceDir, destDir, {
    overwrite: true,
    errorOnExist: false,
    filter: (src) => {
      const basename = path.basename(src);
      const excludes = ['node_modules', '.git', '.DS_Store', 'Thumbs.db', '__pycache__'];
      return !excludes.includes(basename);
    }
  });
  
  console.log('✅ Extension files copied');
  
  const manifestPath = path.join(destDir, 'manifest.json');
  if (!await fs.pathExists(manifestPath)) {
    throw new Error('manifest.json not found after copy');
  }
  
  console.log('✅ manifest.json verified');
}

/**
 * Verifica que la extensión se haya instalado correctamente
 */
async function verifyExtension() {
  console.log('\n🔍 VERIFYING EXTENSION INSTALLATION');
  
  const destDir = paths.extensionDir;
  const manifestPath = path.join(destDir, 'manifest.json');
  
  if (!await fs.pathExists(destDir)) {
    console.error('❌ Extension directory not found:', destDir);
    return { success: false, error: 'Extension directory not found' };
  }
  
  if (!await fs.pathExists(manifestPath)) {
    console.error('❌ manifest.json not found:', manifestPath);
    return { success: false, error: 'manifest.json not found' };
  }
  
  try {
    const manifest = await fs.readJson(manifestPath);
    console.log('✅ Extension verified:');
    console.log(`   Name:    ${manifest.name}`);
    console.log(`   Version: ${manifest.version}`);
    console.log(`   Path:    ${destDir}`);
    
    return { 
      success: true, 
      manifest,
      path: destDir
    };
  } catch (err) {
    console.error('❌ Failed to read manifest.json:', err.message);
    return { success: false, error: 'Invalid manifest.json' };
  }
}

/**
 * Configura el Native Messaging Bridge y retorna Extension ID calculado
 * 
 * @returns {string} Extension ID (32 caracteres a-p)
 */
async function configureBridge() {
  console.log('\n🔗 CONFIGURING NATIVE MESSAGING BRIDGE');
  
  const platform = os.platform();
  
  if (platform === 'win32') {
    await configureWindowsBridge();
  } else if (platform === 'darwin') {
    await configureMacBridge();
  } else {
    await configureLinuxBridge();
  }
  
  console.log('✅ Bridge configured successfully');

  // Leer manifest.json y calcular Extension ID con algoritmo oficial de Chrome
  const manifestPath = path.join(paths.extensionDir, 'manifest.json');
  const manifest = await fs.readJson(manifestPath);
  
  if (!manifest.key) {
    throw new Error('manifest.json must have a fixed "key" property for deterministic Extension ID');
  }
  
  // Convertir base64 key a Buffer
  const publicKeyBytes = Buffer.from(manifest.key, 'base64');
  
  // Calcular Extension ID con algoritmo oficial
  const extensionId = generateExtensionId(publicKeyBytes);  
  
  console.log('📍 Extension ID:', extensionId);
  
  return extensionId; // ✅ Retorna string directamente
}

/**
 * Configura el bridge en Windows (Registry)
 */
async function configureWindowsBridge() {
  const { execSync } = require('child_process');
  
  const manifestPath = paths.manifestPath;
  
  const manifestContent = {
    name: 'com.bloom.nucleus.bridge',
    description: 'Bloom Nucleus Native Messaging Host',
    path: paths.hostBinary,
    type: 'stdio',
    allowed_origins: [
      'chrome-extension://*/'  // Wildcard para cualquier extension ID
    ]
  };
  
  await fs.ensureDir(path.dirname(manifestPath));
  await fs.writeJson(manifestPath, manifestContent, { spaces: 2 });
  
  console.log('📝 Manifest created:', manifestPath);
  
  const registryKey = 'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.bloom.nucleus.bridge';
  const regCommand = `reg add "${registryKey}" /ve /t REG_SZ /d "${manifestPath}" /f`;
  
  try {
    execSync(regCommand, { encoding: 'utf8', windowsHide: true });
    console.log('✅ Registry key created:', registryKey);
  } catch (err) {
    console.error('❌ Failed to create registry key:', err.message);
    throw err;
  }
}

/**
 * Configura el bridge en macOS
 */
async function configureMacBridge() {
  const manifestPath = paths.manifestPath;
  
  const manifestContent = {
    name: 'com.bloom.nucleus.bridge',
    description: 'Bloom Nucleus Native Messaging Host',
    path: paths.hostBinary,
    type: 'stdio',
    allowed_origins: [
      'chrome-extension://*/'
    ]
  };
  
  await fs.ensureDir(path.dirname(manifestPath));
  await fs.writeJson(manifestPath, manifestContent, { spaces: 2 });
  
  console.log('📝 Manifest created:', manifestPath);
}

/**
 * Configura el bridge en Linux
 */
async function configureLinuxBridge() {
  const manifestPath = paths.manifestPath;
  
  const manifestContent = {
    name: 'com.bloom.nucleus.bridge',
    description: 'Bloom Nucleus Native Messaging Host',
    path: paths.hostBinary,
    type: 'stdio',
    allowed_origins: [
      'chrome-extension://*/'
    ]
  };
  
  await fs.ensureDir(path.dirname(manifestPath));
  await fs.writeJson(manifestPath, manifestContent, { spaces: 2 });
  
  console.log('📝 Manifest created:', manifestPath);
}

module.exports = {
  installExtension,
  verifyExtension,
  configureBridge
};