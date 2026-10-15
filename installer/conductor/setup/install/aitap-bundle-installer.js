'use strict';

const crypto = require('crypto');
const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const { spawnSync } = require('child_process');

const AITAP_MANIFEST_NAME = 'bundle-manifest.json';
const AITAP_MANIFEST_SCHEMA = 'bloom.aitap-bundle/v1';
const AITAP_PACKAGING_MODE = 'pyinstaller-onedir';

const AITAP_SMOKE_COMMANDS = Object.freeze([
  { name: 'system.version', args: ['--json', 'system', 'version'] },
  { name: 'system.info', args: ['--json', 'system', 'info'] },
  { name: 'json_help', args: ['--json-help'] },
  { name: 'route.policy', args: ['--json', 'route', 'policy'] },
  { name: 'local.preflight', args: ['--json', 'local', 'preflight'] },
]);

class AitapBundleError extends Error {
  constructor(code, phase, message) {
    super(message);
    this.name = 'AitapBundleError';
    this.code = code;
    this.phase = phase;
  }
}

function fail(code, phase, message) {
  throw new AitapBundleError(code, phase, message);
}

function executableName(platform = process.platform) {
  return platform === 'win32' ? 'aitap.exe' : 'aitap';
}

function manifestPlatform(platform = process.platform) {
  if (platform === 'win32') return 'windows';
  if (platform === 'darwin') return 'darwin';
  if (platform === 'linux') return 'linux';
  return platform;
}

function canonicalArchitecture(value) {
  const normalized = String(value || '').toLowerCase();
  if (['x64', 'amd64', 'x86_64'].includes(normalized)) return 'x64';
  if (['arm64', 'aarch64'].includes(normalized)) return 'arm64';
  return normalized;
}

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}

function assertSafeRelativePath(relativePath, field) {
  if (typeof relativePath !== 'string' || !relativePath || relativePath.includes('\\')) {
    fail('AITAP_MANIFEST_INVALID', 'manifest', `${field} must be a non-empty POSIX relative path`);
  }
  if (path.posix.isAbsolute(relativePath)) {
    fail('AITAP_MANIFEST_INVALID', 'manifest', `${field} must be relative`);
  }
  const normalized = path.posix.normalize(relativePath);
  if (normalized !== relativePath || normalized === '..' || normalized.startsWith('../')) {
    fail('AITAP_MANIFEST_INVALID', 'manifest', `${field} escapes or is not normalized`);
  }
}

function listBundleFiles(rootDir) {
  const files = [];

  function visit(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const absolute = path.join(currentDir, entry.name);
      const relative = path.relative(rootDir, absolute).split(path.sep).join('/');
      if (entry.isSymbolicLink()) {
        fail('AITAP_SYMLINK_FORBIDDEN', 'integrity', `Symbolic link is not allowed in AITAP bundle: ${relative}`);
      }
      if (entry.isDirectory()) {
        visit(absolute);
      } else if (entry.isFile() && relative !== AITAP_MANIFEST_NAME) {
        files.push(relative);
      }
    }
  }

  visit(rootDir);
  return files.sort();
}

function readManifest(bundleDir) {
  const manifestPath = path.join(bundleDir, AITAP_MANIFEST_NAME);
  if (!fs.existsSync(manifestPath)) {
    fail('AITAP_MANIFEST_MISSING', 'manifest', `${AITAP_MANIFEST_NAME} is missing`);
  }

  let manifest;
  try {
    manifest = fs.readJsonSync(manifestPath);
  } catch (error) {
    fail('AITAP_MANIFEST_INVALID', 'manifest', `Cannot parse ${AITAP_MANIFEST_NAME}: ${error.message}`);
  }

  return { manifest, manifestPath };
}

function validateManifestContract(manifest, options = {}) {
  const expectedPlatform = options.expectedPlatform || process.platform;
  const expectedArch = options.expectedArch || os.arch();

  if (manifest.schema_version !== AITAP_MANIFEST_SCHEMA) {
    fail('AITAP_MANIFEST_UNSUPPORTED', 'manifest', `Unsupported manifest schema: ${manifest.schema_version || '(missing)'}`);
  }
  if (manifest.product !== 'AITAP') {
    fail('AITAP_MANIFEST_INVALID', 'manifest', `Unexpected product: ${manifest.product || '(missing)'}`);
  }
  if (manifest.packaging_mode !== AITAP_PACKAGING_MODE) {
    fail('AITAP_MANIFEST_INVALID', 'manifest', `Unexpected packaging mode: ${manifest.packaging_mode || '(missing)'}`);
  }
  if (manifest.platform !== manifestPlatform(expectedPlatform)) {
    fail('AITAP_PLATFORM_MISMATCH', 'manifest', `Bundle platform ${manifest.platform} does not match ${manifestPlatform(expectedPlatform)}`);
  }
  if (canonicalArchitecture(manifest.architecture) !== canonicalArchitecture(expectedArch)) {
    fail('AITAP_ARCHITECTURE_MISMATCH', 'manifest', `Bundle architecture ${manifest.architecture} does not match ${expectedArch}`);
  }
  if (typeof manifest.version !== 'string' || !manifest.version) {
    fail('AITAP_MANIFEST_INVALID', 'manifest', 'Manifest version is missing');
  }
  if (!Number.isSafeInteger(manifest.build_number) || manifest.build_number < 0) {
    fail('AITAP_MANIFEST_INVALID', 'manifest', 'Manifest build_number is invalid');
  }
  if (typeof manifest.embedded_python_version !== 'string' || !manifest.embedded_python_version) {
    fail('AITAP_MANIFEST_INVALID', 'manifest', 'Manifest embedded_python_version is missing');
  }
  if (!/^[0-9a-f]{64}$/.test(manifest.inventory_sha256 || '')) {
    fail('AITAP_MANIFEST_INVALID', 'manifest', 'Manifest inventory_sha256 is invalid');
  }
  if (!Array.isArray(manifest.required_paths) || manifest.required_paths.length === 0) {
    fail('AITAP_MANIFEST_INVALID', 'manifest', 'Manifest required_paths is missing');
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    fail('AITAP_MANIFEST_INVALID', 'manifest', 'Manifest files inventory is missing');
  }

  for (const smoke of AITAP_SMOKE_COMMANDS) {
    if (manifest.smokes?.[smoke.name] !== 'passed') {
      fail('AITAP_BUILD_SMOKE_MISSING', 'manifest', `Build did not approve smoke ${smoke.name}`);
    }
  }
}

function verifyAitapBundle(bundleDir, options = {}) {
  const rootDir = path.resolve(bundleDir);
  if (!fs.existsSync(rootDir) || !fs.statSync(rootDir).isDirectory()) {
    fail('AITAP_BUNDLE_MISSING', 'layout', 'AITAP bundle directory is missing');
  }

  const { manifest, manifestPath } = readManifest(rootDir);
  validateManifestContract(manifest, options);

  const requiredLayout = [
    executableName(options.expectedPlatform),
    '_internal',
    'help',
    AITAP_MANIFEST_NAME,
  ];
  for (const relative of requiredLayout) {
    if (!fs.existsSync(path.join(rootDir, relative))) {
      fail('AITAP_REQUIRED_PATH_MISSING', 'layout', `Required bundle path is missing: ${relative}`);
    }
  }

  const declaredRequired = new Set();
  for (const relative of manifest.required_paths) {
    assertSafeRelativePath(relative, 'required_paths entry');
    if (declaredRequired.has(relative)) {
      fail('AITAP_MANIFEST_INVALID', 'manifest', `Duplicate required path: ${relative}`);
    }
    declaredRequired.add(relative);
    if (!fs.existsSync(path.join(rootDir, ...relative.split('/')))) {
      fail('AITAP_REQUIRED_PATH_MISSING', 'layout', `Required product resource is missing: ${relative}`);
    }
  }

  const expectedByPath = new Map();
  for (const entry of manifest.files) {
    if (!entry || typeof entry !== 'object') {
      fail('AITAP_MANIFEST_INVALID', 'manifest', 'Manifest contains an invalid file entry');
    }
    assertSafeRelativePath(entry.path, 'files.path');
    if (expectedByPath.has(entry.path)) {
      fail('AITAP_MANIFEST_INVALID', 'manifest', `Duplicate inventory path: ${entry.path}`);
    }
    if (!Number.isSafeInteger(entry.size) || entry.size < 0 || !/^[0-9a-f]{64}$/.test(entry.sha256 || '')) {
      fail('AITAP_MANIFEST_INVALID', 'manifest', `Invalid inventory metadata for ${entry.path}`);
    }
    expectedByPath.set(entry.path, entry);
  }

  const actualPaths = listBundleFiles(rootDir);
  const expectedPaths = [...expectedByPath.keys()].sort();
  if (actualPaths.length !== expectedPaths.length || actualPaths.some((item, index) => item !== expectedPaths[index])) {
    const missing = expectedPaths.filter(item => !actualPaths.includes(item));
    const extra = actualPaths.filter(item => !expectedByPath.has(item));
    fail(
      'AITAP_INVENTORY_MISMATCH',
      'integrity',
      `Bundle inventory differs from manifest (missing: ${missing.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'})`
    );
  }

  const actualInventory = [];
  for (const relative of actualPaths) {
    const absolute = path.join(rootDir, ...relative.split('/'));
    const expected = expectedByPath.get(relative);
    const stat = fs.statSync(absolute);
    const digest = sha256File(absolute);
    if (stat.size !== expected.size || digest !== expected.sha256) {
      fail('AITAP_HASH_MISMATCH', 'integrity', `Bundle file does not match manifest: ${relative}`);
    }
    actualInventory.push({ path: relative, sha256: digest, size: stat.size });
  }

  const canonicalInventory = JSON.stringify(actualInventory);
  const inventoryDigest = sha256Buffer(Buffer.from(canonicalInventory, 'utf8'));
  if (inventoryDigest !== manifest.inventory_sha256) {
    fail('AITAP_INVENTORY_DIGEST_MISMATCH', 'integrity', 'Bundle inventory digest does not match manifest');
  }

  return {
    manifest,
    evidence: {
      status: 'passed',
      manifest_sha256: sha256File(manifestPath),
      inventory_sha256: inventoryDigest,
      files_verified: actualInventory.length,
    },
  };
}

function smokeEnvironment(bundleDir, sourceEnvironment = process.env) {
  const environment = { ...sourceEnvironment };
  for (const key of [
    'PYTHONPATH',
    'PYTHONHOME',
    'BLOOM_PROJECT_ROOT',
    'AITAP_REAL_PROVIDER_OPT_IN',
    'AITAP_REAL_OLLAMA',
  ]) {
    delete environment[key];
  }
  environment.PYTHONNOUSERSITE = '1';
  environment.PYTHONSAFEPATH = '1';

  const systemRoot = environment.SystemRoot || environment.SYSTEMROOT || 'C:\\Windows';
  const systemPath = process.platform === 'win32'
    ? [path.join(systemRoot, 'System32'), systemRoot, path.join(systemRoot, 'System32', 'Wbem')]
    : ['/usr/local/bin', '/usr/bin', '/bin'];
  environment.PATH = [bundleDir, ...systemPath].join(path.delimiter);
  return environment;
}

function runAitapSmokes(bundleDir, manifest, options = {}) {
  const rootDir = path.resolve(bundleDir);
  const executable = path.join(rootDir, executableName(options.expectedPlatform));
  const spawn = options.spawnSyncImpl || spawnSync;
  const timeout = options.timeout || 30000;
  const payloads = {};
  const results = {};

  for (const smoke of AITAP_SMOKE_COMMANDS) {
    const started = Date.now();
    const completed = spawn(executable, smoke.args, {
      cwd: rootDir,
      env: smokeEnvironment(rootDir, options.environment || process.env),
      encoding: 'utf8',
      windowsHide: true,
      timeout,
      maxBuffer: 5 * 1024 * 1024,
      shell: false,
    });

    if (completed.error || completed.status !== 0) {
      const reason = completed.error?.message || `exit code ${completed.status}`;
      fail('AITAP_SMOKE_FAILED', 'smoke', `AITAP smoke ${smoke.name} failed: ${reason}`);
    }

    let payload;
    try {
      payload = JSON.parse(completed.stdout);
    } catch (error) {
      fail('AITAP_SMOKE_INVALID_JSON', 'smoke', `AITAP smoke ${smoke.name} did not return JSON`);
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      fail('AITAP_SMOKE_INVALID_JSON', 'smoke', `AITAP smoke ${smoke.name} did not return a JSON object`);
    }
    if (['route.policy', 'local.preflight'].includes(smoke.name) && payload.status !== 'success') {
      fail('AITAP_SMOKE_REPORTED_ERROR', 'smoke', `AITAP smoke ${smoke.name} reported ${payload.status || 'an error'}`);
    }

    payloads[smoke.name] = payload;
    results[smoke.name] = {
      status: 'passed',
      exit_code: 0,
      duration_ms: Date.now() - started,
    };
  }

  const version = payloads['system.version'];
  const info = payloads['system.info'];
  if (version.version !== manifest.version || version.build_number !== manifest.build_number) {
    fail('AITAP_RUNTIME_IDENTITY_MISMATCH', 'smoke', 'AITAP version/build output does not match the bundle manifest');
  }
  if (
    info.version !== manifest.version ||
    info.build_number !== manifest.build_number ||
    info.os !== manifest.platform ||
    canonicalArchitecture(info.arch) !== canonicalArchitecture(manifest.architecture) ||
    info.python_version !== manifest.embedded_python_version
  ) {
    fail('AITAP_RUNTIME_IDENTITY_MISMATCH', 'smoke', 'AITAP system info does not match the bundle manifest');
  }

  return {
    evidence: results,
    runtime: {
      version: info.version,
      build_number: info.build_number,
      embedded_python_version: info.python_version,
      platform: info.os,
      architecture: info.arch,
    },
  };
}

function certifyAitapBundle(bundleDir, options = {}) {
  const integrity = verifyAitapBundle(bundleDir, options);
  const smokes = runAitapSmokes(bundleDir, integrity.manifest, options);
  return {
    valid: true,
    manifest: {
      schema_version: integrity.manifest.schema_version,
      product: integrity.manifest.product,
      version: integrity.manifest.version,
      build_number: integrity.manifest.build_number,
      platform: integrity.manifest.platform,
      architecture: integrity.manifest.architecture,
      embedded_python_version: integrity.manifest.embedded_python_version,
      packaging_mode: integrity.manifest.packaging_mode,
      inventory_sha256: integrity.manifest.inventory_sha256,
      file_count: integrity.manifest.files.length,
    },
    integrity: integrity.evidence,
    runtime: smokes.runtime,
    smokes: smokes.evidence,
  };
}

async function recoverInterruptedDeployment(destinationDir, backupDir, stagingDir, options = {}) {
  if (await fs.pathExists(stagingDir)) {
    await fs.remove(stagingDir);
  }
  if (!await fs.pathExists(backupDir)) return;

  if (!await fs.pathExists(destinationDir)) {
    await fs.rename(backupDir, destinationDir);
    return;
  }

  try {
    certifyAitapBundle(destinationDir, options);
    await fs.remove(backupDir);
  } catch (_) {
    await fs.remove(destinationDir);
    await fs.rename(backupDir, destinationDir);
  }
}

async function deployAitapBundle(options = {}) {
  const sourceDir = path.resolve(options.sourceDir);
  const destinationDir = path.resolve(options.destinationDir);
  const stagingDir = `${destinationDir}.staging`;
  const backupDir = `${destinationDir}.backup`;
  let backupCreated = false;
  let destinationActivated = false;

  const source = verifyAitapBundle(sourceDir, options);
  await fs.ensureDir(path.dirname(destinationDir));
  await recoverInterruptedDeployment(destinationDir, backupDir, stagingDir, options);

  try {
    await fs.copy(sourceDir, stagingDir, {
      overwrite: true,
      errorOnExist: false,
      dereference: false,
      preserveTimestamps: true,
    });
    if (process.platform !== 'win32') {
      await fs.chmod(path.join(stagingDir, executableName()), 0o755);
    }
    const staging = verifyAitapBundle(stagingDir, options);

    if (await fs.pathExists(destinationDir)) {
      await fs.rename(destinationDir, backupDir);
      backupCreated = true;
    }
    await fs.rename(stagingDir, destinationDir);
    destinationActivated = true;

    const destination = certifyAitapBundle(destinationDir, options);
    let backupRetained = false;
    if (backupCreated) {
      try {
        await fs.remove(backupDir);
      } catch (_) {
        backupRetained = true;
      }
    }

    return {
      success: true,
      source_integrity: source.evidence,
      staging_integrity: staging.evidence,
      destination,
      backup_retained: backupRetained,
    };
  } catch (error) {
    if (destinationActivated && await fs.pathExists(destinationDir)) {
      await fs.remove(destinationDir);
    }
    if (backupCreated && await fs.pathExists(backupDir)) {
      await fs.rename(backupDir, destinationDir);
    }
    if (await fs.pathExists(stagingDir)) {
      await fs.remove(stagingDir);
    }
    throw error;
  }
}

module.exports = {
  AITAP_MANIFEST_NAME,
  AITAP_MANIFEST_SCHEMA,
  AITAP_PACKAGING_MODE,
  AITAP_SMOKE_COMMANDS,
  AitapBundleError,
  verifyAitapBundle,
  runAitapSmokes,
  certifyAitapBundle,
  deployAitapBundle,
};
