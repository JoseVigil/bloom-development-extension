import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFunctionalNetstat, assertFunctionalPortsFree } from '../../src/runner-core/windows-functional-preflight';

test('netstat inventory keeps only listening sockets and their owner PIDs', () => {
  const output = [
    '  TCP    127.0.0.1:48215    0.0.0.0:0      LISTENING       13056',
    '  TCP    127.0.0.1:48215    127.0.0.1:60000 ESTABLISHED 13056',
    '  TCP    127.0.0.1:5173     0.0.0.0:0      LISTENING       4200',
  ].join('\r\n');
  assert.deepEqual(parseFunctionalNetstat(output, [48215]), [
    { localAddress:'127.0.0.1', localPort:48215, owningProcess:13056 },
  ]);
  assert.throws(() => assertFunctionalPortsFree(parseFunctionalNetstat(output, [48215])), /functional_port_occupied:48215/);
  assert.deepEqual(parseFunctionalNetstat(output, [9999]), []);
});

test('malformed listening owner fails closed', () => {
  assert.throws(() => parseFunctionalNetstat('TCP 127.0.0.1:48215 0.0.0.0:0 LISTENING unknown', [48215]),
    /functional_port_inventory_invalid/);
});
