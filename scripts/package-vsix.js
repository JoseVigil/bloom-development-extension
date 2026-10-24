#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const staging = path.join(root, '.tmp', 'vsix-staging');
const destination = path.join(root, 'installer', 'vscode', 'bloom-extension.vsix');
const temporaryDestination = path.join(root, '.tmp', 'bloom-extension.next.vsix');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const vsce = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'vsce.cmd' : 'vsce');

function run(command, args, cwd = root, capture = false) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }
  return result.stdout || '';
}

function copy(relative, options = {}) {
  const source = path.join(root, relative);
  const target = path.join(staging, relative);
  if (!fs.existsSync(source)) throw new Error(`required VSIX input is missing: ${relative}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true, ...options });
}

function runtimeDependencyFilter(source) {
  const relative = path.relative(root, source);
  const parts = relative.split(path.sep).map((part) => part.toLowerCase());
  const excludedDirectories = new Set([
    'test', 'tests', '.github', 'benchmark', 'benchmarks', 'example', 'examples',
  ]);
  if (parts.some((part) => excludedDirectories.has(part))) return false;
  return !source.endsWith('.map') && !source.endsWith('.ts');
}

function main() {
  console.log('[vsix] Running extension prepublish...');
  run(npm, ['run', 'vscode:prepublish']);

  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });

  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (manifest.scripts) delete manifest.scripts['vscode:prepublish'];
  manifest.files = [
    'out/**',
    'resources/**',
    'installer/native/bin/bootstrap/bundle.js',
    'node_modules/**',
  ];
  fs.writeFileSync(path.join(staging, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  copy('README.md');
  copy('out');
  copy('resources');
  copy(path.join('installer', 'native', 'bin', 'bootstrap', 'bundle.js'));

  console.log('[vsix] Resolving production dependency closure...');
  const dependencyOutput = run(
    npm,
    ['ls', '--omit=dev', '--all', '--parseable', '--silent'],
    root,
    true,
  );
  const dependencyPaths = [...new Set(dependencyOutput.split(/\r?\n/).filter(Boolean))]
    .filter((entry) => entry.startsWith(path.join(root, 'node_modules') + path.sep));
  for (const source of dependencyPaths) {
    const relative = path.relative(root, source);
    const target = path.join(staging, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(source, target, {
      recursive: true,
      dereference: true,
      filter: runtimeDependencyFilter,
    });
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.rmSync(temporaryDestination, { force: true });
  console.log(`[vsix] Packaging ${dependencyPaths.length} production dependency directories...`);
  try {
    run(vsce, ['package', '--out', temporaryDestination], staging);
    fs.copyFileSync(temporaryDestination, destination);
  } finally {
    fs.rmSync(temporaryDestination, { force: true });
    fs.rmSync(staging, { recursive: true, force: true });
  }
  const sizeMiB = (fs.statSync(destination).size / 1024 / 1024).toFixed(1);
  console.log(`[vsix] Created ${destination} (${sizeMiB} MiB)`);
}

try {
  main();
} catch (error) {
  console.error(`[vsix] ${error.message}`);
  process.exit(1);
}
