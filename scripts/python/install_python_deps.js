const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// ============================================================================
// CONFIGURACIÓN DE RUTAS (CORREGIDO)
// ============================================================================
// El script está en: .../scripts/python/install_python_deps.js
// __dirname = .../scripts/python
// ..        = .../scripts
// ../..     = .../ (Raíz del proyecto)

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const CORE_DIR = path.join(ROOT_DIR, 'core');
const LIBS_DIR = path.join(CORE_DIR, 'libs');
const REQUIREMENTS_FILE = path.join(CORE_DIR, 'requirements.txt');

// Detectar comando de Python
const isWin = process.platform === "win32";
const pythonCommand = isWin ? 'python' : 'python3';

const MINIMUM_PYTHON_VERSION = [3, 8]; // Python 3.8+

console.log('🐍 [Bloom Install] Iniciando instalación de dependencias Python...');
console.log(`📂 Contexto (Root): ${ROOT_DIR}`);

// ============================================================================
// PASO 1: Verificar que requirements.txt existe
// ============================================================================

if (!fs.existsSync(REQUIREMENTS_FILE)) {
    console.error(`❌ [Bloom Install] No se encontró: ${REQUIREMENTS_FILE}`);
    console.error(`   Ruta buscada: ${REQUIREMENTS_FILE}`);
    process.exit(1);
}

console.log(`📄 Requirements: ${REQUIREMENTS_FILE}`);

// ============================================================================
// PASO 2: Verificar versión de Python
// ============================================================================

console.log('🔍 Verificando versión de Python...');

const versionCheck = spawn(pythonCommand, ['--version'], { shell: true });

let versionOutput = '';

versionCheck.stdout.on('data', (data) => {
    versionOutput += data.toString();
});

versionCheck.stderr.on('data', (data) => {
    versionOutput += data.toString();
});

versionCheck.on('close', (code) => {
    if (code !== 0) {
        console.error('❌ [Bloom Install] Python no está instalado o no se encuentra en PATH.');
        console.error('💡 Instala Python 3.8+ desde https://www.python.org/downloads/');
        process.exit(1);
    }

    // Parsear versión (ej: "Python 3.10.5")
    const match = versionOutput.match(/Python (\d+)\.(\d+)\.(\d+)/);
    
    if (!match) {
        // Fallback por si el output es diferente, intentamos instalar igual pero avisamos
        console.warn('⚠️ [Bloom Install] No se pudo parsear la versión exacta, pero Python responde.');
        console.warn(`Salida: ${versionOutput}`);
        installDependencies();
        return;
    }

    const [_, major, minor, patch] = match.map(Number);
    console.log(`✅ Python detectado: ${major}.${minor}.${patch}`);

    // Verificar versión mínima
    if (major < MINIMUM_PYTHON_VERSION[0] || 
        (major === MINIMUM_PYTHON_VERSION[0] && minor < MINIMUM_PYTHON_VERSION[1])) {
        console.error(`❌ [Bloom Install] Se requiere Python ${MINIMUM_PYTHON_VERSION[0]}.${MINIMUM_PYTHON_VERSION[1]}+ (Detectado: ${major}.${minor}.${patch})`);
        console.error('💡 Actualiza Python desde https://www.python.org/downloads/');
        process.exit(1);
    }

    console.log(`✅ Versión compatible (mínimo: ${MINIMUM_PYTHON_VERSION[0]}.${MINIMUM_PYTHON_VERSION[1]})`);
    
    // Continuar con instalación
    installDependencies();
});

// ============================================================================
// PASO 3: Instalar dependencias
// ============================================================================

function installDependencies() {
    console.log(`📂 Target (Vendoring): ${LIBS_DIR}`);
    
    // Asegurar que existe el directorio
    if (!fs.existsSync(LIBS_DIR)) {
        fs.mkdirSync(LIBS_DIR, { recursive: true });
    }

    const args = [
        '-m', 'pip', 'install',
        '-t', LIBS_DIR,
        '-r', REQUIREMENTS_FILE,
        '--upgrade',
        '--no-user',
        '--no-warn-script-location'
    ];

    console.log(`> ${pythonCommand} ${args.join(' ')}\n`);

    const installProcess = spawn(pythonCommand, args, {
        cwd: ROOT_DIR,
        shell: true
    });

    installProcess.stdout.on('data', (data) => {
        console.log(`[pip]: ${data.toString().trim()}`);
    });

    installProcess.stderr.on('data', (data) => {
        const msg = data.toString().trim();
        // pip a veces escribe warnings en stderr, solo mostramos si hay contenido
        if (msg) console.error(`[pip msg]: ${msg}`);
    });

    installProcess.on('close', (code) => {
        if (code === 0) {
            console.log('\n✅ [Bloom Install] Dependencias Python instaladas correctamente en core/libs.');
            
            // Crear __init__.py si no existe para asegurar que sea un paquete importable
            const initFile = path.join(LIBS_DIR, '__init__.py');
            if (!fs.existsSync(initFile)) {
                fs.writeFileSync(initFile, '');
            }
            
            console.log('🎯 Listo para empaquetar con Electron\n');
        } else {
            console.error(`\n❌ [Bloom Install] Falló la instalación. Código de salida: ${code}`);
            process.exit(1);
        }
    });
}