import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  ROOT_DIRS,
  assembleIsolatedRoot,
  assertEmptyNewRoot,
  readCreatedPaths,
  recordCreatedPath,
  runnerCorePath,
} from '../../src/runner-core/isolated-root-assembler';

// The VM's tmpdir may sit inside its own home, so tests pass a fictitious real home.
const FAKE_REAL_HOME = '/nonexistent-real-home-for-runner-core-tests';
const FAKE_CHECKOUT = '/nonexistent-checkout-for-runner-core-tests';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function parent(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rc-asm-'));
}

function cleanup(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // temp only
  }
}

function walk(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    out.push(path.relative(base, full));
    if (e.isDirectory()) out.push(...walk(full, base));
  }
  return out.sort();
}

test('assembles a fresh 0700 root with only the approved skeleton', () => {
  const p = parent();
  try {
    const r = assembleIsolatedRoot({ parentDir: p, realHome: FAKE_REAL_HOME, checkout: FAKE_CHECKOUT });
    assert.ok(r.root.startsWith(fs.realpathSync(p) + path.sep));
    assert.match(path.basename(r.root), /^rc-/);
    assert.equal(fs.statSync(r.root).mode & 0o777, 0o700);
    assert.match(r.runId, UUID_RE);
    const expected = [...ROOT_DIRS, '.runner-core/created-paths.json', '.runner-core/processes.json'].sort();
    assert.deepEqual(walk(r.root), expected);
    for (const d of ROOT_DIRS) assert.equal(fs.statSync(path.join(r.root, d)).mode & 0o777, 0o700, d);
    assert.ok(!walk(r.root).some((x) => /BloomNucleus|nucleus\.json|^bin|config\//.test(x)));
  } finally {
    cleanup(p);
  }
});

test('records created paths and the initial process registry', () => {
  const p = parent();
  try {
    const r = assembleIsolatedRoot({ parentDir: p, realHome: FAKE_REAL_HOME, checkout: FAKE_CHECKOUT });
    const m = readCreatedPaths(r.root);
    assert.equal(m.runId, r.runId);
    assert.equal(m.root, r.root);
    assert.deepEqual(m.paths, r.createdPaths);
    assert.ok(m.paths.every((x) => x === r.root || x.startsWith(r.root + path.sep)));
    assert.equal(m.harnessPid, process.pid);
    assert.equal(m.runStartTicks, r.runStartTicks);
    const reg = JSON.parse(fs.readFileSync(runnerCorePath(r.root, 'processes.json'), 'utf8'));
    assert.equal(reg.runId, r.runId);
    assert.deepEqual(reg.processes, []);
    assert.equal(typeof reg.harnessSid, 'number');
  } finally {
    cleanup(p);
  }
});

test('never reuses a root: each call yields a new root and run id', () => {
  const p = parent();
  try {
    const a = assembleIsolatedRoot({ parentDir: p, realHome: FAKE_REAL_HOME, checkout: FAKE_CHECKOUT });
    const b = assembleIsolatedRoot({ parentDir: p, realHome: FAKE_REAL_HOME, checkout: FAKE_CHECKOUT });
    assert.notEqual(a.root, b.root);
    assert.notEqual(a.runId, b.runId);
    assert.throws(() => assertEmptyNewRoot(a.root), /root_not_empty/);
    assert.throws(
      () => fs.writeFileSync(a.manifestPath, '{}', { flag: 'wx' }),
      (e: NodeJS.ErrnoException) => e.code === 'EEXIST',
    );
  } finally {
    cleanup(p);
  }
});

test('rejects a parent inside the real home or overlapping the checkout or forbidden paths', () => {
  const p = parent();
  try {
    const real = fs.realpathSync(p);
    assert.throws(() => assembleIsolatedRoot({ parentDir: p, realHome: real, checkout: FAKE_CHECKOUT }), /parent_in_real_home/);
    assert.throws(() => assembleIsolatedRoot({ parentDir: p, realHome: path.join(real, 'sub'), checkout: FAKE_CHECKOUT }), /parent_in_real_home/);
    assert.throws(() => assembleIsolatedRoot({ parentDir: p, realHome: FAKE_REAL_HOME, checkout: real }), /parent_overlaps_checkout/);
    assert.throws(() => assembleIsolatedRoot({ parentDir: 'relative', realHome: FAKE_REAL_HOME, checkout: FAKE_CHECKOUT }), /not_absolute/);
    assert.deepEqual(fs.readdirSync(p), [], 'nothing created on rejection');
  } finally {
    cleanup(p);
  }
});

test('recordCreatedPath refuses paths outside R', () => {
  const p = parent();
  try {
    const r = assembleIsolatedRoot({ parentDir: p, realHome: FAKE_REAL_HOME, checkout: FAKE_CHECKOUT });
    assert.throws(() => recordCreatedPath(r.root, '/etc/passwd'), /created_path_outside_root/);
    assert.throws(() => recordCreatedPath(r.root, path.join(r.root, '..', 'x')), /created_path_outside_root/);
    const inside = path.join(r.root, 'dbus', 'session.conf');
    recordCreatedPath(r.root, inside);
    assert.ok(readCreatedPaths(r.root).paths.includes(inside));
  } finally {
    cleanup(p);
  }
});

test('uses an injected /proc/self/stat for the run start', () => {
  const p = parent();
  try {
    const rest = new Array(50).fill('0');
    rest[0] = 'R';
    rest[3] = '777';
    rest[19] = '123456';
    const r = assembleIsolatedRoot({ parentDir: p, realHome: FAKE_REAL_HOME, checkout: FAKE_CHECKOUT, selfStatText: `4321 (node) ${rest.join(' ')}` });
    assert.equal(r.runStartTicks, 123456);
    const reg = JSON.parse(fs.readFileSync(runnerCorePath(r.root, 'processes.json'), 'utf8'));
    assert.equal(reg.harnessSid, 777);
    assert.equal(reg.harnessPid, 4321);
  } finally {
    cleanup(p);
  }
});
