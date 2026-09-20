import { test } from '../fixtures/synapse-runner-fixture';
import { FLOW_MATRIX } from '../../src/config/flow-matrix';
import { PHASE0_SURFACE_STATUS, runPhase0GenericBrowser } from '../../src/surfaces/phase0-generic-browser';

/**
 * Pasos 00a-00d (Fase 0, server-side) de la Matriz de Flujo completa — ver
 * `src/config/flow-matrix.ts`. Este archivo existe para dejar el punto de
 * inserción de la Superficie 0 LISTO Y MARCADO en la suite ejecutable, no
 * para correr nada todavía.
 *
 * `test.fixme(...)` en vez de borrar o comentar el bloque: así
 * `npx playwright test --list` sigue mostrando estos 4 pasos como
 * pendientes explícitos, en vez de que desaparezcan silenciosamente del
 * inventario de la suite.
 *
 * NO sacar el `.fixme` hasta que:
 *   1. José resuelva la Sección 14.1 del Requerimiento Integrado (¿aplica
 *      AUTHORITY_BOUNDARY.md §1? — ver el comentario completo en
 *      src/surfaces/phase0-generic-browser.ts, que es donde va la
 *      implementación real).
 *   2. Se resuelva, aunque sea parcialmente, la Sección 14.3 (de dónde
 *      arranca Fase 0 sin una landing pública confirmada — paso 00c en
 *      particular depende de esto).
 */

test.describe('synapse-runner — Fase 0 server-side (00a-00d) — STUB, no implementado', () => {
  test.fixme(
    true,
    `Superficie 0 (${PHASE0_SURFACE_STATUS}) — pendiente decisión de José, Requerimiento Integrado §14.1. ` +
      'Ver src/surfaces/phase0-generic-browser.ts para el punto de inserción y las dos opciones presentadas.',
  );

  for (const step of FLOW_MATRIX.filter((s) => s.phase === 'fase0-server')) {
    test(`paso ${step.id}: ${step.humanActionSimulated}`, async ({ synapseRunner }) => {
      // Punto de inserción único para las 4 sub-etapas de Fase 0. Se
      // resuelve vía runPhase0GenericBrowser() adentro de runStep() — hoy
      // esa función SIEMPRE lanza (ver phase0-generic-browser.ts), así que
      // este test queda en fixme por diseño hasta que exista una
      // implementación real que reemplace ese stub.
      await synapseRunner.runStep(step.id, undefined, () => runPhase0GenericBrowser(synapseRunner.bus));
    });
  }
});
