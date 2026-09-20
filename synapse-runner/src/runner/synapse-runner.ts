import { DiagnosticBus } from '../diagnostics/diagnostic-bus';
import { DiagnosticReporter } from '../diagnostics/reporter';
import { StepDiagnosticSession } from '../diagnostics/correlator';
import { attachEventBusListener, waitForEventBusOpen, type EventBusListenerHandle } from '../diagnostics/layer3-eventbus-ws';
import { env } from '../config/env';
import type { DiagnosticBundle } from '../diagnostics/types';
import { KNOWN_LIMITATION_FOUNDER_ONLY } from '../config/flow-matrix';

/**
 * SynapseRunner — orquestador central.
 *
 * Implementa el principio de diseño de la Sección 6 de forma estructural
 * (consigna punto 4: "como parte estructural del Runner, no como un
 * añadido posterior"): CUALQUIER paso de la Matriz de Flujo completa
 * (`src/config/flow-matrix.ts`, `FLOW_MATRIX` — Requerimiento Integrado §6,
 * renumera el §3 del dossier original) se ejecuta envuelto en runStep(),
 * que abre una StepDiagnosticSession antes de tocar ninguna superficie y la
 * cierra después — así que aunque el spec de Playwright en sí no le preste
 * atención a diagnósticos, el bundle de correlación de 4 capas se produce
 * igual, para CADA paso, desde el primer commit. Esto vale también para los
 * pasos 00a-00d de Fase 0 (server-side) cuando dejen de ser stub — ver
 * tests/e2e/phase0-server-onboarding.spec.ts.
 */
export class SynapseRunner {
  readonly bus = new DiagnosticBus();
  private readonly reporter = new DiagnosticReporter();
  private eventBusHandle: EventBusListenerHandle | undefined;
  private readonly aggregateSteps: DiagnosticBundle[] = [];

  async start(): Promise<void> {
    // Capa 3 se conecta apenas arranca el Runner — es la única capa que no
    // depende de que ninguna superficie UI esté abierta todavía, y
    // queremos capturar tráfico del EventBus desde el instante cero.
    this.eventBusHandle = attachEventBusListener(this.bus, env.eventBusWsUrl);
    try {
      await waitForEventBusOpen(this.eventBusHandle, 10_000);
    } catch (err) {
      // No abortamos: un EventBus caído al arrancar es un hallazgo de
      // diagnóstico (lo va a reflejar cada bundle como
      // eventbus_layer: { status: 'no_events_received' }), no un motivo
      // para no poder correr el resto de la suite.
      // eslint-disable-next-line no-console
      console.warn(`⚠️  [synapse-runner] Capa 3 (EventBus) no conectó al arrancar: ${(err as Error).message}`);
    }
  }

  async stop(): Promise<void> {
    this.eventBusHandle?.close();
    const summary = this.buildFinalSummary();
    // eslint-disable-next-line no-console
    console.log(summary);
  }

  /**
   * Envuelve UN paso de la Matriz de Flujo (Sección 3) en una sesión de
   * diagnóstico correlacionada. `correlationId` debe ser el mismo
   * commandId/mandateId/intent_id que la acción real usa, para que el
   * Correlator pueda cruzar las 4 capas.
   */
  async runStep<T>(step: string, correlationId: string | undefined, fn: () => Promise<T>): Promise<T> {
    const session = new StepDiagnosticSession(this.bus, step, correlationId);
    try {
      const result = await fn();
      const bundle = session.finish();
      this.aggregateSteps.push(bundle);
      this.reporter.record(bundle);
      return result;
    } catch (err) {
      const bundle = session.finish();
      bundle.failed = true;
      bundle.diagnosis = `${bundle.diagnosis} | Excepción no capturada en el paso: ${(err as Error).message}`;
      this.aggregateSteps.push(bundle);
      this.reporter.record(bundle);
      throw err;
    }
  }

  private buildFinalSummary(): string {
    const total = this.aggregateSteps.length;
    const failed = this.aggregateSteps.filter((s) => s.failed).length;
    const lines = [
      '',
      '═══════════════════════════════════════════════════════════',
      `  synapse-runner — resumen de corrida (${total} pasos, ${failed} fallidos)`,
      '═══════════════════════════════════════════════════════════',
      ...this.aggregateSteps.map((s) => `  ${s.failed ? '🔴' : '✅'} ${s.step}`),
      '',
      '  ⚠️  Cobertura "100% UI-driven": el paso 06-contingencia_submit_intent',
      '     usa el CLI real (brain intent submit) como testigo fuera de banda,',
      '     NO como interacción UI — no lo cuentes como cobertura UI-driven',
      '     hasta que exista el Submit Simulator (Sección 2C, PENDING).',
      '',
      '  ⚠️  Fase 0 server-side: 00a/00b corren de verdad vía inyección de fixture',
      '     HTTP (AUTHORITY_ALLOW_TEST_FIXTURES=true, sólo backend/.dev.vars) —',
      '     nunca tocan github.com. 00c/00d siguen sin implementar, por motivos',
      '     no relacionados con AUTHORITY_BOUNDARY.md — ver',
      '     tests/e2e/phase0-server-onboarding.spec.ts.',
      '',
      `  ⚠️  Limitación conocida: ${KNOWN_LIMITATION_FOUNDER_ONLY}`,
      '═══════════════════════════════════════════════════════════',
      '',
    ];
    return lines.join('\n');
  }
}
