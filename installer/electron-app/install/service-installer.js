// install/service-installer.js - FIX RÁPIDO PARA ERROR DE EXPORTACIÓN
// ============================================================================
// PROBLEMA: cleanupOldServices no estaba siendo llamada correctamente
// SOLUCIÓN: Verificar que todas las funciones estén bien definidas y exportadas
// ============================================================================

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const { paths } = require('../config/paths');

// ============================================================================
// CONSTANTES
// ============================================================================
const OLD_SERVICE_NAME = 'BloomNucleusHost';
const NEW_SERVICE_NAME = 'BloomBrainService';

// ============================================================================
// FUNCIÓN 1: SERVICE EXISTS
// ============================================================================
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

// ============================================================================
// FUNCIÓN 2: KILL ALL BLOOM PROCESSES
// ============================================================================
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
// FUNCIÓN 3: STOP SERVICE
// ============================================================================
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

// ============================================================================
// FUNCIÓN 4: REMOVE SERVICE
// ============================================================================
async function removeService(serviceName) {
  console.log(`🗑️ Removing service: ${serviceName}`);
  
  if (!serviceExists(serviceName)) {
    console.log(`ℹ️ Service ${serviceName} does not exist, nothing to remove`);
    return true;
  }
  
  await stopService(serviceName);
  await new Promise(r => setTimeout(r, 2000));
  
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

// ============================================================================
// FUNCIÓN 5: FIND NSSM
// ============================================================================
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
// FUNCIÓN 6: CLEANUP OLD SERVICES (LA QUE FALTABA)
// ============================================================================
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
    
    // Intentar con NSSM primero
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
    
    // Intentar con sc
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
  
  console.log('\n🔪 Matando procesos huérfanos...');
  await killAllBloomProcesses();
  
  console.log('\n✅ Limpieza completada\n');
}

// ============================================================================
// FUNCIÓN 7: INSTALL WINDOWS SERVICE (CON TODOS LOS FIXES)
// ============================================================================
async function installWindowsService() {
  console.log('\n📦 INSTALANDO SERVICIO: BloomBrainService\n');
  
  // 1. Buscar NSSM
  let nssmPath = await findNSSM();
  
  if (!nssmPath) {
    throw new Error(`NSSM not found. Searched in multiple locations.`);
  }
  
  // 2. Verificar brain.exe
  const brainExe = paths.brainExe;
  
  if (!await fs.pathExists(brainExe)) {
    throw new Error(`brain.exe not found at: ${brainExe}`);
  }
  
  console.log(`✅ brain.exe encontrado: ${brainExe}`);
  
  // 3. Remover si existe
  if (serviceExists(NEW_SERVICE_NAME)) {
    console.log('⚠️ BloomBrainService ya existe, removiendo...');
    await removeService(NEW_SERVICE_NAME);
  }
  
  // 4. CREAR LOGS ANTES DE INSTALAR
  const logDir = paths.logsDir;
  await fs.ensureDir(logDir);
  console.log(`✅ Directorio de logs: ${logDir}`);
  
  const stdoutLog = path.join(logDir, 'brain_service.log');
  const stderrLog = path.join(logDir, 'brain_service.err');
  
  await fs.ensureFile(stdoutLog);
  await fs.ensureFile(stderrLog);
  console.log(`✅ Archivos de log creados`);
  
  // 5. Instalar con NSSM
  console.log(`\n🔧 Instalando servicio...`);
  
  try {
    execSync(`"${nssmPath}" install "${NEW_SERVICE_NAME}" "${brainExe}" service start`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    console.log('✅ Servicio instalado');
    
    // Configuraciones básicas
    execSync(`"${nssmPath}" set "${NEW_SERVICE_NAME}" DisplayName "Bloom Brain Service"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    
    execSync(`"${nssmPath}" set "${NEW_SERVICE_NAME}" Description "Bloom Nucleus Brain TCP Multiplexer Service"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    
    execSync(`"${nssmPath}" set "${NEW_SERVICE_NAME}" Start SERVICE_AUTO_START`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    
    // Directorio de trabajo (CRÍTICO para PyInstaller)
    const workDir = path.dirname(brainExe);
    execSync(`"${nssmPath}" set "${NEW_SERVICE_NAME}" AppDirectory "${workDir}"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    console.log(`✅ Working directory: ${workDir}`);
    
    // Variables de entorno (CRÍTICO para PyInstaller)
    execSync(`"${nssmPath}" set "${NEW_SERVICE_NAME}" AppEnvironmentExtra "PYTHONUNBUFFERED=1" "PYTHONIOENCODING=utf-8"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    console.log('✅ Environment variables configured');
    
    // Logs
    execSync(`"${nssmPath}" set "${NEW_SERVICE_NAME}" AppStdout "${stdoutLog}"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    
    execSync(`"${nssmPath}" set "${NEW_SERVICE_NAME}" AppStderr "${stderrLog}"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    console.log(`✅ Logs: ${stdoutLog}`);
    
    // Timeouts extendidos
    execSync(`"${nssmPath}" set "${NEW_SERVICE_NAME}" AppStopMethodConsole 30000`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    console.log('✅ Extended timeouts (30s)');
    
    console.log('\n✅ Servicio instalado correctamente\n');
    return true;
    
  } catch (error) {
    console.error(`❌ Failed to install service:`, error.message);
    throw error;
  }
}

// ============================================================================
// FUNCIÓN 8: START SERVICE (CON TIMEOUT LARGO)
// ============================================================================
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
      
      console.log('⏳ Esperando arranque (PyInstaller puede tardar 20-30s)...');
      
      // Esperar hasta 30 segundos
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 1000));
        
        const status = execSync(`sc query "${NEW_SERVICE_NAME}"`, { encoding: 'utf8' });
        
        if (status.includes('RUNNING')) {
          console.log(`✅ Servicio iniciado (intento ${attempt}, ${i+1}s)`);
          console.log(`   Puerto: 5678`);
          console.log(`   Logs: ${paths.logsDir}\\brain_service.log\n`);
          return true;
        }
        
        if (status.includes('START_PENDING')) {
          if (i % 5 === 0) {
            console.log(`⏳ Iniciando... (${i + 1}/30s)`);
          }
          continue;
        }
        
        if (status.includes('STOPPED')) {
          console.error(`❌ El servicio se detuvo inesperadamente`);
          console.error(`   Revisar: ${paths.logsDir}\\brain_service.err`);
          break;
        }
      }
      
      if (attempt < maxRetries) {
        console.warn(`⚠️ No se inició en 30s, reintentando...`);
        await new Promise(r => setTimeout(r, 3000));
      }
      
    } catch (error) {
      if (attempt === maxRetries) {
        console.error(`❌ Failed after ${maxRetries} attempts:`, error.message);
        console.error(`\n📋 DIAGNÓSTICO:`);
        console.error(`   1. Log: ${paths.logsDir}\\brain_service.err`);
        console.error(`   2. Test: cd "${path.dirname(paths.brainExe)}" && .\\brain.exe service start`);
        console.error(`   3. Puerto: netstat -ano | findstr :5678`);
        throw error;
      }
      
      console.warn(`⚠️ Intento ${attempt} falló, reintentando...`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  
  throw new Error(`Service did not start after ${maxRetries} attempts`);
}

// ============================================================================
// FUNCIÓN 9: GET SERVICE STATUS
// ============================================================================
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
// EXPORTS (ESTO ES LO QUE FALTABA)
// ============================================================================
module.exports = {
  // Limpieza
  cleanupOldServices,      // ← ESTA ES LA QUE FALTABA
  killAllBloomProcesses,
  
  // Instalación
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