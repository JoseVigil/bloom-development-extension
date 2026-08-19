'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bloom-setup-contract-'));
process.env.LOCALAPPDATA = tempRoot;

async function main() {
  const setupDir = path.resolve(__dirname, '..');
  const packageJson = require(path.join(setupDir, 'package.json'));
  const { paths } = require('../../shared/global_paths');
  const ollamaInstaller = require('../install/service-installer-ollama');
  const opencodeInstaller = require('../install/service-installer-opencode');
  const installer = require('../install/installer');
  const { NucleusManager, validateHostArtifacts, validateHostRuntime, validateBinaryArtifacts } = require('../install/nucleus_manager');

  for (const exportName of [
    'installOllamaService',
    'startOllamaService',
    'OLLAMA_SERVICE_NAME',
    'OLLAMA_DISPLAY_NAME',
  ]) {
    assert.ok(exportName in ollamaInstaller, `missing Ollama export: ${exportName}`);
  }
  assert.strictEqual(ollamaInstaller.OLLAMA_SERVICE_NAME, 'BloomOllamaService');
  assert.strictEqual(opencodeInstaller.NEW_SERVICE_NAME, 'BloomOpencodeService');
  assert.strictEqual(typeof opencodeInstaller.installWindowsService, 'function');
  assert.strictEqual(typeof opencodeInstaller.startService, 'function');
  assert.strictEqual(typeof installer.installService, 'function');

  const expectedDevHost = path.resolve(setupDir, '..', '..', 'native', 'bin', 'win64', 'host');
  assert.strictEqual(path.resolve(paths.hostSource), expectedDevHost);
  assert.strictEqual(paths.hostDir, path.join(tempRoot, 'BloomNucleus', 'bin', 'host'));
  assert.strictEqual(
    path.resolve(paths.opencodeSource),
    path.resolve(setupDir, '..', '..', 'native', 'opencode', 'win64')
  );
  assert.strictEqual(
    path.resolve(paths.workspaceSource),
    path.resolve(setupDir, '..', '..', 'native', 'bin', 'win64', 'workspace')
  );

  for (const platformConfig of ['win', 'linux', 'mac']) {
    const hostResource = packageJson.build[platformConfig].extraResources.find(entry =>
      /native\/bin\/.*\/host$/.test(entry.from)
    );
    assert.ok(hostResource, `missing ${platformConfig} Host extraResource`);
    assert.strictEqual(hostResource.to, 'host', `${platformConfig} Host must be packaged at resources/host`);
    assert.ok(
      packageJson.build[platformConfig].extraResources.some(entry => entry.to === 'shared'),
      `${platformConfig} must package conductor/shared at resources/shared`
    );
  }

  const windowsOllama = packageJson.build.win.extraResources.find(entry => entry.to === 'ollama');
  assert.ok(windowsOllama);
  assert.strictEqual(windowsOllama.from, '../../ollama/windows');
  const windowsOpencode = packageJson.build.win.extraResources.find(entry => entry.to === 'opencode');
  assert.ok(windowsOpencode);
  assert.strictEqual(windowsOpencode.from, '../../native/opencode/win64');
  const windowsWorkspace = packageJson.build.win.extraResources.find(entry => entry.to === 'workspace/bloom-workspace.exe');
  assert.ok(windowsWorkspace);
  assert.strictEqual(windowsWorkspace.from, '../../native/bin/win64/workspace/bloom-workspace.exe');

  const configDir = path.join(tempRoot, 'BloomNucleus', 'config');
  const hostDir = paths.hostDir;
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(paths.configFile, JSON.stringify({
    version: 1,
    installation: { force_reinstall: false, completed: true, completed_at: 'test' },
    milestones: {
      binaries: {
        status: 'passed',
        completed_at: 'test',
        error: null,
        verification: { method: 'sovereign_manifest', components: { host: [] }, result: null },
      },
    },
  }));

  const manager = new NucleusManager();
  const reconciled = await manager.initialize();
  assert.strictEqual(reconciled.milestones.binaries.status, 'pending');
  assert.strictEqual(reconciled.installation.completed, false);
  assert.ok(reconciled.milestones.opencode_service_install);
  assert.strictEqual(reconciled.milestones.opencode_service_install.status, 'pending');
  assert.strictEqual(reconciled.milestones.opencode_service_install.non_critical, true);
  assert.strictEqual(reconciled.milestones.opencode_service_install.verification.port, 4096);
  await assert.rejects(
    manager.completeMilestone('binaries'),
    /missing binary artifacts/
  );

  for (const artifact of [
    'bloom-host.exe',
    'libgcc_s_seh-1.dll',
    'libstdc++-6.dll',
    'libwinpthread-1.dll',
  ]) {
    fs.mkdirSync(hostDir, { recursive: true });
    fs.copyFileSync(path.join(paths.hostSource, artifact), path.join(hostDir, artifact));
  }

  assert.strictEqual(validateHostArtifacts().valid, true);
  assert.strictEqual(validateHostRuntime().valid, true);
  assert.strictEqual(validateBinaryArtifacts().valid, false);
  fs.mkdirSync(paths.opencodeDir, { recursive: true });
  fs.writeFileSync(paths.opencodeExe, 'contract-test');
  fs.mkdirSync(paths.workspaceDir, { recursive: true });
  fs.writeFileSync(paths.workspaceExe, 'contract-test');
  assert.strictEqual(validateBinaryArtifacts().valid, true);
  await manager.completeMilestone('binaries', { contract_test: true });
  assert.strictEqual(manager.getState().milestones.binaries.status, 'passed');

  for (const name of installer.RUNTIME_MILESTONES_AFTER_BINARY_CLEANUP) {
    reconciled.milestones[name].status = 'passed';
    reconciled.milestones[name].completed_at = 'test';
  }
  await manager.resetMilestones(
    installer.RUNTIME_MILESTONES_AFTER_BINARY_CLEANUP,
    'contract cleanup'
  );
  for (const name of installer.RUNTIME_MILESTONES_AFTER_BINARY_CLEANUP) {
    assert.strictEqual(manager.getState().milestones[name].status, 'pending', `${name} must be rerun after cleanup`);
    assert.strictEqual(manager.getState().milestones[name].completed_at, null);
  }
  assert.strictEqual(manager.getState().milestones.binaries.status, 'passed');

  console.log('Windows setup contract tests passed');
}

main()
  .finally(() => fs.rmSync(tempRoot, { recursive: true, force: true }))
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
