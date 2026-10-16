import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createGeneG2Root, removeGeneG2Root } from '../../src/runner-core/windows-gene-g2-root';
import { runGeneG2 } from '../../src/runner-core/windows-gene-g2-launcher';
import { withinFunctionalRoot } from '../../src/runner-core/windows-functional-preflight';

test('RUNNER CORE materializes the first canonical Gene in a disposable root',
  {skip: process.platform !== 'win32', timeout: 600_000}, () => {
    const fixture = createGeneG2Root();
    try {
      assert.equal(fs.statSync(fixture.assetPath).isFile(), true);
      assert.equal(fs.existsSync(fixture.evidencePath), false);
      const evidence = runGeneG2(fixture);
      assert.equal(evidence.headGeneration, 1);
      assert.equal(evidence.workspaceEffect, 'none');
      assert.equal(evidence.domainRelationshipCount, 0);
      for (const field of ['headToCommit', 'commitToRevision', 'commitToContribution',
        'receiptVerified', 'replayVerified', 'contentionRejected'] as const) assert.equal(evidence[field], true);
      const project = path.join(fixture.root, 'nucleus', '.genes', 'projects', evidence.projectId);
      assert.equal(withinFunctionalRoot(project, fixture.root), true);
      assert.equal(fs.statSync(path.join(project, 'head.json')).isFile(), true);
      assert.equal(fs.statSync(fixture.assetPath).isFile(), true);
      console.log(JSON.stringify(evidence));
    } finally {
      removeGeneG2Root(fixture);
      assert.equal(fs.existsSync(fixture.root), false);
    }
  });
