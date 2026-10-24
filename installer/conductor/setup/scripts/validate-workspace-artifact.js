'use strict';

const path = require('path');
const { validateWorkspaceBundleSource } = require('../install/workspace-bundle-installer');

const requestedArch = process.argv[2];
if (!['win32', 'win64'].includes(requestedArch)) {
  console.error('Usage: node scripts/validate-workspace-artifact.js <win32|win64>');
  process.exit(2);
}

const sourceDir = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'native',
  'bin',
  requestedArch,
  'workspace',
  'win-unpacked'
);
const validation = validateWorkspaceBundleSource(sourceDir);
if (!validation.valid) {
  console.error(`[Workspace] ${requestedArch} artifact is not packageable: ${validation.error}`);
  process.exit(1);
}

console.log(
  `[Workspace] ${requestedArch} artifact valid: ` +
  `${validation.inventory.file_count} files, SHA-256 ${validation.inventory.inventory_sha256}`
);
