/** Disposable Windows Core functional fixture. This is not an OS isolation boundary. */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { assertNoWindowsReparsePoints, inspectWorkspacePackageContent, packageFileList, sha256File } from './windows-isolated-root-assembler';

export interface FunctionalRoot {
  root: string;
  runId: string;
  executable: string;
  appData: string;
  nucleusJson: string;
  webviewDir: string;
  contractsDir: string;
  orreryDir: string;
  playcanvasDir: string;
  nodeExecutable: string;
  workspace: string;
  orgSlug: string;
  organizationId: string;
  tenantId: string;
  projectId: string;
  projectPath: string;
  manifestPath: string;
}

const WEBVIEW_TOP_LEVEL = ['src', 'node_modules', '.svelte-kit', 'package.json', 'package-lock.json', 'svelte.config.js', 'vite.config.ts', 'tsconfig.json'] as const;
const FORBIDDEN_NAME = /^(?:\.env(?:\..*)?|\.dev\.vars|\.aws|\.ssh|\.bloom|nucleus\.json|profiles\.json|credentials?\.json|secrets?\.json)$/i;
const WORKSPACE_TOP_LEVEL = new Set(['bloom-workspace.exe','bloom-conductor-version.ps1','locales','node_modules','resources','shared',
  'chrome_100_percent.pak','chrome_200_percent.pak','d3dcompiler_47.dll','ffmpeg.dll','icudtl.dat','libegl.dll','libglesv2.dll',
  'license.electron.txt','licenses.chromium.html','resources.pak','snapshot_blob.bin','v8_context_snapshot.bin',
  'vk_swiftshader_icd.json','vk_swiftshader.dll','vulkan-1.dll','electron.exe']);

function inspectFunctionalWorkspaceSource(executable: string): { packageDir: string; sourceFiles: string[] } {
  if (process.platform !== 'win32' || path.win32.basename(executable).toLowerCase() !== 'bloom-workspace.exe' ||
      !fs.lstatSync(executable).isFile()) throw new Error('functional_workspace_source_invalid');
  const packageDir = path.win32.dirname(path.win32.resolve(executable));
  assertNoWindowsReparsePoints(packageDir);
  for (const name of fs.readdirSync(packageDir)) {
    if (/^\.rollout-previous-\d+$/.test(name) && fs.lstatSync(path.win32.join(packageDir, name)).isFile()) continue;
    if (!WORKSPACE_TOP_LEVEL.has(name.toLowerCase()) || FORBIDDEN_NAME.test(name)) throw new Error('functional_package_outer_unexpected');
  }
  const sourceFiles = packageFileList(packageDir).filter(item =>
    item.toLowerCase() !== 'electron.exe' && !/^\.rollout-previous-\d+$/.test(item));
  if (!sourceFiles.includes('bloom-workspace.exe') || !sourceFiles.includes('resources/app.asar') ||
      sourceFiles.some(item => item.split('/').some(part => FORBIDDEN_NAME.test(part)))) throw new Error('functional_package_content_invalid');
  return { packageDir, sourceFiles };
}

function within(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function requireSafeParent(parent: string): void {
  if (process.platform !== 'win32') throw new Error('functional_root_requires_windows');
  const normalized = path.resolve(parent).toLowerCase();
  const expected = path.resolve(__dirname, '../..', '.runner-core-temp').toLowerCase();
  if (normalized !== expected) {
    throw new Error('functional_temp_parent_invalid');
  }
  fs.mkdirSync(parent, { recursive: true });
  assertNoWindowsReparsePoints(parent);
}

function stageCurrentCoreBridge(repoSource: string, packageDir: string,
  packageEntries: Array<{ path: string; size: number; sha256: string }>): void {
  const asarCli = path.join(repoSource, 'installer', 'conductor', 'workspace', 'node_modules', '@electron', 'asar', 'bin', 'asar.js');
  const asarPath = path.join(packageDir, 'resources', 'app.asar');
  const unpacked = path.join(packageDir, 'resources', '.runner-core-app');
  const rebuilt = path.join(packageDir, 'resources', 'app.asar.runner-core');
  const overlays = [
    [path.join(repoSource, 'installer', 'conductor', 'workspace', 'core', 'preload_core.js'), path.join(unpacked, 'core', 'preload_core.js')],
    [path.join(repoSource, 'installer', 'conductor', 'workspace', 'onboarding', 'ipc', 'onboarding-handlers.js'), path.join(unpacked, 'onboarding', 'ipc', 'onboarding-handlers.js')],
  ] as const;
  if (![asarCli, asarPath, ...overlays.map(([source]) => source)].every(item => fs.existsSync(item))) {
    throw new Error('functional_core_bridge_source_missing');
  }
  execFileSync(process.execPath, [asarCli, 'extract', asarPath, unpacked], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const [source, target] of overlays) fs.copyFileSync(source, target);
  execFileSync(process.execPath, [asarCli, 'pack', unpacked, rebuilt], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  fs.renameSync(rebuilt, asarPath);
  fs.rmSync(unpacked, { recursive: true, force: true });
  const entry = packageEntries.find(item => item.path.toLowerCase() === 'resources/app.asar');
  if (!entry) throw new Error('functional_core_bridge_manifest_missing');
  entry.size = fs.statSync(asarPath).size;
  entry.sha256 = sha256File(asarPath);
}

function copyRegularTree(source: string, destination: string, names?: readonly string[]): Array<{ path: string; size: number; sha256: string }> {
  const result: Array<{ path: string; size: number; sha256: string }> = [];
  const sourceRoot = path.resolve(source);
  const walk = (current: string): void => {
    const relative = path.relative(sourceRoot, current);
    if (!within(current, sourceRoot)) throw new Error('functional_source_escape');
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink() || (stat.mode & 0o170000) === 0o120000) throw new Error('functional_reparse_point');
    if (relative && relative.split(path.sep).some(part => FORBIDDEN_NAME.test(part))) throw new Error('functional_secret_name');
    const target = path.join(destination, relative);
    if (stat.isDirectory()) {
      fs.mkdirSync(target, { recursive: true });
      const children = relative === '' && names ? names : fs.readdirSync(current);
      for (const child of children) walk(path.join(current, child));
    } else if (stat.isFile()) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(current, target, fs.constants.COPYFILE_EXCL);
      const digest = sha256File(current);
      if (sha256File(target) !== digest) throw new Error('functional_copy_hash_mismatch');
      result.push({ path: relative.replace(/\\/g, '/'), size: stat.size, sha256: digest });
    } else throw new Error('functional_special_source');
  };
  walk(sourceRoot);
  return result.sort((a, b) => a.path.localeCompare(b.path, 'en'));
}

export function createWindowsFunctionalRoot(workspaceExecutable: string, webviewSource: string): FunctionalRoot {
  // Inspect both source trees before creating R; do not copy installed state.
  const workspaceSource = inspectFunctionalWorkspaceSource(workspaceExecutable);
  const webview = path.resolve(webviewSource);
  const repoSource = path.resolve(webview, '..', '..');
  const contractsSource = path.join(repoSource, 'contracts');
  const orrerySource = path.join(repoSource, 'installer', 'conductor', 'workspace', 'core', 'orrery', 'src');
  const playcanvasSource = path.join(repoSource, 'installer', 'conductor', 'workspace', 'core', 'orrery', 'node_modules', 'playcanvas');
  if (!fs.statSync(webview).isDirectory()) throw new Error('functional_webview_missing');
  for (const name of WEBVIEW_TOP_LEVEL) if (!fs.existsSync(path.join(webview, name))) throw new Error(`functional_webview_missing_${name}`);
  assertNoWindowsReparsePoints(webview);
  if (!fs.statSync(contractsSource).isDirectory() || !fs.statSync(orrerySource).isDirectory() ||
      !fs.statSync(playcanvasSource).isDirectory()) throw new Error('functional_alias_source_missing');
  assertNoWindowsReparsePoints(contractsSource);
  assertNoWindowsReparsePoints(orrerySource);
  assertNoWindowsReparsePoints(playcanvasSource);

  const parent = path.resolve(__dirname, '../..', '.runner-core-temp');
  requireSafeParent(parent);
  const root = fs.mkdtempSync(path.join(parent, 'rc-'));
  const runId = randomUUID();
  const appData = path.join(root, 'home', 'AppData', 'Local', 'BloomNucleus');
  const orgSlug = `runner-core-${runId.slice(0, 8)}`;
  const organizationId = randomUUID();
  const tenantId = randomUUID();
  const projectId = randomUUID();
  const mandateLaunchId = randomUUID();
  const workspace = path.join(root, 'workspace', orgSlug);
  const projectPath = path.join(workspace, 'core-genesis-fixture');
  const executable = path.join(root, 'bin', 'bloom-workspace.exe');
  const webviewDir = path.join(root, 'webview', 'app');
  const contractsDir = path.join(root, 'contracts');
  const orreryDir = path.join(root, 'installer', 'conductor', 'workspace', 'core', 'orrery', 'src');
  const playcanvasDir = path.join(root, 'installer', 'conductor', 'workspace', 'core', 'orrery', 'node_modules', 'playcanvas');
  const nodeExecutable = path.join(root, 'bin', 'node.exe');
  const nucleusJson = path.join(appData, 'config', 'nucleus.json');
  const manifestPath = path.join(root, '.runner-core', 'manifest.json');
  try {
    for (const dir of [appData, path.dirname(nucleusJson), path.join(root, 'tmp'),
      path.join(root, 'home', 'AppData', 'Roaming'), projectPath,
      path.join(workspace, '.bloom', `.nucleus-${orgSlug}`), path.dirname(manifestPath)]) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const packageEntries: Array<{ path: string; size: number; sha256: string }> = [];
    for (const relative of workspaceSource.sourceFiles) {
      const sourceFile = path.join(workspaceSource.packageDir, relative);
      const targetFile = path.join(root, 'bin', relative);
      if (!within(sourceFile, workspaceSource.packageDir) || !within(targetFile, path.join(root, 'bin'))) throw new Error('functional_package_escape');
      fs.mkdirSync(path.dirname(targetFile), { recursive: true });
      fs.copyFileSync(sourceFile, targetFile, fs.constants.COPYFILE_EXCL);
      const digest = sha256File(sourceFile);
      if (sha256File(targetFile) !== digest) throw new Error('functional_package_hash_mismatch');
      packageEntries.push({ path: relative.replace(/\\/g, '/'), size: fs.statSync(sourceFile).size, sha256: digest });
    }
    inspectWorkspacePackageContent(path.join(root, 'bin'), workspaceSource.sourceFiles);
    stageCurrentCoreBridge(repoSource, path.join(root, 'bin'), packageEntries);
    const webviewEntries = copyRegularTree(webview, webviewDir, WEBVIEW_TOP_LEVEL);
    // Vite's late PlayCanvas optimization reloads Core after the one-shot
    // pending IPC has consumed it. Prepare that dependency before first paint.
    const stagedViteConfig = path.join(webviewDir, 'vite.config.ts');
    const viteSource = fs.readFileSync(stagedViteConfig, 'utf8');
    const viteMarker = '  plugins: [sveltekit()],';
    if (viteSource.split(viteMarker).length !== 2) throw new Error('functional_vite_config_shape_changed');
    const stagedViteSource = `import { fileURLToPath } from 'node:url';\n` + viteSource.replace(viteMarker,
      `${viteMarker}\n  resolve: { alias: { playcanvas: fileURLToPath(new URL('../../installer/conductor/workspace/core/orrery/node_modules/playcanvas', import.meta.url)) } },\n  optimizeDeps: { include: ['playcanvas'] },`);
    fs.writeFileSync(stagedViteConfig, stagedViteSource);
    const viteEntry = webviewEntries.find(entry => entry.path === 'vite.config.ts');
    if (!viteEntry) throw new Error('functional_vite_manifest_missing');
    viteEntry.size = fs.statSync(stagedViteConfig).size;
    viteEntry.sha256 = sha256File(stagedViteConfig);
    const contractsEntries = copyRegularTree(contractsSource, contractsDir);
    const orreryEntries = copyRegularTree(orrerySource, orreryDir);
    const playcanvasEntries = copyRegularTree(playcanvasSource, playcanvasDir);
    if (path.win32.basename(process.execPath).toLowerCase() !== 'node.exe' ||
        !fs.lstatSync(process.execPath).isFile()) throw new Error('functional_node_source_invalid');
    fs.copyFileSync(process.execPath, nodeExecutable, fs.constants.COPYFILE_EXCL);
    const nodeDigest = sha256File(process.execPath);
    if (sha256File(nodeExecutable) !== nodeDigest) throw new Error('functional_node_hash_mismatch');
    const project = { project_id: projectId, project_name: 'core-genesis-fixture', project_path: projectPath, genesis_launch_required: true };
    const nucleus = {
      installation: { completed: true },
      authority_base_url: 'http://127.0.0.1:48215',
      master_profile: randomUUID(),
      onboarding: {
        completed: true,
        active_org_slug: orgSlug,
        backend_identity_org_id: organizationId,
        active_project_id: projectId,
        workspace_url: 'http://127.0.0.1:5173',
        organizations: [{ org_slug: orgSlug, organization_id: organizationId, tenant_id: tenantId, workspace_path: workspace, projects: [project] }],
        pending_genesis_launch: { mandateLaunchId, projectId, project: project.project_name, projectPath },
      },
    };
    fs.writeFileSync(nucleusJson, JSON.stringify(nucleus, null, 2), { flag: 'wx' });
    const manifest = { version: 1, kind: 'functional_only', runId, root, packageEntries, webviewEntries,
      contractsEntries, orreryEntries, playcanvasEntries,
      nodeDigest, fixtureDigest: createHash('sha256').update(fs.readFileSync(nucleusJson)).digest('hex') };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), { flag: 'wx' });
    return { root, runId, executable, appData, nucleusJson, webviewDir, contractsDir, orreryDir, playcanvasDir,
      nodeExecutable, workspace, orgSlug, organizationId, tenantId, projectId, projectPath, manifestPath };
  } catch (error) {
    if (path.dirname(path.resolve(root)).toLowerCase() !== path.resolve(parent).toLowerCase() ||
        !path.basename(root).startsWith('rc-') || fs.lstatSync(root).isSymbolicLink()) {
      throw new Error('functional_failed_root_cleanup_unsafe', { cause: error });
    }
    assertNoWindowsReparsePoints(root);
    fs.rmSync(root, { recursive: true, force: true });
    throw error;
  }
}
