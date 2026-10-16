import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { GeneG2Root } from './windows-gene-g2-root';
import { withinFunctionalRoot } from './windows-functional-preflight';

export interface GeneG2Evidence {
  kind: string; runId: string; projectId: string; geneId: string; contributionId: string;
  workspaceEffect: string; domainRelationshipCount: number; headGeneration: number;
  headToCommit: boolean; commitToRevision: boolean; commitToContribution: boolean;
  receiptVerified: boolean; replayVerified: boolean; contentionRejected: boolean;
  receipt: Record<string, unknown>;
}

function buildGeneG2Executables(fixture: GeneG2Root): void {
  const go = path.join(process.env.GOROOT || 'C:\\Program Files\\Go', 'bin', 'go.exe');
  if (!fs.statSync(go).isFile()) throw new Error('gene_g2_go_missing');
  const cache = path.join(path.dirname(fixture.root), 'go-cache');
  fs.mkdirSync(cache, {recursive: true});
  const shared = { ...process.env, GOCACHE: cache };
  execFileSync(go, ['build', '-o', fixture.supervisorPath, '.'], {
    cwd: path.resolve(__dirname, '../../native/windows-core-isolation'), timeout: 180_000,
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: {...shared, GO111MODULE: 'off'},
  });
  execFileSync(go, ['test', '-c', '-o', fixture.executablePath, './internal/orchestration/acceptance/runner_core_gene_g2_test.go'], {
    cwd: path.resolve(__dirname, '../../../installer/nucleus'), timeout: 300_000,
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: shared,
  });
}

function geneG2ChildEnvironment(fixture: GeneG2Root): Record<string, string> {
  const systemRoot = process.env.SystemRoot;
  if (!systemRoot || !path.win32.isAbsolute(systemRoot)) throw new Error('gene_g2_system_root_missing');
  const home = path.join(fixture.root, 'home');
  const drive = path.win32.parse(home).root.slice(0, 2);
  const local = path.join(home, 'AppData', 'Local');
  const roaming = path.join(home, 'AppData', 'Roaming');
  for (const dir of [local, roaming]) fs.mkdirSync(dir, {recursive: true});
  const env: Record<string, string> = {
    SystemRoot: systemRoot, WINDIR: systemRoot,
    PATH: `${path.join(fixture.root, 'bin')};${path.join(systemRoot, 'System32')}`,
    USERPROFILE: home, HOME: home, HOMEDRIVE: drive, HOMEPATH: home.slice(drive.length),
    LOCALAPPDATA: local, APPDATA: roaming,
    TEMP: path.join(fixture.root, 'tmp'), TMP: path.join(fixture.root, 'tmp'),
    BLOOM_APPDATA_DIR: local, BLOOM_NUCLEUS_BASE_DIR_OVERRIDE: path.join(fixture.root, 'nucleus'),
    RUNNER_CORE_RUN_ID: fixture.runId, RUNNER_CORE_GENE_G2_ROOT: fixture.root,
    RUNNER_CORE_GENE_G2_EVIDENCE: fixture.evidencePath,
  };
  for (const key of ['USERPROFILE', 'HOME', 'LOCALAPPDATA', 'APPDATA', 'TEMP', 'TMP',
    'BLOOM_APPDATA_DIR', 'BLOOM_NUCLEUS_BASE_DIR_OVERRIDE', 'RUNNER_CORE_GENE_G2_ROOT', 'RUNNER_CORE_GENE_G2_EVIDENCE']) {
    if (!withinFunctionalRoot(env[key], fixture.root)) throw new Error(`gene_g2_environment_escape:${key}`);
  }
  return env;
}

export function runGeneG2(fixture: GeneG2Root): GeneG2Evidence {
  if (process.platform !== 'win32') throw new Error('gene_g2_requires_windows');
  buildGeneG2Executables(fixture);
  let output: string;
  try {
    output = execFileSync(fixture.supervisorPath,
      ['gene-g2-supervisor', fixture.root, fixture.executablePath], {
        cwd: fixture.root, env: geneG2ChildEnvironment(fixture), timeout: 150_000,
        windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      });
  } catch (error) {
    const logPath = path.join(fixture.root, '.runner-core', 'gene-g2.log');
    const log = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8').slice(-4000) : '';
    throw new Error(`gene_g2_execution_failed:${log}`, {cause: error});
  }
  const supervisor = JSON.parse(output) as {kind?: string; runId?: string; childAssignedToJob?: boolean; exitCode?: number};
  if (supervisor.kind !== 'gene_g2_supervisor' || supervisor.runId !== fixture.runId ||
      supervisor.childAssignedToJob !== true || supervisor.exitCode !== 0) throw new Error('gene_g2_supervisor_result_invalid');
  const evidence = JSON.parse(fs.readFileSync(fixture.evidencePath, 'utf8')) as GeneG2Evidence;
  if (evidence.kind !== 'runner_core_gene_g2' || evidence.runId !== fixture.runId ||
      evidence.workspaceEffect !== 'none' || evidence.domainRelationshipCount !== 0 ||
      evidence.headGeneration !== 1 || !evidence.headToCommit || !evidence.commitToRevision ||
      !evidence.commitToContribution || !evidence.receiptVerified || !evidence.replayVerified ||
      !evidence.contentionRejected || !evidence.receipt) throw new Error('gene_g2_evidence_invalid');
  return evidence;
}
