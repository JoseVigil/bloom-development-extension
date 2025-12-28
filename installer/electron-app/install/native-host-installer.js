const fs = require('fs-extra');
const { spawn } = require('child_process');
const path = require('path');
const { paths } = require('../config/paths');
const { installWindowsService } = require('./service-installer');

/**
 * Instala el Native Host y lo inicia como servicio o proceso
 */
async function installNativeHost() {
  console.log("\n📦 INSTALLING NATIVE HOST\n");

  if (!fs.existsSync(paths.nativeSource)) {
    throw new Error("Native Source not found at: " + paths.nativeSource);
  }

  const hostExe = path.join(paths.nativeSource, 'bloom-host.exe');
  if (!fs.existsSync(hostExe)) {
    throw new Error(`bloom-host.exe not found in: ${paths.nativeSource}`);
  }

  // PASO 1: Copiar archivos al directorio de destino con reintentos
  console.log("📂 Copying native files...");
  
  let copySuccess = false;
  let lastError = null;
  
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`  Attempt ${attempt}/3...`);
      
      await fs.copy(paths.nativeSource, paths.nativeDir, { 
        overwrite: true,
        errorOnExist: false 
      });
      
      console.log(" ✅ Native files copied successfully");
      copySuccess = true;
      break;
      
    } catch (copyError) {
      lastError = copyError;
      console.warn(`  ⚠️ Attempt ${attempt} failed:`, copyError.message);
      
      if (attempt < 3) {
        console.log(`  ⏳ Waiting 3 seconds before retry...`);
        await new Promise(r => setTimeout(r, 3000));
        
        // Intentar matar procesos de nuevo por si acaso
        if (process.platform === 'win32') {
          const { killAllBloomProcesses } = require('./service-installer');
          await killAllBloomProcesses();
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    }
  }
  
  if (!copySuccess) {
    console.error(" ❌ Failed to copy native files after 3 attempts");
    console.error(" 💡 The process might still be running. Try:");
    console.error("    1. Close this app completely");
    console.error("    2. Open Task Manager and kill bloom-host.exe manually");
    console.error("    3. Run installer again");
    throw new Error(`Failed to copy native files: ${lastError.message}`);
  }

  // PASO 2: Copiar NSSM si existe
  if (fs.existsSync(paths.nssmSource)) {
    const nssmExe = path.join(paths.nssmSource, 'nssm.exe');
    if (fs.existsSync(nssmExe)) {
      try {
        await fs.copy(nssmExe, paths.nssmExe, { overwrite: true });
        console.log(" ✅ NSSM copied");
      } catch (nssmError) {
        console.warn(" ⚠️ Could not copy NSSM:", nssmError.message);
      }
    }
  }

  // PASO 3: Verificar que los archivos copiados existen
  if (!fs.existsSync(paths.hostBinary)) {
    throw new Error(`bloom-host.exe not found after copy: ${paths.hostBinary}`);
  }

  // PASO 4: Iniciar como servicio (Windows) o proceso directo (Linux/Mac)
  if (process.platform === 'win32') {
    console.log("\n🔧 Installing as Windows Service...\n");
    
    // CRÍTICO: NO iniciar como proceso en Windows
    // Solo instalar el servicio
    await installWindowsService();
    
    console.log("\n✅ Native Host installed as Windows Service\n");
  } else {
    // En Linux/Mac, sí usar proceso independiente
    console.log("\n🔧 Starting as background process...\n");
    await startNativeHost();
    console.log("\n✅ Native Host started as background process\n");
  }
}

/**
 * Inicia el Native Host como proceso independiente (Linux/Mac SOLAMENTE)
 * NO DEBE SER LLAMADO EN WINDOWS
 */
async function startNativeHost() {
  if (process.platform === 'win32') {
    throw new Error('startNativeHost() should not be called on Windows. Use installWindowsService() instead.');
  }

  console.log("🚀 Starting Native Host as background process...");

  const hostExe = paths.hostBinary;

  if (!fs.existsSync(hostExe)) {
    throw new Error(`Host binary not found: ${hostExe}`);
  }

  const hostProcess = spawn(hostExe, [], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });

  hostProcess.unref();

  console.log(` ✅ Host started (PID: ${hostProcess.pid})`);

  // Guardar PID en configuración
  const config = fs.existsSync(paths.configFile)
    ? await fs.readJson(paths.configFile)
    : {};
  
  config.hostPid = hostProcess.pid;
  await fs.writeJson(paths.configFile, config, { spaces: 2 });
}

module.exports = {
  installNativeHost,
  startNativeHost
};