import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { canonicalExistingPath, validateR0Evidence, type R0Evidence } from '../../src/preflight/environment-check';
import { resetOnboardingState } from '../../src/config/bloom-paths';
import playwrightGlobalSetup from '../../scripts/preflight-check';

const fixture = mkdtempSync(join(tmpdir(), 'synapse-r0-'));
const personal = join(fixture, 'personal', 'BloomNucleus');
const isolated = join(fixture, 'isolated', 'BloomNucleus');
const appData = join(fixture, 'roaming');
const personalAppData = join(fixture, 'personal', 'Roaming');
const workspace = join(isolated, 'workspaces', 'runner');
const backend = join(fixture, 'backend');
const d1 = join(isolated, 'backend-d1');
for (const path of [personal, appData, personalAppData, workspace, backend, d1, join(backend, '.wrangler')]) mkdirSync(path, { recursive: true });

after(() => {
  const target = resolve(fixture);
  assert.ok(target.startsWith(resolve(tmpdir()) + '\\') || target.startsWith(resolve(tmpdir()) + '/'));
  rmSync(target, { recursive: true, force: true });
});

function evidence(): R0Evidence {
  return {
    phase: 'before-00a',
    runnerBase: isolated, conductorBase: isolated, nucleusBase: isolated,
    personalBase: personal, appDataDir: appData, localAppDataDir: join(fixture, 'isolated'),
    personalAppDataDir: personalAppData, workspacePath: workspace, workspaceOrg: 'runner-test',
    masterProfilePath: join(isolated, 'profiles', 'master'),
    masterExtensionPath: join(isolated, 'profiles', 'master', 'extension'),
    nucleusExe: join(isolated, 'bin', 'nucleus', 'nucleus.exe'),
    sentinelExe: join(isolated, 'bin', 'sentinel', 'sentinel.exe'),
    brainCliExe: join(isolated, 'bin', 'brain', 'brain.exe'),
    conductorSource: join(fixture, 'conductor', 'workspace'),
    expectedConductorSource: join(fixture, 'conductor', 'workspace'),
    electronExe: join(fixture, 'conductor', 'workspace', 'node_modules', 'electron', 'dist', 'electron.exe'),
    backendOrigin: 'http://localhost:8787', backendRepo: backend, backendPort: 8787,
    requiredPorts: [8787],
    ports: [
      { port: 8787, processes: [{ executablePath: join(backend, 'workerd.exe'), commandLine: 'workerd' },
        { executablePath: join(backend, 'node.exe'), commandLine: `node "${join(backend, 'wrangler.js')}" dev --local --persist-to "${d1}"` }] },
      { port: 5678, processes: [{ executablePath: join(isolated, 'bin', 'brain', 'brain.exe'), commandLine: 'brain' }] },
    ],
  };
}

test('acepta rutas, D1 y procesos de una instalación descartable', () => {
  assert.deepEqual(validateR0Evidence(evidence()), []);
});

function installedEvidence(): R0Evidence {
  const item = evidence();
  item.target = 'installed';
  item.runnerBase = personal;
  item.conductorBase = personal;
  item.nucleusBase = personal;
  item.localAppDataDir = dirname(personal);
  item.appDataDir = personalAppData;
  item.workspaceOrg = 'eias-repos';
  item.workspacePath = join('C:\\repos', item.workspaceOrg);
  item.masterProfilePath = join(personal, 'profiles', 'master');
  item.masterExtensionPath = join(personal, 'profiles', 'master', 'extension');
  item.nucleusExe = join(personal, 'bin', 'nucleus', 'nucleus.exe');
  item.sentinelExe = join(personal, 'bin', 'sentinel', 'sentinel.exe');
  item.brainCliExe = join(personal, 'bin', 'brain', 'brain.exe');
  item.ports[0].processes[1].commandLine = `node "${join(backend, 'wrangler.js')}" dev --local --persist-to "${join(backend, '.wrangler')}"`;
  item.ports[1].processes[0].executablePath = join(personal, 'bin', 'brain', 'brain.exe');
  return item;
}

test('modo installed acepta la instalación AppData con D1 explícita del Backend', () => {
  assert.deepEqual(validateR0Evidence(installedEvidence()), []);
});

test('modo installed exige dueño verificable de Brain y Temporal tras Conductor', () => {
  const item = installedEvidence();
  item.phase = 'after-conductor';
  item.requiredPorts = [8787, 5678, 7233];
  item.ports.push({ port: 7233, processes: [{ executablePath: join(personal, 'bin', 'temporal', 'temporal.exe'), commandLine: 'temporal server start-dev' }] });
  assert.deepEqual(validateR0Evidence(item), []);
  item.ports[2].processes = [];
  assert.match(validateR0Evidence(item).join(' '), /puerto 7233 requerido sin proceso escuchando/);
});

test('modo installed rechaza otro AppData, workspace, D1 o proceso ajeno', () => {
  const wrongAppData = installedEvidence();
  wrongAppData.appDataDir = appData;
  assert.match(validateR0Evidence(wrongAppData).join(' '), /APPDATA/);
  const wrongWorkspace = installedEvidence();
  wrongWorkspace.workspacePath = workspace;
  assert.match(validateR0Evidence(wrongWorkspace).join(' '), /workspace instalado/);
  const wrongD1 = installedEvidence();
  wrongD1.ports[0].processes[1].commandLine = `node "${join(backend, 'wrangler.js')}" dev --local --persist-to "${d1}"`;
  assert.match(validateR0Evidence(wrongD1).join(' '), /persistencia D1 fuera/);
  const foreign = installedEvidence();
  foreign.ports[1].processes[0].executablePath = join(isolated, 'bin', 'brain', 'brain.exe');
  assert.match(validateR0Evidence(foreign).join(' '), /puerto 5678/);
});

test('antes de 00a sólo Backend es obligatorio; después de Conductor lo son Brain y Temporal', () => {
  const pre = evidence();
  pre.ports = pre.ports.filter(p => p.port === 8787);
  assert.deepEqual(validateR0Evidence(pre), []);
  const post = evidence();
  post.phase = 'after-conductor';
  post.requiredPorts = [8787, 5678, 7233];
  post.ports.push({ port: 7233, processes: [{ executablePath: join(isolated, 'bin', 'temporal', 'temporal.exe'), commandLine: 'temporal server start-dev' }] });
  assert.deepEqual(validateR0Evidence(post), []);
  post.ports.find(p => p.port === 7233)!.processes = [];
  assert.match(validateR0Evidence(post).join(' '), /puerto 7233 requerido sin proceso escuchando/);
  post.ports.pop();
  assert.match(validateR0Evidence(post).join(' '), /puerto 7233 sin inspección/);
});

test('APPDATA personal, compartido o enlazado a datos personales aborta', () => {
  const personalRoute = evidence();
  personalRoute.appDataDir = personalAppData;
  assert.match(validateR0Evidence(personalRoute).join(' '), /APPDATA/);
  const shared = evidence();
  shared.appDataDir = join(fixture, 'isolated', 'Roaming');
  assert.match(validateR0Evidence(shared).join(' '), /APPDATA/);
  const link = join(fixture, 'roaming-personal-link');
  symlinkSync(personalAppData, link, 'junction');
  const linked = evidence();
  linked.appDataDir = canonicalExistingPath(link, 'APPDATA enlazado');
  assert.match(validateR0Evidence(linked).join(' '), /APPDATA/);
});

test('puertos opcionales ocupados requieren atribución; comandos ajenos no pasan', () => {
  const optional = evidence();
  optional.ports.push({ port: 48215, processes: [] });
  assert.deepEqual(validateR0Evidence(optional), []);
  optional.ports[2].processes = [{ executablePath: join(personal, 'node.exe'), commandLine: 'node bundle.js' }];
  assert.match(validateR0Evidence(optional).join(' '), /puerto 48215/);
  optional.ports[2].processes = [{ executablePath: 'C:\\Program Files\\nodejs\\node.exe',
    commandLine: `node "${join(isolated, 'bin', 'bootstrap', 'bundle.js')}"` }];
  assert.deepEqual(validateR0Evidence(optional), []);
});

test('rechaza ruta personal y override unilateral', () => {
  const personalRoute = evidence();
  personalRoute.runnerBase = personal;
  assert.match(validateR0Evidence(personalRoute).join(' '), /personales/);
  const unilateral = evidence();
  unilateral.conductorBase = personal;
  assert.match(validateR0Evidence(unilateral).join(' '), /no resuelven/);
});

test('rechaza workspace personal y enlaces hacia datos personales', () => {
  const direct = evidence();
  direct.workspacePath = join(personal, 'workspace');
  assert.match(validateR0Evidence(direct).join(' '), /workspace fuera/);
  const link = join(isolated, 'linked-personal');
  symlinkSync(personal, link, 'junction');
  const linked = evidence();
  linked.workspacePath = canonicalExistingPath(link, 'workspace enlazado');
  assert.match(validateR0Evidence(linked).join(' '), /workspace fuera/);
  const wrongSubtree = evidence();
  wrongSubtree.workspacePath = join(isolated, 'config', 'runner');
  assert.match(validateR0Evidence(wrongSubtree).join(' '), /workspace fuera/);
  const traversal = evidence();
  traversal.workspaceOrg = '..';
  assert.match(validateR0Evidence(traversal).join(' '), /organización de prueba/);
});

test('rechaza D1 compartida, proceso ajeno y puerto sin inspección', () => {
  const shared = evidence();
  shared.ports[0].processes[1].commandLine = `node "${join(backend, 'wrangler.js')}" dev --local --persist-to "${join(backend, '.wrangler')}"`;
  assert.match(validateR0Evidence(shared).join(' '), /D1 compartida/);
  const relativeD1 = evidence();
  relativeD1.ports[0].processes[1].commandLine = `node "${join(backend, 'wrangler.js')}" dev --local --persist-to "backend-d1"`;
  assert.match(validateR0Evidence(relativeD1).join(' '), /ruta absoluta/);
  const foreign = evidence();
  foreign.ports[1].processes[0].executablePath = join(personal, 'brain.exe');
  assert.match(validateR0Evidence(foreign).join(' '), /puerto 5678/);
  const missing = evidence();
  missing.requiredPorts.push(5678);
  missing.ports.pop();
  assert.match(validateR0Evidence(missing).join(' '), /puerto 5678 sin inspección/);
});

test('rechaza inspección sin ancestro Wrangler verificable', () => {
  const unknown = evidence();
  unknown.ports[0].processes.pop();
  assert.match(validateR0Evidence(unknown).join(' '), /Wrangler y --persist-to/);
});

test('rechaza binarios personales y Conductor fuera del checkout previsto', () => {
  const brain = evidence();
  brain.brainCliExe = join(personal, 'bin', 'brain.exe');
  assert.match(validateR0Evidence(brain).join(' '), /CLI Brain/);
  const conductor = evidence();
  conductor.conductorSource = join(personal, 'workspace');
  assert.match(validateR0Evidence(conductor).join(' '), /Conductor ajeno/);
});

test('resetOnboardingState no escribe si R0 no está demostrado', () => {
  const baseDir = join(fixture, 'reset-target');
  const configDir = join(baseDir, 'config');
  mkdirSync(configDir, { recursive: true });
  const nucleusJson = join(configDir, 'nucleus.json');
  const original = '{"onboarding":{"completed":true}}';
  writeFileSync(nucleusJson, original);
  const previous = process.env.BLOOM_APPDATA_DIR;
  delete process.env.BLOOM_APPDATA_DIR;
  try {
    assert.throws(() => resetOnboardingState({
      baseDir, binDir: join(baseDir, 'bin'), configDir,
      profilesDir: join(baseDir, 'profiles'), profilesJson: join(configDir, 'profiles.json'), nucleusJson,
    }), /R0:/);
    assert.equal(readFileSync(nucleusJson, 'utf8'), original);
  } finally {
    if (previous === undefined) delete process.env.BLOOM_APPDATA_DIR;
    else process.env.BLOOM_APPDATA_DIR = previous;
  }
});

test('globalSetup de Playwright aborta antes de crear workers sin aislamiento', () => {
  const previous = process.env.BLOOM_APPDATA_DIR;
  delete process.env.BLOOM_APPDATA_DIR;
  try {
    assert.throws(() => playwrightGlobalSetup(), /R0:/);
  } finally {
    if (previous === undefined) delete process.env.BLOOM_APPDATA_DIR;
    else process.env.BLOOM_APPDATA_DIR = previous;
  }
});
