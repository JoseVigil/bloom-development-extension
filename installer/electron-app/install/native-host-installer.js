const fs = require('fs-extra');
const { spawn } = require('child_process');
const path = require('path');
const { paths } = require('../config/paths');
const { installWindowsService, startService, NEW_SERVICE_NAME } = require('./service-installer');

/**
 * Orquesta la instalación de binarios (Host y Brain) y el Servicio.
 */
async function installNativeHost() {
  console.log("\n📦 DEPLOYING BINARIES & SERVICE\n");

  // ==========================================================================
  // PASO 1: Copiar Native Host (bloom-host.exe)
  // Chrome lo necesita para Native Messaging, aunque no sea el servicio.
  // ==========================================================================
  console.log("📂 Deploying Native Host (Client)...");

  if (!fs.existsSync(paths.nativeSource)) {
    throw new Error("Native Source not found at: " + paths.nativeSource);
  }

  // Copia con reintentos (por si hay bloqueos)
  await copyWithRetry(paths.nativeSource, paths.nativeDir, 'bloom-host.exe');
  
  // Verificar
  if (!fs.existsSync(paths.hostBinary)) {
    throw new Error(`bloom-host.exe not found after copy: ${paths.hostBinary}`);
  }
  console.log("  ✅ Native Host deployed");

  // ==========================================================================
  // PASO 2: Copiar Brain CLI (brain.exe)
  // Este es el nuevo SERVICIO CENTRAL.
  // ==========================================================================
  console.log("📂 Deploying Brain Service (Server)...");
  
  console.log(`   Source: ${paths.brainSource}`);
  console.log(`   Dest:   ${paths.brainDir}`);

  if (!fs.existsSync(paths.brainSource)) {
    throw new Error(`Brain Source not found at: ${paths.brainSource}. \n👉 Did you run 'python scripts/build_brain.py'?`);
  }

  // Asegurar que el directorio padre (bin) exista
  await fs.ensureDir(path.dirname(paths.brainDir));

  console.log("🔂 Deploying Brain Service (Server)...");

  const brainBinDir = path.join(paths.binDir, 'brain');
  console.log(`   Source: ${paths.brainSource}`);
  console.log(`   Dest:   ${brainBinDir}`);

  if (!fs.existsSync(paths.brainSource)) {
    throw new Error(`Brain Source not found at: ${paths.brainSource}`);
  }

  await fs.ensureDir(brainBinDir);
  await copyWithRetry(paths.brainSource, brainBinDir, 'brain.exe');

  // Verificar
  if (!fs.existsSync(paths.brainExe)) {
    throw new Error(`brain.exe not found after copy: ${paths.brainExe}`);
  }
  console.log("  ✅ Brain Service deployed");

  // ==========================================================================
  // PASO 3: Instalar y Arrancar Servicio (Solo Windows)
  // ==========================================================================
  if (process.platform === 'win32') {
    console.log("\n🔧 Configuring Windows Service...\n");
    
    // Instalar BloomBrainService (apunta a brain.exe)
    await installWindowsService();
    
    // Iniciar
    console.log("\n▶️ Starting service...\n");
    await startService(NEW_SERVICE_NAME); // Usamos la constante importada
    
    console.log("\n✅ Infrastructure ready: Brain Service running + Native Host ready for Chrome\n");
  } else {
    // Linux/Mac (Futuro)
    console.log("\n🔧 Starting background process (Non-Windows)...\n");
    // TODO: Implementar launchd o systemd para Brain
  }
}

/**
 * Helper para copiar con reintentos y manejo de procesos bloqueados
 */
async function copyWithRetry(src, dest, processNameToCheck) {
  let lastError = null;
  
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      // Intentar copiar
      await fs.copy(src, dest, { overwrite: true, errorOnExist: false });
      return; // Éxito
      
    } catch (err) {
      lastError = err;
      console.warn(`  ⚠️ Copy attempt ${attempt} failed: ${err.message}`);
      
      if (attempt < 3) {
        console.log(`  ⏳ Retrying in 2s...`);
        
        // Si estamos en Windows, intentar matar el proceso que podría estar bloqueando el archivo
        if (process.platform === 'win32' && processNameToCheck) {
          try {
            const { execSync } = require('child_process');
            execSync(`taskkill /F /IM ${processNameToCheck}`, { stdio: 'ignore' });
            console.log(`  🔪 Forced kill of ${processNameToCheck}`);
          } catch (e) { /* Ignorar si no estaba corriendo */ }
        }
        
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }
  
  throw new Error(`Failed to copy files after 3 attempts: ${lastError.message}`);
}

module.exports = { installNativeHost };