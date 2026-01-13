// native-host-installer.js - REFACTORED: Binary Copier Only
// ============================================================================
// SIMPLIFIED RESPONSIBILITY: Copy binaries to unified structure
// - Copy brain.exe + _internal to bin/brain/
// - Copy bloom-host.exe to bin/native/
// - Copy nssm.exe to bin/native/
// 
// NO LONGER DOES:
// - Install Windows Service (handled by service-installer.js)
// - Create Native Messaging manifests (Brain handles per profile)
// - Configure registry (Brain handles per profile)
// ============================================================================

const fs = require('fs-extra');
const path = require('path');
const { paths } = require('../config/paths');

/**
 * Helper for copying with retries and process cleanup
 */
async function copyWithRetry(src, dest, processNameToCheck, maxAttempts = 3) {
  let lastError = null;
  
  // Determine if source is file or directory
  const srcStats = await fs.stat(src);
  const isFile = srcStats.isFile();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (isFile) {
        // For files, ensure destination directory exists
        await fs.ensureDir(path.dirname(dest));
        await fs.copy(src, dest, { overwrite: true });
      } else {
        // For directories, copy entire structure
        await fs.copy(src, dest, { overwrite: true, errorOnExist: false });
      }
      
      console.log(`  ✅ Copied successfully: ${path.basename(src)}`);
      return; 
      
    } catch (err) {
      lastError = err;
      console.warn(`  ⚠️ Copy attempt ${attempt}/${maxAttempts} failed: ${err.message}`);
      
      if (attempt < maxAttempts) {
        console.log(`  ⏳ Retrying in 2 seconds...`);
        
        // Try to kill blocking process on Windows
        if (process.platform === 'win32' && processNameToCheck) {
          try {
            const { execSync } = require('child_process');
            execSync(`taskkill /F /IM ${processNameToCheck} /T`, { 
              stdio: 'ignore',
              windowsHide: true 
            });
            console.log(`  🔪 Killed blocking process: ${processNameToCheck}`);
          } catch (e) {
            // Process might not be running, that's okay
          }
        }
        
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }
  
  throw new Error(`Failed to copy ${src} after ${maxAttempts} attempts: ${lastError.message}`);
}

/**
 * Copies Brain service (brain.exe + _internal) to bin/brain/
 */
async function deployBrain() {
  console.log('\n🧠 DEPLOYING BRAIN SERVICE');
  
  const source = paths.brainSource;
  const destination = paths.brainDir;
  
  console.log(`📂 Source: ${source}`);
  console.log(`📂 Destination: ${destination}`);
  
  // Validate source exists
  if (!await fs.pathExists(source)) {
    throw new Error(
      `Brain source not found at: ${source}\n` +
      `💡 Make sure you've run: python scripts/build_brain.py`
    );
  }
  
  // Ensure destination directory exists
  await fs.ensureDir(destination);
  
  // Copy entire brain folder (includes _internal, DLLs, etc.)
  await copyWithRetry(source, destination, 'brain.exe', 3);
  
  // Verify brain.exe exists
  const brainExePath = path.join(destination, 'brain.exe');
  if (!await fs.pathExists(brainExePath)) {
    throw new Error(`brain.exe not found after copy: ${brainExePath}`);
  }
  
  // Verify _internal folder exists (PyInstaller dependency folder)
  const internalPath = path.join(destination, '_internal');
  if (!await fs.pathExists(internalPath)) {
    console.warn('⚠️ Warning: _internal folder not found. Brain may not work correctly.');
  }
  
  console.log('✅ Brain service deployed successfully');
  console.log(`   Executable: ${brainExePath}`);
  console.log(`   Dependencies: ${internalPath}`);
  
  return {
    success: true,
    brainExe: brainExePath,
    brainDir: destination
  };
}

/**
 * Copies Native Host (bloom-host.exe) to bin/native/
 * This is the single binary that all profiles will use for Native Messaging
 */
async function deployNativeHost() {
  console.log('\n🔗 DEPLOYING NATIVE HOST');
  
  const source = paths.nativeSource;
  const destination = path.join(paths.nativeDir, 'bloom-host.exe');
  
  console.log(`📂 Source: ${source}`);
  console.log(`📂 Destination: ${destination}`);
  
  // Validate source exists
  if (!await fs.pathExists(source)) {
    throw new Error(`Native host source not found at: ${source}`);
  }
  
  // Copy with retry (might be locked by previous installation)
  await copyWithRetry(source, destination, 'bloom-host.exe', 3);
  
  // Verify
  if (!await fs.pathExists(destination)) {
    throw new Error(`bloom-host.exe not found after copy: ${destination}`);
  }
  
  console.log('✅ Native host deployed successfully');
  console.log(`   Executable: ${destination}`);
  console.log('ℹ️ This binary will be shared by all profiles');
  
  return {
    success: true,
    hostBinary: destination
  };
}

/**
 * Copies NSSM (Non-Sucking Service Manager) to bin/native/
 * Required for Windows service installation
 */
async function deployNSSM() {
  console.log('\n⚙️ DEPLOYING NSSM');
  
  const source = paths.nssmExe;
  const destination = path.join(paths.nativeDir, 'nssm.exe');
  
  console.log(`📂 Source: ${source}`);
  console.log(`📂 Destination: ${destination}`);
  
  // Validate source exists
  if (!await fs.pathExists(source)) {
    throw new Error(`NSSM not found at: ${source}`);
  }
  
  // Copy with retry
  await copyWithRetry(source, destination, 'nssm.exe', 3);
  
  // Verify
  if (!await fs.pathExists(destination)) {
    throw new Error(`nssm.exe not found after copy: ${destination}`);
  }
  
  console.log('✅ NSSM deployed successfully');
  console.log(`   Executable: ${destination}`);
  
  return {
    success: true,
    nssmExe: destination
  };
}

/**
 * Main function: Deploys all native binaries
 * This is the simplified version that only copies files
 * Service installation is handled separately by service-installer.js
 */
async function installNativeHost() {
  console.log('\n📦 DEPLOYING NATIVE BINARIES\n');
  console.log('=' .repeat(60));
  
  try {
    // Deploy all binaries in sequence
    const brainResult = await deployBrain();
    const hostResult = await deployNativeHost();
    const nssmResult = await deployNSSM();
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ ALL BINARIES DEPLOYED SUCCESSFULLY');
    console.log('=' .repeat(60));
    console.log('\n📁 Deployment Summary:');
    console.log(`   🧠 Brain: ${brainResult.brainExe}`);
    console.log(`   🔗 Native Host: ${hostResult.hostBinary}`);
    console.log(`   ⚙️ NSSM: ${nssmResult.nssmExe}`);
    console.log('\nℹ️ Next steps:');
    console.log('   1. Install Windows Service (service-installer.js)');
    console.log('   2. Create profiles via Brain CLI');
    console.log('   3. Launch profiles for validation');
    
    return {
      success: true,
      brain: brainResult,
      nativeHost: hostResult,
      nssm: nssmResult
    };
    
  } catch (error) {
    console.error('\n❌ BINARY DEPLOYMENT FAILED');
    console.error(`Error: ${error.message}`);
    throw error;
  }
}

/**
 * Verifies that all binaries are correctly deployed
 */
async function verifyBinaries() {
  console.log('\n🔍 VERIFYING BINARY DEPLOYMENT');
  
  const checks = [
    { name: 'Brain', path: paths.brainExe },
    { name: 'Brain _internal', path: path.join(paths.brainDir, '_internal') },
    { name: 'Native Host', path: paths.hostBinary },
    { name: 'NSSM', path: path.join(paths.nativeDir, 'nssm.exe') }
  ];
  
  const results = [];
  let allValid = true;
  
  for (const check of checks) {
    const exists = await fs.pathExists(check.path);
    results.push({ ...check, exists });
    
    if (!exists) {
      allValid = false;
      console.error(`❌ ${check.name} not found: ${check.path}`);
    } else {
      console.log(`✅ ${check.name}: ${check.path}`);
    }
  }
  
  if (!allValid) {
    throw new Error('Binary verification failed - some files are missing');
  }
  
  console.log('✅ All binaries verified successfully');
  
  return {
    success: true,
    checks: results
  };
}

/**
 * Gets information about deployed binaries
 */
async function getBinaryInfo() {
  const info = {
    brain: {
      exe: paths.brainExe,
      dir: paths.brainDir,
      exists: await fs.pathExists(paths.brainExe)
    },
    nativeHost: {
      exe: paths.hostBinary,
      exists: await fs.pathExists(paths.hostBinary)
    },
    nssm: {
      exe: path.join(paths.nativeDir, 'nssm.exe'),
      exists: await fs.pathExists(path.join(paths.nativeDir, 'nssm.exe'))
    }
  };
  
  // Get file sizes if they exist
  for (const [key, value] of Object.entries(info)) {
    if (value.exists && value.exe) {
      try {
        const stats = await fs.stat(value.exe);
        value.size = stats.size;
        value.sizeFormatted = `${(stats.size / 1024 / 1024).toFixed(2)} MB`;
      } catch (e) {
        value.size = null;
      }
    }
  }
  
  return info;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Main functions
  installNativeHost,
  verifyBinaries,
  getBinaryInfo,
  
  // Individual deployment functions (for granular control)
  deployBrain,
  deployNativeHost,
  deployNSSM,
  
  // Utilities
  copyWithRetry
};