import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { assertNoWindowsReparsePoints } from './windows-isolated-root-assembler';
import { withinFunctionalRoot } from './windows-functional-preflight';

export interface GeneG2Root {
  root: string;
  runId: string;
  manifestPath: string;
  evidencePath: string;
  executablePath: string;
  supervisorPath: string;
  assetPath: string;
}

export function createGeneG2Root(): GeneG2Root {
  if (process.platform !== 'win32') throw new Error('gene_g2_requires_windows');
  const parent = path.resolve(__dirname, '../..', '.runner-core-temp');
  fs.mkdirSync(parent, { recursive: true });
  assertNoWindowsReparsePoints(parent);
  const root = fs.mkdtempSync(path.join(parent, 'rc-'));
  const fixture: GeneG2Root = {
    root, runId: randomUUID(),
    manifestPath: path.join(root, '.runner-core', 'manifest.json'),
    evidencePath: path.join(root, '.runner-core', 'gene-g2-evidence.json'),
    executablePath: path.join(root, 'bin', 'gene-g2.test.exe'),
    supervisorPath: path.join(root, 'bin', 'gene-g2-supervisor.exe'),
    assetPath: path.join(root, 'repository', 'FIRST_GENE.md'),
  };
  try {
    for (const candidate of Object.values(fixture).filter(value => typeof value === 'string' && path.win32.isAbsolute(value))) {
      if (!withinFunctionalRoot(candidate, root)) throw new Error('gene_g2_root_escape');
    }
    for (const dir of ['.runner-core', 'repository', 'nucleus', 'authority', 'logs', 'bin', 'tmp', 'home']) {
      fs.mkdirSync(path.join(root, dir), { recursive: true });
    }
    assertNoWindowsReparsePoints(root);
    fs.writeFileSync(fixture.assetPath, '# First isolated canonical Gene\n', { flag: 'wx' });
    fs.writeFileSync(fixture.manifestPath, JSON.stringify({version: 1, kind: 'gene_g2', runId: fixture.runId, root}, null, 2), {flag: 'wx'});
    return fixture;
  } catch (error) {
    removeGeneG2Root(fixture);
    throw error;
  }
}

export function removeGeneG2Root(fixture: GeneG2Root): void {
  const parent = path.resolve(__dirname, '../..', '.runner-core-temp');
  if (path.win32.dirname(path.win32.resolve(fixture.root)).toLowerCase() !== parent.toLowerCase() ||
      !path.win32.basename(fixture.root).startsWith('rc-') ||
      (fs.existsSync(fixture.root) && fs.lstatSync(fixture.root).isSymbolicLink())) {
    throw new Error('gene_g2_cleanup_path_invalid');
  }
  fs.rmSync(fixture.root, {recursive: true, force: true, maxRetries: 10, retryDelay: 200});
}
