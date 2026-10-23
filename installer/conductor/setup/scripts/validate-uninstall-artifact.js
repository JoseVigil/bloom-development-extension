'use strict';

const path = require('path');
const {
  BLOOM_UNINSTALL_FILENAME,
  validateBloomUninstallExecutable,
} = require('../install/bloom-uninstall-installer');

const platformDir = process.argv[2];
const architectureByDir = { win64: 'x64', win32: 'ia32' };
const expectedArch = architectureByDir[platformDir];

if (!expectedArch) {
  throw new Error('Usage: node scripts/validate-uninstall-artifact.js <win64|win32>');
}

const executable = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'native',
  'bin',
  platformDir,
  'uninstall',
  BLOOM_UNINSTALL_FILENAME
);
const evidence = validateBloomUninstallExecutable(executable, {
  expectedArch,
  missingCode: 'UNINSTALL_SOURCE_MISSING',
});

if (!evidence.valid) {
  throw new Error(`${evidence.code}: ${evidence.error} (${executable})`);
}

console.log(`Bloom Uninstall artifact validated: ${evidence.version} ${evidence.architecture}`);
