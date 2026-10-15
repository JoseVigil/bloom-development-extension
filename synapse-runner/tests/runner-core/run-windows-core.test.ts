import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

test('Windows runner entry point refuses to run without an explicit Workspace executable', () => {
  const entry = path.join(__dirname, '..', '..', 'src', 'runner-core', 'run-windows-core.ts');
  const result = spawnSync(process.execPath, ['--require', 'ts-node/register', entry], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /usage: run-windows-core/);
});
