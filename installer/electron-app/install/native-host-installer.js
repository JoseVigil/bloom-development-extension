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
  // PASO 0: Copiar NSSM (Vital para instalar servicios)
  // ==========================================================================
  console.log("📂 Deploying NSSM...");
  
  // paths.nssmSource viene del repo/build
  // paths.nativeDir es %LOCALAPPDATA%/BloomNucleus/native
  
  if (!fs.existsSync(paths.nssmSource)) {
      throw new Error(`NSSM Source not found at: ${paths.nssmSource}`);
  }

  // Copiar nssm.exe a la carpeta native del usuario
  await copyWithRetry(paths.nssmSource, paths.nativeDir, 'nssm.exe');
  
  // Verificar
  const nssmDest = path.join(paths.nativeDir, 'nssm.exe');
  if (!fs.existsSync(nssmDest)) {
      throw new Error(`nssm.exe not found after copy: ${nssmDest}`);
  }
  console.log("  ✅ NSSM deployed");

  // ==========================================================================
  // PASO 1: Copiar Native Host (bloom-host.exe)
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
  // ==========================================================================
  console.log("📂 Deploying Brain Service (Server)...");
  
  console.log(`   Source: ${paths.brainSource}`);
  console.log(`   Dest:   ${paths.brainDir}`);

  if (!fs.existsSync(paths.brainSource)) {
    throw new Error(`Brain Source not found at: ${paths.brainSource}. \n👉 Did you run 'python scripts/build_brain.py'?`);
  }

  // Asegurar que el directorio padre (bin) exista
  await fs.ensureDir(path.dirname(paths.brainDir));

  // Copiar la carpeta 'brain' completa (incluye _internal y dlls)
  await copyWithRetry(paths.brainSource, paths.brainDir, 'brain.exe');

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
    await startService(NEW_SERVICE_NAME); 
    
    console.log("\n✅ Infrastructure ready: Brain Service running + Native Host ready for Chrome\n");
  } else {
    // Linux/Mac (Futuro)
    console.log("\n🔧 Starting background process (Non-Windows)...\n");
  }
}

/**
 * Helper para copiar con reintentos y manejo de procesos bloqueados
 */
async function copyWithRetry(src, dest, processNameToCheck) {
  let lastError = null;
  
  // Si dest es un archivo (ej: nssm.exe), copiamos archivo. Si es carpeta, copy recursivo.
  const isFile = fs.lstatSync(src).isFile();

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      if (isFile) {
        // Si el destino es un directorio, agregar el nombre del archivo
        const destFile = path.extname(dest) ? dest : path.join(dest, path.basename(src));
        await fs.copy(src, destFile, { overwrite: true });
      } else {
        await fs.copy(src, dest, { overwrite: true, errorOnExist: false });
      }
      return; 
      
    } catch (err) {
      lastError = err;
      console.warn(`  ⚠️ Copy attempt ${attempt} failed: ${err.message}`);
      
      if (attempt < 3) {
        console.log(`  ⏳ Retrying in 2s...`);
        if (process.platform === 'win32' && processNameToCheck) {
          try {
            const { execSync } = require('child_process');
            execSync(`taskkill /F /IM ${processNameToCheck}`, { stdio: 'ignore' });
          } catch (e) { }
        }
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }
  throw new Error(`Failed to copy files after 3 attempts: ${lastError.message}`);
}

module.exports = { installNativeHost };