const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const KEY_PATH = path.join(__dirname, '..', 'extension-key.pem');
const ID_PATH = path.join(__dirname, '..', 'extension-id.txt');

function generateId(pubKey) {
  const hash = crypto.createHash('sha256').update(pubKey).digest();
  const idBytes = hash.slice(0, 16);
  let id = '';
  for (let b of idBytes) id += String.fromCharCode(97 + (b & 0x0f)) + String.fromCharCode(97 + ((b >> 4) & 0x0f));
  return id;
}

try {
  console.log('🔑 Generando identidad de extensión...');
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  // Guardar clave privada (CRITICO: No la pierdas)
  fs.writeFileSync(KEY_PATH, privateKey);
  
  // Generar ID
  const pubKeyDer = crypto.createPublicKey(publicKey).export({ type: 'spki', format: 'der' });
  const extId = generateId(pubKeyDer);
  fs.writeFileSync(ID_PATH, extId);

  console.log(`✅ Clave guardada en: ${KEY_PATH}`);
  console.log(`✅ ID generado en: ${ID_PATH}`);
  console.log(`📝 EXTENSION ID: ${extId}`);
} catch (e) {
  console.error(e);
}