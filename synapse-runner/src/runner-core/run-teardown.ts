/**
 * RUNNER CORE — run teardown and repository verification.
 *
 * Process termination is authorized only by demonstrable run membership:
 *   token match AND HOME = R/home AND registered SID AND starttime >= run start.
 * Ambiguous processes are reported, never signalled, and make the run FAIL.
 * Port occupancy alone never authorizes a signal. Signals are sent per PID,
 * never per process group, and the starttime is re-checked before each one.
 * Nothing is deleted.
 *
 * Runtime files it may write inside R:
 *   R/.runner-core/repo-snapshot.json
 */
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import {
  CheckFailure,
  EnvironSubset,
  ProcStat,
  inspectPorts,
  listPids,
  readEnvironSubset,
  readProcStat,
  rootHome,
} from './isolation-preflight';
import {
  PROCESSES_FILE,
  ProcessRegistry,
  REPO_SNAPSHOT_FILE,
  recordCreatedPath,
  runnerCorePath,
} from './isolated-root-assembler';

// ---------------------------------------------------------------------------
// Repository baseline
// ---------------------------------------------------------------------------

/** Git-ignored caches Vite may produce when serving the checkout (approved exception). */
export const APPROVED_CACHE_PATHS: readonly string[] = ['webview/app/.svelte-kit', 'webview/app/node_modules/.vite'];

export type GitFn = (args: string[]) => string;

export function defaultGit(checkout: string, gitPath = 'git'): GitFn {
  return (args) =>
    execFileSync(gitPath, ['--no-optional-locks', '-C', checkout, ...args], {
      env: { GIT_OPTIONAL_LOCKS: '0', LANG: 'C', PATH: '/usr/bin:/bin' },
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
}

export interface RepoSnapshot {
  head: string;
  diffSha256: string;
  untracked: string[];
  ignored: string[];
  approvedCaches: Record<string, boolean>;
  capturedAt: string;
}

function lines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .sort();
}

export function takeRepoSnapshot(checkout: string, git: GitFn): RepoSnapshot {
  const approvedCaches: Record<string, boolean> = {};
  for (const rel of APPROVED_CACHE_PATHS) approvedCaches[rel] = fs.existsSync(path.join(checkout, rel));
  return {
    head: git(['rev-parse', 'HEAD']).trim(),
    diffSha256: createHash('sha256').update(git(['diff', 'HEAD', '--binary'])).digest('hex'),
    untracked: lines(git(['ls-files', '--others', '--exclude-standard'])),
    ignored: lines(git(['ls-files', '--others', '--ignored', '--exclude-standard', '--directory'])),
    approvedCaches,
    capturedAt: new Date().toISOString(),
  };
}

/** Captures the baseline and stores it in R/.runner-core/repo-snapshot.json (exclusive create). */
export function captureRepoBaseline(checkout: string, root: string, gitImpl?: GitFn): RepoSnapshot {
  const snapshot = takeRepoSnapshot(checkout, gitImpl ?? defaultGit(checkout));
  const p = runnerCorePath(root, REPO_SNAPSHOT_FILE);
  fs.writeFileSync(p, JSON.stringify(snapshot, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  recordCreatedPath(root, p);
  return snapshot;
}

function inApprovedCache(entry: string): boolean {
  const clean = entry.replace(/\/+$/, '');
  return APPROVED_CACHE_PATHS.some((c) => clean === c || clean.startsWith(`${c}/`));
}

export interface RepoVerification {
  pass: boolean;
  failures: CheckFailure[];
}

/**
 * Compares the current repository state with the stored baseline.
 * Known limitation: writes inside directories that were already ignored at
 * baseline time are not detected (ls-files --directory collapses them).
 */
export function verifyRepoUnchanged(checkout: string, root: string, gitImpl?: GitFn): RepoVerification {
  const failures: CheckFailure[] = [];
  let baseline: RepoSnapshot;
  try {
    baseline = JSON.parse(fs.readFileSync(runnerCorePath(root, REPO_SNAPSHOT_FILE), 'utf8')) as RepoSnapshot;
  } catch {
    return { pass: false, failures: [{ code: 'repo_baseline_missing' }] };
  }
  let now: RepoSnapshot;
  try {
    now = takeRepoSnapshot(checkout, gitImpl ?? defaultGit(checkout));
  } catch {
    return { pass: false, failures: [{ code: 'repo_state_indeterminate' }] };
  }
  if (now.head !== baseline.head) failures.push({ code: 'repo_head_changed' });
  if (now.diffSha256 !== baseline.diffSha256) failures.push({ code: 'repo_tracked_modified' });
  for (const u of now.untracked) if (!baseline.untracked.includes(u)) failures.push({ code: 'repo_untracked_added', detail: u });
  for (const i of now.ignored) {
    if (!baseline.ignored.includes(i) && !inApprovedCache(i)) failures.push({ code: 'repo_ignored_outside_cache', detail: i });
  }
  return { pass: failures.length === 0, failures };
}

// ---------------------------------------------------------------------------
// Process classification (pure)
// ---------------------------------------------------------------------------

export interface ProcessObservation {
  pid: number;
  environReadable: boolean;
  runIdMatch: boolean;
  home: string | null;
  sid: number | null;
  starttime: number | null;
}

export interface ClassifyContext {
  root: string;
  registeredSids: readonly number[];
  runStartTicks: number;
}

export type Classification =
  | { kind: 'eligible'; pid: number; starttime: number }
  | { kind: 'ambiguous'; pid: number; reason: string }
  | { kind: 'ignore'; pid: number };

export function classifyProcess(o: ProcessObservation, ctx: ClassifyContext): Classification {
  const tokenMatch = o.environReadable && o.runIdMatch;
  const sidRegistered = o.sid !== null && ctx.registeredSids.includes(o.sid);
  if (tokenMatch) {
    if (!sidRegistered) return { kind: 'ambiguous', pid: o.pid, reason: 'token_sid_unregistered' };
    if (o.home !== rootHome(ctx.root)) return { kind: 'ambiguous', pid: o.pid, reason: 'token_home_mismatch' };
    if (o.starttime === null || o.starttime < ctx.runStartTicks) {
      return { kind: 'ambiguous', pid: o.pid, reason: 'token_starttime_before_run' };
    }
    return { kind: 'eligible', pid: o.pid, starttime: o.starttime };
  }
  if (sidRegistered) {
    return { kind: 'ambiguous', pid: o.pid, reason: o.environReadable ? 'sid_registered_no_token' : 'sid_registered_environ_unreadable' };
  }
  return { kind: 'ignore', pid: o.pid };
}

export function classifyProcesses(observations: ProcessObservation[], ctx: ClassifyContext): Classification[] {
  return observations.map((o) => classifyProcess(o, ctx));
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

export interface ProcReader {
  listPids(): number[];
  readStat(pid: number): ProcStat | null;
  readEnviron(pid: number): EnvironSubset | null;
}

export function procReader(procRoot = '/proc'): ProcReader {
  return {
    listPids: () => listPids(procRoot),
    readStat: (pid) => {
      try {
        return readProcStat(procRoot, pid);
      } catch {
        return null;
      }
    },
    readEnviron: (pid) => readEnvironSubset(procRoot, pid),
  };
}

export type KillFn = (pid: number, signal: NodeJS.Signals) => void;

export interface TeardownOptions {
  root: string;
  runId: string;
  procRoot?: string;
  proc?: ProcReader;
  killImpl?: KillFn;
  graceMs?: number;
  ports?: readonly number[];
  selfPid?: number;
}

export interface TeardownResult {
  pass: boolean;
  terminated: number[];
  ambiguous: Array<{ pid: number; reason: string }>;
  skippedReused: number[];
  failures: CheckFailure[];
}

function isAlive(proc: ProcReader, pid: number, starttime: number): boolean {
  const st = proc.readStat(pid);
  return st !== null && st.starttime === starttime && st.state !== 'Z' && st.state !== 'X';
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export function observeProcesses(proc: ProcReader, runId: string, selfPid: number): ProcessObservation[] {
  const out: ProcessObservation[] = [];
  for (const pid of proc.listPids()) {
    if (pid === selfPid) continue;
    const stat = proc.readStat(pid);
    if (!stat || stat.state === 'Z' || stat.state === 'X') continue;
    const env = proc.readEnviron(pid);
    if (env === null) continue;
    out.push({
      pid,
      environReadable: env.readable,
      runIdMatch: env.readable && env.runId === runId,
      home: env.readable ? env.home : null,
      sid: stat.session,
      starttime: stat.starttime,
    });
  }
  return out;
}

export async function teardownRun(o: TeardownOptions): Promise<TeardownResult> {
  const proc = o.proc ?? procReader(o.procRoot ?? '/proc');
  const kill: KillFn = o.killImpl ?? ((pid, sig) => process.kill(pid, sig));
  const graceMs = o.graceMs ?? 3000;
  const failures: CheckFailure[] = [];
  const terminated: number[] = [];
  const skippedReused: number[] = [];

  let registry: ProcessRegistry;
  try {
    registry = JSON.parse(fs.readFileSync(runnerCorePath(o.root, PROCESSES_FILE), 'utf8')) as ProcessRegistry;
  } catch {
    return { pass: false, terminated, ambiguous: [], skippedReused, failures: [{ code: 'process_registry_missing' }] };
  }
  if (registry.runId !== o.runId) {
    return { pass: false, terminated, ambiguous: [], skippedReused, failures: [{ code: 'process_registry_run_mismatch' }] };
  }

  const ctx: ClassifyContext = {
    root: o.root,
    registeredSids: registry.processes.map((p) => p.sid),
    runStartTicks: registry.runStartTicks,
  };
  const classified = classifyProcesses(observeProcesses(proc, o.runId, o.selfPid ?? process.pid), ctx);
  const eligible = classified.filter((c): c is Extract<Classification, { kind: 'eligible' }> => c.kind === 'eligible');
  const ambiguous = classified
    .filter((c): c is Extract<Classification, { kind: 'ambiguous' }> => c.kind === 'ambiguous')
    .map((c) => ({ pid: c.pid, reason: c.reason }));
  for (const a of ambiguous) failures.push({ code: 'ambiguous_process', detail: `${a.pid}:${a.reason}` });

  const signalIfSame = (pid: number, starttime: number, sig: NodeJS.Signals): boolean => {
    const st = proc.readStat(pid);
    if (!st || st.starttime !== starttime) {
      if (!skippedReused.includes(pid)) skippedReused.push(pid);
      return false;
    }
    try {
      kill(pid, sig);
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ESRCH') failures.push({ code: 'signal_failed', detail: `${pid}:${sig}` });
      return false;
    }
  };

  for (const e of eligible) if (signalIfSame(e.pid, e.starttime, 'SIGTERM')) terminated.push(e.pid);

  const waitGone = async (ms: number): Promise<void> => {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline && eligible.some((e) => isAlive(proc, e.pid, e.starttime))) await sleep(50);
  };
  await waitGone(graceMs);

  for (const e of eligible) {
    if (isAlive(proc, e.pid, e.starttime)) signalIfSame(e.pid, e.starttime, 'SIGKILL');
  }
  await waitGone(Math.max(500, Math.floor(graceMs / 2)));

  for (const e of eligible) if (isAlive(proc, e.pid, e.starttime)) failures.push({ code: 'process_survived', detail: String(e.pid) });

  if (o.ports && o.ports.length > 0) {
    try {
      const inspection = inspectPorts(o.ports, o.procRoot ?? '/proc');
      for (const p of inspection.ports) {
        if (!p.ipv4Inspected || !p.ipv6Inspected) failures.push({ code: 'port_indeterminate', detail: String(p.port) });
        else if (p.listeners.length > 0) failures.push({ code: 'port_still_occupied', detail: String(p.port) });
      }
    } catch {
      failures.push({ code: 'ports_indeterminate' });
    }
  }

  return { pass: failures.length === 0, terminated, ambiguous, skippedReused, failures };
}
