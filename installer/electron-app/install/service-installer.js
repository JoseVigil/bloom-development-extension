// install/service-installer.js - REFACTORIZADO SEGÚN GUÍA UNIFICADA FINAL
// ============================================================================
// ARQUITECTURA HUB & SPOKE (MULTIPLEXOR)
// - Servicio: BloomBrainService → brain.exe service start (AUTO_START via NSSM)
// - bloom-host.exe: solo archivo, lanzado por Chrome, nunca por Electron ni instalador
// ============================================================================

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const { paths } = require('../config/paths');

// ============================================================================
// CONSTANTES - GOLDEN TRUTH
// ============================================================================

const OLD_SERVICE_NAME = 'BloomNucleusHost'; // Servicio VIEJO a eliminar
const NEW_SERVICE_NAME = 'BloomBrainService'; // Servicio NUEVO correcto

// ============================================================================
// UTILIDADES BÁSICAS
// ============================================================================

/**
 * Verifica si un servicio existe en el sistema
 */
function serviceExists(serviceName) {
  try {
    const result = execSync(`sc query "${serviceName}"`, { 
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    return !result.includes('does not exist');
  } catch (error) {
    return false;
  }
}

/**
 * Detiene un servicio Windows
 */
async function stopService(serviceName, maxRetries = 5) {
  console.log(`🛑 Attempting to stop service: ${serviceName}`);
  
  if (!serviceExists(serviceName)) {
    console.log(`ℹ️ Service ${serviceName} does not exist, skipping stop`);
    return true;
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      execSync(`sc stop "${serviceName}"`, { 
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      });
      
      console.log(`⏳ Waiting for service to stop (attempt ${attempt}/${maxRetries})...`);
      
      // Esperar a que el servicio esté STOPPED
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 1000));
        
        const status = execSync(`sc query "${serviceName}"`, { encoding: 'utf8' });
        
        if (status.includes('STOPPED')) {
          console.log(`✅ Service stopped successfully on attempt ${attempt}`);
          return true;
        }
        
        if (status.includes('STOP_PENDING')) {
          console.log(`⏳ Service is stopping... (${i + 1}/10)`);
          continue;
        }
      }
      
      if (attempt < maxRetries) {
        console.warn(`⚠️ Service did not stop gracefully, force killing processes...`);
        await killAllBloomProcesses();
        await new Promise(r => setTimeout(r, 2000));
      }
      
    } catch (error) {
      if (error.message.includes('does not exist')) {
        console.log(`ℹ️ Service no longer exists`);
        return true;
      }
      
      if (attempt === maxRetries) {
        console.error(`❌ Failed to stop service after ${maxRetries} attempts:`, error.message);
        await killAllBloomProcesses();
        await new Promise(r => setTimeout(r, 3000));
        return false;
      }
      
      console.warn(`⚠️ Attempt ${attempt} failed, retrying...`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  
  return false;
}

/**
 * Elimina un servicio Windows
 */
async function removeService(serviceName) {
  console.log(`🗑️ Removing service: ${serviceName}`);
  
  if (!serviceExists(serviceName)) {
    console.log(`ℹ️ Service ${serviceName} does not exist, nothing to remove`);
    return true;
  }
  
  // Primero detener
  await stopService(serviceName);
  await new Promise(r => setTimeout(r, 2000));
  
  // Eliminar con sc
  try {
    execSync(`sc delete "${serviceName}"`, { 
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    console.log(`✅ Service ${serviceName} removed successfully`);
    await new Promise(r => setTimeout(r, 2000));
    return true;
  } catch (error) {
    if (error.message.includes('does not exist')) {
      console.log(`ℹ️ Service already removed`);
      return true;
    }
    console.error(`❌ Failed to remove service:`, error.message);
    return false;
  }
}

/**
 * Mata todos los procesos relacionados con Bloom
 */
async function killAllBloomProcesses() {
  console.log('🔪 Killing all Bloom-related processes...');
  
  const processesToKill = [
    'bloom-host.exe',
    'brain.exe',
    'python.exe',
    'pythonw.exe'
  ];
  
  let killedCount = 0;
  
  for (const processName of processesToKill) {
    try {
      const tasklistResult = execSync(
        `tasklist /FI "IMAGENAME eq ${processName}"`, 
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
      );
      
      if (!tasklistResult.includes(processName)) {
        continue;
      }
      
      // Para python/pythonw, solo matar los de nuestro directorio
      if (processName === 'python.exe' || processName === 'pythonw.exe') {
        try {
          const wmicResult = execSync(
            `wmic process where "name='${processName}'" get commandline,processid /format:csv`,
            { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
          );
          
          const lines = wmicResult.split('\n').filter(l => l.trim());
          for (const line of lines) {
            if (line.includes(paths.bloomBase) || line.includes('BloomNucleus')) {
              const pidMatch = line.match(/,(\d+)$/);
              if (pidMatch) {
                const pid = pidMatch[1];
                try {
                  execSync(`taskkill /F /PID ${pid}`, { 
                    stdio: ['pipe', 'pipe', 'ignore'] 
                  });
                  killedCount++;
                  console.log(`  ✅ Killed ${processName} (PID: ${pid})`);
                } catch (e) {
                  // Ignorar
                }
              }
            }
          }
        } catch (wmicError) {
          try {
            execSync(`taskkill /F /IM ${processName}`, { 
              stdio: ['pipe', 'pipe', 'ignore'] 
            });
            killedCount++;
            console.log(`  ✅ Killed all ${processName} processes (fallback)`);
          } catch (e) {
            // Ignorar
          }
        }
      } else {
        // Para brain.exe y bloom-host.exe, matar todos
        try {
          execSync(`taskkill /F /IM ${processName}`, { 
            stdio: ['pipe', 'pipe', 'ignore'] 
          });
          killedCount++;
          console.log(`  ✅ Killed ${processName}`);
        } catch (e) {
          // Ignorar
        }
      }
      
    } catch (error) {
      // Ignorar
    }
  }
  
  if (killedCount > 0) {
    console.log(`✅ Killed ${killedCount} processes`);
    await new Promise(r => setTimeout(r, 2000));
  } else {
    console.log('ℹ️ No Bloom processes found running');
  }
}

// ============================================================================
// LIMPIEZA AGRESIVA - GOLDEN TRUTH STEP 1
// ============================================================================

/**
 * Elimina TODOS los servicios viejos (BloomNucleusHost)
 * Usa TANTO nssm como sc para asegurar limpieza completa
 */
async function cleanupOldServices() {
  console.log('\n🧹 LIMPIEZA AGRESIVA - Eliminando servicios viejos\n');
  
  const oldServices = [
    'BloomNucleusHost',
    'BloomNativeHost',
    'BloomHost'
  ];
  
  for (const serviceName of oldServices) {
    if (!serviceExists(serviceName)) {
      console.log(`✅ ${serviceName} no existe (OK)`);
      continue;
    }
    
    console.log(`⚠️ Detectado servicio viejo: ${serviceName}`);
    
    // Intentar con NSSM primero (si existe)
    const nssmPath = await findNSSM();
    if (nssmPath) {
      try {
        console.log(`   Intentando: nssm stop ${serviceName}`);
        execSync(`"${nssmPath}" stop "${serviceName}"`, {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'ignore']
        });
        await new Promise(r => setTimeout(r, 2000));
        
        console.log(`   Intentando: nssm remove ${serviceName} confirm`);
        execSync(`"${nssmPath}" remove "${serviceName}" confirm`, {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'ignore']
        });
        console.log(`   ✅ Eliminado con NSSM`);
      } catch (e) {
        console.log(`   ⚠️ NSSM falló, usando sc...`);
      }
    }
    
    // Intentar con sc (por si fue instalado sin NSSM)
    try {
      console.log(`   Intentando: sc stop ${serviceName}`);
      execSync(`sc stop "${serviceName}"`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      });
      await new Promise(r => setTimeout(r, 2000));
    } catch (e) {
      // Ignorar
    }
    
    try {
      console.log(`   Intentando: sc delete ${serviceName}`);
      execSync(`sc delete "${serviceName}"`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      });
      console.log(`   ✅ Eliminado con sc`);
    } catch (e) {
      console.warn(`   ⚠️ No se pudo eliminar: ${e.message}`);
    }
    
    await new Promise(r => setTimeout(r, 2000));
  }
  
  // Matar procesos huérfanos
  console.log('\n🔪 Matando procesos huérfanos...');
  await killAllBloomProcesses();
  
  console.log('\n✅ Limpieza completada\n');
}

// ============================================================================
// BÚSQUEDA DE NSSM
// ============================================================================

/**
 * Busca NSSM en múltiples ubicaciones
 */
async function findNSSM() {
  const locations = [
    paths.nssmExe,
    paths.nssmSource ? path.join(paths.nssmSource, 'nssm.exe') : null,
    path.join(process.cwd(), 'nssm', 'nssm.exe'),
    path.join(process.cwd(), 'native', 'nssm', 'nssm.exe'),
    path.join(__dirname, '..', 'nssm', 'nssm.exe'),
    path.join(__dirname, '..', 'native', 'nssm', 'nssm.exe'),
    path.join(__dirname, '..', '..', 'nssm', 'nssm.exe'),
    path.join(__dirname, '..', '..', 'native', 'nssm', 'nssm.exe')
  ].filter(Boolean);
  
  for (const location of locations) {
    if (await fs.pathExists(location)) {
      console.log(`✅ Found NSSM at: ${location}`);
      return location;
    }
  }
  
  return null;
}

// ============================================================================
// INSTALACIÓN DEL SERVICIO CORRECTO - GOLDEN TRUTH STEP 2
// ============================================================================

/**
 * Instala el servicio CORRECTO: BloomBrainService
 * Target: brain.exe service start
 * Configuración: AUTO_START, logs en %LOCALAPPDATA%/BloomNucleus/logs
 */
async function installWindowsService() {
  console.log('\n📦 INSTALANDO SERVICIO CORRECTO: BloomBrainService\n');
  
  // 1. Buscar NSSM
  let nssmPath = await findNSSM();
  
  if (!nssmPath) {
    throw new Error(`NSSM not found. Searched in multiple locations.`);
  }
  
  // 2. Verificar que brain.exe existe
  const brainExe = paths.brainExe;
  
  if (!await fs.pathExists(brainExe)) {
    throw new Error(`brain.exe not found at: ${brainExe}`);
  }
  
  console.log(`✅ brain.exe encontrado: ${brainExe}`);
  
  // 3. Si el servicio correcto ya existe, removerlo primero
  if (serviceExists(NEW_SERVICE_NAME)) {
    console.log('⚠️ BloomBrainService ya existe, removiendo...');
    await removeService(NEW_SERVICE_NAME);
  }
  
  // 4. Instalar servicio con NSSM
  console.log(`\n🔧 Instalando servicio con NSSM...`);
  console.log(`   Servicio: ${NEW_SERVICE_NAME}`);
  console.log(`   Ejecutable: ${brainExe}`);
  console.log(`   Argumentos: service start`);
  
  try {
    // Comando: nssm install BloomBrainService "C:\...\brain.exe" "service start"
    execSync(`"${nssmPath}" install "${NEW_SERVICE_NAME}" "${brainExe}" service start`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    console.log('✅ Servicio instalado');
    
    // 5. Configurar Display Name
    execSync(`"${nssmPath}" set "${NEW_SERVICE_NAME}" DisplayName "Bloom Brain Service"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    
    // 6. Configurar Description
    execSync(`"${nssmPath}" set "${NEW_SERVICE_NAME}" Description "Bloom Nucleus Brain TCP Multiplexer Service"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    
    // 7. Configurar AUTO_START
    execSync(`"${nssmPath}" set "${NEW_SERVICE_NAME}" Start SERVICE_AUTO_START`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    console.log('✅ Configurado como AUTO_START');
    
    // 8. Configurar directorio de trabajo
    const workDir = path.dirname(brainExe);
    execSync(`"${nssmPath}" set "${NEW_SERVICE_NAME}" AppDirectory "${workDir}"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    
    // 9. Configurar LOGS en %LOCALAPPDATA%/BloomNucleus/logs
    const logDir = paths.logsDir;
    await fs.ensureDir(logDir);
    
    const stdoutLog = path.join(logDir, 'brain_service.log');
    const stderrLog = path.join(logDir, 'brain_service.log');
    
    execSync(`"${nssmPath}" set "${NEW_SERVICE_NAME}" AppStdout "${stdoutLog}"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    
    execSync(`"${nssmPath}" set "${NEW_SERVICE_NAME}" AppStderr "${stderrLog}"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    
    console.log(`✅ Logs configurados en: ${stdoutLog}`);
    
    console.log('\n✅ Servicio BloomBrainService instalado correctamente\n');
    return true;
    
  } catch (error) {
    console.error(`❌ Failed to install service:`, error.message);
    throw error;
  }
}

// ============================================================================
// INICIO DEL SERVICIO
// ============================================================================

/**
 * Inicia el servicio BloomBrainService
 */
async function startService(maxRetries = 3) {
  console.log(`\n▶️ Iniciando servicio: ${NEW_SERVICE_NAME}\n`);
  
  if (!serviceExists(NEW_SERVICE_NAME)) {
    throw new Error(`Service ${NEW_SERVICE_NAME} does not exist`);
  }
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      execSync(`sc start "${NEW_SERVICE_NAME}"`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      });
      
      // Esperar a que esté RUNNING
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 1000));
        
        const status = execSync(`sc query "${NEW_SERVICE_NAME}"`, { encoding: 'utf8' });
        
        if (status.includes('RUNNING')) {
          console.log(`✅ Servicio iniciado correctamente (intento ${attempt})`);
          console.log(`   Puerto TCP: 5678`);
          console.log(`   Logs: %LOCALAPPDATA%\\BloomNucleus\\logs\\brain_service.log\n`);
          return true;
        }
        
        if (status.includes('START_PENDING')) {
          console.log(`⏳ Iniciando... (${i + 1}/10)`);
          continue;
        }
      }
      
      if (attempt < maxRetries) {
        console.warn(`⚠️ No se inició en 10 segundos, reintentando...`);
        await new Promise(r => setTimeout(r, 2000));
      }
      
    } catch (error) {
      if (attempt === maxRetries) {
        console.error(`❌ Failed to start service after ${maxRetries} attempts:`, error.message);
        throw error;
      }
      
      console.warn(`⚠️ Intento ${attempt} falló, reintentando...`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  
  throw new Error(`Service did not start after ${maxRetries} attempts`);
}

// ============================================================================
// OBTENER ESTADO
// ============================================================================

/**
 * Obtiene el estado del servicio
 */
function getServiceStatus(serviceName = NEW_SERVICE_NAME) {
  try {
    if (!serviceExists(serviceName)) {
      return 'NOT_INSTALLED';
    }
    
    const result = execSync(`sc query "${serviceName}"`, { encoding: 'utf8' });
    
    if (result.includes('RUNNING')) return 'RUNNING';
    if (result.includes('STOPPED')) return 'STOPPED';
    if (result.includes('STOP_PENDING')) return 'STOPPING';
    if (result.includes('START_PENDING')) return 'STARTING';
    
    return 'UNKNOWN';
  } catch (error) {
    return 'ERROR';
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Limpieza
  cleanupOldServices,
  killAllBloomProcesses,
  
  // Instalación del servicio correcto
  installWindowsService,
  startService,
  
  // Utilidades
  serviceExists,
  stopService,
  removeService,
  getServiceStatus,
  
  // Constantes
  OLD_SERVICE_NAME,
  NEW_SERVICE_NAME
};