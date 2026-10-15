import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { withinWindowsRoot } from './windows-isolation-preflight';

export interface WindowsAssembledRoot {
  root: string;
  runId: string;
  executable: string;
  manifestPath: string;
}

export interface WindowsAssembleOptions {
  parentDir?: string;
  executable: string;
  /** Native root created and ACL/probes verified before package copy. */
  preparedRoot?: { root: string; runId: string; rootAclVerified: boolean; probesPassed: boolean };
  /** Synthetic package tests only; never used by run-windows-core. */
  fixtureMode?: true;
}

export interface StagedFile {
  /** Path relative to the staged package, using forward slashes. */
  path: string;
  size: number;
  sha256: string;
}

export interface WindowsPackageManifest {
  version: 1;
  runId: string;
  root: string;
  executable: string;
  files: StagedFile[];
  createdAt: string;
}

const DIRS = ['bin', 'home', 'home\\AppData\\Local', 'home\\AppData\\Roaming', 'tmp', 'workspace', '.runner-core'] as const;
const PACKAGE_MARKER = path.win32.join('resources', 'app.asar');
const DRIVE_PATH = /^[A-Za-z]:\\/;
const ALLOWED_TOP_LEVEL = new Set([
  'bloom-workspace.exe', 'bloom-conductor-version.ps1', 'locales', 'node_modules', 'resources', 'shared',
  'chrome_100_percent.pak', 'chrome_200_percent.pak', 'd3dcompiler_47.dll', 'ffmpeg.dll',
  'icudtl.dat', 'libegl.dll', 'libglesv2.dll', 'license.electron.txt', 'licenses.chromium.html',
  'resources.pak', 'snapshot_blob.bin', 'v8_context_snapshot.bin', 'vk_swiftshader_icd.json',
  'vk_swiftshader.dll', 'vulkan-1.dll',
]);

type AsarNode = { files?: Record<string, AsarNode>; link?: string; size?: number };
type AsarApi = {
  getRawHeader(archive: string): { header: AsarNode };
  listPackage(archive: string, options: { isPack: boolean }): string[];
};

function asarApi(): AsarApi {
  try { return require('@electron/asar') as AsarApi; }
  catch { throw new Error('asar_inspector_unavailable'); }
}

function forbiddenConfigurationName(relative: string): boolean {
  const segments = relative.toLowerCase().split('/');
  if (segments.some((s) => s === '.bloom' || s === '.ssh' || s === '.aws')) return true;
  const base = segments[segments.length - 1];
  return /^\.env(?:\..*)?$/.test(base) || base === '.dev.vars' ||
    /\.(?:pem|key|p12|pfx|jks|keystore)$/.test(base) ||
    /^(?:nucleus|profiles|credentials?|secrets?|tokens?|service[-_]account|private[-_]key|\.ownership)(?:\.(?:json|ya?ml|toml|txt))?$/.test(base) ||
    /^id_(?:rsa|ed25519|ecdsa)$/.test(base);
}

/** Names and metadata only: no ASAR file payload or configuration value is read. */
export function inspectWorkspacePackageContent(packageDir: string, outerFiles: readonly string[]): void {
  if (!outerFiles.includes('resources/app.asar') || !outerFiles.includes('bloom-workspace.exe')) {
    throw new Error('workspace_package_incomplete');
  }
  for (const name of fs.readdirSync(packageDir)) {
    if (forbiddenConfigurationName(name)) throw new Error('package_forbidden_configuration');
    if (!ALLOWED_TOP_LEVEL.has(name.toLowerCase())) throw new Error('package_outer_unexpected');
  }
  for (const relative of outerFiles) {
    if (forbiddenConfigurationName(relative)) throw new Error('package_forbidden_configuration');
    const top = relative.split('/')[0].toLowerCase();
    if (!ALLOWED_TOP_LEVEL.has(top)) throw new Error('package_outer_unexpected');
  }
  const archive = path.win32.join(packageDir, PACKAGE_MARKER);
  try {
    const api = asarApi();
    const root = api.getRawHeader(archive).header;
    if (!root || !root.files || typeof root.files !== 'object') throw new Error('invalid_asar_header');
    const files: string[] = [];
    const walk = (node: AsarNode, prefix: string): void => {
      if (!node.files || typeof node.files !== 'object') throw new Error('invalid_asar_directory');
      for (const [name, child] of Object.entries(node.files)) {
        if (!name || name === '.' || name === '..' || /[\\/\x00-\x1f]/.test(name)) throw new Error('invalid_asar_name');
        const relative = prefix ? `${prefix}/${name}` : name;
        if (forbiddenConfigurationName(relative)) throw new Error('forbidden_asar_entry');
        if (child.link !== undefined) throw new Error('asar_link_unexpected');
        if (child.files !== undefined) walk(child, relative);
        else if (Number.isSafeInteger(child.size) && child.size! >= 0) files.push(relative);
        else throw new Error('invalid_asar_entry');
      }
    };
    walk(root, '');
    const listed = new Set(api.listPackage(archive, { isPack: false }).map((p) => p.replace(/^[\\/]+/, '').replace(/\\/g, '/')));
    if (files.length === 0 || files.some((p) => !listed.has(p)) || !files.includes('main_conductor.js')) {
      throw new Error('asar_listing_incomplete');
    }
  } catch {
    throw new Error('embedded_config_scan_failed');
  }
}

function canonical(p: string): string {
  return path.win32.normalize(p).toLocaleLowerCase('en-US');
}

function assertLocalDirectory(p: string, code: string): void {
  if (!DRIVE_PATH.test(p) || !fs.statSync(p).isDirectory()) throw new Error(code);
  if (canonical(fs.realpathSync.native(p)) !== canonical(p)) throw new Error(`${code}_redirected`);
}

/** PowerShell checks FILE_ATTRIBUTE_REPARSE_POINT, including kinds not exposed
 * by Node's isSymbolicLink(). Any inspection error aborts staging. */
export function assertNoWindowsReparsePoints(packageDir: string): void {
  const encodedPath = Buffer.from(packageDir, 'utf16le').toString('base64');
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `$p = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${encodedPath}'))`,
    '$source = $p',
    'while ($true) {',
    '  $item = Get-Item -LiteralPath $p -Force',
    '  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { exit 41 }',
    '  $parent = Split-Path -Path $p -Parent',
    '  if ([string]::IsNullOrEmpty($parent) -or $parent -eq $p) { break }',
    '  $p = $parent',
    '}',
    'Get-ChildItem -LiteralPath $source -Recurse -Force | ForEach-Object {',
    '  if (($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { exit 41 }',
    '}',
  ].join('\n');
  const systemRoot = process.env.SystemRoot ?? 'C:\\Windows';
  if (!DRIVE_PATH.test(systemRoot)) throw new Error('system_root_invalid');
  const powerShell = path.win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  try {
    execFileSync(powerShell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
      windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'], timeout: 60_000,
      env: { SystemRoot: systemRoot, WINDIR: systemRoot, PATH: path.win32.dirname(powerShell) },
    });
  } catch (error) {
    const status = (error as { status?: number }).status;
    throw new Error(status === 41 ? 'package_reparse_point' : 'package_reparse_inspection_failed');
  }
}

export function packageFileList(packageDir: string): string[] {
  if (process.platform !== 'win32') throw new Error('windows_package_requires_win32');
  const result: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.win32.join(dir, entry.name);
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) throw new Error('package_reparse_point');
      if (canonical(fs.realpathSync.native(absolute)) !== canonical(absolute)) throw new Error('package_path_redirected');
      if (stat.isDirectory()) walk(absolute);
      else if (stat.isFile()) result.push(path.win32.relative(packageDir, absolute).replace(/\\/g, '/'));
      else throw new Error('package_special_file');
    }
  };
  walk(packageDir);
  result.sort((a, b) => a.localeCompare(b, 'en'));
  return result;
}

export function sha256File(file: string): string {
  const hash = createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    for (;;) {
      const count = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (count === 0) break;
      hash.update(buffer.subarray(0, count));
    }
  } finally { fs.closeSync(fd); }
  return hash.digest('hex');
}

/** Inspects source names before any isolated root is created. */
export function inspectWorkspaceSource(executable: string): { source: string; packageDir: string; sourceFiles: string[] } {
  if (process.platform !== 'win32') throw new Error('windows_root_requires_win32');
  const source = path.win32.resolve(executable);
  if (!DRIVE_PATH.test(source) || !fs.lstatSync(source).isFile()) {
    throw new Error('workspace_executable_not_regular_local_file');
  }
  const packageDir = path.win32.dirname(source);
  assertLocalDirectory(packageDir, 'workspace_package_invalid');
  const marker = path.win32.join(packageDir, PACKAGE_MARKER);
  let markerStat: fs.Stats;
  try { markerStat = fs.lstatSync(marker); }
  catch { throw new Error('workspace_package_incomplete'); }
  if (!markerStat.isFile()) throw new Error('workspace_package_incomplete');
  assertNoWindowsReparsePoints(packageDir);
  const sourceFiles = packageFileList(packageDir);
  if (!sourceFiles.includes(PACKAGE_MARKER.replace(/\\/g, '/'))) throw new Error('workspace_package_incomplete');
  inspectWorkspacePackageContent(packageDir, sourceFiles);
  return { source, packageDir, sourceFiles };
}

/** Stages the complete unpacked Workspace package. Hashes prove copy integrity,
 * not the safety of configuration embedded inside app.asar. */
export function assembleWindowsIsolatedRoot(opts: WindowsAssembleOptions): WindowsAssembledRoot {
  const { source, packageDir, sourceFiles } = inspectWorkspaceSource(opts.executable);

  let root: string;
  let runId: string;
  if (opts.preparedRoot) {
    const prepared = opts.preparedRoot;
    const parent = path.win32.resolve(path.win32.join(os.tmpdir(), 'bloom-runner-core'));
    if (prepared.rootAclVerified !== true || prepared.probesPassed !== true ||
        !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(prepared.runId) ||
        !path.win32.basename(prepared.root).startsWith('rc-') ||
        canonical(path.win32.dirname(prepared.root)) !== canonical(parent)) {
      throw new Error('native_root_evidence_invalid');
    }
    root = prepared.root;
    runId = prepared.runId;
    assertLocalDirectory(root, 'native_root_invalid');
  } else if (opts.fixtureMode === true) {
    const parent = path.win32.resolve(opts.parentDir ?? path.win32.join(os.tmpdir(), 'bloom-runner-core'));
    if (withinWindowsRoot(parent, packageDir)) throw new Error('root_parent_inside_source_package');
    fs.mkdirSync(parent, { recursive: true });
    assertLocalDirectory(parent, 'root_parent_invalid');
    root = fs.mkdtempSync(path.win32.join(parent, 'rc-'));
    runId = randomUUID();
  } else {
    throw new Error('native_root_required_before_copy');
  }
  if (withinWindowsRoot(root, packageDir)) throw new Error('root_inside_source_package');
  for (const rel of DIRS) fs.mkdirSync(path.win32.join(root, rel), { recursive: true });
  const stagedDir = path.win32.join(root, 'bin');
  const files: StagedFile[] = [];
  for (const relative of sourceFiles) {
    const from = path.win32.join(packageDir, relative);
    const to = path.win32.join(stagedDir, relative);
    if (!withinWindowsRoot(to, stagedDir)) throw new Error('package_path_outside_root');
    fs.mkdirSync(path.win32.dirname(to), { recursive: true });
    fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
    const sourceHash = sha256File(from);
    const stagedHash = sha256File(to);
    if (sourceHash !== stagedHash) throw new Error('package_copy_hash_mismatch');
    files.push({ path: relative, size: fs.statSync(to).size, sha256: stagedHash });
  }
  const executable = path.win32.join(stagedDir, path.win32.basename(source));
  if (!withinWindowsRoot(executable, root) || !fs.statSync(executable).isFile()) throw new Error('staged_executable_invalid');
  const manifestPath = path.win32.join(root, '.runner-core', 'manifest.json');
  const manifest: WindowsPackageManifest = { version: 1, runId, root, executable, files, createdAt: new Date().toISOString() };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  return { root, runId, executable, manifestPath };
}
