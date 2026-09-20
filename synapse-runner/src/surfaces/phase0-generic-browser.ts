/**
 * Superficie 0 — Browser genérico pre-Electron (sin extensión Cortex).
 *
 * STUB DOCUMENTADO — NO FUNCIONAL. No implementar lógica real acá todavía.
 *
 * Cubre, cuando exista, los pasos 00a-00c de la Matriz de Flujo
 * (`src/config/flow-matrix.ts`, `FLOW_MATRIX` con `phase: 'fase0-server'`):
 * registro/login GitHub contra el backend, y descarga del instalador. El
 * paso 00d (instalación + `nucleus authority sync`) corre en el sistema
 * operativo, fuera de cualquier browser — no es responsabilidad de esta
 * superficie ni de Playwright en general.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ ES UN STUB (no lo conviertas en funcional sin lo siguiente)
 * ─────────────────────────────────────────────────────────────────────────
 * El Requerimiento Integrado (§14.1) deja explícitamente sin decidir si
 * `docs/CORTEX/AUTHORITY_BOUNDARY.md` §1 aplica a esta superficie. Esa
 * sección es agnóstica de componente ("aplica igual si el ejecutor es la
 * extensión de Chrome, el backend, o el Cognituum Runner local") pero
 * nunca menciona "arnés de pruebas" como categoría — no decide la pregunta
 * por sí misma. Dos lecturas quedaron presentadas, sin inclinar la balanza,
 * y AMBAS siguen abiertas:
 *
 *   Opción A — Playwright sujeto a la restricción: esta superficie se
 *     detiene en la puerta de GitHub y usa una sesión ya autenticada
 *     inyectada por fixture, nunca un login real automatizado.
 *
 *   Opción B — Playwright fuera de alcance por ser herramienta de QA, no
 *     un componente de producción: se automatizaría un login de prueba
 *     contra una cuenta de test dedicada, con las debidas precauciones de
 *     secreto. Riesgo documentado: si este arnés se reutiliza como base de
 *     un flujo de producto real, la línea entre "sólo QA" y "el sistema" se
 *     vuelve difícil de sostener retroactivamente.
 *
 * Esta decisión es de José, no de esta sesión ni de ninguna futura sesión
 * de implementación por su cuenta. NO tomes partido acá — si estás por
 * escribir código real en este archivo, primero confirmá con José cuál
 * opción rige, y documentá la decisión tomada (con fecha y quién la tomó,
 * al estilo de la decisión ya registrada sobre TenantID en
 * `ownershipcontract/schema.go` — Requerimiento Integrado §3.5) antes de
 * implementar nada.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PUNTO DE INSERCIÓN
 * ─────────────────────────────────────────────────────────────────────────
 * Cuando la decisión de §14.1 se tome, la forma esperada de esta superficie
 * (a confirmar contra el shape real de `attachToCompanionSidePanel` /
 * `connectToDiscovery` en las otras superficies, por consistencia) es:
 *
 *   1. `chromium.launch()` — SIN cargar la extensión Cortex (a diferencia
 *      de `discovery-chromium.ts`, que asume Cortex ya instalada). Ver
 *      dossier/Requerimiento Integrado §7, superficie 0.
 *   2. Navegar a la landing pública de registro — URL/dominio TODAVÍA no
 *      confirmado por José (§13 del Requerimiento Integrado: "no hay
 *      `routes` en `wrangler.jsonc`"; puede que Fase 0 tenga que arrancar
 *      desde una superficie ya autenticada de otro componente en vez de
 *      una landing anónima real — ver §14.3, también pendiente).
 *   3. Ejecutar el paso 00a (registro/login GitHub) — SÓLO bajo la opción
 *      que José elija en §14.1.
 *   4. Ejecutar el paso 00b (autorización GitHub, frontera externa #1 —
 *      ver `EXTERNAL_BOUNDARIES` en flow-matrix.ts).
 *   5. Ejecutar el paso 00c (descarga del instalador) — bloqueado también
 *      por §14.3: sin descubrimiento público de `releaseId`, este paso
 *      puede requerir que el Runner ya conozca un `releaseId` de test en
 *      vez de descubrirlo desde la UI.
 *   6. Cerrar/descartar este browser ANTES de levantar las superficies 1-4
 *      (`electron-conductor.ts`, etc.) — éstas asumen la extensión Cortex
 *      ya instalada, algo que esta superficie explícitamente NO tiene.
 *
 * Observabilidad: la Fase 0 hoy NO tiene una capa de diagnóstico propia
 * (Requerimiento Integrado §14.4 — también pendiente, no bloqueante). Si
 * se implementa antes de que exista una Capa 0 dedicada, esta superficie
 * debería al menos loguear status codes y cuerpos JSON de las respuestas
 * HTTP del backend al DiagnosticBus como un layer ad-hoc, en vez de no
 * reportar nada — pero definir esa Capa 0 formalmente es una decisión de
 * diseño futura, no de esta sesión.
 */

import type { DiagnosticBus } from '../diagnostics/diagnostic-bus';

export const PHASE0_SURFACE_STATUS = 'STUB_PENDING_DECISION_14_1' as const;

/**
 * Punto de entrada esperado de la Superficie 0. Lanza siempre — es
 * deliberado: evita que alguien la llame por error creyendo que ya hace
 * algo. Reemplazar esta función es EXACTAMENTE el punto de inserción
 * descripto arriba, una vez resuelta la Sección 14.1.
 */
export async function runPhase0GenericBrowser(_bus: DiagnosticBus): Promise<never> {
  throw new Error(
    '[phase0-generic-browser] Superficie 0 es un stub — no implementada. ' +
      'Bloqueada por una decisión pendiente de José (Requerimiento Integrado §14.1: ' +
      '¿aplica AUTHORITY_BOUNDARY.md §1 a un arnés de Playwright automatizando login/registro ' +
      'GitHub del backend?). Ver el comentario de este archivo para las dos opciones presentadas ' +
      'y el punto de inserción exacto una vez que se decida.',
  );
}
