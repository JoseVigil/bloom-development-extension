import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WINDOWS_CORE_PORTS,
  WindowsCoreEvidence,
  makeWindowsCoreEnvironment,
  validateWindowsCoreEvidence,
  withinWindowsRoot,
} from '../../src/runner-core/windows-isolation-preflight';

const root = 'C:\\runner-fixture\\run-1';
const executable = `${root}\\bin\\fixture.exe`;

export function fixtureEvidence(): WindowsCoreEvidence {
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

test('complete synthetic evidence passes; this does not prove native isolation', () => {
  assert.deepEqual(validateWindowsCoreEvidence(fixtureEvidence()), { pass: true, failures: [] });
});

test('missing native evidence fails closed', () => {
  const result = validateWindowsCoreEvidence({});
  assert.equal(result.pass, false);
  assert.ok(result.failures.length >= 10);
});

test('root paths reject siblings, other drives and relative paths', () => {
  assert.equal(withinWindowsRoot(executable, root), true);
  assert.equal(withinWindowsRoot('C:\\runner-fixture\\run-11\\bin\\fixture.exe', root), false);
  assert.equal(withinWindowsRoot('D:\\runner-fixture\\run-1\\fixture.exe', root), false);
  assert.equal(withinWindowsRoot('fixture.exe', root), false);
});

test('a single missing token, ACL, desktop, job or manifest assertion aborts', () => {
  for (const key of [
    'tokenUserVerified', 'restrictedSidsVerified', 'removedPrivilegesVerified',
    'rootAclVerified', 'rootDaclReadback', 'restrictedChildProbePassed', 'desktopAclVerified', 'jobVerified',
    'stagedManifestVerified', 'embeddedConfigScanPassed', 'nativeIsolationDemonstrated',
  ] as const) {
    const result = validateWindowsCoreEvidence({ ...fixtureEvidence(), [key]: false });
    assert.equal(result.pass, false, key);
    assert.ok(result.failures.some((f) => f.code === `${key}_unverified`), key);
  }
});

test('forbidden fixture access and incomplete port inspection abort', () => {
  const evidence = fixtureEvidence();
  evidence.accessProbes![1].read = true;
  assert.ok(validateWindowsCoreEvidence(evidence).failures.some((f) => f.code === 'forbidden_fixture_access_not_denied'));
  const incomplete = fixtureEvidence();
  incomplete.ports = incomplete.ports!.filter((p) => p.port !== 7233);
  assert.ok(validateWindowsCoreEvidence(incomplete).failures.some((f) => f.code === 'port_inspection_incomplete' && f.detail === '7233'));
});

test('foreign process on a required port aborts even when other ports are free', () => {
  const evidence = fixtureEvidence();
  evidence.ports![0].owners.push({ pid: 42, createdAt: '2026-01-01T00:00:00Z', executable: 'C:\\Windows\\foreign.exe', inJob: false });
  assert.ok(validateWindowsCoreEvidence(evidence).failures.some((f) => f.code === 'foreign_or_ambiguous_port_owner'));
});

test('environment is constructed from root only and rejects inherited keys', () => {
  const evidence = fixtureEvidence();
  evidence.childEnvironment!.GITHUB_TOKEN = 'synthetic-only';
  assert.ok(validateWindowsCoreEvidence(evidence).failures.some((f) => f.code === 'environment_keys_invalid'));
});
