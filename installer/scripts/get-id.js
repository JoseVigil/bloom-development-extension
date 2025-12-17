// --- START OF FILE get-id.js ---
const crypto = require('crypto');

// Esta es LA MISMA clave que pusimos en el manifest
const keyString = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArR9LQUunP5gkFNDrMzwd9iolQipvntlkmidrZ2H9t5+0rn4vshqtQH2JS+92ExmnuNazsDF353LbMAuASKNWMmFdHIsGATN6trgSoGYpRiAyDvCCxqr55gb4wZk/l8g00/l8sCOVdBzpEObUkeQPBtYQwM7bT33vJ0Z/p9yMwO0N3POHVlGODaL8T/QUTosVi58qBGx6+KOfaih6MUrr5ImVaCqIdhVMzE08jGNi6TDryuGNB0Ev0fJ1ww7jACUrIXKdzxpOCbL6WZbAqvPDkYtfSE+q6PyMiZ9YdE8fbG6dtY/Fh3KEMyqNqy3ynxBOWHKNHxdpvCylhpLUYMkQhQIDAQAB";

// 1. Decodificar Base64 a Buffer
const buffer = Buffer.from(keyString, 'base64');

// 2. Calcular SHA256
const hash = crypto.createHash('sha256').update(buffer).digest('hex');

// 3. Tomar los primeros 32 caracteres
const head = hash.slice(0, 32);

// 4. Convertir a formato de Chrome (a-p)
// 0-9 se mapean a a-j (sumando 49 a charCode)
// a-f se mapean a k-p (sumando 10 a charCode)
const extensionId = head.split('').map(char => {
  if (char >= '0' && char <= '9') {
    return String.fromCharCode(char.charCodeAt(0) + 49);
  } else {
    return String.fromCharCode(char.charCodeAt(0) + 10);
  }
}).join('');

console.log("\n🔑 TU EXTENSION ID ES:");
console.log("==================================");
console.log(extensionId);
console.log("==================================\n");
console.log("👉 Copia este ID y ponlo en tu archivo 'com.bloom.nucleus.bridge.json' en 'allowed_origins'.");