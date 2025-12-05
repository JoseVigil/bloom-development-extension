#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const platform = process.platform;
const home = process.env.HOME || process.env.USERPROFILE;

const paths = {
  bloomDir: platform === 'win32'
    ? path.join(process.env.APPDATA, 'Bloom')
    : platform === 'darwin'
    ? path.join(home, 'Library', 'Application Support', 'Bloom')
    : path.join(home, '.config', 'Bloom'),
  
  nativeHost: platform === 'win32'
    ? path.join(process.env.APPDATA, 'Bloom', 'native-host')
    : platform === 'darwin'
    ? path.join(home, 'Library', 'Application Support', 'Bloom', 'native-host')
    : path.join(home, '.config', 'Bloom', 'native-host'),
  
  chromeExt: platform === 'win32'
    ? path.join(process.env.APPDATA, 'Bloom', 'chrome-extension')
    : platform === 'darwin'
    ? path.join(home, 'Library', 'Application Support', 'Bloom', 'chrome-extension')
    : path.join(home, '.config', 'Bloom', 'chrome-extension'),
  
  vsCodeExt: path.join(home, '.vscode', 'extensions')
};

function check(name, condition, path = '') {
  const status = condition ? '✅' : '❌';
  console.log(`${status} ${name}${path ? ` (${path})` : ''}`);
  return condition;
}

console.log('\n🔍 Validando instalación de Bloom Nucleus...\n');

let allGood = true;

// 1. Directorio principal
allGood &= check('Directorio Bloom', fs.existsSync(paths.bloomDir), paths.bloomDir);

// 2. Config
const configPath = path.join(paths.bloomDir, 'config.json');
allGood &= check('Archivo de configuración', fs.existsSync(configPath), configPath);

if (fs.existsSync(configPath)) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  console.log('   📄 Version:', config.version);
  console.log('   📅 Instalado:', new Date(config.installedAt).toLocaleString());
  console.log('   🔧 Modo Dev:', config.devMode ? 'Sí' : 'No');
}

// 3. Native Host
allGood &= check('Directorio Native Host', fs.existsSync(paths.nativeHost), paths.nativeHost);

const binary = platform === 'win32' ? 'bloom-host.exe' : 'bloom-host';
const binaryPath = path.join(paths.nativeHost, binary);
allGood &= check('Binario Native Host', fs.existsSync(binaryPath), binaryPath);

const manifestPath = path.join(paths.nativeHost, 'manifest.json');
allGood &= check('Manifest Native Host', fs.existsSync(manifestPath), manifestPath);

// 4. Registro/Manifest del sistema
if (platform === 'win32') {
  try {
    execSync('reg query "HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.bloom.nucleus.host"', { stdio: 'ignore' });
    allGood &= check('Registro Windows', true);
  } catch {
    allGood &= check('Registro Windows', false);
  }
} else {
  const systemManifestPath = platform === 'darwin'
    ? path.join(home, 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts', 'com.bloom.nucleus.host.json')
    : path.join(home, '.config', 'google-chrome', 'NativeMessagingHosts', 'com.bloom.nucleus.host.json');
  
  allGood &= check('Manifest del sistema', fs.existsSync(systemManifestPath), systemManifestPath);
}

// 5. Chrome Extension
allGood &= check('Directorio Chrome Extension', fs.existsSync(paths.chromeExt), paths.chromeExt);
allGood &= check('Manifest Chrome Extension', fs.existsSync(path.join(paths.chromeExt, 'manifest.json')));

// 6. VSCode Extension
try {
  // Buscar en directorio (más confiable para dev mode)
  const extDirs = fs.readdirSync(paths.vsCodeExt).filter(d => d.includes('bloom'));
  const hasBloom = extDirs.length > 0;
  allGood &= check('VSCode Extension instalada', hasBloom);
  
  if (extDirs.length > 0) {
    console.log('   📦 Encontradas:', extDirs.join(', '));
  }
} catch (error) {
  allGood &= check('VSCode Extension', false, 'Error al verificar');
}

console.log('\n' + '='.repeat(50));
console.log(allGood ? '\n✅ Instalación completa y válida!\n' : '\n❌ Instalación incompleta o con errores\n');
console.log('='.repeat(50) + '\n');

process.exit(allGood ? 0 : 1);