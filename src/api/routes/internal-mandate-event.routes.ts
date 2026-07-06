// src/api/routes/internal-mandate-event.routes.ts
import { FastifyPluginAsync } from 'fastify';
import { publishMandateEvent } from '../../server/mandate-event-publisher';
import type { WsEventMap, WsEventName } from '../../types/ws-events';

type MandateEventName = Extract<WsEventName, `mandate:${string}`>;

interface InternalMandateEventBody {
  event: string;
  data: Record<string, unknown>;
}

// FastifyPluginAsync: fastify llega como parámetro del plugin, no como
// import de nivel de módulo. Así es como Fastify inyecta la instancia
// en cualquier archivo de rutas — nunca hay un "fastify" global importable.
const internalMandateEventRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: InternalMandateEventBody }>('/internal/mandate-event', {
    schema: {
      body: {
        type: 'object',
        required: ['event', 'data'],
        properties: {
          event: { type: 'string' },
          data: { type: 'object' },
        },
      },
    },
  }, async (request, reply) => {
    const { event, data } = request.body;

    if (!event.startsWith('mandate:')) {
      return reply.code(400).send({ error: 'event debe empezar con "mandate:"' });
    }

    publishMandateEvent(event as MandateEventName, data as unknown as WsEventMap[MandateEventName]);
    
    return reply.send({ ok: true });
  });
};

export default internalMandateEventRoutes;