import type { DiagnosticBus } from './diagnostic-bus';
import type {
  CliDiagnosticEvent,
  CompanionDiagnosticEvent,
  DiagnosticBundle,
  DomInjectionDiagnosticEvent,
  EventBusDiagnosticEvent,
  LayerStatus,
} from './types';
import { describeCliFailure } from './layer4-cli-contingency';

/**
 * Correlator — arma el "bundle de diagnóstico por paso" de la Sección 6.
 *
 * El pipeline tiene 4 sistemas de eventos independientes y no
 * correlacionados entre sí. Este módulo es el único lugar del Runner que
 * los junta, por un identificador común (commandId/mandateId en Companion,
 * ventana temporal + profile_id en el EventBus, intent_id en el CLI) — NO
 * reportando cada capa por separado, tal como exige el dossier.
 *
 * Cada `StepDiagnosticSession` cubre UN paso de la Matriz de Flujo
 * (Sección 3, ej. "06-contingencia_submit_intent", "10_engine_inject") y
 * produce, al finalizar, un DiagnosticBundle con el formato exacto del
 * ejemplo de la Sección 6.
 */
export class StepDiagnosticSession {
  private readonly startedAtMs: number;
  private readonly startedAtIso: string;
  private finished = false;

  constructor(
    private readonly bus: DiagnosticBus,
    private readonly step: string,
    private readonly correlationId?: string,
  ) {
    this.startedAtMs = Date.now();
    this.startedAtIso = new Date(this.startedAtMs).toISOString();
  }

  /** Cierra la ventana temporal del paso y arma el bundle final. */
  finish(finishedAtMs: number = Date.now()): DiagnosticBundle {
    if (this.finished) {
      throw new Error(`StepDiagnosticSession para "${this.step}" ya fue finalizada`);
    }
    this.finished = true;

    const events = this.bus.getEventsInWindow(this.startedAtMs, finishedAtMs);

    const companionLayer = this.summarizeCompanionLayer(events, finishedAtMs);
    const domInjectionLayer = this.summarizeDomInjectionLayer(events, finishedAtMs);
    const eventbusLayer = this.summarizeEventbusLayer(events, finishedAtMs);
    const cliLayer = this.summarizeCliLayer(events, finishedAtMs);

    const failed = [companionLayer, domInjectionLayer, cliLayer].some(
      (l) => 'status' in l && typeof l.status === 'string' && l.status.includes('fail'),
    );

    return {
      step: this.step,
      startedAt: this.startedAtIso,
      finishedAt: new Date(finishedAtMs).toISOString(),
      companion_layer: companionLayer,
      dom_injection_layer: domInjectionLayer,
      eventbus_layer: eventbusLayer,
      cli_layer: cliLayer,
      failed,
      diagnosis: this.buildDiagnosis({ companionLayer, domInjectionLayer, eventbusLayer, cliLayer }),
    };
  }

  private summarizeCompanionLayer(events: ReturnType<DiagnosticBus['getEventsInWindow']>, endMs: number): LayerStatus {
    const relevant = events.filter(
      (e): e is CompanionDiagnosticEvent =>
        e.layer === 'companion' && (this.correlationId ? e.correlationId === this.correlationId : true),
    );
    if (relevant.length === 0) return { status: 'no_events_received' };

    const failure = relevant.find((e) => e.kind === 'companion_failure');
    if (failure && failure.kind === 'companion_failure') {
      return { status: 'failed', reason: failure.reason, commandId: failure.commandId, mandateId: failure.mandateId };
    }
    const disconnected = relevant.find((e) => e.kind === 'companion_disconnected');
    if (disconnected) return { status: 'disconnected_mid_step' };

    const result = relevant.find((e) => e.kind === 'companion_result');
    if (result) return { status: 'result_received' };

    return { status: 'status_events_only', count: relevant.length };
  }

  private summarizeDomInjectionLayer(
    events: ReturnType<DiagnosticBus['getEventsInWindow']>,
    endMs: number,
  ): LayerStatus {
    const relevant = events.filter(
      (e): e is DomInjectionDiagnosticEvent =>
        e.layer === 'dom_injection' && (this.correlationId ? e.correlationId === this.correlationId : true),
    );
    if (relevant.length === 0) return { status: 'not_applicable' };

    const failed = relevant.find((e) => e.kind === 'dom_injection_failed');
    if (failed && failed.kind === 'dom_injection_failed') {
      return { status: `failed_${failed.mode}`, rawReason: failed.rawReason };
    }
    return { status: 'succeeded' };
  }

  private summarizeEventbusLayer(
    events: ReturnType<DiagnosticBus['getEventsInWindow']>,
    endMs: number,
  ): LayerStatus {
    const relevant = events.filter((e): e is EventBusDiagnosticEvent => e.layer === 'eventbus');
    if (relevant.length === 0) return { status: 'no_events_received' };

    const last = relevant[relevant.length - 1];
    return {
      status: `${last.eventName}_seen`,
      category: last.category,
      eventCount: relevant.length,
    };
  }

  private summarizeCliLayer(events: ReturnType<DiagnosticBus['getEventsInWindow']>, endMs: number): LayerStatus {
    const relevant = events.filter(
      (e): e is CliDiagnosticEvent =>
        e.layer === 'cli_contingency' && (this.correlationId ? e.correlationId === this.correlationId : true),
    );
    if (relevant.length === 0) return { status: 'not_applicable' };

    const result = relevant[relevant.length - 1];
    return {
      status: result.failed ? 'failed' : 'succeeded',
      exit_code: result.exitCode,
      stderr: result.stderr || undefined,
      classified_as: result.classifiedAs,
    };
  }

  private buildDiagnosis(layers: {
    companionLayer: LayerStatus;
    domInjectionLayer: LayerStatus;
    eventbusLayer: LayerStatus;
    cliLayer: LayerStatus;
  }): string {
    // Nunca un "step failed" genérico — siempre apuntar a la capa
    // específica, con el trazo crudo adjunto en el bundle.
    if (layers.cliLayer.status === 'failed') {
      const classifiedAs = (layers.cliLayer as { classified_as?: string }).classified_as;
      return describeCliFailure(classifiedAs as Parameters<typeof describeCliFailure>[0]);
    }
    if (typeof layers.domInjectionLayer.status === 'string' && layers.domInjectionLayer.status.startsWith('failed_')) {
      const mode = layers.domInjectionLayer.status.replace('failed_', '');
      return diagnosisForDomMode(mode);
    }
    if (layers.companionLayer.status === 'failed') {
      const reason = (layers.companionLayer as { reason?: string }).reason;
      return `El Companion reportó REPORT_ERROR (reason: ${reason ?? 'desconocido'}) — ver Capa 1 en el bundle crudo.`;
    }
    if (layers.companionLayer.status === 'disconnected_mid_step') {
      return 'El Port del Companion se desconectó a mitad del paso (ENGINE_STATUS_CHANGED: DISCONNECTED) — posible crash del background script o cierre de la tab de Gemini.';
    }
    return 'Sin fallas detectadas en ninguna de las 4 capas correlacionadas para este paso.';
  }
}

function diagnosisForDomMode(mode: string): string {
  switch (mode) {
    case 'input_not_found':
      return "Selector de input roto (reason: INPUT_NOT_FOUND) — Gemini probablemente cambió el DOM del editor. Ver Sección 7 punto 3: los selectores de injectAndObserve() nunca fueron verificados contra el DOM vivo.";
    case 'engine_response_error':
      return 'Bloqueo o error de Gemini (reason: ENGINE_RESPONSE_ERROR) — rate limit, contenido bloqueado, o error de red. No es necesariamente un bug del Runner.';
    case 'silent_hang':
      return 'Cuelgue silencioso: venció RUNNER_WATCHDOG_MS sin REPORT_RESULT ni REPORT_ERROR. El mecanismo de timeout interno de background-companion.js (ENGINE_RESPONSE_TIMEOUT_MS) también falló en dispararse — esto es un hallazgo sobre el propio mecanismo de timeout, no solo sobre el paso de negocio.';
    default:
      return `Falla de inyección DOM no clasificada (modo: ${mode}).`;
  }
}
