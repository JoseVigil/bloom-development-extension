'use strict';

const crypto = require('crypto');
const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const { spawnSync } = require('child_process');

const BLOOM_UNINSTALL_FILENAME = 'bloom-uninstall.exe';
const BLOOM_UNINSTALL_VERSION_PATTERN = /\b(v1\.0\.0-build\.\d+)\b/;
const PE_MACHINE = Object.freeze({
  0x014c: 'ia32',
  0x8664: 'x64',
});

function canonicalWindowsArch(value) {
  const normalized = String(value || '').toLowerCase();
  if (['x64', 'amd64', 'win64'].includes(normalized)) return 'x64';
  if (['ia32', 'x86', 'win32'].includes(normalized)) return 'ia32';
  return normalized;
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function readPeArchitecture(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.length < 64 || buffer.readUInt16LE(0) !== 0x5a4d) {
    throw new Error('invalid DOS signature');
  }

  const peOffset = buffer.readUInt32LE(0x3c);
  if (peOffset + 6 > buffer.length || buffer.readUInt32LE(peOffset) !== 0x00004550) {
    throw new Error('invalid PE signature');
  }

  const machine = buffer.readUInt16LE(peOffset + 4);
  const architecture = PE_MACHINE[machine];
  if (!architecture) {
    throw new Error(`unsupported PE machine 0x${machine.toString(16)}`);
  }
  return architecture;
}

function invalidEvidence(code, executable, error, extra = {}) {
  return {
    valid: false,
    code,
    method: 'file_exists_and_smoke',
    target: executable,
    smoke_test: '--version',
    version: null,
    architecture: null,
    sha256: null,
    exit_code: null,
    error,
    ...extra,
  };
}

function validateBloomUninstallExecutable(executable, options = {}) {
  const expectedArch = canonicalWindowsArch(options.expectedArch || os.arch());
  if (!fs.existsSync(executable) || !fs.statSync(executable).isFile()) {
    return invalidEvidence(
      options.missingCode || 'UNINSTALL_BINARY_MISSING',
      executable,
      'Bloom Uninstall executable not found'
    );
  }

  let architecture;
  try {
    architecture = readPeArchitecture(executable);
  } catch (error) {
    return invalidEvidence('UNINSTALL_PE_INVALID', executable, error.message);
  }

  if (architecture !== expectedArch) {
    return invalidEvidence(
      'UNINSTALL_ARCHITECTURE_MISMATCH',
      executable,
      `Bloom Uninstall architecture ${architecture} does not match ${expectedArch}`,
      { architecture }
    );
  }

  const run = options.spawnSyncImpl || spawnSync;
  const result = run(executable, ['--version'], {
    cwd: path.dirname(executable),
    encoding: 'utf8',
    windowsHide: true,
    timeout: options.timeout || 10000,
    shell: false,
  });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
  const match = output.match(BLOOM_UNINSTALL_VERSION_PATTERN);

  if (result.error || result.status !== 0) {
    return invalidEvidence(
      'UNINSTALL_VERSION_SMOKE_FAILED',
      executable,
      result.error?.message || `Bloom Uninstall --version exited with code ${result.status}`,
      { architecture, exit_code: result.status }
    );
  }
  if (!match) {
    return invalidEvidence(
      'UNINSTALL_VERSION_INVALID',
      executable,
      'Bloom Uninstall --version did not return v1.0.0-build.N',
      { architecture, exit_code: result.status }
    );
  }

  return {
    valid: true,
    code: null,
    method: 'file_exists_and_smoke',
    target: executable,
    smoke_test: '--version',
    version: match[1],
    architecture,
    sha256: sha256File(executable),
    exit_code: result.status,
    error: null,
  };
}

function validateInstalledBloomUninstall(sourceExecutable, installedExecutable, options = {}) {
  const source = validateBloomUninstallExecutable(sourceExecutable, {
    ...options,
    missingCode: 'UNINSTALL_SOURCE_MISSING',
  });
  if (!source.valid) {
    return {
      valid: false,
      code: source.code,
      method: 'source_destination_hash_and_version',
      targets: [sourceExecutable, installedExecutable],
      smoke_test: '--version',
      source,
      installed: null,
      version: null,
      hash_match: false,
      version_match: false,
      error: source.error,
    };
  }

  const installed = validateBloomUninstallExecutable(installedExecutable, options);
  if (!installed.valid) {
    return {
      valid: false,
      code: installed.code,
      method: 'source_destination_hash_and_version',
      targets: [sourceExecutable, installedExecutable],
      smoke_test: '--version',
      source,
      installed,
      version: null,
      hash_match: false,
      version_match: false,
      error: installed.error,
    };
  }

  const hashMatch = source.sha256 === installed.sha256;
  const versionMatch = source.version === installed.version;
  return {
    valid: hashMatch && versionMatch,
    code: hashMatch && versionMatch ? null : 'UNINSTALL_SOURCE_DESTINATION_MISMATCH',
    method: 'source_destination_hash_and_version',
    targets: [sourceExecutable, installedExecutable],
    smoke_test: '--version',
    source,
    installed,
    version: installed.version,
    architecture: installed.architecture,
    source_sha256: source.sha256,
    installed_sha256: installed.sha256,
    hash_match: hashMatch,
    version_match: versionMatch,
    error: hashMatch && versionMatch ? null : 'Installed Bloom Uninstall does not match the packaged artifact',
  };
}

async function deployBloomUninstall(options = {}) {
  const sourceExecutable = path.resolve(options.sourceExecutable);
  const installedExecutable = path.resolve(options.installedExecutable);
  const stagingExecutable = `${installedExecutable}.staging.exe`;
  const backupExecutable = `${installedExecutable}.backup.exe`;
  let backupCreated = false;
  let destinationActivated = false;

  const source = validateBloomUninstallExecutable(sourceExecutable, {
    ...options,
    missingCode: 'UNINSTALL_SOURCE_MISSING',
  });
  if (!source.valid) {
    const error = new Error(source.error);
    error.code = source.code;
    throw error;
  }

  await fs.ensureDir(path.dirname(installedExecutable));
  await fs.remove(stagingExecutable);
  await fs.remove(backupExecutable);

  try {
    await fs.copy(sourceExecutable, stagingExecutable, { overwrite: true, preserveTimestamps: true });
    const staging = validateBloomUninstallExecutable(stagingExecutable, options);
    if (!staging.valid || staging.sha256 !== source.sha256) {
      const error = new Error(staging.error || 'Staged Bloom Uninstall does not match the packaged artifact');
      error.code = staging.code || 'UNINSTALL_STAGING_MISMATCH';
      throw error;
    }

    if (await fs.pathExists(installedExecutable)) {
      await fs.rename(installedExecutable, backupExecutable);
      backupCreated = true;
    }
    await fs.rename(stagingExecutable, installedExecutable);
    destinationActivated = true;

    const evidence = validateInstalledBloomUninstall(sourceExecutable, installedExecutable, options);
    if (!evidence.valid) {
      const error = new Error(evidence.error);
      error.code = evidence.code;
      throw error;
    }

    if (backupCreated) await fs.remove(backupExecutable);
    return { success: true, evidence };
  } catch (error) {
    if (destinationActivated && await fs.pathExists(installedExecutable)) {
      await fs.remove(installedExecutable);
    }
    if (backupCreated && await fs.pathExists(backupExecutable)) {
      await fs.rename(backupExecutable, installedExecutable);
    }
    await fs.remove(stagingExecutable);
    throw error;
  }
}

module.exports = {
  BLOOM_UNINSTALL_FILENAME,
  BLOOM_UNINSTALL_VERSION_PATTERN,
  canonicalWindowsArch,
  readPeArchitecture,
  validateBloomUninstallExecutable,
  validateInstalledBloomUninstall,
  deployBloomUninstall,
};
