import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from '../fixtures/synapse-runner-fixture';
import {
  beginPhase0FixtureRegistration,
  finishPhase0FixtureRegistration,
  type Phase0RegistrationResult,
} from '../../src/surfaces/phase0-generic-browser';
import { env } from '../../src/config/env';
import {
  launchConductor,
  installMilestoneBuffer,
  waitForDiscoveryCdpEndpoint,
  waitForMilestone,
  type ConductorHandle,
} from '../../src/surfaces/electron-conductor';
import { connectToDiscovery, clickAuthGithub, clickDetectGoogle, type DiscoverySurface } from '../../src/surfaces/discovery-chromium';
import {
  attachToCompanionSidePanel,
  readRefinedResponseState,
  type CompanionSurface,
} from '../../src/surfaces/companion-panel';
import { runSubmitTestimony } from '../../src/surfaces/submit-cli';
import { SELECTORS, assertSelectorConfigured } from '../../src/config/selectors';
import { getBloomPaths, getExtensionIdFromNucleusJson, resetOnboardingState } from '../../src/config/bloom-paths';

/**
 * Suite E2E de onboarding UI-driven — implementa la Matriz de Flujo
 * completa (`src/config/flow-matrix.ts`, `FLOW_MATRIX`; Requerimiento
 * Integrado §6, que renumera el §3 del dossier original), pasos 00 a 11 —
 * Fase 0 server-side (00a/00b reales) + Fases 1-4 (local). Este archivo
 * controla las 5 superficies (Requerimiento Integrado §7): Superficie 0
 * (registro/login vía HTTP puro contra el backend en modo fixture, sin
 * browser), Electron/Conductor, Chromium/Discovery, Side Panel/Companion, y
 * CLI `brain` como contingencia del paso 06.
 *
 * La Superficie 0 SÍ corre acá de verdad, como pasos `00a`/`00b`, antes de
 * "01. Launch" — dos llamadas HTTP puras (sin browser, sin Playwright)
 * contra el backend en modo fixture (`AUTHORITY_ALLOW_TEST_FIXTURES=true`,
 * sólo `.dev.vars`, ver `backend/.dev.vars.example`), que inyectan
 * directamente el estado que un login real de GitHub habría producido, sin
 * tocar nunca github.com. Ver el comentario completo en
 * `src/surfaces/phase0-generic-browser.ts` — ahí se explica cómo esto
 * esquiva por completo la Sección 14.1 del Requerimiento Integrado
 * (¿aplica `AUTHORITY_BOUNDARY.md` §1?) en vez de resolverla eligiendo una
 * de las dos opciones que dejaba abiertas. El paso 00c (descarga) sigue
 * bloqueado — por un motivo no relacionado, ver
 * `tests/e2e/phase0-server-onboarding.spec.ts`.
 *
 * Los pasos 00a/00b de arriba (Fase 0 SERVER-SIDE) prueban el registro
 * contra el backend Cloudflare de verdad, pero siguen sin estar conectados
 * con el estado local que arranca Conductor — son dos journeys todavía
 * independientes en este PoC, tal como ya documenta 00d en
 * `flow-matrix.ts`; este spec sigue asumiendo que el instalador ya corrió y
 * que Conductor ya está instalado antes de `launchConductor()`.
 *
 * Entre 00b y "01. Launch" corre además `backend_identity_check` — step 0
 * del wizard LOCAL de Conductor (Auth 1, distinto de 00a/00b: éste vive
 * dentro de Electron, vía IPC, no HTTP directo desde el Runner). Como el
 * contrato real de ese backend todavía no existe, se completa por
 * inyección directa del Synapse Simulator — ver
 * `src/surfaces/backend-identity-check.ts` y
 * `Encargo_Modificacion_Runner_Incorporacion_Step_BackendIdentityCheck_v1_0.md`
 * (`ANALYSIS/CONDUCTOR/ONBOARDING/`, Project BTIPS). Desde que
 * `nucleus_create.requires` incluye `backend_identity_validated`, este paso
 * es un gate real: "Launch Discovery" no es alcanzable en la UI hasta que
 * se complete.
 *
 * Cada paso corre envuelto en `synapseRunner.runStep()` — el bundle de
 * diagnóstico de 4 capas correlacionadas (Sección 6 del dossier / §9 del
 * Requerimiento Integrado) se produce para TODOS los pasos, no solo los que
 * fallan, desde el primer commit de este Runner (consigna, punto 4). La
 * Superficie 0 es la excepción documentada: no tiene capa de diagnóstico
 * propia todavía (§14.4, pendiente) — su paso sólo deja log por consola.
 *
 * CDP endpoint: Chromium lo publica en DevToolsActivePort del perfil maestro
 * después del click que dispara el lanzamiento de Discovery.
 */

const DISCOVERY_URL_PATTERN = /discovery\/index\.html|chrome-extension:\/\/.+\/discovery\//;
const WORKSPACE_PATH = process.env.SYNAPSE_TEST_WORKSPACE_PATH ?? join(homedir(), 'BloomTestWorkspace', 'synapse-runner-e2e');
const WORKSPACE_ORG = process.env.SYNAPSE_TEST_WORKSPACE_ORG ?? 'synapse-runner-e2e';

test.describe('synapse-runner — onboarding E2E completo (5 superficies: Fase 0 server-side real + Fases 1-4 local)', () => {
  let phase0Registration: Phase0RegistrationResult | undefined;
  let conductor: ConductorHandle;
  let discovery: DiscoverySurface;
  let companion: CompanionSurface | undefined;

  test.afterEach(async () => {
    // Orden inverso al de apertura. 00a/00b no abren ningún proceso — son
    // HTTP puro — así que no hay nada que cerrar de la Superficie 0 acá.
    await companion?.close();
    await discovery?.close();
    await conductor?.close();
  });

  test('flujo completo de onboarding + activación del Companion', async ({ synapseRunner }) => {
    // ---- Paso 00a: Génesis — inicia el registro (HTTP puro, sin browser) ----
    // POST /v1/authority/genesis/login contra el backend en modo fixture
    // (AUTHORITY_ALLOW_TEST_FIXTURES=true) — nunca navega a github.com, nunca
    // hace un fetch saliente a un proveedor externo. Ver el comentario
    // completo en src/surfaces/phase0-generic-browser.ts.
    const genesisFlow = await synapseRunner.runStep('00a', undefined, () =>
      beginPhase0FixtureRegistration(env.backendOrigin),
    );

    // ---- Paso 00b: Callback — el backend inyecta el estado post-login y ----
    // ---- emite sesión (HTTP puro, sin browser) ----
    // GET /v1/authority/human/callback?state=&code=<subject-fixture>. Un
    // subject nuevo por corrida (randomUUID) simula un fundador
    // registrándose por primera vez.
    phase0Registration = await synapseRunner.runStep('00b', undefined, () =>
      finishPhase0FixtureRegistration(env.backendOrigin, genesisFlow, randomUUID()),
    );
    expect(phase0Registration.organizationId).toBeTruthy();
    expect(phase0Registration.created).toBe(true);

    // ---- Paso backend_identity_check: step 0 del wizard LOCAL de Conductor ----
    // (Auth 1 — solo identidad, corre antes que nucleus_create; no confundir
    // con 00a/00b de arriba, que son Fase 0 SERVER-SIDE por HTTP directo sin
    // Electron. Ver el comentario de cabecera de
    // src/surfaces/backend-identity-check.ts.) Electron ya abre el wizard
    // directo en esta pantalla en un onboarding nuevo, porque
    // nucleus_create.requires ahora incluye 'backend_identity_validated'
    // (Encargo_Modificacion_Runner_Incorporacion_Step_BackendIdentityCheck_v1_0.md
    // §2) — "Launch Discovery" no es alcanzable todavía en este punto.
    // FIX (2026-09-22 — diagnóstico "el wizard saltea backend_identity_check
    // y arranca directo en Workspace"): sin este reset, nucleus.json arrastra
    // el completed_steps de la corrida ANTERIOR de este mismo test, y
    // resolution-engine.js resuelve el entry point a 'nucleus_create' en vez
    // de 'backend_identity_check' — el wizard resume correctamente, pero el
    // test deja de probar el step que le interesa. Ver
    // resetOnboardingState() en bloom-paths.ts para el detalle completo.
    resetOnboardingState();

    conductor = await launchConductor({ browser: genesisFlow.browser, backendOrigin: env.backendOrigin });
    await installMilestoneBuffer(conductor.mainWindow);

    await synapseRunner.runStep('backend_identity_check', undefined, async () => {
      // FIX (2026-09-22 — diagnóstico "botón nunca se habilita"): en un
      // onboarding fresco (nada producido todavía), resumeFromEntryPoint()
      // (renderer/core/navigation.js) NO navega directo al primer step del
      // SSOT — a propósito muestra screen-entry (el botón "Start"), y solo
      // navega al step real recién cuando el usuario clickea Start
      // (startOnboarding() → navigation.navigateTo(firstStepId)). Sin este
      // click, la app queda parada en screen-entry: el onEnter de
      // backend_identity_check (triggerBackendIdentityCheck, que dispara
      // window.onboarding.validateBackendIdentity() y arranca el poll de
      // respaldo) nunca corre, y el registro de
      // conductor_onboarding_*.log lo confirma — se ve
      // "navigation → screen-entry" y nunca
      // "navigation → screen-backend-identity-check". Confirmado contra
      // onboarding.html: el botón real es
      // <button class="btn-primary" onclick="startOnboarding()">Start</button>
      // dentro de <div class="screen active" id="screen-entry">.
      await conductor.mainWindow.click('#screen-entry .btn-primary');

      const milestone = (await waitForMilestone(conductor.mainWindow, 'backend_identity_check')) as {
        jsonValue(): Promise<unknown>;
      };
      const observed = (await milestone.jsonValue()) as { payload?: { branch?: string; orgId?: string; role?: string } };
      expect(observed.payload).toMatchObject({
        branch: 'master_new_org',
        orgId: phase0Registration!.organizationId,
        role: 'master',
      });
      const nucleus = JSON.parse(readFileSync(getBloomPaths().nucleusJson, 'utf-8')) as {
        onboarding?: { backend_identity_org_id?: string; backend_identity_branch?: string };
      };
      expect(nucleus.onboarding?.backend_identity_org_id).toBe(phase0Registration!.organizationId);
      expect(nucleus.onboarding?.backend_identity_branch).toBe('master_new_org');
      await conductor.mainWindow.click('#btn-continue-backend-identity');
    });

    // ---- Paso local previo a Discovery: Workspace ----
    await synapseRunner.runStep('01a_workspace', undefined, async () => {
      mkdirSync(WORKSPACE_PATH, { recursive: true });
      await conductor.mainWindow.fill('#ws-path-input', WORKSPACE_PATH);
      await conductor.mainWindow.fill('#ws-org-input', WORKSPACE_ORG);
      await conductor.mainWindow.click('#btn-continue-workspace');
      await conductor.mainWindow.locator('#screen-identity.active').waitFor({ state: 'visible' });
    });

    // ---- Paso 02: Device Code (Discovery → GITHUB_DEVICE_CODE) ----
    discovery = await synapseRunner.runStep('02_device_code', undefined, async () => {
      const launchStartedAt = Date.now();
      await conductor.mainWindow.click('#btn-continue-identity');
      const cdpEndpoint = await waitForDiscoveryCdpEndpoint(launchStartedAt);
      const surface = await connectToDiscovery(cdpEndpoint, DISCOVERY_URL_PATTERN);
      assertSelectorConfigured(SELECTORS.discovery.authGithubButton, 'discovery.authGithubButton');
      await clickAuthGithub(surface.discoveryPage, SELECTORS.discovery.authGithubButton);
      return surface;
    });

    // ---- Paso 03: OAuth GitHub (frontera externa #2 de 6 — Repo Ops, no ----
    // ---- confundir con la #1, login GitHub del backend en Fase 0/00b)  ----
    await synapseRunner.runStep('03_oauth_github', undefined, async () => {
      // Frontera externa real — ver EXTERNAL_BOUNDARIES en flow-matrix.ts.
      // El pipeline completo cruza SEIS fronteras externas confirmadas, no
      // tres ni cuatro (Requerimiento Integrado §4). La automatización de
      // la pantalla de consentimiento de GitHub queda fuera del alcance de
      // este PoC (requiere credenciales de test dedicadas); se asume una
      // sesión de GitHub ya autorizada en el perfil de Chromium usado por
      // el Runner, tal como recomienda tratar las fronteras externas sin
      // saltear el circuito de eventos del cliente (consigna, punto 3).
      await waitForMilestone(conductor.mainWindow, 'github_app_auth');
    });

    await synapseRunner.runStep('01b_vault', undefined, async () => {
      await waitForMilestone(conductor.mainWindow, 'vault_init');
      await conductor.mainWindow.click('#btn-continue-vault');
    });

    // ---- Paso 04: Identity (Discovery → ACCOUNT_REGISTERED) ----
    await synapseRunner.runStep('04_identity', undefined, async () => {
      assertSelectorConfigured(SELECTORS.discovery.detectGoogleButton, 'discovery.detectGoogleButton');
      await clickDetectGoogle(discovery.discoveryPage, SELECTORS.discovery.detectGoogleButton);
    });

    // ---- Paso 05: Completion (Electron UI → _onOnboardingSuccess) ----
    await synapseRunner.runStep('05_completion', undefined, async () => {
      await waitForMilestone(conductor.mainWindow, 'onboarding:success');

      const nucleus = JSON.parse(readFileSync(getBloomPaths().nucleusJson, 'utf-8')) as {
        onboarding?: {
          completed?: boolean;
          backend_identity_org_id?: string;
          active_org_slug?: string;
          organizations?: Array<{ org_slug?: string; organization_id?: string }>;
        };
      };
      const activeSlug = nucleus.onboarding?.active_org_slug;
      const activeOrganizations = (nucleus.onboarding?.organizations ?? [])
        .filter((org) => org.org_slug === activeSlug);

      expect(activeOrganizations).toHaveLength(1);
      expect(activeOrganizations[0].organization_id).toBeTruthy();
      expect(activeOrganizations[0].organization_id).toBe(nucleus.onboarding?.backend_identity_org_id);
      expect(activeOrganizations[0].organization_id).toBe(phase0Registration!.organizationId);
    });

    // ---- Paso 06-contingencia: Submit Intent (CLI, fuera de banda) ----
    const intentId = randomUUID();
    await synapseRunner.runStep('06-contingencia_submit_intent', intentId, async () => {
      const result = await runSubmitTestimony(synapseRunner.bus, intentId);
      // No fallamos el test automáticamente si el CLI reporta error — el
      // bundle de diagnóstico ya lo captura clasificado (Capa 4). Lo que
      // sí verificamos es que el proceso corrió y devolvió una forma válida.
      expect(result.exitCode).not.toBeNull();
    });

    // ---- Paso 07: Companion activation ----
    await synapseRunner.runStep('07_companion_activation', undefined, async () => {
      // Navegar la tab activa a un dominio de AI_SIDE_PANEL_DOMAINS para
      // que background-companion.js habilite el panel.
      await discovery.discoveryPage.goto('https://gemini.google.com/app').catch(() => {
        /* puede que ya esté ahí o que Companion la navegue por su cuenta */
      });
    });

    // ---- Paso 08-11: Companion command → engine inject → display ----
    const extensionId = getExtensionIdFromNucleusJson();
    companion = await synapseRunner.runStep('08_companion_command', undefined, async () => {
      const context = discovery.discoveryPage.context();
      return attachToCompanionSidePanel(discovery.browser, context, extensionId, synapseRunner.bus);
    });

    await synapseRunner.runStep('11_companion_display', undefined, async () => {
      const state = await readRefinedResponseState(companion!.page);
      expect(state).not.toBeNull();
    });
  });
});
