/** Opt-in native fixture check. It never reads productive paths or launches Workspace. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { spawnSync } from 'node:child_process';

const enabled = process.platform === 'win32' && process.env.RUNNER_CORE_NATIVE_FIXTURE === '1';

function nativeFixture(): { root: string; run_id: string; dacl_readback: boolean; root_acl_verified: boolean; access_probes: Record<string, boolean>; code: string } {
  const helperDir = path.resolve(__dirname, '..', '..', 'native', 'windows-core-isolation');
  const result = spawnSync('go', ['run', '.', 'prepare-root'], {
    cwd: helperDir, encoding: 'utf8', windowsHide: true, timeout: 30_000,
  });
  assert.ok(result.stdout.trim(), 'native helper must return JSON even on failure');
  const evidence = JSON.parse(result.stdout) as ReturnType<typeof nativeFixture>;
  assert.equal(result.status, 0, `native fixture blocked: ${evidence.code ?? 'unknown'}`);
  return evidence;
}

function cleanupFixture(evidence: { root: string; run_id: string }): void {
  const parent = path.resolve(os.tmpdir(), 'bloom-runner-core');
  const root = path.resolve(evidence.root);
  const forbidden = path.resolve(parent, `forbidden-${evidence.run_id}`);
  if (path.dirname(root).toLowerCase() !== parent.toLowerCase() ||
      !path.basename(root).startsWith('rc-') ||
      path.dirname(forbidden).toLowerCase() !== parent.toLowerCase() ||
      !/^forbidden-[a-f0-9-]{36}$/.test(path.basename(forbidden))) throw new Error('unsafe_fixture_cleanup');
  for (const target of [root, forbidden]) {
    if (fs.existsSync(target)) {
      if (fs.lstatSync(target).isSymbolicLink()) throw new Error('fixture_reparse_cleanup_refused');
      fs.rmSync(target, { recursive: true, force: true });
    }
  }
}

test('native R DACL and restricted child access probes pass on disposable fixtures', { skip: !enabled }, () => {
  const evidence = nativeFixture();
  try {
  assert.equal(evidence.dacl_readback, true);
  assert.equal(evidence.root_acl_verified, true);
  for (const key of [
    'root_read', 'root_write', 'forbidden_read_denied', 'forbidden_write_denied',
    'forbidden_delete_denied', 'forbidden_write_dac_denied', 'forbidden_write_owner_denied',
  ]) assert.equal(evidence.access_probes?.[key], true, key);
  } finally { cleanupFixture(evidence); }
});

test('isolated desktop and Job contain child and grandchild through teardown', { skip: !enabled }, () => {
  const evidence = nativeFixture();
  try {
    const helperDir = path.resolve(__dirname, '..', '..', 'native', 'windows-core-isolation');
    const result = spawnSync('go', ['run', '.', 'desktop-job-fixture', evidence.root], {
      cwd: helperDir, encoding: 'utf8', windowsHide: true, timeout: 30_000,
    });
    assert.ok(result.stdout.trim(), 'desktop/Job fixture must return JSON');
    const proof = JSON.parse(result.stdout) as {
      root?: string; run_id?: string; desktop_acl_verified?: boolean; job_verified?: boolean;
      child_pid?: number; child_created_at?: string; grandchild_pid?: number; grandchild_created_at?: string; code?: string;
    };
    assert.equal(proof.root, evidence.root);
    assert.equal(proof.run_id, evidence.run_id);
    assert.equal(proof.desktop_acl_verified, true, `desktop ACL: ${proof.code}`);
    assert.equal(result.status, 0, `Job fixture blocked: ${proof.code}`);
    assert.equal(proof.job_verified, true);
    assert.ok(proof.child_pid && proof.child_created_at && proof.grandchild_pid && proof.grandchild_created_at);
  } finally { cleanupFixture(evidence); }
});
