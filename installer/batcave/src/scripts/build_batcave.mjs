import { build } from 'esbuild';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const componentRoot = path.resolve(packageRoot, '..');
const repoRoot = path.resolve(componentRoot, '..', '..');
const nativeRoot = path.join(repoRoot, 'installer', 'native');
const destination = path.join(nativeRoot, 'batcave');
const versionPath = path.join(componentRoot, 'scripts', 'VERSION');
const counterPath = path.join(componentRoot, 'scripts', 'build_number.txt');
const entryPoints = Object.freeze({ main: path.join(packageRoot, 'main.ts') });
const nodeBuiltins = new Set(builtinModules.flatMap(name => [name, `node:${name}`]));

async function readInteger(file, fallback = 0) {
  try {
    const value = Number.parseInt((await readFile(file, 'utf8')).trim(), 10);
    return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function readPublishedBuild() {
  try {
    const manifest = JSON.parse(await readFile(path.join(destination, 'artifact-manifest.json'), 'utf8'));
    return Number.isSafeInteger(manifest.build) && manifest.build >= 0 ? manifest.build : 0;
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return 0;
    throw error;
  }
}

async function atomicWrite(file, value) {
  const temporary = `${file}.tmp-${process.pid}-${randomBytes(6).toString('hex')}`;
  const handle = await open(temporary, 'wx');
  try {
    await handle.writeFile(value, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, file);
}

async function sha256(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

async function validateArtifact(root) {
  const manifestPath = path.join(root, 'artifact-manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.schema_version !== 1 || manifest.component !== 'batcave') throw new Error('invalid Batcave manifest identity');
  if (!Number.isSafeInteger(manifest.build) || manifest.build < 1) throw new Error('invalid Batcave build number');
  if (!/^node\d+$/.test(manifest.node_target)) throw new Error('invalid node_target');
  const primary = manifest.entrypoints?.[manifest.primary_entrypoint];
  if (!primary || !manifest.files?.[primary]) throw new Error('primary entrypoint is missing from manifest');
  const declared = new Set(['artifact-manifest.json', ...Object.keys(manifest.files)]);
  for (const relative of Object.keys(manifest.files)) {
    if (path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) throw new Error(`unsafe artifact path: ${relative}`);
    const file = path.join(root, relative);
    const info = await stat(file);
    if (!info.isFile()) throw new Error(`artifact entry is not a file: ${relative}`);
    if (info.size !== manifest.files[relative].size || await sha256(file) !== manifest.files[relative].sha256) {
      throw new Error(`artifact integrity mismatch: ${relative}`);
    }
  }
  for (const entry of await readdir(root)) {
    if (!declared.has(entry)) throw new Error(`undeclared artifact file: ${entry}`);
  }
  return manifest;
}

function safeBuildPath(candidate, prefix, id) {
  return path.dirname(candidate) === nativeRoot && path.basename(candidate) === `${prefix}${id}`;
}

async function recoverInterruptedBuilds() {
  await mkdir(nativeRoot, { recursive: true });
  const receipts = (await readdir(nativeRoot)).filter(name => /^\.batcave-build-[a-f0-9-]+\.receipt\.json$/.test(name));
  for (const name of receipts) {
    const receiptPath = path.join(nativeRoot, name);
    let receipt;
    try { receipt = JSON.parse(await readFile(receiptPath, 'utf8')); }
    catch { throw new Error(`invalid abandoned Batcave build receipt: ${receiptPath}`); }
    const { id, stage, backup } = receipt;
    if (receipt.schema_version !== 1 || receipt.component !== 'batcave' || !safeBuildPath(stage, '.batcave-build-', id) || !safeBuildPath(backup, '.batcave-backup-', id)) {
      throw new Error(`unsafe abandoned Batcave build receipt: ${receiptPath}`);
    }
    let destinationExists = true;
    try { await stat(destination); } catch (error) { if (error.code === 'ENOENT') destinationExists = false; else throw error; }
    let backupExists = true;
    try { await stat(backup); } catch (error) { if (error.code === 'ENOENT') backupExists = false; else throw error; }
    if (!destinationExists && backupExists) await rename(backup, destination);
    else if (destinationExists && backupExists) await rm(backup, { recursive: true });
    await rm(stage, { recursive: true, force: true });
    await rm(receiptPath, { force: true });
  }
}

async function main() {
  await recoverInterruptedBuilds();
  const counter = await readInteger(counterPath);
  const published = await readPublishedBuild();
  const buildNumber = Math.max(counter, published) + 1;

  // Reserving first guarantees that an interrupted build number is never reused.
  // Failed builds may therefore leave intentional gaps.
  await atomicWrite(counterPath, String(buildNumber));

  const id = `${process.pid}-${randomBytes(8).toString('hex')}`;
  const stage = path.join(nativeRoot, `.batcave-build-${id}`);
  const backup = path.join(nativeRoot, `.batcave-backup-${id}`);
  const receiptPath = path.join(nativeRoot, `.batcave-build-${id}.receipt.json`);
  await mkdir(stage);
  await writeFile(receiptPath, `${JSON.stringify({ schema_version: 1, component: 'batcave', id, stage, backup }, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });

  let destinationMoved = false;
  let stagePublished = false;
  try {
    const result = await build({
      absWorkingDir: packageRoot,
      entryPoints,
      outdir: stage,
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node24',
      sourcemap: 'external',
      metafile: true,
      packages: 'bundle',
      logLevel: 'info',
    });
    const external = Object.values(result.metafile.outputs).flatMap(output => output.imports).filter(item => item.external && !nodeBuiltins.has(item.path));
    if (external.length) throw new Error(`unbundled external dependencies: ${external.map(item => item.path).join(', ')}`);
    if (Object.keys(result.metafile.inputs).some(input => input.endsWith('.node'))) throw new Error('native Node modules are not supported in the Batcave artifact');

    const files = {};
    const entrypointMap = {};
    for (const name of Object.keys(entryPoints)) {
      const js = `${name}.js`;
      const map = `${js}.map`;
      entrypointMap[name] = js;
      for (const relative of [js, map]) {
        const file = path.join(stage, relative);
        const info = await stat(file);
        files[relative] = { sha256: await sha256(file), size: info.size };
      }
    }
    const version = (await readFile(versionPath, 'utf8')).trim();
    const manifest = {
      schema_version: 1, component: 'batcave', version, build: buildNumber,
      node_target: 'node24', module_format: 'esm', primary_entrypoint: 'main',
      entrypoints: entrypointMap, files,
    };
    await writeFile(path.join(stage, 'artifact-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    await validateArtifact(stage);

    try {
      await rename(destination, backup);
      destinationMoved = true;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await rename(stage, destination);
    stagePublished = true;
    await validateArtifact(destination);
    if (destinationMoved) {
      try { await rm(backup, { recursive: true }); }
      catch (error) { console.warn(`Batcave artifact published, but backup cleanup is pending: ${backup}: ${error.message}`); }
    }
    console.log(`Batcave artifact ${version}+${buildNumber} published to ${destination}`);
  } catch (error) {
    if (stagePublished) await rm(destination, { recursive: true, force: true }).catch(() => {});
    if (destinationMoved) await rename(backup, destination).catch(restoreError => {
      throw new AggregateError([error, restoreError], `Batcave build failed and previous artifact could not be restored from ${backup}`);
    });
    throw error;
  } finally {
    await rm(stage, { recursive: true, force: true }).catch(() => {});
    const backupStillExists = await stat(backup).then(() => true, () => false);
    if (!backupStillExists) await rm(receiptPath, { force: true }).catch(() => {});
  }
}

export { atomicWrite, readInteger, recoverInterruptedBuilds, validateArtifact };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
