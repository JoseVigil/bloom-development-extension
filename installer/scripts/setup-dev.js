const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

// ================= CONFIGURACIÓN =================
const HOST_NAME = "com.bloom.nucleus.bridge";
const ROOT_DIR = path.resolve(__dirname, '..'); // installer/

// Rutas de archivos
const MANIFEST_PATH = path.join(ROOT_DIR, 'chrome-extension', 'src', 'manifest.json');
const HOST_JSON_OUTPUT = path.join(ROOT_DIR, 'native', 'host', 'com.bloom.nucleus.bridge.json');
const HOST_EXE_PATH = path.join(ROOT_DIR, 'native', 'bin', 'win32', 'bloom-host.exe'); 

console.log("🛠️  CONFIGURANDO ENTORNO DE DESARROLLO BLOOM NUCLEUS\n");

// ---------------------------------------------------------
// PASO 1: LIMPIEZA DE REGISTRO (Anti-Bloqueo)
// ---------------------------------------------------------
console.log("1️⃣  Limpiando políticas viejas...");
const keysToDelete = [
    'HKLM\\SOFTWARE\\Policies\\Google\\Chrome\\ExtensionInstallForcelist',
    'HKCU\\SOFTWARE\\Policies\\Google\\Chrome\\ExtensionInstallForcelist'
];

keysToDelete.forEach(key => {
    try {
        execSync(`reg delete "${key}" /f`, { stdio: 'ignore' });
    } catch (e) { /* Ignorar si no existe */ }
});
console.log("   ✅ Registro limpio.");

// ---------------------------------------------------------
// PASO 2: OBTENER ID DE LA EXTENSIÓN
// ---------------------------------------------------------
console.log("2️⃣  Calculando ID de Extensión...");
if (!fs.existsSync(MANIFEST_PATH)) {
    console.error("❌ ERROR: No existe manifest.json");
    process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
if (!manifest.key) {
    console.error("❌ ERROR: El manifest.json no tiene 'key'.");
    process.exit(1);
}

// Algoritmo oficial de Chrome para ID
const hash = crypto.createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest('hex');
const extensionId = hash.slice(0, 32).split('').map(char => {
    return char >= '0' && char <= '9' 
        ? String.fromCharCode(char.charCodeAt(0) + 49) 
        : String.fromCharCode(char.charCodeAt(0) + 10);
}).join('');

console.log(`   🔑 ID: ${extensionId}`);

// ---------------------------------------------------------
// PASO 3: GENERAR JSON DEL HOST
// ---------------------------------------------------------
console.log("3️⃣  Configurando Native Host...");

// Verificar si existe el .exe (solo advertencia si no está compilado aún)
if (!fs.existsSync(HOST_EXE_PATH)) {
    console.warn(`   ⚠️  ADVERTENCIA: No encuentro bloom-host.exe en: ${HOST_EXE_PATH}`);
    console.warn("       Asegúrate de compilar el C++ antes de probar.");
}

const hostData = {
    name: HOST_NAME,
    description: "Bloom Nucleus Host (Dev)",
    path: HOST_EXE_PATH,
    type: "stdio",
    allowed_origins: [`chrome-extension://${extensionId}/`]
};

// Crear carpeta si falta
const hostDir = path.dirname(HOST_JSON_OUTPUT);
if (!fs.existsSync(hostDir)) fs.mkdirSync(hostDir, { recursive: true });

fs.writeFileSync(HOST_JSON_OUTPUT, JSON.stringify(hostData, null, 2));
console.log(`   📄 JSON creado en: ${HOST_JSON_OUTPUT}`);

// ---------------------------------------------------------
// PASO 4: REGISTRAR HOST EN WINDOWS
// ---------------------------------------------------------
console.log("4️⃣  Registrando en Windows (HKCU)...");
const regKey = `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`;
try {
    execSync(`reg add "${regKey}" /ve /t REG_SZ /d "${HOST_JSON_OUTPUT}" /f`);
    console.log(`   ✅ Host registrado correctamente.`);
} catch (error) {
    console.error(`❌ ERROR al registrar: ${error.message}`);
}

console.log("\n✅ SETUP COMPLETADO. Ahora puedes correr 'node god-mode.js'");