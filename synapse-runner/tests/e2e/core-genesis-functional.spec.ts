import { test, expect, chromium } from '@playwright/test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolvePackagedWorkspaceSource } from '../../src/surfaces/electron-conductor';
import { createWindowsFunctionalRoot, type FunctionalRoot } from '../../src/runner-core/windows-functional-root';
import { launchFunctionalCore, type FunctionalLaunch } from '../../src/runner-core/windows-functional-launcher';
import { assertProductControlsUnchanged, snapshotProductControls, verifyFunctionalFixture } from '../../src/runner-core/windows-functional-preflight';

test('Core consumes one synthetic Genesis pending and sends exactly one simulated POST', async () => {
  test.skip(process.platform !== 'win32', 'Windows Job functional gate');
  test.setTimeout(1_200_000);
  const controls = {
    files: [
      path.join(os.homedir(), 'AppData', 'Local', 'BloomNucleus', 'config', 'nucleus.json'),
      'C:\\repos\\eias-repos\\.bloom\\.nucleus-eias-repos\\.ownership.json',
    ],
    directories: ['C:\\repos\\eias-repos\\.bloom\\.nucleus-eias-repos\\.mandates'],
  };
  const before = snapshotProductControls(controls);
  let fixture: FunctionalRoot | undefined;
  let launched: FunctionalLaunch | undefined;
  let primaryError: unknown;
  try {
    fixture = createWindowsFunctionalRoot(resolvePackagedWorkspaceSource(), path.resolve(__dirname, '../../../webview/app'));
    verifyFunctionalFixture(fixture);
    fs.writeFileSync(path.join(fixture.root, '.runner-core', 'fail-next-post'), 'controlled');
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
      await expect.poll(() => page!.evaluate(() => typeof (window as any).onboarding?.readPendingGenesisLaunch), { timeout: 30_000 }).toBe('function');
      const apiConfiguration = await page!.evaluate(async () => {
        const api = await (new Function('return import("/src/lib/api.ts")')() as Promise<{API_BASE_URL:string; WS_BASE_URL:string}>);
        return { apiBaseUrl: api.API_BASE_URL, wsBaseUrl: api.WS_BASE_URL };
      });
      expect(apiConfiguration.apiBaseUrl).toBe(`http://127.0.0.1:${launched.httpPort}/api/v1`);
      expect(apiConfiguration.wsBaseUrl).toBe(`ws://127.0.0.1:${launched.wsPort}`);
      const capture = path.join(fixture.root, '.runner-core', 'captured-post.json');
      const attempts = path.join(fixture.root, '.runner-core', 'post-attempts.txt');
      try {
        await expect.poll(() => fs.existsSync(capture), { timeout: 15_000,
          message: `Core consumed pending but mock received no POST; API=${apiConfiguration.apiBaseUrl}` }).toBe(true);
      } catch (firstFailure) {
        const rendererSignals: string[] = [];
        page!.on('console', message => rendererSignals.push(`console:${message.type()}:${message.text()}`));
        page!.on('pageerror', error => rendererSignals.push(`pageerror:${error.message}`));
        page!.on('requestfailed', request => rendererSignals.push(`requestfailed:${request.method()}:${request.url()}:${request.failure()?.errorText}`));
        // El pending debe seguir durable después de cualquier fallo del POST;
        // el test sólo recarga Core, nunca lo reconstruye manualmente.
        await page!.reload();
        await page!.waitForTimeout(5000);
        console.log('functional_renderer_replay_diagnostic', rendererSignals.filter(signal =>
          /genesisLaunch|Creating mandate|POST:|requestfailed|pageerror|Network request failed|API.*Configuration/i.test(signal))
          .map(signal => signal.slice(0, 500)).join('\n'));
        await expect.poll(() => fs.existsSync(capture), { timeout: 15_000,
          message: `Core did not replay the durable pending after the controlled POST failure; API=${apiConfiguration.apiBaseUrl}` }).toBe(true);
      }
      const payload = JSON.parse(fs.readFileSync(capture, 'utf8'));
      expect(payload).toEqual({
        mandateLaunchId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
        mandateType: 'genesis', projectId: fixture.projectId, project: 'core-genesis-fixture',
        name: 'core-genesis-fixture', source: fixture.projectPath,
      });
      const state = JSON.parse(fs.readFileSync(fixture.nucleusJson, 'utf8'));
      expect(state.onboarding.pending_genesis_launch).toBeUndefined();
      const receipt = state.onboarding.genesis_launch_receipts[payload.mandateLaunchId];
      expect(receipt.mandateId).toBeTruthy();
      expect(receipt.projectId).toBe(fixture.projectId);
      expect(receipt.authority).toBe(false);
      const ackReplay = await page!.evaluate(async ({ mandateLaunchId, mandateId }) =>
        (window as any).onboarding.ackPendingGenesisLaunch({ mandateLaunchId, mandateId }),
        { mandateLaunchId: payload.mandateLaunchId, mandateId: receipt.mandateId });
      expect(ackReplay).toEqual({ success: true, alreadyAcknowledged: true });
      await page!.reload();
      await expect(page!.locator('body')).toBeVisible();
      await page!.waitForTimeout(1000);
      expect(fs.readFileSync(attempts, 'utf8').trim()).toBe('2');
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
    }
  }
});
