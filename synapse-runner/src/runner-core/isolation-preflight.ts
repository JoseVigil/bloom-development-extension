/**
 * RUNNER CORE — CORE-00 Isolation Preflight.
 *
 * Fail-closed verification that a run is isolated from any productive Bloom
 * state. Three phases:
 *   A — before any root exists (host, input environment, harness tmpdir, tools);
 *   B — after the isolated root R is assembled and before any launch;
 *   C — after launch (port ownership, Core window, no change in forbidden paths).
 *
 * Rules:
 *   - Missing or indeterminate evidence is a FAIL.
 *   - Failures carry codes and key names only, never environment values.
 *   - This module performs no writes. It is the only runner-core module that
 *     reads the harness input environment.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const REQUIRED_PORTS: readonly number[] = [48215, 4124, 5173, 5678, 7233, 8233, 11434];

export const RUN_ID_VAR = 'RUNNER_CORE_RUN_ID';

export const CHILD_ENV_ALLOWLIST: readonly string[] = [
  'HOME',
  'XDG_DATA_HOME',
  'XDG_CONFIG_HOME',
  'XDG_CACHE_HOME',
  'XDG_STATE_HOME',
  'XDG_RUNTIME_DIR',
  'TMPDIR',
  'PATH',
  'LANG',
  'DISPLAY',
  'DBUS_SESSION_BUS_ADDRESS',
  RUN_ID_VAR,
];

export const DENIED_ENV_PREFIXES: readonly string[] = [
  'BLOOM_',
  'AITAP_',
  'SYNAPSE_',
  'OLLAMA_',
  'TEMPORAL_',
  'ELECTRON_',
  'GNOME_KEYRING_',
  'DBUS_',
];

export const DENIED_ENV_NAMES: readonly string[] = [
  'NODE_OPTIONS',
  'LD_PRELOAD',
  'LD_LIBRARY_PATH',
  'PYTHONPATH',
  'PYTHONHOME',
  'XAUTHORITY',
  'WAYLAND_DISPLAY',
  'SSH_AUTH_SOCK',
  RUN_ID_VAR,
];

export const DENIED_ENV_SUFFIXES: readonly string[] = ['_API_KEY', '_TOKEN', '_SECRET'];

/** Explicit exceptions to DENIED_ENV_PREFIXES. Empty by decision. */
export const AUTHORIZED_BLOOM_VARS: readonly string[] = [];

export const BLOOM_BINARY_NAMES: readonly string[] = [
  'nucleus',
  'brain',
  'sentinel',
  'temporal',
  'aitap',
  'bloom-host',
  'metamorph',
  'sensor',
  'impact',
  'monitor',
  'ollama',
];

export const REQUIRED_HOST_TOOLS: readonly string[] = ['dbus-daemon', 'dbus-send', 'Xvfb', 'git', 'node', 'npm', 'sh'];

export const SECRET_SERVICE_NAMES: readonly string[] = [
  'org.freedesktop.secrets',
  'org.kde.kwalletd5',
  'org.kde.kwalletd6',
];

/** Conservative bound for an AF_UNIX socket path (sun_path is 108 bytes). */
export const MAX_SOCKET_PATH = 100;

export const CORE_WINDOW_ORIGIN = 'http://localhost:5173';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Phase = 'A' | 'B' | 'C';

export interface CheckFailure {
  code: string;
  /** Key name, port, path or tool name. Never an environment value. */
  detail?: string;
}

export interface PreflightResult {
  phase: Phase;
  pass: boolean;
  failures: CheckFailure[];
}

export class IndeterminateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IndeterminateError';
  }
}

export interface ListenerInfo {
  family: 4 | 6;
  address: string;
  port: number;
  inode: number;
  /** PIDs holding the socket inode. Empty when not resolvable. */
  pids: number[];
}

export interface PortEvidence {
  port: number;
  ipv4Inspected: boolean;
  ipv6Inspected: boolean;
  listeners: ListenerInfo[];
}

export interface RootEvidence {
  path?: string;
  mode?: number;
  uid?: number;
  isSymlink?: boolean;
  realpath?: string;
}

export interface ResolvedRootsEvidence {
  conductor?: string;
  nucleus?: string;
  supervisor?: string;
  /** null when no Bloom binary is present in R. */
  brainFrozen?: string | null;
}

export interface LayoutEvidence {
  workspacePath?: string;
  originPath?: string;
  authorityBaseUrl?: string;
}

export interface BusEvidence {
  address?: string;
  socketUid?: number;
  names?: string[];
  activatable?: string[];
}

export interface PhaseAEvidence {
  platform?: string;
  realHome?: string;
  checkout?: string;
  inputEnvKeys?: string[];
  inputXdgDataHome?: string;
  harnessTmpDir?: string;
  tools?: Record<string, string | null>;
}

export interface PhaseBEvidence extends PhaseAEvidence {
  processUid?: number;
  root?: RootEvidence;
  cwd?: string;
  bloomAncestors?: string[];
  resolvedRoots?: ResolvedRootsEvidence;
  bloomBinaries?: Record<string, string>;
  pathEntries?: string[];
  bloomNamesOnPathOutsideRoot?: string[];
  layout?: LayoutEvidence | null;
  childEnv?: Record<string, string>;
  bus?: BusEvidence;
  ports?: PortEvidence[];
}

export interface PortOwner {
  pid: number;
  /** null when environ could not be read. */
  runIdMatch: boolean | null;
  home: string | null;
  sid: number | null;
}

export interface PortOwnerEvidence {
  port: number;
  /** false when a listener exists but its owner could not be determined. */
  resolved: boolean;
  owners: PortOwner[];
}

export interface PhaseCEvidence {
  root?: string;
  runId?: string;
  registeredSids?: number[];
  portOwners?: PortOwnerEvidence[];
  coreWindowUrl?: string;
  /** Paths whose stat changed since phase B. null when indeterminate. */
  forbiddenPathsChanged?: string[] | null;
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/** True when `child` is `parent` or lies inside it (lexical, absolute paths). */
export function isWithin(child: string, parent: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

export function overlaps(a: string, b: string): boolean {
  return isWithin(a, b) || isWithin(b, a);
}

/** True when p is inside the real home but not inside the canonical checkout. */
export function isForbiddenHomeLocation(p: string, realHome: string, checkout: string): boolean {
  return isWithin(p, realHome) && !isWithin(p, checkout);
}

/** The productive locations a run must never touch (set P). */
export function forbiddenPaths(realHome: string, checkout: string, inputXdgDataHome?: string): string[] {
  const list = [
    path.join(realHome, '.local', 'share', 'BloomNucleus'),
    path.join(realHome, 'BloomNucleus'),
    path.join(realHome, '.bloom-nucleus'),
    path.join(realHome, '.bloom'),
    path.join(realHome, '.config', 'systemd', 'user'),
    path.join(checkout, 'BloomNucleus'),
  ];
  if (inputXdgDataHome && path.isAbsolute(inputXdgDataHome)) {
    list.push(path.join(inputXdgDataHome, 'BloomNucleus'));
  }
  return Array.from(new Set(list.map((p) => path.resolve(p))));
}

export function expectedBloomBase(root: string): string {
  return path.join(root, 'home', '.local', 'share', 'BloomNucleus');
}

export function rootHome(root: string): string {
  return path.join(root, 'home');
}

export function busSocketPath(root: string): string {
  return path.join(root, 'run', 'bus');
}

// ---------------------------------------------------------------------------
// Pure replicas of the productive root formulas (Linux)
// ---------------------------------------------------------------------------

export interface FormulaEnv {
  HOME?: string;
  XDG_DATA_HOME?: string;
  BLOOM_APPDATA_DIR?: string;
}

/** Conductor global_paths.js: homedir only, XDG ignored. */
export function conductorBaseLinux(env: FormulaEnv): string | undefined {
  if (!env.HOME) return undefined;
  return path.join(env.HOME, '.local', 'share', 'BloomNucleus');
}

/** Nucleus core ResolveAppDataDir: BLOOM_APPDATA_DIR, then XDG_DATA_HOME, then ~/.local/share. */
export function resolveAppDataDirLinux(env: FormulaEnv): string | undefined {
  if (env.BLOOM_APPDATA_DIR) return env.BLOOM_APPDATA_DIR;
  if (env.XDG_DATA_HOME) return path.join(env.XDG_DATA_HOME, 'BloomNucleus');
  if (!env.HOME) return undefined;
  return path.join(env.HOME, '.local', 'share', 'BloomNucleus');
}

/** Supervisor getBloomNucleusBase: XDG_DATA_HOME, then ~/.local/share. Ignores BLOOM_APPDATA_DIR. */
export function getBloomNucleusBaseLinux(env: FormulaEnv): string | undefined {
  if (env.XDG_DATA_HOME) return path.join(env.XDG_DATA_HOME, 'BloomNucleus');
  if (!env.HOME) return undefined;
  return path.join(env.HOME, '.local', 'share', 'BloomNucleus');
}

/** Brain frozen mode: exe_path.parent.parent.parent. */
export function brainFrozenBase(brainExePath: string): string {
  return path.dirname(path.dirname(path.dirname(brainExePath)));
}

// ---------------------------------------------------------------------------
// Environment classification
// ---------------------------------------------------------------------------

export type InputEnvClass = 'denied' | 'dropped';

/** Classifies an input environment key. Denied keys fail phase A; others are dropped. */
export function classifyInputEnvKey(key: string): InputEnvClass {
  if (DENIED_ENV_NAMES.includes(key)) return 'denied';
  if (DENIED_ENV_SUFFIXES.some((s) => key.endsWith(s))) return 'denied';
  if (DENIED_ENV_PREFIXES.some((p) => key.startsWith(p)) && !AUTHORIZED_BLOOM_VARS.includes(key)) return 'denied';
  return 'dropped';
}

// ---------------------------------------------------------------------------
// Validator (pure)
// ---------------------------------------------------------------------------

function fail(failures: CheckFailure[], code: string, detail?: string): void {
  failures.push(detail === undefined ? { code } : { code, detail });
}

function validatePhaseA(e: PhaseAEvidence, f: CheckFailure[]): void {
  if (e.platform === undefined) fail(f, 'platform_indeterminate');
  else if (e.platform !== 'linux') fail(f, 'platform_not_linux');

  const homeOk = typeof e.realHome === 'string' && path.isAbsolute(e.realHome);
  if (!homeOk) fail(f, 'real_home_indeterminate');
  const checkoutOk = typeof e.checkout === 'string' && path.isAbsolute(e.checkout);
  if (!checkoutOk) fail(f, 'checkout_indeterminate');

  if (e.inputEnvKeys === undefined) {
    fail(f, 'input_env_indeterminate');
  } else {
    for (const key of e.inputEnvKeys) {
      if (classifyInputEnvKey(key) === 'denied') fail(f, 'input_env_denied', key);
    }
  }

  if (typeof e.harnessTmpDir !== 'string' || !path.isAbsolute(e.harnessTmpDir)) {
    fail(f, 'harness_tmpdir_indeterminate');
  } else if (homeOk && isWithin(e.harnessTmpDir, e.realHome as string)) {
    fail(f, 'harness_tmpdir_in_real_home');
  }

  if (e.tools === undefined) {
    fail(f, 'host_tools_indeterminate');
  } else {
    for (const tool of REQUIRED_HOST_TOOLS) {
      const p = e.tools[tool];
      if (typeof p !== 'string' || p.length === 0) fail(f, 'host_tool_missing', tool);
      else if (!path.isAbsolute(p)) fail(f, 'host_tool_not_absolute', tool);
      else if (homeOk && checkoutOk && isForbiddenHomeLocation(p, e.realHome as string, e.checkout as string)) {
        fail(f, 'host_tool_in_real_home', tool);
      }
    }
  }
}

function checkPathEntries(
  entries: string[],
  realHome: string | undefined,
  checkout: string | undefined,
  forbidden: string[],
  code: string,
  f: CheckFailure[],
): void {
  for (const entry of entries) {
    if (!path.isAbsolute(entry)) {
      fail(f, `${code}_not_absolute`, entry);
      continue;
    }
    if (realHome && checkout && isForbiddenHomeLocation(entry, realHome, checkout)) {
      fail(f, `${code}_in_real_home`, entry);
      continue;
    }
    if (forbidden.some((p) => overlaps(entry, p))) fail(f, `${code}_forbidden`, entry);
  }
}

function validateAuthorityUrl(raw: string | undefined, f: CheckFailure[]): void {
  if (typeof raw !== 'string') {
    fail(f, 'layout_authority_indeterminate');
    return;
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    fail(f, 'layout_authority_invalid');
    return;
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) fail(f, 'layout_authority_not_loopback');
  // URL drops a port that equals the scheme default, so require it literally too.
  const explicit = /^[a-z]+:\/\/[^/]*:\d+(\/|$)/i.test(raw);
  if (url.port === '' || !explicit) fail(f, 'layout_authority_port_implicit');
}

function validatePhaseB(e: PhaseBEvidence, required: readonly number[], f: CheckFailure[]): void {
  const realHome = typeof e.realHome === 'string' && path.isAbsolute(e.realHome) ? e.realHome : undefined;
  const checkout = typeof e.checkout === 'string' && path.isAbsolute(e.checkout) ? e.checkout : undefined;
  const forbidden = realHome && checkout ? forbiddenPaths(realHome, checkout, e.inputXdgDataHome) : [];

  if (typeof e.processUid !== 'number') fail(f, 'process_uid_indeterminate');

  // --- root -----------------------------------------------------------------
  const r = e.root;
  const root = r && typeof r.path === 'string' && path.isAbsolute(r.path) ? r.path : undefined;
  if (!r || !root) {
    fail(f, 'root_indeterminate');
  } else {
    if (typeof r.mode !== 'number') fail(f, 'root_mode_indeterminate');
    else if ((r.mode & 0o777) !== 0o700) fail(f, 'root_mode_not_0700');
    if (typeof r.uid !== 'number' || typeof e.processUid !== 'number') fail(f, 'root_owner_indeterminate');
    else if (r.uid !== e.processUid) fail(f, 'root_owner_mismatch');
    if (r.isSymlink === undefined) fail(f, 'root_symlink_indeterminate');
    else if (r.isSymlink) fail(f, 'root_is_symlink');
    if (typeof r.realpath !== 'string') fail(f, 'root_realpath_indeterminate');
    else if (path.resolve(r.realpath) !== path.resolve(root)) fail(f, 'root_not_canonical');
    if (!realHome) fail(f, 'root_home_relation_indeterminate');
    else if (isWithin(root, realHome) || isWithin(realHome, root)) fail(f, 'root_in_real_home');
    if (checkout && overlaps(root, checkout)) fail(f, 'root_overlaps_checkout');
    for (const p of forbidden) if (overlaps(root, p)) fail(f, 'root_overlaps_forbidden', p);
    if (busSocketPath(root).length > MAX_SOCKET_PATH) fail(f, 'socket_path_too_long');
  }

  if (e.bloomAncestors === undefined) fail(f, 'bloom_ancestors_indeterminate');
  else for (const a of e.bloomAncestors) fail(f, 'bloom_ancestor_present', a);

  if (typeof e.cwd !== 'string' || !path.isAbsolute(e.cwd)) fail(f, 'cwd_indeterminate');
  else if (root && !isWithin(e.cwd, root)) fail(f, 'cwd_outside_root');

  // --- resolved roots ---------------------------------------------------------
  const expected = root ? expectedBloomBase(root) : undefined;
  const rr = e.resolvedRoots;
  if (!rr) {
    fail(f, 'resolved_roots_indeterminate');
  } else {
    for (const name of ['conductor', 'nucleus', 'supervisor'] as const) {
      const v = rr[name];
      if (typeof v !== 'string') fail(f, 'resolved_root_indeterminate', name);
      else if (!expected || path.resolve(v) !== expected) fail(f, 'resolved_root_mismatch', name);
    }
  }

  // --- Bloom binaries ---------------------------------------------------------
  if (e.bloomBinaries === undefined) {
    fail(f, 'bloom_binaries_indeterminate');
  } else {
    const entries = Object.entries(e.bloomBinaries);
    if (entries.length === 0) {
      fail(f, 'bloom_binaries_absent');
    } else {
      for (const [name, p] of entries) {
        if (!root || !path.isAbsolute(p) || !isWithin(p, root)) fail(f, 'bloom_binary_outside_root', name);
      }
      if (!rr || rr.brainFrozen === undefined) fail(f, 'resolved_root_indeterminate', 'brainFrozen');
      else if (rr.brainFrozen === null) {
        if ('brain' in e.bloomBinaries) fail(f, 'resolved_root_indeterminate', 'brainFrozen');
      } else if (!expected || path.resolve(rr.brainFrozen) !== expected) {
        fail(f, 'resolved_root_mismatch', 'brainFrozen');
      }
    }
  }

  // --- PATH ---------------------------------------------------------------------
  if (e.pathEntries === undefined) fail(f, 'path_entries_indeterminate');
  else checkPathEntries(e.pathEntries, realHome, checkout, forbidden, 'path_entry', f);

  if (e.bloomNamesOnPathOutsideRoot === undefined) fail(f, 'bloom_path_scan_indeterminate');
  else for (const p of e.bloomNamesOnPathOutsideRoot) fail(f, 'bloom_name_resolvable_outside_root', p);

  // --- layout -------------------------------------------------------------------
  if (e.layout === undefined || e.layout === null) {
    fail(f, 'layout_undefined');
  } else {
    const l = e.layout;
    if (typeof l.workspacePath !== 'string' || !root) fail(f, 'layout_workspace_indeterminate');
    else if (!isWithin(l.workspacePath, path.join(root, 'workspaces')) || path.resolve(l.workspacePath) === path.join(root, 'workspaces')) {
      fail(f, 'layout_workspace_outside_root');
    }
    if (typeof l.originPath !== 'string' || !checkout) fail(f, 'layout_origin_indeterminate');
    else if (path.resolve(l.originPath) !== path.resolve(checkout)) fail(f, 'layout_origin_not_checkout');
    validateAuthorityUrl(l.authorityBaseUrl, f);
  }

  // --- child environment ----------------------------------------------------------
  const env = e.childEnv;
  if (env === undefined) {
    fail(f, 'child_env_indeterminate');
  } else {
    const keys = Object.keys(env);
    for (const k of CHILD_ENV_ALLOWLIST) if (!keys.includes(k)) fail(f, 'child_env_key_missing', k);
    for (const k of keys) if (!CHILD_ENV_ALLOWLIST.includes(k)) fail(f, 'child_env_key_extra', k);
    if (root) {
      const expectValue: Record<string, string> = {
        HOME: rootHome(root),
        XDG_DATA_HOME: path.join(root, 'home', '.local', 'share'),
        XDG_CONFIG_HOME: path.join(root, 'home', '.config'),
        XDG_CACHE_HOME: path.join(root, 'home', '.cache'),
        XDG_STATE_HOME: path.join(root, 'home', '.local', 'state'),
        XDG_RUNTIME_DIR: path.join(root, 'run'),
        TMPDIR: path.join(root, 'tmp'),
      };
      for (const [k, v] of Object.entries(expectValue)) {
        if (k in env && env[k] !== v) fail(f, 'child_env_value_invalid', k);
      }
    } else {
      fail(f, 'child_env_values_indeterminate');
    }
    if ('PATH' in env) {
      const entries = env.PATH.split(':');
      const before = f.length;
      checkPathEntries(entries, realHome, checkout, forbidden, 'child_path_entry', f);
      if (f.length > before || env.PATH.length === 0) fail(f, 'child_env_value_invalid', 'PATH');
    }
    if ('DISPLAY' in env && !/^:\d+$/.test(env.DISPLAY)) fail(f, 'child_env_value_invalid', 'DISPLAY');
    if ('LANG' in env && !/^[A-Za-z0-9_.@-]+$/.test(env.LANG)) fail(f, 'child_env_value_invalid', 'LANG');
    if (RUN_ID_VAR in env && !/^[0-9a-f-]{36}$/.test(env[RUN_ID_VAR])) fail(f, 'child_env_value_invalid', RUN_ID_VAR);
    if ('DBUS_SESSION_BUS_ADDRESS' in env) {
      if (!e.bus || typeof e.bus.address !== 'string' || env.DBUS_SESSION_BUS_ADDRESS !== e.bus.address) {
        fail(f, 'child_env_value_invalid', 'DBUS_SESSION_BUS_ADDRESS');
      }
    }
  }

  // --- private bus ----------------------------------------------------------------
  const bus = e.bus;
  if (!bus) {
    fail(f, 'bus_indeterminate');
  } else {
    if (typeof bus.address !== 'string' || !root) fail(f, 'bus_address_indeterminate');
    else if (!isPrivateBusAddress(bus.address, root)) fail(f, 'bus_address_unexpected');
    if (typeof bus.socketUid !== 'number' || typeof e.processUid !== 'number') fail(f, 'bus_socket_owner_indeterminate');
    else if (bus.socketUid !== e.processUid) fail(f, 'bus_socket_owner_mismatch');
    if (bus.names === undefined || bus.activatable === undefined) fail(f, 'bus_names_indeterminate');
    else {
      for (const n of SECRET_SERVICE_NAMES) {
        if (bus.names.includes(n) || bus.activatable.includes(n)) fail(f, 'secret_service_present', n);
      }
    }
  }

  // --- ports ------------------------------------------------------------------------
  validatePortsFree(e.ports, required, f);
}

export function isPrivateBusAddress(address: string, root: string): boolean {
  const prefix = `unix:path=${busSocketPath(root)}`;
  if (!address.startsWith(prefix)) return false;
  const rest = address.slice(prefix.length);
  return rest === '' || rest.startsWith(',');
}

function validatePortsFree(ports: PortEvidence[] | undefined, required: readonly number[], f: CheckFailure[]): void {
  if (ports === undefined) {
    fail(f, 'ports_indeterminate');
    return;
  }
  for (const port of required) {
    const ev = ports.find((p) => p.port === port);
    if (!ev) {
      fail(f, 'port_indeterminate', String(port));
      continue;
    }
    if (!ev.ipv4Inspected || !ev.ipv6Inspected) fail(f, 'port_family_uninspected', String(port));
    if (ev.listeners.length > 0) fail(f, 'port_occupied', String(port));
  }
}

function validatePhaseC(e: PhaseCEvidence, required: readonly number[], f: CheckFailure[]): void {
  const root = typeof e.root === 'string' && path.isAbsolute(e.root) ? e.root : undefined;
  if (!root) fail(f, 'root_indeterminate');
  if (typeof e.runId !== 'string' || e.runId.length === 0) fail(f, 'run_id_indeterminate');
  if (e.registeredSids === undefined) fail(f, 'registered_sids_indeterminate');

  if (e.portOwners === undefined) {
    fail(f, 'port_owners_indeterminate');
  } else {
    for (const port of required) {
      const p = String(port);
      const ev = e.portOwners.find((o) => o.port === port);
      if (!ev || !ev.resolved) {
        fail(f, 'port_owner_indeterminate', p);
        continue;
      }
      const pids = Array.from(new Set(ev.owners.map((o) => o.pid)));
      if (pids.length === 0) {
        fail(f, 'port_not_listening', p);
        continue;
      }
      if (pids.length > 1) {
        fail(f, 'port_owner_ambiguous', p);
        continue;
      }
      const o = ev.owners[0];
      if (o.runIdMatch === null) fail(f, 'port_owner_environ_unreadable', p);
      else if (!o.runIdMatch) fail(f, 'port_owner_token_mismatch', p);
      if (o.home === null || !root) fail(f, 'port_owner_home_indeterminate', p);
      else if (o.home !== rootHome(root)) fail(f, 'port_owner_home_mismatch', p);
      if (o.sid === null || !e.registeredSids || !e.registeredSids.includes(o.sid)) fail(f, 'port_owner_sid_unregistered', p);
    }
  }

  if (typeof e.coreWindowUrl !== 'string') {
    fail(f, 'core_window_indeterminate');
  } else {
    let origin = '';
    try {
      origin = new URL(e.coreWindowUrl).origin;
    } catch {
      origin = '';
    }
    if (origin !== CORE_WINDOW_ORIGIN) fail(f, 'core_window_url_unexpected');
  }

  if (e.forbiddenPathsChanged === undefined || e.forbiddenPathsChanged === null) fail(f, 'forbidden_paths_indeterminate');
  else for (const p of e.forbiddenPathsChanged) fail(f, 'forbidden_path_modified', p);
}

/**
 * Pure validation. Phase B includes the phase A checks. Phase C validates the
 * post-launch evidence only.
 */
export function validateIsolationEvidence(
  evidence: PhaseAEvidence | PhaseBEvidence | PhaseCEvidence,
  phase: Phase,
  requiredPorts: readonly number[] = REQUIRED_PORTS,
): PreflightResult {
  const failures: CheckFailure[] = [];
  if (phase === 'A') {
    validatePhaseA(evidence as PhaseAEvidence, failures);
  } else if (phase === 'B') {
    validatePhaseA(evidence as PhaseBEvidence, failures);
    validatePhaseB(evidence as PhaseBEvidence, requiredPorts, failures);
  } else {
    validatePhaseC(evidence as PhaseCEvidence, requiredPorts, failures);
  }
  return { phase, pass: failures.length === 0, failures };
}

// ---------------------------------------------------------------------------
// Inspectors (read-only, injectable roots)
// ---------------------------------------------------------------------------

export function readRealHome(): string {
  // getpwuid-based: independent of the HOME variable.
  return os.userInfo().homedir;
}

function hexBytesLE(word: string): number[] {
  if (!/^[0-9A-Fa-f]{8}$/.test(word)) throw new IndeterminateError('malformed address word');
  const bytes: number[] = [];
  for (let i = 6; i >= 0; i -= 2) bytes.push(parseInt(word.slice(i, i + 2), 16));
  return bytes;
}

export function parseProcNetAddress(hex: string, family: 4 | 6): string {
  if (family === 4) {
    if (hex.length !== 8) throw new IndeterminateError('malformed IPv4 address');
    return hexBytesLE(hex).join('.');
  }
  if (hex.length !== 32) throw new IndeterminateError('malformed IPv6 address');
  const bytes: number[] = [];
  for (let w = 0; w < 4; w++) bytes.push(...hexBytesLE(hex.slice(w * 8, w * 8 + 8)));
  const groups: string[] = [];
  for (let i = 0; i < 16; i += 2) groups.push(((bytes[i] << 8) | bytes[i + 1]).toString(16));
  return groups.join(':');
}

/** Parses /proc/net/tcp or /proc/net/tcp6. Returns LISTEN sockets only. Malformed input throws. */
export function parseProcNetTcp(text: string, family: 4 | 6): ListenerInfo[] {
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0 || !lines[0].includes('local_address')) {
    throw new IndeterminateError('missing /proc/net/tcp header');
  }
  const out: ListenerInfo[] = [];
  for (const line of lines.slice(1)) {
    const fields = line.trim().split(/\s+/);
    if (fields.length < 10) throw new IndeterminateError('malformed /proc/net/tcp row');
    const [addrHex, portHex] = fields[1].split(':');
    if (addrHex === undefined || portHex === undefined || !/^[0-9A-Fa-f]{4}$/.test(portHex)) {
      throw new IndeterminateError('malformed local_address');
    }
    const state = fields[3];
    if (!/^[0-9A-Fa-f]{2}$/.test(state)) throw new IndeterminateError('malformed state');
    const inode = Number(fields[9]);
    if (!Number.isInteger(inode) || inode < 0) throw new IndeterminateError('malformed inode');
    const address = parseProcNetAddress(addrHex, family);
    if (state.toUpperCase() !== '0A') continue;
    out.push({ family, address, port: parseInt(portHex, 16), inode, pids: [] });
  }
  return out;
}

export interface InodeMapResult {
  map: Map<number, number[]>;
  /** PIDs whose fd table could not be read (permission). */
  unreadable: number[];
}

export function listPids(procRoot: string): number[] {
  return fs
    .readdirSync(procRoot)
    .filter((n) => /^\d+$/.test(n))
    .map(Number);
}

/** Maps socket inodes to the PIDs holding them via <procRoot>/<pid>/fd. */
export function mapInodesToPids(procRoot: string, inodes: Set<number>): InodeMapResult {
  const map = new Map<number, number[]>();
  const unreadable: number[] = [];
  if (inodes.size === 0) return { map, unreadable };
  for (const pid of listPids(procRoot)) {
    const fdDir = path.join(procRoot, String(pid), 'fd');
    let fds: string[];
    try {
      fds = fs.readdirSync(fdDir);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ESRCH') continue;
      unreadable.push(pid);
      continue;
    }
    for (const fd of fds) {
      let target: string;
      try {
        target = fs.readlinkSync(path.join(fdDir, fd));
      } catch {
        continue;
      }
      const m = /^socket:\[(\d+)\]$/.exec(target);
      if (!m) continue;
      const inode = Number(m[1]);
      if (!inodes.has(inode)) continue;
      const list = map.get(inode) ?? [];
      if (!list.includes(pid)) list.push(pid);
      map.set(inode, list);
    }
  }
  return { map, unreadable };
}

export interface ProcStat {
  pid: number;
  comm: string;
  state: string;
  ppid: number;
  pgrp: number;
  session: number;
  /** Field 22, clock ticks since boot. */
  starttime: number;
}

/** Parses /proc/<pid>/stat. The comm field may contain spaces and parentheses. */
export function parseProcStat(text: string): ProcStat {
  const open = text.indexOf('(');
  const close = text.lastIndexOf(')');
  if (open < 0 || close < open) throw new IndeterminateError('malformed stat');
  const pid = Number(text.slice(0, open).trim());
  const comm = text.slice(open + 1, close);
  const rest = text.slice(close + 1).trim().split(/\s+/);
  // rest[0] is field 3 (state); field N is rest[N - 3].
  if (rest.length < 20) throw new IndeterminateError('short stat');
  const num = (i: number): number => {
    const v = Number(rest[i]);
    if (!Number.isFinite(v)) throw new IndeterminateError('malformed stat field');
    return v;
  };
  const stat: ProcStat = {
    pid,
    comm,
    state: rest[0],
    ppid: num(1),
    pgrp: num(2),
    session: num(3),
    starttime: num(19),
  };
  if (!Number.isInteger(pid) || pid <= 0) throw new IndeterminateError('malformed pid');
  return stat;
}

/** Returns null when the process does not exist. */
export function readProcStat(procRoot: string, pid: number): ProcStat | null {
  try {
    return parseProcStat(fs.readFileSync(path.join(procRoot, String(pid), 'stat'), 'utf8'));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ESRCH') return null;
    throw err;
  }
}

export interface EnvironSubset {
  readable: boolean;
  runId: string | null;
  home: string | null;
}

/** Extracts only RUNNER_CORE_RUN_ID and HOME. Returns null when the process does not exist. */
export function readEnvironSubset(procRoot: string, pid: number): EnvironSubset | null {
  let raw: Buffer;
  try {
    raw = fs.readFileSync(path.join(procRoot, String(pid), 'environ'));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ESRCH') return null;
    return { readable: false, runId: null, home: null };
  }
  let runId: string | null = null;
  let home: string | null = null;
  for (const entry of raw.toString('utf8').split('\0')) {
    if (entry.startsWith(`${RUN_ID_VAR}=`)) runId = entry.slice(RUN_ID_VAR.length + 1);
    else if (entry.startsWith('HOME=')) home = entry.slice(5);
  }
  return { readable: true, runId, home };
}

export interface PortInspection {
  ports: PortEvidence[];
  unreadablePids: number[];
}

/** Inspects IPv4 and IPv6 listeners. An unreadable or malformed family is reported as uninspected. */
export function inspectPorts(ports: readonly number[], procRoot = '/proc'): PortInspection {
  const read = (file: string, family: 4 | 6): ListenerInfo[] | null => {
    try {
      return parseProcNetTcp(fs.readFileSync(path.join(procRoot, 'net', file), 'utf8'), family);
    } catch {
      return null;
    }
  };
  const v4 = read('tcp', 4);
  const v6 = read('tcp6', 6);
  const all = [...(v4 ?? []), ...(v6 ?? [])].filter((l) => ports.includes(l.port));
  const { map, unreadable } = mapInodesToPids(procRoot, new Set(all.map((l) => l.inode)));
  for (const l of all) l.pids = map.get(l.inode) ?? [];
  return {
    ports: ports.map((port) => ({
      port,
      ipv4Inspected: v4 !== null,
      ipv6Inspected: v6 !== null,
      listeners: all.filter((l) => l.port === port),
    })),
    unreadablePids: unreadable,
  };
}

/** Resolves a tool on an explicit search path. Returns the canonical absolute path or null. */
export function resolveTool(name: string, searchPath: string): string | null {
  for (const dir of searchPath.split(':')) {
    if (!dir || !path.isAbsolute(dir)) continue;
    const candidate = path.join(dir, name);
    try {
      const st = fs.statSync(candidate);
      if (!st.isFile()) continue;
      fs.accessSync(candidate, fs.constants.X_OK);
      return fs.realpathSync(candidate);
    } catch {
      continue;
    }
  }
  return null;
}

export function parseDbusNameReply(text: string): string[] {
  const names: string[] = [];
  const re = /^\s*string "([^"]*)"\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) names.push(m[1]);
  return names;
}

export type ExecFileFn = (file: string, args: string[]) => string;

const defaultExecFile: ExecFileFn = (file, args) =>
  execFileSync(file, args, { env: {}, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] });

/** Lists owned and activatable names on the given bus address, with an empty environment. */
export function queryBusNames(
  address: string,
  dbusSendPath: string,
  execImpl: ExecFileFn = defaultExecFile,
): { names: string[]; activatable: string[] } {
  const call = (method: string): string[] => {
    const out = execImpl(dbusSendPath, [
      `--bus=${address}`,
      '--print-reply',
      '--dest=org.freedesktop.DBus',
      '/org/freedesktop/DBus',
      `org.freedesktop.DBus.${method}`,
    ]);
    if (!/method return/.test(out)) throw new IndeterminateError(`unexpected ${method} reply`);
    return parseDbusNameReply(out);
  };
  return { names: call('ListNames'), activatable: call('ListActivatableNames') };
}

/** Returns every `.bloom` found as a path component or as a child of an ancestor of p. */
export function findBloomAncestors(p: string): string[] {
  const found: string[] = [];
  let dir = path.resolve(p);
  if (dir.split(path.sep).includes('.bloom')) found.push(dir);
  for (;;) {
    const candidate = path.join(dir, '.bloom');
    try {
      fs.lstatSync(candidate);
      found.push(candidate);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw new IndeterminateError('ancestor not inspectable');
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return found;
}

/** Lists Bloom binary names resolvable from PATH entries outside root. */
export function scanPathForBloomNames(pathEntries: string[], root: string): string[] {
  const found: string[] = [];
  for (const entry of pathEntries) {
    if (!path.isAbsolute(entry) || isWithin(entry, root)) continue;
    for (const name of BLOOM_BINARY_NAMES) {
      const candidate = path.join(entry, name);
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        found.push(candidate);
      } catch {
        // not present
      }
    }
  }
  return found;
}

export type ForbiddenStats = Record<string, string | null>;

/** Stat-only fingerprint of forbidden paths. null means absent. Never reads contents. */
export function statForbiddenPaths(paths: string[]): ForbiddenStats {
  const out: ForbiddenStats = {};
  for (const p of paths) {
    try {
      const st = fs.lstatSync(p);
      out[p] = `${st.mtimeMs}:${st.ctimeMs}:${st.ino}`;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') out[p] = null;
      else throw new IndeterminateError('forbidden path not inspectable');
    }
  }
  return out;
}

export function diffForbiddenStats(before: ForbiddenStats, after: ForbiddenStats): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return Array.from(keys).filter((k) => before[k] !== after[k]);
}

function attempt<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Phase runners
// ---------------------------------------------------------------------------

export interface PhaseAOutput {
  result: PreflightResult;
  evidence: PhaseAEvidence;
}

/** Phase A. Reads the harness input environment (keys, PATH for tool lookup, XDG_DATA_HOME). */
export function runPhaseA(checkout: string): PhaseAOutput {
  const input = process.env;
  const searchPath = input.PATH ?? '';
  const tools: Record<string, string | null> = {};
  for (const t of REQUIRED_HOST_TOOLS) tools[t] = attempt(() => resolveTool(t, searchPath)) ?? null;
  const evidence: PhaseAEvidence = {
    platform: process.platform,
    realHome: attempt(readRealHome),
    checkout: attempt(() => fs.realpathSync(checkout)),
    inputEnvKeys: Object.keys(input),
    inputXdgDataHome: input.XDG_DATA_HOME,
    harnessTmpDir: attempt(() => fs.realpathSync(os.tmpdir())),
    tools,
  };
  return { result: validateIsolationEvidence(evidence, 'A'), evidence };
}

export interface PhaseBContext {
  phaseA: PhaseAEvidence;
  root: string;
  cwd: string;
  childEnv: Record<string, string>;
  layout: LayoutEvidence | null | undefined;
  bloomBinaries: Record<string, string>;
  dbusSendPath: string;
  procRoot?: string;
  requiredPorts?: readonly number[];
  execImpl?: ExecFileFn;
}

export interface PhaseBOutput {
  result: PreflightResult;
  evidence: PhaseBEvidence;
  forbiddenList: string[];
  forbiddenBaseline: ForbiddenStats | undefined;
}

export function runPhaseB(ctx: PhaseBContext): PhaseBOutput {
  const procRoot = ctx.procRoot ?? '/proc';
  const requiredPorts = ctx.requiredPorts ?? REQUIRED_PORTS;
  const a = ctx.phaseA;
  const rootStat = attempt(() => fs.lstatSync(ctx.root));
  const env = ctx.childEnv;
  const formulaEnv: FormulaEnv = { HOME: env.HOME, XDG_DATA_HOME: env.XDG_DATA_HOME };
  const pathEntries = typeof env.PATH === 'string' ? env.PATH.split(':') : undefined;
  const busAddress = env.DBUS_SESSION_BUS_ADDRESS;

  const ancestors = attempt(() => Array.from(new Set([...findBloomAncestors(ctx.root), ...findBloomAncestors(ctx.cwd)])));
  const busNames = busAddress ? attempt(() => queryBusNames(busAddress, ctx.dbusSendPath, ctx.execImpl)) : undefined;
  const socketStat = attempt(() => fs.lstatSync(busSocketPath(ctx.root)));
  const ports = attempt(() => inspectPorts(requiredPorts, procRoot).ports);
  const forbiddenList =
    a.realHome && a.checkout ? forbiddenPaths(a.realHome, a.checkout, a.inputXdgDataHome) : [];
  const forbiddenBaseline = forbiddenList.length > 0 ? attempt(() => statForbiddenPaths(forbiddenList)) : undefined;

  const evidence: PhaseBEvidence = {
    ...a,
    processUid: typeof process.getuid === 'function' ? process.getuid() : undefined,
    root: {
      path: ctx.root,
      mode: rootStat?.mode,
      uid: rootStat?.uid,
      isSymlink: rootStat ? rootStat.isSymbolicLink() : undefined,
      realpath: attempt(() => fs.realpathSync(ctx.root)),
    },
    cwd: ctx.cwd,
    bloomAncestors: ancestors,
    resolvedRoots: {
      conductor: conductorBaseLinux(formulaEnv),
      nucleus: resolveAppDataDirLinux(formulaEnv),
      supervisor: getBloomNucleusBaseLinux(formulaEnv),
      brainFrozen: ctx.bloomBinaries.brain ? brainFrozenBase(ctx.bloomBinaries.brain) : null,
    },
    bloomBinaries: ctx.bloomBinaries,
    pathEntries,
    bloomNamesOnPathOutsideRoot: pathEntries ? attempt(() => scanPathForBloomNames(pathEntries, ctx.root)) : undefined,
    layout: ctx.layout,
    childEnv: env,
    bus: {
      address: busAddress,
      socketUid: socketStat && socketStat.isSocket() ? socketStat.uid : undefined,
      names: busNames?.names,
      activatable: busNames?.activatable,
    },
    ports,
  };
  return {
    result: validateIsolationEvidence(evidence, 'B', requiredPorts),
    evidence,
    forbiddenList,
    forbiddenBaseline,
  };
}

export interface PhaseCContext {
  root: string;
  runId: string;
  registeredSids: number[];
  coreWindowUrl: string | undefined;
  forbiddenList: string[];
  forbiddenBaseline: ForbiddenStats | undefined;
  procRoot?: string;
  requiredPorts?: readonly number[];
}

export interface PhaseCOutput {
  result: PreflightResult;
  evidence: PhaseCEvidence;
}

export function collectPortOwners(requiredPorts: readonly number[], procRoot: string, runId: string): PortOwnerEvidence[] {
  const inspection = inspectPorts(requiredPorts, procRoot);
  return inspection.ports.map((p) => {
    if (!p.ipv4Inspected || !p.ipv6Inspected) return { port: p.port, resolved: false, owners: [] };
    const resolved = p.listeners.every((l) => l.pids.length > 0);
    const pids = Array.from(new Set(p.listeners.flatMap((l) => l.pids)));
    const owners: PortOwner[] = pids.map((pid) => {
      const env = readEnvironSubset(procRoot, pid);
      const stat = attempt(() => readProcStat(procRoot, pid));
      return {
        pid,
        runIdMatch: env && env.readable ? env.runId === runId : null,
        home: env && env.readable ? env.home : null,
        sid: stat ? stat.session : null,
      };
    });
    return { port: p.port, resolved, owners };
  });
}

export function runPhaseC(ctx: PhaseCContext): PhaseCOutput {
  const procRoot = ctx.procRoot ?? '/proc';
  const requiredPorts = ctx.requiredPorts ?? REQUIRED_PORTS;
  const baseline = ctx.forbiddenBaseline;
  const evidence: PhaseCEvidence = {
    root: ctx.root,
    runId: ctx.runId,
    registeredSids: ctx.registeredSids,
    portOwners: attempt(() => collectPortOwners(requiredPorts, procRoot, ctx.runId)),
    coreWindowUrl: ctx.coreWindowUrl,
    forbiddenPathsChanged:
      baseline && ctx.forbiddenList.length > 0
        ? attempt(() => diffForbiddenStats(baseline, statForbiddenPaths(ctx.forbiddenList))) ?? null
        : null,
  };
  return { result: validateIsolationEvidence(evidence, 'C', requiredPorts), evidence };
}
