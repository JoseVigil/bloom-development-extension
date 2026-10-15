import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { assertNoWindowsReparsePoints, sha256File } from './windows-isolated-root-assembler';

export interface GenesisBackendRoot {
  root: string;
  runId: string;
  workspace: string;
  nucleusRoot: string;
  projectPath: string;
  projectId: string;
  mandateLaunchId: string;
  mandatesRoot: string;
  temporalExe: string;
  manifestPath: string;
  brainExe: string;
  aitapExe: string;
  aitapStateDir: string;
}

export function createGenesisBackendRoot(): GenesisBackendRoot {
  if (process.platform !== 'win32') throw new Error('gate2_requires_windows');
  const parent = path.resolve(__dirname, '../..', '.runner-core-temp');
  fs.mkdirSync(parent, { recursive: true });
  assertNoWindowsReparsePoints(parent);
  const root = fs.mkdtempSync(path.join(parent, 'rc-'));
  const runId = randomUUID();
  const aitapStateDir = path.join(os.tmpdir(),'runner-core-aitap',runId);
  const workspace = path.join(root, 'workspace', 'runner-core-gate2');
  const nucleusRoot = path.join(workspace, '.bloom', '.nucleus-runner-core-gate2');
  const projectPath = path.join(workspace, 'fixture-project');
  const mandatesRoot = path.join(nucleusRoot, '.mandates');
  const temporalExe = path.join(root, 'bin', 'temporal.exe');
  const manifestPath = path.join(root, '.runner-core', 'manifest.json');
  const brainExe = path.join(root, 'bin', 'brain', 'brain.exe');
  const aitapExe = path.join(root, 'bin', 'aitap', 'aitap.exe');
  const configuredTemporal = process.env.RUNNER_CORE_TEMPORAL_BIN;
  const source = configuredTemporal || path.join(os.homedir(), 'AppData', 'Local', 'BloomNucleus', 'bin', 'temporal', 'temporal.exe');
  try {
    if (configuredTemporal && (!path.win32.isAbsolute(configuredTemporal) || !fs.existsSync(configuredTemporal) ||
      !fs.statSync(configuredTemporal).isFile())) throw new Error('gate2_temporal_override_invalid');
    if (!fs.statSync(source).isFile()) throw new Error('gate2_temporal_binary_missing');
    assertNoWindowsReparsePoints(path.dirname(source));
    for (const dir of [path.dirname(temporalExe), path.dirname(manifestPath), mandatesRoot,
      path.join(nucleusRoot, '.core'), projectPath, path.join(root, 'tmp'),
      path.join(root, 'home', 'AppData', 'Roaming'), path.join(root, 'home', 'AppData', 'Local', 'BloomNucleus'),
      aitapStateDir]) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.copyFileSync(source, temporalExe, fs.constants.COPYFILE_EXCL);
    const brainSource=process.env.RUNNER_CORE_BRAIN_DIST || path.join(os.homedir(), 'AppData', 'Local', 'BloomNucleus', 'bin', 'brain');
    const aitapSource=process.env.RUNNER_CORE_AITAP_DIST || path.join(os.homedir(), 'AppData', 'Local', 'BloomNucleus', 'bin', 'aitap');
    fs.cpSync(brainSource, path.dirname(brainExe), { recursive: true, errorOnExist: true });
    fs.cpSync(aitapSource, path.dirname(aitapExe), { recursive: true, errorOnExist: true });
    if (!fs.statSync(brainExe).isFile() || !fs.statSync(aitapExe).isFile()) throw new Error('gate2_intelligence_binary_missing');
    const sourceDigest = sha256File(source);
    if (sha256File(temporalExe) !== sourceDigest) throw new Error('gate2_temporal_copy_mismatch');
    fs.writeFileSync(path.join(nucleusRoot, '.core', '.nucleus-config.json'),
      JSON.stringify({ organization: { slug: 'runner-core-gate2' } }), { flag: 'wx' });
    fs.writeFileSync(path.join(projectPath, 'README.md'), '# Synthetic Genesis project\n', { flag: 'wx' });
    fs.mkdirSync(path.join(nucleusRoot, '.cache'), { recursive: true });
    fs.writeFileSync(path.join(nucleusRoot, '.cache', '.semantic-index.json'), JSON.stringify({ domains: {} }), { flag: 'wx' });
    const manifest = { version: 1, kind: 'genesis_backend_only', runId, root, temporalSha256: sourceDigest,
      projectId: randomUUID(), mandateLaunchId: randomUUID() };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), { flag: 'wx' });
    return { root, runId, workspace, nucleusRoot, projectPath, mandatesRoot, temporalExe, manifestPath, brainExe, aitapExe,
      aitapStateDir, projectId: manifest.projectId, mandateLaunchId: manifest.mandateLaunchId };
  } catch (error) {
    if (path.dirname(path.resolve(root)).toLowerCase() !== parent.toLowerCase() ||
        !path.basename(root).startsWith('rc-') || fs.lstatSync(root).isSymbolicLink()) {
      throw new Error('gate2_cleanup_path_invalid', { cause: error });
    }
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    fs.rmSync(aitapStateDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    throw error;
  }
}
