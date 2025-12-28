const fs = require('fs-extra');
const crypto = require('crypto');
const { paths } = require('../config/paths');
const { execPromise } = require('../utils/exec-helper');

/**
 * Instala la extensión de Chrome (modo unpacked)
 */
async function installExtension() {
  console.log("📦 Deploying Extension (Unpacked)...");

  if (!fs.existsSync(paths.extensionSource)) {
    throw new Error("Extension Source not found");
  }

  await fs.copy(paths.extensionSource, paths.extensionDir, { overwrite: true });
  console.log(" ✅ Extension deployed");
}

/**
 * Configura el Native Messaging Bridge
 */
async function configureBridge() {
  console.log("🔗 Configuring Native Bridge...");

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