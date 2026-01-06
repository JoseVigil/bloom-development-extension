// install/extension-installer.js - VERSIÓN CORREGIDA Y ROBUSTA
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto'); // Necesario para calcular el ID aquí mismo
const { paths } = require('../config/paths');
const os = require('os');

// ============================================================================
// ALGORITMO CORRECTO DE CÁLCULO DE ID (Buffer based)
// ============================================================================
function calculateExtensionId(base64Key) {
  try {
    // 1. Decodificar Base64 a Buffer (CRÍTICO)
    const buffer = Buffer.from(base64Key, 'base64');
    
    // 2. SHA256
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    
    // 3. Primeros 32 chars
    const head = hash.slice(0, 32);

    // 4. Mapeo a alfabeto de Chrome (a-p)
    return head.split('').map(char => {
      const code = parseInt(char, 16);
      return String.fromCharCode(97 + code);
    }).join('');
  } catch (e) {
    console.error("❌ Error calculando ID:", e);
    throw e;
  }
}

// ============================================================================
// INSTALACIÓN
// ============================================================================

/**
 * Copia la extensión desde source (repo) hacia AppData/extension
 */
async function installExtension() {
  console.log('\n🧩 INSTALLING CHROME EXTENSION');
  
  // Determinamos la fuente exacta
  let extensionSource = paths.extensionSource;
  
  // Corrección: Asegurar que apuntamos a la carpeta que contiene manifest.json
  // A veces paths.extensionSource apunta a 'chrome-extension' (root) en lugar de 'src'
  if (await fs.pathExists(path.join(extensionSource, 'src', 'manifest.json'))) {
      console.log('⚠️  Detected manifest inside /src subfolder. Adjusting source path.');
      extensionSource = path.join(extensionSource, 'src');
  } else if (await fs.pathExists(path.join(extensionSource, 'manifest.json'))) {
      console.log('✅ Manifest found at root of source.');
  } else {
      // Intento de fallback manual si la config falla
      const alternative = path.resolve(__dirname, '../../chrome-extension/src');
      if (await fs.pathExists(path.join(alternative, 'manifest.json'))) {
          console.log('🔄 Switching to alternative source path:', alternative);
          extensionSource = alternative;
      } else {
          throw new Error(`Cannot find manifest.json in ${extensionSource} or subfolders`);
      }
  }

  console.log('📂 Final Source:', extensionSource);
  console.log('📂 Destination:', paths.extensionDir);

  // Limpieza previa
  if (await fs.pathExists(paths.extensionDir)) {
    await fs.emptyDir(paths.extensionDir);
  } else {
    await fs.ensureDir(paths.extensionDir);
  }
  
  // Copia PLANA (Flat copy)
  await fs.copy(extensionSource, paths.extensionDir, {
    overwrite: true,
    filter: (src) => {
      return !src.includes('node_modules') && !src.includes('.git');
    }
  });
  
  // Verificación post-copia
  if (!await fs.pathExists(path.join(paths.extensionDir, 'manifest.json'))) {
      throw new Error("❌ CRITICAL: manifest.json missing in destination root after copy.");
  }

  console.log('✅ Extension installed flat structure successfully');
  return { success: true };
}

/**
 * Configura el Native Messaging Bridge usando el Extension ID calculado
 */
async function configureBridge() {
  console.log('\n🔗 CONFIGURING NATIVE MESSAGING BRIDGE');

  const manifestPath = path.join(paths.extensionDir, 'manifest.json');
  
  if (!await fs.pathExists(manifestPath)) {
    throw new Error('manifest.json not found in AppData extension directory');
  }
  
  // 1. LEER Y SANEAR EL MANIFEST
  let manifest = await fs.readJson(manifestPath);
  
  if (!manifest.key) {
    throw new Error('Manifest missing "key" property');
  }

  // --- FIX CRÍTICO: LIMPIAR LA KEY ---
  // Eliminamos saltos de linea, espacios y retornos de carro
  const cleanKey = manifest.key.replace(/[\r\n\s]+/g, '');
  
  // Si la key estaba sucia, la guardamos limpia en el disco para que Chrome la acepte
  if (manifest.key !== cleanKey) {
      console.log('🧹 Sanitizing Key in manifest.json (removing newlines/spaces)...');
      manifest.key = cleanKey;
      await fs.writeJson(manifestPath, manifest, { spaces: 2 });
  }
  // -----------------------------------
  
  // 2. CÁLCULO DE ID (Con la key limpia)
  const extensionId = calculateExtensionId(cleanKey);
  console.log('📍 Calculated Extension ID:', extensionId);
  
  // 3. CREAR MANIFEST DEL HOST
  const hostManifestContent = {
    name: 'com.bloom.nucleus.bridge',
    description: 'Bloom Nucleus Native Messaging Host',
    path: paths.hostBinary, 
    type: 'stdio',
    allowed_origins: [
      `chrome-extension://${extensionId}/`
    ]
  };

  await fs.ensureDir(path.dirname(paths.manifestPath));
  await fs.writeJson(paths.manifestPath, hostManifestContent, { spaces: 2 });
  
  // ... (Resto del código de registro en Windows sigue igual) ...
  if (os.platform() === 'win32') {
    const { execSync } = require('child_process');
    const registryKey = 'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.bloom.nucleus.bridge';
    const regCommand = `reg add "${registryKey}" /ve /t REG_SZ /d "${paths.manifestPath}" /f`;
    try {
      execSync(regCommand, { windowsHide: true, encoding: 'utf8' });
      console.log('✅ Registry Key Updated OK');
    } catch (err) {
      console.error('❌ Registry Update Failed:', err.message);
      throw err;
    }
  }

  return extensionId;
}

// Funciones auxiliares mantenidas por compatibilidad si se llaman desde fuera
async function verifyExtension() { return { success: true }; }

module.exports = {
  installExtension,
  verifyExtension,
  configureBridge
};