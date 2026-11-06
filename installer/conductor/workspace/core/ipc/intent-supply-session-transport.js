'use strict';

const { spawn } = require('child_process');
const path = require('path');

const SCHEMA = 'bloom.intent-supply-session/v1';
const MAX_LINE_BYTES = 1 << 20;

class IntentSupplySessionTransport {
  constructor(binary, options = {}) {
    if (!options.spawn && (typeof options.aitapBinary !== 'string' || !path.isAbsolute(options.aitapBinary))) {
      throw new Error('intent_supply_aitap_unavailable');
    }
    this.child = (options.spawn || spawn)(binary,
      ['--json', 'authority', 'intent-supply-session'],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...(options.aitapBinary ? { AITAP_BIN: options.aitapBinary } : {}) } });
    this.timeoutMs = options.timeoutMs || 180000;
    this.onApprovalRequired = options.onApprovalRequired;
    this.buffer = Buffer.alloc(0);
    this.pending = null;
    this.closed = false;
    this.child.stdin.on('error', () => this.close('intent_supply_unavailable'));
    this.child.stdout.on('data', chunk => this._receive(chunk));
    this.child.stdout.on('error', () => this.close('intent_supply_unavailable'));
    // Diagnostics may contain sensitive Authority details. Never forward them.
    this.child.stderr.resume();
    this.child.on('error', () => this.close('intent_supply_unavailable'));
    this.child.on('close', () => this.close('intent_supply_unavailable'));
  }

  request(frame) {
    if (this.closed) return Promise.reject(new Error('intent_supply_unavailable'));
    if (this.pending) return Promise.reject(new Error('intent_supply_busy'));
    if (frame.schema !== SCHEMA || typeof frame.request_id !== 'string' || !frame.request_id) {
      return Promise.reject(new Error('intent_supply_invalid_request'));
    }
    const line = JSON.stringify(frame) + '\n';
    if (Buffer.byteLength(line) > MAX_LINE_BYTES) {
      return Promise.reject(new Error('intent_supply_invalid_request'));
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.close('intent_supply_timeout'), this.timeoutMs);
      this.pending = { requestID: frame.request_id, resolve, reject, timer };
      this.child.stdin.write(line, error => {
        if (error) this.close('intent_supply_unavailable');
      });
    });
  }

  _receive(chunk) {
    if (this.closed) return;
    this.buffer = Buffer.concat([this.buffer, Buffer.from(chunk)]);
    if (this.buffer.length > MAX_LINE_BYTES) {
      this.close('intent_supply_protocol_error');
      return;
    }
    let newline;
    while ((newline = this.buffer.indexOf(10)) !== -1) {
      const line = this.buffer.subarray(0, newline).toString('utf8');
      this.buffer = this.buffer.subarray(newline + 1);
      let response;
      try { response = JSON.parse(line); }
      catch { this.close('intent_supply_protocol_error'); return; }
      const pending = this.pending;
      if (!pending || response.schema !== SCHEMA || response.request_id !== pending.requestID ||
          typeof response.ok !== 'boolean') {
        this.close('intent_supply_protocol_error');
        return;
      }
      if (response.event === 'approval_required') {
        if (pending.approvalSeen || response.ok !== false ||
            response.error_code !== 'actor_human_approval_required' ||
            typeof response.approval_url !== 'string' || !response.approval_url ||
            typeof this.onApprovalRequired !== 'function') {
          this.close('intent_supply_protocol_error');
          return;
        }
        pending.approvalSeen = true;
        Promise.resolve().then(() => this.onApprovalRequired(response.approval_url))
          .catch(() => this.close('intent_supply_approval_unavailable'));
        continue;
      }
      if (response.event !== 'result' ||
          (response.ok === false && typeof response.error_code !== 'string') ||
          (response.ok === true && (!response.data || typeof response.data !== 'object' || Array.isArray(response.data))) ||
          Object.hasOwn(response, 'approval_url')) {
        this.close('intent_supply_protocol_error');
        return;
      }
      clearTimeout(pending.timer);
      this.pending = null;
      pending.resolve(response);
    }
  }

  close(code = 'intent_supply_closed') {
    if (this.closed) return;
    this.closed = true;
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(new Error(code));
      this.pending = null;
    }
    try { this.child.stdin.end(); } catch { /* El pipe ya puede estar roto. */ }
    try { this.child.kill(); } catch { /* El proceso ya puede haber salido. */ }
  }
}

module.exports = { IntentSupplySessionTransport, SCHEMA };
