const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Configuración de rutas
const ROOT_DIR = path.resolve(__dirname, '..');
const CORE_DIR = path.join(ROOT_DIR, 'core');
const LIBS_DIR = path.join(CORE_DIR, 'libs');
const REQUIREMENTS_FILE = path.join(CORE_DIR, 'requirements.txt');

// Detectar comando de Python (python en Win, python3 en Mac/Linux usualmente)
const isWin = process.platform === "win32";
const pythonCommand = isWin ? 'python' : 'python3';

console.log('🐍 [Bloom Install] Iniciando instalación de dependencias Python...');
console.log(`📂 Target: ${LIBS_DIR}`);

// Asegurar que existe el directorio
if (!fs.existsSync(LIBS_DIR)) {
    fs.mkdirSync(LIBS_DIR, { recursive: true });
}

// Argumentos para pip
// -m pip: Usa el módulo pip del python actual
// install: comando
// -t: Target (donde instalar)
// -r: Requirements file
// --upgrade: Actualizar si existen
// --no-user: Evitar instalar en usuario (queremos local)
const args = [
    '-m', 'pip', 'install',
    '-t', LIBS_DIR,
    '-r', REQUIREMENTS_FILE,
    '--upgrade',
    '--no-user',
    '--no-warn-script-location'
];

console.log(`> ${pythonCommand} ${args.join(' ')}`);

const installProcess = spawn(pythonCommand, args, {
    cwd: ROOT_DIR,
    shell: true
});

installProcess.stdout.on('data', (data) => {
    console.log(`[pip]: ${data.toString().trim()}`);
});

installProcess.stderr.on('data', (data) => {
    console.error(`[pip error]: ${data.toString().trim()}`);
});

installProcess.on('close', (code) => {
    if (code === 0) {
        console.log('✅ [Bloom Install] Dependencias Python instaladas correctamente en core/libs.');
        
        // Paso extra: Crear un archivo marcador vacio __init__.py si no existe
        // para asegurar que Python trate a libs como paquete si fuera necesario
        const initFile = path.join(LIBS_DIR, '__init__.py');
        if (!fs.existsSync(initFile)) {
            fs.writeFileSync(initFile, '');
        }
    } else {
        console.error(`❌ [Bloom Install] Falló la instalación. Código de salida: ${code}`);
        process.exit(1);
    }
});