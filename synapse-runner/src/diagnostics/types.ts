/**
 * Tipos compartidos del sistema de observabilidad de synapse-runner.
 *
 * Principio de diseño (Sección 6 del dossier): el pipeline tiene 4 sistemas
 * de eventos independientes y no correlacionados entre sí. Cada capa emite
 * sus propios eventos "crudos" a través del DiagnosticBus; el Correlator
 * los agrupa por identificador de correlación en un bundle de diagnóstico
 * por paso, tal como especifica la Sección 6 ("Correlación cruzada").
 */

export type DiagnosticLayer = 'companion' | 'dom_injection' | 'eventbus' | 'cli_contingency';

export interface DiagnosticEventBase {
  layer: DiagnosticLayer;
  capturedAt: number;
  /** commandId/mandateId (Companion), intent_id (CLI), o correlación temporal (EventBus) */
  correlationId?: string;
}

// ---------------------------------------------------------------------------
// Capa 1 — Companion (Port directo, background-companion.js no publica al bridge)
// ---------------------------------------------------------------------------

export interface CompanionFailureEvent extends DiagnosticEventBase {
  layer: 'companion';
  kind: 'companion_failure';
  commandId?: string;
  mandateId?: string;
  /**
   * reason puede incluir 'ENGINE_RESPONSE_ERROR', que NO está documentado en
   * knownReasons de companionProtocol.js v2.0.0 (Sección 7, punto 5). El
   * Runner debe tolerarlo igual — ver companion-panel.ts.
   */
  reason: string;
}

export interface CompanionDisconnectedEvent extends DiagnosticEventBase {
  layer: 'companion';
  kind: 'companion_disconnected';
}

export interface CompanionStatusEvent extends DiagnosticEventBase {
  layer: 'companion';
  kind: 'companion_status';
  status: 'SLEEPING' | 'WAKING' | 'READY' | 'BUSY' | 'DISCONNECTED';
}

/** REPORT_RESULT — el motor (Gemini) terminó de escribir y el background lo capturó con éxito. */
export interface CompanionResultEvent extends DiagnosticEventBase {
  layer: 'companion';
  kind: 'companion_result';
  commandId?: string;
  mandateId?: string;
}

export type CompanionDiagnosticEvent =
  | CompanionFailureEvent
  | CompanionDisconnectedEvent
  | CompanionStatusEvent
  | CompanionResultEvent;

// ---------------------------------------------------------------------------
// Capa 2 — Inyección DOM en Gemini (3 modos de falla, no un "falló" genérico)
// ---------------------------------------------------------------------------

export type DomInjectionFailureMode =
  | 'input_not_found' // ENGINE_INJECTION_FAILED, reason INPUT_NOT_FOUND — selector de input roto
  | 'engine_response_error' // ENGINE_INJECTION_FAILED, reason ENGINE_RESPONSE_ERROR — rate limit / bloqueo / red
  | 'silent_hang'; // nada llega, vence RUNNER_WATCHDOG_MS — el timeout interno también falló

export interface DomInjectionFailedEvent extends DiagnosticEventBase {
  layer: 'dom_injection';
  kind: 'dom_injection_failed';
  mode: DomInjectionFailureMode;
  rawReason?: string;
}

export interface DomInjectionSucceededEvent extends DiagnosticEventBase {
  layer: 'dom_injection';
  kind: 'dom_injection_succeeded';
}

export type DomInjectionDiagnosticEvent = DomInjectionFailedEvent | DomInjectionSucceededEvent;

// ---------------------------------------------------------------------------
// Capa 3 — Debug Panel / EventBus (synapse-simulator.html, WS :4124)
// ---------------------------------------------------------------------------

export interface EventBusTraceEvent extends DiagnosticEventBase {
  layer: 'eventbus';
  kind: 'eventbus_trace';
  category: string; // 'sentinel' | 'brain' | 'synapse' | otra (ver Sección 7 #4)
  eventName: string;
  data: unknown;
  profileId?: string;
}

export type EventBusDiagnosticEvent = EventBusTraceEvent;

// ---------------------------------------------------------------------------
// Capa 4 — Proceso CLI de contingencia (brain intent submit)
// ---------------------------------------------------------------------------

export type CliFailureClassification =
  | 'ton_serialization_error' // ValueError / FileNotFoundError
  | 'tcp_bridge_unreachable' // ConnectionError / TimeoutError (127.0.0.1:5678)
  | 'unknown';

export interface CliSubmitResultEvent extends DiagnosticEventBase {
  layer: 'cli_contingency';
  kind: 'cli_submit_result';
  exitCode: number | null;
  stdout: string;
  stderr: string;
  failed: boolean;
  classifiedAs?: CliFailureClassification;
  intentId?: string;
}

export type CliDiagnosticEvent = CliSubmitResultEvent;

// ---------------------------------------------------------------------------
// Unión + bundle de correlación
// ---------------------------------------------------------------------------

export type DiagnosticEvent =
  | CompanionDiagnosticEvent
  | DomInjectionDiagnosticEvent
  | EventBusDiagnosticEvent
  | CliDiagnosticEvent;

export type LayerStatus =
  | { status: 'not_applicable' }
  | { status: 'no_events_received' }
  | { status: string; [k: string]: unknown };

export interface DiagnosticBundle {
  step: string;
  startedAt: string;
  finishedAt?: string;
  companion_layer: LayerStatus;
  dom_injection_layer: LayerStatus;
  eventbus_layer: LayerStatus;
  cli_layer: LayerStatus;
  /** true si CUALQUIER capa reportó falla explícita */
  failed: boolean;
  /** diagnóstico legible, apuntando a la capa específica que falló — nunca "step failed" genérico */
  diagnosis: string;
}
