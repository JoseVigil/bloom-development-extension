// install/extension-installer.js - FIXED: Copia correcta de extensión
const fs = require('fs-extra');
const path = require('path');
const { paths } = require('../config/paths');
const os = require('os');

/**
 * Copia la extensión desde source (repo) hacia AppData/extension
 * Esta es la carpeta desde donde Chrome cargará la extensión
 */
async function installExtension() {
  console.log('\n🧩 INSTALLING CHROME EXTENSION');
  
  // PASO 1: Validar que el source existe
  const extensionSource = paths.extensionSource;
  console.log('📂 Extension source:', extensionSource);
  
  if (!await fs.pathExists(extensionSource)) {
    console.error('❌ Extension source not found:', extensionSource);
    
    // Intentar path alternativo
    const alternativePath = path.join(__dirname, '..', '..', 'chrome-extension', 'src');
    console.log('🔍 Trying alternative path:', alternativePath);
    
    if (await fs.pathExists(alternativePath)) {
      console.log('✅ Found extension at alternative path');
      // Actualizar el source
      const extensionSourceAlt = alternativePath;
      await copyExtensionFiles(extensionSourceAlt);
      return { success: true };
    }
    
    throw new Error(`Extension source not found: ${extensionSource}`);
  }
  
  // PASO 2: Copiar archivos
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
  
  // PASO 1: Limpiar destino si existe
  if (await fs.pathExists(destDir)) {
    console.log('🧹 Cleaning old extension directory...');
    await fs.emptyDir(destDir);
  } else {
    await fs.ensureDir(destDir);
  }
  
  // PASO 2: Copiar todos los archivos
  await fs.copy(sourceDir, destDir, {
    overwrite: true,
    errorOnExist: false,
    filter: (src) => {
      // Excluir archivos innecesarios
      const basename = path.basename(src);
      const excludes = ['node_modules', '.git', '.DS_Store', 'Thumbs.db', '__pycache__'];
      return !excludes.includes(basename);
    }
  });
  
  console.log('✅ Extension files copied');
  
  // PASO 3: Verificar manifest.json
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
  
  // Verificar que existe el directorio
  if (!await fs.pathExists(destDir)) {
    console.error('❌ Extension directory not found:', destDir);
    return { success: false, error: 'Extension directory not found' };
  }
  
  // Verificar manifest.json
  if (!await fs.pathExists(manifestPath)) {
    console.error('❌ manifest.json not found:', manifestPath);
    return { success: false, error: 'manifest.json not found' };
  }
  
  // Leer manifest para obtener version y name
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
 * Configura el Native Messaging Bridge entre Chrome y el Native Host
 * Registra el manifest en el Registry (Windows) o en el path correcto (macOS/Linux)
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
  
  // Retornar el Extension ID (se obtiene del manifest instalado)
  const manifestPath = path.join(paths.extensionDir, 'manifest.json');
  const manifest = await fs.readJson(manifestPath);
  
  // El Extension ID se genera desde el manifest key (si existe)
  // O se genera automáticamente por Chrome al cargar
  // Por ahora retornamos un placeholder
  const extensionId = manifest.key 
    ? generateExtensionId(manifest.key)
    : 'pending-chrome-load';
  
  console.log('📋 Extension ID:', extensionId);
  
  return extensionId;
}

/**
 * Configura el bridge en Windows (Registry)
 */
async function configureWindowsBridge() {
  const { execSync } = require('child_process');
  
  // Path del manifest
  const manifestPath = paths.manifestPath;
  
  // Crear el manifest JSON
  const manifestContent = {
    name: 'com.bloom.nucleus.bridge',
    description: 'Bloom Nucleus Native Messaging Host',
    path: paths.hostBinary,
    type: 'stdio',
    allowed_origins: [
      `chrome-extension://${paths.extensionDir}/` // Placeholder, se actualiza después
    ]
  };
  
  await fs.ensureDir(path.dirname(manifestPath));
  await fs.writeJson(manifestPath, manifestContent, { spaces: 2 });
  
  console.log('📝 Manifest created:', manifestPath);
  
  // Registrar en el Registry
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
      `chrome-extension://${paths.extensionDir}/`
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
      `chrome-extension://${paths.extensionDir}/`
    ]
  };
  
  await fs.ensureDir(path.dirname(manifestPath));
  await fs.writeJson(manifestPath, manifestContent, { spaces: 2 });
  
  console.log('📝 Manifest created:', manifestPath);
}

/**
 * Genera el Extension ID desde el manifest key (si existe)
 * Nota: Este es un placeholder, el ID real lo genera Chrome
 */
function generateExtensionId(manifestKey) {
  // El Extension ID se deriva del manifest.json key usando hash
  // Por simplicidad, retornamos un placeholder
  // En producción, deberías usar el algoritmo correcto o leerlo después de cargar
  return 'generated-by-chrome-on-load';
}

module.exports = {
  installExtension,
  verifyExtension,
  configureBridge
};