'use strict';

const crypto = require('crypto');
const path = require('path');

// Electron patches `fs` so paths ending in app.asar are interpreted as virtual
// archives. Workspace deployment needs the physical file itself, not its virtual
// contents. `original-fs` bypasses that patch inside Electron; plain Node tests
// use the standard implementation.
let fs;
try {
  fs = require('original-fs');
} catch (_) {
  fs = require('fs');
}

const WINDOWS_WORKSPACE_REQUIRED_PATHS = Object.freeze([
  'bloom-workspace.exe',
  'resources/app.asar',
  'resources/app.asar.unpacked',
  'resources/shared',
  'shared',
  'locales',
  'node_modules',
]);

function toRelativePath(rootDir, absolutePath) {
  return path.relative(rootDir, absolutePath).split(path.sep).join('/');
}

function hashFile(filePath) {
  const hash = crypto.createHash('sha256');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  const descriptor = fs.openSync(filePath, 'r');

  try {
    let bytesRead;
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(descriptor);
  }

  return hash.digest('hex');
}

function fsCall(method, ...args) {
  return new Promise((resolve, reject) => {
    fs[method](...args, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
}

async function pathExists(targetPath) {
  try {
    await fsCall('lstat', targetPath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function ensureDir(directoryPath) {
  await fsCall('mkdir', directoryPath, { recursive: true });
}

async function copyPhysicalTree(sourceDir, destinationDir) {
  await ensureDir(destinationDir);
  const entries = await fsCall('readdir', sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const destinationPath = path.join(destinationDir, entry.name);
    if (entry.isSymbolicLink()) {
      const error = new Error(`Workspace bundle contains unsupported symbolic link: ${sourcePath}`);
      error.code = 'WORKSPACE_SYMLINK_UNSUPPORTED';
      throw error;
    }
    if (entry.isDirectory()) {
      await copyPhysicalTree(sourcePath, destinationPath);
    } else if (entry.isFile()) {
      await fsCall('copyFile', sourcePath, destinationPath, fs.constants.COPYFILE_EXCL);
    } else {
      const error = new Error(`Workspace bundle contains unsupported entry: ${sourcePath}`);
      error.code = 'WORKSPACE_ENTRY_UNSUPPORTED';
      throw error;
    }
  }
}

async function removePhysicalTree(targetPath) {
  let stat;
  try {
    stat = await fsCall('lstat', targetPath);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }

  if (stat.isDirectory() && !stat.isSymbolicLink()) {
    const entries = await fsCall('readdir', targetPath);
    for (const entry of entries) {
      await removePhysicalTree(path.join(targetPath, entry));
    }
    await fsCall('rmdir', targetPath);
  } else {
    await fsCall('unlink', targetPath);
  }
}

async function movePhysicalTree(sourcePath, destinationPath) {
  if (await pathExists(destinationPath)) {
    const error = new Error(`Destination already exists: ${destinationPath}`);
    error.code = 'EEXIST';
    throw error;
  }
  await fsCall('rename', sourcePath, destinationPath);
}

function inventoryTree(rootDir) {
  if (!rootDir || !fs.existsSync(rootDir) || !fs.statSync(rootDir).isDirectory()) {
    const error = new Error(`Workspace bundle directory not found: ${rootDir}`);
    error.code = 'WORKSPACE_SOURCE_NOT_FOUND';
    throw error;
  }

  const files = [];
  const directories = [];
  const walk = currentDir => {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      const relativePath = toRelativePath(rootDir, absolutePath);
      if (entry.isSymbolicLink()) {
        const error = new Error(`Workspace bundle contains unsupported symbolic link: ${relativePath}`);
        error.code = 'WORKSPACE_SYMLINK_UNSUPPORTED';
        throw error;
      }
      if (entry.isDirectory()) {
        directories.push(relativePath);
        walk(absolutePath);
      } else if (entry.isFile()) {
        const stat = fs.statSync(absolutePath);
        files.push({
          path: relativePath,
          size: stat.size,
          sha256: hashFile(absolutePath),
        });
      } else {
        const error = new Error(`Workspace bundle contains unsupported entry: ${relativePath}`);
        error.code = 'WORKSPACE_ENTRY_UNSUPPORTED';
        throw error;
      }
    }
  };

  walk(rootDir);
  files.sort((left, right) => left.path.localeCompare(right.path));
  directories.sort((left, right) => left.localeCompare(right));

  const inventoryHash = crypto.createHash('sha256');
  for (const file of files) {
    inventoryHash.update(`${file.path}\0${file.size}\0${file.sha256}\n`, 'utf8');
  }

  return {
    root: rootDir,
    files,
    directories,
    file_count: files.length,
    total_bytes: files.reduce((total, file) => total + file.size, 0),
    inventory_sha256: inventoryHash.digest('hex'),
  };
}

function validateWorkspaceBundleSource(sourceDir) {
  try {
    const inventory = inventoryTree(sourceDir);
    const filePaths = new Set(inventory.files.map(file => file.path));
    const directoryPaths = new Set(inventory.directories);
    const missing = WINDOWS_WORKSPACE_REQUIRED_PATHS.filter(relativePath => {
      return !filePaths.has(relativePath) && !directoryPaths.has(relativePath);
    });

    if (missing.length > 0) {
      return {
        valid: false,
        code: 'WORKSPACE_REQUIRED_PATH_MISSING',
        error: `Workspace bundle is incomplete; missing: ${missing.join(', ')}`,
        missing,
        inventory,
      };
    }

    return { valid: true, code: null, error: null, missing: [], inventory };
  } catch (error) {
    return {
      valid: false,
      code: error.code || 'WORKSPACE_SOURCE_VALIDATION_FAILED',
      error: error.message,
      missing: [],
      inventory: null,
    };
  }
}

function compareWorkspaceBundles(sourceDir, destinationDir) {
  const sourceValidation = validateWorkspaceBundleSource(sourceDir);
  if (!sourceValidation.valid) {
    return {
      valid: false,
      code: sourceValidation.code,
      error: sourceValidation.error,
      source: sourceValidation.inventory,
      destination: null,
      missing: sourceValidation.missing,
      missing_directories: [],
      different_hash: [],
      extra: [],
      extra_directories: [],
    };
  }

  let destination;
  try {
    destination = inventoryTree(destinationDir);
  } catch (error) {
    return {
      valid: false,
      code: error.code === 'WORKSPACE_SOURCE_NOT_FOUND'
        ? 'WORKSPACE_DESTINATION_NOT_FOUND'
        : (error.code || 'WORKSPACE_DESTINATION_VALIDATION_FAILED'),
      error: error.message,
      source: sourceValidation.inventory,
      destination: null,
      missing: sourceValidation.inventory.files.map(file => file.path),
      missing_directories: sourceValidation.inventory.directories,
      different_hash: [],
      extra: [],
      extra_directories: [],
    };
  }

  const sourceFiles = new Map(sourceValidation.inventory.files.map(file => [file.path, file]));
  const destinationFiles = new Map(destination.files.map(file => [file.path, file]));
  const missing = [];
  const missingDirectories = [];
  const differentHash = [];
  const extra = [];
  const extraDirectories = [];

  for (const [relativePath, sourceFile] of sourceFiles) {
    const installedFile = destinationFiles.get(relativePath);
    if (!installedFile) {
      missing.push(relativePath);
    } else if (sourceFile.size !== installedFile.size || sourceFile.sha256 !== installedFile.sha256) {
      differentHash.push(relativePath);
    }
  }
  for (const relativePath of destinationFiles.keys()) {
    if (!sourceFiles.has(relativePath)) extra.push(relativePath);
  }
  const sourceDirectories = new Set(sourceValidation.inventory.directories);
  const destinationDirectories = new Set(destination.directories);
  for (const relativePath of sourceDirectories) {
    if (!destinationDirectories.has(relativePath)) missingDirectories.push(relativePath);
  }
  for (const relativePath of destinationDirectories) {
    if (!sourceDirectories.has(relativePath)) extraDirectories.push(relativePath);
  }

  const valid = missing.length === 0 && missingDirectories.length === 0 &&
    differentHash.length === 0 && extra.length === 0 && extraDirectories.length === 0;
  return {
    valid,
    code: valid ? null : 'WORKSPACE_SOURCE_DESTINATION_MISMATCH',
    error: valid
      ? null
      : `Workspace bundle mismatch (missing=${missing.length}, missing_dirs=${missingDirectories.length}, ` +
        `different=${differentHash.length}, extra=${extra.length}, extra_dirs=${extraDirectories.length})`,
    integrity: valid ? 'passed' : 'failed',
    source: {
      root: sourceValidation.inventory.root,
      file_count: sourceValidation.inventory.file_count,
      total_bytes: sourceValidation.inventory.total_bytes,
      inventory_sha256: sourceValidation.inventory.inventory_sha256,
    },
    destination: {
      root: destination.root,
      file_count: destination.file_count,
      total_bytes: destination.total_bytes,
      inventory_sha256: destination.inventory_sha256,
    },
    missing,
    missing_directories: missingDirectories,
    different_hash: differentHash,
    extra,
    extra_directories: extraDirectories,
  };
}

async function deployWorkspaceBundle({ sourceDir, destinationDir }) {
  const sourceValidation = validateWorkspaceBundleSource(sourceDir);
  if (!sourceValidation.valid) {
    const error = new Error(sourceValidation.error);
    error.code = sourceValidation.code;
    error.evidence = sourceValidation;
    throw error;
  }

  const suffix = `${process.pid}-${Date.now()}`;
  const stagingDir = `${destinationDir}.setup-staging-${suffix}`;
  const backupDir = `${destinationDir}.setup-backup-${suffix}`;
  let previousMoved = false;
  let installedMoved = false;

  try {
    await ensureDir(path.dirname(destinationDir));
    await copyPhysicalTree(sourceDir, stagingDir);

    const stagingEvidence = compareWorkspaceBundles(sourceDir, stagingDir);
    if (!stagingEvidence.valid) {
      const error = new Error(`Workspace staging validation failed: ${stagingEvidence.error}`);
      error.code = stagingEvidence.code;
      error.evidence = stagingEvidence;
      throw error;
    }

    if (await pathExists(destinationDir)) {
      await movePhysicalTree(destinationDir, backupDir);
      previousMoved = true;
    }
    await movePhysicalTree(stagingDir, destinationDir);
    installedMoved = true;

    const installedEvidence = compareWorkspaceBundles(sourceDir, destinationDir);
    if (!installedEvidence.valid) {
      const error = new Error(`Installed Workspace validation failed: ${installedEvidence.error}`);
      error.code = installedEvidence.code;
      error.evidence = installedEvidence;
      throw error;
    }

    let backupCleanupError = null;
    if (previousMoved) {
      try {
        await removePhysicalTree(backupDir);
      } catch (error) {
        // The newly installed tree is already certified. Keep the recoverable
        // backup instead of rolling back a valid installation only because the
        // old tree could not be deleted.
        backupCleanupError = error.message;
      }
    }
    return {
      success: true,
      evidence: installedEvidence,
      backup_cleanup_error: backupCleanupError,
    };
  } catch (error) {
    if (await pathExists(stagingDir)) await removePhysicalTree(stagingDir);
    if (installedMoved && await pathExists(destinationDir)) await removePhysicalTree(destinationDir);
    if (previousMoved) {
      if (await pathExists(backupDir)) await movePhysicalTree(backupDir, destinationDir);
    }
    throw error;
  }
}

module.exports = {
  WINDOWS_WORKSPACE_REQUIRED_PATHS,
  inventoryTree,
  validateWorkspaceBundleSource,
  compareWorkspaceBundles,
  deployWorkspaceBundle,
};
