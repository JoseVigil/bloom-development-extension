import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';

const SRC_ROOT = path.resolve(__dirname, '..', '..', 'src');
const CORE_DIR = path.join(SRC_ROOT, 'runner-core');
const FILES = ['isolation-preflight.ts', 'isolated-root-assembler.ts', 'isolated-launcher.ts', 'run-teardown.ts'];
const FORBIDDEN_DIRS = ['config', 'surfaces', 'preflight'].map((d) => path.join(SRC_ROOT, d));

function source(file: string): string {
  return fs.readFileSync(path.join(CORE_DIR, file), 'utf8');
}

function specifiers(src: string): string[] {
  const out: string[] = [];
  const patterns = [/\bfrom\s+['"]([^'"]+)['"]/g, /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g, /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g, /^\s*import\s+['"]([^'"]+)['"]/gm];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) out.push(m[1]);
  }
  return out;
}

test('runner-core contains exactly the four approved modules', () => {
  assert.deepEqual(fs.readdirSync(CORE_DIR).sort(), [...FILES].sort());
});

test('runner-core never imports src/config, src/surfaces or src/preflight (no .env loading)', () => {
  for (const file of FILES) {
    for (const spec of specifiers(source(file))) {
      if (spec.startsWith('.')) {
        const resolved = path.resolve(CORE_DIR, spec);
        for (const dir of FORBIDDEN_DIRS) {
          assert.ok(!(resolved === dir || resolved.startsWith(dir + path.sep)), `${file} imports ${spec}`);
        }
        assert.ok(resolved.startsWith(CORE_DIR + path.sep), `${file} imports outside runner-core: ${spec}`);
      } else {
        assert.ok(!/^@src\//.test(spec), `${file} uses path alias ${spec}`);
        assert.ok(!/dotenv/.test(spec), `${file} imports ${spec}`);
      }
    }
  }
});

test('only the preflight module reads the harness environment', () => {
  for (const file of FILES) {
    const uses = /process\s*\.\s*env\b|process\s*\[\s*['"]env['"]\s*\]/.test(source(file));
    assert.equal(uses, file === 'isolation-preflight.ts', file);
  }
});

test('no references to the user service manager or the Bloom installer flow', () => {
  for (const file of FILES) {
    const src = source(file);
    assert.ok(!/systemctl/i.test(src), `${file} mentions systemctl`);
    assert.ok(!/\bsetup\b/i.test(src), `${file} mentions setup`);
  }
});

test('third-party imports are limited to node built-ins and a lazy Playwright import in the launcher', () => {
  const builtins = new Set(['fs', 'os', 'path', 'crypto', 'child_process', 'stream', 'events', 'net']);
  for (const file of FILES) {
    for (const spec of specifiers(source(file))) {
      if (spec.startsWith('.')) continue;
      if (builtins.has(spec.replace(/^node:/, ''))) continue;
      assert.equal(file, 'isolated-launcher.ts', `${file} imports ${spec}`);
      assert.equal(spec, '@playwright/test');
    }
  }
  assert.ok(/await import\('@playwright\/test'\)/.test(source('isolated-launcher.ts')));
  assert.ok(!/^import .*@playwright\/test/m.test(source('isolated-launcher.ts')));
});
