import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import {
  IndeterminateError,
  RUN_ID_VAR,
  collectPortOwners,
  diffForbiddenStats,
  findBloomAncestors,
  inspectPorts,
  mapInodesToPids,
  parseDbusNameReply,
  parseProcNetTcp,
  parseProcStat,
  queryBusNames,
  readEnvironSubset,
  resolveTool,
  scanPathForBloomNames,
  statForbiddenPaths,
  validateIsolationEvidence,
} from '../../src/runner-core/isolation-preflight';

const HEADER =
  '  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode';

function row(sl: number, local: string, state: string, inode: number): string {
  return `   ${sl}: ${local} 00000000:0000 ${state} 00000000:00000000 00:00000000 00000000  1000        0 ${inode} 1 0000000000000000 100 0 0 10 0`;
}

function statLine(pid: number, comm: string, state: string, pgrp: number, session: number, starttime: number): string {
  const rest = new Array(50).fill('0');
  rest[0] = state;
  rest[1] = '1';
  rest[2] = String(pgrp);
  rest[3] = String(session);
  rest[19] = String(starttime);
  return `${pid} (${comm}) ${rest.join(' ')}\n`;
}

function tmp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanup(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // best effort, temp only
  }
}

// --- /proc/net/tcp parsing ---------------------------------------------------------------

test('parseProcNetTcp: IPv4 LISTEN rows, little-endian address, hex port, inode', () => {
  const text = [
    HEADER,
    row(0, '0100007F:BC57', '0A', 111), // 127.0.0.1:48215 LISTEN
    row(1, '00000000:1C41', '0A', 222), // 0.0.0.0:7233 LISTEN
    row(2, '0100007F:101C', '01', 333), // 127.0.0.1:4124 ESTABLISHED -> excluded
  ].join('\n');
  const l = parseProcNetTcp(text, 4);
  assert.deepEqual(
    l.map((x) => [x.address, x.port, x.inode]),
    [
      ['127.0.0.1', 48215, 111],
      ['0.0.0.0', 7233, 222],
    ],
  );
});

test('parseProcNetTcp: IPv6 loopback and wildcard', () => {
  const text = [
    HEADER,
    row(0, '00000000000000000000000001000000:1435', '0A', 444), // ::1:5173
    row(1, '00000000000000000000000000000000:162E', '0A', 555), // :::5678
  ].join('\n');
  const l = parseProcNetTcp(text, 6);
  assert.equal(l[0].address, '0:0:0:0:0:0:0:1');
  assert.equal(l[0].port, 5173);
  assert.equal(l[1].address, '0:0:0:0:0:0:0:0');
  assert.equal(l[1].port, 5678);
});

test('parseProcNetTcp: malformed input is indeterminate', () => {
  assert.throws(() => parseProcNetTcp('', 4), IndeterminateError);
  assert.throws(() => parseProcNetTcp(row(0, '0100007F:BC57', '0A', 1), 4), IndeterminateError);
  assert.throws(() => parseProcNetTcp(`${HEADER}\n   0: 0100007F:BC57 0A`, 4), IndeterminateError);
  assert.throws(() => parseProcNetTcp(`${HEADER}\n${row(0, 'ZZ00007F:BC57', '0A', 1)}`, 4), IndeterminateError);
  assert.throws(() => parseProcNetTcp(`${HEADER}\n${row(0, '0100007F:BC57', '0A', 1)}`, 6), IndeterminateError);
});

// --- /proc/<pid>/stat --------------------------------------------------------------------

test('parseProcStat: comm with spaces and parentheses; pgrp, session, starttime', () => {
  const s = parseProcStat(statLine(4242, 'we ird) (name', 'S', 4240, 4200, 987654));
  assert.equal(s.pid, 4242);
  assert.equal(s.comm, 'we ird) (name');
  assert.equal(s.state, 'S');
  assert.equal(s.pgrp, 4240);
  assert.equal(s.session, 4200);
  assert.equal(s.starttime, 987654);
  assert.throws(() => parseProcStat('4242 (x) S 1 2'), IndeterminateError);
  assert.throws(() => parseProcStat('garbage'), IndeterminateError);
});

test('parseProcStat: real /proc/self/stat', { skip: process.platform !== 'linux' }, () => {
  const s = parseProcStat(fs.readFileSync('/proc/self/stat', 'utf8'));
  assert.equal(s.pid, process.pid);
  assert.ok(s.starttime > 0);
});

// --- synthetic /proc ---------------------------------------------------------------------

function syntheticProc(): { root: string; run: string } {
  const root = tmp('rc-proc-');
  const run = '123e4567-e89b-42d3-a456-426614174000';
  fs.mkdirSync(path.join(root, 'net'));
  fs.writeFileSync(path.join(root, 'net', 'tcp'), [HEADER, row(0, '0100007F:BC57', '0A', 9001)].join('\n') + '\n');
  fs.writeFileSync(path.join(root, 'net', 'tcp6'), [HEADER, row(0, '00000000000000000000000001000000:101C', '0A', 9002)].join('\n') + '\n');
  // pid 4242 owns inode 9001; pid 4343 owns inode 9002
  for (const [pid, inode, envs] of [
    [4242, 9001, [`${RUN_ID_VAR}=${run}`, 'HOME=/r/home', 'SECRET_THING=do-not-return']],
    [4343, 9002, ['HOME=/other']],
  ] as const) {
    const d = path.join(root, String(pid));
    fs.mkdirSync(path.join(d, 'fd'), { recursive: true });
    fs.symlinkSync(`socket:[${inode}]`, path.join(d, 'fd', '3'));
    fs.symlinkSync('/dev/null', path.join(d, 'fd', '0'));
    fs.writeFileSync(path.join(d, 'stat'), statLine(pid, 'srv', 'S', pid, pid, 5000));
    fs.writeFileSync(path.join(d, 'environ'), envs.join('\0') + '\0');
  }
  return { root, run };
}

test('synthetic /proc: inode -> pid mapping and port inspection on both families', () => {
  const { root } = syntheticProc();
  try {
    const m = mapInodesToPids(root, new Set([9001, 9002]));
    assert.deepEqual(m.map.get(9001), [4242]);
    assert.deepEqual(m.map.get(9002), [4343]);
    const ins = inspectPorts([48215, 4124, 5173], root);
    const byPort = Object.fromEntries(ins.ports.map((p) => [p.port, p]));
    assert.equal(byPort[48215].ipv4Inspected, true);
    assert.equal(byPort[48215].ipv6Inspected, true);
    assert.deepEqual(byPort[48215].listeners[0].pids, [4242]);
    assert.equal(byPort[4124].listeners[0].family, 6);
    assert.deepEqual(byPort[4124].listeners[0].pids, [4343]);
    assert.equal(byPort[5173].listeners.length, 0);
  } finally {
    cleanup(root);
  }
});

test('synthetic /proc: environ subset returns only the token and HOME', () => {
  const { root, run } = syntheticProc();
  try {
    const e = readEnvironSubset(root, 4242);
    assert.deepEqual(e, { readable: true, runId: run, home: '/r/home' });
    assert.ok(!JSON.stringify(e).includes('do-not-return'));
    assert.equal(readEnvironSubset(root, 99999), null);
  } finally {
    cleanup(root);
  }
});

test('synthetic /proc: unreadable environ', { skip: typeof process.getuid !== 'function' || process.getuid() === 0 }, () => {
  const { root } = syntheticProc();
  try {
    fs.chmodSync(path.join(root, '4242', 'environ'), 0o000);
    assert.deepEqual(readEnvironSubset(root, 4242), { readable: false, runId: null, home: null });
  } finally {
    fs.chmodSync(path.join(root, '4242', 'environ'), 0o600);
    cleanup(root);
  }
});

test('synthetic /proc: port owners feed phase C', () => {
  const { root, run } = syntheticProc();
  try {
    const owners = collectPortOwners([48215, 4124], root, run);
    const o48215 = owners.find((o) => o.port === 48215)!;
    assert.deepEqual(o48215.owners, [{ pid: 4242, runIdMatch: true, home: '/r/home', sid: 4242 }]);
    const o4124 = owners.find((o) => o.port === 4124)!;
    assert.equal(o4124.owners[0].runIdMatch, false);
    const r = validateIsolationEvidence(
      { root: '/r', runId: run, registeredSids: [4242], portOwners: owners, coreWindowUrl: 'http://localhost:5173/', forbiddenPathsChanged: [] },
      'C',
      [48215, 4124],
    );
    assert.equal(r.pass, false);
    assert.ok(r.failures.some((f) => f.code === 'port_owner_token_mismatch' && f.detail === '4124'));
    assert.ok(!r.failures.some((f) => f.detail === '48215'));
  } finally {
    cleanup(root);
  }
});

test('synthetic /proc: missing tcp6 is uninspected and fails phase B port check', () => {
  const { root } = syntheticProc();
  try {
    fs.renameSync(path.join(root, 'net', 'tcp6'), path.join(root, 'net', 'tcp6.gone'));
    const ins = inspectPorts([5173], root);
    assert.equal(ins.ports[0].ipv4Inspected, true);
    assert.equal(ins.ports[0].ipv6Inspected, false);
    const owners = collectPortOwners([5173], root, 'x');
    assert.equal(owners[0].resolved, false);
  } finally {
    cleanup(root);
  }
});

// --- filesystem inspectors ---------------------------------------------------------------

test('findBloomAncestors detects .bloom in an ancestor and as a component', () => {
  const base = tmp('rc-anc-');
  try {
    fs.mkdirSync(path.join(base, 'a', '.bloom'), { recursive: true });
    fs.mkdirSync(path.join(base, 'a', 'b', 'c'), { recursive: true });
    const found = findBloomAncestors(path.join(base, 'a', 'b', 'c'));
    assert.ok(found.includes(path.join(base, 'a', '.bloom')));
    const clean = path.join(base, 'z');
    fs.mkdirSync(clean);
    assert.ok(!findBloomAncestors(clean).some((p) => p.startsWith(base)));
  } finally {
    cleanup(base);
  }
});

test('scanPathForBloomNames and resolveTool', () => {
  const base = tmp('rc-path-');
  try {
    const outside = path.join(base, 'outside');
    const inside = path.join(base, 'root', 'bin');
    fs.mkdirSync(outside, { recursive: true });
    fs.mkdirSync(inside, { recursive: true });
    fs.writeFileSync(path.join(outside, 'ollama'), '#!/bin/sh\n', { mode: 0o755 });
    fs.writeFileSync(path.join(inside, 'nucleus'), '#!/bin/sh\n', { mode: 0o755 });
    fs.writeFileSync(path.join(outside, 'not-exec'), 'x', { mode: 0o644 });
    const found = scanPathForBloomNames([outside, inside], path.join(base, 'root'));
    assert.deepEqual(found, [path.join(outside, 'ollama')]);
    assert.equal(resolveTool('ollama', `relative:${outside}`), fs.realpathSync(path.join(outside, 'ollama')));
    assert.equal(resolveTool('not-exec', outside), null);
    assert.equal(resolveTool('absent', outside), null);
  } finally {
    cleanup(base);
  }
});

test('statForbiddenPaths is stat-only and detects changes', () => {
  const base = tmp('rc-stat-');
  try {
    const present = path.join(base, 'present');
    const absent = path.join(base, 'absent');
    fs.mkdirSync(present);
    const before = statForbiddenPaths([present, absent]);
    assert.equal(before[absent], null);
    assert.equal(typeof before[present], 'string');
    assert.deepEqual(diffForbiddenStats(before, statForbiddenPaths([present, absent])), []);
    fs.utimesSync(present, new Date(1_000_000), new Date(2_000_000));
    fs.mkdirSync(absent);
    assert.deepEqual(diffForbiddenStats(before, statForbiddenPaths([present, absent])).sort(), [absent, present].sort());
  } finally {
    cleanup(base);
  }
});

test('queryBusNames: empty env call shape and reply parsing', () => {
  const calls: Array<{ file: string; args: string[] }> = [];
  const reply = (names: string[]): string =>
    `method return time=1.0 sender=org.freedesktop.DBus -> destination=:1.1 serial=3 reply_serial=2\n   array [\n${names
      .map((n) => `      string "${n}"`)
      .join('\n')}\n   ]\n`;
  const out = queryBusNames('unix:path=/r/run/bus', '/usr/bin/dbus-send', (file, args) => {
    calls.push({ file, args });
    return args[4].endsWith('ListNames') ? reply(['org.freedesktop.DBus', ':1.1']) : reply(['org.freedesktop.DBus']);
  });
  assert.deepEqual(out, { names: ['org.freedesktop.DBus', ':1.1'], activatable: ['org.freedesktop.DBus'] });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].args.slice(0, 4), ['--bus=unix:path=/r/run/bus', '--print-reply', '--dest=org.freedesktop.DBus', '/org/freedesktop/DBus']);
  assert.throws(() => queryBusNames('unix:path=/x', '/usr/bin/dbus-send', () => 'Error org.freedesktop.DBus.Error'), IndeterminateError);
  assert.deepEqual(parseDbusNameReply('string "a"\n  string "b.c"\n'), ['a', 'b.c']);
});

// --- real mechanics (ephemeral port, own process only) -------------------------------------

test(
  'real /proc: an ephemeral IPv4 listener is found and mapped to this pid',
  { skip: process.platform !== 'linux' || !fs.existsSync('/proc/net/tcp') },
  async () => {
    const server = net.createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    try {
      const port = (server.address() as net.AddressInfo).port;
      const ins = inspectPorts([port]);
      assert.equal(ins.ports[0].ipv4Inspected, true);
      const l = ins.ports[0].listeners.find((x) => x.family === 4);
      assert.ok(l, 'listener not found');
      assert.equal(l!.address, '127.0.0.1');
      assert.ok(l!.pids.includes(process.pid));
      const env = readEnvironSubset('/proc', process.pid);
      assert.equal(env?.readable, true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
);

test('real /proc: an ephemeral IPv6 loopback listener is found', { skip: process.platform !== 'linux' || !fs.existsSync('/proc/net/tcp6') }, async (t) => {
  const server = net.createServer();
  const ok = await new Promise<boolean>((resolve) => {
    server.once('error', () => resolve(false));
    server.listen(0, '::1', () => resolve(true));
  });
  if (!ok) {
    t.skip('IPv6 loopback unavailable in this environment');
    return;
  }
  try {
    const port = (server.address() as net.AddressInfo).port;
    const ins = inspectPorts([port]);
    const l = ins.ports[0].listeners.find((x) => x.family === 6);
    assert.ok(l, 'listener not found');
    assert.equal(l!.address, '0:0:0:0:0:0:0:1');
    assert.ok(l!.pids.includes(process.pid));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
