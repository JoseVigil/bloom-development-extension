#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const platform = process.platform; // 'win32', 'darwin', 'linux'
const arch = process.arch; // 'x64', 'arm64'

const cppDir = path.join(__dirname, '..', 'src', 'bridge', 'c++');
const binDir = path.join(__dirname, '..', 'src', 'bridge', 'bin');
const srcFile = path.join(cppDir, 'native_bridge.cpp');

console.log('🔧 Post-install: Compilando Native Bridge');
console.log(`📍 Plataforma: ${platform} (${arch})`);
console.log('==========================================\n');

// Crear directorios necesarios
if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
}

const nlohmannDir = path.join(cppDir, 'nlohmann');
if (!fs.existsSync(nlohmannDir)) {
    fs.mkdirSync(nlohmannDir, { recursive: true });
}

// Descargar json.hpp si no existe
const jsonHeader = path.join(nlohmannDir, 'json.hpp');
if (!fs.existsSync(jsonHeader)) {
    console.log('⬇️  Descargando nlohmann/json.hpp...');
    try {
        execSync(
            `curl -L -o "${jsonHeader}" https://raw.githubusercontent.com/nlohmann/json/develop/single_include/nlohmann/json.hpp`,
            { stdio: 'inherit' }
        );
        console.log('✓ json.hpp descargado\n');
    } catch (err) {
        console.error('❌ Error descargando json.hpp');
        process.exit(1);
    }
}

// Compilar según plataforma
try {
    if (platform === 'win32') {
        compileWindows();
    } else if (platform === 'darwin') {
        compileMacOS();
    } else if (platform === 'linux') {
        compileLinux();
    } else {
        console.warn(`⚠️  Plataforma ${platform} no soportada para compilación automática`);
        console.log('Compila manualmente: cd src/bridge/c++ && ./build.sh');
        process.exit(0); // No falla, pero avisa
    }
} catch (error) {
    console.error('\n❌ Error durante la compilación:');
    console.error(error.message);
    console.log('\n💡 Puedes compilar manualmente:');
    console.log('   cd src/bridge/c++');
    console.log('   ./build.sh (macOS/Linux)');
    process.exit(1);
}

function compileWindows() {
    console.log('🔨 Compilando para Windows...\n');
    
    const outputFile = path.join(binDir, 'native_bridge.exe');
    
    // Verificar si MinGW está disponible
    try {
        execSync('where x86_64-w64-mingw32-g++', { stdio: 'pipe' });
    } catch {
        console.warn('⚠️  MinGW no encontrado en el sistema');
        console.log('Por favor instala MinGW-w64 para compilar el bridge');
        console.log('O usa una versión pre-compilada del repositorio');
        process.exit(0);
    }
    
    const compileCmd = `x86_64-w64-mingw32-g++ -std=c++20 -I"${cppDir}" "${srcFile}" -o "${outputFile}" -lws2_32 -static-libgcc -static-libstdc++ -Wl,--subsystem,console`;
    
    execSync(compileCmd, { 
        cwd: cppDir,
        stdio: 'inherit' 
    });
    
    if (fs.existsSync(outputFile)) {
        const stats = fs.statSync(outputFile);
        console.log(`✅ native_bridge.exe compilado (${(stats.size / 1024).toFixed(1)} KB)`);
    }
}

function compileMacOS() {
    console.log('🔨 Compilando para macOS...\n');
    
    const outputFile = path.join(binDir, 'native_bridge');
    const tempArm = path.join(binDir, 'native_bridge_arm');
    const tempX86 = path.join(binDir, 'native_bridge_x86');
    
    // Compilar para la arquitectura actual
    const currentArch = arch === 'arm64' ? 'arm64' : 'x86_64';
    console.log(`  → Compilando para ${currentArch}...`);
    
    const compileCmd = `clang++ -arch ${currentArch} -std=c++20 -I"${cppDir}" "${srcFile}" -o "${outputFile}"`;
    
    execSync(compileCmd, { 
        cwd: cppDir,
        stdio: 'inherit' 
    });
    
    // Dar permisos de ejecución
    fs.chmodSync(outputFile, 0o755);
    
    if (fs.existsSync(outputFile)) {
        const stats = fs.statSync(outputFile);
        console.log(`✅ native_bridge compilado para ${currentArch} (${(stats.size / 1024).toFixed(1)} KB)`);
    }
}

function compileLinux() {
    console.log('🔨 Compilando para Linux...\n');
    
    const outputFile = path.join(binDir, 'native_bridge');
    
    // Verificar g++
    try {
        execSync('which g++', { stdio: 'pipe' });
    } catch {
        console.warn('⚠️  g++ no encontrado en el sistema');
        console.log('Instala build-essential: sudo apt install build-essential');
        process.exit(1);
    }
    
    const compileCmd = `g++ -std=c++20 -I"${cppDir}" "${srcFile}" -o "${outputFile}" -lpthread`;
    
    execSync(compileCmd, { 
        cwd: cppDir,
        stdio: 'inherit' 
    });
    
    // Dar permisos de ejecución
    fs.chmodSync(outputFile, 0o755);
    
    if (fs.existsSync(outputFile)) {
        const stats = fs.statSync(outputFile);
        console.log(`✅ native_bridge compilado (${(stats.size / 1024).toFixed(1)} KB)`);
    }
}

console.log('\n==========================================');
console.log('✅ Post-install completado\n');