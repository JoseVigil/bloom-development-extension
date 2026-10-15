const fs = require('fs-extra');
const path = require('path');
const { spawnSync } = require('child_process');
const { execPromise } = require('../utils/exec-helper');
const { paths } = require('../config/paths');

const WINDOWS_PYTHON_VERSION = '3.10.20';
const WINDOWS_PYTHON_ARCH = 'AMD64';
const WINDOWS_PYTHON_PLATFORM = 'win32';
const WINDOWS_PYTHON_EXT_SUFFIX = '.cp310-win_amd64.pyd';
const WINDOWS_PTH_LINES = [
  '.',
  'Lib',
  'DLLs',
  'Lib\\site-packages',
  'import site',
];

const REQUIRED_RUNTIME_ARTIFACTS = [
  'python.exe',
  'python3.dll',
  'python310.dll',
  'vcruntime140.dll',
  'vcruntime140_1.dll',
  'DLLs',
  'Lib',
  path.join('Lib', 'site-packages'),
];

const VALIDATION_PREFIX = 'BLOOM_RUNTIME_VALIDATION=';
const VALIDATION_SCRIPT = `
import asyncio
import bz2
import ctypes
import decimal
import hashlib
import importlib.metadata
import json
import lzma
import multiprocessing
import os
import platform
import socket
import sqlite3
import ssl
import struct
import subprocess
import sys
import sysconfig
import time
import tkinter
import venv
import ensurepip
import _asyncio
import _bz2
import _ctypes
import _decimal
import _lzma
import _multiprocessing
import _socket
import _sqlite3
import _ssl
import _tkinter
from datetime import datetime, timezone
from pathlib import Path

def package_version(name):
    try:
        return importlib.metadata.version(name)
    except importlib.metadata.PackageNotFoundError:
        return None

payload = {
    "version": platform.python_version(),
    "version_info": list(sys.version_info[:3]),
    "implementation": platform.python_implementation(),
    "sys_platform": sys.platform,
    "machine": platform.machine(),
    "bits": struct.calcsize("P") * 8,
    "executable": sys.executable,
    "prefix": sys.prefix,
    "base_prefix": sys.base_prefix,
    "sysconfig_platform": sysconfig.get_platform(),
    "ext_suffix": sysconfig.get_config_var("EXT_SUFFIX"),
    "isolated": sys.flags.isolated,
    "no_user_site": sys.flags.no_user_site,
    "site_loaded": "site" in sys.modules,
    "sys_path": sys.path,
    "pip_version": package_version("pip"),
    "setuptools_version": package_version("setuptools"),
    "ssl_version": ssl.OPENSSL_VERSION,
    "sqlite_version": sqlite3.sqlite_version,
    "native_modules": {
        "_ssl": _ssl.__file__,
        "_sqlite3": _sqlite3.__file__,
        "_ctypes": _ctypes.__file__,
        "_bz2": _bz2.__file__,
        "_lzma": _lzma.__file__,
        "_socket": _socket.__file__,
        "_decimal": _decimal.__file__,
        "_multiprocessing": _multiprocessing.__file__,
        "_asyncio": _asyncio.__file__,
        "_tkinter": _tkinter.__file__,
    },
}
print("${VALIDATION_PREFIX}" + json.dumps(payload, sort_keys=True))
`;

function normalizePath(value) {
  return path.resolve(value).replaceAll('/', '\\').toLowerCase();
}

function readPeMachine(filePath) {
  const data = fs.readFileSync(filePath);
  if (data.length < 64 || data.readUInt16LE(0) !== 0x5a4d) {
    return null;
  }

  const peOffset = data.readUInt32LE(0x3c);
  if (peOffset + 6 > data.length || data.readUInt32LE(peOffset) !== 0x00004550) {
    return null;
  }

  return data.readUInt16LE(peOffset + 4);
}

function collectNativeRuntimeFiles(runtimeDir) {
  const nativeFiles = [];
  const sitePackages = normalizePath(path.join(runtimeDir, 'Lib', 'site-packages'));

  function visit(currentDir) {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
        continue;
      }
      if (!entry.isFile()) continue;

      const extension = path.extname(entry.name).toLowerCase();
      const inSitePackages = normalizePath(entryPath).startsWith(sitePackages + '\\');
      const isLoadableNative = inSitePackages
        ? extension === '.pyd' || extension === '.dll'
        : extension === '.exe' || extension === '.dll' || extension === '.pyd';

      if (isLoadableNative) nativeFiles.push(entryPath);
    }
  }

  visit(runtimeDir);
  return nativeFiles;
}

function validateNativeArchitecture(runtimeDir) {
  const files = collectNativeRuntimeFiles(runtimeDir);
  const invalid = [];

  for (const filePath of files) {
    const machine = readPeMachine(filePath);
    if (machine !== 0x8664) {
      invalid.push({
        file: path.relative(runtimeDir, filePath),
        machine: machine === null ? 'not-pe' : `0x${machine.toString(16).padStart(4, '0')}`,
      });
    }
  }

  return {
    valid: invalid.length === 0,
    expected_machine: '0x8664',
    checked: files.length,
    invalid,
  };
}

function runPythonValidation(pythonExe) {
  const result = spawnSync(pythonExe, ['-B', '-I', '-c', VALIDATION_SCRIPT], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30000,
    maxBuffer: 5 * 1024 * 1024,
    env: {
      ...process.env,
      PYTHONDONTWRITEBYTECODE: '1',
      PYTHONNOUSERSITE: '1',
    },
  });

  if (result.error || result.status !== 0) {
    return {
      valid: false,
      exit_code: result.status,
      error: result.error?.message || (result.stderr || result.stdout || 'Python validation failed').trim(),
    };
  }

  const validationLine = result.stdout
    .split(/\r?\n/)
    .find(line => line.startsWith(VALIDATION_PREFIX));

  if (!validationLine) {
    return {
      valid: false,
      exit_code: result.status,
      error: 'Python validation did not return its structured result',
    };
  }

  try {
    return {
      valid: true,
      exit_code: result.status,
      details: JSON.parse(validationLine.slice(VALIDATION_PREFIX.length)),
    };
  } catch (error) {
    return {
      valid: false,
      exit_code: result.status,
      error: `Invalid Python validation result: ${error.message}`,
    };
  }
}

function validateBundledPackageImport(pythonExe, packageName) {
  const result = spawnSync(
    pythonExe,
    ['-B', '-I', '-c', `import ${packageName}; print(getattr(${packageName}, '__version__', 'ok'))`],
    {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15000,
      env: {
        ...process.env,
        PYTHONDONTWRITEBYTECODE: '1',
        PYTHONNOUSERSITE: '1',
      },
    }
  );

  return {
    valid: !result.error && result.status === 0,
    version: result.status === 0 ? result.stdout.trim() : null,
    error: result.error?.message || (result.status === 0 ? null : (result.stderr || result.stdout).trim()),
  };
}

function validatePythonRuntime(runtimeDir, options = {}) {
  const requirePth = options.requirePth === true;
  const expectedVersion = options.expectedVersion || WINDOWS_PYTHON_VERSION;
  const pythonExe = path.join(runtimeDir, 'python.exe');
  const errors = [];

  const missing = REQUIRED_RUNTIME_ARTIFACTS.filter(relativePath =>
    !fs.existsSync(path.join(runtimeDir, relativePath))
  );
  if (missing.length > 0) {
    errors.push(`Missing runtime artifacts: ${missing.join(', ')}`);
  }

  let pth = { valid: !requirePth, required: requirePth, lines: null };
  if (requirePth) {
    const pthFile = path.join(runtimeDir, 'python310._pth');
    if (!fs.existsSync(pthFile)) {
      pth = { valid: false, required: true, file: pthFile, lines: null };
      errors.push('Missing python310._pth');
    } else {
      const lines = fs.readFileSync(pthFile, 'utf8')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);
      const valid = JSON.stringify(lines) === JSON.stringify(WINDOWS_PTH_LINES);
      pth = { valid, required: true, file: pthFile, lines };
      if (!valid) errors.push(`Invalid python310._pth: ${lines.join(' | ')}`);
    }
  }

  let execution = { valid: false, error: 'python.exe not found' };
  let nativeArchitecture = { valid: false, checked: 0, invalid: [] };
  const bundledPackages = {};

  if (fs.existsSync(pythonExe)) {
    execution = runPythonValidation(pythonExe);
    nativeArchitecture = validateNativeArchitecture(runtimeDir);

    if (!nativeArchitecture.valid) {
      errors.push(`Non-AMD64 native files: ${nativeArchitecture.invalid.map(item => item.file).join(', ')}`);
    }

    if (execution.valid) {
      const details = execution.details;
      if (details.version !== expectedVersion) errors.push(`Expected Python ${expectedVersion}, got ${details.version}`);
      if (details.implementation !== 'CPython') errors.push(`Expected CPython, got ${details.implementation}`);
      if (details.sys_platform !== WINDOWS_PYTHON_PLATFORM) errors.push(`Expected ${WINDOWS_PYTHON_PLATFORM}, got ${details.sys_platform}`);
      if (details.machine.toUpperCase() !== WINDOWS_PYTHON_ARCH) errors.push(`Expected ${WINDOWS_PYTHON_ARCH}, got ${details.machine}`);
      if (details.bits !== 64) errors.push(`Expected 64-bit Python, got ${details.bits}-bit`);
      if (details.sysconfig_platform !== 'win-amd64') errors.push(`Expected win-amd64, got ${details.sysconfig_platform}`);
      if (details.ext_suffix !== WINDOWS_PYTHON_EXT_SUFFIX) errors.push(`Expected ${WINDOWS_PYTHON_EXT_SUFFIX}, got ${details.ext_suffix}`);

      if (requirePth) {
        const expectedPaths = [
          runtimeDir,
          path.join(runtimeDir, 'Lib'),
          path.join(runtimeDir, 'DLLs'),
          path.join(runtimeDir, 'Lib', 'site-packages'),
        ].map(normalizePath);
        const actualPaths = details.sys_path.map(normalizePath);
        const missingPaths = expectedPaths.filter(expectedPath => !actualPaths.includes(expectedPath));
        if (missingPaths.length > 0) errors.push(`python310._pth paths not active: ${missingPaths.join(', ')}`);
        if (!details.site_loaded) errors.push('site module was not loaded by python310._pth');
      }

      for (const packageName of ['pip', 'setuptools']) {
        if (details[`${packageName}_version`]) {
          bundledPackages[packageName] = validateBundledPackageImport(pythonExe, packageName);
          if (!bundledPackages[packageName].valid) {
            errors.push(`Bundled ${packageName} import failed: ${bundledPackages[packageName].error}`);
          }
        }
      }
    } else {
      errors.push(execution.error);
    }
  }

  return {
    valid: errors.length === 0,
    runtime_dir: runtimeDir,
    python_exe: pythonExe,
    expected_version: expectedVersion,
    missing,
    pth,
    execution,
    native_architecture: nativeArchitecture,
    bundled_packages: bundledPackages,
    errors,
  };
}

function validatePythonRuntimePair(sourceDir = paths.runtimeSource, destinationDir = paths.runtimeDir) {
  const source = validatePythonRuntime(sourceDir, { requirePth: false });
  const destination = validatePythonRuntime(destinationDir, { requirePth: true });
  const errors = [
    ...source.errors.map(error => `source: ${error}`),
    ...destination.errors.map(error => `destination: ${error}`),
  ];

  if (source.valid && destination.valid) {
    const sourceVersion = source.execution.details.version;
    const destinationVersion = destination.execution.details.version;
    if (sourceVersion !== destinationVersion) {
      errors.push(`Source Python ${sourceVersion} does not match destination Python ${destinationVersion}`);
    }
  }

  return {
    valid: errors.length === 0,
    source,
    destination,
    errors,
  };
}

async function configurePythonPath(runtimeDir = paths.runtimeDir) {
  const pthFile = path.join(runtimeDir, 'python310._pth');
  const pthContent = WINDOWS_PTH_LINES.join('\r\n') + '\r\n';
  await fs.writeFile(pthFile, pthContent, 'utf8');
  return pthFile;
}

async function installRuntime(options = {}) {
  if (process.platform !== 'win32') {
    return { success: true, skipped: true, reason: 'Windows runtime installer is not used on this platform' };
  }

  const sourceDir = options.sourceDir || paths.runtimeSource;
  const runtimeDir = options.runtimeDir || paths.runtimeDir;
  const operationId = `${process.pid}-${Date.now()}`;
  const stagingDir = `${runtimeDir}.staging-${operationId}`;
  const backupDir = `${runtimeDir}.backup-${operationId}`;
  let backupCreated = false;
  let destinationActivated = false;

  console.log('🐍 Validating and deploying Windows Python Runtime...');
  console.log(`   Source: ${sourceDir}`);
  console.log(`   Destination: ${runtimeDir}`);

  const sourceValidation = validatePythonRuntime(sourceDir, { requirePth: false });
  if (!sourceValidation.valid) {
    throw new Error(`Python runtime source validation failed: ${sourceValidation.errors.join('; ')}`);
  }

  await fs.ensureDir(path.dirname(runtimeDir));

  try {
    await fs.copy(sourceDir, stagingDir, { overwrite: true, errorOnExist: false });
    await configurePythonPath(stagingDir);

    const stagingValidation = validatePythonRuntime(stagingDir, { requirePth: true });
    if (!stagingValidation.valid) {
      throw new Error(`Python runtime staging validation failed: ${stagingValidation.errors.join('; ')}`);
    }

    if (await fs.pathExists(runtimeDir)) {
      await fs.rename(runtimeDir, backupDir);
      backupCreated = true;
    }

    await fs.rename(stagingDir, runtimeDir);
    destinationActivated = true;

    const destinationValidation = validatePythonRuntime(runtimeDir, { requirePth: true });
    if (!destinationValidation.valid) {
      throw new Error(`Python runtime destination validation failed: ${destinationValidation.errors.join('; ')}`);
    }

    let backupRetained = null;
    if (backupCreated) {
      try {
        await fs.remove(backupDir);
      } catch (cleanupError) {
        backupRetained = backupDir;
        console.warn(` ⚠ Validated runtime installed, but backup cleanup failed: ${cleanupError.message}`);
      }
    }

    console.log(` ✅ Python ${destinationValidation.execution.details.version} runtime deployed and validated`);
    return {
      success: true,
      source: sourceValidation,
      staging: stagingValidation,
      destination: destinationValidation,
      backup_retained: backupRetained,
    };
  } catch (error) {
    if (destinationActivated && await fs.pathExists(runtimeDir)) {
      await fs.remove(runtimeDir);
    }
    if (backupCreated && await fs.pathExists(backupDir)) {
      await fs.rename(backupDir, runtimeDir);
    }
    if (await fs.pathExists(stagingDir)) {
      await fs.remove(stagingDir);
    }
    throw error;
  }
}

async function initializeBrainProfile() {
  console.log('🧠 Initializing Master Profile...');

  const brainExe = paths.brainExe;
  const profileName = 'MasterWorker';
  const command = `"${brainExe}" --json profile create ${profileName}`;

  try {
    const { stdout } = await execPromise(command, {
      timeout: 15000,
      env: {
        LOCALAPPDATA: process.env.LOCALAPPDATA,
      },
    });

    const result = JSON.parse(stdout);
    const profileId = result.data?.id || result.id || (Array.isArray(result) ? result[0]?.id : null);

    if (!profileId) throw new Error("Couldn't get Profile ID");

    await fs.ensureDir(paths.configDir);
    const config = fs.existsSync(paths.configFile) ? await fs.readJson(paths.configFile) : {};
    config.masterProfileId = profileId;
    config.brainExe = brainExe;
    await fs.writeJson(paths.configFile, config, { spaces: 2 });

    return profileId;
  } catch (error) {
    throw new Error(`Failed to create profile: ${error.message}`);
  }
}

module.exports = {
  installRuntime,
  configurePythonPath,
  validatePythonRuntime,
  validatePythonRuntimePair,
  validateNativeArchitecture,
  WINDOWS_PTH_LINES,
  WINDOWS_PYTHON_VERSION,
  initializeBrainProfile,
};
