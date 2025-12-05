#!/usr/bin/env node

/**
 * Build script for Bloom Nucleus Installer
 * Handles pre-build checks and preparation
 */

const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.join(__dirname, '..');

// Required directories and files
const requirements = [
  {
    path: 'native/bin/win32/bloom-host.exe',
    description: 'Windows native host binary'
  },
  {
    path: 'native/bin/darwin/bloom-host',
    description: 'macOS native host binary'
  },
  {
    path: 'native/bin/linux/bloom-host',
    description: 'Linux native host binary'
  },
  {
    path: 'chrome-extension/manifest.json',
    description: 'Chrome extension manifest'
  },
  {
    path: 'electron-app/main.js',
    description: 'Electron main process'
  }
];

console.log('🔍 Checking build requirements...\n');

let allPresent = true;
const missing = [];

for (const req of requirements) {
  const fullPath = path.join(rootDir, req.path);
  const exists = fs.existsSync(fullPath);
  
  const status = exists ? '✓' : '✗';
  const color = exists ? '\x1b[32m' : '\x1b[31m';
  const reset = '\x1b[0m';
  
  console.log(`${color}${status}${reset} ${req.description}`);
  
  if (!exists) {
    allPresent = false;
    missing.push(req);
  }
}

console.log('');

if (!allPresent) {
  console.error('❌ Missing required files:\n');
  for (const req of missing) {
    console.error(`   - ${req.path}`);
    console.error(`     ${req.description}\n`);
  }
  console.error('Please build all required components before running the installer build.');
  process.exit(1);
}

console.log('✅ All requirements satisfied!\n');

// Check for VSCode extension
const vsixPath = path.join(rootDir, 'vscode-plugin/bloom-nucleus.vsix');
const vsixExists = fs.existsSync(vsixPath);

if (!vsixExists) {
  console.warn('⚠️  Warning: VSCode extension (.vsix) not found');
  console.warn('   The installer will only support development mode');
  console.warn('   To enable production installation, build the VSCode extension:\n');
  console.warn('   cd vscode-plugin && vsce package\n');
}

// Verify package.json
console.log('📦 Verifying package configuration...');
const packageJson = require(path.join(rootDir, 'package.json'));

if (!packageJson.dependencies['fs-extra']) {
  console.error('❌ Missing required dependency: fs-extra');
  process.exit(1);
}

console.log('✓ Package configuration valid\n');

// Run the actual build
const platform = process.argv[2] || '';
let buildCommand = 'npm run build';

if (platform === 'win') {
  buildCommand = 'npm run build:win';
} else if (platform === 'mac') {
  buildCommand = 'npm run build:mac';
} else if (platform === 'linux') {
  buildCommand = 'npm run build:linux';
}

console.log(`🚀 Starting build: ${buildCommand}\n`);

try {
  execSync(buildCommand, { stdio: 'inherit', cwd: rootDir });
  console.log('\n✅ Build completed successfully!');
  console.log(`📦 Output directory: ${path.join(rootDir, 'dist')}`);
} catch (error) {
  console.error('\n❌ Build failed');
  process.exit(1);
}