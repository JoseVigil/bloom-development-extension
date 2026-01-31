#!/usr/bin/env node
/**
 * Bloom Nucleus Installation Test - Basic Version
 */

const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const platform = process.platform;
const isWindows = platform === 'win32';

// Load config
let config;
try {
  config = require('./installer-config.json');
  console.log('✓ Config loaded');
} catch (error) {
  console.error('✗ Failed to load config:', error.message);
  process.exit(1);
}

async function runTests() {
  console.log('\n=== Bloom Nucleus Installation Test ===\n');
  
  let passed = 0;
  let failed = 0;

  // Test 1: Admin privileges
  try {
    if (isWindows) {
      await execPromise('net session');
      console.log('✓ Administrator privileges');
      passed++;
    } else {
      console.log('⚠ Run as sudo for full test');
      passed++;
    }
  } catch (error) {
    console.log('✗ Administrator privileges required');
    failed++;
  }

  // Test 2: Paths configuration
  try {
    const paths = config.installation.paths[platform];
    if (paths && paths.install_dir) {
      console.log('✓ Installation paths configured');
      passed++;
    } else {
      throw new Error('Missing paths');
    }
  } catch (error) {
    console.log('✗ Installation paths:', error.message);
    failed++;
  }

  // Test 3: Native host binary
  try {
    const binaryName = isWindows ? 'bloom-host.exe' : 'bloom-host';
    const binaryPath = path.join(__dirname, '..', 'native', 'bin', platform, binaryName);
    await fs.access(binaryPath);
    console.log('✓ Native host binary found');
    passed++;
  } catch (error) {
    console.log('✗ Native host binary not found');
    failed++;
  }

  // Test 4: Chrome extension
  try {
    const extPath = path.join(__dirname, '..', 'chrome-extension', 'manifest.json');
    await fs.access(extPath);
    console.log('✓ Chrome extension found');
    passed++;
  } catch (error) {
    console.log('✗ Chrome extension not found');
    failed++;
  }

  // Test 5: Service configuration
  try {
    const service = config.service;
    if (service.default_port >= 1024 && service.default_port <= 65535) {
      console.log('✓ Service configuration valid');
      passed++;
    } else {
      throw new Error('Invalid port');
    }
  } catch (error) {
    console.log('✗ Service configuration:', error.message);
    failed++;
  }

  // Test 6: BTIP configuration
  try {
    const btip = config.btip;
    if (btip.workspace_dir && btip.intent_types.length > 0) {
      console.log('✓ BTIP configuration valid');
      passed++;
    } else {
      throw new Error('Invalid BTIP config');
    }
  } catch (error) {
    console.log('✗ BTIP configuration:', error.message);
    failed++;
  }

  // Summary
  console.log('\n=== Summary ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);
  
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(error => {
  console.error('Test error:', error);
  process.exit(1);
});