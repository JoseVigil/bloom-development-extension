#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const platform = process.platform;

function check(name, condition, path = '') {
  const status = condition ? '✅' : '❌';
  console.log(`${status} ${name}${path ? ` (${path})` : ''}`);
  return condition;
}

console.log('\n🔍 Validating Bloom Nucleus Installation...\n');

let allGood = true;

// 1. Extension Build
const extensionCrx = path.join(__dirname, '..', 'chrome-extension', 'crx', 'extension.crx');
const extensionId = path.join(__dirname, '..', 'chrome-extension', 'crx', 'id.json');
const extensionKey = path.join(__dirname, '..', 'chrome-extension', 'crx', 'key.pem');

allGood &= check('Extension CRX', fs.existsSync(extensionCrx), extensionCrx);
allGood &= check('Extension ID', fs.existsSync(extensionId), extensionId);
allGood &= check('Extension Key', fs.existsSync(extensionKey), extensionKey);

if (fs.existsSync(extensionId)) {
  const idData = JSON.parse(fs.readFileSync(extensionId, 'utf8'));
  console.log(`   📄 ID: ${idData.id}`);
  console.log(`   🔗 Update URL: ${idData.updateUrl || 'N/A'}`);
}

// 2. Native Host Binary
const nativeBinary = platform === 'win32' 
  ? path.join(__dirname, '..', 'native', 'bin', 'win32', 'bloom-host.exe')
  : platform === 'darwin'
  ? path.join(__dirname, '..', 'native', 'bin', 'darwin', 'x64', 'bloom-host')
  : null;

if (nativeBinary) {
  allGood &= check('Native Host Binary', fs.existsSync(nativeBinary), nativeBinary);
}

// 3. Registry Check (Windows only)
if (platform === 'win32') {
  try {
    execSync('reg query "HKLM\\SOFTWARE\\Policies\\Google\\Chrome\\ExtensionInstallForcelist"', { stdio: 'ignore' });
    allGood &= check('Chrome Enterprise Policy', true);
    
    // Read the policy value
    const result = execSync('reg query "HKLM\\SOFTWARE\\Policies\\Google\\Chrome\\ExtensionInstallForcelist" /v 1', { encoding: 'utf8' });
    if (result.includes(';')) {
      console.log('   ✅ Policy format correct (ID;URL)');
    } else {
      console.log('   ⚠️  Policy may be missing update URL');
    }
  } catch {
    allGood &= check('Chrome Enterprise Policy', false);
  }
}

// 4. Electron App
const electronMain = path.join(__dirname, '..', 'electron-app', 'main.js');
allGood &= check('Electron Installer', fs.existsSync(electronMain), electronMain);

console.log('\n' + '='.repeat(50));
console.log(allGood ? '\n✅ All checks passed!\n' : '\n❌ Some checks failed\n');
console.log('='.repeat(50) + '\n');

if (!allGood) {
  console.log('💡 To fix:');
  console.log('   1. Run: node scripts/build-extension.js');
  console.log('   2. Build Electron installer: cd electron-app && npm run make');
  console.log('   3. Run installer as admin\n');
}

process.exit(allGood ? 0 : 1);