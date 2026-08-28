import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
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

  const workspacePath = process.env.BLOOM_NUCLEUS_PATH!;

  if (!workspacePath) {
    return reply.code(500).send({
      error: 'ENV_CONFIG_MISSING',
      detail: 'BLOOM_NUCLEUS_PATH no está definida',
    });
  }

  // resolveOrg hace workspace-scan (sube desde workspacePath buscando
  // .bloom/.nucleus-{slug}/.core/nucleus-config.json), igual que
  // supervisor.LoadNucleusConfig() (Go). Antes se le pasaba `bloomBase`
  // (LOCALAPPDATA / dir de datos de máquina) en vez de `workspacePath`
  // (raíz del workspace) — con eso nunca iba a encontrar `.bloom`, porque
  // esa carpeta vive en el workspace, no en el directorio de datos de la
  // app. Ver org-resolver.ts para el mecanismo completo.
  const org = await resolveOrg(workspacePath);
  // FIX: fsCtx tiene que usar el workspacePath RESUELTO (org.workspacePath),
  // no la variable local `workspacePath` (el env var crudo tal cual llega
  // en BLOOM_NUCLEUS_PATH). resolveOrg() sube directorios desde
  // `workspacePath` hasta encontrar el `.bloom` real (ver findBloomDir en
  // org-resolver.ts) — si el caller pasa un subdirectorio del workspace
  // (ej: la carpeta de un proyecto individual dentro del nucleus, como
  // "sample_project"), `org.workspacePath` puede terminar apuntando más
  // arriba que el `workspacePath` crudo.
  //
  // Antes de este fix, fsCtx se armaba con el `workspacePath` crudo, así
  // que mandateDir()/mandatesRoot() (mandate-paths.ts) escribían el
  // mandate bajo `<workspacePath crudo>/.bloom/.nucleus-{org}/.mandates/`
  // — un `.bloom` que puede no existir todavía (mkdir recursive lo crea
  // igual, sin pasar por buildOrgContext ni por .core/.nucleus-config.json).
  // Eso deja un `.bloom` huérfano con `.mandates/<id>/mandate_state.json`
  // pero SIN `.core/.nucleus-config.json`. En el próximo arranque del
  // Control Plane, findBloomDir() encuentra ese `.bloom` huérfano primero
  // (para de subir ahí) y buildOrgContext() explota al intentar leer un
  // `.core/.nucleus-config.json` que nunca se escribió — "¿nucleus mal
  // inicializado?".
  //
  // MandateFsContext.org es el slug (string), no el OrganizationContext
  // completo — paridad con Config.Slug en supervisor.go, que es lo que
  // arma el path .bloom/.nucleus-{slug}/.mandates en MandatesRoot().
  const fsCtx: MandateFsContext = { workspacePath: org.workspacePath, org: org.name };
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
      status: 'draft' as const,
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

    return reply.code(202).send({ mandateId, status: 'draft', currentStatus: 'draft' });
  }

  // --- RAMA GENESIS / DOMAIN_EXPANSION ---
  const statePath = mandateStatePath(fsCtx, mandateId);

  if (existsSync(statePath)) {
    return reply.code(409).send({
      error: 'MANDATE_ID_COLLISION',
      detail: `mandateId ${mandateId} ya existe — reintentar la creación`,
    });
  }

  const now = new Date().toISOString();
  const mandateState = {
    // AGREGADO: el watcher de Nucleus (Go) necesita estos campos embebidos
    // para armar GenesisBuildInput — el shape original ({status,
    // currentPhase, phases}) no le alcanzaba. Ver mandate_watcher.go
    // (MandateState) y mandate.go (createGenesisMandate), que ya escriben
    // este mismo shape desde la unificación CLI/API sobre mandate_state.json.
    mandateId,
    mandateType: body.mandateType,
    project: body.project,
    source: (body as any).source,
    baseGenesisId: (body as any).baseGenesis,
    status: 'building' as const,
    currentStatus: 'building' as const,
    currentPhase: 'ingest' as const,
    stateVersion: 1,
    updatedAt: now,
    signature: {
      status: 'not_ready' as const,
      intentId: null,
      artifacts: {
        reception: null,
        domainProposal: null,
        humanSyncPersisted: false,
      },
      pendingAt: null,
      signedAt: null,
      failedAt: null,
      failure: null,
    },
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
    initiatedAt: now,
  });

  return reply.code(202).send({ mandateId, status: 'building', currentStatus: 'building' });
}
