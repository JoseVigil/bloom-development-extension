/**
 * RUNNER CORE — isolated root assembler.
 *
 * Creates a brand-new root R per run (never reused) with only the minimal
 * directory skeleton. It does not create BloomNucleus, bin, config,
 * nucleus.json or any binary, and it never spawns processes.
 *
 * Runtime files it may write inside R:
 *   R/.runner-core/created-paths.json
 *   R/.runner-core/processes.json   (initial registry: run start, no processes)
 */
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { forbiddenPaths, isWithin, overlaps, parseProcStat } from './isolation-preflight';

export const ROOT_DIRS: readonly string[] = [
  'home',
  'home/.local',
  'home/.local/share',
  'home/.local/state',
  'home/.config',
  'home/.cache',
  'run',
  'tmp',
  'workspaces',
  'dbus',
  '.runner-core',
];

export const RUNNER_CORE_DIR = '.runner-core';
export const CREATED_PATHS_FILE = 'created-paths.json';
export const PROCESSES_FILE = 'processes.json';
export const REPO_SNAPSHOT_FILE = 'repo-snapshot.json';
export const ROOT_PREFIX = 'rc-';

export interface AssembleOptions {
  parentDir: string;
  realHome: string;
  checkout: string;
  /** Contents of /proc/self/stat, injectable for tests. */
  selfStatText?: string;
}

export interface AssembledRoot {
  root: string;
  runId: string;
  createdPaths: string[];
  manifestPath: string;
  /** Harness starttime (clock ticks) — lower bound for process eligibility. */
  runStartTicks: number;
}

export interface CreatedPathsManifest {
  runId: string;
  root: string;
  createdAt: string;
  harnessPid: number;
  runStartTicks: number;
  paths: string[];
}

export interface ProcessRecord {
  role: string;
  pid: number;
  sid: number;
  pgid: number;
  starttime: number;
  startedAt: string;
}

export interface ProcessRegistry {
  runId: string;
  harnessPid: number;
  harnessSid: number;
  runStartTicks: number;
  processes: ProcessRecord[];
}

export function runnerCorePath(root: string, file: string): string {
  return path.join(root, RUNNER_CORE_DIR, file);
}

/** Throws unless dir exists, is a real directory and is empty. */
export function assertEmptyNewRoot(dir: string): void {
  const st = fs.lstatSync(dir);
  if (st.isSymbolicLink() || !st.isDirectory()) throw new Error('root_not_plain_directory');
  if (fs.readdirSync(dir).length !== 0) throw new Error('root_not_empty');
}

export function readCreatedPaths(root: string): CreatedPathsManifest {
  return JSON.parse(fs.readFileSync(runnerCorePath(root, CREATED_PATHS_FILE), 'utf8')) as CreatedPathsManifest;
}

/** Appends a path created inside R to the manifest. Refuses paths outside R. */
export function recordCreatedPath(root: string, created: string): void {
  if (!path.isAbsolute(created) || !isWithin(created, root)) throw new Error('created_path_outside_root');
  const manifest = readCreatedPaths(root);
  if (!manifest.paths.includes(created)) manifest.paths.push(created);
  fs.writeFileSync(runnerCorePath(root, CREATED_PATHS_FILE), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
}

export function assembleIsolatedRoot(opts: AssembleOptions): AssembledRoot {
  const { realHome, checkout } = opts;
  if (!path.isAbsolute(opts.parentDir) || !path.isAbsolute(realHome) || !path.isAbsolute(checkout)) {
    throw new Error('assemble_paths_not_absolute');
  }
  const parentDir = fs.realpathSync(opts.parentDir);
  if (isWithin(parentDir, realHome) || isWithin(realHome, parentDir)) throw new Error('parent_in_real_home');
  if (overlaps(parentDir, checkout)) throw new Error('parent_overlaps_checkout');
  for (const p of forbiddenPaths(realHome, checkout)) {
    if (overlaps(parentDir, p)) throw new Error('parent_overlaps_forbidden');
  }

  const selfStat = parseProcStat(opts.selfStatText ?? fs.readFileSync('/proc/self/stat', 'utf8'));

  const root = fs.mkdtempSync(path.join(parentDir, ROOT_PREFIX));
  fs.chmodSync(root, 0o700);
  assertEmptyNewRoot(root);

  const createdPaths: string[] = [root];
  for (const rel of ROOT_DIRS) {
    const dir = path.join(root, rel);
    fs.mkdirSync(dir, { mode: 0o700 });
    fs.chmodSync(dir, 0o700);
    createdPaths.push(dir);
  }

  const runId = randomUUID();
  const manifestPath = runnerCorePath(root, CREATED_PATHS_FILE);
  const registryPath = runnerCorePath(root, PROCESSES_FILE);
  createdPaths.push(manifestPath, registryPath);

  const manifest: CreatedPathsManifest = {
    runId,
    root,
    createdAt: new Date().toISOString(),
    harnessPid: selfStat.pid,
    runStartTicks: selfStat.starttime,
    paths: createdPaths,
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });

  const registry: ProcessRegistry = {
    runId,
    harnessPid: selfStat.pid,
    harnessSid: selfStat.session,
    runStartTicks: selfStat.starttime,
    processes: [],
  };
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n', { flag: 'wx', mode: 0o600 });

  return { root, runId, createdPaths, manifestPath, runStartTicks: selfStat.starttime };
}
