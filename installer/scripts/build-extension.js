const fs = require('fs-extra');
const path = require('path');
const ChromeExtension = require('crx');
const crypto = require('crypto');

// ==========================================
// CONFIGURACIÓN DE RUTAS
// ==========================================
const installerRoot = path.resolve(__dirname, '..');
const extensionRoot = path.join(installerRoot, 'chrome-extension');

const srcDir = path.join(extensionRoot, 'src');
const crxDir = path.join(extensionRoot, 'crx');
const privateKeyPath = path.join(crxDir, 'key.pem');
const distCrx = path.join(crxDir, 'extension.crx');
const distIdJson = path.join(crxDir, 'id.json');

// ==========================================
// ALGORITMO OFICIAL DE CHROME PARA IDS
// ==========================================
function generateExtensionId(publicKey) {
    const hash = crypto.createHash('sha256').update(publicKey).digest('hex');
    const head = hash.slice(0, 32);
    
    return head.split('').map(char => {
        if (char >= '0' && char <= '9') {
            return String.fromCharCode(char.charCodeAt(0) + 49);
        } else {
            return String.fromCharCode(char.charCodeAt(0) + 10);
        }
    }).join('');
}

// ==========================================
// BUILD
// ==========================================
async function build() {
    console.log("📦 Building Chrome Extension (Enterprise)...");
    console.log(`   Source: ${srcDir}`);

    // Validar manifest
    if (!fs.existsSync(path.join(srcDir, 'manifest.json'))) {
        console.error("❌ ERROR: manifest.json not found");
        process.exit(1);
    }

    await fs.ensureDir(crxDir);

    // Gestión de key.pem (persistente para enterprise)
    if (!fs.existsSync(privateKeyPath)) {
        console.log("⚠️  Generating new key.pem (SAVE THIS FILE)...");
        const { privateKey } = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs1', format: 'pem' }
        });
        fs.writeFileSync(privateKeyPath, privateKey);
        console.log("✅ New key saved to crx/key.pem");
    } else {
        console.log("🔑 Using existing key.pem");
    }

    // Generar CRX
    const crx = new ChromeExtension({
        privateKey: fs.readFileSync(privateKeyPath)
    });

    try {
        await crx.load(srcDir);
        const crxBuffer = await crx.pack();
        await fs.writeFile(distCrx, crxBuffer);
        
        // Calcular Extension ID
        const extensionId = generateExtensionId(crx.publicKey);
        
        // Guardar metadata para enterprise
        await fs.writeJson(distIdJson, {
            id: extensionId,
            updateUrl: "https://clients2.google.com/service/update2/crx",
            type: "enterprise",
            builtAt: new Date().toISOString()
        }, { spaces: 2 });

        console.log("\n✅ BUILD SUCCESSFUL");
        console.log("---------------------------------------------------");
        console.log(`📄 Extension ID:  ${extensionId}`);
        console.log(`📦 CRX File:      ${distCrx}`);
        console.log(`🔑 Private Key:   ${privateKeyPath}`);
        console.log(`📋 Metadata:      ${distIdJson}`);
        console.log("---------------------------------------------------");
        console.log("\n🏢 Enterprise Ready:");
        console.log(`   Policy Value: ${extensionId};https://clients2.google.com/service/update2/crx`);

    } catch (err) {
        console.error("❌ Build failed:", err);
        process.exit(1);
    }
}

build();