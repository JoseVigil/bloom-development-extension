'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Keep atomic-write and deployment fixtures on a Windows volume where directory
// renames are permitted; some sandboxed runners virtualize and restrict OS temp.
const tempRoot = fs.mkdtempSync(path.join(process.cwd(), '.bloom-setup-contract-'));
process.env.LOCALAPPDATA = tempRoot;

async function main() {
  const setupDir = path.resolve(__dirname, '..');
  const packageJson = require(path.join(setupDir, 'package.json'));
  const { paths } = require('../../shared/global_paths');
  const ollamaInstaller = require('../install/service-installer-ollama');
  const opencodeInstaller = require('../install/service-installer-opencode');
  const { buildNucleusServiceEnvironment } = require('../install/service-installer-nucleus');
  const installer = require('../install/installer');
  const {
    deployAitapBundle,
    verifyAitapBundle,
  } = require('../install/aitap-bundle-installer');
  const {
    installRuntime,
    validatePythonRuntime,
    validatePythonRuntimePair,
    WINDOWS_PTH_LINES,
    WINDOWS_PYTHON_VERSION,
  } = require('../install/runtime-installer');
  const {
    NucleusManager,
    validateHostArtifacts,
    validateHostRuntime,
    validateInstalledAitapBundle,
    validateBinaryArtifacts,
    validateBrainRuntime,
  } = require('../install/nucleus_manager');

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

  const nucleusEnvironment = buildNucleusServiceEnvironment(tempRoot, 'SYSTEM_PATH');
  const nucleusEnvironmentEntries = nucleusEnvironment.envContent.split('\0').filter(Boolean);
  assert.ok(nucleusEnvironmentEntries.includes(`BLOOM_PYTHON_PATH=${path.join(tempRoot, 'BloomNucleus', 'bin', 'engine', 'runtime', 'python.exe')}`));
  assert.ok(nucleusEnvironmentEntries.includes(
    `PATH=${path.join(tempRoot, 'BloomNucleus', 'bin', 'engine', 'runtime')};${path.join(tempRoot, 'BloomNucleus', 'bin', 'nucleus')};${path.join(tempRoot, 'BloomNucleus', 'bin', 'sentinel')};SYSTEM_PATH`
  ));

  const expectedDevHost = path.resolve(setupDir, '..', '..', 'native', 'bin', 'win64', 'host');
  assert.strictEqual(path.resolve(paths.hostSource), expectedDevHost);
  assert.strictEqual(paths.hostDir, path.join(tempRoot, 'BloomNucleus', 'bin', 'host'));
  assert.strictEqual(
    path.resolve(paths.runtimeSource),
    path.resolve(setupDir, '..', '..', 'resources', 'runtime-windows')
  );
  assert.strictEqual(
    paths.runtimeDir,
    path.join(tempRoot, 'BloomNucleus', 'bin', 'engine', 'runtime')
  );
  assert.strictEqual(
    path.resolve(paths.opencodeSource),
    path.resolve(setupDir, '..', '..', 'native', 'opencode', 'win64')
  );
  assert.strictEqual(
    path.resolve(paths.workspaceSource),
    path.resolve(setupDir, '..', '..', 'native', 'bin', 'win64', 'workspace')
  );
  assert.strictEqual(
    path.resolve(paths.aitapSource),
    path.resolve(setupDir, '..', '..', 'native', 'bin', 'win64', 'aitap')
  );
  assert.strictEqual(
    paths.aitapDir,
    path.join(tempRoot, 'BloomNucleus', 'bin', 'aitap')
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
    const aitapResource = packageJson.build[platformConfig].extraResources.find(entry => entry.to === 'aitap');
    assert.ok(aitapResource, `missing ${platformConfig} AITAP extraResource`);
    assert.ok(
      /native\/bin\/.*\/aitap$/.test(aitapResource.from),
      `${platformConfig} AITAP must package the complete canonical build directory`
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
  const windowsRuntime = packageJson.build.win.extraResources.find(entry => entry.to === 'runtime');
  assert.ok(windowsRuntime);
  assert.strictEqual(windowsRuntime.from, '../../resources/runtime-windows');

  const sourceRuntime = validatePythonRuntime(paths.runtimeSource, { requirePth: false });
  assert.strictEqual(sourceRuntime.valid, true, sourceRuntime.errors.join('; '));
  assert.strictEqual(sourceRuntime.execution.details.version, WINDOWS_PYTHON_VERSION);
  assert.strictEqual(sourceRuntime.execution.details.sys_platform, 'win32');
  assert.strictEqual(sourceRuntime.execution.details.machine.toUpperCase(), 'AMD64');
  assert.strictEqual(sourceRuntime.execution.details.bits, 64);
  assert.strictEqual(sourceRuntime.execution.details.ext_suffix, '.cp310-win_amd64.pyd');
  assert.strictEqual(sourceRuntime.native_architecture.valid, true);

  fs.mkdirSync(path.join(paths.runtimeDir, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(paths.runtimeDir, 'share'), { recursive: true });
  fs.writeFileSync(path.join(paths.runtimeDir, 'bin', 'python3.10'), 'stale-linux-runtime');
  fs.writeFileSync(path.join(paths.runtimeDir, 'share', 'linux-runtime-marker'), 'stale-linux-runtime');

  const configDir = path.join(tempRoot, 'BloomNucleus', 'config');
  const hostDir = paths.hostDir;
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(paths.configFile, JSON.stringify({
    version: 1,
    installation: { force_reinstall: false, completed: true, completed_at: 'test' },
    milestones: {
      brain_runtime: {
        status: 'passed',
        completed_at: 'test',
        error: null,
        verification: { method: 'file_exists', targets: ['engine/runtime/python.exe'], result: null },
      },
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
  assert.strictEqual(reconciled.milestones.brain_runtime.status, 'pending');
  assert.strictEqual(reconciled.milestones.brain_runtime.verification.method, 'python_runtime_smoke');
  assert.strictEqual(reconciled.installation.completed, false);
  assert.ok(validateBinaryArtifacts().missing.some(item => item.startsWith('aitap/')));
  assert.ok(reconciled.milestones.opencode_service_install);
  assert.strictEqual(reconciled.milestones.opencode_service_install.status, 'pending');
  assert.strictEqual(reconciled.milestones.opencode_service_install.non_critical, true);
  assert.strictEqual(reconciled.milestones.opencode_service_install.verification.port, 4096);
  await assert.rejects(
    manager.completeMilestone('binaries'),
    /missing binary artifacts/
  );
  await assert.rejects(
    manager.completeMilestone('brain_runtime'),
    /Python runtime validation failed/
  );

  const runtimeDeployment = await installRuntime({
    sourceDir: paths.runtimeSource,
    runtimeDir: paths.runtimeDir,
  });
  assert.strictEqual(runtimeDeployment.success, true);
  assert.strictEqual(fs.existsSync(path.join(paths.runtimeDir, 'bin')), false, 'stale Linux bin directory must be removed');
  assert.strictEqual(fs.existsSync(path.join(paths.runtimeDir, 'share')), false, 'stale Linux share directory must be removed');
  assert.deepStrictEqual(
    fs.readFileSync(path.join(paths.runtimeDir, 'python310._pth'), 'utf8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean),
    WINDOWS_PTH_LINES
  );

  const deployedRuntime = validatePythonRuntimePair(paths.runtimeSource, paths.runtimeDir);
  assert.strictEqual(deployedRuntime.valid, true, deployedRuntime.errors.join('; '));
  assert.strictEqual(deployedRuntime.destination.execution.details.version, WINDOWS_PYTHON_VERSION);
  assert.strictEqual(deployedRuntime.destination.execution.details.site_loaded, true);
  assert.strictEqual(deployedRuntime.destination.native_architecture.valid, true);
  assert.strictEqual(validateBrainRuntime().valid, true);
  await manager.completeMilestone('brain_runtime', { contract_test: true });
  assert.strictEqual(manager.getState().milestones.brain_runtime.status, 'passed');

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
  assert.strictEqual(validateBinaryArtifacts().valid, false, 'AITAP must be required by binaries');

  const sourceAitap = verifyAitapBundle(paths.aitapSource);
  assert.strictEqual(sourceAitap.manifest.schema_version, 'bloom.aitap-bundle/v1');
  const aitapDeployment = await deployAitapBundle({
    sourceDir: paths.aitapSource,
    destinationDir: paths.aitapDir,
  });
  assert.strictEqual(aitapDeployment.success, true);
  assert.strictEqual(aitapDeployment.destination.runtime.platform, 'windows');
  assert.strictEqual(aitapDeployment.destination.runtime.architecture, 'amd64');
  assert.strictEqual(
    aitapDeployment.destination.runtime.embedded_python_version,
    sourceAitap.manifest.embedded_python_version
  );
  assert.strictEqual(validateInstalledAitapBundle().valid, true);
  assert.strictEqual(validateBinaryArtifacts().valid, true);
  await manager.completeMilestone('binaries', { contract_test: true });
  assert.strictEqual(manager.getState().milestones.binaries.status, 'passed');
  assert.strictEqual(
    manager.getState().milestones.binaries.verification.result.aitap.manifest.build_number,
    sourceAitap.manifest.build_number
  );
  assert.strictEqual(
    manager.getState().milestones.binaries.verification.result.aitap.integrity.status,
    'passed'
  );

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
