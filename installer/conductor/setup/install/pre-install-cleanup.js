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
  logger.info('🗑️  Removing Bloom services...');
  
  const nssmPath = paths.nssmExe || path.join(paths.binDir, 'nssm', 'nssm.exe');
  
  if (!fs.existsSync(nssmPath)) {
    logger.warn('  ⚠️  NSSM not found, skipping service removal');
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
 */
async function killBloomProcesses(logger) {
  logger.info('💀 Killing Bloom processes...');
  
  const processes = [
    'nssm.exe',      // CRÍTICO: liberar nssm.exe
    'brain.exe',
    'nucleus.exe',
    'sentinel.exe',
    'bloom-host.exe',
    'bloom-conductor.exe',
    'cortex.exe'
  ];
  
  for (const proc of processes) {
    try {
      execSync(`taskkill /F /IM ${proc} /T`, { 
        stdio: 'pipe',
        timeout: 3000
      });
      logger.info(`  ✓ ${proc} killed`);
    } catch (e) {
      // Process not running
      logger.debug(`  - ${proc} not running`);
    }
  }
  
  // Wait for processes to die and files to unlock
  await sleep(2000);
}

/**
 * Resetea nucleus.json si tiene milestones desactualizados
 */
async function ensureNucleusJsonValid(logger) {
  logger.info('🔍 Checking nucleus.json validity...');
  
  const nucleusPath = paths.configFile || path.join(paths.configDir, 'nucleus.json');
  
  if (!fs.existsSync(nucleusPath)) {
    logger.info('  ✓ nucleus.json does not exist (will be created)');
    return;
  }
  
  try {
    const nucleus = await fs.readJson(nucleusPath);
    
    // Verificar si tiene el milestone nucleus_service_install
    if (!nucleus.milestones?.nucleus_service_install) {
      logger.warn('  ⚠️  nucleus.json has outdated milestone schema');
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
  logger.separator('PRE-INSTALL CLEANUP');
  
  try {
    // Paso 1: Verificar y actualizar nucleus.json
    await ensureNucleusJsonValid(logger);
    
    // Paso 2: Detener servicios
    await stopAllBloomServices(logger);
    
    // Paso 3: Remover servicios
    await removeAllBloomServices(logger);
    
    // Paso 4: Matar procesos
    await killBloomProcesses(logger);
    
    logger.success('✅ Pre-install cleanup completed');
    return { success: true };
    
  } catch (error) {
    logger.error('❌ Pre-install cleanup failed:', error.message);
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
        logger.warn(`  ⚠️  ${filename} is locked`);
        
        if (skipIfBlocked) {
          logger.info(`  ⏭️  Skipping ${filename} (using existing file)`);
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
        logger.warn(`  ⚠️  Copy failed (attempt ${attempt}/${maxRetries})`);
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
    'nssm.exe': 'nssm.exe',
    'brain.exe': 'brain.exe',
    'nucleus.exe': 'nucleus.exe',
    'sentinel.exe': 'sentinel.exe'
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