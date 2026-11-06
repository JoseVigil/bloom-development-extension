'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const { PassThrough } = require('node:stream');
const test = require('node:test');
const { IntentSupplySessionTransport, SCHEMA } = require('./intent-supply-session-transport');

function fakeProcess() {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.killed = false;
  child.kill = () => { child.killed = true; child.emit('close', 0); return true; };
  return child;
}

const frame = { schema: SCHEMA, request_id: 'request-1', mandate_id: 'mandate-1',
  prepared_contract_digest: 'sha256:' + 'a'.repeat(64), mode: 'list' };

test('streams one JSON line per request and matches chunked response by request_id', async () => {
  const child = fakeProcess();
  const aitapBinary = path.resolve('aitap.exe');
  const session = new IntentSupplySessionTransport('nucleus.exe', {
    aitapBinary,
    spawn: (_binary, args, options) => {
      assert.deepEqual(args, ['--json', 'authority', 'intent-supply-session']);
      assert.deepEqual(options.stdio, ['pipe', 'pipe', 'pipe']);
      assert.equal(options.env.AITAP_BIN, aitapBinary);
      return child;
    }
  });
  const sent = new Promise(resolve => child.stdin.once('data', data => resolve(data.toString())));
  const result = session.request(frame);
  assert.deepEqual(JSON.parse((await sent).trim()), frame);
  child.stdout.write(JSON.stringify({ schema: SCHEMA, request_id: 'request-1', event: 'result', ok: false,
    error_code: 'actor_human_approval_unavailable' }).slice(0, 40));
  child.stdout.write(JSON.stringify({ schema: SCHEMA, request_id: 'request-1', event: 'result', ok: false,
    error_code: 'actor_human_approval_unavailable' }).slice(40) + '\n');
  assert.equal((await result).error_code, 'actor_human_approval_unavailable');
  session.close();
  assert.equal(child.killed, true);
});

test('rejects mismatched response and closes the session', async () => {
  const child = fakeProcess();
  const session = new IntentSupplySessionTransport('nucleus.exe', { spawn: () => child });
  const result = session.request(frame);
  child.stdout.write(JSON.stringify({ schema: SCHEMA, request_id: 'other', event: 'result', ok: false, error_code: 'denied' }) + '\n');
  await assert.rejects(result, /intent_supply_protocol_error/);
  assert.equal(child.killed, true);
});

test('closes a stalled session without exposing stderr', async () => {
  const child = fakeProcess();
  const session = new IntentSupplySessionTransport('nucleus.exe', { spawn: () => child, timeoutMs: 5 });
  const result = session.request(frame);
  child.stderr.write('private diagnostic');
  await assert.rejects(result, /intent_supply_timeout/);
  assert.equal(child.killed, true);
});

test('a broken stdin pipe rejects the request without an unhandled EPIPE', async () => {
  const child = fakeProcess();
  const session = new IntentSupplySessionTransport('nucleus.exe', { spawn: () => child });
  const result = session.request(frame);
  child.stdin.emit('error', new Error('EPIPE'));
  await assert.rejects(result, /intent_supply_unavailable/);
  assert.equal(child.killed, true);
});

test('approval URL stays in main and only the final frame resolves the request', async () => {
  const child = fakeProcess();
  const opened = [];
  const session = new IntentSupplySessionTransport('nucleus.exe', {
    spawn: () => child, onApprovalRequired: url => { opened.push(url); }
  });
  const result = session.request(frame);
  child.stdout.write(JSON.stringify({ schema: SCHEMA, request_id: frame.request_id,
    event: 'approval_required', ok: false, error_code: 'actor_human_approval_required',
    approval_url: 'http://127.0.0.1:8787/v1/authority/actor/intent-supply-consent?packet=opaque' }) + '\n');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(opened.length, 1);
  child.stdout.write(JSON.stringify({ schema: SCHEMA, request_id: frame.request_id,
    event: 'result', ok: true, data: { schema_version: 'bloom.intent-supply-assignments/v1' } }) + '\n');
  assert.equal((await result).event, 'result');
  session.close();
});

test('failed approval URL opening closes the request without forwarding it', async () => {
  const child = fakeProcess();
  const session = new IntentSupplySessionTransport('nucleus.exe', {
    spawn: () => child, onApprovalRequired: () => { throw new Error('unsafe URL'); }
  });
  const result = session.request(frame);
  child.stdout.write(JSON.stringify({ schema: SCHEMA, request_id: frame.request_id,
    event: 'approval_required', ok: false, error_code: 'actor_human_approval_required',
    approval_url: 'http://evil.example/' }) + '\n');
  await assert.rejects(result, /intent_supply_approval_unavailable/);
  assert.equal(child.killed, true);
});
