import type { DiagnosticBus } from '../diagnostics/diagnostic-bus';
import { runSubmitContingency } from '../diagnostics/layer4-cli-contingency';
import { env } from '../config/env';
import type { CliSubmitResultEvent } from '../diagnostics/types';

/**
 * Superficie 4 de 5 — "Proceso CLI como testigo, no como UI" (Sección 4,
 * punto 4 del dossier / §7 del Requerimiento Integrado). Paso
 * 06-contingencia de la Matriz de Flujo completa (`src/config/flow-matrix.ts`).
 * La Superficie 0 (stub, Fase 0 server-side) es la única de las 5 que no
 * corre en este spec — ver `src/surfaces/phase0-generic-browser.ts`.
 *
 * El Submit Simulator UI-driven NO existe todavía (Sección 2C — PENDING /
 * FEATURE EN DISEÑO). Este módulo es DELIBERADAMENTE el único punto de
 * inserción para ese futuro módulo: cuando exista, debería reemplazar la
 * llamada a runSubmitTestimony() por la interacción DOM real, sin tocar el
 * resto del Runner (el diagnostic bus / correlator ya esperan un evento
 * 'cli_submit_result' con este shape).
 *
 * IMPORTANTE (Sección 4, punto 4 / Sección 2C): todo resultado de este
 * módulo debe etiquetarse en el reporte final como fuera de banda / no
 * representativo del objetivo "100% UI-driven" — eso lo hace
 * runner/synapse-runner.ts al armar el reporte agregado, no este módulo.
 */

export async function runSubmitTestimony(
  bus: DiagnosticBus,
  intentId: string,
): Promise<CliSubmitResultEvent> {
  return runSubmitContingency(bus, {
    brainBin: env.brainCliBin,
    intentId,
  });
}

/** Marcador que el reporte agregado usa para no contaminar la métrica "100% UI-driven". */
export const SUBMIT_SIMULATOR_STATUS = 'PENDING_FEATURE_EN_DISENO' as const;
