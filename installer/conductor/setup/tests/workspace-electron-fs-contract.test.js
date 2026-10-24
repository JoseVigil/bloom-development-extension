'use strict';

const assert = require('assert');
const nativeFs = require('original-fs');
const path = require('path');
const { app } = require('electron');
const {
  validateWorkspaceBundleSource,
  compareWorkspaceBundles,
  deployWorkspaceBundle,
} = require('../install/workspace-bundle-installer');

const sourceDir = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'native',
  'bin',
  'win64',
  'workspace',
  'win-unpacked'
);
const tempRoot = nativeFs.mkdtempSync(path.join(__dirname, '.workspace-electron-contract-'));
const destinationDir = path.join(tempRoot, 'workspace');
let exitCode = 0;

async function main() {
  assert.ok(process.versions.electron, 'This contract must run inside Electron');

  const source = validateWorkspaceBundleSource(sourceDir);
  assert.strictEqual(source.valid, true, source.error);
  assert.ok(source.inventory.files.some(file => file.path === 'resources/app.asar'));

  const deployment = await deployWorkspaceBundle({ sourceDir, destinationDir });
  assert.strictEqual(deployment.success, true);
  assert.strictEqual(deployment.evidence.valid, true);

  const installed = compareWorkspaceBundles(sourceDir, destinationDir);
  assert.strictEqual(installed.valid, true, installed.error);
  assert.strictEqual(installed.source.inventory_sha256, installed.destination.inventory_sha256);
  assert.deepStrictEqual(installed.missing, []);
  assert.deepStrictEqual(installed.different_hash, []);
  assert.deepStrictEqual(installed.extra, []);

  console.log('Workspace Electron physical-ASAR contract passed');
}

app.whenReady()
  .then(main)
  .catch(error => {
    console.error(error);
    exitCode = 1;
  })
  .finally(() => {
    nativeFs.rmSync(tempRoot, { recursive: true, force: true });
    app.exit(exitCode);
  });
