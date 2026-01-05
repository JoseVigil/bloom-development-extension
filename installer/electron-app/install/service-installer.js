const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const { paths } = require('../config/paths');

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
      // Intentar detener el servicio
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
      
      // Si después de 10 segundos no se detuvo, intentar force kill
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
        // Intentar force kill como último recurso
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
  
  // Primero, detener el servicio
  await stopService(serviceName);
  
  // Esperar un poco más para asegurar que todo esté liberado
  await new Promise(r => setTimeout(r, 2000));
  
  // Eliminar el servicio
  try {
    execSync(`sc delete "${serviceName}"`, { 
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    console.log(`✅ Service ${serviceName} removed successfully`);
    
    // Esperar a que Windows procese la eliminación
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
    'python.exe',  // Solo los que están en nuestro directorio
    'pythonw.exe'
  ];
  
  let killedCount = 0;
  
  for (const processName of processesToKill) {
    try {
      // Verificar si el proceso existe
      const tasklistResult = execSync(
        `tasklist /FI "IMAGENAME eq ${processName}"`, 
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
      );
      
      if (!tasklistResult.includes(processName)) {
        continue;
      }
      
      // Si es python.exe, solo matar los que están en nuestro directorio
      if (processName === 'python.exe' || processName === 'pythonw.exe') {
        try {
          // Usar wmic para obtener la ruta del comando
          const wmicResult = execSync(
            `wmic process where "name='${processName}'" get commandline,processid /format:csv`,
            { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
          );
          
          const lines = wmicResult.split('\n').filter(l => l.trim());
          for (const line of lines) {
            // Si la línea contiene la ruta de Bloom, matar ese proceso
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
                  // Ignorar si el proceso ya no existe
                }
              }
            }
          }
        } catch (wmicError) {
          // Si wmic falla, usar taskkill simple como fallback
          try {
            execSync(`taskkill /F /IM ${processName}`, { 
              stdio: ['pipe', 'pipe', 'ignore'] 
            });
            killedCount++;
            console.log(`  ✅ Killed all ${processName} processes (fallback)`);
          } catch (e) {
            // Ignorar errores
          }
        }
      } else {
        // Para bloom-host.exe, matar todos
        try {
          execSync(`taskkill /F /IM ${processName}`, { 
            stdio: ['pipe', 'pipe', 'ignore'] 
          });
          killedCount++;
          console.log(`  ✅ Killed ${processName}`);
        } catch (e) {
          // Ignorar si el proceso ya no existe
        }
      }
      
    } catch (error) {
      // Ignorar errores de tasklist (proceso no existe)
    }
  }
  
  if (killedCount > 0) {
    console.log(`✅ Killed ${killedCount} processes`);
    // Esperar a que Windows libere los file handles
    await new Promise(r => setTimeout(r, 2000));
  } else {
    console.log('ℹ️ No Bloom processes found running');
  }
}

/**
 * Instala un servicio Windows usando NSSM
 */
async function installService(serviceName, exePath, displayName, description) {
  console.log(`📦 Installing service: ${serviceName}`);
  
  // ✅ FIX: Buscar NSSM en múltiples ubicaciones con mejor manejo de errores
  let nssmPath = null;
  
  // Opción 1: En el directorio nativeDir (después de copiar) - paths.nssmExe
  if (paths.nssmExe && await fs.pathExists(paths.nssmExe)) {
    nssmPath = paths.nssmExe;
    console.log(`✅ Found NSSM at installed location: ${nssmPath}`);
  }
  
  // Opción 2: En el directorio source (antes de copiar) - paths.nssmSource
  if (!nssmPath && paths.nssmSource) {
    const sourceNssm = path.join(paths.nssmSource, 'nssm.exe');
    if (await fs.pathExists(sourceNssm)) {
      nssmPath = sourceNssm;
      console.log(`✅ Found NSSM at source location: ${nssmPath}`);
      
      // Si estamos usando el source, copiarlo primero al destino para futuras ejecuciones
      if (paths.nssmExe) {
        try {
          await fs.ensureDir(path.dirname(paths.nssmExe));
          await fs.copy(sourceNssm, paths.nssmExe, { overwrite: true });
          console.log(`📋 Copied NSSM to: ${paths.nssmExe}`);
          nssmPath = paths.nssmExe; // Usar la copia
        } catch (copyError) {
          console.warn(`⚠️ Could not copy NSSM to destination: ${copyError.message}`);
          console.warn(`💡 Using source path: ${sourceNssm}`);
          // Seguir usando nssmPath del source si la copia falla
        }
      }
    }
  }
  
  // Opción 3: Buscar en ubicaciones comunes como fallback
  if (!nssmPath) {
    const commonLocations = [
      path.join(process.cwd(), 'nssm', 'nssm.exe'),
      path.join(process.cwd(), 'native', 'nssm.exe'),
      path.join(__dirname, '..', 'nssm', 'nssm.exe'),
      path.join(__dirname, '..', 'native', 'nssm.exe'),
      path.join(__dirname, '..', '..', 'nssm', 'nssm.exe'),
      path.join(__dirname, '..', '..', 'native', 'nssm.exe')
    ];
    
    for (const location of commonLocations) {
      if (await fs.pathExists(location)) {
        nssmPath = location;
        console.log(`✅ Found NSSM at common location: ${nssmPath}`);
        break;
      }
    }
  }
  
  if (!nssmPath) {
    const searchedPaths = [
      paths.nssmExe || '(nssmExe undefined)',
      paths.nssmSource ? path.join(paths.nssmSource, 'nssm.exe') : '(nssmSource undefined)',
      ...commonLocations
    ];
    throw new Error(`NSSM not found. Searched in:\n${searchedPaths.map(p => `  - ${p}`).join('\n')}`);
  }
  
  // Verificar que el ejecutable existe
  if (!await fs.pathExists(exePath)) {
    throw new Error(`Executable not found at: ${exePath}`);
  }
  
  // Si el servicio ya existe, removerlo primero
  if (serviceExists(serviceName)) {
    console.log('⚠️ Service already exists, removing first...');
    await removeService(serviceName);
  }
  
  try {
    // Instalar el servicio
    execSync(`"${nssmPath}" install "${serviceName}" "${exePath}"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    
    // Configurar el servicio
    execSync(`"${nssmPath}" set "${serviceName}" DisplayName "${displayName}"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    
    execSync(`"${nssmPath}" set "${serviceName}" Description "${description}"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    
    // Configurar inicio automático
    execSync(`"${nssmPath}" set "${serviceName}" Start SERVICE_AUTO_START`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    
    // Configurar el directorio de trabajo
    const workDir = path.dirname(exePath);
    execSync(`"${nssmPath}" set "${serviceName}" AppDirectory "${workDir}"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    
    // Configurar logs
    const logDir = paths.logsDir;
    await fs.ensureDir(logDir);
    
    execSync(`"${nssmPath}" set "${serviceName}" AppStdout "${path.join(logDir, 'service-stdout.log')}"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    
    execSync(`"${nssmPath}" set "${serviceName}" AppStderr "${path.join(logDir, 'service-stderr.log')}"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    
    console.log(`✅ Service ${serviceName} installed successfully`);
    return true;
    
  } catch (error) {
    console.error(`❌ Failed to install service:`, error.message);
    throw error;
  }
}

/**
 * Inicia un servicio Windows
 */
async function startService(serviceName, maxRetries = 3) {
  console.log(`▶️ Starting service: ${serviceName}`);
  
  if (!serviceExists(serviceName)) {
    throw new Error(`Service ${serviceName} does not exist`);
  }
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      execSync(`sc start "${serviceName}"`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      });
      
      // Esperar a que el servicio esté RUNNING
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 1000));
        
        const status = execSync(`sc query "${serviceName}"`, { encoding: 'utf8' });
        
        if (status.includes('RUNNING')) {
          console.log(`✅ Service started successfully on attempt ${attempt}`);
          return true;
        }
        
        if (status.includes('START_PENDING')) {
          console.log(`⏳ Service is starting... (${i + 1}/10)`);
          continue;
        }
      }
      
      if (attempt < maxRetries) {
        console.warn(`⚠️ Service did not start, retrying...`);
        await new Promise(r => setTimeout(r, 2000));
      }
      
    } catch (error) {
      if (attempt === maxRetries) {
        console.error(`❌ Failed to start service after ${maxRetries} attempts:`, error.message);
        throw error;
      }
      
      console.warn(`⚠️ Attempt ${attempt} failed, retrying...`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  
  throw new Error(`Service did not start after ${maxRetries} attempts`);
}

/**
 * Obtiene el estado de un servicio
 */
function getServiceStatus(serviceName) {
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

/**
 * Wrapper para instalar servicio Windows con configuración específica de Bloom
 * Esta función es llamada por native-host-installer.js sin argumentos
 * Obtiene automáticamente la configuración desde paths y constants
 */
async function installWindowsService(serviceName = null, exePath = null, options = {}) {
  // Si no se proporcionan argumentos, obtener de la configuración del proyecto
  if (!serviceName || !exePath) {
    const { paths: pathsConfig } = require('../config/paths');
    const constants = require('../config/constants');
    
    serviceName = serviceName || constants.SERVICE_NAME || 'BloomNucleusHost';
    exePath = exePath || pathsConfig.hostBinary;
    
    console.log('📋 Using default configuration:');
    console.log(`   Service Name: ${serviceName}`);
    console.log(`   Executable: ${exePath}`);
  }
  
  const displayName = options.displayName || 'Bloom Nucleus Host Service';
  const description = options.description || 'Native messaging host for Bloom Nucleus Chrome extension';
  
  console.log(`📦 Installing Windows service: ${serviceName}`);
  console.log(`   Executable: ${exePath}`);
  console.log(`   Display Name: ${displayName}`);
  
  return await installService(serviceName, exePath, displayName, description);
}

module.exports = {
  serviceExists,
  stopService,
  removeService,
  killAllBloomProcesses,
  installService,
  installWindowsService,  // Exportar la función wrapper
  startService,
  getServiceStatus
};