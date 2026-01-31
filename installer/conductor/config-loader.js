/**
 * Bloom Nucleus Configuration Loader - Basic Version
 */

const fs = require('fs-extra');
const path = require('path');
const os = require('os');

class ConfigLoader {
  constructor(configPath = null) {
    this.configPath = configPath || path.join(__dirname, 'installer-config.json');
    this.config = null;
    this.platform = process.platform;
  }

  /**
   * Load configuration
   */
  async load() {
    this.config = await fs.readJson(this.configPath);
    return this.config;
  }

  /**
   * Get installation paths for current platform
   */
  getPaths() {
    const paths = this.config.installation.paths[this.platform];
    const expanded = {};
    
    for (const [key, value] of Object.entries(paths)) {
      expanded[key] = this.expandPath(value);
    }
    
    return expanded;
  }

  /**
   * Expand path with environment variables
   */
  expandPath(pathStr) {
    let expanded = pathStr;

    if (this.platform === 'win32') {
      // Windows: %VAR%
      expanded = expanded.replace(/%([^%]+)%/g, (match, varName) => {
        return process.env[varName] || match;
      });
    } else {
      // Unix: ~
      expanded = expanded.replace(/^~/, os.homedir());
    }

    return path.normalize(expanded);
  }

  /**
   * Get service configuration
   */
  getServiceConfig() {
    return {
      name: this.config.service.name,
      port: this.config.service.default_port,
      portRange: this.config.service.port_range,
      healthCheck: this.config.service.health_check
    };
  }

  /**
   * Get BTIP configuration
   */
  getBTIPConfig() {
    return this.config.btip;
  }
}

// Singleton
let instance = null;

module.exports = {
  async load(configPath = null) {
    if (!instance) {
      instance = new ConfigLoader(configPath);
      await instance.load();
    }
    return instance;
  }
};