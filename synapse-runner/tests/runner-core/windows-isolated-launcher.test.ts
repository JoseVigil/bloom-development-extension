import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  WindowsNativePrototype,
  WindowsCoreIsolationError,
  evidenceFromNativeCapabilities,
  launchWindowsCorePrototype,
  verifyStagedEmbeddedConfiguration,
  verifyStagedPackageManifest,
} from '../../src/runner-core/windows-isolated-launcher';
import { WindowsCoreEvidence, WINDOWS_CORE_PORTS, makeWindowsCoreEnvironment, validateWindowsCoreEvidence } from '../../src/runner-core/windows-isolation-preflight';
import { assembleWindowsIsolatedRoot } from '../../src/runner-core/windows-isolated-root-assembler';

const root = 'C:\\runner-fixture\\run-1';
const executable = `${root}\\bin\\fixture.exe`;

function evidence(): WindowsCoreEvidence {
  return {
    platform: 'win32', root, executable,
    stagedManifestVerified: true, embeddedConfigScanPassed: true,
    tokenUserVerified: true, restrictedSidsVerified: true,
    removedPrivilegesVerified: true, rootAclVerified: true,
    rootDaclReadback: true, restrictedChildProbePassed: true,
    desktopAclVerified: true, jobVerified: true, nativeIsolationDemonstrated: true,
    childEnvironment: makeWindowsCoreEnvironment(root, 'C:\\Windows'),
    accessProbes: [
      { target: 'root', read: true, write: true, delete: true, writeDac: false, writeOwner: false },
      { target: 'forbidden_fixture', read: false, write: false, delete: false, writeDac: false, writeOwner: false },
    ],
    ports: WINDOWS_CORE_PORTS.map((port) => ({ port, ipv4Inspected: true, ipv6Inspected: true, owners: [] })),
  };
}

test('launcher rejects failed native evidence before launch', async () => {
  let launches = 0;
  const native: WindowsNativePrototype = {
    inspect: async () => ({ ...evidence(), jobVerified: false }),
    launch: async () => { launches++; return { pid: 7, createdAt: '1', jobId: 'fixture' }; },
    stop: async () => {},
  };
  await assert.rejects(launchWindowsCorePrototype(native, root, executable), WindowsCoreIsolationError);
  assert.equal(launches, 0);
});

test('launcher rejects evidence for a different root and outside executable', async () => {
  const native: WindowsNativePrototype = {
    inspect: async () => ({ ...evidence(), root: 'C:\\runner-fixture\\run-2' }),
    launch: async () => { throw new Error('unexpected launch'); },
    stop: async () => {},
  };
  await assert.rejects(launchWindowsCorePrototype(native, root, executable), /native_evidence_binding_mismatch/);
  await assert.rejects(launchWindowsCorePrototype(native, root, 'C:\\Users\\josev\\AppData\\Local\\BloomNucleus\\bin\\workspace\\bloom-workspace.exe'), /launch_path_outside_root/);
});

test('fake launch records PID and closes its job once', async () => {
  let stops = 0;
  const native: WindowsNativePrototype = {
    inspect: async () => evidence(),
    launch: async () => ({ pid: 1234, createdAt: '2026-01-01T00:00:00Z', jobId: 'fixture-job' }),
    stop: async (id) => { assert.equal(id, 'fixture-job'); stops++; },
  };
  const launched = await launchWindowsCorePrototype(native, root, executable);
  assert.equal(launched.pid, 1234);
  await launched.stop();
  await launched.stop();
  assert.equal(stops, 1);
});

test('native capability projection proves only observed facts and leaves launch guards closed', () => {
  const projected = evidenceFromNativeCapabilities({
    source_token_type: 'primary', restricted_token_created: true,
    restricting_sid_present: true, privileges_disabled: true,
    isolation_demonstrated: false,
  }, root, executable, true, false);
  assert.equal(projected.stagedManifestVerified, true);
  assert.equal(projected.embeddedConfigScanPassed, false);
  assert.equal(projected.restrictedSidsVerified, true);
  assert.equal(projected.removedPrivilegesVerified, true);
  assert.equal(projected.jobVerified, false);
  assert.equal(projected.nativeIsolationDemonstrated, false);
  assert.equal(validateWindowsCoreEvidence(projected).pass, false);
  const policyPassed = evidenceFromNativeCapabilities({}, root, executable, true, true);
  assert.equal(policyPassed.embeddedConfigScanPassed, true);
  assert.equal(validateWindowsCoreEvidence(policyPassed).pass, false);
  const hashFailed = evidenceFromNativeCapabilities({}, root, executable, false, true);
  assert.equal(hashFailed.embeddedConfigScanPassed, false);
});

test('root ACL evidence requires native readback and every restricted-child probe', () => {
  const proof = {
    root, run_id: '123e4567-e89b-42d3-a456-426614174000', dacl_readback: true,
    root_acl_verified: true, code: 'root_acl_and_fixture_probes_passed',
    access_probes: {
      root_read: true, root_write: true, forbidden_read_denied: true,
      forbidden_write_denied: true, forbidden_delete_denied: true,
      forbidden_write_dac_denied: true, forbidden_write_owner_denied: true,
    },
  };
  const accepted = evidenceFromNativeCapabilities({}, root, executable, true, true, proof);
  assert.equal(accepted.rootAclVerified, true);
  assert.equal(accepted.rootDaclReadback, true);
  assert.equal(accepted.restrictedChildProbePassed, true);
  assert.equal(accepted.accessProbes?.length, 2);
  assert.equal(validateWindowsCoreEvidence(accepted).pass, false); // desktop, Job and ports remain absent
  const incomplete = evidenceFromNativeCapabilities({}, root, executable, true, true, {
    ...proof, access_probes: { ...proof.access_probes, forbidden_write_owner_denied: false },
  });
  assert.equal(incomplete.rootAclVerified, false);
  assert.equal(incomplete.accessProbes?.length, 0);

  const desktopOnly = evidenceFromNativeCapabilities({}, root, executable, true, true, proof, {
    root, run_id: proof.run_id, desktop_acl_verified: true, job_verified: false,
    child_pid: 100, child_created_at: '2026-10-10T00:00:00Z', code: 'fixture_child_exit_34_win32_5',
  });
  assert.equal(desktopOnly.desktopAclVerified, true);
  assert.equal(desktopOnly.jobVerified, false);
  const completeFixture = evidenceFromNativeCapabilities({}, root, executable, true, true, proof, {
    root, run_id: proof.run_id, desktop_acl_verified: true, job_verified: true,
    child_pid: 100, child_created_at: '2026-10-10T00:00:00Z',
    grandchild_pid: 101, grandchild_created_at: '2026-10-10T00:00:01Z',
    code: 'desktop_job_fixture_passed',
  });
  assert.equal(completeFixture.jobVerified, true);
  const wrongRun = evidenceFromNativeCapabilities({}, root, executable, true, true, proof, {
    root, run_id: 'different', desktop_acl_verified: true, job_verified: true,
    child_pid: 100, child_created_at: '2026-10-10T00:00:00Z',
    grandchild_pid: 101, grandchild_created_at: '2026-10-10T00:00:01Z',
    code: 'desktop_job_fixture_passed',
  });
  assert.equal(wrongRun.desktopAclVerified, false);
  assert.equal(wrongRun.jobVerified, false);
});

async function withStagedFixture(fn: (staged: ReturnType<typeof assembleWindowsIsolatedRoot>) => void | Promise<void>): Promise<void> {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-core-launch-test-'));
  try {
    const source = path.join(parent, 'package');
    const asarSource = path.join(parent, 'asar-source');
    fs.mkdirSync(path.join(source, 'resources'), { recursive: true });
    fs.mkdirSync(asarSource);
    fs.writeFileSync(path.join(asarSource, 'main_conductor.js'), 'fixture main');
    fs.writeFileSync(path.join(asarSource, 'package.json'), '{"name":"fixture"}');
    fs.writeFileSync(path.join(source, 'bloom-workspace.exe'), 'fixture executable');
    const asar = require('@electron/asar') as { createPackage(src: string, dest: string): Promise<unknown> };
    await asar.createPackage(asarSource, path.join(source, 'resources', 'app.asar'));
    fs.writeFileSync(path.join(source, 'libEGL.dll'), 'fixture DLL');
    const staged = assembleWindowsIsolatedRoot({ parentDir: path.join(parent, 'runs'), executable: path.join(source, 'bloom-workspace.exe'), fixtureMode: true });
    await fn(staged);
  } finally {
    const tmp = path.resolve(os.tmpdir());
    const target = path.resolve(parent);
    if (!target.startsWith(tmp + path.sep) || !path.basename(target).startsWith('runner-core-launch-test-')) throw new Error('unsafe_fixture_cleanup');
    fs.rmSync(target, { recursive: true, force: true });
  }
}

test('complete synthetic package verifies hashes and embedded structure', { skip: process.platform !== 'win32' }, async () => {
  await withStagedFixture((staged) => {
    assert.equal(verifyStagedPackageManifest(staged.root, staged.executable), true);
    assert.equal(verifyStagedEmbeddedConfiguration(staged.root), true);
  });
});

test('modified or unlisted staged file invalidates manifest', { skip: process.platform !== 'win32' }, async () => {
  await withStagedFixture((staged) => {
    const dll = path.join(staged.root, 'bin', 'libEGL.dll');
    fs.writeFileSync(dll, 'tampered');
    assert.equal(verifyStagedPackageManifest(staged.root, staged.executable), false);
  });
  await withStagedFixture((staged) => {
    fs.writeFileSync(path.join(staged.root, 'bin', 'unlisted.env'), 'fixture only');
    assert.equal(verifyStagedPackageManifest(staged.root, staged.executable), false);
  });
});

test('manifest edited to omit or redirect a file fails verification', { skip: process.platform !== 'win32' }, async () => {
  await withStagedFixture((staged) => {
    const manifest = JSON.parse(fs.readFileSync(staged.manifestPath, 'utf8'));
    manifest.files.pop();
    fs.writeFileSync(staged.manifestPath, JSON.stringify(manifest));
    assert.equal(verifyStagedPackageManifest(staged.root, staged.executable), false);
  });
  await withStagedFixture((staged) => {
    const manifest = JSON.parse(fs.readFileSync(staged.manifestPath, 'utf8'));
    manifest.files[0].path = '../outside';
    fs.writeFileSync(staged.manifestPath, JSON.stringify(manifest));
    assert.equal(verifyStagedPackageManifest(staged.root, staged.executable), false);
  });
});

test('staged ASAR contamination fails config scan and altered hash', { skip: process.platform !== 'win32' }, async () => {
  await withStagedFixture(async (staged) => {
    const asarSource = path.join(staged.root, 'workspace', 'contaminated-asar-source');
    fs.mkdirSync(asarSource);
    fs.writeFileSync(path.join(asarSource, 'main_conductor.js'), 'fixture main');
    fs.writeFileSync(path.join(asarSource, '.dev.vars'), 'SYNTHETIC_VALUE_DO_NOT_LOG');
    const asar = require('@electron/asar') as { createPackage(src: string, dest: string): Promise<unknown> };
    const contaminated = path.join(staged.root, 'workspace', 'contaminated.asar');
    await asar.createPackage(asarSource, contaminated);
    fs.copyFileSync(contaminated, path.join(staged.root, 'bin', 'resources', 'app.asar'));
    assert.equal(verifyStagedPackageManifest(staged.root, staged.executable), false);
    assert.equal(verifyStagedEmbeddedConfiguration(staged.root), false);
  });
});
