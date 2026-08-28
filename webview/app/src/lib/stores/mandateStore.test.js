// @ts-nocheck -- runner Node sintético; el código productivo TypeScript se valida por separado.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const testDir = path.dirname(fileURLToPath(import.meta.url));
const bundleDir = fs.mkdtempSync(path.join(os.tmpdir(), 'core-mandate-store-test-'));

esbuild.buildSync({
  entryPoints: [
    path.join(testDir, 'mandateStore.ts'),
    path.join(testDir, 'websocket.ts'),
  ],
  outdir: bundleDir,
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  logLevel: 'silent',
});

const mandateModule = require(path.join(bundleDir, 'mandateStore.js'));
const websocketModule = require(path.join(bundleDir, 'websocket.js'));

test.after(() => {
  fs.rmSync(bundleDir, { recursive: true, force: true });
});

function snapshot(store) {
  let value;
  const unsubscribe = store.subscribe((current) => {
    value = current;
  });
  unsubscribe();
  return value;
}

function listed(currentStatus, stateVersion) {
  return {
    mandateId: 'm-1',
    mandateType: 'genesis',
    currentStatus,
    currentPhase: 'ingest',
    ...(stateVersion === undefined ? {} : { stateVersion }),
  };
}

test('watermark prevents an older HTTP snapshot from overwriting a later event', () => {
  const store = mandateModule.createMandateStore();
  const watermark = store.captureWatermark();
  store.applyMandateEvent('mandate:action:started', {
    mandateId: 'm-1',
    currentStatus: 'running',
    stateVersion: 2,
  });
  store.hydrateFromList([listed('building', 1)], watermark);
  assert.equal(snapshot(store).byId['m-1'].currentStatus, 'running');
  assert.equal(snapshot(store).byId['m-1'].stateVersion, 2);
});

test('a greater stateVersion wins', () => {
  const store = mandateModule.createMandateStore();
  store.hydrateFromList([listed('building', 2)]);
  store.hydrateFromList([listed('completed', 3)]);
  assert.equal(snapshot(store).byId['m-1'].currentStatus, 'completed');
  assert.equal(snapshot(store).byId['m-1'].stateVersion, 3);
});

test('a lower stateVersion is discarded', () => {
  const store = mandateModule.createMandateStore();
  store.hydrateFromList([listed('completed', 3)]);
  store.hydrateFromList([listed('building', 2)]);
  assert.equal(snapshot(store).byId['m-1'].currentStatus, 'completed');
  assert.equal(snapshot(store).byId['m-1'].stateVersion, 3);
});

test('an equal stateVersion is idempotent', () => {
  const store = mandateModule.createMandateStore();
  store.hydrateFromList([listed('running', 4)]);
  const before = snapshot(store).byId['m-1'];
  store.hydrateFromList([listed('running', 4)]);
  const after = snapshot(store).byId['m-1'];
  assert.deepEqual(after, before);
});

test('watermark protects an unversioned event from a versioned in-flight HTTP snapshot', () => {
  const store = mandateModule.createMandateStore();
  const watermark = store.captureWatermark();
  store.applyMandateEvent('mandate:action:started', {
    mandateId: 'm-1',
    currentStatus: 'running',
  });
  store.hydrateFromList([listed('building', 1)], watermark);
  assert.equal(snapshot(store).byId['m-1'].currentStatus, 'running');
  assert.equal(snapshot(store).byId['m-1'].stateVersion, undefined);
});

test('unknown Authorization event names request reconciliation', () => {
  const store = mandateModule.createMandateStore();
  const requested = [];
  store.onReconcileRequested(() => requested.push(true));
  store.applyMandateEvent('mandate:action:proposed', { mandateId: 'm-1', stateVersion: 5 });
  store.applyMandateEvent('mandate:sign:failed', { mandateId: 'm-1', stateVersion: 6 });
  assert.equal(requested.length, 2);
});

test('reconciliation requests never run GET concurrently', async () => {
  const store = mandateModule.createMandateStore();
  let active = 0;
  let maximumActive = 0;
  let calls = 0;
  const coordinator = mandateModule.createReconciliationCoordinator(store, async () => {
    calls += 1;
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, 10));
    active -= 1;
    return { mandates: [listed('building', calls)] };
  });

  await Promise.all([coordinator.request(), coordinator.request(), coordinator.request()]);
  assert.equal(maximumActive, 1);
  assert.equal(calls, 2);
});

test('wildcard accepts Authorization names and reconnect triggers catch-up', async () => {
  const timers = [];
  const instances = [];
  class FakeWebSocket {
    static OPEN = 1;
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      instances.push(this);
    }
    open() {
      this.readyState = FakeWebSocket.OPEN;
      this.onopen?.();
    }
    message(event, data) {
      this.onmessage?.({ data: JSON.stringify({ event, data }) });
    }
    closeFromServer() {
      this.readyState = 3;
      this.onclose?.();
    }
    close() {
      this.readyState = 3;
    }
    send() {}
  }

  globalThis.WebSocket = FakeWebSocket;
  globalThis.window = {
    setTimeout(callback) {
      timers.push(callback);
      return timers.length;
    },
  };
  globalThis.clearTimeout = () => {};

  const wsStore = websocketModule.createWebSocketStore();
  const mandateStore = mandateModule.createMandateStore();
  mandateStore.hydrateFromList([listed('building', 1)]);
  const coordinator = mandateModule.createReconciliationCoordinator(mandateStore, async () => ({
    mandates: [listed('completed', 2)],
  }));
  const wildcardEvents = [];
  let catchUps = 0;
  let catchUpPromise = Promise.resolve();
  wsStore.on('mandate:*', ({ event }) => wildcardEvents.push(event));
  wsStore.onReconnect(() => {
    catchUps += 1;
    catchUpPromise = coordinator.request();
  });
  wsStore.connect('ws://fixture');
  instances[0].open();
  instances[0].message('mandate:action:proposed', { mandateId: 'm-1' });
  instances[0].message('mandate:sign:failed', { mandateId: 'm-1' });
  instances[0].closeFromServer();
  timers.shift()();
  instances[1].open();
  await catchUpPromise;

  assert.deepEqual(wildcardEvents, ['mandate:action:proposed', 'mandate:sign:failed']);
  assert.equal(catchUps, 1);
  assert.equal(snapshot(mandateStore).byId['m-1'].currentStatus, 'completed');
  assert.equal(snapshot(mandateStore).byId['m-1'].stateVersion, 2);
});
