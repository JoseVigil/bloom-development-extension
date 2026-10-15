'use strict';

const assert = require('assert');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const {
  AITAP_MANIFEST_NAME,
  AITAP_SMOKE_COMMANDS,
  verifyAitapBundle,
  runAitapSmokes,
  certifyAitapBundle,
  deployAitapBundle,
} = require('../install/aitap-bundle-installer');

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

async function main() {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const sourceDir = path.join(repoRoot, 'installer', 'native', 'bin', nativePlatformDir(), 'aitap');
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

  // Some sandboxed Windows runners deny directory renames under the virtualized OS
  // temp path. Keep these fixtures beside the test workspace and remove them below.
  const tempRoot = fs.mkdtempSync(path.join(process.cwd(), '.bloom-aitap-contract-'));
  const clone = name => {
    const destination = path.join(tempRoot, name);
    fs.copySync(sourceDir, destination, { preserveTimestamps: true });
    return destination;
  };

  try {
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
    runAitapSmokes(sourceDir, manifest, {
      spawnSyncImpl: (executable, args, options) => {
        calls.push({ executable, args, options });
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
      },
    });
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

    const rollbackDestination = path.join(tempRoot, 'rollback-install');
    fs.copySync(sourceDir, rollbackDestination, { preserveTimestamps: true });
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

    console.log('AITAP bundle contract tests passed');
  } finally {
    fs.removeSync(tempRoot);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
