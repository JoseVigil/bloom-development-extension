#!/usr/bin/env node
const { spawn, execSync } = require('child_process');
const path = require('path');

console.log('\n========================================');
console.log('  Bloom Nucleus - Cross-Platform Launcher');
console.log('========================================\n');

// Verificar si estamos en Windows
if (process.platform !== 'win32') {
  console.log('✅ Non-Windows detected, running normally...');
  spawn('npm', ['run', 'electron:dev'], { 
    stdio: 'inherit',
    shell: true 
  });
  process.exit(0);
}

// Verificar privilegios de administrador en Windows
function isElevated() {
  try {
    execSync('net session', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

if (isElevated()) {
  console.log('✅ Running with administrator privileges');
  console.log('🚀 Starting Electron...\n');
  
  const electron = spawn('npm', ['run', 'electron:dev'], { 
    stdio: 'inherit',
    shell: true 
  });
  
  electron.on('close', (code) => {
    process.exit(code);
  });
} else {
  console.log('⚠️  Administrator privileges required');
  console.log('🔄 Requesting elevation...\n');
  
  const scriptDir = __dirname;
  const psCommand = `Start-Process cmd -ArgumentList '/c cd /d "${scriptDir}" && npm run electron:dev && pause' -Verb RunAs`;
  
  try {
    execSync(`powershell -Command "${psCommand}"`, { 
      stdio: 'inherit',
      windowsHide: false 
    });
    console.log('\n✅ Elevation request sent');
    console.log('📝 Accept the UAC prompt to continue');
    
    // Esperar 2 segundos antes de cerrar
    setTimeout(() => process.exit(0), 2000);
  } catch (error) {
    console.error('\n❌ Failed to request elevation:', error.message);
    console.error('\n💡 Try running manually with:');
    console.error('   Right-click > Run as Administrator\n');
    process.exit(1);
  }
}