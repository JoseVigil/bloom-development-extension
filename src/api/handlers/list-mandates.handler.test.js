const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

require.extensions['.ts'] = function transpileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

const publisher = require('../../server/mandate-event-publisher.ts');
publisher.publishMandateEvent = () => {};

const { createMandateHandler } = require('./create-mandate.handler.ts');
const { listMandatesHandler } = require('./list-mandates.handler.ts');

function makeWorkspace() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'core-mandate-alias-'));
  const nucleus = path.join(workspace, '.bloom', '.nucleus-test');
  fs.mkdirSync(path.join(nucleus, '.core'), { recursive: true });
  fs.writeFileSync(
    path.join(nucleus, '.core', '.nucleus-config.json'),
    JSON.stringify({ organization: { slug: 'test' } }),
  );
  return { workspace, mandatesRoot: path.join(nucleus, '.mandates') };
}

function makeReply() {
  return {
    statusCode: undefined,
    payload: undefined,
    code(value) {
      this.statusCode = value;
      return this;
    },
    send(value) {
      this.payload = value;
      return value;
    },
  };
}

async function withWorkspace(run) {
  const previous = process.env.BLOOM_NUCLEUS_PATH;
  const fixture = makeWorkspace();
  process.env.BLOOM_NUCLEUS_PATH = fixture.workspace;
  try {
    await run(fixture);
  } finally {
    if (previous === undefined) delete process.env.BLOOM_NUCLEUS_PATH;
    else process.env.BLOOM_NUCLEUS_PATH = previous;
    fs.rmSync(fixture.workspace, { recursive: true, force: true });
  }
}

async function listFixture(state) {
  let warnings = [];
  let response;
  await withWorkspace(async ({ mandatesRoot }) => {
    const mandateId = 'fixture-mandate';
    const dir = path.join(mandatesRoot, mandateId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'mandate_state.json'), JSON.stringify({ mandateId, ...state }));
    const reply = makeReply();
    const request = { log: { warn: (...args) => warnings.push(args), error: () => {} } };
    await listMandatesHandler(request, reply);
    assert.equal(reply.statusCode, 200);
    response = reply.payload.mandates[0];
  });
  return { response, warnings };
}

test('legacy status emits status and currentStatus', async () => {
  const { response, warnings } = await listFixture({ status: 'building' });
  assert.equal(response.status, 'building');
  assert.equal(response.currentStatus, 'building');
  assert.equal(warnings.length, 0);
});

test('canonical currentStatus emits currentStatus and status', async () => {
  const { response, warnings } = await listFixture({ currentStatus: 'signed' });
  assert.equal(response.status, 'signed');
  assert.equal(response.currentStatus, 'signed');
  assert.equal(warnings.length, 0);
});

test('equal status aliases emit both without warning', async () => {
  const { response, warnings } = await listFixture({ status: 'pending', currentStatus: 'pending' });
  assert.equal(response.status, 'pending');
  assert.equal(response.currentStatus, 'pending');
  assert.equal(warnings.length, 0);
});

test('conflicting aliases prefer currentStatus and warn with both values', async () => {
  const { response, warnings } = await listFixture({ status: 'building', currentStatus: 'signed' });
  assert.equal(response.status, 'signed');
  assert.equal(response.currentStatus, 'signed');
  assert.equal(warnings.length, 1);
  assert.deepEqual(warnings[0][0], {
    mandateId: 'fixture-mandate',
    status: 'building',
    currentStatus: 'signed',
  });
});

test('missing aliases invent no status and emit warning', async () => {
  const { response, warnings } = await listFixture({ currentPhase: 'ingest' });
  assert.equal(Object.hasOwn(response, 'status'), false);
  assert.equal(Object.hasOwn(response, 'currentStatus'), false);
  assert.equal(warnings.length, 1);
});

test('versioned mandate transports stateVersion and updatedAt', async () => {
  const { response } = await listFixture({
    status: 'building',
    stateVersion: 7,
    updatedAt: '2026-08-27T12:00:00.000Z',
  });
  assert.equal(response.stateVersion, 7);
  assert.equal(response.updatedAt, '2026-08-27T12:00:00.000Z');
});

test('legacy mandate invents no revision metadata', async () => {
  const { response } = await listFixture({ status: 'building' });
  assert.equal(Object.hasOwn(response, 'stateVersion'), false);
  assert.equal(Object.hasOwn(response, 'updatedAt'), false);
});

test('create handler dual-writes mandate_state.json and dual-emits response', async () => {
  await withWorkspace(async ({ mandatesRoot }) => {
    const mandateId = 'created-fixture';
    const reply = makeReply();
    const request = {
      body: {
        mandateId,
        mandateType: 'genesis',
        project: 'fixture-project',
        name: 'fixture-genesis',
        source: 'fixture',
      },
      log: { warn: () => {}, error: () => {} },
    };

    await createMandateHandler(request, reply);

    const written = JSON.parse(
      fs.readFileSync(path.join(mandatesRoot, mandateId, 'mandate_state.json'), 'utf8'),
    );
    assert.equal(written.status, 'building');
    assert.equal(written.currentStatus, 'building');
    assert.equal(reply.payload.status, 'building');
    assert.equal(reply.payload.currentStatus, 'building');
  });
});
