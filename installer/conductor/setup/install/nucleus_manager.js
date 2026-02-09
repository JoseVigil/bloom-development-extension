// install/nucleus_manager.js
// Sistema de Estado Atómico - Nucleus Installation Manager
// Maneja persistencia de milestones para instalación resiliente

const path = require('path');
const fs = require('fs-extra');
const { paths } = require('../config/paths');
const { getLogger } = require('../../shared/logger');

const logger = getLogger('nucleus-manager');

// ============================================================================
// STATE SCHEMA
// ============================================================================

const INITIAL_STATE = {
  version: '1.0',
  installation_complete: false,
  master_profile: null,
  milestones: {},
  started_at: null,
  completed_at: null
};

const MILESTONE_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

// ============================================================================
// NUCLEUS MANAGER CLASS
// ============================================================================

class NucleusManager {
  constructor() {
    this.stateFile = path.join(paths.configDir, 'nucleus-installation.json');
    this.state = { ...INITIAL_STATE };
    this.initialized = false;
  }

  // --------------------------------------------------------------------------
  // INITIALIZATION
  // --------------------------------------------------------------------------

  async initialize() {
    try {
      await fs.ensureDir(paths.configDir);

      if (await fs.pathExists(this.stateFile)) {
        this.state = await fs.readJson(this.stateFile);
        logger.info('📂 Loaded existing installation state');
      } else {
        this.state = {
          ...INITIAL_STATE,
          started_at: new Date().toISOString()
        };
        await this._persist();
        logger.info('🆕 Created new installation state');
      }

      this.initialized = true;
      return this.state;

    } catch (error) {
      logger.error('Failed to initialize nucleus manager:', error);
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // MILESTONE MANAGEMENT
  // --------------------------------------------------------------------------

  isMilestoneCompleted(milestone) {
    return this.state.milestones[milestone]?.status === MILESTONE_STATUS.COMPLETED;
  }

  async startMilestone(milestone) {
    if (!this.initialized) {
      throw new Error('NucleusManager not initialized');
    }

    this.state.milestones[milestone] = {
      status: MILESTONE_STATUS.IN_PROGRESS,
      started_at: new Date().toISOString(),
      sub_milestones: {}
    };

    await this._persist();
    logger.info(`🚀 Started milestone: ${milestone}`);
  }

  async completeMilestone(milestone, data = {}) {
    if (!this.initialized) {
      throw new Error('NucleusManager not initialized');
    }

    this.state.milestones[milestone] = {
      ...this.state.milestones[milestone],
      status: MILESTONE_STATUS.COMPLETED,
      completed_at: new Date().toISOString(),
      data
    };

    await this._persist();
    logger.success(`✅ Completed milestone: ${milestone}`);
  }

  async failMilestone(milestone, errorMessage) {
    if (!this.initialized) {
      throw new Error('NucleusManager not initialized');
    }

    this.state.milestones[milestone] = {
      ...this.state.milestones[milestone],
      status: MILESTONE_STATUS.FAILED,
      failed_at: new Date().toISOString(),
      error: errorMessage
    };

    await this._persist();
    logger.error(`❌ Failed milestone: ${milestone} - ${errorMessage}`);
  }

  // --------------------------------------------------------------------------
  // SUB-MILESTONE MANAGEMENT
  // --------------------------------------------------------------------------

  isSubMilestoneCompleted(milestone, subMilestone) {
    const m = this.state.milestones[milestone];
    if (!m || !m.sub_milestones) return false;
    return m.sub_milestones[subMilestone] === true;
  }

  async completeSubMilestone(milestone, subMilestone) {
    if (!this.initialized) {
      throw new Error('NucleusManager not initialized');
    }

    if (!this.state.milestones[milestone]) {
      this.state.milestones[milestone] = {
        status: MILESTONE_STATUS.IN_PROGRESS,
        started_at: new Date().toISOString(),
        sub_milestones: {}
      };
    }

    if (!this.state.milestones[milestone].sub_milestones) {
      this.state.milestones[milestone].sub_milestones = {};
    }

    this.state.milestones[milestone].sub_milestones[subMilestone] = true;
    await this._persist();
    logger.success(`✓ Sub-milestone: ${milestone}/${subMilestone}`);
  }

  // --------------------------------------------------------------------------
  // INSTALLATION STATUS
  // --------------------------------------------------------------------------

  async markInstallationComplete() {
    if (!this.initialized) {
      throw new Error('NucleusManager not initialized');
    }

    this.state.installation_complete = true;
    this.state.completed_at = new Date().toISOString();

    await this._persist();
    logger.success('🎉 Installation marked as complete');
  }

  async setMasterProfile(profileId) {
    if (!this.initialized) {
      throw new Error('NucleusManager not initialized');
    }

    this.state.master_profile = profileId;
    await this._persist();
    logger.success(`🧠 Master profile set: ${profileId}`);
  }

  getInstallationSummary() {
    const milestones = Object.keys(this.state.milestones);
    const completed = milestones.filter(m => this.isMilestoneCompleted(m));
    const failed = milestones.filter(m => 
      this.state.milestones[m]?.status === MILESTONE_STATUS.FAILED
    );
    const inProgress = milestones.filter(m => 
      this.state.milestones[m]?.status === MILESTONE_STATUS.IN_PROGRESS
    );

    // Determine next milestone to run
    const orderedMilestones = [
      'directories',
      'chromium',
      'brain_runtime',
      'binaries',
      'conductor',
      'brain_service_install',
      'orchestration_init',
      'ollama_init',
      'nucleus_seed',
      'certification'
    ];

    let nextMilestone = null;
    for (const m of orderedMilestones) {
      if (!this.isMilestoneCompleted(m) && 
          this.state.milestones[m]?.status !== MILESTONE_STATUS.IN_PROGRESS) {
        nextMilestone = m;
        break;
      }
    }

    return {
      installation_complete: this.state.installation_complete,
      total_milestones: milestones.length,
      completed_count: completed.length,
      failed_count: failed.length,
      in_progress_count: inProgress.length,
      completed_milestones: completed,
      failed_milestones: failed,
      in_progress_milestones: inProgress,
      next_milestone: nextMilestone,
      master_profile: this.state.master_profile,
      started_at: this.state.started_at,
      completed_at: this.state.completed_at
    };
  }

  // --------------------------------------------------------------------------
  // RESET/CLEANUP
  // --------------------------------------------------------------------------

  async reset() {
    if (!this.initialized) {
      throw new Error('NucleusManager not initialized');
    }

    this.state = {
      ...INITIAL_STATE,
      started_at: new Date().toISOString()
    };

    await this._persist();
    logger.warn('🔄 Installation state reset');
  }

  async resetMilestone(milestone) {
    if (!this.initialized) {
      throw new Error('NucleusManager not initialized');
    }

    delete this.state.milestones[milestone];
    await this._persist();
    logger.warn(`🔄 Reset milestone: ${milestone}`);
  }

  // --------------------------------------------------------------------------
  // PERSISTENCE
  // --------------------------------------------------------------------------

  async _persist() {
    try {
      await fs.ensureDir(path.dirname(this.stateFile));
      await fs.writeJson(this.stateFile, this.state, { spaces: 2 });
      logger.debug('💾 State persisted');
    } catch (error) {
      logger.error('Failed to persist state:', error);
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // UTILITIES
  // --------------------------------------------------------------------------

  getState() {
    return { ...this.state };
  }

  getMilestone(milestone) {
    return this.state.milestones[milestone] || null;
  }

  getAllMilestones() {
    return { ...this.state.milestones };
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

const nucleusManager = new NucleusManager();

module.exports = {
  nucleusManager,
  NucleusManager,
  MILESTONE_STATUS
};