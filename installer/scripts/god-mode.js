// --- START OF FILE scripts/god-mode.js ---
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ================= CONFIGURACIÓN =================
const EXTENSION_PATH = path.resolve(__dirname, '../chrome-extension/src');
const WORKER_ID = "Worker_Prototipo_01"; 
const USER_DATA_DIR = path.resolve(__dirname, '../temp_profiles', WORKER_ID);
const TARGET_URL = "https://chatgpt.com";

// 🔍 BÚSQUEDA INTELIGENTE DE CHROME
const possiblePaths = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    path.join(os.homedir(), "AppData\\Local\\Google\\Chrome\\Application\\chrome.exe")
];

let chromePath = possiblePaths.find(p => fs.existsSync(p));

if (!chromePath) {
    console.error("❌ ERROR FATAL: No encontré chrome.exe en las rutas estándar.");
    console.error("   Por favor, edita el script y pon la ruta correcta manualmente.");
    process.exit(1);
}
// =================================================

console.log("🚀 INICIANDO BLOOM NUCLEUS - MODO DEBUG");
console.log("---------------------------------------");
console.log(`Executable:     ${chromePath}`);
console.log(`📂 Extensión:   ${EXTENSION_PATH}`);
console.log(`👤 Perfil User: ${USER_DATA_DIR}`);
console.log("---------------------------------------");

// 1. Validar extensión
if (!fs.existsSync(path.join(EXTENSION_PATH, 'manifest.json'))) {
    console.error("❌ ERROR: No se encuentra manifest.json en:", EXTENSION_PATH);
    process.exit(1);
}

// 2. Crear directorio
if (!fs.existsSync(USER_DATA_DIR)) {
    fs.mkdirSync(USER_DATA_DIR, { recursive: true });
}

// 3. Argumentos
const args = [
    `--load-extension=${EXTENSION_PATH}`,
    `--user-data-dir=${USER_DATA_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    // Flags para ver errores en consola si falla el arranque
    '--enable-logging',
    '--v=1', 
    TARGET_URL
];

console.log("⚡ Ejecutando comando...");

// 4. Lanzamiento con STDIO INHERIT (Para ver errores)
const chromeProcess = spawn(chromePath, args, { 
    detached: false, 
    stdio: 'inherit' // <--- IMPORTANTE: Esto mostrará logs de Chrome en tu terminal
});

chromeProcess.on('error', (err) => {
    console.error("❌ Error al intentar lanzar el proceso:", err);
});

chromeProcess.on('close', (code) => {
    console.log(`⚠️ Chrome se cerró con código: ${code}`);
});

// No usamos unref() esta vez para que el script espere y veamos si explota