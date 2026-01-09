// install/extension-installer.js - REFACTORIZADO
// ============================================================================
// RESPONSABILIDAD ÚNICA: Gestionar la extensión de Chrome
// - Copiar archivos de la extensión
// - Calcular Extension ID desde manifest.key
// - Validar estructura de la extensión
// 
// NO HACE:
// - Crear manifest del Native Host (ahora en installer.js)
// - Registrar en Windows Registry (ahora en installer.js)
// ============================================================================

const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const { paths } = require('../config/paths');

// ============================================================================
// ALGORITMO DE CÁLCULO DE EXTENSION ID
// ============================================================================

/**
 * Calcula el Extension ID de Chrome desde una clave pública en Base64
 * Algoritmo:
 * 1. Decodificar Base64 → Buffer
 * 2. SHA256 del buffer
 * 3. Primeros 32 caracteres del hex
 * 4. Mapear [0-9a-f] → [a-p]
 */
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
    console.error("❌ Error calculando Extension ID:", e);
    throw e;
  }
}

// ============================================================================
// FUNCIONES DE EXTENSIÓN
// ============================================================================

/**
 * Encuentra la carpeta correcta que contiene manifest.json
 * Maneja casos donde manifest.json está en /src o en la raíz
 */
async function findExtensionSource(baseSource) {
  // Caso 1: manifest.json en /src subfolder
  if (await fs.pathExists(path.join(baseSource, 'src', 'manifest.json'))) {
    console.log('⚠️ Detected manifest inside /src subfolder. Adjusting source path.');
    return path.join(baseSource, 'src');
  }
  
  // Caso 2: manifest.json en la raíz
  if (await fs.pathExists(path.join(baseSource, 'manifest.json'))) {
    console.log('✅ Manifest found at root of source.');
    return baseSource;
  }
  
  // Caso 3: Fallback a ruta alternativa
  const alternative = path.resolve(__dirname, '../../chrome-extension/src');
  if (await fs.pathExists(path.join(alternative, 'manifest.json'))) {
    console.log('🔄 Switching to alternative source path:', alternative);
    return alternative;
  }
  
  throw new Error(`Cannot find manifest.json in ${baseSource} or subfolders`);
}

/**
 * Copia la extensión desde source (repo) hacia AppData/extension
 * Estructura plana (flat structure) en el destino
 */
async function installExtension() {
  console.log('\n🧩 INSTALLING CHROME EXTENSION');
  
  // Determinar la fuente correcta
  const extensionSource = await findExtensionSource(paths.extensionSource);
  
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

  console.log('✅ Extension installed with flat structure successfully');
  return { success: true };
}

/**
 * Lee el manifest.json, sanitiza la key y calcula el Extension ID
 */
async function calculateExtensionIdFromManifest(extensionDir) {
  console.log('\n🔑 CALCULATING EXTENSION ID FROM MANIFEST');

  const manifestPath = path.join(extensionDir, 'manifest.json');
  
  if (!await fs.pathExists(manifestPath)) {
    throw new Error(`manifest.json not found at: ${manifestPath}`);
  }
  
  // 1. LEER Y SANEAR EL MANIFEST
  let manifest = await fs.readJson(manifestPath);
  
  if (!manifest.key) {
    throw new Error('Manifest missing "key" property. Extension needs a hardcoded key for stable ID.');
  }

  // 2. LIMPIAR LA KEY (eliminar saltos de línea, espacios, retornos de carro)
  const cleanKey = manifest.key.replace(/[\r\n\s]+/g, '');
  
  // Si la key estaba sucia, la guardamos limpia en el disco
  if (manifest.key !== cleanKey) {
    console.log('🧹 Sanitizing Key in manifest.json (removing newlines/spaces)...');
    manifest.key = cleanKey;
    await fs.writeJson(manifestPath, manifest, { spaces: 2 });
  }
  
  // 3. CALCULAR ID (con la key limpia)
  const extensionId = calculateExtensionId(cleanKey);
  console.log('🔑 Calculated Extension ID:', extensionId);
  
  return extensionId;
}

/**
 * Valida que la extensión esté correctamente instalada
 */
async function verifyExtension() {
  console.log('\n✅ VERIFYING EXTENSION INSTALLATION');
  
  const manifestPath = path.join(paths.extensionDir, 'manifest.json');
  
  if (!await fs.pathExists(manifestPath)) {
    throw new Error('Extension verification failed: manifest.json not found');
  }
  
  const manifest = await fs.readJson(manifestPath);
  
  // Verificar campos requeridos
  const requiredFields = ['name', 'version', 'manifest_version', 'key'];
  const missing = requiredFields.filter(field => !manifest[field]);
  
  if (missing.length > 0) {
    throw new Error(`Extension manifest missing required fields: ${missing.join(', ')}`);
  }
  
  // Verificar que la key esté limpia
  if (manifest.key.includes('\n') || manifest.key.includes(' ')) {
    console.warn('⚠️ Extension key contains whitespace - this may cause issues');
  }
  
  console.log('✅ Extension verification passed');
  console.log(`   Name: ${manifest.name}`);
  console.log(`   Version: ${manifest.version}`);
  
  return { success: true };
}

/**
 * Obtiene información de la extensión instalada
 */
async function getExtensionInfo() {
  const manifestPath = path.join(paths.extensionDir, 'manifest.json');
  
  if (!await fs.pathExists(manifestPath)) {
    return null;
  }
  
  const manifest = await fs.readJson(manifestPath);
  const extensionId = await calculateExtensionIdFromManifest(paths.extensionDir);
  
  return {
    name: manifest.name,
    version: manifest.version,
    extensionId: extensionId,
    manifestVersion: manifest.manifest_version,
    path: paths.extensionDir
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Funciones principales
  installExtension,
  verifyExtension,
  calculateExtensionIdFromManifest,
  getExtensionInfo,
  
  // Funciones auxiliares (exportadas para testing/debugging)
  calculateExtensionId,
  findExtensionSource
};