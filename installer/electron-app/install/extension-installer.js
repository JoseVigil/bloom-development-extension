// extension-installer.js - REFACTORED: Template Copier Only
// ============================================================================
// SIMPLIFIED RESPONSIBILITY: Copy extension template only
// - Find and copy extension source to bin/extension/
// - Validate manifest.json exists
// 
// NO LONGER DOES:
// - Calculate Extension ID (Brain handles this per profile)
// - Create Native Messaging manifests (Brain handles this per profile)
// - Register in Windows Registry (Brain handles this per profile)
// ============================================================================

const fs = require('fs-extra');
const path = require('path');
const { paths } = require('../config/paths');

// ============================================================================
// EXTENSION TEMPLATE FUNCTIONS
// ============================================================================

/**
 * Finds the correct folder containing manifest.json
 * Handles cases where manifest.json is in /src or at root
 */
async function findExtensionSource(baseSource) {
  // Case 1: manifest.json in /src subfolder
  if (await fs.pathExists(path.join(baseSource, 'src', 'manifest.json'))) {
    console.log('ℹ️ Detected manifest inside /src subfolder. Adjusting source path.');
    return path.join(baseSource, 'src');
  }
  
  // Case 2: manifest.json at root
  if (await fs.pathExists(path.join(baseSource, 'manifest.json'))) {
    console.log('✅ Manifest found at root of source.');
    return baseSource;
  }
  
  // Case 3: Fallback to alternative path
  const alternative = path.resolve(__dirname, '../../chrome-extension/src');
  if (await fs.pathExists(path.join(alternative, 'manifest.json'))) {
    console.log('🔄 Switching to alternative source path:', alternative);
    return alternative;
  }
  
  throw new Error(`Cannot find manifest.json in ${baseSource} or subfolders`);
}

/**
 * Copies the extension from source to bin/extension/ as a TEMPLATE
 * This template will be copied per-profile by Brain CLI
 * 
 * Structure:
 * - Source: repo/chrome-extension/src/
 * - Destination: %LOCALAPPDATA%/BloomNucleus/bin/extension/
 * 
 * Brain will later copy this to profiles/[UUID]/extension/ per profile
 */
async function installExtension() {
  console.log('\n🧩 INSTALLING EXTENSION TEMPLATE');
  
  // Determine correct source
  const extensionSource = await findExtensionSource(paths.extensionSource);
  const templateDestination = paths.extensionTemplateDir || paths.extensionDir;
  
  console.log('📂 Source:', extensionSource);
  console.log('📂 Template Destination:', templateDestination);

  // Clean destination
  if (await fs.pathExists(templateDestination)) {
    await fs.emptyDir(templateDestination);
  } else {
    await fs.ensureDir(templateDestination);
  }
  
  // Copy with filters
  await fs.copy(extensionSource, templateDestination, {
    overwrite: true,
    filter: (src) => {
      const basename = path.basename(src);
      // Exclude development files
      return !basename.includes('node_modules') && 
             !basename.includes('.git') &&
             !basename.startsWith('.') &&
             basename !== 'package.json' &&
             basename !== 'package-lock.json';
    }
  });
  
  // Verify manifest.json exists in destination
  const manifestPath = path.join(templateDestination, 'manifest.json');
  if (!await fs.pathExists(manifestPath)) {
    throw new Error("❌ CRITICAL: manifest.json missing in template destination after copy.");
  }

  console.log('✅ Extension template installed successfully');
  console.log('ℹ️ Brain will copy this template per profile');
  
  return { 
    success: true,
    templatePath: templateDestination
  };
}

/**
 * Validates that the extension template is correctly installed
 */
async function verifyExtensionTemplate() {
  console.log('\n✅ VERIFYING EXTENSION TEMPLATE');
  
  const templateDir = paths.extensionTemplateDir || paths.extensionDir;
  const manifestPath = path.join(templateDir, 'manifest.json');
  
  if (!await fs.pathExists(manifestPath)) {
    throw new Error('Extension template verification failed: manifest.json not found');
  }
  
  const manifest = await fs.readJson(manifestPath);
  
  // Verify required fields
  const requiredFields = ['name', 'version', 'manifest_version'];
  const missing = requiredFields.filter(field => !manifest[field]);
  
  if (missing.length > 0) {
    throw new Error(`Extension manifest missing required fields: ${missing.join(', ')}`);
  }
  
  console.log('✅ Extension template verification passed');
  console.log(`   Name: ${manifest.name}`);
  console.log(`   Version: ${manifest.version}`);
  console.log(`   Manifest Version: ${manifest.manifest_version}`);
  
  return { 
    success: true,
    manifest
  };
}

/**
 * Gets information about the extension template
 */
async function getExtensionTemplateInfo() {
  const templateDir = paths.extensionTemplateDir || paths.extensionDir;
  const manifestPath = path.join(templateDir, 'manifest.json');
  
  if (!await fs.pathExists(manifestPath)) {
    return null;
  }
  
  const manifest = await fs.readJson(manifestPath);
  
  return {
    name: manifest.name,
    version: manifest.version,
    manifestVersion: manifest.manifest_version,
    templatePath: templateDir,
    description: manifest.description,
    permissions: manifest.permissions || [],
    hostPermissions: manifest.host_permissions || []
  };
}

/**
 * Reads the manifest.json from the template
 * Useful for debugging or validation
 */
async function readTemplateManifest() {
  const templateDir = paths.extensionTemplateDir || paths.extensionDir;
  const manifestPath = path.join(templateDir, 'manifest.json');
  
  if (!await fs.pathExists(manifestPath)) {
    throw new Error('Template manifest not found');
  }
  
  return await fs.readJson(manifestPath);
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Main functions
  installExtension,
  verifyExtensionTemplate,
  getExtensionTemplateInfo,
  
  // Helper functions
  findExtensionSource,
  readTemplateManifest
};