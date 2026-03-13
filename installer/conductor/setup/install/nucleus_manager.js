// core/nucleus_manager.js
// Motor de Persistencia de Hitos Atómicos
// Gestiona nucleus.json como única fuente de verdad

const fs = require('fs-extra');
const path = require('path');
const { paths } = require('../config/paths');
const { getLogger } = require('../../shared/logger');

const logger = getLogger('installer');

// ============================================================================
// NUCLEUS.JSON SCHEMA (Contrato Formal)
// ============================================================================

const NUCLEUS_SCHEMA_VERSION = 1;

const EMPTY_NUCLEUS = {
  version: NUCLEUS_SCHEMA_VERSION,
  created_at: null,
  updated_at: null,

  installation: {
    force_reinstall: false,
    completed: false,
    completed_at: null,
    origin_path: null,
    origin_type: null,
    origin_platform: null
  },

  onboarding: {
    completed: false,
    started: false
  },

  system_map: {
    bloom_base: paths.baseDir,
    nucleus_exe: paths.nucleusExe,
    sentinel_exe: paths.sentinelExe,
    brain_exe: paths.brainExe,
    chromium_exe: paths.chromeExe,
    conductor_exe: paths.conductorExe,
    sensor_exe: paths.sensorExe,
    cortex_blx: paths.cortexBlx,
    ollama_exe: paths.ollamaExe,
    host_exe: paths.hostBinary
  },

  binary_versions: {
    nucleus:   { version: '', size: 0, modified: '' },
    sentinel:  { version: '', size: 0, modified: '' },
    brain:     { version: '', size: 0, modified: '' },
    conductor: { version: '', size: 0, modified: '' },
    chromium:  { version: '', size: 0, modified: '' },
    ollama:    { version: '', size: 0, modified: '' }
  },

  master_profile: null,

  milestones: {
    directories: {
      status: 'pending',
      started_at: null,
      completed_at: null,
      verification: {
        method: 'file_exists',
        targets: [
          'bin', 'bin/nucleus', 'bin/sentinel', 'bin/brain', 
          'bin/host', 'bin/cortex', 'bin/ollama', 'bin/conductor', 
          'bin/chrome-win', 'config', 'engine/runtime', 'profiles', 'logs'
        ],
        result: null
      },
      error: null
    },

    chromium: {
      status: 'pending',
      started_at: null,
      completed_at: null,
      verification: {
        method: 'file_exists_and_smoke',
        targets: ['bin/chrome-win/chrome.exe'],
        smoke_test: '--version',
        result: null
      },
      error: null
    },

    brain_runtime: {
      status: 'pending',
      started_at: null,
      completed_at: null,
      verification: {
        method: 'file_exists',
        targets: ['engine/runtime/python.exe'],
        result: null
      },
      error: null
    },

    binaries: {
      status: 'pending',
      started_at: null,
      completed_at: null,
      verification: {
        method: 'sovereign_manifest',
        components: {
          runtime:   ['python.exe', 'Lib', 'python310._pth'],
          brain:     ['brain.exe', '_internal'],
          host:      ['bloom-host.exe', 'libwinpthread-1.dll'],
          nssm:      ['nssm.exe'],
          nucleus:   ['nucleus.exe', 'nucleus-governance.json', 'help'],
          sentinel:  ['sentinel.exe', 'sentinel-config.json', 'help'],
          metamorph: ['metamorph.exe', 'help', 'metamorph-config.json'],
          cortex:    ['bloom-cortex.blx'],
          ollama:    ['ollama.exe', 'lib'],
          node:      ['node.exe', 'npm.cmd'],
          temporal:  ['temporal.exe'],
          conductor: ['bloom-conductor.exe']
        },
        result: null
      },
      error: null
    },

    metamorph_audit: {
      status: 'pending',
      started_at: null,
      completed_at: null,
      verification: {
        method: 'metamorph_command',
        command: 'metamorph --json inspect --all && metamorph --json verify-sync',
        expected_in_sync: true,
        result: null
      },
      error: null
    },

    // ⚠️ DEPRECADO - Conductor ahora se verifica en milestone 'binaries'
    conductor: {
      status: 'pending',
      started_at: null,
      completed_at: null,
      verification: {
        method: 'file_exists',
        targets: ['bin/conductor/bloom-conductor.exe'],
        result: null
      },
      error: null,
      deprecated: true  // ✅ Marcado como deprecado
    },

    // ⚠️ DEPRECADO - Metamorph ahora se verifica en milestone 'binaries'
    metamorph: {
      status: 'pending',
      started_at: null,
      completed_at: null,
      verification: {
        method: 'file_exists',
        targets: ['bin/metamorph/metamorph.exe', 'bin/metamorph/help'],
        result: null
      },
      error: null,
      deprecated: true  // ✅ Marcado como deprecado
    },

    brain_service_install: {
      status: 'pending',
      started_at: null,
      completed_at: null,
      verification: {
        method: 'nssm_service_check',
        service_name: 'BloomBrain',
        expected_state: 'SERVICE_RUNNING',
        result: null
      },
      error: null
    },

    nucleus_service_install: {
      status: 'pending',
      started_at: null,
      completed_at: null,
      verification: {
        method: 'nssm_service_check',
        service_name: 'BloomNucleusService',
        expected_state: 'SERVICE_RUNNING',
        result: null
      },
      error: null
    },

    orchestration_init: {
      status: 'pending',
      started_at: null,
      completed_at: null,
      verification: {
        method: 'nucleus_command',
        command: 'nucleus --json temporal ensure',
        expected_success: true,
        expected_state: 'RUNNING',
        result: null
      },
      error: null
    },

    nucleus_seed: {
      status: 'pending',
      started_at: null,
      completed_at: null,
      verification: {
        method: 'sentinel_command',
        command: 'sentinel --json seed MasterWorker true',
        expected_output: 'profile_id',
        result: null
      },
      error: null
    },

    ollama_init: {
      status: 'pending',
      started_at: null,
      completed_at: null,
      verification: {
        method: 'sentinel_command',
        command: 'sentinel --json ollama healthcheck',
        expected_status: 'healthy',
        result: null
      },
      error: null
    },

    shortcuts: {
      status: 'pending',
      started_at: null,
      completed_at: null,
      verification: {
        method: 'file_exists',
        targets: ['shortcuts/Bloom Nucleus.lnk'],
        result: null
      },
      error: null
    },

    certification: {
      status: 'pending',
      started_at: null,
      completed_at: null,
      verification: {
        method: 'nucleus_health',
        command: 'nucleus --json health',
        expected_status: 'healthy',
        expected_all_services_ok: true,
        result: null
      },
      error: null
    },

    nucleus_launch: {
      status: 'pending',
      started_at: null,
      completed_at: null,
      verification: {
        method: 'nucleus_command',
        command: 'nucleus --json synapse launch [uuid] --mode discovery --heartbeat',
        expected_success: true,
        expected_extension_loaded: true,
        result: null
      },
      error: null
    },

    sensor_install: {
      status: 'pending',
      started_at: null,
      completed_at: null,
      verification: {
        method: 'process_running',
        target: 'bloom-sensor.exe',
        registry_key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
        registry_value: 'BloomSensor',
        result: null
      },
      error: null
    }
  }
};

// ============================================================================
// ATOMIC FILE OPERATIONS
// ============================================================================

/**
 * Escritura atómica usando rename
 * @param {string} filepath - Ruta del archivo destino
 * @param {object} data - Datos a escribir
 */
async function atomicWrite(filepath, data) {
  const tmpFile = `${filepath}.tmp`;
  
  try {
    // 1. Escribir a archivo temporal
    await fs.writeJson(tmpFile, data, { spaces: 2 });
    
    // 2. Rename atómico (POSIX garantiza atomicidad)
    await fs.rename(tmpFile, filepath);
    
    logger.debug(`✓ Atomic write: ${path.basename(filepath)}`);
    
  } catch (error) {
    // Cleanup en caso de error
    if (await fs.pathExists(tmpFile)) {
      await fs.remove(tmpFile);
    }
    throw error;
  }
}

/**
 * Lee nucleus.json de forma segura
 * @returns {object} - Estado de nucleus.json
 */
async function readNucleus() {
  try {
    if (!await fs.pathExists(paths.configFile)) {
      return null;
    }

    const raw = await fs.readJson(paths.configFile);
    
    // MIGRACIÓN: Detectar esquema viejo (sin campo "version")
    if (!raw.version) {
      logger.info('🔄 Migrando nucleus.json desde esquema legacy...');
      
      return {
        version: 1,
        created_at: raw.timestamp || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        installation: {
          started_at: raw.timestamp || new Date().toISOString(),
          completed: raw.onboarding_completed || false,
          completed_at: null,
          force_reinstall: false
        },
        milestones: EMPTY_NUCLEUS.milestones, // 13 milestones en "pending"
        master_profile: null,
        // PRESERVAR info útil del esquema viejo
        legacy_data: {
          extension_id: raw.extension_id,
          system_map: raw.system_map,
          executables_valid: raw.executables_valid
        }
      };
    }
    
    // Esquema nuevo, retornar tal cual
    return raw;

  } catch (error) {
    logger.error('Error leyendo nucleus.json:', error.message);
    return null;
  }
}
/**
 * Escribe nucleus.json de forma atómica
 * @param {object} data - Datos a escribir
 */
async function writeNucleus(data) {
  try {
    // Asegurar que config/ existe
    await fs.ensureDir(paths.configDir);
    
    // Actualizar timestamp
    data.updated_at = new Date().toISOString();
    
    // Escritura atómica
    await atomicWrite(paths.configFile, data);
    
    logger.debug('nucleus.json actualizado');
    
  } catch (error) {
    logger.error('Error escribiendo nucleus.json:', error.message);
    throw error;
  }
}

// ============================================================================
// NUCLEUS MANAGER
// ============================================================================

class NucleusManager {
  constructor() {
    this.state = null;
    this.initialized = false;
  }

  /**
   * Inicializa el manager y carga/crea nucleus.json
   */
  async initialize() {
    if (this.initialized) {
      return this.state;
    }

    logger.separator('NUCLEUS MANAGER INITIALIZATION');

    try {
      // Intentar cargar estado existente
      this.state = await readNucleus();

      if (!this.state) {
        // Crear nuevo nucleus.json
        logger.info('Creando nuevo nucleus.json');
        this.state = {
          ...EMPTY_NUCLEUS,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        await writeNucleus(this.state);
        logger.success('✓ nucleus.json creado');
      } else {
        logger.info('nucleus.json existente cargado');
        
        // Verificar si force_reinstall está activado
        if (this.state.installation.force_reinstall) {
          logger.warn('⚠️ FORCE_REINSTALL detectado - Reseteando todos los hitos');
          await this.resetAllMilestones();
        }
      }

      this.initialized = true;
      return this.state;

    } catch (error) {
      logger.error('Error inicializando Nucleus Manager:', error.message);
      throw error;
    }
  }

  /**
   * Obtiene el estado actual de nucleus.json
   */
  getState() {
    if (!this.initialized) {
      throw new Error('NucleusManager no inicializado');
    }
    return this.state;
  }

  /**
   * Verifica si un hito ya fue completado
   * @param {string} milestoneName - Nombre del hito
   * @returns {boolean}
   */
  isMilestoneCompleted(milestoneName) {
    if (!this.state?.milestones?.[milestoneName]) {
      return false;
    }
    return this.state.milestones[milestoneName].status === 'passed';
  }

  /**
   * Marca un hito como iniciado
   * @param {string} milestoneName - Nombre del hito
   */
  async startMilestone(milestoneName) {
    if (!this.state?.milestones?.[milestoneName]) {
      logger.warn(`⚠️ Milestone desconocido ignorado: ${milestoneName}`);
      throw new Error(`Hito desconocido: ${milestoneName}`);
    }

    this.state.milestones[milestoneName].status = 'running';
    this.state.milestones[milestoneName].started_at = new Date().toISOString();
    
    await writeNucleus(this.state);
    
    logger.info(`▶️ Hito iniciado: ${milestoneName}`);
  }

  /**
   * Marca un hito como completado
   * @param {string} milestoneName - Nombre del hito
   * @param {object} verificationResult - Resultado de verificación
   */
  async completeMilestone(milestoneName, verificationResult = null) {
    if (!this.state?.milestones?.[milestoneName]) {
      logger.warn(`⚠️ Milestone desconocido ignorado: ${milestoneName}`);
      throw new Error(`Hito desconocido: ${milestoneName}`);
    }

    this.state.milestones[milestoneName].status = 'passed';
    this.state.milestones[milestoneName].completed_at = new Date().toISOString();
    this.state.milestones[milestoneName].error = null;
    
    if (verificationResult) {
      this.state.milestones[milestoneName].verification.result = verificationResult;
    }
    
    await writeNucleus(this.state);
    
    logger.success(`✅ Hito completado: ${milestoneName}`);
  }

  // ============================================================================
  // SUB-MILESTONES (para componentes dentro de 'binaries')
  // ============================================================================

  isSubMilestoneCompleted(milestone, subKey) {
    return this.state.milestones[milestone]?.sub_milestones?.[subKey]?.completed || false;
  }

  async completeSubMilestone(milestone, subKey) {
    if (!this.state?.milestones?.[milestone]) {
      throw new Error(`Milestone no existe: ${milestone}`);
    }

    this.state.milestones[milestone].sub_milestones ??= {};

    this.state.milestones[milestone].sub_milestones[subKey] = {
      completed: true,
      completed_at: new Date().toISOString(),
    };

    await writeNucleus(this.state);
    logger.success(`✓ Sub-milestone: ${milestone}.${subKey}`);
  }

  /**
   * Marca un hito como fallido
   * @param {string} milestoneName - Nombre del hito
   * @param {string} error - Mensaje de error
   */
  async failMilestone(milestoneName, error) {
    if (!this.state?.milestones?.[milestoneName]) {
      throw new Error(`Hito desconocido: ${milestoneName}`);
    }

    this.state.milestones[milestoneName].status = 'failed';
    this.state.milestones[milestoneName].error = error;
    
    await writeNucleus(this.state);
    
    logger.error(`❌ Hito fallido: ${milestoneName} - ${error}`);
  }

  /**
   * Resetea todos los hitos a pending (para force_reinstall)
   */
  async resetAllMilestones() {
    logger.info('Reseteando todos los hitos...');

    for (const [name, milestone] of Object.entries(this.state.milestones)) {
      milestone.status = 'pending';
      milestone.started_at = null;
      milestone.completed_at = null;
      milestone.error = null;
      milestone.verification.result = null;
    }

    this.state.installation.force_reinstall = false;
    this.state.installation.completed = false;
    this.state.installation.completed_at = null;
    this.state.installation.origin_path = null;
    this.state.installation.origin_type = null;
    this.state.installation.origin_platform = null;

    await writeNucleus(this.state);
    
    logger.success('✓ Todos los hitos reseteados');
  }

  /**
   * Obtiene el próximo hito a ejecutar
   * @returns {string|null} - Nombre del hito o null si todos completados
   */
  getNextPendingMilestone() {
    const milestoneOrder = [
      'directories',               // 1/10
      'chromium',                  // 2/10
      'brain_runtime',             // 3/10
      'binaries',                  // 4/10
      'metamorph_audit',           // 5/10 - Snapshot + verify-sync
      'brain_service_install',     // 6/10
      'nucleus_service_install',   // 6/10 - Arranca Temporal
      'sensor_install',            // 7/10 - Session agent (non-critical)
      'certification',             // 8/10 - Verifica Temporal ready
      'nucleus_seed',              // 9/10 - Usa Temporal
      'nucleus_launch',            // 10/10 - Heartbeat final
      'orchestration_init',        // (opcional, post-instalación)
      'ollama_init',               // (opcional, post-instalación)
      'shortcuts'                  // (opcional, post-instalación)
    ];

    for (const name of milestoneOrder) {
      if (this.state.milestones[name].status !== 'passed') {
        return name;
      }
    }

    return null; // Todos completados
  }

  /**
   * Actualiza versión de un binario
   * @param {string} binaryName - Nombre del binario
   * @param {object} versionData - { version, size, modified }
   */
  async updateBinaryVersion(binaryName, versionData) {
    if (!this.state.binary_versions[binaryName]) {
      logger.warn(`Binary desconocido: ${binaryName}`);
      return;
    }

    this.state.binary_versions[binaryName] = versionData;
    await writeNucleus(this.state);
  }

  /**
   * Marca la instalación como completada
   */
  async markInstallationComplete() {
    this.state.installation.completed = true;
    this.state.installation.completed_at = new Date().toISOString();
    
    await writeNucleus(this.state);
    
    logger.success('🎉 INSTALACIÓN COMPLETADA - nucleus.json certificado');
  }

  /**
   * Guarda el ID del perfil maestro
   * @param {string} profileId - UUID del perfil maestro
   */
  async setMasterProfile(profileId) {
    this.state.master_profile = profileId;
    await writeNucleus(this.state);
    
    logger.info(`Master profile: ${profileId}`);
  }

  /**
   * Verifica si la instalación está completa
   * @returns {boolean}
   */
  isInstallationComplete() {
    return this.state?.installation?.completed === true;
  }

  /**
   * Obtiene resumen del estado de instalación
   * @returns {object}
   */
  getInstallationSummary() {
    const milestones = this.state.milestones;
    
    const summary = {
      total: Object.keys(milestones).length,
      passed: 0,
      failed: 0,
      pending: 0,
      running: 0
    };

    for (const [name, milestone] of Object.entries(milestones)) {
      summary[milestone.status]++;
    }

    return {
      ...summary,
      completed: this.state.installation.completed,
      next_milestone: this.getNextPendingMilestone()
    };
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

const nucleusManager = new NucleusManager();

module.exports = {
  nucleusManager,
  NucleusManager
};