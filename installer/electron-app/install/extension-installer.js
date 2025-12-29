const fs = require('fs-extra');
const crypto = require('crypto');
const { paths } = require('../config/paths');
const { execPromise } = require('../utils/exec-helper');

/**
 * Instala la extensión de Chrome en AMBAS ubicaciones:
 * 1. Legacy: %LOCALAPPDATA%\BloomNucleus\extension\ (para compatibilidad)
 * 2. Production: %LOCALAPPDATA%\BloomNucleus\extensions\chrome\ (para Brain CLI)
 */
async function installExtension() {
  console.log("📦 Deploying Chrome Extension...");

  // Verificar que source existe
  if (!fs.existsSync(paths.extensionSource)) {
    throw new Error(`Extension source not found: ${paths.extensionSource}`);
  }

  // INSTALACIÓN 1: Ubicación legacy (para compatibilidad con código existente)
  console.log(" 📂 Installing to legacy location...");
  await fs.copy(paths.extensionSource, paths.extensionDir, { overwrite: true });
  console.log(`    ✅ ${paths.extensionDir}`);

  // INSTALACIÓN 2: Ubicación para Brain CLI (CRÍTICO para profile launch)
  console.log(" 📂 Installing to Brain CLI location...");
  
  // Asegurar que el directorio padre existe
  await fs.ensureDir(paths.extensionBrainDir);
  
  // Copiar a la nueva ubicación
  await fs.copy(paths.extensionSource, paths.extensionBrainDir, { overwrite: true });
  console.log(`    ✅ ${paths.extensionBrainDir}`);

  // Verificar que manifest.json existe en ambas ubicaciones
  const legacyManifest = require('path').join(paths.extensionDir, 'manifest.json');
  const brainManifest = require('path').join(paths.extensionBrainDir, 'manifest.json');

  if (!fs.existsSync(legacyManifest)) {
    throw new Error(`Legacy manifest not found: ${legacyManifest}`);
  }

  if (!fs.existsSync(brainManifest)) {
    throw new Error(`Brain CLI manifest not found: ${brainManifest}`);
  }

  console.log(" ✅ Extension deployed to both locations");
}

/**
 * Configura el Native Messaging Bridge
 * (Usa la ubicación legacy para mantener compatibilidad con código existente)
 */
async function configureBridge() {
  console.log("🔗 Configuring Native Bridge...");

  // Usar legacy location para el bridge (código existente espera esto)
  const extManifestPath = require('path').join(paths.extensionDir, 'manifest.json');
  
  if (!fs.existsSync(extManifestPath)) {
    throw new Error("Extension manifest not found in destination");
  }

  const extManifest = await fs.readJson(extManifestPath);
  
  if (!extManifest.key) {
    throw new Error("Extension doesn't have a fixed 'key' in manifest.json");
  }

  const extensionId = calculateExtensionId(extManifest.key);
  console.log(` 🆔 Calculated ID: ${extensionId}`);

  // Crear manifest del host
  const hostManifest = {
    name: "com.bloom.nucleus.bridge",
    description: "Bloom Nucleus Host",
    path: paths.hostBinary,
    type: "stdio",
    allowed_origins: [`chrome-extension://${extensionId}/`]
  };

  await fs.writeJson(paths.manifestPath, hostManifest, { spaces: 2 });
  console.log(" ✅ Host manifest created");

  // Registrar en Windows Registry
  if (process.platform === 'win32') {
    const regKey = 'HKCU\\SOFTWARE\\Google\\Chrome\\NativeMessagingHosts\\com.bloom.nucleus.bridge';
    const jsonPath = paths.manifestPath.replace(/\\/g, '\\\\');
    const cmd = `reg add "${regKey}" /ve /d "${jsonPath}" /f`;
    
    await execPromise(cmd);
    console.log(" ✅ Host registered in HKCU");
  }

  return extensionId;
}

/**
 * Calcula el ID de la extensión a partir de la clave pública
 */
function calculateExtensionId(base64Key) {
  const buffer = Buffer.from(base64Key, 'base64');
  const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 32);

  return hash.split('').map(char => {
    const code = parseInt(char, 16);
    return String.fromCharCode(97 + code);
  }).join('');
}

module.exports = {
  installExtension,
  configureBridge,
  calculateExtensionId
};