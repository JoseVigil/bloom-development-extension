import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'path';
import {
  CHILD_ENV_ALLOWLIST,
  PhaseBEvidence,
  PhaseCEvidence,
  REQUIRED_HOST_TOOLS,
  REQUIRED_PORTS,
  RUN_ID_VAR,
  brainFrozenBase,
  classifyInputEnvKey,
  conductorBaseLinux,
  forbiddenPaths,
  getBloomNucleusBaseLinux,
  resolveAppDataDirLinux,
  validateIsolationEvidence,
} from '../../src/runner-core/isolation-preflight';

const ROOT = '/var/tmp/rc-AbC123';
const REAL_HOME = '/home/u';
const CHECKOUT = '/home/u/repos/bloom';
const RUN = '123e4567-e89b-42d3-a456-426614174000';
const BASE = path.join(ROOT, 'home', '.local', 'share', 'BloomNucleus');
const BUS = `unix:path=${ROOT}/run/bus,guid=0123456789abcdef`;

function childEnv(): Record<string, string> {
  return {
    HOME: `${ROOT}/home`,
    XDG_DATA_HOME: `${ROOT}/home/.local/share`,
    XDG_CONFIG_HOME: `${ROOT}/home/.config`,
    XDG_CACHE_HOME: `${ROOT}/home/.cache`,
    XDG_STATE_HOME: `${ROOT}/home/.local/state`,
    XDG_RUNTIME_DIR: `${ROOT}/run`,
    TMPDIR: `${ROOT}/tmp`,
    PATH: `${BASE}/bin/nucleus:/usr/bin:/bin`,
    LANG: 'C.UTF-8',
    DISPLAY: ':99',
    DBUS_SESSION_BUS_ADDRESS: BUS,
    [RUN_ID_VAR]: RUN,
  };
}

function validB(): PhaseBEvidence {
  return {
    platform: 'linux',
    realHome: REAL_HOME,
    checkout: CHECKOUT,
    inputEnvKeys: ['PATH', 'HOME', 'LANG', 'DISPLAY', 'TERM', 'USER'],
    harnessTmpDir: '/var/tmp',
    tools: Object.fromEntries(REQUIRED_HOST_TOOLS.map((t) => [t, `/usr/bin/${t}`])),
    processUid: 1000,
    root: { path: ROOT, mode: 0o40700, uid: 1000, isSymlink: false, realpath: ROOT },
    cwd: `${ROOT}/workspaces/acme`,
    bloomAncestors: [],
    resolvedRoots: { conductor: BASE, nucleus: BASE, supervisor: BASE, brainFrozen: BASE },
    bloomBinaries: { nucleus: `${BASE}/bin/nucleus/nucleus`, brain: `${BASE}/bin/brain/brain` },
    pathEntries: [`${BASE}/bin/nucleus`, '/usr/bin', '/bin'],
    bloomNamesOnPathOutsideRoot: [],
    layout: { workspacePath: `${ROOT}/workspaces/acme`, originPath: CHECKOUT, authorityBaseUrl: 'http://127.0.0.1:48216' },
    childEnv: childEnv(),
    bus: { address: BUS, socketUid: 1000, names: ['org.freedesktop.DBus', ':1.0'], activatable: ['org.freedesktop.DBus'] },
    ports: REQUIRED_PORTS.map((port) => ({ port, ipv4Inspected: true, ipv6Inspected: true, listeners: [] })),
  };
}

function codes(r: { failures: { code: string; detail?: string }[] }): string[] {
  return r.failures.map((f) => (f.detail === undefined ? f.code : `${f.code}:${f.detail}`));
}

function expectFail(e: unknown, phase: 'A' | 'B' | 'C', code: string): void {
  const r = validateIsolationEvidence(e as PhaseBEvidence, phase);
  assert.equal(r.pass, false, `expected FAIL with ${code}`);
  assert.ok(codes(r).includes(code), `missing ${code}; got ${JSON.stringify(codes(r))}`);
}

// --- PASS cases -----------------------------------------------------------------

test('phase B: complete valid evidence passes', () => {
  const r = validateIsolationEvidence(validB(), 'B');
  assert.deepEqual(r.failures, []);
  assert.equal(r.pass, true);
});

test('phase A: complete valid evidence passes', () => {
  const b = validB();
  const r = validateIsolationEvidence(
    { platform: b.platform, realHome: b.realHome, checkout: b.checkout, inputEnvKeys: b.inputEnvKeys, harnessTmpDir: b.harnessTmpDir, tools: b.tools },
    'A',
  );
  assert.deepEqual(r.failures, []);
});

// --- missing evidence -------------------------------------------------------------

test('missing evidence fails closed in every phase', () => {
  for (const phase of ['A', 'B', 'C'] as const) {
    const r = validateIsolationEvidence({}, phase);
    assert.equal(r.pass, false);
    assert.ok(r.failures.length > 0);
  }
  expectFail({}, 'A', 'platform_indeterminate');
  expectFail({}, 'A', 'input_env_indeterminate');
  expectFail({}, 'B', 'ports_indeterminate');
  expectFail({}, 'B', 'layout_undefined');
  expectFail({}, 'C', 'port_owners_indeterminate');
  expectFail({}, 'C', 'forbidden_paths_indeterminate');
});

// --- phase A ---------------------------------------------------------------------------

test('input env: unknown BLOOM_FUTURE_X is denied by prefix', () => {
  const e = { ...validB(), inputEnvKeys: ['PATH', 'BLOOM_FUTURE_X'] };
  expectFail(e, 'B', 'input_env_denied:BLOOM_FUTURE_X');
});

test('input env classification: denylist by prefix, name and suffix; DISPLAY is dropped', () => {
  const denied = [
    'BLOOM_APPDATA_DIR', 'AITAP_X', 'SYNAPSE_Y', 'OLLAMA_HOST', 'TEMPORAL_ADDRESS', 'ELECTRON_RUN_AS_NODE',
    'GNOME_KEYRING_CONTROL', 'DBUS_SESSION_BUS_ADDRESS', 'NODE_OPTIONS', 'LD_PRELOAD', 'LD_LIBRARY_PATH',
    'PYTHONPATH', 'PYTHONHOME', 'XAUTHORITY', 'WAYLAND_DISPLAY', 'SSH_AUTH_SOCK', RUN_ID_VAR,
    'GITHUB_TOKEN', 'OPENAI_API_KEY', 'CLIENT_SECRET',
  ];
  for (const k of denied) assert.equal(classifyInputEnvKey(k), 'denied', k);
  for (const k of ['DISPLAY', 'PATH', 'HOME', 'LANG', 'TERM', 'XDG_DATA_HOME']) assert.equal(classifyInputEnvKey(k), 'dropped', k);
  const r = validateIsolationEvidence({ ...validB(), inputEnvKeys: ['DISPLAY'] }, 'B');
  assert.equal(r.pass, true);
});

test('phase A: platform, tmpdir and tools', () => {
  expectFail({ ...validB(), platform: 'darwin' }, 'A', 'platform_not_linux');
  expectFail({ ...validB(), harnessTmpDir: '/home/u/tmp' }, 'A', 'harness_tmpdir_in_real_home');
  const tools = { ...validB().tools, Xvfb: null };
  expectFail({ ...validB(), tools }, 'A', 'host_tool_missing:Xvfb');
  expectFail({ ...validB(), tools: { ...validB().tools, git: 'git' } }, 'A', 'host_tool_not_absolute:git');
  expectFail({ ...validB(), tools: { ...validB().tools, node: '/home/u/.nvm/node' } }, 'A', 'host_tool_in_real_home:node');
});

// --- phase B: root ----------------------------------------------------------------------

test('phase B: root properties', () => {
  const root = validB().root!;
  expectFail({ ...validB(), root: { ...root, mode: 0o40755 } }, 'B', 'root_mode_not_0700');
  expectFail({ ...validB(), root: { ...root, uid: 0 } }, 'B', 'root_owner_mismatch');
  expectFail({ ...validB(), root: { ...root, isSymlink: true } }, 'B', 'root_is_symlink');
  expectFail({ ...validB(), root: { ...root, realpath: '/elsewhere' } }, 'B', 'root_not_canonical');
  expectFail({ ...validB(), root: { ...root, mode: undefined } }, 'B', 'root_mode_indeterminate');
  const inHome = '/home/u/.local/share/BloomNucleus/run1';
  expectFail({ ...validB(), root: { ...root, path: inHome, realpath: inHome } }, 'B', 'root_in_real_home');
  expectFail({ ...validB(), root: { ...root, path: inHome, realpath: inHome } }, 'B', `root_overlaps_forbidden:/home/u/.local/share/BloomNucleus`);
  const inCheckout = `${CHECKOUT}/tmp-run`;
  expectFail({ ...validB(), root: { ...root, path: inCheckout, realpath: inCheckout } }, 'B', 'root_overlaps_checkout');
  const long = `/var/tmp/${'x'.repeat(100)}`;
  expectFail({ ...validB(), root: { ...root, path: long, realpath: long } }, 'B', 'socket_path_too_long');
  expectFail({ ...validB(), bloomAncestors: ['/var/.bloom'] }, 'B', 'bloom_ancestor_present:/var/.bloom');
  expectFail({ ...validB(), bloomAncestors: undefined }, 'B', 'bloom_ancestors_indeterminate');
  expectFail({ ...validB(), cwd: '/var/tmp' }, 'B', 'cwd_outside_root');
});

test('phase B: resolved roots and Bloom binaries', () => {
  const rr = validB().resolvedRoots!;
  expectFail({ ...validB(), resolvedRoots: { ...rr, conductor: '/home/u/.local/share/BloomNucleus' } }, 'B', 'resolved_root_mismatch:conductor');
  expectFail({ ...validB(), resolvedRoots: { ...rr, nucleus: undefined } }, 'B', 'resolved_root_indeterminate:nucleus');
  expectFail({ ...validB(), resolvedRoots: { ...rr, brainFrozen: '/opt/BloomNucleus' } }, 'B', 'resolved_root_mismatch:brainFrozen');
  expectFail({ ...validB(), bloomBinaries: {} }, 'B', 'bloom_binaries_absent');
  expectFail({ ...validB(), bloomBinaries: { nucleus: '/usr/local/bin/nucleus' } }, 'B', 'bloom_binary_outside_root:nucleus');
  expectFail({ ...validB(), bloomBinaries: undefined }, 'B', 'bloom_binaries_indeterminate');
});

test('phase B: PATH entries and Bloom names', () => {
  expectFail({ ...validB(), pathEntries: ['/home/u/.local/bin', '/usr/bin'] }, 'B', 'path_entry_in_real_home:/home/u/.local/bin');
  expectFail({ ...validB(), pathEntries: ['bin'] }, 'B', 'path_entry_not_absolute:bin');
  expectFail({ ...validB(), bloomNamesOnPathOutsideRoot: ['/usr/local/bin/ollama'] }, 'B', 'bloom_name_resolvable_outside_root:/usr/local/bin/ollama');
});

test('phase B: layout', () => {
  expectFail({ ...validB(), layout: undefined }, 'B', 'layout_undefined');
  expectFail({ ...validB(), layout: null }, 'B', 'layout_undefined');
  const l = validB().layout!;
  expectFail({ ...validB(), layout: { ...l, workspacePath: '/home/u/ws' } }, 'B', 'layout_workspace_outside_root');
  expectFail({ ...validB(), layout: { ...l, originPath: '/opt/other' } }, 'B', 'layout_origin_not_checkout');
  expectFail({ ...validB(), layout: { ...l, authorityBaseUrl: 'https://api.example.com:443' } }, 'B', 'layout_authority_not_loopback');
  expectFail({ ...validB(), layout: { ...l, authorityBaseUrl: 'http://localhost/' } }, 'B', 'layout_authority_port_implicit');
  expectFail({ ...validB(), layout: { ...l, authorityBaseUrl: 'http://localhost:80/' } }, 'B', 'layout_authority_port_implicit');
});

test('phase B: child env keys must equal the allowlist exactly', () => {
  const extra = { ...childEnv(), NODE_OPTIONS: '--inspect' };
  expectFail({ ...validB(), childEnv: extra }, 'B', 'child_env_key_extra:NODE_OPTIONS');
  const missing = childEnv();
  delete missing.DISPLAY;
  expectFail({ ...validB(), childEnv: missing }, 'B', 'child_env_key_missing:DISPLAY');
  assert.equal(CHILD_ENV_ALLOWLIST.length, 12);
});

test('phase B: child env values bound to R; failures never carry values', () => {
  const sentinel = '/home/u/SENTINEL-VALUE-should-not-leak';
  const r = validateIsolationEvidence({ ...validB(), childEnv: { ...childEnv(), HOME: sentinel } }, 'B');
  assert.ok(codes(r).includes('child_env_value_invalid:HOME'));
  assert.ok(!JSON.stringify(r).includes('SENTINEL-VALUE'));
  expectFail({ ...validB(), childEnv: { ...childEnv(), DISPLAY: 'localhost:10' } }, 'B', 'child_env_value_invalid:DISPLAY');
  expectFail({ ...validB(), childEnv: { ...childEnv(), DISPLAY: ':0.0' } }, 'B', 'child_env_value_invalid:DISPLAY');
  expectFail({ ...validB(), childEnv: { ...childEnv(), DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1000/bus' } }, 'B', 'child_env_value_invalid:DBUS_SESSION_BUS_ADDRESS');
  expectFail({ ...validB(), childEnv: { ...childEnv(), PATH: '/home/u/bin:/usr/bin' } }, 'B', 'child_env_value_invalid:PATH');
  expectFail({ ...validB(), childEnv: { ...childEnv(), XDG_RUNTIME_DIR: '/run/user/1000' } }, 'B', 'child_env_value_invalid:XDG_RUNTIME_DIR');
});

test('phase B: private bus', () => {
  const bus = validB().bus!;
  const hostBus = 'unix:path=/run/user/1000/bus';
  expectFail({ ...validB(), bus: { ...bus, address: hostBus }, childEnv: { ...childEnv(), DBUS_SESSION_BUS_ADDRESS: hostBus } }, 'B', 'bus_address_unexpected');
  const sibling = `unix:path=${ROOT}/run/bus2`;
  expectFail({ ...validB(), bus: { ...bus, address: sibling }, childEnv: { ...childEnv(), DBUS_SESSION_BUS_ADDRESS: sibling } }, 'B', 'bus_address_unexpected');
  expectFail({ ...validB(), bus: { ...bus, socketUid: 0 } }, 'B', 'bus_socket_owner_mismatch');
  expectFail({ ...validB(), bus: { ...bus, names: [...bus.names!, 'org.freedesktop.secrets'] } }, 'B', 'secret_service_present:org.freedesktop.secrets');
  expectFail({ ...validB(), bus: { ...bus, activatable: ['org.kde.kwalletd6'] } }, 'B', 'secret_service_present:org.kde.kwalletd6');
  expectFail({ ...validB(), bus: { ...bus, activatable: undefined } }, 'B', 'bus_names_indeterminate');
  expectFail({ ...validB(), bus: undefined }, 'B', 'bus_indeterminate');
});

test('phase B: all 7 real ports occupied (synthetic evidence) each FAIL', () => {
  const ports = REQUIRED_PORTS.map((port, i) => ({
    port,
    ipv4Inspected: true,
    ipv6Inspected: true,
    listeners: [{ family: (i % 2 === 0 ? 4 : 6) as 4 | 6, address: i % 2 === 0 ? '0.0.0.0' : '::', port, inode: 1000 + i, pids: [] }],
  }));
  const r = validateIsolationEvidence({ ...validB(), ports }, 'B');
  assert.equal(r.pass, false);
  assert.deepEqual(REQUIRED_PORTS, [48215, 4124, 5173, 5678, 7233, 8233, 11434]);
  for (const p of REQUIRED_PORTS) assert.ok(codes(r).includes(`port_occupied:${p}`), String(p));
});

test('phase B: uninspected family or missing port entry FAIL', () => {
  const ports = validB().ports!.map((p) => (p.port === 4124 ? { ...p, ipv6Inspected: false } : p));
  expectFail({ ...validB(), ports }, 'B', 'port_family_uninspected:4124');
  expectFail({ ...validB(), ports: validB().ports!.filter((p) => p.port !== 11434) }, 'B', 'port_indeterminate:11434');
});

// --- phase C ---------------------------------------------------------------------------------

function validC(): PhaseCEvidence {
  return {
    root: ROOT,
    runId: RUN,
    registeredSids: [500, 600],
    portOwners: REQUIRED_PORTS.map((port) => ({
      port,
      resolved: true,
      owners: [{ pid: 700, runIdMatch: true, home: `${ROOT}/home`, sid: 600 }],
    })),
    coreWindowUrl: 'http://localhost:5173/#/onboarding',
    forbiddenPathsChanged: [],
  };
}

function withOwner(port: number, owner: object, extra: object = {}): PhaseCEvidence {
  const c = validC();
  c.portOwners = c.portOwners!.map((o) => (o.port === port ? { ...o, ...extra, owners: [{ ...o.owners[0], ...owner }] } : o));
  return c;
}

test('phase C: valid evidence passes', () => {
  assert.deepEqual(validateIsolationEvidence(validC(), 'C').failures, []);
});

test('phase C: port ownership', () => {
  expectFail(withOwner(48215, { runIdMatch: null }), 'C', 'port_owner_environ_unreadable:48215');
  expectFail(withOwner(4124, { runIdMatch: false }), 'C', 'port_owner_token_mismatch:4124');
  expectFail(withOwner(5173, { home: '/home/u' }), 'C', 'port_owner_home_mismatch:5173');
  expectFail(withOwner(5678, { sid: 1 }), 'C', 'port_owner_sid_unregistered:5678');
  expectFail(withOwner(7233, {}, { resolved: false }), 'C', 'port_owner_indeterminate:7233');
  const amb = validC();
  amb.portOwners = amb.portOwners!.map((o) =>
    o.port === 8233 ? { ...o, owners: [...o.owners, { pid: 701, runIdMatch: true, home: `${ROOT}/home`, sid: 600 }] } : o,
  );
  expectFail(amb, 'C', 'port_owner_ambiguous:8233');
  const none = validC();
  none.portOwners = none.portOwners!.map((o) => (o.port === 11434 ? { ...o, owners: [] } : o));
  expectFail(none, 'C', 'port_not_listening:11434');
});

test('phase C: Core window and forbidden paths', () => {
  expectFail({ ...validC(), coreWindowUrl: 'http://127.0.0.1:5173/' }, 'C', 'core_window_url_unexpected');
  expectFail({ ...validC(), coreWindowUrl: 'http://localhost:5174/' }, 'C', 'core_window_url_unexpected');
  expectFail({ ...validC(), coreWindowUrl: undefined }, 'C', 'core_window_indeterminate');
  expectFail({ ...validC(), forbiddenPathsChanged: ['/home/u/.bloom-nucleus'] }, 'C', 'forbidden_path_modified:/home/u/.bloom-nucleus');
  expectFail({ ...validC(), forbiddenPathsChanged: null }, 'C', 'forbidden_paths_indeterminate');
});

test('phase C: caller-provided port subset', () => {
  const c = validC();
  c.portOwners = c.portOwners!.filter((o) => o.port === 48215);
  assert.equal(validateIsolationEvidence(c, 'C').pass, false);
  assert.equal(validateIsolationEvidence(c, 'C', [48215]).pass, true);
});

// --- formula replicas -----------------------------------------------------------------------------

test('formula replicas converge under the child env and diverge under overrides', () => {
  const env = { HOME: `${ROOT}/home`, XDG_DATA_HOME: `${ROOT}/home/.local/share` };
  assert.equal(conductorBaseLinux(env), BASE);
  assert.equal(resolveAppDataDirLinux(env), BASE);
  assert.equal(getBloomNucleusBaseLinux(env), BASE);
  assert.equal(brainFrozenBase(`${BASE}/bin/brain/brain`), BASE);
  // BLOOM_APPDATA_DIR splits Nucleus from the supervisor: reason it is denied.
  const split = { ...env, BLOOM_APPDATA_DIR: '/x' };
  assert.equal(resolveAppDataDirLinux(split), '/x');
  assert.equal(getBloomNucleusBaseLinux(split), BASE);
  // Conductor ignores XDG_DATA_HOME.
  assert.equal(conductorBaseLinux({ HOME: '/h', XDG_DATA_HOME: '/x' }), '/h/.local/share/BloomNucleus');
});

test('forbiddenPaths lists the productive locations', () => {
  const p = forbiddenPaths(REAL_HOME, CHECKOUT, '/data/xdg');
  for (const expected of [
    '/home/u/.local/share/BloomNucleus',
    '/home/u/BloomNucleus',
    '/home/u/.bloom-nucleus',
    '/home/u/.bloom',
    '/home/u/.config/systemd/user',
    '/home/u/repos/bloom/BloomNucleus',
    '/data/xdg/BloomNucleus',
  ]) {
    assert.ok(p.includes(expected), expected);
  }
});
