import type { FastifyInstance } from 'fastify';

import { CreateMandateBody, StandardCreateBody, GenesisCreateBody, DomainExpansionCreateBody } from '../schemas/create-mandate.schema';
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
 */
export function registerMandateRoutes(fastify: FastifyInstance, deps: RegisterMandateRoutesDeps): void {
  const assertBaseGenesisCompletedIfApplicable = makeAssertBaseGenesisCompletedIfApplicable(deps.fsCtx);

  // Necesario para que los $ref dentro de CreateMandateBody (oneOf +
  // discriminator) resuelvan tanto para Ajv como para el spec de OpenAPI
  // que arma @fastify/swagger. Sin esto, Type.Ref() genera un $ref que
  // apunta a nada y la validación/documentación fallan en silencio.
  fastify.addSchema(StandardCreateBody);
  fastify.addSchema(GenesisCreateBody);
  fastify.addSchema(DomainExpansionCreateBody);

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