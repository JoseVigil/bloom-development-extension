import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseFunctionalPorts } from '../../src/runner-core/windows-functional-launcher';

test('functional service ports are distinct and avoid occupied production ports', { skip: process.platform !== 'win32' }, async () => {
  const ports = await chooseFunctionalPorts();
  assert.equal(ports.uiPort, 5173);
  assert.notEqual(ports.httpPort, ports.wsPort);
  for (const port of [ports.httpPort, ports.wsPort]) {
    assert.ok(port >= 1024 && port <= 65535);
    assert.ok(![4124,48215,5678,7233,8233,11434,8787].includes(port));
  }
});
