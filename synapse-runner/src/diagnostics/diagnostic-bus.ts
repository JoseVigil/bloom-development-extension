import { EventEmitter } from 'node:events';
import type { DiagnosticEvent } from './types';

/**
 * DiagnosticBus — el punto de encuentro único de las 4 capas de observabilidad.
 *
 * Cada listener de capa (Companion Port, watchdog DOM, WebSocket EventBus,
 * proceso CLI) emite acá sus eventos crudos con timestamp propio. El
 * Correlator (correlator.ts) los agrupa por paso/correlationId en el bundle
 * de diagnóstico que especifica la Sección 6.
 *
 * Deliberadamente NO hace correlación acá — este bus es solo transporte +
 * buffer, para que cada capa pueda instrumentarse de forma completamente
 * independiente sin acoplarse a la lógica de correlación.
 */
export class DiagnosticBus extends EventEmitter {
  private readonly history: DiagnosticEvent[] = [];

  emitDiagnostic(event: DiagnosticEvent): void {
    this.history.push(event);
    this.emit('event', event);
    this.emit(event.kind, event);
  }

  /** Todo lo capturado hasta ahora, en orden cronológico. */
  getHistory(): readonly DiagnosticEvent[] {
    return this.history;
  }

  /** Eventos dentro de una ventana temporal — usado por el Correlator para Capa 3 (EventBus). */
  getEventsInWindow(startMs: number, endMs: number): DiagnosticEvent[] {
    return this.history.filter((e) => e.capturedAt >= startMs && e.capturedAt <= endMs);
  }

  /** Eventos de una capa específica dentro de una ventana temporal. */
  getLayerEventsInWindow(
    layer: DiagnosticEvent['layer'],
    startMs: number,
    endMs: number,
  ): DiagnosticEvent[] {
    return this.getEventsInWindow(startMs, endMs).filter((e) => e.layer === layer);
  }

  reset(): void {
    this.history.length = 0;
    this.removeAllListeners();
  }
}
