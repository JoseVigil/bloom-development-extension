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
  const { paths, getPackagedResourcePath } = require('../../shared/global_paths');
  const ollamaInstaller = require('../install/service-installer-ollama');
  const opencodeInstaller = require('../install/service-installer-opencode');
  const { buildNucleusServiceEnvironment } = require('../install/service-installer-nucleus');
  const installer = require('../install/installer');
  const {
    deployAitapBundle,
    verifyAitapBundle,
  } = require('../install/aitap-bundle-installer');
  const {
    validateBloomUninstallExecutable,
    validateInstalledBloomUninstall,
    deployBloomUninstall,
  } = require('../install/bloom-uninstall-installer');
  const {
    WINDOWS_WORKSPACE_REQUIRED_PATHS,
    validateWorkspaceBundleSource,
    compareWorkspaceBundles,
    deployWorkspaceBundle,
  } = require('../install/workspace-bundle-installer');
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
    path.resolve(setupDir, '..', '..', 'native', 'bin', 'win64', 'workspace', 'win-unpacked')
  );
  assert.strictEqual(
    path.resolve(paths.aitapSource),
    path.resolve(setupDir, '..', '..', 'native', 'bin', 'win64', 'aitap')
  );
  assert.strictEqual(
    paths.aitapDir,
    path.join(tempRoot, 'BloomNucleus', 'bin', 'aitap')
  );
  assert.strictEqual(
    path.resolve(paths.uninstallSource),
    path.resolve(setupDir, '..', '..', 'native', 'bin', 'win64', 'uninstall')
  );
  assert.strictEqual(
    paths.uninstallSourceExe,
    path.join(paths.uninstallSource, 'bloom-uninstall.exe')
  );
  assert.strictEqual(
    paths.uninstallExe,
    path.join(tempRoot, 'BloomNucleus', 'bin', 'uninstall', 'bloom-uninstall.exe')
  );

  const packagedResourcesRoot = path.join(tempRoot, 'packaged-resources');
  assert.strictEqual(
    getPackagedResourcePath('uninstall', packagedResourcesRoot, 'win32', 'win64'),
    path.join(packagedResourcesRoot, 'uninstall', 'win64')
  );
  assert.strictEqual(
    getPackagedResourcePath('uninstall', packagedResourcesRoot, 'win32', 'win32'),
    path.join(packagedResourcesRoot, 'uninstall', 'win32')
  );
  assert.strictEqual(
    getPackagedResourcePath('uninstall', packagedResourcesRoot, 'linux', 'linux_x64'),
    null
  );
  assert.strictEqual(
    getPackagedResourcePath('workspace', packagedResourcesRoot, 'win32', 'win64'),
    path.join(packagedResourcesRoot, 'workspace', 'win64')
  );
  assert.strictEqual(
    getPackagedResourcePath('workspace', packagedResourcesRoot, 'win32', 'win32'),
    path.join(packagedResourcesRoot, 'workspace', 'win32')
  );
  assert.strictEqual(
    getPackagedResourcePath('workspace', packagedResourcesRoot, 'linux', 'linux_x64'),
    path.join(packagedResourcesRoot, 'workspace')
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
  const windowsWorkspace = packageJson.build.win.extraResources.find(entry => entry.to === 'workspace/win64');
  assert.ok(windowsWorkspace);
  assert.strictEqual(windowsWorkspace.from, '../../native/bin/win64/workspace/win-unpacked');
  const windowsRuntime = packageJson.build.win.extraResources.find(entry => entry.to === 'runtime');
  assert.ok(windowsRuntime);
  assert.strictEqual(windowsRuntime.from, '../../resources/runtime-windows');
  const windowsUninstallResources = packageJson.build.win.extraResources
    .filter(entry => entry.to.startsWith('uninstall/'));
  assert.deepStrictEqual(windowsUninstallResources, [
    { from: '../../native/bin/win64/uninstall', to: 'uninstall/win64' },
    { from: '../../native/bin/win32/uninstall', to: 'uninstall/win32' },
  ]);
  assert.ok(packageJson.scripts['build:win64'].includes('npm run validate:workspace:win64'));
  assert.ok(packageJson.scripts['build:win32'].includes('npm run validate:workspace:win32'));
  assert.strictEqual(
    packageJson.build.linux.extraResources.some(entry => entry.to.startsWith('uninstall')),
    false
  );
  assert.strictEqual(
    packageJson.build.mac.extraResources.some(entry => entry.to.startsWith('uninstall')),
    false
  );

  const sourceWorkspace = validateWorkspaceBundleSource(paths.workspaceSource);
  assert.strictEqual(sourceWorkspace.valid, true, sourceWorkspace.error);
  assert.strictEqual(sourceWorkspace.inventory.file_count, 179);
  assert.ok(sourceWorkspace.inventory.total_bytes > 0);
  assert.match(sourceWorkspace.inventory.inventory_sha256, /^[a-f0-9]{64}$/);
  for (const requiredPath of WINDOWS_WORKSPACE_REQUIRED_PATHS) {
    const hasFile = sourceWorkspace.inventory.files.some(file => file.path === requiredPath);
    const hasDirectory = sourceWorkspace.inventory.directories.includes(requiredPath);
    assert.ok(hasFile || hasDirectory, `Workspace source is missing ${requiredPath}`);
  }

  const sourceUninstall = validateBloomUninstallExecutable(paths.uninstallSourceExe);
  assert.strictEqual(sourceUninstall.valid, true, sourceUninstall.error);
  assert.match(sourceUninstall.version, /^v1\.0\.0-build\.\d+$/);
  assert.strictEqual(sourceUninstall.architecture, 'x64');
  const wrongArchitecture = validateBloomUninstallExecutable(paths.uninstallSourceExe, {
    expectedArch: 'ia32',
  });
  assert.strictEqual(wrongArchitecture.valid, false);
  assert.strictEqual(wrongArchitecture.code, 'UNINSTALL_ARCHITECTURE_MISMATCH');

  let versionInvocation = null;
  const controlledVersion = validateBloomUninstallExecutable(paths.uninstallSourceExe, {
    spawnSyncImpl: (executable, args, options) => {
      versionInvocation = { executable, args, options };
      return {
        status: 0,
        error: null,
        stdout: 'Bloom Uninstall v1.0.0-build.999',
        stderr: '',
      };
    },
  });
  assert.strictEqual(controlledVersion.valid, true);
  assert.deepStrictEqual(versionInvocation.args, ['--version']);
  assert.strictEqual(versionInvocation.options.shell, false);

  const packagedUninstallDir = getPackagedResourcePath(
    'uninstall',
    packagedResourcesRoot,
    'win32',
    'win64'
  );
  const packagedUninstallExe = path.join(packagedUninstallDir, 'bloom-uninstall.exe');
  fs.mkdirSync(packagedUninstallDir, { recursive: true });
  fs.copyFileSync(paths.uninstallSourceExe, packagedUninstallExe);
  const packagedInstallExe = path.join(
    tempRoot,
    'packaged-install',
    'BloomNucleus',
    'bin',
    'uninstall',
    'bloom-uninstall.exe'
  );
  const packagedDeployment = await deployBloomUninstall({
    sourceExecutable: packagedUninstallExe,
    installedExecutable: packagedInstallExe,
  });
  assert.strictEqual(packagedDeployment.success, true);
  assert.strictEqual(packagedDeployment.evidence.version, sourceUninstall.version);
  assert.strictEqual(packagedDeployment.evidence.hash_match, true);

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
  assert.ok(validateBinaryArtifacts().missing.some(item => item.startsWith('uninstall/')));
  assert.ok(validateBinaryArtifacts().missing.some(item => item.startsWith('workspace/')));
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
  fs.writeFileSync(path.join(paths.workspaceDir, 'stale-only-in-destination.txt'), 'stale');
  const partialWorkspace = compareWorkspaceBundles(paths.workspaceSource, paths.workspaceDir);
  assert.strictEqual(partialWorkspace.valid, false);
  assert.ok(partialWorkspace.missing.includes('resources/app.asar'));
  assert.ok(partialWorkspace.different_hash.includes('bloom-workspace.exe'));
  assert.ok(partialWorkspace.extra.includes('stale-only-in-destination.txt'));
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
  assert.strictEqual(validateBinaryArtifacts().valid, false, 'Bloom Uninstall must be required by binaries');

  const uninstallDeployment = await deployBloomUninstall({
    sourceExecutable: paths.uninstallSourceExe,
    installedExecutable: paths.uninstallExe,
  });
  assert.strictEqual(uninstallDeployment.success, true);
  assert.strictEqual(uninstallDeployment.evidence.valid, true);
  assert.strictEqual(uninstallDeployment.evidence.version, sourceUninstall.version);
  assert.strictEqual(fs.existsSync(paths.uninstallExe), true);
  assert.strictEqual(
    validateInstalledBloomUninstall(paths.uninstallSourceExe, paths.uninstallExe).valid,
    true
  );
  assert.strictEqual(validateBinaryArtifacts().valid, false, 'complete Workspace bundle must be required by binaries');

  const workspaceDeployment = await deployWorkspaceBundle({
    sourceDir: paths.workspaceSource,
    destinationDir: paths.workspaceDir,
  });
  assert.strictEqual(workspaceDeployment.success, true);
  assert.strictEqual(workspaceDeployment.evidence.valid, true);
  assert.strictEqual(workspaceDeployment.evidence.destination.file_count, sourceWorkspace.inventory.file_count);
  assert.strictEqual(
    workspaceDeployment.evidence.destination.inventory_sha256,
    sourceWorkspace.inventory.inventory_sha256
  );
  assert.strictEqual(fs.existsSync(path.join(paths.workspaceDir, 'stale-only-in-destination.txt')), false);
  const installedWorkspace = compareWorkspaceBundles(paths.workspaceSource, paths.workspaceDir);
  assert.deepStrictEqual(installedWorkspace.missing, []);
  assert.deepStrictEqual(installedWorkspace.different_hash, []);
  assert.deepStrictEqual(installedWorkspace.extra, []);
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
  assert.strictEqual(
    manager.getState().milestones.binaries.verification.result.uninstall.version,
    sourceUninstall.version
  );
  assert.strictEqual(
    manager.getState().milestones.binaries.verification.result.uninstall.hash_match,
    true
  );
  assert.strictEqual(
    manager.getState().milestones.binaries.verification.result.workspace.integrity,
    'passed'
  );
  assert.strictEqual(
    manager.getState().milestones.binaries.verification.result.workspace.source.inventory_sha256,
    sourceWorkspace.inventory.inventory_sha256
  );

  // A resumed setup must invalidate an approved binaries milestone when the
  // installed Workspace tree no longer matches the currently packaged bundle.
  fs.appendFileSync(paths.workspaceExe, 'tampered-after-approved-milestone');
  const resumedManager = new NucleusManager();
  const resumed = await resumedManager.initialize();
  assert.strictEqual(resumed.milestones.binaries.status, 'pending');
  assert.ok(
    resumed.milestones.binaries.verification.result.missing
      .includes('workspace/WORKSPACE_SOURCE_DESTINATION_MISMATCH')
  );
  assert.ok(
    resumed.milestones.binaries.verification.result.workspace.different_hash
      .includes('bloom-workspace.exe')
  );
  fs.copyFileSync(path.join(paths.workspaceSource, 'bloom-workspace.exe'), paths.workspaceExe);
  await resumedManager.completeMilestone('binaries', { contract_test: true });

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
