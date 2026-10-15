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
  const projectPath = path.join(workspace, 'fixture');
  fs.mkdirSync(projectPath);
  fs.writeFileSync(path.join(projectPath, 'README.md'), '# Fixture\n');
  fs.writeFileSync(path.join(projectPath, 'main.ts'), 'export {};\n');
  return { workspace, nucleus, projectPath, mandatesRoot: path.join(nucleus, '.mandates') };
}

function replyFixture() {
  return { code(value) { this.statusCode = value; return this; }, send(value) { this.payload = value; return value; } };
}

async function create(body) {
  const reply = replyFixture();
  await createMandateHandler({ body, log: { error() {}, warn() {} } }, reply);
  return reply;
}

test('create genesis persists version and signature before publishing initiated', async () => {
  const f = fixture();
  const previous = process.env.BLOOM_NUCLEUS_PATH;
  process.env.BLOOM_NUCLEUS_PATH = f.workspace;
  observed.length = 0;
  try {
    await createMandateHandler({
      body: {
        mandateLaunchId: '11111111-1111-4111-8111-111111111111',
        mandateType: 'genesis',
        projectId: 'project-id-fixture',
        project: 'fixture',
        projectPath: f.projectPath,
        name: 'fixture',
        source: 'test',
      },
      log: { error() {}, warn() {} },
    }, replyFixture());
    assert.equal(observed.length, 1);
    const created = fs.readdirSync(f.mandatesRoot);
    assert.equal(created.length, 1);
    const statePath = path.join(f.mandatesRoot, created[0], 'mandate_state.json');
    assert.equal(fs.existsSync(statePath), true, 'event must only be emitted after state exists');
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    assert.equal(state.projectId, 'project-id-fixture');
    assert.equal(state.stateVersion, 1);
    assert.equal(Number.isNaN(Date.parse(state.updatedAt)), false);
    assert.equal(state.signature.status, 'not_ready');
    assert.deepEqual(state.signature.artifacts, { reception: null, domainProposal: null, humanSyncPersisted: false });
    assert.deepEqual(state.docsProvided, ['main.ts', 'README.md']);
    assert.equal(fs.readFileSync(path.join(f.mandatesRoot, created[0], 'docs', 'README.md'), 'utf8'), '# Fixture\n');
    assert.equal(observed[0].event, 'mandate:build:initiated');
  } finally {
    if (previous === undefined) delete process.env.BLOOM_NUCLEUS_PATH;
    else process.env.BLOOM_NUCLEUS_PATH = previous;
    fs.rmSync(f.workspace, { recursive: true, force: true });
  }
});

test('genesis replay and concurrency persist exactly one mandate and emit once', async () => {
  const f = fixture();
  const previous = process.env.BLOOM_NUCLEUS_PATH;
  process.env.BLOOM_NUCLEUS_PATH = f.workspace;
  observed.length = 0;
  const body = {
    mandateLaunchId: '22222222-2222-4222-8222-222222222222',
    mandateType: 'genesis', projectId: 'project-id-fixture', project: 'fixture', projectPath: f.projectPath, name: 'fixture', source: 'test',
  };
  try {
    const replies = await Promise.all(Array.from({ length: 8 }, () => create(body)));
    assert.ok(replies.every(reply => reply.statusCode === 202));
    assert.equal(new Set(replies.map(reply => reply.payload.mandateId)).size, 1);
    assert.equal(fs.readdirSync(f.mandatesRoot).length, 1);
    assert.equal(observed.filter(item => item.event === 'mandate:build:initiated').length, 1);
    const journalPath = path.join(f.nucleus, '.core', 'genesis-launches', `${body.mandateLaunchId}.json`);
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
    journal.genesisLaunchId = journal.mandateLaunchId;
    delete journal.mandateLaunchId;
    fs.writeFileSync(journalPath, JSON.stringify(journal));
    const before = fs.readFileSync(path.join(f.mandatesRoot, replies[0].payload.mandateId, 'mandate_state.json'), 'utf8');
    const replay = await create(body);
    assert.equal(replay.statusCode, 202);
    assert.equal(replay.payload.mandateId, replies[0].payload.mandateId);
    assert.equal(fs.readFileSync(path.join(f.mandatesRoot, replay.payload.mandateId, 'mandate_state.json'), 'utf8'), before);
    assert.equal(observed.length, 1);
    const conflict = await create({ ...body, projectId: 'different-project' });
    assert.equal(conflict.statusCode, 409);
    assert.equal(conflict.payload.error, 'GENESIS_LAUNCH_CONFLICT');
  } finally {
    if (previous === undefined) delete process.env.BLOOM_NUCLEUS_PATH;
    else process.env.BLOOM_NUCLEUS_PATH = previous;
    fs.rmSync(f.workspace, { recursive: true, force: true });
  }
});

test('project barrier accepts the Nucleus reservation and rejects an unreserved launch', async () => {
  const f = fixture(); const previous = process.env.BLOOM_NUCLEUS_PATH; process.env.BLOOM_NUCLEUS_PATH = f.workspace;
  const projectId = 'reserved-project'; const requestId = '55555555-5555-4555-8555-555555555555'; const launchId = '66666666-6666-4666-8666-666666666666';
  const stateDir = path.join(f.nucleus, '.core', 'genesis-projects'); fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, `${projectId}.json`), JSON.stringify({ schemaVersion: 1, projectId, currentMandateId: 'old', pendingRecovery: { recoveryRequestId: requestId, genesisLaunchId: launchId }, attempts: [] }));
  try {
    const body = { mandateLaunchId: launchId, recoveryRequestId: requestId, mandateType: 'genesis', projectId, project: 'fixture', projectPath: f.projectPath, name: 'fixture', source: 'core' };
    const accepted = await create(body); assert.equal(accepted.statusCode, 202);
    const state = JSON.parse(fs.readFileSync(path.join(f.mandatesRoot, accepted.payload.mandateId, 'mandate_state.json'), 'utf8'));
    assert.equal(state.recoveryRequestId, requestId);
    const rejected = await create({ ...body, mandateLaunchId: '77777777-7777-4777-8777-777777777777' });
    assert.equal(rejected.statusCode, 409); assert.equal(rejected.payload.error, 'PROJECT_GENESIS_CONFLICT');
  } finally { if (previous === undefined) delete process.env.BLOOM_NUCLEUS_PATH; else process.env.BLOOM_NUCLEUS_PATH = previous; fs.rmSync(f.workspace, { recursive: true, force: true }); }
});

test('genesis rejects an external project path, an empty project and symbolic-link documents', async (t) => {
  const f = fixture(); const previous = process.env.BLOOM_NUCLEUS_PATH; process.env.BLOOM_NUCLEUS_PATH = f.workspace;
  const external = fs.mkdtempSync(path.join(os.tmpdir(), 'genesis-external-'));
  const empty = path.join(f.workspace, 'empty'); fs.mkdirSync(empty);
  const base = { mandateLaunchId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', mandateType: 'genesis', projectId: 'project', project: 'fixture', name: 'fixture', source: 'test' };
  try {
    const outside = await create({ ...base, projectPath: external });
    assert.equal(outside.statusCode, 400); assert.equal(outside.payload.error, 'PROJECT_PATH_OUTSIDE_WORKSPACE');
    const noDocs = await create({ ...base, mandateLaunchId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', projectPath: empty });
    assert.equal(noDocs.statusCode, 400); assert.equal(noDocs.payload.error, 'PROJECT_DOCUMENTS_EMPTY');
    const linked = path.join(f.workspace, 'linked'); fs.mkdirSync(linked);
    try {
      fs.symlinkSync(path.join(f.projectPath, 'README.md'), path.join(linked, 'README.md'));
      const symlink = await create({ ...base, mandateLaunchId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', projectPath: linked });
      assert.equal(symlink.statusCode, 400); assert.equal(symlink.payload.error, 'PROJECT_DOCUMENT_INVALID');
    } catch (error) {
      if (error?.code === 'EPERM') t.diagnostic('symbolic-link assertion skipped: Windows privilege unavailable');
      else throw error;
    }
    assert.equal(fs.existsSync(f.mandatesRoot), false);
  } finally {
    if (previous === undefined) delete process.env.BLOOM_NUCLEUS_PATH; else process.env.BLOOM_NUCLEUS_PATH = previous;
    fs.rmSync(f.workspace, { recursive: true, force: true }); fs.rmSync(external, { recursive: true, force: true });
  }
});
