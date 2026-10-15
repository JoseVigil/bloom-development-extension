/** Functional containment checks. A normal token can still access productive paths. */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import type { FunctionalRoot } from './windows-functional-root';

export const FUNCTIONAL_PORTS = [5173, 48215, 4124, 5678, 7233, 8233, 11434, 8787] as const;
export type Listener = { localAddress: string; localPort: number; owningProcess: number };
export type ProductControlPaths = { files: readonly string[]; directories: readonly string[] };
export type ProductControlSnapshot = { fileDigests: Record<string, string>; directoryMetadataDigests: Record<string, string> };

export function withinFunctionalRoot(candidate: string, root: string): boolean {
  if (!path.win32.isAbsolute(candidate) || !path.win32.isAbsolute(root)) return false;
  const relative = path.win32.relative(path.win32.normalize(root), path.win32.normalize(candidate));
  return relative === '' || (relative !== '..' && !relative.startsWith('..\\') && !path.win32.isAbsolute(relative));
}

export function makeFunctionalChildEnvironment(fixture: FunctionalRoot, systemRoot: string): Record<string, string> {
  if (process.platform !== 'win32' || !path.win32.isAbsolute(systemRoot)) throw new Error('functional_environment_platform_invalid');
  const root = fixture.root;
  const home = path.win32.join(root, 'home');
  const drive = path.win32.parse(home).root.slice(0, 2);
  const appData = path.win32.join(home, 'AppData', 'Local', 'BloomNucleus');
  const result: Record<string, string> = {
    APPDATA: path.win32.join(home, 'AppData', 'Roaming'),
    LOCALAPPDATA: path.win32.join(home, 'AppData', 'Local'),
    USERPROFILE: home, HOME: home, HOMEDRIVE: drive, HOMEPATH: home.slice(drive.length),
    TEMP: path.win32.join(root, 'tmp'), TMP: path.win32.join(root, 'tmp'),
    SystemRoot: systemRoot, WINDIR: systemRoot,
    PATH: `${path.win32.join(root, 'bin')};${path.win32.join(systemRoot, 'System32')}`,
    BLOOM_APPDATA_DIR: appData,
    BLOOM_NUCLEUS_BASE_DIR_OVERRIDE: appData,
    BLOOM_NUCLEUS_PATH: fixture.workspace,
    RUNNER_CORE_RUN_ID: fixture.runId,
  };
  const expected = ['APPDATA','LOCALAPPDATA','USERPROFILE','HOME','HOMEDRIVE','HOMEPATH','TEMP','TMP',
    'SystemRoot','WINDIR','PATH','BLOOM_APPDATA_DIR','BLOOM_NUCLEUS_BASE_DIR_OVERRIDE','BLOOM_NUCLEUS_PATH','RUNNER_CORE_RUN_ID'];
  if (Object.keys(result).sort().join('|') !== expected.sort().join('|')) throw new Error('functional_environment_keys_invalid');
  for (const key of ['APPDATA','LOCALAPPDATA','USERPROFILE','HOME','TEMP','TMP','BLOOM_APPDATA_DIR','BLOOM_NUCLEUS_BASE_DIR_OVERRIDE','BLOOM_NUCLEUS_PATH']) {
    if (!withinFunctionalRoot(result[key], root)) throw new Error(`functional_environment_escape:${key}`);
  }
  return result;
}

export function inspectFunctionalPorts(ports: readonly number[] = FUNCTIONAL_PORTS): Listener[] {
  if (process.platform !== 'win32') throw new Error('functional_ports_require_windows');
  const systemRoot = process.env.SystemRoot;
  if (!systemRoot || !/^[A-Za-z]:\\/.test(systemRoot)) throw new Error('system_root_unavailable');
  const netstat = path.win32.join(systemRoot, 'System32', 'netstat.exe');
  let output: string;
  try {
    output = execFileSync(netstat, ['-ano','-p','TCP'], {
      encoding:'utf8', windowsHide:true, timeout:15_000, stdio:['ignore','pipe','pipe'],
      env:{ SystemRoot:systemRoot, WINDIR:systemRoot, PATH:path.win32.dirname(netstat) },
    });
  } catch { throw new Error('functional_port_inspection_failed'); }
  return parseFunctionalNetstat(output, ports);
}

export function parseFunctionalNetstat(output: string, ports: readonly number[]): Listener[] {
  const listeners: Listener[] = [];
  for (const line of output.split(/\r?\n/)) {
    if (!/^\s*TCP\s/i.test(line)) continue;
    const fields = line.trim().split(/\s+/);
    if (fields.length !== 5) throw new Error('functional_port_inventory_invalid');
    if (fields[3].toUpperCase() !== 'LISTENING') continue;
    const match = line.match(/^\s*TCP\s+(\S+)\s+\S+\s+LISTENING\s+(\d+)\s*$/i);
    if (!match) {
      throw new Error('functional_port_inventory_invalid');
    }
    const separator = match[1].lastIndexOf(':');
    const port = Number(match[1].slice(separator + 1));
    if (!ports.includes(port)) continue;
    const pid = Number(match[2]);
    if (!Number.isInteger(pid) || pid < 1 || separator < 1) throw new Error('functional_port_inventory_invalid');
    listeners.push({ localAddress: match[1].slice(0, separator), localPort: port, owningProcess: pid });
  }
  return listeners;
}

export function assertFunctionalPortsFree(listeners: readonly Listener[]): void {
  if (listeners.length) throw new Error(`functional_port_occupied:${listeners.map(item => item.localPort).sort((a,b)=>a-b).join(',')}`);
}

export function verifyFunctionalFixture(fixture: FunctionalRoot): void {
  for (const item of [fixture.executable, fixture.nodeExecutable, fixture.appData, fixture.nucleusJson,
    fixture.webviewDir, fixture.contractsDir, fixture.orreryDir, fixture.playcanvasDir,
    fixture.workspace, fixture.projectPath, fixture.manifestPath]) {
    if (!withinFunctionalRoot(item, fixture.root) || !fs.existsSync(item)) throw new Error('functional_fixture_path_invalid');
  }
  const data = JSON.parse(fs.readFileSync(fixture.nucleusJson, 'utf8')) as {
    installation?: { completed?: boolean };
    onboarding?: { completed?: boolean; active_org_slug?: string; active_project_id?: string;
      pending_genesis_launch?: { mandateLaunchId?: string; projectId?: string; project?: string; projectPath?: string };
      organizations?: Array<{ org_slug?: string; organization_id?: string; tenant_id?: string; workspace_path?: string;
        projects?: Array<{ project_id?: string; project_name?: string; project_path?: string; genesis_launch_required?: boolean }> }> };
  };
  const onboarding = data.onboarding;
  const matches = onboarding?.organizations?.filter(org => org.org_slug === fixture.orgSlug) ?? [];
  const projects = matches[0]?.projects?.filter(project => project.project_id === fixture.projectId) ?? [];
  if (data.installation?.completed !== true || onboarding?.completed !== true ||
      onboarding.active_org_slug !== fixture.orgSlug || matches.length !== 1 ||
      matches[0].organization_id !== fixture.organizationId || matches[0].tenant_id !== fixture.tenantId ||
      matches[0].workspace_path !== fixture.workspace || projects.length !== 1 ||
      projects[0].genesis_launch_required !== true || projects[0].project_path !== fixture.projectPath ||
      onboarding.active_project_id !== fixture.projectId ||
      onboarding.pending_genesis_launch?.projectId !== fixture.projectId ||
      !/^[0-9a-f-]{36}$/i.test(onboarding.pending_genesis_launch.mandateLaunchId || '') ||
      onboarding.pending_genesis_launch.projectPath !== fixture.projectPath) throw new Error('functional_fixture_identity_invalid');
}

/** Hash-only control: reads exactly the named files. Directory controls hash
 * names, sizes and mtimes, never file payloads. This detects changes, but a
 * normal token is still capable of accessing productive data. */
export function snapshotProductControls(paths: ProductControlPaths): ProductControlSnapshot {
  if (!paths.files.length || !paths.directories.length) throw new Error('functional_product_controls_incomplete');
  const fileDigests: Record<string, string> = {};
  const directoryMetadataDigests: Record<string, string> = {};
  for (const file of paths.files) {
    if (!path.win32.isAbsolute(file) || !fs.lstatSync(file).isFile()) throw new Error('functional_product_control_invalid');
    const hash = createHash('sha256');
    const fd = fs.openSync(file, 'r');
    try {
      const buffer = Buffer.allocUnsafe(1024 * 1024);
      for (;;) { const count = fs.readSync(fd, buffer, 0, buffer.length, null); if (!count) break; hash.update(buffer.subarray(0, count)); }
    } finally { fs.closeSync(fd); }
    fileDigests[path.win32.normalize(file)] = hash.digest('hex');
  }
  for (const directory of paths.directories) {
    if (!path.win32.isAbsolute(directory) || !fs.lstatSync(directory).isDirectory()) throw new Error('functional_product_control_invalid');
    const hash = createHash('sha256');
    const walk = (current: string): void => {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const absolute = path.join(current, entry.name);
        const stat = fs.lstatSync(absolute);
        if (stat.isSymbolicLink()) throw new Error('functional_product_control_reparse');
        hash.update(path.win32.relative(directory, absolute).replace(/\\/g, '/'));
        hash.update(`|${stat.size}|${stat.mtimeMs}|${stat.mode}|`);
        if (stat.isDirectory()) walk(absolute);
        else if (!stat.isFile()) throw new Error('functional_product_control_special');
      }
    };
    walk(directory);
    directoryMetadataDigests[path.win32.normalize(directory)] = hash.digest('hex');
  }
  return { fileDigests, directoryMetadataDigests };
}

export function assertProductControlsUnchanged(before: ProductControlSnapshot, after: ProductControlSnapshot): void {
  for (const field of ['fileDigests', 'directoryMetadataDigests'] as const) {
    const earlier = before[field];
    const later = after[field];
    const keys = Object.keys(earlier).sort();
    if (keys.join('|') !== Object.keys(later).sort().join('|') ||
        keys.some(key => earlier[key] !== later[key])) throw new Error('functional_product_control_changed');
  }
}
