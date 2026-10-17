import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  canonicalExistingPath, validateDarwinR0Evidence, validateR0Evidence, type DarwinR0Evidence, type R0Evidence,
} from '../../src/preflight/environment-check';
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

// ── Darwin: usuario macOS de prueba ─────────────────────────────────────────
const darwinRoot = join(fixture, 'darwin');
const testHome = join(darwinRoot, 'Users', 'bloom-runner');
const personalHome = join(darwinRoot, 'Users', 'personal');
const darwinBase = join(testHome, 'Library', 'BloomNucleus');
const darwinRepo = join(testHome, 'repos', 'bloom-development-extension');
const darwinD1 = join(darwinBase, 'backend-d1');
for (const path of [personalHome, darwinD1, join(darwinRepo, 'backend')]) mkdirSync(path, { recursive: true });

function darwinEvidence(): DarwinR0Evidence {
  const conductor = join(darwinRepo, 'installer', 'conductor', 'workspace');
  return {
    platform: 'darwin', target: 'isolated', phase: 'before-00a', uid: 502, personalUid: 501,
    home: testHome, passwdHome: testHome, personalHome, launchdManager: 'Aqua',
    defaultKeychain: join(testHome, 'Library', 'Keychains', 'login.keychain-db'),
    runnerBase: darwinBase, expectedBase: darwinBase, repoRoot: darwinRepo,
    workspacePath: join(darwinBase, 'workspaces', 'runner-test'), workspaceOrg: 'runner-test',
    projectSource: join(testHome, 'fixtures', 'sample_project'),
    masterProfilePath: join(darwinBase, 'profiles', 'master'),
    masterExtensionPath: join(darwinBase, 'profiles', 'master', 'extension'),
    nucleusExe: join(darwinBase, 'bin', 'nucleus', 'nucleus'),
    sentinelExe: join(darwinBase, 'bin', 'sentinel', 'sentinel'),
    brainCliExe: join(darwinBase, 'bin', 'brain', 'brain'),
    conductorSource: conductor, expectedConductorSource: conductor,
    electronExe: join(conductor, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron'),
    backendOrigin: 'http://127.0.0.1:8787', backendRepo: join(darwinRepo, 'backend'), backendPort: 8787,
    requiredPorts: [8787],
    ports: [
      { port: 8787, reachable: true, processes: [
        { pid: 40, uid: 502, executablePath: join(darwinRepo, 'backend', 'node_modules', 'workerd'), commandLine: 'workerd serve' },
        { pid: 39, uid: 502, executablePath: '/usr/local/bin/node',
          commandLine: `node ${join(darwinRepo, 'backend', 'node_modules', 'wrangler', 'bin', 'wrangler.js')} dev --local --persist-to ${darwinD1}` }] },
      { port: 5678, reachable: false, processes: [] },
      { port: 7233, reachable: false, processes: [] },
    ],
  };
}

test('Darwin: acepta usuario de prueba con instalación, Keychain, workspace y D1 propios', () => {
  assert.deepEqual(validateDarwinR0Evidence(darwinEvidence()), []);
});

test('Darwin: rechaza el usuario personal, HOME falso, sin Aqua y Keychain ajeno', () => {
  const same = darwinEvidence(); same.uid = same.personalUid;
  assert.match(validateDarwinR0Evidence(same).join(' '), /usuario personal/);
  const spoof = darwinEvidence(); spoof.home = join(darwinRoot, 'otro');
  assert.match(validateDarwinR0Evidence(spoof).join(' '), /HOME no coincide/);
  const noGui = darwinEvidence(); noGui.launchdManager = 'Background';
  assert.match(validateDarwinR0Evidence(noGui).join(' '), /Aqua/);
  const keychain = darwinEvidence(); keychain.defaultKeychain = join(personalHome, 'Library', 'Keychains', 'login.keychain-db');
  assert.match(validateDarwinR0Evidence(keychain).join(' '), /Keychain/);
});

test('Darwin: rechaza instalación, checkout, workspace o fixture fuera del home de prueba', () => {
  const base = darwinEvidence(); base.runnerBase = join(personalHome, 'Library', 'BloomNucleus');
  assert.match(validateDarwinR0Evidence(base).join(' '), /<home>\/Library\/BloomNucleus/);
  const repo = darwinEvidence(); repo.repoRoot = join(personalHome, 'repos', 'bloom-development-extension');
  assert.match(validateDarwinR0Evidence(repo).join(' '), /checkout/);
  const ws = darwinEvidence(); ws.workspacePath = join(personalHome, 'repos', 'runner-test');
  assert.match(validateDarwinR0Evidence(ws).join(' '), /workspace fuera/);
  const org = darwinEvidence(); org.workspaceOrg = 'elias-repos'; org.workspacePath = join(darwinBase, 'workspaces', 'elias-repos');
  assert.match(validateDarwinR0Evidence(org).join(' '), /organización de prueba/);
  const project = darwinEvidence(); project.projectSource = join(personalHome, 'sample_project');
  assert.match(validateDarwinR0Evidence(project).join(' '), /proyecto fixture/);
  const brain = darwinEvidence(); brain.brainCliExe = join(personalHome, 'Library', 'BloomNucleus', 'bin', 'brain', 'brain');
  assert.match(validateDarwinR0Evidence(brain).join(' '), /CLI Brain/);
});

test('Darwin: un puerto de otro usuario o sin dueño visible es colisión', () => {
  const hidden = darwinEvidence(); hidden.ports[2] = { port: 7233, reachable: true, processes: [] };
  assert.match(validateDarwinR0Evidence(hidden).join(' '), /colisión: puerto 7233 .*dueño no visible/);
  const foreign = darwinEvidence();
  foreign.ports[1] = { port: 5678, reachable: true, processes: [{ pid: 8104, uid: 501,
    executablePath: join(personalHome, 'Library', 'BloomNucleus', 'bin', 'brain', 'brain'), commandLine: 'brain' }] };
  assert.match(validateDarwinR0Evidence(foreign).join(' '), /colisión: puerto 5678 pertenece al uid 501/);
  const unattributed = darwinEvidence();
  unattributed.ports[1] = { port: 5678, reachable: true, processes: [{ pid: 9, uid: 502, executablePath: '/usr/bin/python3', commandLine: 'python3 -m http.server 5678' }] };
  assert.match(validateDarwinR0Evidence(unattributed).join(' '), /puerto 5678 sin proceso atribuible/);
  const own = darwinEvidence(); own.phase = 'after-conductor'; own.requiredPorts = [8787, 5678, 7233];
  own.ports[1] = { port: 5678, reachable: true, processes: [{ pid: 9, uid: 502, executablePath: join(darwinBase, 'bin', 'brain', 'brain'), commandLine: 'brain' }] };
  assert.match(validateDarwinR0Evidence(own).join(' '), /puerto 7233 requerido sin proceso escuchando/);
  own.ports[2] = { port: 7233, reachable: true, processes: [{ pid: 10, uid: 502, executablePath: join(darwinBase, 'bin', 'temporal', 'temporal'), commandLine: 'temporal server start-dev' }] };
  assert.deepEqual(validateDarwinR0Evidence(own), []);
});

test('Darwin: Backend debe ser Wrangler del checkout de prueba con D1 en la instalación de prueba', () => {
  const foreign = darwinEvidence(); foreign.ports[0].processes = foreign.ports[0].processes.map(p => ({ ...p, uid: 501 }));
  assert.match(validateDarwinR0Evidence(foreign).join(' '), /colisión: puerto 8787/);
  const otherD1 = darwinEvidence(); const shared = join(darwinRepo, 'backend', '.wrangler'); mkdirSync(shared, { recursive: true });
  otherD1.ports[0].processes[1].commandLine = `node ${join(darwinRepo, 'backend', 'wrangler.js')} dev --local --persist-to ${shared}`;
  assert.match(validateDarwinR0Evidence(otherD1).join(' '), /backend-d1/);
  const relative = darwinEvidence();
  relative.ports[0].processes[1].commandLine = `node ${join(darwinRepo, 'backend', 'wrangler.js')} dev --local --persist-to .wrangler`;
  assert.match(validateDarwinR0Evidence(relative).join(' '), /ruta absoluta/);
});

// ── Darwin installed: la instalación del usuario actual ─────────────────────
const ownHome = join(darwinRoot, 'Users', 'owner');
const ownBase = join(ownHome, 'Library', 'BloomNucleus');
const ownRepo = join(ownHome, 'repos', 'bloom-development-extension');
const ownD1 = join(ownRepo, 'backend', '.wrangler');
mkdirSync(ownD1, { recursive: true });

function installedDarwinEvidence(): DarwinR0Evidence {
  const conductor = join(ownRepo, 'installer', 'conductor', 'workspace');
  return {
    platform: 'darwin', target: 'installed', phase: 'before-00a', uid: 501, personalUid: 501,
    home: ownHome, passwdHome: ownHome, personalHome: ownHome, launchdManager: 'Aqua',
    defaultKeychain: join(ownHome, 'Library', 'Keychains', 'login.keychain-db'),
    runnerBase: ownBase, expectedBase: ownBase, repoRoot: ownRepo,
    workspacePath: join(ownHome, 'repos', 'runner-mac'), workspaceOrg: 'runner-mac',
    projectSource: join(ownHome, 'fixtures', 'sample_project'),
    masterProfilePath: join(ownBase, 'profiles', 'master'),
    masterExtensionPath: join(ownBase, 'profiles', 'master', 'extension'),
    nucleusExe: join(ownBase, 'bin', 'nucleus', 'nucleus'),
    sentinelExe: join(ownBase, 'bin', 'sentinel', 'sentinel'),
    brainCliExe: join(ownBase, 'bin', 'brain', 'brain'),
    conductorSource: conductor, expectedConductorSource: conductor,
    electronExe: join(conductor, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron'),
    backendOrigin: 'http://127.0.0.1:8787', backendRepo: join(ownRepo, 'backend'), backendPort: 8787,
    requiredPorts: [8787],
    ports: [
      { port: 8787, reachable: true, processes: [
        { pid: 40, uid: 501, executablePath: join(ownRepo, 'backend', 'node_modules', 'workerd'), commandLine: 'workerd serve' },
        { pid: 39, uid: 501, executablePath: '/usr/local/bin/node',
          commandLine: `node ${join(ownRepo, 'backend', 'node_modules', 'wrangler', 'bin', 'wrangler.js')} dev --local --persist-to ${ownD1}` }] },
      { port: 5678, reachable: true, processes: [{ pid: 8104, uid: 501, executablePath: join(ownBase, 'bin', 'brain', 'brain'), commandLine: 'brain' }] },
      { port: 7233, reachable: false, processes: [] },
    ],
  };
}

test('Darwin installed: acepta la instalación del usuario actual con workspace en ~/repos y D1 del checkout', () => {
  assert.deepEqual(validateDarwinR0Evidence(installedDarwinEvidence()), []);
});

test('Darwin installed: rechaza otro usuario, otra instalación, workspace fuera de ~/repos y D1 ajena', () => {
  const other = installedDarwinEvidence(); other.personalUid = 502;
  assert.match(validateDarwinR0Evidence(other).join(' '), /usuario y home actuales/);
  const base = installedDarwinEvidence(); base.runnerBase = join(ownHome, 'otra', 'BloomNucleus');
  assert.match(validateDarwinR0Evidence(base).join(' '), /<home>\/Library\/BloomNucleus/);
  const ws = installedDarwinEvidence(); ws.workspacePath = join(ownBase, 'workspaces', 'runner-mac');
  assert.match(validateDarwinR0Evidence(ws).join(' '), /workspace instalado/);
  const project = installedDarwinEvidence(); project.projectSource = join(ownHome, 'repos', 'runner-mac', 'sample_project');
  assert.match(validateDarwinR0Evidence(project).join(' '), /proyecto fixture/);
  const d1 = installedDarwinEvidence();
  d1.ports[0].processes[1].commandLine = `node ${join(ownRepo, 'backend', 'wrangler.js')} dev --local --persist-to ${darwinD1}`;
  assert.match(validateDarwinR0Evidence(d1).join(' '), /backend\/\.wrangler/);
  const foreign = installedDarwinEvidence(); foreign.ports[2] = { port: 7233, reachable: true, processes: [] };
  assert.match(validateDarwinR0Evidence(foreign).join(' '), /colisión: puerto 7233/);
});
