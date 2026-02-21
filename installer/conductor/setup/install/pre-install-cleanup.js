// pre-install-cleanup.js
// Limpieza automática ANTES de deployment de binaries
// Se ejecuta automáticamente en el instalador

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const { paths } = require('../config/paths');

// ============================================================================
// CLEANUP FUNCTIONS
// ============================================================================

/**
 * Detiene todos los servicios Bloom de forma segura
 */
async function stopAllBloomServices(logger) {
  logger.info('🛑 Stopping Bloom services...');
  
  const services = [
    'BloomBrainService',
    'BloomNucleusService', 
    'BloomBrain',
    'BloomNucleus'
  ];
  
  for (const service of services) {
    try {
      execSync(`sc stop "${service}"`, { 
        stdio: 'pipe',
        timeout: 5000 
      });
      logger.info(`  ✓ ${service} stopped`);
    } catch (e) {
      // Service doesn't exist or already stopped
      logger.debug(`  - ${service} not running`);
    }
  }
  
  // Wait for services to fully stop
  await sleep(3000);
}

/**
 * Remueve todos los servicios Bloom usando NSSM
 */
async function removeAllBloomServices(logger) {
  logger.info('🗑️ Removing Bloom services...');
  
  const nssmPath = paths.nssmExe || path.join(paths.binDir, 'nssm', 'nssm.exe');
  
  if (!fs.existsSync(nssmPath)) {
    logger.warn('  ⚠️ NSSM not found, skipping service removal');
    return;
  }
  
  const services = [
    'BloomBrainService',
    'BloomNucleusService',
    'BloomBrain', 
    'BloomNucleus'
  ];
  
  for (const service of services) {
    try {
      execSync(`"${nssmPath}" remove "${service}" confirm`, { 
        stdio: 'pipe',
        timeout: 5000
      });
      logger.info(`  ✓ ${service} removed`);
    } catch (e) {
      // Service doesn't exist
      logger.debug(`  - ${service} not found`);
    }
  }
  
  // Wait for cleanup
  await sleep(2000);
}

/**
 * Mata procesos Bloom que puedan estar bloqueando archivos
 * IMPORTANTE: NO mata node.exe porque el instalador mismo es Electron/Node
 */
async function killBloomProcesses(logger) {
  logger.info('💀 Killing Bloom processes...');
  
  const processes = [
    'brain.exe',
    'nucleus.exe',
    'sentinel.exe',
    'bloom-host.exe',
    'bloom-conductor.exe',
    'bloom-launcher.exe', // CRÍTICO: liberar antes del deploy de binarios
    'temporal.exe',       // CRÍTICO: liberar temporal.exe
    'ollama.exe'          // CRÍTICO: liberar ollama.exe
    // ❌ NO INCLUIR node.exe - el instalador Electron lo usa
    // ❌ NO INCLUIR nssm.exe - puede causar problemas si servicios están activos
  ];
  
  for (const proc of processes) {
    try {
      // CRÍTICO: Envolver con manejo de errores robusto
      try {
        execSync(`taskkill /F /IM ${proc} /T`, { 
          stdio: 'pipe',
          timeout: 3000,
          windowsHide: true  // Prevenir popups
        });
        logger.info(`  ✓ ${proc} killed`);
      } catch (killError) {
        // Process not running o error no crítico
        logger.debug(`  - ${proc} not running`);
      }
    } catch (outerError) {
      // Catch absoluto para prevenir crash del loop
      logger.debug(`  - ${proc} error ignored`);
    }
  }
  
  // Wait for processes to die and files to unlock
  await sleep(3000); // Aumentado a 3 segundos para dar más tiempo
}

/**
 * Resetea nucleus.json si tiene milestones desactualizados
 */
async function ensureNucleusJsonValid(logger) {
  logger.info('📋 Checking nucleus.json validity...');
  
  const nucleusPath = paths.configFile || path.join(paths.configDir, 'nucleus.json');
  
  if (!fs.existsSync(nucleusPath)) {
    logger.info('  ✓ nucleus.json does not exist (will be created)');
    return;
  }
  
  try {
    const nucleus = await fs.readJson(nucleusPath);
    
    // Verificar si tiene el milestone nucleus_service_install
    if (!nucleus.milestones?.nucleus_service_install) {
      logger.warn('  ⚠️ nucleus.json has outdated milestone schema');
      logger.info('  🔄 Setting force_reinstall=true');
      
      nucleus.installation = nucleus.installation || {};
      nucleus.installation.force_reinstall = true;
      nucleus.installation.completed = false;
      
      await fs.writeJson(nucleusPath, nucleus, { spaces: 2 });
      logger.success('  ✓ nucleus.json updated with force_reinstall flag');
    } else {
      logger.info('  ✓ nucleus.json schema is valid');
    }
    
  } catch (error) {
    logger.error(`  ❌ Error checking nucleus.json: ${error.message}`);
    // No es crítico, continuar
  }
}

/**
 * Limpieza completa PRE-INSTALACIÓN
 * Se ejecuta ANTES de deployAllBinaries para evitar archivos bloqueados
 */
async function preInstallCleanup(logger) {
  try {
    logger.separator('PRE-INSTALL CLEANUP');
    
    try {
      // Paso 1: Verificar y actualizar nucleus.json
      await ensureNucleusJsonValid(logger);
    } catch (e) {
      logger.warn('⚠️ nucleus.json check failed, continuing:', e.message);
    }
    
    try {
      // Paso 2: Detener servicios
      await stopAllBloomServices(logger);
    } catch (e) {
      logger.warn('⚠️ Stop services failed, continuing:', e.message);
    }
    
    try {
      // Paso 3: Remover servicios
      await removeAllBloomServices(logger);
    } catch (e) {
      logger.warn('⚠️ Remove services failed, continuing:', e.message);
    }
    
    try {
      // Paso 4: Matar procesos (excepto node.exe del instalador)
      await killBloomProcesses(logger);
    } catch (e) {
      logger.warn('⚠️ Kill processes failed, continuing:', e.message);
    }
    
    logger.success('✅ Pre-install cleanup completed');
    return { success: true };
    
  } catch (error) {
    logger.error('❌ Pre-install cleanup failed:', error.message);
    logger.error('Stack:', error.stack);
    // No es crítico, el safe-file-copy puede manejar algunos casos
    return { success: false, error: error.message };
  }
}

// ============================================================================
// SAFE FILE OPERATIONS
// ============================================================================

/**
 * Copia un archivo de forma segura, manejando archivos bloqueados
 */
async function safeCopyFile(src, dest, logger, options = {}) {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    skipIfBlocked = true
  } = options;
  
  const filename = path.basename(dest);
  
  // Si el archivo destino existe y está bloqueado
  if (await fs.pathExists(dest)) {
    try {
      // Intentar remover
      await fs.remove(dest);
    } catch (error) {
      if (error.code === 'EPERM' || error.code === 'EBUSY') {
        logger.warn(`  ⚠️ ${filename} is locked`);
        
        if (skipIfBlocked) {
          logger.info(`  ⏭️ Skipping ${filename} (using existing file)`);
          return { skipped: true, reason: 'locked' };
        }
        
        // Intentar liberar matando procesos específicos
        try {
          await killSpecificProcess(filename, logger);
          await sleep(retryDelay);
          await fs.remove(dest);
        } catch (killError) {
          throw new Error(`Cannot unlock ${filename}: ${killError.message}`);
        }
      } else {
        throw error;
      }
    }
  }
  
  // Copiar con reintentos
  let lastError = null;
  
  // CRÍTICO: Asegurar que el directorio padre existe
  const destDir = path.dirname(dest);
  await fs.ensureDir(destDir);
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await fs.copy(src, dest, { overwrite: true });
      return { success: true };
    } catch (error) {
      lastError = error;
      
      if (attempt < maxRetries) {
        logger.warn(`  ⚠️ Copy failed (attempt ${attempt}/${maxRetries})`);
        await sleep(retryDelay);
      }
    }
  }
  
  throw lastError;
}

/**
 * Mata un proceso específico por nombre de archivo
 */
async function killSpecificProcess(filename, logger) {
  const processMap = {
    'brain.exe': 'brain.exe',
    'nucleus.exe': 'nucleus.exe',
    'sentinel.exe': 'sentinel.exe',
    'temporal.exe': 'temporal.exe',
    'ollama.exe': 'ollama.exe'
    // NO incluir node.exe - el instalador lo usa
  };
  
  const processName = processMap[filename];
  
  if (processName) {
    try {
      execSync(`taskkill /F /IM ${processName} /T`, { stdio: 'ignore' });
      logger.info(`  🔪 Killed ${processName} to unlock file`);
      return true;
    } catch (e) {
      return false;
    }
  }
  
  return false;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  preInstallCleanup,
  safeCopyFile,
  stopAllBloomServices,
  removeAllBloomServices,
  killBloomProcesses,
  ensureNucleusJsonValid
};