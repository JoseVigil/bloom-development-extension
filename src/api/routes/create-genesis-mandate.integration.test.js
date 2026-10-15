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

const events = [];
const publisher = require('../../server/mandate-event-publisher.ts');
publisher.publishMandateEvent = (event, data) => events.push({ event, data });
const Fastify = require('fastify');
const schemas = require('../schemas/create-mandate.schema.ts');
const { registerMandateRoutes } = require('./mandates.routes.ts');

function fixture() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'genesis-route-'));
  const nucleus = path.join(workspace, '.bloom', '.nucleus-test');
  fs.mkdirSync(path.join(nucleus, '.core'), { recursive: true });
  fs.writeFileSync(path.join(nucleus, '.core', '.nucleus-config.json'), JSON.stringify({ organization: { slug: 'test' } }));
  const projectPath = path.join(workspace, 'fixture'); fs.mkdirSync(projectPath);
  fs.writeFileSync(path.join(projectPath, 'README.md'), '# Fixture\n');
  return { workspace, nucleus, projectPath, mandatesRoot: path.join(nucleus, '.mandates') };
}

async function serverFor(f) {
  const server = Fastify({ ajv: { plugins: [ajv => ajv.addKeyword({ keyword: 'discriminator' })] } });
  for (const schema of [schemas.StandardCreateBody, schemas.GenesisCreateBody, schemas.DomainExpansionCreateBody]) server.addSchema(schema);
  registerMandateRoutes(server, { fsCtx: { workspacePath: f.workspace, org: 'test' } });
  await server.ready();
  return server;
}

test('real Fastify route creates once, replays once and rejects a conflicting launch', async () => {
  const f = fixture();
  const previous = process.env.BLOOM_NUCLEUS_PATH;
  process.env.BLOOM_NUCLEUS_PATH = f.workspace;
  events.length = 0;
  const server = await serverFor(f);
  const payload = {
    mandateLaunchId: '33333333-3333-4333-8333-333333333333',
    mandateType: 'genesis', projectId: 'project-id', project: 'fixture', projectPath: f.projectPath, name: 'fixture', source: 'isolated',
  };
  try {
    const first = await server.inject({ method: 'POST', url: '/mandates', payload });
    assert.equal(first.statusCode, 202, first.body);
    const created = first.json();
    assert.ok(created.mandateId);
    const replay = await server.inject({ method: 'POST', url: '/mandates', payload });
    assert.equal(replay.statusCode, 202, replay.body);
    assert.equal(replay.json().mandateId, created.mandateId);
    assert.deepEqual(fs.readdirSync(f.mandatesRoot), [created.mandateId]);
    assert.equal(events.filter(item => item.event === 'mandate:build:initiated').length, 1);
    const state = JSON.parse(fs.readFileSync(path.join(f.mandatesRoot, created.mandateId, 'mandate_state.json'), 'utf8'));
    assert.equal(state.mandateLaunchId, payload.mandateLaunchId);
    assert.equal(state.status, 'building');
    assert.equal(state.currentPhase, 'ingest');
    assert.equal(state.phases.ingest.status, 'pending');
    assert.deepEqual(state.docsProvided, ['README.md']);
    assert.equal(fs.readFileSync(path.join(f.mandatesRoot, created.mandateId, 'docs', 'README.md'), 'utf8'), '# Fixture\n');
    const conflict = await server.inject({ method: 'POST', url: '/mandates', payload: { ...payload, source: 'changed' } });
    assert.equal(conflict.statusCode, 409, conflict.body);
    assert.equal(conflict.json().error, 'GENESIS_LAUNCH_CONFLICT');
    const invalid = await server.inject({ method: 'POST', url: '/mandates', payload: { ...payload, mandateLaunchId: '../escape' } });
    assert.equal(invalid.statusCode, 400);
  } finally {
    await server.close();
    if (previous === undefined) delete process.env.BLOOM_NUCLEUS_PATH;
    else process.env.BLOOM_NUCLEUS_PATH = previous;
    fs.rmSync(f.workspace, { recursive: true, force: true });
  }
});

test('real route enforces a prepared project recovery reservation', async () => {
  const f = fixture(); const previous = process.env.BLOOM_NUCLEUS_PATH; process.env.BLOOM_NUCLEUS_PATH = f.workspace;
  const server = await serverFor(f); const projectId = 'project-reserved'; const requestId = '88888888-8888-4888-8888-888888888888'; const launchId = '99999999-9999-4999-8999-999999999999';
  const records = path.join(f.nucleus, '.core', 'genesis-projects'); fs.mkdirSync(records, { recursive: true });
  fs.writeFileSync(path.join(records, `${projectId}.json`), JSON.stringify({ schemaVersion: 1, projectId, currentMandateId: 'old', pendingRecovery: { recoveryRequestId: requestId, mandateLaunchId: launchId }, attempts: [] }));
  try {
    const payload = { mandateLaunchId: launchId, recoveryRequestId: requestId, mandateType: 'genesis', projectId, project: 'fixture', projectPath: f.projectPath, name: 'fixture', source: 'core' };
    const accepted = await server.inject({ method: 'POST', url: '/mandates', payload }); assert.equal(accepted.statusCode, 202, accepted.body);
    const conflict = await server.inject({ method: 'POST', url: '/mandates', payload: { ...payload, mandateLaunchId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } });
    assert.equal(conflict.statusCode, 409); assert.equal(conflict.json().error, 'PROJECT_GENESIS_CONFLICT');
  } finally { await server.close(); if (previous === undefined) delete process.env.BLOOM_NUCLEUS_PATH; else process.env.BLOOM_NUCLEUS_PATH = previous; fs.rmSync(f.workspace, { recursive: true, force: true }); }
});
