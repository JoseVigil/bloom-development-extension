import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { assembleWindowsIsolatedRoot } from '../../src/runner-core/windows-isolated-root-assembler';
import { withinWindowsRoot } from '../../src/runner-core/windows-isolation-preflight';

function cleanup(parent: string): void {
  const tmp = path.resolve(os.tmpdir());
  const target = path.resolve(parent);
  if (!target.startsWith(tmp + path.sep) || !path.basename(target).startsWith('runner-core-root-test-')) throw new Error('unsafe_fixture_cleanup');
  fs.rmSync(target, { recursive: true, force: true });
}

async function fixture(parent: string, asarEntry?: string): Promise<string> {
  const sourceDir = path.join(parent, 'package');
  const asarSource = path.join(parent, 'asar-source');
  for (const dir of ['resources', 'shared', 'locales', 'node_modules']) fs.mkdirSync(path.join(sourceDir, dir), { recursive: true });
  fs.mkdirSync(asarSource);
  fs.writeFileSync(path.join(asarSource, 'main_conductor.js'), 'fixture main');
  fs.writeFileSync(path.join(asarSource, 'package.json'), '{"name":"fixture"}');
  if (asarEntry) fs.writeFileSync(path.join(asarSource, asarEntry), 'SYNTHETIC_VALUE_DO_NOT_LOG');
  fs.writeFileSync(path.join(sourceDir, 'bloom-workspace.exe'), 'fixture executable');
  const asar = require('@electron/asar') as { createPackage(src: string, dest: string): Promise<unknown> };
  await asar.createPackage(asarSource, path.join(sourceDir, 'resources', 'app.asar'));
  fs.writeFileSync(path.join(sourceDir, 'shared', 'logger.js'), 'fixture logger');
  fs.writeFileSync(path.join(sourceDir, 'locales', 'en-US.pak'), 'fixture locale');
  fs.writeFileSync(path.join(sourceDir, 'node_modules', 'fixture.js'), 'fixture dependency');
  fs.writeFileSync(path.join(sourceDir, 'libEGL.dll'), 'fixture library');
  return path.join(sourceDir, 'bloom-workspace.exe');
}

test('stages every package file with SHA-256 and no source path in manifest', { skip: process.platform !== 'win32' }, async () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-core-root-test-'));
  try {
    const source = await fixture(parent);
    const assembled = assembleWindowsIsolatedRoot({ parentDir: path.join(parent, 'runs'), executable: source, fixtureMode: true });
    assert.equal(withinWindowsRoot(assembled.executable, assembled.root), true);
    assert.equal(fs.readFileSync(assembled.executable, 'utf8'), 'fixture executable');
    const manifest = JSON.parse(fs.readFileSync(assembled.manifestPath, 'utf8'));
    assert.equal(manifest.runId, assembled.runId);
    assert.equal(manifest.files.length, 6);
    assert.equal(manifest.source, undefined);
    for (const entry of manifest.files) {
      const staged = fs.readFileSync(path.join(assembled.root, 'bin', entry.path));
      assert.equal(entry.size, staged.length);
      assert.equal(entry.sha256, createHash('sha256').update(staged).digest('hex'));
    }
  } finally {
    cleanup(parent);
  }
});

test('refuses a missing Workspace executable', { skip: process.platform !== 'win32' }, () => {
  assert.throws(() => assembleWindowsIsolatedRoot({ executable: 'C:\\missing\\workspace.exe', fixtureMode: true }));
});

test('production staging refuses a root without native ACL and probe evidence', { skip: process.platform !== 'win32' }, async () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-core-root-test-'));
  try {
    const source = await fixture(parent);
    assert.throws(() => assembleWindowsIsolatedRoot({ executable: source }), /native_root_required_before_copy/);
    assert.throws(() => assembleWindowsIsolatedRoot({ executable: source, preparedRoot: {
      root: path.join(os.tmpdir(), 'bloom-runner-core', 'rc-fixture'),
      runId: '123e4567-e89b-42d3-a456-426614174000', rootAclVerified: true, probesPassed: false,
    } }), /native_root_evidence_invalid/);
  } finally { cleanup(parent); }
});

test('refuses an incomplete package before making an isolated run', { skip: process.platform !== 'win32' }, async () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-core-root-test-'));
  try {
    const source = await fixture(parent);
    fs.rmSync(path.join(parent, 'package', 'resources', 'app.asar'));
    assert.throws(() => assembleWindowsIsolatedRoot({ parentDir: path.join(parent, 'runs'), executable: source, fixtureMode: true }), /workspace_package_incomplete/);
    assert.equal(fs.existsSync(path.join(parent, 'runs')), false);
  } finally { cleanup(parent); }
});

test('refuses a junction inside the source package', { skip: process.platform !== 'win32' }, async () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-core-root-test-'));
  try {
    const source = await fixture(parent);
    const outside = path.join(parent, 'outside');
    fs.mkdirSync(outside);
    fs.symlinkSync(outside, path.join(parent, 'package', 'redirect'), 'junction');
    assert.throws(() => assembleWindowsIsolatedRoot({ parentDir: path.join(parent, 'runs'), executable: source, fixtureMode: true }), /package_reparse_point/);
    assert.equal(fs.existsSync(path.join(parent, 'runs')), false);
  } finally { cleanup(parent); }
});

test('rejects a prohibited ASAR entry before creating R without printing its value', { skip: process.platform !== 'win32' }, async () => {
  for (const prohibited of ['.env', '.dev.vars', 'nucleus.json', 'profiles.json', 'api.pem']) {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-core-root-test-'));
    try {
      const source = await fixture(parent, prohibited);
      assert.throws(() => assembleWindowsIsolatedRoot({ parentDir: path.join(parent, 'runs'), executable: source, fixtureMode: true }), (error: unknown) => {
        assert.equal((error as Error).message, 'embedded_config_scan_failed');
        assert.equal((error as Error).message.includes('SYNTHETIC_VALUE_DO_NOT_LOG'), false);
        return true;
      });
      assert.equal(fs.existsSync(path.join(parent, 'runs')), false);
    } finally { cleanup(parent); }
  }
});

test('rejects prohibited or unexpected outer files before creating R', { skip: process.platform !== 'win32' }, async () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-core-root-test-'));
  try {
    const source = await fixture(parent);
    const sourceDir = path.dirname(source);
    fs.writeFileSync(path.join(sourceDir, 'credentials.json'), 'SYNTHETIC_VALUE_DO_NOT_LOG');
    assert.throws(() => assembleWindowsIsolatedRoot({ parentDir: path.join(parent, 'runs'), executable: source, fixtureMode: true }), /package_forbidden_configuration/);
    fs.rmSync(path.join(sourceDir, 'credentials.json'));
    fs.writeFileSync(path.join(sourceDir, 'unexpected.dat'), 'fixture only');
    assert.throws(() => assembleWindowsIsolatedRoot({ parentDir: path.join(parent, 'runs'), executable: source, fixtureMode: true }), /package_outer_unexpected/);
    assert.equal(fs.existsSync(path.join(parent, 'runs')), false);
  } finally { cleanup(parent); }
});
