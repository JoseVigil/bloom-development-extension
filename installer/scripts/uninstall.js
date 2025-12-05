#!/usr/bin/env node

/**
 * Uninstaller for Bloom Nucleus
 * Removes all installed components
 */

const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

const platform = process.platform;

// Paths
const paths = {
  bloomDir: platform === 'win32'
    ? path.join(process.env.APPDATA, 'Bloom')
    : path.join(process.env.HOME, '.config', 'Bloom'),
  vsCodeExtDir: path.join(process.env.HOME, '.vscode', 'extensions'),
  nativeHostManifest: platform === 'win32'
    ? null // Registry on Windows
    : platform === 'darwin'
    ? path.join(process.env.HOME, 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts', 'com.bloom.nucleus.host.json')
    : path.join(process.env.HOME, '.config', 'google-chrome', 'NativeMessagingHosts', 'com.bloom.nucleus.host.json')
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function confirm(message) {
  const answer = await question(`${message} (y/n): `);
  return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
}

async function removeDirectory(dir, name) {
  if (await fs.pathExists(dir)) {
    console.log(`🗑️  Removing ${name}...`);
    await fs.remove(dir);
    console.log(`✓ ${name} removed`);
    return true;
  }
  return false;
}

async function removeFile(file, name) {
  if (await fs.pathExists(file)) {
    console.log(`🗑️  Removing ${name}...`);
    await fs.remove(file);
    console.log(`✓ ${name} removed`);
    return true;
  }
  return false;
}

async function removeWindowsRegistry() {
  const regKey = 'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.bloom.nucleus.host';
  
  try {
    console.log('🗑️  Removing Windows registry entry...');
    execSync(`reg delete "${regKey}" /f`, { stdio: 'ignore' });
    console.log('✓ Registry entry removed');
    return true;
  } catch (error) {
    console.warn('⚠️  Could not remove registry entry (may not exist)');
    return false;
  }
}

async function removeVSCodeExtension() {
  const extensionPattern = /bloom-nucleus/;
  const extensions = await fs.readdir(paths.vsCodeExtDir).catch(() => []);
  
  let removed = false;
  for (const ext of extensions) {
    if (extensionPattern.test(ext)) {
      const extPath = path.join(paths.vsCodeExtDir, ext);
      console.log(`🗑️  Removing VSCode extension: ${ext}...`);
      await fs.remove(extPath);
      console.log(`✓ Extension removed: ${ext}`);
      removed = true;
    }
  }
  
  if (!removed) {
    console.log('ℹ️  No Bloom VSCode extensions found');
  }
  
  return removed;
}

async function main() {
  console.log('\n🔴 Bloom Nucleus Uninstaller\n');
  console.log('This will remove all Bloom Nucleus components from your system:');
  console.log('  - Native messaging host');
  console.log('  - VSCode extension');
  console.log('  - Chrome extension files');
  console.log('  - Configuration and data\n');
  
  const confirmed = await confirm('⚠️  Are you sure you want to uninstall Bloom Nucleus?');
  
  if (!confirmed) {
    console.log('\nUninstallation cancelled.');
    rl.close();
    return;
  }
  
  console.log('\n🚀 Starting uninstallation...\n');
  
  let itemsRemoved = 0;
  
  // Remove main Bloom directory
  if (await removeDirectory(paths.bloomDir, 'Bloom data directory')) {
    itemsRemoved++;
  }
  
  // Remove VSCode extension
  if (await removeVSCodeExtension()) {
    itemsRemoved++;
  }
  
  // Remove native host registration
  if (platform === 'win32') {
    if (await removeWindowsRegistry()) {
      itemsRemoved++;
    }
  } else if (paths.nativeHostManifest) {
    if (await removeFile(paths.nativeHostManifest, 'Native host manifest')) {
      itemsRemoved++;
    }
  }
  
  console.log('\n' + '='.repeat(50));
  
  if (itemsRemoved > 0) {
    console.log('\n✅ Uninstallation complete!');
    console.log(`\n${itemsRemoved} component(s) removed.`);
    console.log('\nNote: You may need to manually remove the Chrome extension from chrome://extensions/');
  } else {
    console.log('\n⚠️  No Bloom Nucleus components found.');
    console.log('The system may have already been uninstalled.');
  }
  
  console.log('\n' + '='.repeat(50) + '\n');
  
  rl.close();
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error('\n❌ Uninstallation failed:', error.message);
  rl.close();
  process.exit(1);
});

main();