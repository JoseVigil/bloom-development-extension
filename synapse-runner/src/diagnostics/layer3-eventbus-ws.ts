import WebSocket from 'ws';
import type { DiagnosticBus } from './diagnostic-bus';

/**
 * Capa 3 — Debug Panel / EventBus (`synapse-simulator.html`, Sección 6).
 *
 * Única capa con bridge centralizado ya construido. El Runner se suscribe
 * directamente por WebSocket a ws://localhost:4124, sin scraping del HTML
 * del panel synapse-simulator.html (que solo lo consume visualmente).
 *
 * Categorías conocidas: 'sentinel' | 'brain' | 'synapse'. Sección 7 punto 4
 * queda abierto (no bloqueante): confirmar si existe una categoría de error
 * explícita distinta de esas tres — hasta entonces, esta capa reenvía
 * CUALQUIER categoría recibida al DiagnosticBus (no filtra), y dejamos que
 * el Correlator decida qué es relevante por paso. Ver README.
 */

const KNOWN_CATEGORIES = ['sentinel', 'brain', 'synapse'] as const;

export interface EventBusListenerHandle {
  close(): void;
  readonly ws: WebSocket;
}

export function attachEventBusListener(bus: DiagnosticBus, wsUrl: string): EventBusListenerHandle {
  const ws = new WebSocket(wsUrl);

  ws.on('message', (raw: WebSocket.RawData) => {
    let parsed: { category?: string; event?: string; data?: unknown; profile_id?: string };
    try {
      parsed = JSON.parse(raw.toString());
    } catch {
      // Payload no-JSON del EventBus — se descarta pero no se silencia del
      // todo: el Correlator puede necesitar saber que hubo tráfico no
      // parseable. Lo dejamos como TODO explícito en vez de tragarlo mudo.
      return;
    }

    const { category, event: eventName, data, profile_id: profileId } = parsed;
    if (!category || !eventName) return;

    if (!KNOWN_CATEGORIES.includes(category as (typeof KNOWN_CATEGORIES)[number])) {
      // Categoría no documentada — posible candidato a la "categoría de
      // error explícita" de la Sección 7 punto 4. Se registra igual, con
      // el kind estándar, para no perder la señal.
    }

    bus.emitDiagnostic({
      layer: 'eventbus',
      kind: 'eventbus_trace',
      category,
      eventName,
      data,
      profileId,
      capturedAt: Date.now(),
      correlationId: profileId,
    });
  });

  ws.on('error', (err) => {
    // No relanzamos — un EventBus caído es en sí mismo un hallazgo de
    // diagnóstico, no debe tirar abajo el proceso del Runner.
    bus.emitDiagnostic({
      layer: 'eventbus',
      kind: 'eventbus_trace',
      category: 'runner_internal',
      eventName: 'EVENTBUS_WS_ERROR',
      data: { message: err.message },
      capturedAt: Date.now(),
    });
  });

  return {
    ws,
    close() {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    },
  };
}

export function waitForEventBusOpen(handle: EventBusListenerHandle, timeoutMs = 10_000): Promise<void> {
  if (handle.ws.readyState === WebSocket.OPEN) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`EventBus WS no abrió en ${timeoutMs}ms`)), timeoutMs);
    handle.ws.once('open', () => {
      clearTimeout(timer);
      resolve();
    });
    handle.ws.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
