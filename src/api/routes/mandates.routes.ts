import type { FastifyInstance } from 'fastify';

import { CreateMandateBody } from '../schemas/create-mandate.schema';
import { makeAssertBaseGenesisCompletedIfApplicable } from '../hooks/assert-base-genesis-completed.hook';
import { createMandateHandler } from '../handlers/create-mandate.handler';
import type { MandateFsContext } from '../../utils/mandate-paths';

export interface RegisterMandateRoutesDeps {
  fsCtx: MandateFsContext;
}

/**
 * Registra `POST /mandates` (§5.1). Deliberadamente NO registra acá
 * `genesis domains list|confirm|reject`, `pause`, `resume`, `status` —
 * quedan fuera del pedido puntual de esta tarea (A, B, C de creación).
 *
 * NOTA: ya no recibe temporalClient/createStandardMandate/publishMandateEvent
 * como deps — el handler reescrito (create-mandate.handler.ts) los resuelve
 * todos internamente (imports directos + env vars). Ver JSDoc del handler.
 *
 * NOTA (fix Swagger def-0/def-1/def-2): StandardCreateBody, GenesisCreateBody
 * y DomainExpansionCreateBody ya NO se registran acá vía fastify.addSchema().
 * Se registran una sola vez en server.ts, sobre el fastify raíz (mismo scope
 * donde vive el plugin de swagger) — ver el comentario ahí para el detalle
 * de por qué registrarlos en esta instancia hija rompía la resolución de
 * $ref en el spec de OpenAPI aunque Ajv validara bien en runtime.
 */
export function registerMandateRoutes(fastify: FastifyInstance, deps: RegisterMandateRoutesDeps): void {
  const assertBaseGenesisCompletedIfApplicable = makeAssertBaseGenesisCompletedIfApplicable(deps.fsCtx);

  fastify.post(
    '/mandates',
    {
      schema: {
        tags: ['mandates'],
        description: 'Crea un mandate (standard | genesis | domain_expansion). Escribe el artefacto inicial en disco y notifica al watcher de Nucleus.',
        body: CreateMandateBody,
        response: {
          202: {
            type: 'object',
            properties: {
              mandateId: { type: 'string' },
              status: { type: 'string', enum: ['draft', 'building'] },
            },
          },
          409: {
            type: 'object',
            properties: {
              error: { type: 'string' },
              detail: { type: 'string' },
            },
          },
          500: {
            type: 'object',
            properties: {
              error: { type: 'string' },
              detail: { type: 'string' },
            },
          },
        },
      },
      preHandler: [assertBaseGenesisCompletedIfApplicable],
    },
    createMandateHandler,
  );
}
