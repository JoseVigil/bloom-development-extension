import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createWindowsFunctionalRoot } from '../../src/runner-core/windows-functional-root';
import { verifyFunctionalFixture } from '../../src/runner-core/windows-functional-preflight';

test('functional fixture stages only synthetic state and binds pending to one new project', { skip: process.platform !== 'win32' }, async () => {
  const source = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-core-functional-source-'));
  let root: string | undefined;
  try {
    const pkg = path.join(source, 'package');
    const asarSource = path.join(source, 'asar-source');
    const webview = path.join(source, 'webview', 'app');
    const contracts = path.join(source, 'contracts');
    const orrery = path.join(source, 'installer', 'conductor', 'workspace', 'core', 'orrery', 'src');
    const playcanvas = path.join(source, 'installer', 'conductor', 'workspace', 'core', 'orrery', 'node_modules', 'playcanvas');
    fs.mkdirSync(path.join(pkg, 'resources'), { recursive: true });
    fs.mkdirSync(asarSource);
    fs.writeFileSync(path.join(pkg, 'bloom-workspace.exe'), 'fixture');
    fs.writeFileSync(path.join(asarSource, 'main_conductor.js'), 'fixture');
    fs.writeFileSync(path.join(asarSource, 'package.json'), '{}');
    const asar = require('@electron/asar') as { createPackage(src: string, dest: string): Promise<unknown> };
    await asar.createPackage(asarSource, path.join(pkg, 'resources', 'app.asar'));
    for (const dir of ['src', 'node_modules', '.svelte-kit']) fs.mkdirSync(path.join(webview, dir), { recursive: true });
    fs.mkdirSync(contracts, { recursive: true });
    fs.mkdirSync(orrery, { recursive: true });
    fs.mkdirSync(playcanvas, { recursive: true });
    fs.writeFileSync(path.join(contracts, 'fixture.ts'), 'export type Fixture = true');
    fs.writeFileSync(path.join(orrery, 'fixture.ts'), 'export const fixture = true');
    fs.writeFileSync(path.join(playcanvas, 'package.json'), '{"name":"playcanvas"}');
    fs.writeFileSync(path.join(webview, 'src', 'fixture.ts'), 'export const fixture = true');
    fs.writeFileSync(path.join(webview, 'node_modules', 'fixture.js'), 'module.exports = true');
    for (const name of ['package.json','package-lock.json','svelte.config.js','vite.config.ts','tsconfig.json']) {
      fs.writeFileSync(path.join(webview, name), name.endsWith('.json') ? '{}' :
        name === 'vite.config.ts' ? 'export default {\n  plugins: [sveltekit()],\n};' : '// fixture');
    }
    const staged = createWindowsFunctionalRoot(path.join(pkg, 'bloom-workspace.exe'), webview);
    root = staged.root;
    verifyFunctionalFixture(staged);
    const data = JSON.parse(fs.readFileSync(staged.nucleusJson, 'utf8'));
    assert.equal(data.onboarding.pending_genesis_launch.projectId, staged.projectId);
    assert.equal(data.onboarding.organizations[0].projects[0].genesis_launch_required, true);
    assert.equal(data.onboarding.organizations[0].organization_id, staged.organizationId);
    assert.equal(data.onboarding.organizations[0].tenant_id, staged.tenantId);
    assert.match(fs.readFileSync(path.join(staged.webviewDir, 'vite.config.ts'), 'utf8'), /optimizeDeps: \{ include: \['playcanvas'\] \}/);
    assert.ok(staged.root.startsWith(path.resolve(__dirname, '../..', '.runner-core-temp') + path.sep));
  } finally {
    if (root) {
      const parent = path.resolve(__dirname, '../..', '.runner-core-temp');
      if (path.dirname(path.resolve(root)).toLowerCase() !== parent.toLowerCase() || !path.basename(root).startsWith('rc-') ||
          fs.lstatSync(root).isSymbolicLink()) throw new Error('unsafe_fixture_cleanup');
      fs.rmSync(root, { recursive: true, force: true });
      if (fs.readdirSync(parent).length === 0) fs.rmdirSync(parent);
    }
    if (!source.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(source).startsWith('runner-core-functional-source-')) throw new Error('unsafe_source_cleanup');
    fs.rmSync(source, { recursive: true, force: true });
  }
});
