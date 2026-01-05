// profile-manager.js - UPDATED WITH LANDING SUPPORT
const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const { paths } = require('../config/paths');
const { generateProfileLanding, updateLandingMetadata, getLandingURL } = require('./landing-generator');

/**
 * Create new Chrome profile with landing page
 */
async function createProfile(alias, options = {}) {
  const profileId = `bloom_${alias.toLowerCase().replace(/\s+/g, '_')}_${uuidv4().slice(0, 8)}`;
  const profilePath = path.join(paths.profilesDir, profileId);
  const userDataDir = path.join(profilePath, 'user_data');

  console.log(`📦 Creating profile: ${profileId}`);

  // Create directories
  await fs.ensureDir(userDataDir);
  
  // Profile metadata
  const metadata = {
    id: profileId,
    alias,
    role: options.role || 'Worker Profile',
    created: new Date().toISOString(),
    lastLaunch: null,
    accounts: options.accounts || [],
    extensionId: options.extensionId || null,
    stats: {
      totalLaunches: 0,
      uptime: '0h',
      intentsCompleted: 0,
      lastSync: null
    }
  };

  // Save profile config
  const configPath = path.join(profilePath, 'profile.json');
  await fs.writeJson(configPath, metadata, { spaces: 2 });

  // 🆕 Generate landing page
  console.log('🎨 Generating landing page...');
  const landingPath = await generateProfileLanding(profileId, metadata);
  console.log(`✅ Landing ready: ${landingPath}`);

  // Register in global config
  await registerProfile(profileId, metadata);

  console.log(`✅ Profile created: ${profileId}`);
  return { profileId, metadata, landingPath };
}

/**
 * Launch Chrome profile with landing page
 */
async function launchProfile(profileId, options = {}) {
  const profilePath = path.join(paths.profilesDir, profileId);
  const configPath = path.join(profilePath, 'profile.json');

  if (!await fs.pathExists(configPath)) {
    throw new Error(`Profile not found: ${profileId}`);
  }

  // Load profile metadata
  const metadata = await fs.readJson(configPath);

  // 🆕 Update landing metadata
  console.log('📝 Updating landing metadata...');
  const updatedStats = {
    ...metadata.stats,
    totalLaunches: (metadata.stats.totalLaunches || 0) + 1,
    lastLaunch: new Date().toISOString()
  };
  
  await updateLandingMetadata(profileId, { stats: updatedStats });
  
  // Update profile config
  metadata.stats = updatedStats;
  metadata.lastLaunch = new Date().toISOString();
  await fs.writeJson(configPath, metadata, { spaces: 2 });

  // 🆕 Get landing URL (default) or custom URL
  const targetURL = options.url || getLandingURL(profileId);
  
  console.log(`🚀 Launching profile: ${profileId}`);
  console.log(`📍 URL: ${targetURL}`);

  // Chrome launch arguments
  const userDataDir = path.join(profilePath, 'user_data');
  const extensionPath = path.join(paths.extensionBrainDir);

  const chromeArgs = [
    `--user-data-dir=${userDataDir}`,
    `--load-extension=${extensionPath}`,
    '--no-first-run',
    '--no-default-browser-check',
    targetURL
  ];

  // Find Chrome executable
  const chromePath = findChromeExecutable();
  
  if (!chromePath) {
    throw new Error('Chrome executable not found');
  }

  // Launch Chrome
  const chromeProcess = spawn(chromePath, chromeArgs, {
    detached: true,
    stdio: 'ignore'
  });

  chromeProcess.unref();

  console.log(`✅ Chrome launched with PID: ${chromeProcess.pid}`);
  
  return {
    success: true,
    profileId,
    pid: chromeProcess.pid,
    url: targetURL
  };
}

/**
 * List all profiles
 */
async function listProfiles() {
  const profilesDir = paths.profilesDir;
  
  if (!await fs.pathExists(profilesDir)) {
    return [];
  }

  const entries = await fs.readdir(profilesDir);
  const profiles = [];

  for (const entry of entries) {
    const profilePath = path.join(profilesDir, entry);
    const configPath = path.join(profilePath, 'profile.json');

    if (await fs.pathExists(configPath)) {
      const metadata = await fs.readJson(configPath);
      
      // Check if landing exists
      const landingPath = path.join(profilePath, 'landing', 'index.html');
      metadata.hasLanding = await fs.pathExists(landingPath);
      
      profiles.push(metadata);
    }
  }

  return profiles;
}

/**
 * Get profile metadata
 */
async function getProfile(profileId) {
  const configPath = path.join(paths.profilesDir, profileId, 'profile.json');
  
  if (!await fs.pathExists(configPath)) {
    throw new Error(`Profile not found: ${profileId}`);
  }

  const metadata = await fs.readJson(configPath);
  
  // Check landing
  const landingPath = path.join(paths.profilesDir, profileId, 'landing', 'index.html');
  metadata.hasLanding = await fs.pathExists(landingPath);
  metadata.landingURL = metadata.hasLanding ? getLandingURL(profileId) : null;

  return metadata;
}

/**
 * Update profile (link accounts, update stats, etc)
 */
async function updateProfile(profileId, updates) {
  const configPath = path.join(paths.profilesDir, profileId, 'profile.json');
  
  if (!await fs.pathExists(configPath)) {
    throw new Error(`Profile not found: ${profileId}`);
  }

  const metadata = await fs.readJson(configPath);
  const updated = { ...metadata, ...updates };
  
  await fs.writeJson(configPath, updated, { spaces: 2 });

  // 🆕 If accounts or stats changed, regenerate landing
  if (updates.accounts || updates.stats) {
    console.log('🔄 Regenerating landing with new data...');
    await generateProfileLanding(profileId, updated);
  }

  return updated;
}

/**
 * Delete profile completely
 */
async function deleteProfile(profileId, force = false) {
  const profilePath = path.join(paths.profilesDir, profileId);
  
  if (!await fs.pathExists(profilePath)) {
    throw new Error(`Profile not found: ${profileId}`);
  }

  if (!force) {
    // TODO: Add confirmation prompt
    console.warn(`⚠️  This will delete profile: ${profileId}`);
  }

  await fs.remove(profilePath);
  await unregisterProfile(profileId);

  console.log(`✅ Profile deleted: ${profileId}`);
}

/**
 * Regenerate landing for existing profile
 */
async function regenerateLanding(profileId) {
  const metadata = await getProfile(profileId);
  console.log(`🔄 Regenerating landing for: ${profileId}`);
  
  const landingPath = await generateProfileLanding(profileId, metadata);
  
  console.log(`✅ Landing regenerated: ${landingPath}`);
  return landingPath;
}

// ============================================================================
// HELPERS
// ============================================================================

async function registerProfile(profileId, metadata) {
  const globalConfigPath = paths.configFile;
  let config = {};

  if (await fs.pathExists(globalConfigPath)) {
    config = await fs.readJson(globalConfigPath);
  }

  if (!config.profiles) {
    config.profiles = {};
  }

  config.profiles[profileId] = {
    alias: metadata.alias,
    created: metadata.created,
    path: path.join(paths.profilesDir, profileId)
  };

  await fs.writeJson(globalConfigPath, config, { spaces: 2 });
}

async function unregisterProfile(profileId) {
  const globalConfigPath = paths.configFile;
  
  if (!await fs.pathExists(globalConfigPath)) {
    return;
  }

  const config = await fs.readJson(globalConfigPath);
  
  if (config.profiles && config.profiles[profileId]) {
    delete config.profiles[profileId];
    await fs.writeJson(globalConfigPath, config, { spaces: 2 });
  }
}

function findChromeExecutable() {
  const possiblePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(require('os').homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe')
  ];

  return possiblePaths.find(p => fs.existsSync(p));
}

module.exports = {
  createProfile,
  launchProfile,
  listProfiles,
  getProfile,
  updateProfile,
  deleteProfile,
  regenerateLanding
};