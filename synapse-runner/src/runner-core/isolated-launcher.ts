/**
 * RUNNER CORE — isolated launcher.
 *
 * Builds the child environment strictly from R, starts the private D-Bus
 * daemon and the private Xvfb display, records every spawned process in
 * R/.runner-core/processes.json, and launches Conductor only after phases A
 * and B have passed. The child environment never inherits anything from the
 * harness: no host display, no host X authority, no host bus.
 *
 * Runtime files it may write inside R:
 *   R/dbus/session.conf
 *   R/.runner-core/processes.json
 */
import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess, SpawnOptions } from 'child_process';
import { Readable } from 'stream';
import {
  CHILD_ENV_ALLOWLIST,
  PreflightResult,
  RUN_ID_VAR,
  SECRET_SERVICE_NAMES,
  busSocketPath,
  isPrivateBusAddress,
  isWithin,
  readProcStat,
  rootHome,
} from './isolation-preflight';
import {
  PROCESSES_FILE,
  ProcessRecord,
  ProcessRegistry,
  recordCreatedPath,
  runnerCorePath,
} from './isolated-root-assembler';

export const XVFB_ARGS: readonly string[] = ['-displayfd', '3', '-nolisten', 'tcp', '-screen', '0', '1280x800x24'];
export const DEFAULT_LANG = 'C.UTF-8';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ORG_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

export interface VerifiedBus {
  address: string;
  pid: number;
  verified: true;
}

export interface VerifiedDisplay {
  display: string;
  pid: number;
  verified: true;
}

export type SpawnFn = (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess;

// ---------------------------------------------------------------------------
// Child environment
// ---------------------------------------------------------------------------

export interface ChildEnvOptions {
  root: string;
  runId: string;
  bus?: VerifiedBus;
  display?: VerifiedDisplay;
  bloomBinDirs: string[];
  trustedToolDirs: string[];
  lang?: string;
}

/** Builds the exact allowlisted child environment. Throws without a verified bus and display. */
export function buildChildEnv(o: ChildEnvOptions): Record<string, string> {
  if (!path.isAbsolute(o.root)) throw new Error('root_not_absolute');
  if (!UUID_RE.test(o.runId)) throw new Error('run_id_invalid');
  if (!o.bus || o.bus.verified !== true || !isPrivateBusAddress(o.bus.address, o.root)) throw new Error('bus_not_verified');
  if (!o.display || o.display.verified !== true || !/^:\d+$/.test(o.display.display)) throw new Error('display_not_verified');
  for (const d of o.bloomBinDirs) {
    if (!path.isAbsolute(d) || !isWithin(d, o.root)) throw new Error('bloom_bin_dir_outside_root');
  }
  for (const d of o.trustedToolDirs) {
    if (!path.isAbsolute(d)) throw new Error('tool_dir_not_absolute');
  }
  const entries = [...o.bloomBinDirs, ...o.trustedToolDirs];
  if (entries.length === 0) throw new Error('path_empty');
  const env: Record<string, string> = {
    HOME: rootHome(o.root),
    XDG_DATA_HOME: path.join(o.root, 'home', '.local', 'share'),
    XDG_CONFIG_HOME: path.join(o.root, 'home', '.config'),
    XDG_CACHE_HOME: path.join(o.root, 'home', '.cache'),
    XDG_STATE_HOME: path.join(o.root, 'home', '.local', 'state'),
    XDG_RUNTIME_DIR: path.join(o.root, 'run'),
    TMPDIR: path.join(o.root, 'tmp'),
    PATH: entries.join(':'),
    LANG: o.lang ?? DEFAULT_LANG,
    DISPLAY: o.display.display,
    DBUS_SESSION_BUS_ADDRESS: o.bus.address,
    [RUN_ID_VAR]: o.runId,
  };
  const keys = Object.keys(env).sort();
  const allowed = [...CHILD_ENV_ALLOWLIST].sort();
  if (keys.length !== allowed.length || keys.some((k, i) => k !== allowed[i])) throw new Error('child_env_not_allowlisted');
  return env;
}

/** Environment for the private bus and display daemons: token and R locations only. */
export function daemonEnv(root: string, runId: string): Record<string, string> {
  return {
    HOME: rootHome(root),
    XDG_RUNTIME_DIR: path.join(root, 'run'),
    TMPDIR: path.join(root, 'tmp'),
    [RUN_ID_VAR]: runId,
  };
}

// ---------------------------------------------------------------------------
// Process registry
// ---------------------------------------------------------------------------

export function readRegistry(root: string): ProcessRegistry {
  return JSON.parse(fs.readFileSync(runnerCorePath(root, PROCESSES_FILE), 'utf8')) as ProcessRegistry;
}

/** Records a spawned process with its SID, PGID and starttime. */
export function registerProcess(root: string, role: string, pid: number, procRoot = '/proc'): ProcessRecord {
  const registry = readRegistry(root);
  const stat = readProcStat(procRoot, pid);
  if (!stat) throw new Error('process_gone_before_registration');
  if (stat.session === registry.harnessSid) throw new Error('child_shares_harness_session');
  if (stat.starttime < registry.runStartTicks) throw new Error('process_predates_run');
  const record: ProcessRecord = {
    role,
    pid,
    sid: stat.session,
    pgid: stat.pgrp,
    starttime: stat.starttime,
    startedAt: new Date().toISOString(),
  };
  registry.processes.push(record);
  fs.writeFileSync(runnerCorePath(root, PROCESSES_FILE), JSON.stringify(registry, null, 2) + '\n', { mode: 0o600 });
  return record;
}

// ---------------------------------------------------------------------------
// Private D-Bus
// ---------------------------------------------------------------------------

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function privateBusConfigPath(root: string): string {
  return path.join(root, 'dbus', 'session.conf');
}

/** Private session bus: one unix socket in R, EXTERNAL auth, no service directories, no includes. */
export function privateBusConfig(root: string): string {
  return [
    '<!DOCTYPE busconfig PUBLIC "-//freedesktop//DTD D-Bus Bus Configuration 1.0//EN"',
    ' "http://www.freedesktop.org/standards/dbus/1.0/busconfig.dtd">',
    '<busconfig>',
    '  <type>session</type>',
    `  <listen>unix:path=${xmlEscape(busSocketPath(root))}</listen>`,
    '  <auth>EXTERNAL</auth>',
    '  <policy context="default">',
    '    <allow send_destination="*" eavesdrop="true"/>',
    '    <allow eavesdrop="true"/>',
    '    <allow own="*"/>',
    '  </policy>',
    '</busconfig>',
    '',
  ].join('\n');
}

export function writePrivateBusConfig(root: string): string {
  const p = privateBusConfigPath(root);
  fs.writeFileSync(p, privateBusConfig(root), { flag: 'wx', mode: 0o600 });
  recordCreatedPath(root, p);
  return p;
}

function waitForSpawn(child: ChildProcess): Promise<number> {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('spawn', () => {
      if (typeof child.pid === 'number') resolve(child.pid);
      else reject(new Error('spawn_without_pid'));
    });
  });
}

function readFirstLine(stream: Readable | null | undefined, timeoutMs: number, label: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!stream) {
      reject(new Error(`${label}_stream_missing`));
      return;
    }
    let buf = '';
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`${label}_timeout`));
    }, timeoutMs);
    const onData = (chunk: Buffer | string): void => {
      buf += chunk.toString();
      const nl = buf.indexOf('\n');
      if (nl >= 0) {
        cleanup();
        resolve(buf.slice(0, nl).trim());
      }
    };
    const onEnd = (): void => {
      cleanup();
      reject(new Error(`${label}_closed`));
    };
    const cleanup = (): void => {
      clearTimeout(timer);
      stream.off('data', onData);
      stream.off('end', onEnd);
    };
    stream.on('data', onData);
    stream.once('end', onEnd);
  });
}

/** Verifies the printed address points at R/run/bus and that the socket belongs to this uid. */
export function verifyBusAddress(address: string, root: string, uid: number): void {
  if (!isPrivateBusAddress(address, root)) throw new Error('bus_address_unexpected');
  const st = fs.lstatSync(busSocketPath(root));
  if (!st.isSocket()) throw new Error('bus_socket_not_socket');
  if (st.uid !== uid) throw new Error('bus_socket_owner_mismatch');
}

export interface StartDaemonOptions {
  root: string;
  runId: string;
  binaryPath: string;
  spawnImpl?: SpawnFn;
  procRoot?: string;
  timeoutMs?: number;
}

export async function startPrivateBus(o: StartDaemonOptions): Promise<VerifiedBus> {
  const conf = privateBusConfigPath(o.root);
  if (!fs.existsSync(conf)) throw new Error('bus_config_missing');
  const spawnImpl = o.spawnImpl ?? spawn;
  const child = spawnImpl(o.binaryPath, [`--config-file=${conf}`, '--nofork', '--print-address=1'], {
    detached: true,
    cwd: o.root,
    env: daemonEnv(o.root, o.runId),
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const pid = await waitForSpawn(child);
  registerProcess(o.root, 'dbus-daemon', pid, o.procRoot);
  const address = await readFirstLine(child.stdout, o.timeoutMs ?? 5000, 'bus_address');
  child.stdout?.destroy();
  child.unref();
  const uid = typeof process.getuid === 'function' ? process.getuid() : -1;
  verifyBusAddress(address, o.root, uid);
  return { address, pid, verified: true };
}

export async function startPrivateDisplay(o: StartDaemonOptions): Promise<VerifiedDisplay> {
  const spawnImpl = o.spawnImpl ?? spawn;
  const child = spawnImpl(o.binaryPath, [...XVFB_ARGS], {
    detached: true,
    cwd: o.root,
    env: daemonEnv(o.root, o.runId),
    stdio: ['ignore', 'ignore', 'ignore', 'pipe'],
  });
  const pid = await waitForSpawn(child);
  registerProcess(o.root, 'xvfb', pid, o.procRoot);
  const line = await readFirstLine(child.stdio[3] as Readable | null, o.timeoutMs ?? 10000, 'display');
  (child.stdio[3] as Readable | null)?.destroy();
  child.unref();
  if (!/^\d+$/.test(line)) throw new Error('display_number_invalid');
  return { display: `:${line}`, pid, verified: true };
}

export function verifySecretServiceAbsent(names: { names: string[]; activatable: string[] }): void {
  for (const n of SECRET_SERVICE_NAMES) {
    if (names.names.includes(n) || names.activatable.includes(n)) throw new Error(`secret_service_present:${n}`);
  }
}

// ---------------------------------------------------------------------------
// Conductor launch
// ---------------------------------------------------------------------------

export interface ElectronAppLike {
  process(): { pid?: number };
}

export interface LaunchRequest {
  executablePath: string;
  args: string[];
  env: Record<string, string>;
  cwd: string;
}

export type LaunchFn = (req: LaunchRequest) => Promise<ElectronAppLike>;

export type PhaseCFn = (input: { app: ElectronAppLike; registeredSids: number[] }) => Promise<PreflightResult> | PreflightResult;

export interface LaunchContext {
  phaseA: PreflightResult;
  phaseB: PreflightResult;
  checkout: string;
  root: string;
  runId: string;
  childEnv: Record<string, string>;
  orgSlug: string;
  phaseC: PhaseCFn;
  launchImpl?: LaunchFn;
  procRoot?: string;
}

export class PhaseCFailedError extends Error {
  constructor(public readonly result: PreflightResult) {
    super('phase_c_failed');
    this.name = 'PhaseCFailedError';
  }
}

const defaultLaunch: LaunchFn = async (req) => {
  const pw = await import('@playwright/test');
  return pw._electron.launch({ executablePath: req.executablePath, args: req.args, env: req.env, cwd: req.cwd });
};

export function conductorPaths(checkout: string): { conductorDir: string; electronDist: string; executablePath: string } {
  const conductorDir = path.join(checkout, 'installer', 'conductor', 'workspace');
  const electronDist = path.join(conductorDir, 'node_modules', 'electron', 'dist');
  return { conductorDir, electronDist, executablePath: path.join(electronDist, 'electron') };
}

export async function launchConductorIsolated(ctx: LaunchContext): Promise<{ app: ElectronAppLike; pid: number; phaseC: PreflightResult }> {
  if (ctx.phaseA.phase !== 'A' || !ctx.phaseA.pass || ctx.phaseA.failures.length > 0) throw new Error('phase_a_not_passed');
  if (ctx.phaseB.phase !== 'B' || !ctx.phaseB.pass || ctx.phaseB.failures.length > 0) throw new Error('phase_b_not_passed');

  const keys = Object.keys(ctx.childEnv).sort();
  const allowed = [...CHILD_ENV_ALLOWLIST].sort();
  if (keys.length !== allowed.length || keys.some((k, i) => k !== allowed[i])) throw new Error('child_env_not_allowlisted');
  if (ctx.childEnv.HOME !== rootHome(ctx.root) || ctx.childEnv[RUN_ID_VAR] !== ctx.runId) throw new Error('child_env_not_bound_to_root');

  const { conductorDir, electronDist, executablePath } = conductorPaths(ctx.checkout);
  const realExe = fs.realpathSync(executablePath);
  if (!isWithin(realExe, fs.realpathSync(electronDist))) throw new Error('electron_outside_checkout_dist');

  if (!ORG_SLUG_RE.test(ctx.orgSlug)) throw new Error('org_slug_invalid');
  const cwd = path.join(ctx.root, 'workspaces', ctx.orgSlug);
  const cwdStat = fs.lstatSync(cwd);
  if (!cwdStat.isDirectory() || cwdStat.isSymbolicLink() || !isWithin(fs.realpathSync(cwd), ctx.root)) {
    throw new Error('workspace_cwd_invalid');
  }

  const launch = ctx.launchImpl ?? defaultLaunch;
  const app = await launch({ executablePath: realExe, args: [conductorDir, '--no-sandbox'], env: { ...ctx.childEnv }, cwd });
  const pid = app.process().pid;
  if (typeof pid !== 'number') throw new Error('electron_pid_unknown');
  registerProcess(ctx.root, 'electron', pid, ctx.procRoot);

  const registeredSids = readRegistry(ctx.root).processes.map((p) => p.sid);
  const phaseC = await ctx.phaseC({ app, registeredSids });
  if (phaseC.phase !== 'C' || !phaseC.pass) throw new PhaseCFailedError(phaseC);
  return { app, pid, phaseC };
}
