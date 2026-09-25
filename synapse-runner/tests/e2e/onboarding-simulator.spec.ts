import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '../fixtures/synapse-runner-fixture';
import { beginPhase0FixtureRegistration, finishPhase0FixtureRegistration } from '../../src/surfaces/phase0-generic-browser';
import { env } from '../../src/config/env';
import {
  launchConductor, installMilestoneBuffer, waitForDiscoveryCdpEndpoint, waitForMilestone,
  type ConductorHandle,
} from '../../src/surfaces/electron-conductor';
import { connectToDiscovery, type DiscoverySurface } from '../../src/surfaces/discovery-chromium';
import { findSynapseSimulator, selectDiscoveryMessage, sendDiscoveryMessage, waitForSimulatorTargets } from '../../src/surfaces/synapse-simulator';
import { getBloomPaths, resetOnboardingState } from '../../src/config/bloom-paths';

const DISCOVERY_URL = /chrome-extension:\/\/[^/]+\/discovery\/index\.html/;
const SIMULATOR_URL = /chrome-extension:\/\/[^/]+\/synapse-simulator\/index\.html/;
const WORKSPACE_PATH = 'C:\\repos\\eias-repos';
const WORKSPACE_BASE = 'C:\\repos';
const PROJECT_SOURCE = 'C:\\TEMP\\TMP\\sample_project';
const PROJECT_PATH = 'C:\\repos\\eias-repos\\sample_project';
const PROJECT_FILES = ['.gitignore', 'main.py', 'README.md', 'storage.py', 'tasks.py', 'test_tasks.py'];

test('onboarding simulado mediante la UI de Synapse Simulator', async ({ synapseRunner }) => {
  test.setTimeout(900_000);
  const resumeCurrent = process.env.SYNAPSE_RESUME_CURRENT === '1';
  let conductor: ConductorHandle | undefined;
  let discovery: DiscoverySurface | undefined;
  try {
    if (resumeCurrent) {
      await synapseRunner.runStep('resume_state', undefined, async () => {
        const data = JSON.parse(readFileSync(getBloomPaths().nucleusJson, 'utf-8')) as {
          onboarding?: { completed?: boolean; current_step?: string; completed_steps?: string[];
            organizations?: Array<{ org_slug: string; workspace_path: string }> };
        };
        expect(data.onboarding?.completed).not.toBe(true);
        expect(data.onboarding?.current_step).toBe('google_auth');
        for (const step of ['backend_identity_check', 'nucleus_create', 'github_app_auth', 'vault_init']) {
          expect(data.onboarding?.completed_steps).toContain(step);
        }
        expect(data.onboarding?.organizations?.find(org => org.org_slug === 'eias-repos')?.workspace_path).toBe(WORKSPACE_PATH);
        expect(existsSync(join(WORKSPACE_PATH, '.bloom', '.nucleus-eias-repos'))).toBe(true);
        expect(existsSync(PROJECT_PATH)).toBe(false);
        console.log(`[synapse-simulator] Reanudando estado real en google_auth; Nucleus=${WORKSPACE_PATH}`);
      });
      conductor = await launchConductor();
      await installMilestoneBuffer(conductor.mainWindow);
      await conductor.mainWindow.locator('#screen-identity.active').waitFor({ state: 'visible' });
    } else {
      const flow = await synapseRunner.runStep('00a', undefined, () =>
        beginPhase0FixtureRegistration(env.backendOrigin));
      const registration = await synapseRunner.runStep('00b', undefined, () =>
        finishPhase0FixtureRegistration(env.backendOrigin, flow, randomUUID()));
      expect(registration.created).toBe(true);
      resetOnboardingState();
      conductor = await launchConductor({ browser: flow.browser, backendOrigin: env.backendOrigin });
      await installMilestoneBuffer(conductor.mainWindow);

      await synapseRunner.runStep('backend_identity_check', undefined, async () => {
      await conductor!.mainWindow.click('#screen-entry .btn-primary');
      const milestone = await waitForMilestone(conductor!.mainWindow, 'backend_identity_check') as {
        jsonValue(): Promise<unknown>;
      };
      const observed = (await milestone.jsonValue()) as { payload?: { orgId?: string; branch?: string } };
      expect(observed.payload).toMatchObject({ orgId: registration.organizationId, branch: 'master_new_org' });
      await conductor!.mainWindow.click('#btn-continue-backend-identity');
      });

      await synapseRunner.runStep('workspace', undefined, async () => {
      expect(existsSync(WORKSPACE_PATH), 'el destino de Nucleus debe estar ausente antes de crear').toBe(false);
      await conductor!.mainWindow.fill('#ws-path-input', WORKSPACE_BASE);
      await conductor!.mainWindow.fill('#ws-org-input', 'eias-repos');
      await conductor!.mainWindow.click('#btn-continue-workspace');
      await conductor!.mainWindow.locator('#screen-identity.active').waitFor({ state: 'visible' });
      expect(existsSync(join(WORKSPACE_PATH, '.bloom', '.nucleus-eias-repos'))).toBe(true);
      const nucleus = JSON.parse(readFileSync(getBloomPaths().nucleusJson, 'utf-8')) as {
        onboarding?: { active_org_slug?: string; organizations?: Array<{ org_slug: string; workspace_path: string }> };
      };
      expect(nucleus.onboarding?.active_org_slug).toBe('eias-repos');
      expect(nucleus.onboarding?.organizations?.find(org => org.org_slug === 'eias-repos')?.workspace_path).toBe(WORKSPACE_PATH);
      console.log(`[synapse-simulator] Workspace creado: ${WORKSPACE_PATH}`);
      });
    }

    const pages = await synapseRunner.runStep('profile_and_simulator', undefined, async () => {
      const launchStartedAt = Date.now();
      let resumeEndpoint: string | undefined;
      if (!resumeCurrent) {
        await conductor!.mainWindow.click('#btn-continue-identity');
        const launchUi = await conductor!.mainWindow.waitForFunction(() => {
          const poll = document.getElementById('identity-poll-status');
          if (poll && getComputedStyle(poll).display !== 'none') return 'success';
          const button = document.getElementById('btn-continue-identity') as HTMLButtonElement | null;
          if (button && !button.disabled && button.textContent?.trim() === 'Validate') return 'failed';
          return false;
        }, undefined, { timeout: 60_000 });
        if (await launchUi.jsonValue() !== 'success') {
          throw new Error('[onboarding-simulator] Conductor informó fallo de onboarding:launch-discovery');
        }
      } else {
        const master = JSON.parse(readFileSync(getBloomPaths().nucleusJson, 'utf-8')) as { master_profile?: string };
        const portFile = join(getBloomPaths().profilesDir, String(master.master_profile), 'DevToolsActivePort');
        const port = Number.parseInt(readFileSync(portFile, 'utf-8').split(/\r?\n/, 1)[0], 10);
        expect(port).toBeGreaterThan(0);
        resumeEndpoint = `http://127.0.0.1:${port}`;
        const response = await fetch(`${resumeEndpoint}/json/version`, { signal: AbortSignal.timeout(5_000) });
        expect(response.ok).toBe(true);
        console.log('[synapse-simulator] Resume: conectando al perfil abierto sin repetir onboarding:launch-discovery');
      }
      const endpoint = resumeEndpoint ?? await waitForDiscoveryCdpEndpoint(launchStartedAt);
      await waitForSimulatorTargets(endpoint);
      discovery = await connectToDiscovery(endpoint, DISCOVERY_URL);
      const firstSimulator = await findSynapseSimulator(discovery.browser);
      const nucleus = JSON.parse(readFileSync(getBloomPaths().nucleusJson, 'utf-8')) as { master_profile?: string };
      const recordedLaunch = resumeCurrent ? undefined :
        (JSON.parse(readFileSync(getBloomPaths().profilesJson, 'utf-8')) as {
          profiles?: Array<{ id: string; last_launch_id?: string }>;
        }).profiles?.find(profile => profile.id === nucleus.master_profile)?.last_launch_id;
      const configFile = join(getBloomPaths().profilesDir, String(nucleus.master_profile), 'extension', 'discovery.synapse.config.js');
      const extensionLaunch = readFileSync(configFile, 'utf-8').match(/"launchId":\s*"([^"]+)"/)?.[1];
      const expectedLaunch = resumeCurrent ? extensionLaunch : recordedLaunch;
      expect(expectedLaunch, 'profiles.json debe registrar el lanzamiento nuevo').toBeTruthy();
      if (resumeCurrent) {
        console.log(`[synapse-simulator] Resume: profiles.json=${recordedLaunch}, config de extensión=${extensionLaunch}`);
        const simulatorIdentity = await firstSimulator.evaluate(() =>
          (window as unknown as { SYNAPSE_CONFIG?: { launchId?: string } }).SYNAPSE_CONFIG?.launchId);
        if (simulatorIdentity !== expectedLaunch) {
          console.log(`[synapse-simulator] Recargando pestaña Simulator propia: ${simulatorIdentity} → ${expectedLaunch}`);
          await firstSimulator.reload({ waitUntil: 'domcontentloaded' });
          await firstSimulator.locator('#protocol-list .message-item[data-protocol="discovery"]').first().waitFor();
        }
      }
      const context = discovery.browser.contexts()[0];
      const inventory = async () => Promise.all(context.pages().map(async page => ({
        page,
        url: page.url(),
        identity: await Promise.race([page.evaluate(() => {
          const config = (window as unknown as { SYNAPSE_CONFIG?: { profileId?: string; launchId?: string } }).SYNAPSE_CONFIG;
          return { profileId: config?.profileId || null, launchId: config?.launchId || null };
        }).catch(() => ({ profileId: null, launchId: null })),
        new Promise<{ profileId: null; launchId: null }>(resolve => setTimeout(() => resolve({ profileId: null, launchId: null }), 4_000))]),
      })));
      const before = await inventory();
      const tabList = await firstSimulator.evaluate(async () =>
        (await chrome.tabs.query({})).map(tab => ({ id: tab.id, url: tab.url, openerTabId: tab.openerTabId })));
      console.log(`[synapse-simulator] Tabs antes de limpieza: ${JSON.stringify(tabList)}`);
      const own = before.filter(tab => tab.identity.profileId === nucleus.master_profile);
      const currentSimulator = own.find(tab => /\/synapse-simulator\/index\.html/.test(tab.url) && tab.identity.launchId === expectedLaunch);
      const currentDiscovery = own.find(tab => DISCOVERY_URL.test(tab.url) && tab.identity.launchId === expectedLaunch);
      if (!currentSimulator || !currentDiscovery) {
        throw new Error(`[synapse-simulator] No hay par Simulator/Discovery del launch ${expectedLaunch}; inventario=${JSON.stringify(before.map(({ url, identity }) => ({ url, identity })))}`);
      }
      const stale = own.filter(tab =>
        (SIMULATOR_URL.test(tab.url) && tab.page !== currentSimulator.page)
        || (DISCOVERY_URL.test(tab.url) && tab.page !== currentDiscovery.page));
      for (const tab of stale) {
        console.log(`[synapse-simulator] Cerrando duplicado propio: URL=${tab.url}, launch_id=${tab.identity.launchId}`);
        await tab.page.close();
      }
      const after = await currentSimulator.page.evaluate(async () =>
        (await chrome.tabs.query({})).map(tab => ({ id: tab.id, url: tab.url, openerTabId: tab.openerTabId })));
      console.log(`[synapse-simulator] Tabs después de limpieza: ${JSON.stringify(after)}`);
      const simulator = currentSimulator.page;
      const identityPreview = await selectDiscoveryMessage(simulator, 'github_app_authorized');
      expect(identityPreview.profile_id).toBe(nucleus.master_profile);
      expect(identityPreview.launch_id).toBe(expectedLaunch);
      expect(String(identityPreview.launch_id)).not.toMatch(/^(?:undefined|null|\(not available\)|)$/);
      console.log(`[synapse-simulator] pestaña viva y autos resueltos: profile_id=${identityPreview.profile_id}, launch_id=${identityPreview.launch_id}`);
      return { simulator, discoveryPage: currentDiscovery.page };
    });

    if (!resumeCurrent) {
      await synapseRunner.runStep('sim_vault_navigation', undefined, async () => {
      await sendDiscoveryMessage(pages.simulator, 'onboarding_navigate', { step: 'vault_init' });
      await pages.discoveryPage.locator('#screen-vault-created.active').waitFor({ state: 'visible' });
      });
      await synapseRunner.runStep('sim_github', undefined, async () => {
      await sendDiscoveryMessage(pages.simulator, 'onboarding_navigate', { step: 'github_app_auth' });
      await pages.discoveryPage.locator('#screen-github-app-start.active').waitFor({ state: 'visible' });
      const code = await sendDiscoveryMessage(pages.simulator, 'github_device_code');
      await pages.discoveryPage.locator('#screen-github-app-device.active').waitFor({ state: 'visible' });
      await expect(pages.discoveryPage.locator('#github-device-user-code')).toHaveText(String(code.user_code));
      await sendDiscoveryMessage(pages.simulator, 'github_app_authorized');
      await pages.discoveryPage.locator('#screen-github-app-stored.active').waitFor({ state: 'visible' });
      await waitForMilestone(conductor!.mainWindow, 'github_app_auth');
      await waitForMilestone(conductor!.mainWindow, 'vault_init');
      await conductor!.mainWindow.click('#btn-continue-identity');
      await conductor!.mainWindow.locator('#screen-vault.active').waitFor({ state: 'visible' });
      await conductor!.mainWindow.click('#btn-continue-vault');
      });
    }

    await synapseRunner.runStep('sim_google', undefined, async () => {
      await sendDiscoveryMessage(pages.simulator, 'onboarding_navigate', { step: 'google_auth' });
      await pages.discoveryPage.locator('#screen-google-auth-login.active').waitFor({ state: 'visible' });
      await pages.discoveryPage.click('#btn-open-google-login');
      await expect(pages.discoveryPage.locator('#btn-open-google-login')).toContainText('Google abierto');
      const detectedHost = 'myaccount.google.com';
      const googlePayload = await sendDiscoveryMessage(pages.simulator, 'google_login_detected', { detected_host: detectedHost }, true);
      const detectedTabUrl = await pages.simulator.evaluate(async (tabId) => {
        const tab = await chrome.tabs.get(tabId);
        return tab.url || '';
      }, Number(googlePayload.tabId));
      console.log(`[synapse-simulator] Google tab detectada URL=${detectedTabUrl}; detected_host enviado=${googlePayload.detected_host}`);
      await pages.discoveryPage.locator('#screen-google-auth-confirm.active').waitFor({ state: 'visible' });
      await expect(pages.discoveryPage.locator('#google-detected-host')).toHaveText('myaccount.google.com');
      await sendDiscoveryMessage(pages.simulator, 'account_registered', { service: 'google' });
      await waitForMilestone(conductor!.mainWindow, 'google_auth');
      await conductor!.mainWindow.click('#btn-continue-identity');
    });

    await synapseRunner.runStep('sim_ai_provider', undefined, async () => {
      await sendDiscoveryMessage(pages.simulator, 'onboarding_navigate', { step: 'ai_provider_setup' });
      await pages.discoveryPage.locator('#screen-api-waiting.active').waitFor({ state: 'visible' });
      await pages.discoveryPage.click('#btn-open-console');
      await sendDiscoveryMessage(pages.simulator, 'api_key_registered', { provider: 'gemini' });
      await pages.discoveryPage.locator('#screen-api-success.active').waitFor({ state: 'visible' });
      await waitForMilestone(conductor!.mainWindow, 'ai_provider_setup');
    });

    await synapseRunner.runStep('sim_completion', undefined, async () => {
      await sendDiscoveryMessage(pages.simulator, 'onboarding_navigate', { step: 'success' });
      await pages.discoveryPage.locator('#screen-onboarding-success.active').waitFor({ state: 'visible' });
      const complete = await pages.discoveryPage.evaluate(async () => {
        const state = await chrome.storage.local.get('bloom_profile_state');
        return Boolean(state.bloom_profile_state?.onboarding_complete);
      });
      expect(complete).toBe(true);
      await sendDiscoveryMessage(pages.simulator, 'discovery_complete');
    });

    await synapseRunner.runStep('project_select_and_genesis', undefined, async () => {
      await conductor!.mainWindow.click('#btn-continue-identity');
      await conductor!.mainWindow.locator('#screen-project.active').waitFor({ state: 'visible' });
      expect(existsSync(PROJECT_SOURCE)).toBe(true);
      expect(existsSync(PROJECT_PATH), 'el proyecto aún no debe estar importado').toBe(false);

      // Playwright no controla el selector nativo de Electron. Solo ese diálogo
      // devuelve la fuente confirmada; la tarjeta y el resto del flujo son UI real.
      await conductor!.app.evaluate(({ dialog }, projectPath) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [projectPath] });
      }, PROJECT_SOURCE);
      await conductor!.mainWindow.locator('#project-grid .project-card').filter({ hasText: '+ Local folder' }).click();
      await conductor!.mainWindow.locator('#project-import-status.success').waitFor({ state: 'visible' });
      console.log(`[synapse-simulator] Project UI: ${await conductor!.mainWindow.locator('#project-import-status').innerText()}`);
      for (const name of PROJECT_FILES) {
        const digest = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
        expect(digest(join(PROJECT_PATH, name)), `${name} difiere de la fuente`).toBe(digest(join(PROJECT_SOURCE, name)));
      }
      console.log(`[synapse-simulator] Project fuente=${PROJECT_SOURCE}; destino importado=${PROJECT_PATH}; ${PROJECT_FILES.length} archivos verificados`);
      const selected = JSON.parse(readFileSync(getBloomPaths().nucleusJson, 'utf-8')) as {
        onboarding?: { organizations?: Array<{ org_slug: string; workspace_path: string; projects?: Array<{ project_name: string; project_path: string }> }> };
      };
      const org = selected.onboarding?.organizations?.find(item => item.org_slug === 'eias-repos');
      expect(org?.workspace_path).toBe(WORKSPACE_PATH);
      expect(org?.projects?.find(project => project.project_name === 'sample_project')?.project_path).toBe(PROJECT_PATH);
      await conductor!.mainWindow.click('#btn-project-continue');
      await conductor!.mainWindow.locator('#screen-mandate.active').waitFor({ state: 'visible' });
      await conductor!.mainWindow.click('#btn-mandate-continue');
      await conductor!.mainWindow.locator('#screen-milestone.active').waitFor({ state: 'visible' });
      await conductor!.mainWindow.click('#enter-btn');
      await expect.poll(() => {
        const data = JSON.parse(readFileSync(getBloomPaths().nucleusJson, 'utf-8')) as {
          onboarding?: { completed?: boolean };
        };
        return data.onboarding?.completed;
      }, { timeout: 30_000 }).toBe(true);
    });
  } finally {
    await discovery?.close();
    await conductor?.close();
  }
});
