import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { validateArtifact } from './build_batcave.mjs';

async function fixture() {
  const root = await import('node:fs/promises').then(fs => fs.mkdtemp(path.join(os.tmpdir(), 'batcave-artifact-')));
  const body = 'console.log("ok")\n';
  await writeFile(path.join(root, 'main.js'), body);
  await writeFile(path.join(root, 'main.js.map'), '{}');
  const file = async name => {
    const data = await readFile(path.join(root, name));
    return { sha256: createHash('sha256').update(data).digest('hex'), size: data.length };
  };
  await writeFile(path.join(root, 'artifact-manifest.json'), JSON.stringify({
    schema_version: 1, component: 'batcave', version: '1.0.0', build: 1,
    node_target: 'node24', module_format: 'esm', primary_entrypoint: 'main',
    entrypoints: { main: 'main.js' }, files: { 'main.js': await file('main.js'), 'main.js.map': await file('main.js.map') },
  }));
  return root;
}

test('validates a complete self-contained artifact', async () => {
  const root = await fixture();
  try { assert.equal((await validateArtifact(root)).build, 1); }
  finally { await rm(root, { recursive: true }); }
});

test('rejects hash mismatch and undeclared files', async t => {
  await t.test('hash mismatch', async () => {
    const root = await fixture();
    try { await writeFile(path.join(root, 'main.js'), 'changed'); await assert.rejects(validateArtifact(root), /integrity mismatch/); }
    finally { await rm(root, { recursive: true }); }
  });
  await t.test('undeclared file', async () => {
    const root = await fixture();
    try { await writeFile(path.join(root, 'secret.txt'), 'x'); await assert.rejects(validateArtifact(root), /undeclared/); }
    finally { await rm(root, { recursive: true }); }
  });
});
