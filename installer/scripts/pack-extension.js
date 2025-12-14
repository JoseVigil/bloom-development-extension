const fs = require('fs-extra');
const path = require('path');
const ChromeExtension = require('crx');
const crypto = require('crypto');

// ==========================================
// CONFIGURACIÓN DE RUTAS (Basado en tu Tree)
// ==========================================
// Estamos en: installer/scripts/
const installerRoot = path.resolve(__dirname, '..'); // installer/
const extensionRoot = path.join(installerRoot, 'chrome-extension'); // installer/chrome-extension/

// Inputs
const srcDir = path.join(extensionRoot, 'src');       // installer/chrome-extension/src/ (Donde está manifest.json)
const privateKeyPath = path.join(extensionRoot, 'key.pem'); // installer/chrome-extension/key.pem

// Outputs
const crxDir = path.join(extensionRoot, 'crx');       // installer/chrome-extension/crx/
const distCrx = path.join(crxDir, 'extension.crx');
const distIdJson = path.join(crxDir, 'id.json');

// Output para Electron (Vital para la integración)
const electronAppDir = path.join(installerRoot, 'electron-app');
const electronIdTxt = path.join(electronAppDir, 'extension-id.txt');

// ==========================================
// LÓGICA
// ==========================================

// Algoritmo oficial de Chrome para IDs
function generateExtensionId(publicKey) {
    const hash = crypto.createHash('sha256').update(publicKey).digest('hex');
    const head = hash.slice(0, 32);
    
    // Mapeo hexadecimal (0-9, a-f) a caracteres (a-p)
    return head.split('').map(char => {
        if (char >= '0' && char <= '9') {
            return String.fromCharCode(char.charCodeAt(0) + 49); // '0' -> 'a'
        } else {
            return String.fromCharCode(char.charCodeAt(0) + 10); // 'a' -> 'k'
        }
    }).join('');
}

async function pack() {
    console.log("📦 Iniciando empaquetado de extensión...");
    console.log(`   Fuente: ${srcDir}`);

    // 0. Validaciones previas
    if (!fs.existsSync(path.join(srcDir, 'manifest.json'))) {
        console.error("❌ ERROR CRÍTICO: No se encuentra manifest.json en " + srcDir);
        process.exit(1);
    }

    // 1. Gestión de Llave Privada (Persistencia de ID)
    if (!fs.existsSync(privateKeyPath)) {
        console.log("⚠️  key.pem no existe. Generando nueva identidad...");
        const { privateKey } = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs1', format: 'pem' }
        });
        fs.writeFileSync(privateKeyPath, privateKey);
        console.log("✅ Nueva llave guardada en key.pem");
    } else {
        console.log("🔑 Usando llave existente (key.pem)");
    }

    await fs.ensureDir(crxDir);
    await fs.ensureDir(electronAppDir);

    // 2. Generar CRX
    const crx = new ChromeExtension({
        privateKey: fs.readFileSync(privateKeyPath)
    });

    try {
        await crx.load(srcDir); // Carga desde src/ donde está el manifest
        const crxBuffer = await crx.pack();
        await fs.writeFile(distCrx, crxBuffer);
        
        // 3. Calcular ID
        const extensionId = generateExtensionId(crx.publicKey);
        
        // 4. Guardar ID para referencias
        // A) En la carpeta crx para referencia
        await fs.writeJson(distIdJson, { id: extensionId }, { spaces: 2 });
        
        // B) En la carpeta de Electron para que el instalador lo use
        await fs.writeFile(electronIdTxt, extensionId);

        console.log("\n✅ ÉXITO DE EMPAQUETADO");
        console.log("---------------------------------------------------");
        console.log(`📄 Extension ID:  ${extensionId}`);
        console.log(`📦 Archivo CRX:   ${distCrx}`);
        console.log(`🔗 ID inyectado:  ${electronIdTxt}`);
        console.log("---------------------------------------------------");

    } catch (err) {
        console.error("❌ Error al empaquetar:", err);
        process.exit(1);
    }
}

pack();