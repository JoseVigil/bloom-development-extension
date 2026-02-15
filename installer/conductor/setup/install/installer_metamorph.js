// install/installer_metamorph.js
const path = require('path');
const fs = require('fs-extra');
const { paths } = require('../config/paths');
const { getLogger } = require('../../shared/logger');
const { nucleusManager } = require('./nucleus_manager');

const logger = getLogger('installer-metamorph');

/**
 * 
 * @deprecated Use deployAllSystemBinaries() in installer.js instead
 */
async function deployMetamorph_DEPRECATED(win) {
  const MILESTONE = 'metamorph';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ ${MILESTONE} completed, skipping`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);

  try {
    logger.separator('DEPLOYING METAMORPH');

    // Ruta origen usando getResourcePath (dev/build aware)
    const sourcePath = paths.metamorphSource;
    
    // Ruta destino en AppData
    const metamorphDir = path.join(paths.binDir, 'metamorph');
    const metamorphExe = path.join(metamorphDir, 'metamorph.exe');
    
    // Crear directorio
    await fs.ensureDir(metamorphDir);

    // Copiar metamorph.exe
    const sourceExe = path.join(sourcePath, 'metamorph.exe');
    if (await fs.pathExists(sourceExe)) {
      await fs.copy(sourceExe, metamorphExe, { overwrite: true });
      logger.success('✔ metamorph.exe');
    } else {
      throw new Error(`metamorph.exe not found: ${sourceExe}`);
    }

    // Copiar help/
    const sourceHelp = path.join(sourcePath, 'help');
    const destHelp = path.join(metamorphDir, 'help');
    if (await fs.pathExists(sourceHelp)) {
      await fs.copy(sourceHelp, destHelp, { overwrite: true });
      logger.success('✔ help/');
    }

    // Copiar metamorph-config.json
    const sourceConfig = path.join(sourcePath, 'metamorph-config.json');
    const destConfig = path.join(metamorphDir, 'metamorph-config.json');
    if (await fs.pathExists(sourceConfig)) {
      await fs.copy(sourceConfig, destConfig, { overwrite: true });
      logger.success('✔ metamorph-config.json');
    }

    logger.success('✅ Metamorph deployed');

    await nucleusManager.completeMilestone(MILESTONE, {
      metamorph_exe: metamorphExe,
      metamorph_dir: metamorphDir
    });

    return { success: true };

  } catch (error) {
    await nucleusManager.failMilestone(MILESTONE, error.message);
    throw error;
  }
}

module.exports = { 
  // Mantener export vacío para evitar errores de import
};