import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
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
const execFileAsync = promisify(execFile);

async function waitForProfileClosed(): Promise<string | undefined> {
  const paths = getBloomPaths();
  const nucleus = JSON.parse(readFileSync(paths.nucleusJson, 'utf-8')) as { master_profile?: string };
  const profileId = nucleus.master_profile;
  if (!profileId || !/^[0-9a-f-]{36}$/i.test(profileId)) {
    throw new Error('[onboarding-simulator] No se pudo identificar el perfil maestro para verificar su cierre');
  }
  const readProfile = () => {
    const inventory = JSON.parse(readFileSync(paths.profilesJson, 'utf-8')) as {
      profiles?: Array<{ id: string; last_launch_id?: string; runtime_state?: {
        status?: string; pid?: number | null; handshake_confirmed?: boolean;
      } }>;
    };
    const matches = inventory.profiles?.filter(profile => profile.id === profileId) ?? [];
    if (matches.length !== 1) throw new Error('[onboarding-simulator] Inventario del perfil maestro ambiguo');
    return matches[0];
  };
  const prior = readProfile();
  const oldHostPid = prior.runtime_state?.pid;
  const processInventoryScript = `
    $profileId = $env:SYNAPSE_TEST_PROFILE_ID
    $oldHostPid = [int]$env:SYNAPSE_TEST_OLD_HOST_PID
    $items = @(Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe' OR Name = 'bloom-host.exe'" |
      Where-Object { ($_.Name -eq 'chrome.exe' -and $_.CommandLine -like "*$profileId*") -or
        ($oldHostPid -gt 0 -and $_.ProcessId -eq $oldHostPid) } |
      Select-Object ProcessId, Name)
    ConvertTo-Json -Compress -InputObject $items
  `;
  const deadline = Date.now() + 150_000;
  let lastState = 'no inspeccionado';
  while (Date.now() < deadline) {
    const { stdout: statusOutput } = await execFileAsync(join(paths.binDir, 'nucleus', 'nucleus.exe'),
      ['--json', 'synapse', 'status', profileId], { timeout: 10_000, windowsHide: true });
    const statusResponse = JSON.parse(statusOutput) as { success?: boolean; error?: string; status?: {
      state?: string; sentinel_running?: boolean;
    } };
    const workflowAbsent = statusResponse.success === false && statusResponse.error ===
      `failed to query profile status: workflow not found for ID: profile-lifecycle-${profileId}`;
    if (!workflowAbsent && (statusResponse.success !== true || !statusResponse.status)) {
      throw new Error('[onboarding-simulator] Nucleus no confirmó el estado del perfil');
    }
    const profile = readProfile();
    const { stdout: processOutput } = await execFileAsync('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', processInventoryScript], {
        timeout: 10_000, windowsHide: true,
        env: { ...process.env, SYNAPSE_TEST_PROFILE_ID: profileId,
          SYNAPSE_TEST_OLD_HOST_PID: String(oldHostPid ?? 0) },
      });
    const processes = JSON.parse(processOutput) as Array<{ ProcessId: number; Name: string }>;
    if (!Array.isArray(processes)) throw new Error('[onboarding-simulator] Inventario de procesos ambiguo');
    lastState = JSON.stringify({ workflow: workflowAbsent ? 'not_found' : statusResponse.status?.state,
      sentinel_running: statusResponse.status?.sentinel_running, profile: profile.runtime_state,
      ownProcesses: processes.map(item => ({ pid: item.ProcessId, name: item.Name })) });
    if ((workflowAbsent || (statusResponse.status?.state === 'SEEDED' &&
        statusResponse.status.sentinel_running === false)) &&
        profile.runtime_state?.status === 'closed' && !profile.runtime_state.pid &&
        profile.runtime_state.handshake_confirmed === false && processes.length === 0) {
      console.log(`[synapse-simulator] Cierre efectivo del perfil confirmado: ${lastState}`);
      return profile.last_launch_id;
    }
    await new Promise(resolve => setTimeout(resolve, 1_000));
  }
  throw new Error(`[onboarding-simulator] Perfil aún no cerrado; se aborta antes de 00a/reset: ${lastState}`);
}

test('onboarding simulado mediante la UI de Synapse Simulator', async ({ synapseRunner }) => {
  test.setTimeout(900_000);
  const resumeCurrent = process.env.SYNAPSE_RESUME_CURRENT === '1';
  let conductor: ConductorHandle | undefined;
  let discovery: DiscoverySurface | undefined;
  let phase0RegistrationId: string | undefined;
  let phase0Registration: Awaited<ReturnType<typeof finishPhase0FixtureRegistration>> | undefined;
  let phase0FixtureSubject: string | undefined;
  let githubFixtureUsername: string | undefined;
  let previousLaunchId: string | undefined;
  const verifyOrganizationIdentity = (stage: string, expectedCompleted: boolean) => {
    const data = JSON.parse(readFileSync(getBloomPaths().nucleusJson, 'utf-8')) as {
      onboarding?: { completed?: boolean; backend_identity_org_id?: string; active_org_slug?: string;
        organizations?: Array<{ org_slug?: string; organization_id?: string; workspace_path?: string }> };
    };
    const onboarding = data.onboarding;
    const activeSlug = onboarding?.active_org_slug;
    expect(activeSlug, `${stage}: falta active_org_slug`).toBeTruthy();
    const matches = (onboarding?.organizations ?? []).filter(org => org.org_slug === activeSlug);
    expect(matches, `${stage}: el slug activo debe identificar una sola organización`).toHaveLength(1);
    expect(matches[0].organization_id, `${stage}: falta organization_id`).toBeTruthy();
    expect(matches[0].organization_id).toBe(onboarding?.backend_identity_org_id);
    expect(matches[0].organization_id).toBe(phase0RegistrationId);
    expect(matches[0].workspace_path).toBe(WORKSPACE_PATH);
    expect(onboarding?.completed === true).toBe(expectedCompleted);
    console.log(`[synapse-simulator] ${stage}: ${JSON.stringify({
      phase0RegistrationOrganizationId: phase0RegistrationId,
      backendIdentityOrgId: onboarding?.backend_identity_org_id,
      activeOrgSlug: activeSlug,
      activeOrganizationId: matches[0].organization_id,
      equal: matches[0].organization_id === onboarding?.backend_identity_org_id
        && matches[0].organization_id === phase0RegistrationId,
      completed: onboarding?.completed === true,
    })}`);
  };
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
      previousLaunchId = await synapseRunner.runStep('profile_closed_before_00a', undefined, waitForProfileClosed);
      const configuredFixtureSubject = process.env.SYNAPSE_FIXTURE_SUBJECT;
      if (configuredFixtureSubject !== undefined && !configuredFixtureSubject.trim()) {
        throw new Error('[onboarding-simulator] SYNAPSE_FIXTURE_SUBJECT no puede estar vacío');
      }
      phase0FixtureSubject = configuredFixtureSubject?.trim() ?? randomUUID();
      const flow = await synapseRunner.runStep('00a', undefined, () =>
        beginPhase0FixtureRegistration(env.backendOrigin));
      const registration = await synapseRunner.runStep('00b', undefined, () =>
        finishPhase0FixtureRegistration(env.backendOrigin, flow, phase0FixtureSubject!));
      console.log(`[synapse-simulator] 00b organizationId=${registration.organizationId}, created=${registration.created}`);
      phase0RegistrationId = registration.organizationId;
      phase0Registration = registration;
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
      expect(existsSync(join(WORKSPACE_PATH, '.bloom', '.nucleus-eias-repos'))).toBe(true);
      await conductor!.mainWindow.fill('#ws-path-input', WORKSPACE_BASE);
      await conductor!.mainWindow.fill('#ws-org-input', 'eias-repos');
      await conductor!.mainWindow.click('#btn-continue-workspace');
      await conductor!.mainWindow.locator('#ws-err-use-existing').waitFor({ state: 'visible' });
      console.log(`[synapse-simulator] onboarding:init-nucleus rechazó destino existente: ${await conductor!.mainWindow.locator('#ws-error').innerText()}`);
      await conductor!.mainWindow.click('#ws-err-use-existing');
      await conductor!.mainWindow.locator('#screen-identity.active').waitFor({ state: 'visible' });
      expect(existsSync(join(WORKSPACE_PATH, '.bloom', '.nucleus-eias-repos'))).toBe(true);
      const nucleus = JSON.parse(readFileSync(getBloomPaths().nucleusJson, 'utf-8')) as {
        onboarding?: { active_org_slug?: string; organizations?: Array<{ org_slug: string; workspace_path: string }> };
      };
      expect(nucleus.onboarding?.active_org_slug).toBe('eias-repos');
      expect(nucleus.onboarding?.organizations?.find(org => org.org_slug === 'eias-repos')?.workspace_path).toBe(WORKSPACE_PATH);
      verifyOrganizationIdentity('después de Workspace', false);
      console.log(`[synapse-simulator] Workspace existente vinculado: ${WORKSPACE_PATH}`);
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
      if (!resumeCurrent) expect(expectedLaunch, 'el lanzamiento debe ser nuevo').not.toBe(previousLaunchId);
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
      await synapseRunner.runStep('sim_github', undefined, async () => {
      await sendDiscoveryMessage(pages.simulator, 'onboarding_navigate', { step: 'github_app_auth' });
      await pages.discoveryPage.locator('#screen-github-app-start.active').waitFor({ state: 'visible' });
      const code = await sendDiscoveryMessage(pages.simulator, 'github_device_code');
      await pages.discoveryPage.locator('#screen-github-app-device.active').waitFor({ state: 'visible' });
      await expect(pages.discoveryPage.locator('#github-device-user-code')).toHaveText(String(code.user_code));
      const githubAuthorized = await sendDiscoveryMessage(pages.simulator, 'github_app_authorized');
      expect(githubAuthorized.username).toMatch(/^[-A-Za-z0-9_]{1,39}$/);
      githubFixtureUsername = String(githubAuthorized.username);
      await pages.discoveryPage.locator('#screen-github-app-stored.active').waitFor({ state: 'visible' });
      await waitForMilestone(conductor!.mainWindow, 'github_app_auth');
      await synapseRunner.runStep('sim_vault_navigation', undefined, async () => {
        await sendDiscoveryMessage(pages.simulator, 'onboarding_navigate', { step: 'vault_init' });
        await pages.discoveryPage.locator('#screen-vault-created.active').waitFor({ state: 'visible' });
      });
      await waitForMilestone(conductor!.mainWindow, 'vault_init');
      await conductor!.mainWindow.click('#btn-continue-identity');
      await conductor!.mainWindow.locator('#screen-vault.active').waitFor({ state: 'visible' });
      await conductor!.mainWindow.click('#btn-continue-vault');
      });

      await synapseRunner.runStep('gemini_authority_grant', undefined, async () => {
        const registration = phase0Registration!;
        const prepared = await conductor!.mainWindow.evaluate(() =>
          (window as unknown as { onboarding: { prepareGeminiVault(): Promise<{
            organizationId: string; installationId: string; servicePublicKey: string;
          }> } }).onboarding.prepareGeminiVault());
        expect(prepared.organizationId).toBe(registration.organizationId);
        const postAuthority = async (path: string, body: unknown, allowAlreadyExists = false) => {
          const response = await fetch(`${env.backendOrigin}${path}`, {
            method: 'POST',
            headers: { Origin: env.backendOrigin, 'Content-Type': 'application/json',
              Cookie: registration.sessionCookie, 'X-Authority-CSRF': registration.csrf },
            body: JSON.stringify(body),
          });
          const result = await response.json() as Record<string, unknown>;
          if (!response.ok && !(allowAlreadyExists && response.status === 409 && result.error === 'authority_initial_emission_already_exists')) {
            throw new Error(`[gemini-authority] ${path}: HTTP ${response.status} ${JSON.stringify(result)}`);
          }
          return result;
        };
        const ownership = JSON.parse(readFileSync(join(WORKSPACE_PATH, '.bloom', '.nucleus-eias-repos', '.ownership.json'), 'utf-8')) as {
          authority_mode?: string; binding?: { state?: string }; organization?: { canonical_id?: string };
          legacy_authority?: { owner?: { source?: string; subject?: string } } | null;
        };
        expect(ownership.organization?.canonical_id).toBe(registration.organizationId);
        expect(githubFixtureUsername).toMatch(/^[-A-Za-z0-9_]{1,39}$/);
        const ownerSubject = githubFixtureUsername!;
        let initial: Record<string, unknown>;
        if (ownership.authority_mode === 'local_legacy') {
          expect(ownership.legacy_authority?.owner).toMatchObject({ source: 'github_handle', subject: ownerSubject });
          initial = await postAuthority('/v1/authority/initial-emission', {
            organizationId: registration.organizationId,
            fixtureLocalOwner: { source: 'github_handle', subject: ownerSubject },
          });
          if (initial.status === 'committed') {
            initial = await postAuthority('/v1/authority/initial-emission', {
              organizationId: registration.organizationId,
              fixtureLocalOwner: { source: 'github_handle', subject: ownerSubject },
            });
          }
        } else {
          expect(ownership.authority_mode).toBe('remote_enforced');
          expect(ownership.binding?.state).toBe('REMOTE_LOCKED');
          expect(ownership.legacy_authority).toBeNull();
          const prior = JSON.parse(readFileSync(join(getBloomPaths().baseDir, 'authority', 'state.json'), 'utf-8')) as {
            monotonic_state: { high_water_mark: string }; accepted_projection: {
              principals: Array<{ principal_id: string; external_identities: Array<{ provider: string; subject: string; status: string }> }>;
            };
          };
          const bound = prior.accepted_projection.principals.filter(principal =>
            principal.principal_id === registration.principalId &&
            principal.external_identities.some(identity => identity.provider === 'github' && identity.subject === ownerSubject && identity.status === 'verified') &&
            principal.external_identities.some(identity => identity.provider === 'github' && identity.subject === phase0FixtureSubject && identity.status === 'verified'));
          expect(bound, 'El snapshot aceptado debe conservar el UUID de 00b y el usuario GitHub del mismo fundador').toHaveLength(1);
          initial = await postAuthority('/v1/authority/initial-emission', { organizationId: registration.organizationId }, true);
          if (initial.error === 'authority_initial_emission_already_exists') {
            initial = { authorityVersion: prior.monotonic_state.high_water_mark, status: 'already_bound' };
          }
        }
        expect(initial.status).toMatch(/^(fixture_owner_bound|already_bound|renewed)$/);
        expect(initial.authorityVersion).toMatch(/^[1-9][0-9]*$/);
        const sync = async (grantId?: string) => conductor!.mainWindow.evaluate((id) =>
          (window as unknown as { onboarding: { syncGeminiVault(id?: string): Promise<{
            authorityVersion: string; effectiveMode: string;
          }> } }).onboarding.syncGeminiVault(id), grantId);
        const firstSync = await sync();
        expect(firstSync.effectiveMode).toBe('remote_enforced');
        expect(firstSync.authorityVersion).toBe(initial.authorityVersion);
        // Nucleus wrote this projection only after validating the signed snapshot and checkpoint.
        const accepted = JSON.parse(readFileSync(join(getBloomPaths().baseDir, 'authority', 'state.json'), 'utf-8')) as {
          monotonic_state: { high_water_mark: string }; accepted_projection: {
          principals: Array<{ principal_id: string; external_identities: Array<{ provider: string; subject: string; status: string }> }>;
          memberships: Array<{ principal_id: string; membership_id: string; organization_id: string; status: string }>;
          role_assignments: Array<{ membership_id: string; role_id: string; role_version: string; status: string }>;
          role_definitions: Array<{ role_id: string; role_version: string; permissions: string[] }>;
        } };
        expect(accepted.monotonic_state.high_water_mark).toBe(firstSync.authorityVersion);
        const state = accepted.accepted_projection;
        const owners = state.principals.filter(principal => principal.external_identities.some(identity =>
          identity.provider === 'github' && identity.subject === ownerSubject && identity.status === 'verified'));
        expect(owners).toHaveLength(1);
        expect(owners[0].principal_id).toBe(registration.principalId);
        expect(owners[0].external_identities.some(identity => identity.provider === 'github' &&
          identity.subject === phase0FixtureSubject && identity.status === 'verified')).toBe(true);
        const activeMaster = state.memberships.some(membership => membership.principal_id === owners[0].principal_id &&
          membership.organization_id === registration.organizationId && membership.status === 'active' &&
          state.role_assignments.some(assignment => assignment.membership_id === membership.membership_id &&
            assignment.role_id === 'master' && assignment.status === 'active' &&
            state.role_definitions.some(role => role.role_id === assignment.role_id &&
              role.role_version === assignment.role_version && role.permissions.includes('create_project'))));
        expect(activeMaster, 'El propietario del fixture debe conservar create_project').toBe(true);
        console.log(`[synapse-simulator] Snapshot Authority v${initial.authorityVersion}: fundador=${owners[0].principal_id}, propietario fixture=${ownerSubject}, create_project=true, estado=${initial.status}`);
        const issued = await postAuthority('/v1/authority/vault-service-grant', {
          organizationId: registration.organizationId,
          requestId: randomUUID(),
          expectedVersion: firstSync.authorityVersion,
          command: { kind: 'issue', installationId: prepared.installationId,
            servicePublicKey: prepared.servicePublicKey, keyId: 'gemini-key:default',
            purpose: 'onboarding_gemini', validUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString() },
        });
        expect(issued.status).toBe('issued');
        const secondSync = await sync(String(issued.grantId));
        expect(secondSync.authorityVersion).toBe(issued.authorityVersion);
        console.log(`[synapse-simulator] Gemini grant=${issued.grantId}, authority version=${secondSync.authorityVersion}, mode=${secondSync.effectiveMode}`);
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
      const geminiChoice = conductor!.mainWindow.locator('input[name="intelligence-supply"][value="gemini"]');
      const gemmaChoice = conductor!.mainWindow.locator('input[name="intelligence-supply"][value="gemma"]');
      await expect(geminiChoice).toBeVisible();
      await expect(geminiChoice).toBeChecked();
      await expect(gemmaChoice).not.toBeChecked();
      await geminiChoice.check();
      await expect(conductor!.mainWindow.locator('#supply-choice-status')).toContainText('Gemini, modelo de frontera, seleccionado');
      await conductor!.mainWindow.click('#btn-continue-identity');
    });

    await synapseRunner.runStep('sim_ai_provider', undefined, async () => {
      await sendDiscoveryMessage(pages.simulator, 'onboarding_navigate', { step: 'ai_provider_setup' });
      await pages.discoveryPage.locator('#screen-api-waiting.active').waitFor({ state: 'visible' });
      await pages.discoveryPage.click('#btn-open-console');
      await expect(pages.discoveryPage.locator('#screen-api-success.active')).toHaveCount(0);
      const sent = await sendDiscoveryMessage(pages.simulator, 'api_key_registered', { provider: 'gemini' });
      console.log(`[synapse-simulator] Gemini request enviada sin secreto: provider=${sent.provider}`);
      const readReceipt = () => conductor!.mainWindow.evaluate(() =>
        (window as unknown as { onboarding: { geminiVaultReceipt(): Promise<{
          status: string; key_id: string; organization_id: string; grant_id: string;
        } | null> } }).onboarding.geminiVaultReceipt());
      await expect.poll(readReceipt, { timeout: 30_000 }).toMatchObject({
        status: 'stored', key_id: 'gemini-key:default', organization_id: phase0RegistrationId,
      });
      const receipt = await readReceipt();
      expect(receipt).toMatchObject({ status: 'stored', key_id: 'gemini-key:default', organization_id: phase0RegistrationId });
      expect(receipt?.grant_id).toBeTruthy();
      await waitForMilestone(conductor!.mainWindow, 'ai_provider_setup');
      await pages.discoveryPage.locator('#screen-api-success.active').waitFor({ state: 'visible', timeout: 30_000 });
      console.log(`[synapse-simulator] Nucleus Vault confirmó key_id=${receipt!.key_id}, grant_id=${receipt!.grant_id}; Conductor confirmó ai_provider_setup; Discovery mostró éxito`);
      if (!resumeCurrent) {
        const data = JSON.parse(readFileSync(getBloomPaths().nucleusJson, 'utf-8')) as {
          onboarding?: { ai_provider_key?: unknown };
        };
        // The reactor persists a boolean completion marker; the credential lives in Nucleus Vault.
        expect(data.onboarding?.ai_provider_key).toBe(true);
      }
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
      expect(existsSync(PROJECT_PATH), 'el proyecto existente debe conservarse').toBe(true);

      // Playwright no controla el selector nativo de Electron. Solo ese diálogo
      // devuelve la fuente confirmada; la tarjeta y el resto del flujo son UI real.
      await conductor!.app.evaluate(({ dialog }, projectPath) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [projectPath] });
      }, PROJECT_PATH);
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
      if (!resumeCurrent) verifyOrganizationIdentity('antes de finalizar', false);
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
      if (!resumeCurrent) verifyOrganizationIdentity('onboarding finalizado', true);
    });
  } finally {
    await discovery?.close();
    await conductor?.close();
  }
});
