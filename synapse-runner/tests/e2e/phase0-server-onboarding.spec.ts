import { test, expect } from '../fixtures/synapse-runner-fixture';
import { FLOW_MATRIX } from '../../src/config/flow-matrix';
import { env } from '../../src/config/env';
import {
  PHASE0_DOWNLOAD_STATUS,
  beginPhase0FixtureRegistration,
  executePhase0Download,
  finishPhase0FixtureRegistration,
} from '../../src/surfaces/phase0-generic-browser';

/**
 * Pasos 00a-00d (Fase 0, server-side) de la Matriz de Flujo completa — ver
 * `src/config/flow-matrix.ts`. Este archivo prueba cada sub-paso de Fase 0
 * por separado (a diferencia de `onboarding-flow.spec.ts`, que corre 00a/00b
 * una sola vez como parte del flujo completo).
 *
 * ACTUALIZACIÓN 2026-09-20 — 00a y 00b DEJARON DE SER STUB. La Sección 14.1
 * del Requerimiento Integrado (¿aplica `AUTHORITY_BOUNDARY.md` §1 a un
 * arnés de Playwright automatizando login/registro GitHub?) se esquivó por
 * completo: en vez de decidir entre las dos opciones que dejaba abiertas,
 * el backend gana un modo fixture HTTP (`AUTHORITY_ALLOW_TEST_FIXTURES`,
 * sólo `.dev.vars`, nunca en un despliegue real) que inyecta directamente
 * el estado post-login, igual que el Synapse Simulator hace del lado de la
 * extensión — nunca se navega a github.com, nunca se automatiza una
 * superficie externa real. Ver el comentario completo en
 * `src/surfaces/phase0-generic-browser.ts`.
 *
 * 00c y 00d siguen con `test.fixme()` — llamado DENTRO de cada test (no a
 * nivel de `describe`, que aplicaría a todo el bloque incluyendo 00a/00b —
 * ver la nota sobre semántica de `test.fixme()` a nivel describe vs. a
 * nivel test en la cabecera de `onboarding-flow.spec.ts` y en el README).
 * Pero por motivos TOTALMENTE DISTINTOS y no relacionados con
 * AUTHORITY_BOUNDARY.md:
 *   - 00c: no existe todavía una ruta de descubrimiento público de
 *     `releaseId` (§11/§13 del Requerimiento Integrado).
 *   - 00d: es manual incluso en el flujo real (instalar + `nucleus
 *     authority sync`), corre en el sistema operativo del usuario — nunca
 *     fue responsabilidad de Playwright.
 */

test.describe('synapse-runner — Fase 0 server-side (00a-00d)', () => {
  test('paso 00a: iniciar registro/login contra el backend (HTTP puro, sin browser)', async ({ synapseRunner }) => {
    const step = FLOW_MATRIX.find((s) => s.id === '00a')!;
    expect(step.implementedInRunner).toBe(true);
    const flow = await synapseRunner.runStep('00a', undefined, () => beginPhase0FixtureRegistration(env.backendOrigin));
    expect(flow.authorizationUrl).toContain('fixture.invalid');
    expect(flow.flowCookie).toContain('__Host-authority-flow=');
  });

  test('paso 00b: callback — el backend inyecta el estado post-login y emite sesión (HTTP puro, sin browser)', async ({
    synapseRunner,
  }) => {
    const step = FLOW_MATRIX.find((s) => s.id === '00b')!;
    expect(step.implementedInRunner).toBe(true);
    const flow = await synapseRunner.runStep('00a', undefined, () => beginPhase0FixtureRegistration(env.backendOrigin));
    const registration = await synapseRunner.runStep('00b', undefined, () =>
      finishPhase0FixtureRegistration(env.backendOrigin, flow, crypto.randomUUID()),
    );
    expect(registration.organizationId).toBeTruthy();
    expect(registration.principalId).toBeTruthy();
    expect(registration.created).toBe(true);
    expect(registration.sessionCookie).toContain('__Host-authority-session=');
  });

  test(`paso 00c: ${FLOW_MATRIX.find((s) => s.id === '00c')!.humanActionSimulated}`, async ({ synapseRunner }) => {
    test.fixme(
      true,
      `${PHASE0_DOWNLOAD_STATUS} — sin ruta de descubrimiento público de releaseId, no relacionado con ` +
        'AUTHORITY_BOUNDARY.md. Ver §11/§13 del Requerimiento Integrado y executePhase0Download() en ' +
        'phase0-generic-browser.ts.',
    );
    await synapseRunner.runStep('00c', undefined, () => executePhase0Download());
  });

  test(`paso 00d: ${FLOW_MATRIX.find((s) => s.id === '00d')!.humanActionSimulated}`, async () => {
    test.fixme(
      true,
      'Manual incluso en el flujo real (instalar + `nucleus authority sync`), corre en el sistema operativo ' +
        'del usuario. Nunca fue responsabilidad de Playwright; se deja documentado acá, no implementado.',
    );
    // Sin punto de inserción — ver flow-matrix.ts.
  });
});
