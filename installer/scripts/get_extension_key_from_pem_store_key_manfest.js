const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Script Automático:
 * 1. Extrae Public Key de PEM.
 * 2. Inyecta la Key en manifest.json.
 * 3. Calcula el ID final de la extensión.
 */

const PEM_PATH = path.join(__dirname, '..', 'chrome-extension', 'pem', 'key_generation_extesion.pem');
const MANIFEST_PATH = path.join(__dirname, '..', 'chrome-extension', 'src', 'manifest.json');

function updateManifestAndGetId() {
    try {
        // --- 1. VALIDACIÓN DE ARCHIVOS ---
        if (!fs.existsSync(PEM_PATH)) {
            throw new Error(`No se encontró el archivo PEM en: ${PEM_PATH}`);
        }
        if (!fs.existsSync(MANIFEST_PATH)) {
            throw new Error(`No se encontró el manifest.json en: ${MANIFEST_PATH}`);
        }

        // --- 2. EXTRACCIÓN DE LA KEY ---
        const pemContent = fs.readFileSync(PEM_PATH, 'utf8');
        const privateKeyObject = crypto.createPrivateKey(pemContent);
        const publicKeyObject = crypto.createPublicKey(privateKeyObject);
        const publicKeyDer = publicKeyObject.export({ type: 'spki', format: 'der' });
        const base64Key = publicKeyDer.toString('base64');

        // --- 3. CÁLCULO DEL ID (Para verificación) ---
        // El ID de Chrome son los primeros 32 caracteres del hash SHA256 de la clave DER
        // convertidos a un alfabeto especial (a-p)
        const hash = crypto.createHash('sha256').update(publicKeyDer).digest('hex').slice(0, 32);
        const extensionId = hash.split('').map(char => {
            return String.fromCharCode(parseInt(char, 16) + 97);
        }).join('');

        // --- 4. ACTUALIZACIÓN DEL MANIFEST.JSON ---
        const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
        
        // Inyectamos la llave (esto sobreescribe si ya existe o la crea si no)
        manifest.key = base64Key;

        // Guardamos el archivo con formato prolijo (2 espacios)
        fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');

        console.log('\n================================================================');
        console.log('✅ PROCESO COMPLETADO EXITOSAMENTE');
        console.log('================================================================');
        console.log(`\n1. ARCHIVO ACTUALIZADO: ${path.basename(MANIFEST_PATH)}`);
        console.log(`2. EXTENSION ID FIJO:  ${extensionId}`);
        console.log('\n----------------------------------------------------------------');
        console.log('Usa este ID para configurar tus White-lists o Native Messaging.');
        console.log('================================================================\n');

    } catch (error) {
        console.error('\n❌ ERROR CRÍTICO:');
        console.error(error.message);
        process.exit(1);
    }
}

updateManifestAndGetId();