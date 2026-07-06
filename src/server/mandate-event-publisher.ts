import { WebSocketManager } from './WebSocketManager';
import type { WsEventMap, WsEventName } from '../types/ws-events';

/**
 * Único punto de emisión para eventos de Mandate. Garantiza que TODO evento
 * de Mandate sale por los dos canales simultáneamente:
 *
 *  1. broadcast(event, data)              → shape plano { event, data }
 *     Consumidor: Conductor / VS Code Plugin, vía WsEventMap tipado.
 *     Este es el canal que Fase 3 (human sync) necesita para renderizar
 *     la pantalla real de confirmación de dominios con tipos exactos.
 *
 *  2. broadcastSystemEvent(category, event, data) → shape { type:'system:event', payload }
 *     Consumidor: debug.html (Control Plane Debug Panel).
 *     Este es puramente observabilidad — nadie debería depender de este
 *     shape para lógica de negocio real.
 *
 * Restringido a las keys de WsEventMap que empiezan con 'mandate:' —
 * si en algún momento se agrega un evento fuera de ese namespace acá,
 * TypeScript lo va a rechazar en tiempo de compilación.
 *
 * Nota de ubicación: este archivo vive físicamente en
 * `src/server/mandate-event-publisher.ts`, junto a `WebSocketManager.ts`
 * (mismo directorio) — por eso el import es relativo local (`./WebSocketManager`)
 * y no vía `out/`. El import de `ws-events` sube un nivel a `src/types/`.
 */
type MandateEventName = Extract<WsEventName, `mandate:${string}`>;

export function publishMandateEvent<E extends MandateEventName>(
  event: E,
  data: WsEventMap[E],
): void {
  const wsManager = WebSocketManager.getInstance();

  // Canal 1 — Conductor / Plugin, tipado, plano.
  wsManager.broadcast(event, data);

  // Canal 2 — Debug panel, envuelto, categoría fija 'mandate'.
  // mandateId siempre está presente en los payloads de mandate — se usa
  // también como pseudo profile_id para que el drawer de detalle del panel
  // tenga algo que mostrar en esa columna (debug.html trunca a 8 chars).
  wsManager.broadcastSystemEvent('mandate', event, {
    ...data,
    profile_id: (data as { mandateId?: string }).mandateId ?? null,
  });
}
