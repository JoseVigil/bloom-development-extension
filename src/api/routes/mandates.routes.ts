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
 */
export function registerMandateRoutes(fastify: FastifyInstance, deps: RegisterMandateRoutesDeps): void {
  const assertBaseGenesisCompletedIfApplicable = makeAssertBaseGenesisCompletedIfApplicable(deps.fsCtx);

  fastify.post(
    '/mandates',
    {
      schema: { body: CreateMandateBody },
      preHandler: [assertBaseGenesisCompletedIfApplicable],
    },
    createMandateHandler,
  );
}