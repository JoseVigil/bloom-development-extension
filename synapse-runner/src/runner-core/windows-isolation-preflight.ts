/** Windows CORE-00 feasibility checks. Evidence must come from the native helper;
 * none of these predicates alone establish OS isolation. */
import * as path from 'node:path';

export const WINDOWS_CORE_PORTS = [5173, 48215, 5678, 4124, 7233, 8233, 11434] as const;
export const WINDOWS_CORE_ENV_KEYS = [
  'APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'HOME', 'HOMEDRIVE', 'HOMEPATH',
  'TEMP', 'TMP', 'PATH', 'SystemRoot', 'WINDIR', 'BLOOM_APPDATA_DIR',
  'BLOOM_NUCLEUS_BASE_DIR_OVERRIDE',
] as const;

export type WindowsCoreFailure = { code: string; detail?: string };
export type WindowsCoreResult = { pass: boolean; failures: WindowsCoreFailure[] };
export type WindowsPortEvidence = {
  port: number;
  ipv4Inspected: boolean;
  ipv6Inspected: boolean;
  owners: Array<{ pid: number; createdAt: string; executable: string; inJob: boolean }>;
};
export type WindowsAccessProbe = {
  target: 'root' | 'forbidden_fixture';
  read: boolean;
  write: boolean;
  delete: boolean;
  writeDac: boolean;
  writeOwner: boolean;
};
export interface WindowsCoreEvidence {
  platform?: string;
  root?: string;
  executable?: string;
  stagedManifestVerified?: boolean;
  embeddedConfigScanPassed?: boolean;
  tokenUserVerified?: boolean;
  restrictedSidsVerified?: boolean;
  removedPrivilegesVerified?: boolean;
  rootAclVerified?: boolean;
  rootDaclReadback?: boolean;
  restrictedChildProbePassed?: boolean;
  desktopAclVerified?: boolean;
  jobVerified?: boolean;
  nativeIsolationDemonstrated?: boolean;
  childEnvironment?: Record<string, string>;
  accessProbes?: WindowsAccessProbe[];
  ports?: WindowsPortEvidence[];
}

export function withinWindowsRoot(candidate: string, root: string): boolean {
  if (!path.win32.isAbsolute(candidate) || !path.win32.isAbsolute(root)) return false;
  const relative = path.win32.relative(path.win32.normalize(root), path.win32.normalize(candidate));
  return relative === '' || (relative !== '..' && !relative.startsWith('..\\') && !path.win32.isAbsolute(relative));
}

export function makeWindowsCoreEnvironment(root: string, systemRoot: string): Record<string, string> {
  if (!path.win32.isAbsolute(root) || !path.win32.isAbsolute(systemRoot)) throw new Error('path_not_absolute');
  const home = path.win32.join(root, 'home');
  const drive = path.win32.parse(home).root.slice(0, 2);
  const result: Record<string, string> = {
    APPDATA: path.win32.join(home, 'AppData', 'Roaming'),
    LOCALAPPDATA: path.win32.join(home, 'AppData', 'Local'),
    USERPROFILE: home,
    HOME: home,
    HOMEDRIVE: drive,
    HOMEPATH: home.slice(drive.length),
    TEMP: path.win32.join(root, 'tmp'),
    TMP: path.win32.join(root, 'tmp'),
    PATH: `${path.win32.join(root, 'bin')};${path.win32.join(systemRoot, 'System32')}`,
    SystemRoot: systemRoot,
    WINDIR: systemRoot,
    BLOOM_APPDATA_DIR: path.win32.join(home, 'AppData', 'Local', 'BloomNucleus'),
    BLOOM_NUCLEUS_BASE_DIR_OVERRIDE: path.win32.join(home, 'AppData', 'Local', 'BloomNucleus'),
  };
  if (Object.keys(result).sort().join('|') !== [...WINDOWS_CORE_ENV_KEYS].sort().join('|')) throw new Error('environment_keys_changed');
  return result;
}

/** Deliberately fail closed on missing, conflicting or unverified native evidence. */
export function validateWindowsCoreEvidence(e: WindowsCoreEvidence): WindowsCoreResult {
  const failures: WindowsCoreFailure[] = [];
  const fail = (code: string, detail?: string): void => { failures.push({ code, detail }); };
  if (e.platform !== 'win32') fail('platform_not_windows');
  if (!e.root || !path.win32.isAbsolute(e.root)) fail('root_invalid');
  if (!e.executable || !e.root || !withinWindowsRoot(e.executable, e.root)) fail('executable_outside_root');
  for (const key of [
    'stagedManifestVerified', 'embeddedConfigScanPassed', 'tokenUserVerified',
    'restrictedSidsVerified', 'removedPrivilegesVerified', 'rootAclVerified',
    'rootDaclReadback', 'restrictedChildProbePassed',
    'desktopAclVerified', 'jobVerified',
    'nativeIsolationDemonstrated',
  ] as const) if (e[key] !== true) fail(`${key}_unverified`);
  if (!e.childEnvironment || !e.root) fail('environment_indeterminate');
  else {
    const actual = Object.keys(e.childEnvironment).sort();
    const expected = [...WINDOWS_CORE_ENV_KEYS].sort();
    if (actual.join('|') !== expected.join('|')) fail('environment_keys_invalid');
    for (const key of ['APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'HOME', 'TEMP', 'TMP', 'BLOOM_APPDATA_DIR', 'BLOOM_NUCLEUS_BASE_DIR_OVERRIDE']) {
      if (!e.childEnvironment[key] || !withinWindowsRoot(e.childEnvironment[key], e.root)) fail('environment_path_outside_root', key);
    }
  }
  const probes = e.accessProbes ?? [];
  const rootProbes = probes.filter((p) => p.target === 'root');
  const deniedProbes = probes.filter((p) => p.target === 'forbidden_fixture');
  if (rootProbes.length !== 1 || !rootProbes[0].read || !rootProbes[0].write) fail('root_access_unverified');
  if (deniedProbes.length !== 1 || Object.entries(deniedProbes[0]).some(([k, v]) => k !== 'target' && v !== false)) fail('forbidden_fixture_access_not_denied');
  for (const port of WINDOWS_CORE_PORTS) {
    const entries = (e.ports ?? []).filter((p) => p.port === port);
    if (entries.length !== 1 || !entries[0].ipv4Inspected || !entries[0].ipv6Inspected) { fail('port_inspection_incomplete', String(port)); continue; }
    for (const owner of entries[0].owners) {
      if (!Number.isSafeInteger(owner.pid) || owner.pid < 1 || !owner.createdAt || !e.root || !withinWindowsRoot(owner.executable, e.root) || !owner.inJob) fail('foreign_or_ambiguous_port_owner', String(port));
    }
  }
  return { pass: failures.length === 0, failures };
}
