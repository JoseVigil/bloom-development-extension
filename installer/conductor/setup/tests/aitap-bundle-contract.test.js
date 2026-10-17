'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  AITAP_MANIFEST_NAME,
  AITAP_MANIFEST_SCHEMA,
  AITAP_PACKAGING_MODE,
  AITAP_SMOKE_COMMANDS,
  verifyAitapBundle,
  runAitapSmokes,
  certifyAitapBundle,
  deployAitapBundle,
} = require('../install/aitap-bundle-installer');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const VERIFY_BUNDLE_SCRIPTS = path.join(REPO_ROOT, 'installer', 'aitap', 'scripts');

function nativePlatformDir() {
  const arch = os.arch();
  if (process.platform === 'win32') return arch === 'x64' ? 'win64' : 'win32';
  if (process.platform === 'darwin') return arch === 'arm64' ? 'darwin_arm64' : 'darwin_x64';
  return arch === 'arm64' ? 'linux_arm64' : 'linux_x64';
}

function executableName() {
  return process.platform === 'win32' ? 'aitap.exe' : 'aitap';
}

function expectBundleFailure(action, code) {
  assert.throws(action, error => error?.code === code, `expected ${code}`);
}

async function expectBundleRejection(action, code) {
  await assert.rejects(action, error => error?.code === code, `expected ${code}`);
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function isLink(target) {
  return fs.lstatSync(target).isSymbolicLink();
}

function fakeSmokeSpawn(manifest, calls = null) {
  return (executable, args, options) => {
    if (calls) calls.push({ executable, args, options });
    const command = args.join(' ');
    let payload = {};
    if (command === '--json system version') {
      payload = { version: manifest.version, build_number: manifest.build_number };
    } else if (command === '--json system info') {
      payload = {
        version: manifest.version,
        build_number: manifest.build_number,
        os: manifest.platform,
        arch: manifest.architecture,
        python_version: manifest.embedded_python_version,
      };
    } else if (command === '--json route policy') {
      payload = { status: 'success', operation: 'route.policy', data: {} };
    } else if (command === '--json local preflight') {
      payload = { status: 'success', operation: 'local.preflight', data: {} };
    }
    return { status: 0, error: null, stdout: JSON.stringify(payload), stderr: '' };
  };
}

// --- Synthetic framework-shaped bundle ------------------------------------------------

const SYNTHETIC_REQUIRED_PATHS = Object.freeze([
  '_internal/contracts',
  '_internal/policies',
  '_internal/registry',
  '_internal/local/catalog',
  'help/aitap_help.json',
  'help/aitap_help.txt',
  '_internal/aitap.config.json',
  '_internal/VERSION',
]);

const SYNTHETIC_PYTHON_BINARY = 'synthetic-python-framework-binary';

// What Path.rglob('*') + is_file() (Python >= 3.13) yields for the synthetic bundle.
// Written out by hand so the JS validator is checked against an independent oracle:
// file links appear under their own path, nothing appears under directory links
// (Versions/Current, Python.framework/Resources).
const SYNTHETIC_EXPECTED_FILES = Object.freeze([
  '_internal/Python',
  '_internal/Python.framework/Python',
  '_internal/Python.framework/Versions/3.14/Python',
  '_internal/Python.framework/Versions/3.14/Resources/Info.plist',
  '_internal/VERSION',
  '_internal/aitap.config.json',
  '_internal/contracts/schema.json',
  '_internal/local/catalog/catalog.json',
  '_internal/policies/policy.json',
  '_internal/registry/registry.json',
  executableName(),
  'help/aitap_help.json',
  'help/aitap_help.txt',
].slice().sort());

function writeFile(root, relative, content) {
  const target = path.join(root, ...relative.split('/'));
  fs.ensureDirSync(path.dirname(target));
  fs.writeFileSync(target, content);
}

function link(root, relative, linkTarget) {
  fs.symlinkSync(linkTarget, path.join(root, ...relative.split('/')));
}

function buildSyntheticBundle(root) {
  writeFile(root, executableName(), '#!/bin/sh\nexit 0\n');
  writeFile(root, 'help/aitap_help.json', '{"commands":[]}\n');
  writeFile(root, 'help/aitap_help.txt', 'AITAP help\n');
  writeFile(root, '_internal/contracts/schema.json', '{}\n');
  writeFile(root, '_internal/policies/policy.json', '{}\n');
  writeFile(root, '_internal/registry/registry.json', '{}\n');
  writeFile(root, '_internal/local/catalog/catalog.json', '{}\n');
  writeFile(root, '_internal/aitap.config.json', '{}\n');
  writeFile(root, '_internal/VERSION', '0.0.0\n');
  writeFile(root, '_internal/Python.framework/Versions/3.14/Python', SYNTHETIC_PYTHON_BINARY);
  writeFile(root, '_internal/Python.framework/Versions/3.14/Resources/Info.plist', '<plist/>\n');

  // Same shape PyInstaller produces for Python.framework on macOS.
  link(root, '_internal/Python.framework/Versions/Current', '3.14');
  link(root, '_internal/Python.framework/Python', 'Versions/Current/Python');
  link(root, '_internal/Python.framework/Resources', 'Versions/Current/Resources');
  link(root, '_internal/Python', 'Python.framework/Python');

  const files = SYNTHETIC_EXPECTED_FILES.map(relative => {
    const content = fs.readFileSync(path.join(root, ...relative.split('/')));
    return { path: relative, sha256: sha256(content), size: content.length };
  });
  const manifest = {
    schema_version: AITAP_MANIFEST_SCHEMA,
    product: 'AITAP',
    version: '0.0.0-contract',
    build_number: 1,
    platform: { win32: 'windows' }[process.platform] || process.platform,
    architecture: os.arch(),
    embedded_python_version: '3.14.0',
    packaging_mode: AITAP_PACKAGING_MODE,
    inventory_sha256: sha256(Buffer.from(JSON.stringify(files), 'utf8')),
    required_paths: [...SYNTHETIC_REQUIRED_PATHS],
    smokes: Object.fromEntries(AITAP_SMOKE_COMMANDS.map(smoke => [smoke.name, 'passed'])),
    files,
  };
  fs.writeFileSync(path.join(root, AITAP_MANIFEST_NAME), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function symlinksSupported(tempRoot) {
  const probe = path.join(tempRoot, '.symlink-probe');
  try {
    fs.symlinkSync('missing-target', probe);
    fs.removeSync(probe);
    return true;
  } catch (_) {
    return false;
  }
}

// Runs the build-side inventory (verify_bundle._inventory) on a directory, so the JS
// validator is compared against the code that actually writes the manifest. Returns
// null when no Python >= 3.13 is available (older rglob semantics differ).
function pythonInventory(bundleDir) {
  const script = [
    'import json, sys',
    'from pathlib import Path',
    'if sys.version_info < (3, 13): sys.exit(3)',
    'sys.path.insert(0, sys.argv[1])',
    'import verify_bundle',
    'print(json.dumps(verify_bundle._inventory(Path(sys.argv[2]).resolve())))',
  ].join('\n');
  for (const interpreter of ['python3', 'python']) {
    const completed = spawnSync(interpreter, ['-I', '-c', script, VERIFY_BUNDLE_SCRIPTS, bundleDir], {
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
    });
    if (completed.error) continue;
    if (completed.status === 3) return null;
    assert.strictEqual(completed.status, 0, `verify_bundle._inventory failed: ${completed.stderr}`);
    return JSON.parse(completed.stdout);
  }
  return null;
}

async function runSymlinkSuite(tempRoot) {
  fs.ensureDirSync(tempRoot);
  if (!symlinksSupported(tempRoot)) {
    console.log('SKIP symlink contract: this runner cannot create symbolic links');
    return;
  }

  const synthetic = path.join(tempRoot, 'synthetic');
  fs.ensureDirSync(synthetic);
  const manifest = buildSyntheticBundle(synthetic);
  const cloneSynthetic = name => {
    const destination = path.join(tempRoot, name);
    fs.copySync(synthetic, destination, { preserveTimestamps: true, dereference: false });
    return destination;
  };

  // Framework-shaped bundle verifies; file links carry the target's hash, directory
  // links contribute nothing.
  const integrity = verifyAitapBundle(synthetic);
  assert.strictEqual(integrity.evidence.files_verified, SYNTHETIC_EXPECTED_FILES.length);
  const pythonLink = manifest.files.find(entry => entry.path === '_internal/Python');
  assert.strictEqual(pythonLink.sha256, sha256(Buffer.from(SYNTHETIC_PYTHON_BINARY)));
  assert.ok(!manifest.files.some(entry => entry.path.startsWith('_internal/Python.framework/Versions/Current/')));
  assert.ok(!manifest.files.some(entry => entry.path.startsWith('_internal/Python.framework/Resources/')));

  // Parity with the build-side manifest generator.
  const buildInventory = pythonInventory(synthetic);
  if (buildInventory) {
    assert.deepStrictEqual(buildInventory, manifest.files);
  } else {
    console.log('SKIP verify_bundle.py parity: Python >= 3.13 not available');
  }

  // Bundle reached through a linked root (macOS /tmp, /var -> /private/...).
  const linkedRoot = path.join(tempRoot, 'linked-root');
  fs.symlinkSync(synthetic, linkedRoot);
  assert.strictEqual(verifyAitapBundle(linkedRoot).evidence.files_verified, SYNTHETIC_EXPECTED_FILES.length);

  // Deployment keeps links as links in the destination.
  const linkedInstall = path.join(tempRoot, 'synthetic-install');
  const deployment = await deployAitapBundle({
    sourceDir: synthetic,
    destinationDir: linkedInstall,
    spawnSyncImpl: fakeSmokeSpawn(manifest),
  });
  assert.strictEqual(deployment.success, true);
  assert.ok(isLink(path.join(linkedInstall, '_internal', 'Python')));
  assert.ok(isLink(path.join(linkedInstall, '_internal', 'Python.framework', 'Versions', 'Current')));
  assert.ok(isLink(path.join(linkedInstall, '_internal', 'Python.framework', 'Resources')));
  assert.strictEqual(fs.existsSync(`${linkedInstall}.staging`), false);
  assert.strictEqual(fs.existsSync(`${linkedInstall}.backup`), false);

  // A new directory link does not change the inventory: it is not traversed.
  const directoryAlias = cloneSynthetic('directory-alias');
  link(directoryAlias, '_internal/contracts-alias', 'contracts');
  assert.strictEqual(verifyAitapBundle(directoryAlias).evidence.files_verified, SYNTHETIC_EXPECTED_FILES.length);
  if (buildInventory) {
    assert.deepStrictEqual(pythonInventory(directoryAlias), manifest.files);
  }

  const broken = cloneSynthetic('broken-link');
  link(broken, '_internal/dangling', 'does-not-exist');
  expectBundleFailure(() => verifyAitapBundle(broken), 'AITAP_SYMLINK_BROKEN');

  const looping = cloneSynthetic('looping-link');
  link(looping, '_internal/loop-a', 'loop-b');
  link(looping, '_internal/loop-b', 'loop-a');
  expectBundleFailure(() => verifyAitapBundle(looping), 'AITAP_SYMLINK_BROKEN');

  const outsideFile = path.join(tempRoot, 'outside.txt');
  fs.writeFileSync(outsideFile, 'outside the bundle\n');

  const escapesAbsolute = cloneSynthetic('escapes-absolute');
  link(escapesAbsolute, '_internal/escape', outsideFile);
  expectBundleFailure(() => verifyAitapBundle(escapesAbsolute), 'AITAP_SYMLINK_ESCAPES');

  const escapesRelative = cloneSynthetic('escapes-relative');
  link(escapesRelative, '_internal/escape', path.join('..', '..', 'outside.txt'));
  expectBundleFailure(() => verifyAitapBundle(escapesRelative), 'AITAP_SYMLINK_ESCAPES');

  if (process.platform !== 'win32') {
    const fifoBundle = cloneSynthetic('fifo-link');
    const fifo = spawnSync('mkfifo', [path.join(fifoBundle, '_internal', 'pipe')], { shell: false });
    if (!fifo.error && fifo.status === 0) {
      link(fifoBundle, '_internal/pipe-link', 'pipe');
      expectBundleFailure(() => verifyAitapBundle(fifoBundle), 'AITAP_SYMLINK_UNSUPPORTED');
    } else {
      console.log('SKIP FIFO link contract: mkfifo not available');
    }
  }

  // Pointing _internal/Python at a different file inside the bundle is caught by hash.
  const retargeted = cloneSynthetic('retargeted-link');
  fs.removeSync(path.join(retargeted, '_internal', 'Python'));
  link(retargeted, '_internal/Python', 'VERSION');
  expectBundleFailure(() => verifyAitapBundle(retargeted), 'AITAP_HASH_MISMATCH');
}

// --- Native bundle produced by build-all.py ------------------------------------------

async function runNativeBundleSuite(tempRoot) {
  fs.ensureDirSync(tempRoot);
  const sourceDir = path.join(REPO_ROOT, 'installer', 'native', 'bin', nativePlatformDir(), 'aitap');
  assert.ok(fs.existsSync(sourceDir), `native AITAP bundle not found: ${sourceDir}`);

  const sourceIntegrity = verifyAitapBundle(sourceDir);
  assert.strictEqual(sourceIntegrity.manifest.product, 'AITAP');
  assert.strictEqual(sourceIntegrity.manifest.packaging_mode, 'pyinstaller-onedir');
  assert.strictEqual(sourceIntegrity.evidence.files_verified, sourceIntegrity.manifest.files.length);

  const sourceCertification = certifyAitapBundle(sourceDir);
  assert.strictEqual(sourceCertification.valid, true);
  assert.strictEqual(
    sourceCertification.runtime.embedded_python_version,
    sourceIntegrity.manifest.embedded_python_version
  );
  for (const smoke of AITAP_SMOKE_COMMANDS) {
    assert.strictEqual(sourceCertification.smokes[smoke.name].status, 'passed');
  }

  const frameworkCurrent = path.join('_internal', 'Python.framework', 'Versions', 'Current');
  const sourceHasFramework = process.platform === 'darwin'
    && fs.existsSync(path.join(sourceDir, frameworkCurrent));
  if (sourceHasFramework) {
    assert.ok(isLink(path.join(sourceDir, '_internal', 'Python')), 'native _internal/Python must be a link');
    assert.ok(isLink(path.join(sourceDir, frameworkCurrent)), 'native Versions/Current must be a link');
  }

  const clone = name => {
    const destination = path.join(tempRoot, name);
    fs.copySync(sourceDir, destination, { preserveTimestamps: true, dereference: false });
    return destination;
  };

  const missingInternal = clone('missing-internal');
  fs.removeSync(path.join(missingInternal, '_internal'));
  expectBundleFailure(
    () => verifyAitapBundle(missingInternal),
    'AITAP_REQUIRED_PATH_MISSING'
  );

  const missingHelp = clone('missing-help');
  fs.removeSync(path.join(missingHelp, 'help'));
  expectBundleFailure(
    () => verifyAitapBundle(missingHelp),
    'AITAP_REQUIRED_PATH_MISSING'
  );

  const missingResource = clone('missing-resource');
  fs.removeSync(path.join(missingResource, '_internal', 'contracts'));
  expectBundleFailure(
    () => verifyAitapBundle(missingResource),
    'AITAP_REQUIRED_PATH_MISSING'
  );

  const alteredHash = clone('altered-hash');
  fs.appendFileSync(path.join(alteredHash, 'help', 'aitap_help.txt'), '\ntampered\n');
  expectBundleFailure(
    () => verifyAitapBundle(alteredHash),
    'AITAP_HASH_MISMATCH'
  );

  expectBundleFailure(
    () => certifyAitapBundle(sourceDir, {
      spawnSyncImpl: () => ({
        status: null,
        error: new Error('application could not start'),
        stdout: '',
        stderr: '',
      }),
    }),
    'AITAP_SMOKE_FAILED'
  );

  const calls = [];
  const manifest = sourceIntegrity.manifest;
  runAitapSmokes(sourceDir, manifest, { spawnSyncImpl: fakeSmokeSpawn(manifest, calls) });
  assert.strictEqual(calls.length, AITAP_SMOKE_COMMANDS.length);
  for (const call of calls) {
    assert.strictEqual(path.basename(call.executable), executableName());
    assert.strictEqual(call.options.cwd, sourceDir);
    assert.strictEqual(call.options.shell, false);
    assert.ok(!call.args.some(argument => /(^|[\\/])(python|pip)(\.exe)?$/i.test(argument)));
    assert.strictEqual(call.options.env.PYTHONHOME, undefined);
    assert.strictEqual(call.options.env.PYTHONPATH, undefined);
  }

  const cleanDestination = path.join(tempRoot, 'clean-install');
  fs.ensureDirSync(cleanDestination);
  fs.writeFileSync(path.join(cleanDestination, 'stale-linux-file'), 'stale');
  const deployment = await deployAitapBundle({ sourceDir, destinationDir: cleanDestination });
  assert.strictEqual(deployment.success, true);
  assert.strictEqual(deployment.destination.valid, true);
  assert.strictEqual(fs.existsSync(path.join(cleanDestination, 'stale-linux-file')), false);
  assert.strictEqual(fs.existsSync(path.join(cleanDestination, AITAP_MANIFEST_NAME)), true);
  assert.strictEqual(fs.existsSync(path.join(cleanDestination, '_internal')), true);
  if (sourceHasFramework) {
    assert.ok(isLink(path.join(cleanDestination, frameworkCurrent)), 'deployed Versions/Current must stay a link');
    assert.ok(isLink(path.join(cleanDestination, '_internal', 'Python')), 'deployed _internal/Python must stay a link');
  }

  const rollbackDestination = path.join(tempRoot, 'rollback-install');
  fs.copySync(sourceDir, rollbackDestination, { preserveTimestamps: true, dereference: false });
  fs.writeFileSync(path.join(rollbackDestination, 'previous-install-marker'), 'previous');
  await expectBundleRejection(
    deployAitapBundle({
      sourceDir,
      destinationDir: rollbackDestination,
      spawnSyncImpl: () => ({
        status: null,
        error: new Error('application could not start'),
        stdout: '',
        stderr: '',
      }),
    }),
    'AITAP_SMOKE_FAILED'
  );
  assert.strictEqual(
    fs.readFileSync(path.join(rollbackDestination, 'previous-install-marker'), 'utf8'),
    'previous'
  );
  assert.strictEqual(fs.existsSync(`${rollbackDestination}.staging`), false);
  assert.strictEqual(fs.existsSync(`${rollbackDestination}.backup`), false);
}

async function main() {
  // Some sandboxed Windows runners deny directory renames under the virtualized OS
  // temp path. Keep these fixtures beside the test workspace and remove them below.
  const tempRoot = fs.mkdtempSync(path.join(process.cwd(), '.bloom-aitap-contract-'));
  try {
    await runSymlinkSuite(path.join(tempRoot, 'symlinks'));
    console.log('AITAP symlink contract tests passed');
    await runNativeBundleSuite(path.join(tempRoot, 'native'));
    console.log('AITAP bundle contract tests passed');
  } finally {
    fs.removeSync(tempRoot);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
