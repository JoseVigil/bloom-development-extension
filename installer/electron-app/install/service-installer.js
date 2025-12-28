const fs = require('fs-extra');
const { execSync } = require('child_process');
const { paths } = require('../config/paths');
const { SERVICE_NAME, DEFAULT_PORT } = require('../config/constants');

/**
 * Verifica si un servicio existe
 */
function serviceExists(name) {
  try {
    execSync(`sc query ${name}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Mata TODOS los procesos bloom-host.exe de forma agresiva
 */
async function killAllBloomProcesses() {
  console.log(` 💀 Killing all bloom-host.exe processes...`);
  
  // Intentar 3 veces con taskkill
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      execSync('taskkill /F /IM bloom-host.exe /T', { stdio: 'pipe', timeout: 5000 });
      console.log(` ✅ Processes killed (attempt ${attempt + 1})`);
    } catch (e) {
      // Si el error es "no encontrado", está bien
      if (e.message.includes('not found') || e.message.includes('no se encuentra')) {
        console.log(` ℹ️ No bloom-host.exe processes running`);
        return true;
      }
    }
    
    await new Promise(r => setTimeout(r, 2000));
    
    // Verificar si quedan procesos
    try {
      const result = execSync('tasklist /FI "IMAGENAME eq bloom-host.exe"', { encoding: 'utf8' });
      if (!result.includes('bloom-host.exe')) {
        console.log(` ✅ All processes terminated`);
        return true;
      }
    } catch {}
  }
  
  // Último intento con WMIC
  try {
    console.log(` ⚠️ Using WMIC for force termination...`);
    execSync('wmic process where name="bloom-host.exe" delete', { stdio: 'pipe', timeout: 5000 });
    await new Promise(r => setTimeout(r, 3000));
  } catch {}
  
  return false;
}

/**
 * Espera hasta que los archivos estén liberados
 */
async function waitForFilesUnlocked(maxWaitSeconds = 30) {
  console.log(` ⏳ Waiting for files to be released...`);
  
  const testFile = paths.hostBinary;
  
  for (let i = 0; i < maxWaitSeconds; i++) {
    try {
      // Intentar abrir el archivo en modo exclusivo
      const handle = fs.openSync(testFile, 'r+');
      fs.closeSync(handle);
      console.log(` ✅ Files unlocked after ${i} seconds`);
      return true;
    } catch (e) {
      if (i % 5 === 0) {
        console.log(` ⏳ Still waiting... (${i}/${maxWaitSeconds}s)`);
      }
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  
  console.warn(` ⚠️ Files may still be locked after ${maxWaitSeconds}s`);
  return false;
}

/**
 * Elimina un servicio de Windows de forma completa
 */
async function removeService(name) {
  console.log(`\n🧹 STARTING SERVICE REMOVAL: ${name}`);
  
  // PASO 1: Matar todos los procesos PRIMERO
  await killAllBloomProcesses();
  await new Promise(r => setTimeout(r, 2000));
  
  if (!serviceExists(name)) {
    console.log(` ℹ️ Service ${name} doesn't exist`);
    // Aún así, esperar que los archivos se liberen
    await waitForFilesUnlocked(10);
    return;
  }

  console.log(` 🔍 Service exists, proceeding with removal`);
  const nssm = paths.nssmExe;

  // PASO 2: Intentar con NSSM
  if (fs.existsSync(nssm)) {
    try {
      console.log(` 🛑 Stopping with NSSM...`);
      execSync(`"${nssm}" stop ${name}`, { stdio: 'ignore', timeout: 10000 });
      await new Promise(r => setTimeout(r, 3000));

      console.log(` 🗑️ Removing with NSSM...`);
      execSync(`"${nssm}" remove ${name} confirm`, { stdio: 'ignore', timeout: 10000 });

      // Verificar eliminación
      for (let i = 0; i < 10; i++) {
        if (!serviceExists(name)) {
          console.log(` ✅ Service removed with NSSM`);
          await killAllBloomProcesses(); // Por si acaso
          await waitForFilesUnlocked(15);
          return;
        }
        await new Promise(r => setTimeout(r, 1000));
      }
      
      console.warn(` ⚠️ NSSM didn't remove service completely`);
    } catch (nssmError) {
      console.warn(` ⚠️ NSSM failed:`, nssmError.message);
    }
  }

  // PASO 3: Matar procesos de nuevo por si acaso
  await killAllBloomProcesses();

  // PASO 4: Detener con PowerShell
  try {
    console.log(` 🛑 Stopping with PowerShell...`);
    execSync(`powershell -Command "Stop-Service -Name '${name}' -Force -ErrorAction SilentlyContinue"`, {
      stdio: 'ignore',
      timeout: 10000
    });
    await new Promise(r => setTimeout(r, 3000));
  } catch {}

  // PASO 5: Detener con sc
  try {
    console.log(` 🛑 Stopping with sc...`);
    execSync(`sc stop ${name}`, { stdio: 'ignore', timeout: 5000 });
    await new Promise(r => setTimeout(r, 2000));
  } catch {}

  // PASO 6: Esperar detención completa
  console.log(` ⏳ Waiting for complete stop...`);
  let stopped = false;
  for (let i = 0; i < 20; i++) {
    try {
      const out = execSync(`sc query ${name}`, { timeout: 3000 }).toString();
      if (out.includes('STOPPED') || !out.includes('RUNNING')) {
        console.log(` ✅ Service stopped`);
        stopped = true;
        break;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }

  if (!stopped) {
    console.warn(` ⚠️ Service not responding, forcing deletion...`);
  }

  // PASO 7: Matar procesos de nuevo
  await killAllBloomProcesses();

  // PASO 8: Eliminar servicio
  try {
    console.log(` 🗑️ Deleting service with sc delete...`);
    execSync(`sc delete ${name}`, { stdio: 'pipe', timeout: 5000 });
    await new Promise(r => setTimeout(r, 3000));
  } catch (delErr) {
    console.warn(` ⚠️ sc delete failed:`, delErr.message);
  }

  // PASO 9: Verificar eliminación completa
  console.log(` ⏳ Waiting for complete deletion...`);
  for (let i = 0; i < 20; i++) {
    if (!serviceExists(name)) {
      console.log(` ✅ Service completely removed`);
      break;
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  // PASO 10: Matar procesos una última vez
  await killAllBloomProcesses();
  
  // PASO 11: CRÍTICO - Esperar que los archivos se liberen
  await waitForFilesUnlocked(30);

  console.log(`✅ SERVICE REMOVAL COMPLETED\n`);
}

/**
 * Instala el servicio Windows con NSSM
 */
async function installWindowsService() {
  const binary = paths.hostBinary;
  const nssm = paths.nssmExe;

  if (!fs.existsSync(binary)) {
    throw new Error(`Host binary not found: ${binary}`);
  }

  console.log("🔧 Configuring Windows service with NSSM...");
  
  // CRÍTICO: Asegurar limpieza completa antes de instalar
  await removeService(SERVICE_NAME);

  if (!fs.existsSync(nssm)) {
    console.warn(" ⚠️ NSSM not found, trying direct sc...");
    await installWindowsServiceDirect();
    return;
  }

  // Si el servicio aún existe, intentar reconfigurar
  if (serviceExists(SERVICE_NAME)) {
    console.warn(" ⚠️ Service still exists and couldn't be removed");
    console.warn(" 💡 Attempting to reconfigure existing service...");

    try {
      execSync(`"${nssm}" set ${SERVICE_NAME} Application "${binary}"`, { stdio: 'ignore' });
      execSync(`"${nssm}" set ${SERVICE_NAME} AppParameters "--server --port=${DEFAULT_PORT}"`, { stdio: 'ignore' });
      execSync(`"${nssm}" set ${SERVICE_NAME} AppDirectory "${paths.nativeDir}"`, { stdio: 'ignore' });

      console.log(` 🚀 Starting reconfigured service: ${SERVICE_NAME}`);
      execSync(`"${nssm}" start ${SERVICE_NAME}`, { stdio: 'pipe' });
      console.log(" ✅ Service reconfigured and started");
      return;
    } catch (reconfigError) {
      console.error(" ❌ Couldn't reconfigure existing service");
      throw new Error(`Service ${SERVICE_NAME} exists and can't be modified. Run manually: sc delete ${SERVICE_NAME}`);
    }
  }

  // Instalar servicio nuevo
  console.log(` ➕ Installing service with NSSM: ${SERVICE_NAME}`);

  try {
    execSync(
      `"${nssm}" install ${SERVICE_NAME} "${binary}" --server --port=${DEFAULT_PORT}`,
      { stdio: 'pipe' }
    );
  } catch (installError) {
    console.error(" ❌ Error installing service:", installError.message);
    throw new Error(`Couldn't install service: ${installError.message}`);
  }

  // Configurar servicio
  try {
    execSync(`"${nssm}" set ${SERVICE_NAME} Description "Bloom Nucleus Native Messaging Host"`, { stdio: 'ignore' });
    execSync(`"${nssm}" set ${SERVICE_NAME} Start SERVICE_AUTO_START`, { stdio: 'ignore' });
    execSync(`"${nssm}" set ${SERVICE_NAME} AppDirectory "${paths.nativeDir}"`, { stdio: 'ignore' });
    execSync(`"${nssm}" set ${SERVICE_NAME} AppExit Default Restart`, { stdio: 'ignore' });
  } catch {}

  // Iniciar servicio
  console.log(` 🚀 Starting service: ${SERVICE_NAME}`);
  try {
    execSync(`"${nssm}" start ${SERVICE_NAME}`, { stdio: 'pipe' });
    console.log(" ✅ Windows service installed and started with NSSM");
  } catch (startError) {
    console.warn(" ⚠️ Service installed but couldn't start");
    console.warn(" 📋 Error:", startError.message);

    try {
      execSync(`sc start ${SERVICE_NAME}`, { stdio: 'inherit' });
      console.log(" ✅ Service started with sc");
    } catch {
      console.warn(" ⚠️ Service will start automatically on next reboot");
    }
  }
}

/**
 * Instala el servicio Windows directamente (sin NSSM)
 */
async function installWindowsServiceDirect() {
  const binary = paths.hostBinary;
  console.log("🔧 Configuring Windows service (direct mode)...");

  const binPath = `"${binary}" --server --port=${DEFAULT_PORT}`;

  console.log(` ➕ Creating service: ${SERVICE_NAME}`);
  execSync(
    `sc create ${SERVICE_NAME} binPath= "${binPath}" start= auto DisplayName= "Bloom Nucleus Host"`,
    { stdio: 'inherit' }
  );

  console.log(` 🔧 Configuring auto-recovery`);
  execSync(
    `sc failure ${SERVICE_NAME} reset= 86400 actions= restart/60000`,
    { stdio: 'inherit' }
  );

  console.log(` 🚀 Starting service: ${SERVICE_NAME}`);
  try {
    execSync(`sc start ${SERVICE_NAME}`, { stdio: 'pipe' });
    console.log(" ✅ Service started");
  } catch (startError) {
    console.warn(" ⚠️ Error 1053: Binary doesn't respond as Windows service");
    console.warn(" 💡 Solution: Service requires NSSM or compilation as service");
    console.warn(" ℹ️ Service will start automatically on next reboot");
  }
}

module.exports = {
  serviceExists,
  removeService,
  installWindowsService,
  installWindowsServiceDirect,
  killAllBloomProcesses
};