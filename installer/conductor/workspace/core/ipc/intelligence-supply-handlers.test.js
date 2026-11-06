'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const { sanitizeAssignments, canonicalContractDigest, authorizedConsentURL, sanitizeSessionData,
  registerIntelligenceSupplyHandlers } = require('./intelligence-supply-handlers');

const valid = {
  action_id: 'ing-1',
  destination: { backend_id: 'gemini_api', provider: 'google', model: 'gemini-2.5-pro' },
  limits: { max_inferences: 2, max_output_tokens: 1024, max_total_tokens: 4096 }
};

test('only canonical Action, destination and limit fields cross into Nucleus', () => {
  assert.deepEqual(sanitizeAssignments([valid]), [valid]);
  assert.equal(sanitizeAssignments([{ ...valid, actor_token: 'secret' }]), null);
  assert.equal(sanitizeAssignments([{ ...valid, destination: { ...valid.destination, cookie: 'secret' } }]), null);
  assert.equal(sanitizeAssignments([{ ...valid, limits: { ...valid.limits, max_total_tokens: 0 } }]), null);
  assert.equal(sanitizeAssignments([valid, valid]), null);
});

test('Wisdom raw digest becomes the canonical Authority digest', () => {
  const raw = 'a'.repeat(64);
  assert.equal(canonicalContractDigest(raw), 'sha256:' + raw);
  assert.equal(canonicalContractDigest('sha256:' + raw), 'sha256:' + raw);
  assert.equal(canonicalContractDigest(raw.toUpperCase()), null);
  assert.equal(canonicalContractDigest('sha256:' + raw + 'x'), null);
});

test('consent URL is confined to the configured Authority origin and page', () => {
  const base = 'http://127.0.0.1:8787';
  const approved = base + '/v1/authority/actor/intent-supply-consent?packet=opaque';
  assert.equal(authorizedConsentURL(approved, base), approved);
  assert.equal(authorizedConsentURL(base + '/v1/authority/actor/intent-supply-consent?packet=opaque&next=evil', base), null);
  assert.equal(authorizedConsentURL('http://127.0.0.1:8788/v1/authority/actor/intent-supply-consent?packet=opaque', base), null);
  assert.equal(authorizedConsentURL('http://evil.example/v1/authority/actor/intent-supply-consent?packet=opaque', base), null);
  assert.equal(authorizedConsentURL('http://127.0.0.1:8787/v1/authority/actor/approve?packet=opaque', base), null);
  assert.equal(authorizedConsentURL('http://remote.example/v1/authority/actor/intent-supply-consent', 'http://remote.example'), null);
});

test('only per-Action eligibility crosses into Core from a verified list result', () => {
  const digest = 'sha256:' + 'a'.repeat(64);
  const data = { schema_version: 'bloom.intent-supply-assignments/v1', operation: 'list',
    request_id: 'req', mandate_id: 'mandate', prepared_contract_digest: digest,
    status: 'eligible', actor_token: 'must-not-cross', actions: [
      { action_id: 'ing-1', requiredCapabilities: ['text.generate'], eligibility: 'eligible', errors: [],
        limit_ceiling: { max_inferences: 3, max_total_tokens: 10000, max_output_tokens: 2048, max_usd: '1' },
        destinations: [{ backend_id: 'gemini_api', provider: 'google', model: 'gemini-pro', credential_ref: 'must-not-cross' }] }
    ] };
  const value = sanitizeSessionData(data, 'list', 'mandate', digest, 'req');
  assert.equal(value.actions[0].destinations[0].model, 'gemini-pro');
  assert.equal(value.actions[0].limitCeiling.maxUsd, '1');
  assert.equal(JSON.stringify(value).includes('must-not-cross'), false);
  assert.equal(sanitizeSessionData({ ...data, prepared_contract_digest: 'sha256:' + 'b'.repeat(64) }, 'list', 'mandate', digest, 'req'), null);
  assert.equal(sanitizeSessionData({ ...data, actions: [{ ...data.actions[0], eligibility: 'eligible', destinations: [] }] }, 'list', 'mandate', digest, 'req'), null);
});

test('IPC binds one Nucleus session to the Core window and exact Mandate selection', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bloom-supply-ipc-'));
  const configPath = path.join(dir, 'nucleus.json');
  fs.writeFileSync(configPath, JSON.stringify({ authority_base_url: 'http://127.0.0.1:8787' }));
  const sender = new EventEmitter();
  sender.mainFrame = {};
  sender.getURL = () => 'http://127.0.0.1:5173/aitap';
  const event = { sender, senderFrame: sender.mainFrame };
  const win = { webContents: sender, isDestroyed: () => false };
  const handlers = new Map();
  const opened = [];
  const instances = [];
  class FakeTransport {
    constructor(_binary, options) { this.options = options; this.closed = false; instances.push(this); }
    async request(frame) {
      this.frame = frame;
      return { schema: 'bloom.intent-supply-session/v1', request_id: frame.request_id,
        event: 'result', ok: false, error_code: 'actor_human_approval_unavailable' };
    }
    close() { this.closed = true; }
  }
  const runtime = { app: new EventEmitter(), ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    shell: { openExternal: async url => { opened.push(url); } }, SessionTransport: FakeTransport };
  try {
    registerIntelligenceSupplyHandlers(async () => ({}), configPath, 'aitap.exe', 'nucleus.exe', () => win,
      { warn() {} }, runtime);
    const selection = { mandateId: 'mandate-1', digest: 'a'.repeat(64) };
    const result = await handlers.get('core:intent-supply-session-list')(event, selection);
    assert.equal(result.error.code, 'actor_human_approval_unavailable');
    assert.equal(instances[0].frame.prepared_contract_digest, 'sha256:' + 'a'.repeat(64));
    await handlers.get('core:intent-supply-session-close')(event, { mandateId: 'another', digest: selection.digest });
    assert.equal(instances[0].closed, false);
    await instances[0].options.onApprovalRequired('http://127.0.0.1:8787/v1/authority/actor/intent-supply-consent?packet=opaque');
    assert.equal(opened.length, 1);
    await assert.rejects(instances[0].options.onApprovalRequired('http://evil.example/?packet=opaque'));
    await handlers.get('core:intent-supply-session-close')(event, selection);
    assert.equal(instances[0].closed, true);
    const foreign = { sender: new EventEmitter(), senderFrame: sender.mainFrame };
    assert.equal((await handlers.get('core:intent-supply-session-list')(foreign, selection)).error.code,
      'intent_supply_sender_denied');
  } finally {
    fs.unlinkSync(configPath);
    fs.rmdirSync(dir);
  }
});
