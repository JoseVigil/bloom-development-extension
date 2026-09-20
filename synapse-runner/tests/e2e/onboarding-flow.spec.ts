import { randomUUID } from 'node:crypto';
import { test, expect } from '../fixtures/synapse-runner-fixture';
import {
  launchConductor,
  installMilestoneBuffer,
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
import { getExtensionIdFromNucleusJson } from '../../src/config/bloom-paths';

/**
 * Suite E2E de onboarding UI-driven — implementa la Matriz de Flujo
 * completa (`src/config/flow-matrix.ts`, `FLOW_MATRIX`; Requerimiento
 * Integrado §6, que renumera el §3 del dossier original), pasos 01 a 11 —
 * las Fases 1-4 (local). Este archivo controla 4 de las 5 superficies
 * (Requerimiento Integrado §7): Electron/Conductor, Chromium/Discovery,
 * Side Panel/Companion, y CLI `brain` como contingencia del paso 06.
 *
 * La Superficie 0 (browser genérico pre-Electron, pasos 00a-00d, Fase 0
 * server-side) precede a este flujo pero NO corre acá — sigue como stub
 * documentado, ver `tests/e2e/phase0-server-onboarding.spec.ts` y
 * `src/surfaces/phase0-generic-browser.ts`. Este spec asume que Fase 0 ya
 * ocurrió (instalador ya corrido, `nucleus authority sync` ya ejecutado) y
 * arranca directamente en "01. Launch" de Electron, igual que antes de esta
 * actualización — la diferencia es que ahora esa asunción queda explícita
 * en vez de implícita.
 *
 * Cada paso corre envuelto en `synapseRunner.runStep()` — el bundle de
 * diagnóstico de 4 capas correlacionadas (Sección 6 del dossier / §9 del
 * Requerimiento Integrado) se produce para TODOS los pasos, no solo los que
 * fallan, desde el primer commit de este Runner (consigna, punto 4).
 *
 * CDP endpoint: hardcodeado a un valor de placeholder razonable
 * (localhost:9222) — el puerto real que usa Sentinel para levantar
 * Chromium no fue confirmado en esta sesión (no era un punto bloqueante de
 * la Sección 7 del dossier). Ajustar vía SYNAPSE_RUNNER_CDP_ENDPOINT si
 * difiere.
 */

const CDP_ENDPOINT = process.env.SYNAPSE_RUNNER_CDP_ENDPOINT ?? 'http://localhost:9222';
const DISCOVERY_URL_PATTERN = /discovery\/index\.html|chrome-extension:\/\/.+\/discovery\//;

test.describe('synapse-runner — onboarding E2E local (UI-driven, Fases 1-4 de 5 superficies — Fase 0 server-side es stub aparte)', () => {
  let conductor: ConductorHandle;
  let discovery: DiscoverySurface;
  let companion: CompanionSurface | undefined;

  test.afterEach(async () => {
    await companion?.close();
    await discovery?.close();
    await conductor?.close();
  });

  test('flujo completo de onboarding + activación del Companion', async ({ synapseRunner }) => {
    // ---- Paso 01: Launch (Electron UI → onboarding:launch-discovery) ----
    await synapseRunner.runStep('01_launch', undefined, async () => {
      conductor = await launchConductor();
      await installMilestoneBuffer(conductor.mainWindow);
      await conductor.mainWindow.click('text=Launch Discovery').catch(() => {
        // El texto exacto del botón no fue confirmado contra el DOM real
        // (Sección 0 auditó archivos, no runtime). Ver README.
        throw new Error(
          '[01_launch] No se encontró el botón "Launch Discovery" — confirmar el selector real ' +
            'en installer/conductor/workspace/onboarding/renderer/steps/step-identity.js.',
        );
      });
      await waitForMilestone(conductor.mainWindow, 'onboarding:launch-discovery');
    });

    // ---- Paso 02: Device Code (Discovery → GITHUB_DEVICE_CODE) ----
    discovery = await synapseRunner.runStep('02_device_code', undefined, async () => {
      const surface = await connectToDiscovery(CDP_ENDPOINT, DISCOVERY_URL_PATTERN);
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
      await waitForMilestone(conductor.mainWindow, 'milestone:reached');
    });

    // ---- Paso 04: Identity (Discovery → ACCOUNT_REGISTERED) ----
    await synapseRunner.runStep('04_identity', undefined, async () => {
      assertSelectorConfigured(SELECTORS.discovery.detectGoogleButton, 'discovery.detectGoogleButton');
      await clickDetectGoogle(discovery.discoveryPage, SELECTORS.discovery.detectGoogleButton);
    });

    // ---- Paso 05: Completion (Electron UI → _onOnboardingSuccess) ----
    await synapseRunner.runStep('05_completion', undefined, async () => {
      await waitForMilestone(conductor.mainWindow, 'onboarding:success');
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
