/** Windows CORE-00 prototype adapter. Native helper execution is deliberately
 * separate from fake-driven tests; no installed product is a valid input. */
import * as path from 'node:path';
import * as fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { WINDOWS_CORE_PORTS, WindowsCoreEvidence, WindowsCoreResult, makeWindowsCoreEnvironment, validateWindowsCoreEvidence, withinWindowsRoot } from './windows-isolation-preflight';
import { WindowsPackageManifest, assertNoWindowsReparsePoints, inspectWorkspacePackageContent, packageFileList, sha256File } from './windows-isolated-root-assembler';

export interface WindowsNativePrototype {
  inspect(root: string, executable: string): Promise<WindowsCoreEvidence>;
  launch(root: string, executable: string): Promise<{ pid: number; createdAt: string; jobId: string }>;
  stop(jobId: string): Promise<void>;
}

export interface WindowsCoreLaunch {
  pid: number;
  createdAt: string;
  stop(): Promise<void>;
}

type NativeCapabilityOutput = {
  source_token_type?: string;
  restricted_token_created?: boolean;
  restricting_sid_present?: boolean;
  privileges_disabled?: boolean;
  isolation_demonstrated?: boolean;
};

type NativeRootOutput = {
  root?: string;
  run_id?: string;
  dacl_readback?: boolean;
  root_acl_verified?: boolean;
  access_probes?: {
    root_read?: boolean; root_write?: boolean;
    forbidden_read_denied?: boolean; forbidden_write_denied?: boolean;
    forbidden_delete_denied?: boolean; forbidden_write_dac_denied?: boolean;
    forbidden_write_owner_denied?: boolean;
  };
  code?: string;
};

type NativeDesktopJobOutput = {
  root?: string;
  run_id?: string;
  desktop_acl_verified?: boolean;
  job_verified?: boolean;
  child_pid?: number;
  child_created_at?: string;
  grandchild_pid?: number;
  grandchild_created_at?: string;
  code?: string;
};

export type PreparedWindowsRoot = { root: string; runId: string; rootAclVerified: true; probesPassed: true };

const execFileAsync = promisify(execFile);

/** Checks every staged file against the manifest and rejects unlisted files.
 * This is copy-integrity evidence only; it is not a signature or config scan. */
export function verifyStagedPackageManifest(root: string, executable: string): boolean {
  try {
    if (!path.win32.isAbsolute(root) || !withinWindowsRoot(executable, root)) return false;
    const stagedDir = path.win32.join(root, 'bin');
    if (!withinWindowsRoot(executable, stagedDir)) return false;
    assertNoWindowsReparsePoints(stagedDir);
    const manifestPath = path.win32.join(root, '.runner-core', 'manifest.json');
    if (fs.lstatSync(manifestPath).isSymbolicLink()) return false;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as WindowsPackageManifest;
    if (manifest.version !== 1 || !manifest.runId || !Array.isArray(manifest.files) || manifest.files.length === 0) return false;
    if (path.win32.normalize(manifest.root) !== path.win32.normalize(root) ||
        path.win32.normalize(manifest.executable) !== path.win32.normalize(executable)) return false;
    const actual = packageFileList(stagedDir);
    const listed = manifest.files.map((f) => f.path);
    if (actual.length !== listed.length || actual.some((p, i) => p !== listed[i])) return false;
    if (!listed.includes('resources/app.asar') || !listed.includes(path.win32.basename(executable))) return false;
    for (const entry of manifest.files) {
      if (typeof entry.path !== 'string' || entry.path.startsWith('/') || /[\\:\x00-\x1f]/.test(entry.path) ||
          entry.path.split('/').some((part) => part === '' || part === '.' || part === '..') ||
          !Number.isSafeInteger(entry.size) || entry.size < 0 || !/^[a-f0-9]{64}$/.test(entry.sha256)) return false;
      const staged = path.win32.join(stagedDir, entry.path);
      if (!withinWindowsRoot(staged, stagedDir) || !fs.statSync(staged).isFile()) return false;
      if (fs.statSync(staged).size !== entry.size || sha256File(staged) !== entry.sha256) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** A bounded filename/structure policy, not a scan for arbitrary JS literals. */
export function verifyStagedEmbeddedConfiguration(root: string): boolean {
  try {
    const stagedDir = path.win32.join(root, 'bin');
    assertNoWindowsReparsePoints(stagedDir);
    inspectWorkspacePackageContent(stagedDir, packageFileList(stagedDir));
    return true;
  } catch { return false; }
}

export function evidenceFromNativeCapabilities(
  native: NativeCapabilityOutput,
  root: string,
  executable: string,
  manifestVerified: boolean,
  embeddedConfigVerified: boolean,
  rootProof?: NativeRootOutput,
  desktopJobProof?: NativeDesktopJobOutput,
): WindowsCoreEvidence {
  const probes = rootProof?.access_probes;
  const proofMatches = rootProof?.root_acl_verified === true && rootProof.dacl_readback === true &&
    rootProof.code === 'root_acl_and_fixture_probes_passed' &&
    path.win32.normalize(rootProof.root ?? '') === path.win32.normalize(root) &&
    probes?.root_read === true && probes.root_write === true &&
    probes.forbidden_read_denied === true && probes.forbidden_write_denied === true &&
    probes.forbidden_delete_denied === true && probes.forbidden_write_dac_denied === true &&
    probes.forbidden_write_owner_denied === true;
  const desktopBound = proofMatches && desktopJobProof?.root === root &&
    desktopJobProof.run_id === rootProof?.run_id && desktopJobProof.desktop_acl_verified === true;
  const jobBound = desktopBound && desktopJobProof?.job_verified === true &&
    desktopJobProof.code === 'desktop_job_fixture_passed' &&
    Number.isSafeInteger(desktopJobProof.child_pid) && (desktopJobProof.child_pid ?? 0) > 0 &&
    Boolean(desktopJobProof.child_created_at) &&
    Number.isSafeInteger(desktopJobProof.grandchild_pid) && (desktopJobProof.grandchild_pid ?? 0) > 0 &&
    Boolean(desktopJobProof.grandchild_created_at);
  return {
    platform: process.platform,
    root,
    executable,
    stagedManifestVerified: manifestVerified,
    embeddedConfigScanPassed: manifestVerified && embeddedConfigVerified,
    tokenUserVerified: native.source_token_type === 'primary',
    restrictedSidsVerified: native.restricted_token_created === true && native.restricting_sid_present === true,
    removedPrivilegesVerified: native.privileges_disabled === true,
    rootAclVerified: proofMatches,
    rootDaclReadback: proofMatches,
    restrictedChildProbePassed: proofMatches,
    desktopAclVerified: desktopBound,
    jobVerified: jobBound,
    nativeIsolationDemonstrated: native.isolation_demonstrated === true,
    childEnvironment: makeWindowsCoreEnvironment(root, process.env.SystemRoot ?? 'C:\\Windows'),
    accessProbes: proofMatches ? [
      { target: 'root', read: true, write: true, delete: false, writeDac: false, writeOwner: false },
      { target: 'forbidden_fixture', read: false, write: false, delete: false, writeDac: false, writeOwner: false },
    ] : [],
    ports: WINDOWS_CORE_PORTS.map((port) => ({ port, ipv4Inspected: false, ipv6Inspected: false, owners: [] })),
  };
}

/** Real adapter for the current Go helper. It intentionally cannot launch
 * until the helper supplies ACL, desktop, Job Object, port and access probes. */
export class GoWindowsNativePrototype implements WindowsNativePrototype {
  constructor(private readonly helperDir: string) {}

  private async helperJson<T>(args: string[]): Promise<T> {
    let stdout = '';
    try {
      ({ stdout } = await execFileAsync('go', ['run', '.', ...args], {
        cwd: this.helperDir, windowsHide: true, encoding: 'utf8',
      }));
    } catch (error) {
      stdout = (error as Error & { stdout?: string }).stdout ?? '';
      if (!stdout.trim()) throw new Error('native_helper_failed_without_evidence');
    }
    try { return JSON.parse(stdout.trim()) as T; }
    catch { throw new Error('native_helper_json_invalid'); }
  }

  async prepareRoot(): Promise<PreparedWindowsRoot> {
    const result = await this.helperJson<NativeRootOutput>(['prepare-root']);
    const p = result.access_probes;
    if (result.code !== 'root_acl_and_fixture_probes_passed' || result.root_acl_verified !== true ||
        result.dacl_readback !== true || !result.root || !result.run_id ||
        p?.root_read !== true || p.root_write !== true || p.forbidden_read_denied !== true ||
        p.forbidden_write_denied !== true || p.forbidden_delete_denied !== true ||
        p.forbidden_write_dac_denied !== true || p.forbidden_write_owner_denied !== true) {
      throw new Error(`native_root_prepare_failed:${result.code ?? 'unknown'}`);
    }
    return { root: result.root, runId: result.run_id, rootAclVerified: true, probesPassed: true };
  }

  async inspect(root: string, executable: string): Promise<WindowsCoreEvidence> {
    const native = await this.helperJson<NativeCapabilityOutput>(['capabilities']);
    const manifestVerified = verifyStagedPackageManifest(root, executable);
    const embeddedConfigVerified = manifestVerified && verifyStagedEmbeddedConfiguration(root);
    let rootProof: NativeRootOutput | undefined;
    let desktopJobProof: NativeDesktopJobOutput | undefined;
    if (manifestVerified) {
      rootProof = await this.helperJson<NativeRootOutput>(['verify-root', root]);
      const manifest = JSON.parse(fs.readFileSync(path.win32.join(root, '.runner-core', 'manifest.json'), 'utf8')) as WindowsPackageManifest;
      if (rootProof.run_id !== manifest.runId) rootProof = undefined;
      if (rootProof?.root_acl_verified === true && rootProof.dacl_readback === true) {
        desktopJobProof = await this.helperJson<NativeDesktopJobOutput>(['desktop-job-fixture', root]);
      }
    }
    return evidenceFromNativeCapabilities(native, root, executable, manifestVerified, embeddedConfigVerified, rootProof, desktopJobProof);
  }

  async launch(): Promise<{ pid: number; createdAt: string; jobId: string }> {
    throw new Error('native_launch_not_certified');
  }

  async stop(): Promise<void> {
    throw new Error('native_job_not_created');
  }
}

export class WindowsCoreIsolationError extends Error {
  constructor(readonly result: WindowsCoreResult) {
    super(`windows_core_isolation_failed:${result.failures.map((f) => f.code).join(',')}`);
  }
}

export async function launchWindowsCorePrototype(
  native: WindowsNativePrototype,
  root: string,
  executable: string,
): Promise<WindowsCoreLaunch> {
  if (!path.win32.isAbsolute(root) || !withinWindowsRoot(executable, root)) throw new Error('launch_path_outside_root');
  const evidence = await native.inspect(root, executable);
  if (path.win32.normalize(evidence.root ?? '') !== path.win32.normalize(root) ||
      path.win32.normalize(evidence.executable ?? '') !== path.win32.normalize(executable)) throw new Error('native_evidence_binding_mismatch');
  const result = validateWindowsCoreEvidence(evidence);
  if (!result.pass) throw new WindowsCoreIsolationError(result);
  const child = await native.launch(root, executable);
  if (!Number.isSafeInteger(child.pid) || child.pid <= 0 || !child.createdAt || !child.jobId) throw new Error('native_launch_evidence_invalid');
  let stopped = false;
  return {
    pid: child.pid,
    createdAt: child.createdAt,
    stop: async () => {
      if (stopped) return;
      await native.stop(child.jobId);
      stopped = true;
    },
  };
}
