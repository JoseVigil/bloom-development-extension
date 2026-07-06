import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { FastifyReply, FastifyRequest } from 'fastify';

import type { CreateMandateBodyT } from '../schemas/create-mandate.schema';
import { isDomainExpansionCreate } from '../schemas/create-mandate.schema';
import { mandateJsonPath, type MandateFsContext } from '../../utils/mandate-paths';
import type { SignedMandateSummary } from '../../types/gen-state.types';

/**
 * §5.2 — `--base-genesis` apunta a un mandate real, firmado y `completed`.
 * Esto es semántico contra el filesystem, no estructural: JSON Schema no
 * puede expresarlo, así que va en un preHandler de Fastify.
 *
 * Restricciones que resuelve, en orden (cada una es un 422 distinto para
 * que el CLI pueda dar un mensaje accionable en vez de un 400 genérico):
 *   1. `mandate.json` de `baseGenesis` debe existir → si no, o está en
 *      'building' (solo gen_state.json) o el id no existe.
 *   2. Su `mandateType` debe ser 'genesis' — explícitamente NO se acepta
 *      encadenar sobre otro `domain_expansion` (ver D-7 en §8: esto es una
 *      decisión tomada, no un descuido; hoy el modelo de dominios es una
 *      lista plana anclada a un único genesis raíz, no un árbol).
 *   3. Su `currentStatus` debe ser 'completed' — firmado pero todavía en
 *      Fase 4 (running) no habilita, porque `cluster` en §1.3 necesita el
 *      set final de dominios materializados del genesis base para poder
 *      distinguir "dominio nuevo" de "extensión".
 *
 * No es responsabilidad de este hook validar `mandateType !== 'domain_expansion'`
 * (early return) — eso ya lo filtra el discriminador de TypeBox antes de
 * llegar acá; el early return de abajo es solo para el caso `standard`/`genesis`,
 * donde este hook no tiene nada que chequear.
 */
export function makeAssertBaseGenesisCompletedIfApplicable(fsCtx: MandateFsContext) {
  return async function assertBaseGenesisCompletedIfApplicable(
    request: FastifyRequest<{ Body: CreateMandateBodyT }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { body } = request;

    if (!isDomainExpansionCreate(body)) return;

    const baseId = body.baseGenesis;
    const basePath = mandateJsonPath(fsCtx, baseId);

    if (!existsSync(basePath)) {
      return reply.code(422).send({
        error: 'BASE_GENESIS_NOT_FOUND',
        detail: `mandate.json no existe para ${baseId} — ¿está todavía en 'building'?`,
      });
    }

    let base: SignedMandateSummary;
    try {
      base = JSON.parse(await readFile(basePath, 'utf-8')) as SignedMandateSummary;
    } catch (err) {
      // mandate.json corrupto o ilegible — esto es un fallo de integridad
      // del filesystem, no un input inválido del usuario, así que no es 422.
      request.log.error({ err, baseId }, 'No se pudo parsear mandate.json de baseGenesis');
      return reply.code(500).send({
        error: 'BASE_GENESIS_UNREADABLE',
        detail: `mandate.json de ${baseId} existe pero no se pudo leer/parsear`,
      });
    }

    if (base.mandateType !== 'genesis') {
      return reply.code(422).send({
        error: 'BASE_GENESIS_WRONG_TYPE',
        detail: `${baseId} es mandateType='${base.mandateType}', se requiere 'genesis'`,
        // ver D-7 en §8 — decisión explícita, no descuido
      });
    }

    if (base.currentStatus !== 'completed') {
      return reply.code(422).send({
        error: 'BASE_GENESIS_NOT_COMPLETED',
        detail: `${baseId} está en currentStatus='${base.currentStatus}', se requiere 'completed'`,
      });
    }

    // Válido — no se muta el request; el handler vuelve a resolver
    // `baseGenesis` si necesita datos adicionales (p.ej. dominios existentes
    // para el input de `cluster`, §1.3).
  };
}
