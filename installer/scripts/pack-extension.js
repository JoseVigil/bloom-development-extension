const fs = require('fs-extra');
const path = require('path');
const ChromeExtension = require('crx');
const crypto = require('crypto');

// RUTAS
const rootDir = path.join(__dirname, '..', 'chrome-extension');
const srcDir = path.join(rootDir, 'src');
const crxDir = path.join(rootDir, 'crx');
const distCrx = path.join(crxDir, 'extension.crx');
const distId = path.join(crxDir, 'id.json'); // <--- NUEVO ARCHIVO
const privateKeyPath = path.join(rootDir, 'key.pem');

// FUNCIÓN PARA CALCULAR ID DE CHROME
function calculateId(publicKey) {
    const hash = crypto.createHash('sha256').update(publicKey).digest().slice(0, 16);
    const hex = hash.toString('hex');
    let id = '';
    for (let char of hex) {
        const val = parseInt(char, 16);
        // Mapeo 0-9 -> a-j, a-f -> k-p
        id += String.fromCharCode(97 + val);
    }
    return id;
}

async function pack() {
    console.log("📦 Empaquetando...");

    // 1. Llave Privada
    if (!fs.existsSync(privateKeyPath)) {
        console.log("⚠️ Generando nueva llave...");
        const { privateKey } = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs1', format: 'pem' }
        });
        fs.writeFileSync(privateKeyPath, privateKey);
    }

    await fs.ensureDir(crxDir);

    // 2. Generar CRX
    const crx = new ChromeExtension({
        privateKey: fs.readFileSync(privateKeyPath)
    });

    try {
        await crx.load(srcDir);
        const crxBuffer = await crx.pack();
        await fs.writeFile(distCrx, crxBuffer);
        console.log(`✅ CRX generado: ${distCrx}`);

        // 3. Generar ID.json
        const extensionId = calculateId(crx.publicKey);
        await fs.writeJson(distId, { id: extensionId }, { spaces: 2 });
        
        console.log(`✅ ID calculado y guardado: ${extensionId}`);
        console.log(`📄 Metadata: ${distId}`);

    } catch (err) {
        console.error("❌ Error:", err);
    }
}

pack();