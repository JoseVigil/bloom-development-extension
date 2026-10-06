import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { PassThrough } from 'stream';
import type { ChildProcess, SpawnOptions } from 'child_process';
import { CHILD_ENV_ALLOWLIST, PreflightResult, RUN_ID_VAR } from '../../src/runner-core/isolation-preflight';
import { assembleIsolatedRoot, readCreatedPaths } from '../../src/runner-core/isolated-root-assembler';
import {
  LaunchRequest,
  PhaseCFailedError,
  VerifiedBus,
  VerifiedDisplay,
  XVFB_ARGS,
  buildChildEnv,
  launchConductorIsolated,
  privateBusConfig,
  readRegistry,
  startPrivateBus,
  startPrivateDisplay,
  verifySecretServiceAbsent,
  writePrivateBusConfig,
} from '../../src/runner-core/isolated-launcher';

const FAKE_REAL_HOME = '/nonexistent-real-home-for-runner-core-tests';
const FAKE_CHECKOUT = '/nonexistent-checkout-for-runner-core-tests';

function statLine(pid: number, session: number, starttime: number): string {
  const rest = new Array(50).fill('0');
  rest[0] = 'S';
  rest[2] = String(pid);
  rest[3] = String(session);
  rest[19] = String(starttime);
  return `${pid} (fake) ${rest.join(' ')}\n`;
}

interface Fixture {
  base: string;
  root: string;
  runId: string;
  procRoot: string;
  addProc(pid: number, session?: number, starttime?: number): void;
}

function fixture(): Fixture {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-lch-'));
  const r = assembleIsolatedRoot({
    parentDir: base,
    realHome: FAKE_REAL_HOME,
    checkout: FAKE_CHECKOUT,
    selfStatText: statLine(100, 100, 1000),
  });
  const procRoot = path.join(base, 'proc');
  fs.mkdirSync(procRoot);
  return {
    base,
    root: r.root,
    runId: r.runId,
    procRoot,
    addProc(pid, session = pid, starttime = 2000) {
      fs.mkdirSync(path.join(procRoot, String(pid)), { recursive: true });
      fs.writeFileSync(path.join(procRoot, String(pid), 'stat'), statLine(pid, session, starttime));
    },
  };
}

function cleanup(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // temp only
  }
}

interface SpawnCall {
  command: string;
  args: readonly string[];
  options: SpawnOptions;
}

function fakeSpawn(pid: number, calls: SpawnCall[], emit: (child: EventEmitter & { stdout: PassThrough; stdio: unknown[] }) => void) {
  return (command: string, args: readonly string[], options: SpawnOptions): ChildProcess => {
    calls.push({ command, args, options });
    const child = Object.assign(new EventEmitter(), {
      pid,
      stdout: new PassThrough(),
      stdio: [null, null, null, new PassThrough()] as unknown[],
      unref() {},
    });
    child.stdio[1] = child.stdout;
    setImmediate(() => {
      child.emit('spawn');
      emit(child);
    });
    return child as unknown as ChildProcess;
  };
}

const BUS = (root: string): VerifiedBus => ({ address: `unix:path=${root}/run/bus,guid=abc`, pid: 1, verified: true });
const DISPLAY: VerifiedDisplay = { display: ':99', pid: 2, verified: true };

// --- child env -----------------------------------------------------------------------------

test('buildChildEnv: keys are exactly the allowlist and values come from R', () => {
  const f = fixture();
  try {
    const env = buildChildEnv({ root: f.root, runId: f.runId, bus: BUS(f.root), display: DISPLAY, bloomBinDirs: [path.join(f.root, 'bin')], trustedToolDirs: ['/usr/bin', '/bin'] });
    assert.deepEqual(Object.keys(env).sort(), [...CHILD_ENV_ALLOWLIST].sort());
    assert.equal(env.HOME, path.join(f.root, 'home'));
    assert.equal(env.XDG_DATA_HOME, path.join(f.root, 'home', '.local', 'share'));
    assert.equal(env.XDG_RUNTIME_DIR, path.join(f.root, 'run'));
    assert.equal(env.TMPDIR, path.join(f.root, 'tmp'));
    assert.equal(env.PATH, `${path.join(f.root, 'bin')}:/usr/bin:/bin`);
    assert.equal(env.DISPLAY, ':99');
    assert.equal(env.DBUS_SESSION_BUS_ADDRESS, BUS(f.root).address);
    assert.equal(env[RUN_ID_VAR], f.runId);
    assert.equal(env.LANG, 'C.UTF-8');
    for (const k of ['XAUTHORITY', 'WAYLAND_DISPLAY', 'NODE_OPTIONS', 'SSH_AUTH_SOCK']) assert.ok(!(k in env), k);
  } finally {
    cleanup(f.base);
  }
});

test('buildChildEnv: refuses without a verified bus and display, or with Bloom dirs outside R', () => {
  const f = fixture();
  try {
    const base = { root: f.root, runId: f.runId, bloomBinDirs: [], trustedToolDirs: ['/usr/bin'] };
    assert.throws(() => buildChildEnv({ ...base, display: DISPLAY }), /bus_not_verified/);
    assert.throws(() => buildChildEnv({ ...base, bus: { address: 'unix:path=/run/user/1000/bus', pid: 1, verified: true }, display: DISPLAY }), /bus_not_verified/);
    assert.throws(() => buildChildEnv({ ...base, bus: { ...BUS(f.root), verified: false as unknown as true }, display: DISPLAY }), /bus_not_verified/);
    assert.throws(() => buildChildEnv({ ...base, bus: BUS(f.root) }), /display_not_verified/);
    assert.throws(() => buildChildEnv({ ...base, bus: BUS(f.root), display: { display: 'localhost:0', pid: 2, verified: true } }), /display_not_verified/);
    assert.throws(() => buildChildEnv({ ...base, bus: BUS(f.root), display: DISPLAY, bloomBinDirs: ['/usr/local/bin'] }), /bloom_bin_dir_outside_root/);
    assert.throws(() => buildChildEnv({ ...base, runId: 'nope', bus: BUS(f.root), display: DISPLAY }), /run_id_invalid/);
  } finally {
    cleanup(f.base);
  }
});

// --- bus config ---------------------------------------------------------------------------

test('privateBusConfig: private socket, EXTERNAL auth, no service dirs or includes', () => {
  const conf = privateBusConfig('/var/tmp/rc-X');
  assert.ok(conf.includes('<type>session</type>'));
  assert.ok(conf.includes('<listen>unix:path=/var/tmp/rc-X/run/bus</listen>'));
  assert.ok(conf.includes('<auth>EXTERNAL</auth>'));
  for (const bad of ['servicedir', 'standard_session_servicedirs', 'includedir', '<include', 'tcp:', 'ANONYMOUS']) {
    assert.ok(!conf.includes(bad), bad);
  }
});

test('writePrivateBusConfig: exclusive create inside R and recorded', () => {
  const f = fixture();
  try {
    const p = writePrivateBusConfig(f.root);
    assert.equal(p, path.join(f.root, 'dbus', 'session.conf'));
    assert.equal(fs.statSync(p).mode & 0o777, 0o600);
    assert.ok(readCreatedPaths(f.root).paths.includes(p));
    assert.throws(() => writePrivateBusConfig(f.root), (e: NodeJS.ErrnoException) => e.code === 'EEXIST');
  } finally {
    cleanup(f.base);
  }
});

// --- daemons (injected spawn) -----------------------------------------------------------------

test('startPrivateBus: spawn shape, minimal env, registration, bad address rejected', async () => {
  const f = fixture();
  try {
    writePrivateBusConfig(f.root);
    f.addProc(5001);
    const calls: SpawnCall[] = [];
    const spawnImpl = fakeSpawn(5001, calls, (c) => c.stdout.write('unix:path=/run/user/1000/bus,guid=1\n'));
    await assert.rejects(startPrivateBus({ root: f.root, runId: f.runId, binaryPath: '/usr/bin/dbus-daemon', spawnImpl, procRoot: f.procRoot }), /bus_address_unexpected/);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].args, [`--config-file=${path.join(f.root, 'dbus', 'session.conf')}`, '--nofork', '--print-address=1']);
    assert.equal(calls[0].options.detached, true);
    assert.deepEqual(Object.keys(calls[0].options.env as object).sort(), ['HOME', RUN_ID_VAR, 'TMPDIR', 'XDG_RUNTIME_DIR'].sort());
    assert.equal((calls[0].options.env as Record<string, string>)[RUN_ID_VAR], f.runId);
    const reg = readRegistry(f.root);
    assert.deepEqual(reg.processes.map((p) => [p.role, p.pid, p.sid, p.starttime]), [['dbus-daemon', 5001, 5001, 2000]]);
  } finally {
    cleanup(f.base);
  }
});

test('startPrivateBus: accepts the R socket owned by this uid', async () => {
  const f = fixture();
  const server = net.createServer();
  try {
    writePrivateBusConfig(f.root);
    await new Promise<void>((resolve) => server.listen(path.join(f.root, 'run', 'bus'), () => resolve()));
    f.addProc(5002);
    const address = `unix:path=${path.join(f.root, 'run', 'bus')},guid=0123`;
    const bus = await startPrivateBus({
      root: f.root,
      runId: f.runId,
      binaryPath: '/usr/bin/dbus-daemon',
      spawnImpl: fakeSpawn(5002, [], (c) => c.stdout.write(`${address}\n`)),
      procRoot: f.procRoot,
    });
    assert.deepEqual(bus, { address, pid: 5002, verified: true });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    cleanup(f.base);
  }
});

test('startPrivateBus: refuses without config and refuses a child sharing the harness session', async () => {
  const f = fixture();
  try {
    await assert.rejects(startPrivateBus({ root: f.root, runId: f.runId, binaryPath: '/x', spawnImpl: fakeSpawn(1, [], () => {}), procRoot: f.procRoot }), /bus_config_missing/);
    writePrivateBusConfig(f.root);
    f.addProc(5003, 100);
    await assert.rejects(
      startPrivateBus({ root: f.root, runId: f.runId, binaryPath: '/x', spawnImpl: fakeSpawn(5003, [], () => {}), procRoot: f.procRoot }),
      /child_shares_harness_session/,
    );
  } finally {
    cleanup(f.base);
  }
});

test('startPrivateDisplay: Xvfb args, display read from fd 3, registration', async () => {
  const f = fixture();
  try {
    f.addProc(6001);
    const calls: SpawnCall[] = [];
    const d = await startPrivateDisplay({
      root: f.root,
      runId: f.runId,
      binaryPath: '/usr/bin/Xvfb',
      spawnImpl: fakeSpawn(6001, calls, (c) => (c.stdio[3] as PassThrough).write('99\n')),
      procRoot: f.procRoot,
    });
    assert.deepEqual(d, { display: ':99', pid: 6001, verified: true });
    assert.deepEqual(calls[0].args, [...XVFB_ARGS]);
    assert.ok(calls[0].args.includes('-nolisten'));
    assert.deepEqual(calls[0].options.stdio, ['ignore', 'ignore', 'ignore', 'pipe']);
    assert.ok(!('DISPLAY' in (calls[0].options.env as object)));
    assert.ok(!('XAUTHORITY' in (calls[0].options.env as object)));
    assert.equal(readRegistry(f.root).processes[0].role, 'xvfb');
    f.addProc(6002);
    await assert.rejects(
      startPrivateDisplay({ root: f.root, runId: f.runId, binaryPath: '/usr/bin/Xvfb', spawnImpl: fakeSpawn(6002, [], (c) => (c.stdio[3] as PassThrough).write('abc\n')), procRoot: f.procRoot }),
      /display_number_invalid/,
    );
  } finally {
    cleanup(f.base);
  }
});

test('verifySecretServiceAbsent', () => {
  verifySecretServiceAbsent({ names: ['org.freedesktop.DBus'], activatable: [] });
  assert.throws(() => verifySecretServiceAbsent({ names: ['org.freedesktop.secrets'], activatable: [] }), /secret_service_present/);
  assert.throws(() => verifySecretServiceAbsent({ names: [], activatable: ['org.kde.kwalletd5'] }), /secret_service_present/);
});

// --- Conductor launch (injected) ------------------------------------------------------------------

const PASS_A: PreflightResult = { phase: 'A', pass: true, failures: [] };
const PASS_B: PreflightResult = { phase: 'B', pass: true, failures: [] };
const PASS_C: PreflightResult = { phase: 'C', pass: true, failures: [] };

function fakeCheckout(base: string): string {
  const checkout = path.join(base, 'checkout');
  const dist = path.join(checkout, 'installer', 'conductor', 'workspace', 'node_modules', 'electron', 'dist');
  fs.mkdirSync(dist, { recursive: true });
  fs.writeFileSync(path.join(dist, 'electron'), '#!/bin/sh\n', { mode: 0o755 });
  return fs.realpathSync(checkout);
}

function launchCtx(f: Fixture, checkout: string) {
  fs.mkdirSync(path.join(f.root, 'workspaces', 'acme'));
  const childEnv = buildChildEnv({ root: f.root, runId: f.runId, bus: BUS(f.root), display: DISPLAY, bloomBinDirs: [], trustedToolDirs: ['/usr/bin'] });
  return { checkout, root: f.root, runId: f.runId, childEnv, orgSlug: 'acme', procRoot: f.procRoot };
}

test('launchConductorIsolated: refuses without phase A and B PASS; launch never attempted', async () => {
  const f = fixture();
  try {
    const ctx = launchCtx(f, fakeCheckout(f.base));
    let launched = 0;
    const launchImpl = async () => {
      launched++;
      return { process: () => ({ pid: 1 }) };
    };
    const phaseC = () => PASS_C;
    const failA: PreflightResult = { phase: 'A', pass: false, failures: [{ code: 'x' }] };
    await assert.rejects(launchConductorIsolated({ ...ctx, phaseA: failA, phaseB: PASS_B, phaseC, launchImpl }), /phase_a_not_passed/);
    await assert.rejects(launchConductorIsolated({ ...ctx, phaseA: PASS_A, phaseB: { ...PASS_B, pass: false }, phaseC, launchImpl }), /phase_b_not_passed/);
    await assert.rejects(launchConductorIsolated({ ...ctx, phaseA: PASS_A, phaseB: PASS_A, phaseC, launchImpl }), /phase_b_not_passed/);
    await assert.rejects(launchConductorIsolated({ ...ctx, childEnv: { ...ctx.childEnv, NODE_OPTIONS: 'x' }, phaseA: PASS_A, phaseB: PASS_B, phaseC, launchImpl }), /child_env_not_allowlisted/);
    await assert.rejects(launchConductorIsolated({ ...ctx, orgSlug: '../escape', phaseA: PASS_A, phaseB: PASS_B, phaseC, launchImpl }), /org_slug_invalid/);
    assert.equal(launched, 0);
  } finally {
    cleanup(f.base);
  }
});

test('launchConductorIsolated: exact env, checkout electron, cwd in R, registers Electron, runs phase C', async () => {
  const f = fixture();
  try {
    const checkout = fakeCheckout(f.base);
    const ctx = launchCtx(f, checkout);
    f.addProc(7001);
    const requests: LaunchRequest[] = [];
    let sidsSeen: number[] = [];
    const out = await launchConductorIsolated({
      ...ctx,
      phaseA: PASS_A,
      phaseB: PASS_B,
      launchImpl: async (req) => {
        requests.push(req);
        return { process: () => ({ pid: 7001 }) };
      },
      phaseC: ({ registeredSids }) => {
        sidsSeen = registeredSids;
        return PASS_C;
      },
    });
    assert.equal(out.pid, 7001);
    assert.deepEqual(requests[0].env, ctx.childEnv);
    assert.equal(requests[0].executablePath, path.join(checkout, 'installer', 'conductor', 'workspace', 'node_modules', 'electron', 'dist', 'electron'));
    assert.deepEqual(requests[0].args, [path.join(checkout, 'installer', 'conductor', 'workspace'), '--no-sandbox']);
    assert.equal(requests[0].cwd, path.join(f.root, 'workspaces', 'acme'));
    assert.deepEqual(sidsSeen, [7001]);
    assert.equal(readRegistry(f.root).processes[0].role, 'electron');
  } finally {
    cleanup(f.base);
  }
});

test('launchConductorIsolated: phase C failure throws with the result', async () => {
  const f = fixture();
  try {
    const ctx = launchCtx(f, fakeCheckout(f.base));
    f.addProc(7002);
    const failC: PreflightResult = { phase: 'C', pass: false, failures: [{ code: 'port_owner_token_mismatch', detail: '5173' }] };
    await assert.rejects(
      launchConductorIsolated({ ...ctx, phaseA: PASS_A, phaseB: PASS_B, launchImpl: async () => ({ process: () => ({ pid: 7002 }) }), phaseC: () => failC }),
      (e: unknown) => e instanceof PhaseCFailedError && e.result === failC,
    );
  } finally {
    cleanup(f.base);
  }
});

test('launchConductorIsolated: electron resolving outside the checkout dist is refused', async () => {
  const f = fixture();
  try {
    const checkout = fakeCheckout(f.base);
    const exe = path.join(checkout, 'installer', 'conductor', 'workspace', 'node_modules', 'electron', 'dist', 'electron');
    fs.renameSync(exe, `${exe}.real`);
    const outside = path.join(f.base, 'outside-electron');
    fs.writeFileSync(outside, '#!/bin/sh\n', { mode: 0o755 });
    fs.symlinkSync(outside, exe);
    const ctx = launchCtx(f, checkout);
    await assert.rejects(
      launchConductorIsolated({ ...ctx, phaseA: PASS_A, phaseB: PASS_B, launchImpl: async () => ({ process: () => ({ pid: 1 }) }), phaseC: () => PASS_C }),
      /electron_outside_checkout_dist/,
    );
  } finally {
    cleanup(f.base);
  }
});
