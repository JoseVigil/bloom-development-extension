// src/api/routes/internal.routes.ts
//
// Rutas internas del Control Plane — no expuestas en Swagger público.
//
// Canal: background.js → POST /api/internal/system-event → WebSocketManager → debug panel
//
// Propósito: recibir eventos del harness/background.js (IonPump flows, synapse events
// como GITHUB_PAT_DETECTED, handshake confirmations, etc.) y forwardearlos al
// WebSocketManager para que aparezcan en el feed del debug panel (debug.html).
//
// Este endpoint es fire-and-forget desde el lado del cliente:
// background.js lo llama sin await y captura silenciosamente cualquier error.
// Por eso siempre devuelve 200 salvo body malformado (400).
//
// Registro en server.ts:
//   await fastify.register(internalRoutes, { prefix: '/api/internal' });

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import type { WebSocketManager } from '../../server/WebSocketManager';

// ─── Tipos ───────────────────────────────────────────────────────────────────

/**
 * Categorías de eventos que background.js puede enviar.
 * Deben coincidir con los valores usados en forwardToDebugPanel() del background.
 *
 *   'synapse'  — protocolo Synapse (handshake, token PAT, discovery, disconnect)
 *   'sentinel' — extensión Chrome (actuator_ready → EXTENSION_LOADED)
 *   'brain'    — respuestas del host nativo (IonPump flows, profile)
 */
type SystemEventCategory = 'synapse' | 'sentinel' | 'brain';

interface SystemEventBody {
  /** Categoría del evento — usada por el debug panel para filtrar/colorear */
  category: SystemEventCategory;
  /** Nombre del evento, ej: 'GITHUB_PAT_DETECTED', 'ION_FLOW_STARTED' */
  event: string;
  /** Payload libre — nunca debe contener tokens o credenciales completas */
  data?: Record<string, unknown>;
  /** profileId del perfil activo en el momento del evento */
  profile_id?: string | null;
  /** Timestamp Unix en ms — si no viene, se usa Date.now() */
  timestamp?: number;
}

// ─── Plugin ──────────────────────────────────────────────────────────────────

export async function internalRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {

  // Dependencias inyectadas por server.ts vía fastify.decorate('deps', ...)
  // El cast es necesario porque TypeScript no conoce el tipo de la decoración.
  const deps = (fastify as any).deps as { wsManager: WebSocketManager };

  // ─── POST /api/internal/system-event ────────────────────────────────────
  //
  // Recibe un evento de sistema desde background.js y lo forwardea al
  // WebSocketManager para que todos los clientes WebSocket conectados
  // (debug panel, Control Plane UI) lo reciban en tiempo real.
  //
  // Intencionalmente NO está en Swagger — es un canal interno y exponer
  // su schema haría que aparezca en /api/docs, lo que no corresponde.
  //
  // Nota de seguridad: solo escucha en 127.0.0.1 (host: '127.0.0.1' en
  // startAPIServer). No es accesible desde la red externa.

  fastify.post<{ Body: SystemEventBody }>(
    '/system-event',
    {
      schema: {
        // hide: true excluye la ruta de Swagger UI sin deshabilitar la validación.
        hide: true,
        body: {
          type: 'object',
          required: ['category', 'event'],
          properties: {
            category: {
              type: 'string',
              enum: ['synapse', 'sentinel', 'brain']
            },
            event: {
              type: 'string',
              minLength: 1
            },
            data: {
              type: 'object',
              additionalProperties: true
            },
            profile_id: {
              type: ['string', 'null']
            },
            timestamp: {
              type: 'number'
            }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' }
            }
          }
        }
      }
    },
    async (request, reply) => {
      const { category, event, data = {}, profile_id = null, timestamp } = request.body;

      const envelope = {
        type:       'system_event' as const,
        category,
        event,
        data,
        profile_id,
        timestamp:  timestamp ?? Date.now()
      };

      // broadcast() es fire-and-forget — si no hay clientes WS conectados
      // simplemente no pasa nada. No lanzar error al caller.
      try {
        deps.wsManager.broadcast(envelope);
      } catch (broadcastErr) {
        // Loguear pero no propagar — background.js no maneja respuestas de error
        // y un 500 aquí contaminaría silenciosamente el flujo del service worker.
        fastify.log.warn({ err: broadcastErr, envelope }, '[internal] broadcast failed');
      }

      return reply.send({ ok: true });
    }
  );
}
