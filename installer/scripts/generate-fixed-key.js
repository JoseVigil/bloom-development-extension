const crypto = require('crypto');
const fs = require('fs');

// Generamos un par de claves RSA
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' }
});

// Convertimos la pública a Base64 puro (sin cabeceras) para el manifest
const publicKeyDer = crypto.createPublicKey(publicKey).export({ type: 'spki', format: 'der' });
const keyString = publicKeyDer.toString('base64');

// Calculamos el ID (Algoritmo de Chrome: SHA256 -> Hex -> Primeros 32 chars -> a-p mapping)
const hash = crypto.createHash('sha256').update(publicKeyDer).digest('hex');
const head = hash.slice(0, 32);
const extensionId = head.split('').map(char => {
  return char >= '0' && char <= '9' 
    ? String.fromCharCode(char.charCodeAt(0) + 49) 
    : String.fromCharCode(char.charCodeAt(0) + 10);
}).join('');

console.log("==========================================");
console.log("✅ ID FIJO GENERADO:", extensionId);
console.log("==========================================");
console.log("\nCopia esta línea dentro de tu src/manifest.json (nivel raíz):\n");
console.log(`"key": "${keyString}",`);
console.log("\n==========================================");