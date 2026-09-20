import type { Page } from '@playwright/test';
import type { DiagnosticBus } from './diagnostic-bus';
import type { CompanionDiagnosticEvent } from './types';

/**
 * Capa 1 — Companion (`REPORT_ERROR` vía Port directo).
 *
 * background-companion.js NO publica al bridge centralizado (:48215/:4124) —
 * ver Sección 2D / 6 del dossier. El Runner debe abrir su propia conexión al
 * Port ('companion-link'), en paralelo a la que abre el Side Panel real.
 *
 * chrome.runtime.connect() solo existe en páginas con acceso a las APIs de
 * extensión, así que `page` debe ser una página en el origen
 * chrome-extension://<id>/... (ver surfaces/companion-panel.ts, que abre una
 * página "testigo" separada del Side Panel real para este propósito).
 *
 * Riesgo documentado en la Sección 6: dos Ports conectados simultáneamente
 * (Side Panel real + Runner) reciben el mismo broadcast(). Por eso el
 * caller debe pasar `ownCommandIds` — un Set vivo de commandId/mandateId que
 * el propio Runner generó — para filtrar qué eventos son "suyos".
 */

interface RawPortMessage {
  event: string;
  commandId?: string;
  mandateId?: string;
  reason?: string;
  status?: string;
}

export interface CompanionPortHandle {
  /** Cierra el Port desde el lado Node (best-effort; el listener del browser también se limpia). */
  dispose(): Promise<void>;
}

const BRIDGE_FN = '__synapseRunnerEmitCompanionPortMessage';

export async function attachCompanionPortListener(
  page: Page,
  bus: DiagnosticBus,
  ownCommandIds: Set<string>,
): Promise<CompanionPortHandle> {
  await page.exposeFunction(BRIDGE_FN, (msg: RawPortMessage) => {
    handleRawMessage(msg, bus, ownCommandIds);
  });

  await page.evaluate((bridgeFnName) => {
    // Código ejecutado DENTRO del contexto de la página de extensión.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    if (w.__synapseRunnerCompanionPort) {
      // Ya conectado (p.ej. re-evaluación entre pasos) — no duplicar.
      return;
    }
    const port = chrome.runtime.connect({ name: 'companion-link' });
    w.__synapseRunnerCompanionPort = port;

    port.onMessage.addListener((msg: RawPortMessage) => {
      // @ts-expect-error — bridge inyectado por page.exposeFunction
      window[bridgeFnName](msg);
    });

    port.onDisconnect.addListener(() => {
      // @ts-expect-error — bridge inyectado por page.exposeFunction
      window[bridgeFnName]({ event: 'PORT_DISCONNECTED' });
    });
  }, BRIDGE_FN);

  return {
    async dispose() {
      await page
        .evaluate(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const w = window as any;
          w.__synapseRunnerCompanionPort?.disconnect();
          delete w.__synapseRunnerCompanionPort;
        })
        .catch(() => {
          /* la página puede haberse cerrado ya — best effort */
        });
    },
  };
}

function handleRawMessage(
  msg: RawPortMessage,
  bus: DiagnosticBus,
  ownCommandIds: Set<string>,
): void {
  const capturedAt = Date.now();

  if (msg.event === 'PORT_DISCONNECTED') {
    return;
  }

  if (msg.event === 'REPORT_ERROR') {
    // Filtro de propiedad: no asumir que todo lo que llega por el Port es
    // nuestro — el Side Panel real puede estar conectado simultáneamente.
    const owned =
      (msg.commandId && ownCommandIds.has(msg.commandId)) ||
      (msg.mandateId && ownCommandIds.has(msg.mandateId));
    if (!owned) return;

    const event: CompanionDiagnosticEvent = {
      layer: 'companion',
      kind: 'companion_failure',
      commandId: msg.commandId,
      mandateId: msg.mandateId,
      // Tolerar reason='ENGINE_RESPONSE_ERROR' aunque no esté en knownReasons
      // documentado de companionProtocol.js v2.0.0 (Sección 7, punto 5).
      reason: msg.reason ?? 'UNKNOWN_REASON',
      capturedAt,
      correlationId: msg.commandId ?? msg.mandateId,
    };
    bus.emitDiagnostic(event);
    return;
  }

  if (msg.event === 'ENGINE_STATUS_CHANGED') {
    if (msg.status === 'DISCONNECTED') {
      bus.emitDiagnostic({
        layer: 'companion',
        kind: 'companion_disconnected',
        capturedAt,
      });
    } else if (msg.status) {
      bus.emitDiagnostic({
        layer: 'companion',
        kind: 'companion_status',
        status: msg.status as 'SLEEPING' | 'WAKING' | 'READY' | 'BUSY' | 'DISCONNECTED',
        capturedAt,
      });
    }
    return;
  }

  if (msg.event === 'REPORT_RESULT') {
    const owned =
      (msg.commandId && ownCommandIds.has(msg.commandId)) ||
      (msg.mandateId && ownCommandIds.has(msg.mandateId));
    if (!owned) return;

    bus.emitDiagnostic({
      layer: 'companion',
      kind: 'companion_result',
      commandId: msg.commandId,
      mandateId: msg.mandateId,
      capturedAt,
      correlationId: msg.commandId ?? msg.mandateId,
    });
  }
}
