const crypto = require('crypto');

// TU KEY DEL MANIFEST (La pegaste arriba)
const base64Key = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArR9LQUunP5gkFNDrMzwd9iolQipvntlkmidrZ2H9t5+0rn4vshqtQH2JS+92ExmnuNazsDF353LbMAuASKNWMmFdHIsGATN6trgSoGYpRiAyDvCCxqr55gb4wZk/l8g00/l8sCOVdBzpEObUkeQPBtYQwM7bT33vJ0Z/p9yMwO0N3POHVlGODaL8T/QUTosVi58qBGx6+KOfaih6MUrr5ImVaCqIdhVMzE08jGNi6TDryuGNB0Ev0fJ1ww7jACUrIXKdzxpOCbL6WZbAqvPDkYtfSE+q6PyMiZ9YdE8fbG6dtY/Fh3KEMyqNqy3ynxBOWHKNHxdpvCylhpLUYMkQhQIDAQAB";

function calculateExtensionId(key) {
  // 1. DECODIFICAR BASE64 A BYTES (CRÍTICO)
  const buffer = Buffer.from(key, 'base64');
  
  // 2. SHA256
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  
  // 3. PRIMEROS 32 CARACTERES
  const head = hash.slice(0, 32);

  // 4. MAPEO HEX -> CHROME ALPHABET (a-p)
  // 0-9 -> a-j
  // a-f -> k-p
  return head.split('').map(char => {
    const code = parseInt(char, 16);
    return String.fromCharCode(97 + code);
  }).join('');
}

const trueId = calculateExtensionId(base64Key);
console.log("\n========================================");
console.log("🆔 ID REAL (Algoritmo Correcto):", trueId);
console.log("========================================\n");