import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createGenesisBackendRoot } from '../../src/runner-core/windows-genesis-backend-root';

test('Gate 2 root contains only a disposable synthetic workspace and a copied Temporal binary', {skip:process.platform!=='win32'},()=>{
  const fixture=createGenesisBackendRoot();
  try {
    assert.match(fixture.root,/\\synapse-runner\\\.runner-core-temp\\rc-[^\\]+$/i);
    assert.equal(path.relative(fixture.root,fixture.workspace).startsWith('..'),false);
    assert.equal(path.relative(fixture.root,fixture.projectPath).startsWith('..'),false);
    assert.equal(fs.statSync(fixture.temporalExe).isFile(),true);
    assert.equal(fs.statSync(path.join(fixture.projectPath,'README.md')).isFile(),true);
    const manifest=JSON.parse(fs.readFileSync(fixture.manifestPath,'utf8'));
    assert.equal(manifest.kind,'genesis_backend_only');
    assert.equal(manifest.runId,fixture.runId);
    assert.equal(manifest.mandateLaunchId,fixture.mandateLaunchId);
    assert.equal(fs.readdirSync(fixture.mandatesRoot).length,0);
  } finally {fs.rmSync(fixture.root,{recursive:true,force:true,maxRetries:10,retryDelay:200});}
});
