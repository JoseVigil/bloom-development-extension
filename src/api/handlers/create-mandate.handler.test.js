const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

require.extensions['.ts'] = function transpileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

const observed = [];
const publisher = require('../../server/mandate-event-publisher.ts');
publisher.publishMandateEvent = (event, data) => observed.push({ event, data });
const { createMandateHandler } = require('./create-mandate.handler.ts');

function fixture() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'genesis-state-create-'));
  const nucleus = path.join(workspace, '.bloom', '.nucleus-test');
  fs.mkdirSync(path.join(nucleus, '.core'), { recursive: true });
  fs.writeFileSync(path.join(nucleus, '.core', '.nucleus-config.json'), JSON.stringify({ organization: { slug: 'test' } }));
  return { workspace, mandatesRoot: path.join(nucleus, '.mandates') };
}

function replyFixture() {
  return { code(value) { this.statusCode = value; return this; }, send(value) { this.payload = value; return value; } };
}

test('create genesis persists version and signature before publishing initiated', async () => {
  const f = fixture();
  const previous = process.env.BLOOM_NUCLEUS_PATH;
  process.env.BLOOM_NUCLEUS_PATH = f.workspace;
  observed.length = 0;
  try {
    const mandateId = 'state-contract-fixture';
    await createMandateHandler({
      body: {
        mandateId,
        mandateType: 'genesis',
        projectId: 'project-id-fixture',
        project: 'fixture',
        name: 'fixture',
        source: 'test',
      },
      log: { error() {}, warn() {} },
    }, replyFixture());
    assert.equal(observed.length, 1);
    const statePath = path.join(f.mandatesRoot, mandateId, 'mandate_state.json');
    assert.equal(fs.existsSync(statePath), true, 'event must only be emitted after state exists');
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    assert.equal(state.projectId, 'project-id-fixture');
    assert.equal(state.stateVersion, 1);
    assert.equal(Number.isNaN(Date.parse(state.updatedAt)), false);
    assert.equal(state.signature.status, 'not_ready');
    assert.deepEqual(state.signature.artifacts, { reception: null, domainProposal: null, humanSyncPersisted: false });
    assert.equal(observed[0].event, 'mandate:genesis:initiated');
  } finally {
    if (previous === undefined) delete process.env.BLOOM_NUCLEUS_PATH;
    else process.env.BLOOM_NUCLEUS_PATH = previous;
    fs.rmSync(f.workspace, { recursive: true, force: true });
  }
});
