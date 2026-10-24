import { test, expect, chromium } from '@playwright/test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolvePackagedWorkspaceSource } from '../../src/surfaces/electron-conductor';
import { createWindowsFunctionalRoot, type FunctionalRoot } from '../../src/runner-core/windows-functional-root';
import { launchFunctionalCore, type FunctionalLaunch } from '../../src/runner-core/windows-functional-launcher';
import { assertProductControlsUnchanged, snapshotProductControls, verifyFunctionalFixture } from '../../src/runner-core/windows-functional-preflight';

test('Core leaves a legacy Genesis pending inert and sends no Mandate POST', async () => {
  test.skip(process.platform !== 'win32', 'Windows Job functional gate');
  test.setTimeout(1_200_000);
  const controlFiles = [
      path.join(os.homedir(), 'AppData', 'Local', 'BloomNucleus', 'config', 'nucleus.json'),
      'C:\\repos\\eias-repos\\.bloom\\.nucleus-eias-repos\\.ownership.json',
      'C:\\repos\\elias-repos\\.bloom\\.nucleus-elias-repos\\.ownership.json',
    ];
  const controlDirectories = [
      'C:\\repos\\elias-repos\\.bloom\\.nucleus-elias-repos',
      'C:\\repos\\eias-repos\\.bloom\\.nucleus-eias-repos\\.mandates',
      'C:\\repos\\elias-repos\\.bloom\\.nucleus-elias-repos\\.mandates',
    ];
  const absentControls = [...controlFiles, ...controlDirectories].filter(item => !fs.existsSync(item));
  const controls = {
    files: controlFiles.filter(item => fs.existsSync(item)),
    directories: controlDirectories.filter(item => fs.existsSync(item)),
  };
  const before = snapshotProductControls(controls);
  let fixture: FunctionalRoot | undefined;
  let launched: FunctionalLaunch | undefined;
  let primaryError: unknown;
  try {
    fixture = createWindowsFunctionalRoot(resolvePackagedWorkspaceSource(), path.resolve(__dirname, '../../../webview/app'));
    verifyFunctionalFixture(fixture);
    // El fixture conserva un pending_genesis_launch y genesis_launch_required del
    // modelo anterior: son residuos inertes que Core no debe consumir.
    const initialOnboarding = JSON.parse(fs.readFileSync(fixture.nucleusJson, 'utf8')).onboarding;
    const mandatesDir = path.join(fixture.workspace, '.bloom', `.nucleus-${fixture.orgSlug}`, '.mandates');
    const mandatesBefore = fs.existsSync(mandatesDir) ? fs.readdirSync(mandatesDir).sort() : null;
    launched = await launchFunctionalCore(fixture);
    const userData = path.join(fixture.root, 'electron-user-data');
    const activePort = path.join(userData, 'DevToolsActivePort');
    await expect.poll(() => fs.existsSync(activePort), { timeout: 90_000 }).toBe(true);
    const port = Number(fs.readFileSync(activePort, 'utf8').split(/\r?\n/)[0]);
    expect(port).toBeGreaterThan(0);
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    try {
      const context = browser.contexts()[0];
      expect(context).toBeTruthy();
      await expect.poll(() => context.pages().map(candidate => candidate.url()), { timeout: 90_000 })
        .toContain('http://127.0.0.1:5173/');
      const page = context.pages().find(candidate => candidate.url() === 'http://127.0.0.1:5173/');
      expect(page).toBeTruthy();
      await expect(page!).toHaveURL('http://127.0.0.1:5173/', { timeout: 60_000 });
      await expect(page!.locator('body')).toBeVisible();
      await expect.poll(() => page!.evaluate(() => typeof (window as any).onboarding?.genesisProjectStatus), { timeout: 30_000 }).toBe('function');
      expect(await page!.evaluate(() => ({
        read: typeof (window as any).onboarding?.readPendingGenesisLaunch,
        ack: typeof (window as any).onboarding?.ackPendingGenesisLaunch,
      }))).toEqual({ read: 'undefined', ack: 'undefined' });
      const apiConfiguration = await page!.evaluate(async () => {
        const api = await (new Function('return import("/src/lib/api.ts")')() as Promise<{API_BASE_URL:string; WS_BASE_URL:string}>);
        return { apiBaseUrl: api.API_BASE_URL, wsBaseUrl: api.WS_BASE_URL };
      });
      expect(apiConfiguration.apiBaseUrl).toBe(`http://127.0.0.1:${launched.httpPort}/api/v1`);
      expect(apiConfiguration.wsBaseUrl).toBe(`ws://127.0.0.1:${launched.wsPort}`);
      const capture = path.join(fixture.root, '.runner-core', 'captured-post.json');
      const attempts = path.join(fixture.root, '.runner-core', 'post-attempts.txt');
      // Apertura y recarga sin gesto: el servicio simulado no debe recibir ningún POST.
      await page!.waitForTimeout(10_000);
      await page!.reload();
      await expect(page!.locator('body')).toBeVisible();
      await page!.waitForTimeout(10_000);
      expect(fs.existsSync(attempts), 'Core no debe enviar POST /api/v1/mandates sin gesto').toBe(false);
      expect(fs.existsSync(capture), 'Core no debe enviar POST /api/v1/mandates sin gesto').toBe(false);
      const state = JSON.parse(fs.readFileSync(fixture.nucleusJson, 'utf8'));
      expect(state.onboarding.pending_genesis_launch, 'el pending del modelo anterior queda intacto').toEqual(initialOnboarding.pending_genesis_launch);
      expect(state.onboarding.genesis_launch_receipts).toBeUndefined();
      expect(fs.existsSync(mandatesDir) ? fs.readdirSync(mandatesDir).sort() : null).toEqual(mandatesBefore);
    } finally {
      await browser.close();
    }
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    if (fixture) {
      const logs = ['service.log','ui.log','workspace.log'].map(name => {
        const file = path.join(fixture!.root, '.runner-core', name);
        if (!fs.existsSync(file)) return `${name}:missing`;
        const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
          .filter(line => !/(?:secret|token|password|credential|api[_-]?key)/i.test(line));
        const critical = lines.filter(line => /FATAL|GPU process|crash|error|\[500\]/i.test(line));
        return `${name}:first=${lines.slice(0, 8).join(' | ').slice(0, 1200)};critical=${critical.slice(-8).join(' | ').slice(-1200)};last=${lines.slice(-12).join(' | ').slice(-1800)}`;
      });
      console.log('functional_diagnostics', logs.join('\n'));
    }
    try { if (launched) await launched.stop(); }
    finally {
      if (fixture) {
        const parent = path.resolve(__dirname, '../..', '.runner-core-temp');
        if (path.dirname(path.resolve(fixture.root)).toLowerCase() !== parent.toLowerCase() ||
            !path.basename(fixture.root).startsWith('rc-') || fs.lstatSync(fixture.root).isSymbolicLink()) {
          throw new Error('functional_cleanup_path_invalid');
        }
        try {
          let cleanupError: unknown;
          for (let attempt = 0; attempt < 30 && fs.existsSync(fixture.root); attempt++) {
            try {
              fs.rmSync(fixture.root, { recursive: true, force: true, maxRetries: 2, retryDelay: 200 });
              cleanupError = undefined;
            } catch (error) {
              cleanupError = error;
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
          if (fs.existsSync(fixture.root)) throw cleanupError ?? new Error('functional_cleanup_incomplete');
        } catch (cleanupError) {
          if (!primaryError) throw cleanupError;
          console.warn('functional_cleanup_failed_after_primary_error', (cleanupError as Error).message);
        }
        if (fs.readdirSync(parent).length === 0) fs.rmdirSync(parent);
      }
      assertProductControlsUnchanged(before, snapshotProductControls(controls));
      for (const item of absentControls) expect(fs.existsSync(item), `el control ausente no debe aparecer: ${item}`).toBe(false);
    }
  }
});
