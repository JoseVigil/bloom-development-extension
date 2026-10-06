import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EnvironSubset, ProcStat, RUN_ID_VAR } from '../../src/runner-core/isolation-preflight';
import { assembleIsolatedRoot, runnerCorePath } from '../../src/runner-core/isolated-root-assembler';
import { registerProcess } from '../../src/runner-core/isolated-launcher';
import {
  APPROVED_CACHE_PATHS,
  ClassifyContext,
  GitFn,
  ProcReader,
  ProcessObservation,
  captureRepoBaseline,
  classifyProcess,
  teardownRun,
  verifyRepoUnchanged,
} from '../../src/runner-core/run-teardown';

const FAKE_REAL_HOME = '/nonexistent-real-home-for-runner-core-tests';
const FAKE_CHECKOUT = '/nonexistent-checkout-for-runner-core-tests';

function cleanup(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // temp only
  }
}

function newRoot(selfStatText?: string) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-td-'));
  const r = assembleIsolatedRoot({ parentDir: base, realHome: FAKE_REAL_HOME, checkout: FAKE_CHECKOUT, selfStatText });
  return { base, ...r };
}

function statLine(pid: number, session: number, starttime: number): string {
  const rest = new Array(50).fill('0');
  rest[0] = 'S';
  rest[2] = String(pid);
  rest[3] = String(session);
  rest[19] = String(starttime);
  return `${pid} (x) ${rest.join(' ')}`;
}

// --- classification (pure) ---------------------------------------------------------------

test('classifyProcess: eligibility requires token, HOME, registered SID and starttime', () => {
  const ctx: ClassifyContext = { root: '/r', registeredSids: [10], runStartTicks: 1000 };
  const ok: ProcessObservation = { pid: 1, environReadable: true, runIdMatch: true, home: '/r/home', sid: 10, starttime: 1500 };
  assert.equal(classifyProcess(ok, ctx).kind, 'eligible');
  const cases: Array<[Partial<ProcessObservation>, string, string?]> = [
    [{ sid: 11 }, 'ambiguous', 'token_sid_unregistered'],
    [{ home: '/home/u' }, 'ambiguous', 'token_home_mismatch'],
    [{ starttime: 999 }, 'ambiguous', 'token_starttime_before_run'],
    [{ runIdMatch: false }, 'ambiguous', 'sid_registered_no_token'],
    [{ environReadable: false, runIdMatch: false, home: null }, 'ambiguous', 'sid_registered_environ_unreadable'],
    [{ runIdMatch: false, sid: 11 }, 'ignore'],
    [{ environReadable: false, runIdMatch: false, home: null, sid: 11 }, 'ignore'],
  ];
  for (const [patch, kind, reason] of cases) {
    const c = classifyProcess({ ...ok, ...patch }, ctx);
    assert.equal(c.kind, kind, JSON.stringify(patch));
    if (reason) assert.equal((c as { reason: string }).reason, reason);
  }
});

// --- teardown with a synthetic proc reader -----------------------------------------------

interface SynProc {
  stat: ProcStat;
  env: EnvironSubset;
  alive: boolean;
}

function synReader(procs: Map<number, SynProc>, onStat?: (pid: number, n: number) => ProcStat | undefined): ProcReader {
  const counts = new Map<number, number>();
  return {
    listPids: () => Array.from(procs.keys()),
    readStat: (pid) => {
      const p = procs.get(pid);
      if (!p || !p.alive) return null;
      const n = (counts.get(pid) ?? 0) + 1;
      counts.set(pid, n);
      return onStat?.(pid, n) ?? p.stat;
    },
    readEnviron: (pid) => {
      const p = procs.get(pid);
      return p && p.alive ? p.env : null;
    },
  };
}

function synProc(pid: number, session: number, starttime: number, env: EnvironSubset): SynProc {
  return { stat: { pid, comm: 'x', state: 'S', ppid: 1, pgrp: pid, session, starttime }, env, alive: true };
}

test('teardown: kills every eligible process even with ambiguous ones present; ambiguous untouched; FAIL', async () => {
  const r = newRoot(statLine(100, 100, 1000));
  try {
    const home = path.join(r.root, 'home');
    const reg = JSON.parse(fs.readFileSync(runnerCorePath(r.root, 'processes.json'), 'utf8'));
    reg.processes.push({ role: 'a', pid: 201, sid: 201, pgid: 201, starttime: 2000, startedAt: '' });
    reg.processes.push({ role: 'b', pid: 202, sid: 202, pgid: 202, starttime: 2000, startedAt: '' });
    fs.writeFileSync(runnerCorePath(r.root, 'processes.json'), JSON.stringify(reg));
    const tok = { readable: true, runId: r.runId, home };
    const procs = new Map<number, SynProc>([
      [201, synProc(201, 201, 2000, tok)], // eligible
      [203, synProc(203, 202, 2100, tok)], // eligible (child in registered session 202)
      [301, synProc(301, 999, 2000, tok)], // token, unregistered SID -> ambiguous
      [302, synProc(302, 202, 2000, { readable: true, runId: null, home: '/home/u' })], // registered SID, no token -> ambiguous
      [400, synProc(400, 400, 10, { readable: true, runId: null, home: '/home/u' })], // unrelated
    ]);
    const signals: Array<[number, string]> = [];
    const res = await teardownRun({
      root: r.root,
      runId: r.runId,
      proc: synReader(procs),
      killImpl: (pid, sig) => {
        signals.push([pid, sig]);
        procs.get(pid)!.alive = false;
      },
      graceMs: 100,
      selfPid: 1,
    });
    assert.deepEqual(signals.sort(), [
      [201, 'SIGTERM'],
      [203, 'SIGTERM'],
    ]);
    assert.deepEqual(res.terminated.sort(), [201, 203]);
    assert.deepEqual(res.ambiguous.map((a) => a.pid).sort(), [301, 302]);
    assert.equal(res.pass, false);
    assert.ok(procs.get(301)!.alive && procs.get(302)!.alive && procs.get(400)!.alive);
  } finally {
    cleanup(r.base);
  }
});

test('teardown: escalates to SIGKILL per PID after the grace period', async () => {
  const r = newRoot(statLine(100, 100, 1000));
  try {
    const reg = JSON.parse(fs.readFileSync(runnerCorePath(r.root, 'processes.json'), 'utf8'));
    reg.processes.push({ role: 'a', pid: 201, sid: 201, pgid: 201, starttime: 2000, startedAt: '' });
    fs.writeFileSync(runnerCorePath(r.root, 'processes.json'), JSON.stringify(reg));
    const procs = new Map([[201, synProc(201, 201, 2000, { readable: true, runId: r.runId, home: path.join(r.root, 'home') })]]);
    const signals: string[] = [];
    const res = await teardownRun({
      root: r.root,
      runId: r.runId,
      proc: synReader(procs),
      killImpl: (pid, sig) => {
        assert.ok(pid > 0, 'never a process group');
        signals.push(sig);
        if (sig === 'SIGKILL') procs.get(pid)!.alive = false;
      },
      graceMs: 100,
      selfPid: 1,
    });
    assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']);
    assert.equal(res.pass, true);
  } finally {
    cleanup(r.base);
  }
});

test('teardown: PID reuse (starttime changed before signal) is never signalled', async () => {
  const r = newRoot(statLine(100, 100, 1000));
  try {
    const reg = JSON.parse(fs.readFileSync(runnerCorePath(r.root, 'processes.json'), 'utf8'));
    reg.processes.push({ role: 'a', pid: 201, sid: 201, pgid: 201, starttime: 2000, startedAt: '' });
    fs.writeFileSync(runnerCorePath(r.root, 'processes.json'), JSON.stringify(reg));
    const procs = new Map([[201, synProc(201, 201, 2000, { readable: true, runId: r.runId, home: path.join(r.root, 'home') })]]);
    // First read (observation) sees the original; the re-read before the signal sees a new process.
    const reader = synReader(procs, (pid, n) => (n >= 2 ? { ...procs.get(pid)!.stat, starttime: 9999 } : undefined));
    const signals: number[] = [];
    const res = await teardownRun({ root: r.root, runId: r.runId, proc: reader, killImpl: (pid) => signals.push(pid), graceMs: 100, selfPid: 1 });
    assert.deepEqual(signals, []);
    assert.deepEqual(res.skippedReused, [201]);
  } finally {
    cleanup(r.base);
  }
});

test('teardown: missing registry or run mismatch FAIL without signals', async () => {
  const r = newRoot(statLine(100, 100, 1000));
  try {
    const signals: number[] = [];
    const proc = synReader(new Map());
    const mismatch = await teardownRun({ root: r.root, runId: '00000000-0000-4000-8000-000000000000', proc, killImpl: (p) => signals.push(p) });
    assert.deepEqual(mismatch.failures, [{ code: 'process_registry_run_mismatch' }]);
    const missing = await teardownRun({ root: path.join(r.base, 'nope'), runId: r.runId, proc, killImpl: (p) => signals.push(p) });
    assert.deepEqual(missing.failures, [{ code: 'process_registry_missing' }]);
    assert.deepEqual(signals, []);
  } finally {
    cleanup(r.base);
  }
});

// --- teardown with real detached processes on ephemeral ports --------------------------------

const SERVER = "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>process.stdout.write(s.address().port+'\\n'));setInterval(()=>{},1000);";

function startServer(env: Record<string, string>): Promise<{ child: ChildProcess; pid: number; port: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', SERVER], { detached: true, env, stdio: ['ignore', 'pipe', 'ignore'] });
    let buf = '';
    child.once('error', reject);
    child.stdout!.on('data', (c) => {
      buf += c.toString();
      if (buf.includes('\n')) resolve({ child, pid: child.pid!, port: Number(buf.trim()) });
    });
  });
}

function alive(pid: number): boolean {
  try {
    const st = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const state = st.slice(st.lastIndexOf(')') + 2, st.lastIndexOf(')') + 3);
    return state !== 'Z' && state !== 'X';
  } catch {
    return false;
  }
}

test('teardown (real): eligible server killed; token+unregistered SID and control survive; FAIL', { skip: process.platform !== 'linux' }, async () => {
  const r = newRoot();
  const spawned: number[] = [];
  try {
    const home = path.join(r.root, 'home');
    const eligible = await startServer({ [RUN_ID_VAR]: r.runId, HOME: home });
    spawned.push(eligible.pid);
    registerProcess(r.root, 'eligible-server', eligible.pid);
    const unregistered = await startServer({ [RUN_ID_VAR]: r.runId, HOME: home });
    spawned.push(unregistered.pid);
    const control = await startServer({ HOME: home });
    spawned.push(control.pid);

    const res = await teardownRun({ root: r.root, runId: r.runId, graceMs: 2000, ports: [eligible.port, unregistered.port, control.port] });

    assert.deepEqual(res.terminated, [eligible.pid]);
    assert.equal(alive(eligible.pid), false);
    assert.equal(alive(unregistered.pid), true);
    assert.equal(alive(control.pid), true);
    assert.equal(res.pass, false);
    assert.deepEqual(res.ambiguous, [{ pid: unregistered.pid, reason: 'token_sid_unregistered' }]);
    const codes = res.failures.map((f) => `${f.code}:${f.detail ?? ''}`);
    assert.ok(!codes.includes(`port_still_occupied:${eligible.port}`));
    assert.ok(codes.includes(`port_still_occupied:${unregistered.port}`));
    assert.ok(codes.includes(`port_still_occupied:${control.port}`));
  } finally {
    for (const pid of spawned) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // already gone
      }
    }
    cleanup(r.base);
  }
});

// --- repository verification (fake git, no git mutations anywhere) ---------------------------

interface RepoState {
  head: string;
  diff: string;
  untracked: string[];
  ignored: string[];
}

function fakeGit(state: RepoState, calls: string[][]): GitFn {
  return (args) => {
    calls.push(args);
    switch (args[0]) {
      case 'rev-parse':
        return `${state.head}\n`;
      case 'diff':
        return state.diff;
      case 'ls-files':
        return (args.includes('--ignored') ? state.ignored : state.untracked).join('\n') + '\n';
      default:
        throw new Error(`unexpected git ${args[0]}`);
    }
  };
}

test('repo verification: unchanged, tracked change, untracked, ignored in and out of approved caches', () => {
  const r = newRoot();
  const checkout = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-co-'));
  try {
    const state: RepoState = { head: 'abc', diff: '', untracked: ['notes.txt'], ignored: ['node_modules/'] };
    const calls: string[][] = [];
    const git = fakeGit(state, calls);
    const snap = captureRepoBaseline(checkout, r.root, git);
    assert.equal(snap.head, 'abc');
    assert.deepEqual(Object.keys(snap.approvedCaches), [...APPROVED_CACHE_PATHS]);
    assert.throws(() => captureRepoBaseline(checkout, r.root, git), (e: NodeJS.ErrnoException) => e.code === 'EEXIST');

    assert.deepEqual(verifyRepoUnchanged(checkout, r.root, git), { pass: true, failures: [] });

    state.ignored = ['node_modules/', 'webview/app/.svelte-kit/', 'webview/app/node_modules/.vite/deps/'];
    assert.equal(verifyRepoUnchanged(checkout, r.root, git).pass, true, 'approved caches tolerated');

    state.ignored.push('dist/');
    assert.deepEqual(verifyRepoUnchanged(checkout, r.root, git).failures, [{ code: 'repo_ignored_outside_cache', detail: 'dist/' }]);
    state.ignored.pop();

    state.untracked = ['notes.txt', 'new-file.ts'];
    assert.deepEqual(verifyRepoUnchanged(checkout, r.root, git).failures, [{ code: 'repo_untracked_added', detail: 'new-file.ts' }]);
    state.untracked = ['notes.txt'];

    state.diff = 'diff --git a/x b/x\n';
    assert.deepEqual(verifyRepoUnchanged(checkout, r.root, git).failures, [{ code: 'repo_tracked_modified' }]);
    state.diff = '';

    state.head = 'def';
    assert.deepEqual(verifyRepoUnchanged(checkout, r.root, git).failures, [{ code: 'repo_head_changed' }]);

    const failing: GitFn = () => {
      throw new Error('git unavailable');
    };
    assert.deepEqual(verifyRepoUnchanged(checkout, r.root, failing).failures, [{ code: 'repo_state_indeterminate' }]);
    assert.deepEqual(verifyRepoUnchanged(checkout, path.join(r.base, 'nope'), git).failures, [{ code: 'repo_baseline_missing' }]);

    // Only read-only subcommands are ever requested.
    assert.ok(calls.every((c) => ['rev-parse', 'diff', 'ls-files'].includes(c[0])));
  } finally {
    cleanup(r.base);
    cleanup(checkout);
  }
});

test('repo verification: default git runner is read-only and lock-free (static check)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'runner-core', 'run-teardown.ts'), 'utf8');
  assert.ok(src.includes("'--no-optional-locks'"));
  assert.ok(src.includes("GIT_OPTIONAL_LOCKS: '0'"));
  for (const verb of ['add', 'commit', 'checkout', 'reset', 'stash', 'clean', 'update-index', 'gc']) {
    assert.ok(!new RegExp(`\\[\\s*'${verb}'`).test(src), verb);
  }
});
