import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Static } from '@sinclair/typebox';

import { CreateMandateBody } from '../schemas/create-mandate.schema';
import { mandateDir, mandateStatePath, type MandateFsContext } from '../../utils/mandate-paths';
import { publishMandateEvent } from '../../server/mandate-event-publisher';
import { resolveOrg } from '../../utils/org-resolver';

/**
 * Handler de `POST /mandates`, discriminado por `mandateType`.
 * 
 * REESCRITURA: Este handler ya no depende de Temporal. Escribe el artefacto
 * inicial en disco y notifica al bus de eventos para que el watcher de Nucleus (Go)
 * tome el control.
 */
export async function createMandateHandler(
  request: FastifyRequest<{ Body: Static<typeof CreateMandateBody> }>,
  reply: FastifyReply,
): Promise<void> {
  const { body } = request;

  // Si el schema permite mandateId opcional, lo usamos; si no, generamos uno.
  // Nota: Si el punto 3 (schema) no está aplicado, TS podría quejarse aquí de que 
  // mandateId no existe en 'standard'.
  const mandateId = (body as any).mandateId ?? randomUUID();

  const bloomBase =
    process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share', 'BloomNucleus');
  const workspacePath = process.env.BLOOM_NUCLEUS_PATH!;

  if (!workspacePath) {
    return reply.code(500).send({
      error: 'ENV_CONFIG_MISSING',
      detail: 'BLOOM_NUCLEUS_PATH no está definida',
    });
  }

  const org = await resolveOrg(bloomBase);
  const fsCtx: MandateFsContext = { workspacePath, org };
  const dir = mandateDir(fsCtx, mandateId);

  await mkdir(dir, { recursive: true });

  // --- RAMA STANDARD ---
  if (body.mandateType === 'standard') {
    const draft = {
      mandateId,
      mandateType: 'standard' as const,
      project: body.project,
      name: body.name,
      objective: body.objective,
      currentStatus: 'draft' as const,
      createdAt: new Date().toISOString(),
    };

    await writeFile(path.join(dir, 'mandate_draft.json'), JSON.stringify(draft, null, 2));

    // CORRECCIÓN PUNTO 8: Ahora con 2 argumentos y nombre de evento consistente
    publishMandateEvent('mandate:draft:created', {
      mandateId,
      projectName: body.project,
      mandateType: 'standard',
    });

    return reply.code(202).send({ mandateId, status: 'draft' });
  }

  // --- RAMA GENESIS / DOMAIN_EXPANSION ---
  const statePath = mandateStatePath(fsCtx, mandateId);

  if (existsSync(statePath)) {
    return reply.code(409).send({
      error: 'MANDATE_ID_COLLISION',
      detail: `mandateId ${mandateId} ya existe — reintentar la creación`,
    });
  }

  const mandateState = {
    status: 'building' as const,
    currentPhase: 'ingest' as const,
    phases: {
      ingest: { status: 'pending' as const },
      cluster: { status: 'pending' as const },
      validate: {
        status: 'pending' as const,
        humanSync: { candidateDomains: [] as string[] },
      },
    },
  };

  try {
    await writeFile(statePath, JSON.stringify(mandateState, null, 2), {
      encoding: 'utf-8',
      flag: 'wx', // 'wx' falla si el archivo ya existe
    });
  } catch (err) {
    request.log.error({ err, mandateId }, 'Fallo al inicializar mandate_state.json en disco');
    return reply.code(500).send({
      error: 'MANDATE_STATE_WRITE_FAILED',
      detail: `No se pudo escribir mandate_state.json para ${mandateId}`,
    });
  }

  // Notifica al Control Plane que el archivo está listo.
  // Nucleus (Go) reaccionará a este evento iniciando el proceso.
  publishMandateEvent('mandate:genesis:initiated', {
    mandateId,
    projectName: body.project,
    source: (body as any).source, // 'source' existe en genesis/domain_expansion
    initiatedAt: new Date().toISOString(),
  });

  return reply.code(202).send({ mandateId, status: 'building' });
}