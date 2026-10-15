import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import { gate2ChildEnvironment } from '../../src/runner-core/windows-genesis-backend-launcher';

test('Gate 2 process environment contains only declared paths and isolated Temporal address',{skip:process.platform!=='win32'},()=>{
  const root='C:\\repos\\bloom-development-extension\\synapse-runner\\.runner-core-temp\\rc-test';
  const fixture={root,runId:'test-run',workspace:path.win32.join(root,'workspace','runner-core-gate2')} as any;
  const env=gate2ChildEnvironment(fixture,process.env.SystemRoot!,47231);
  assert.equal(env.BLOOM_NUCLEUS_PATH,fixture.workspace);
  assert.equal(env.RUNNER_CORE_TEMPORAL_ADDRESS,'127.0.0.1:47231');
  assert.equal(env.RUNNER_CORE_GATE2_ROOT,root);
  assert.equal(Object.keys(env).length,17);
  for (const key of ['APPDATA','LOCALAPPDATA','USERPROFILE','TEMP','TMP','BLOOM_APPDATA_DIR']) {
    assert.equal(path.win32.relative(root,env[key]).startsWith('..'),false,key);
  }
  assert.equal('AUTHORITY_SERVICE_TOKEN' in env,false);
});
