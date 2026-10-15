import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Static } from '@sinclair/typebox';

import { CreateMandateBody } from '../schemas/create-mandate.schema';
import {
  genesisLaunchJournalPath,
  genesisLaunchJournalRoot,
  mandateDir,
  mandateStatePath,
  type MandateFsContext,
} from '../../utils/mandate-paths';
import { publishMandateEvent } from '../../server/mandate-event-publisher';
import { resolveOrg } from '../../utils/org-resolver';

type ProjectDocument = { name: string; content: Buffer };

async function snapshotProjectDocuments(workspacePath: string, projectPath: string): Promise<ProjectDocument[]> {
  const [workspaceReal, projectReal] = await Promise.all([realpath(workspacePath), realpath(projectPath)]);
  const relative = path.relative(workspaceReal, projectReal);
  if (relative === '' || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
    throw new Error('PROJECT_PATH_OUTSIDE_WORKSPACE');
  }
  const projectInfo = await lstat(projectReal);
  if (!projectInfo.isDirectory() || projectInfo.isSymbolicLink()) {
    throw new Error('PROJECT_PATH_INVALID');
  }
  const entries = (await readdir(projectReal, { withFileTypes: true }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const documents: ProjectDocument[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) continue;
    const sourcePath = path.join(projectReal, entry.name);
    const info = await lstat(sourcePath);
    if (info.isSymbolicLink() || !info.isFile()) {
      throw new Error(`PROJECT_DOCUMENT_INVALID:${entry.name}`);
    }
    documents.push({ name: entry.name, content: await readFile(sourcePath) });
  }
  if (documents.length === 0) throw new Error('PROJECT_DOCUMENTS_EMPTY');
  return documents;
}

async function persistProjectDocuments(mandatePath: string, documents: ProjectDocument[]): Promise<void> {
  const docsDir = path.join(mandatePath, 'docs');
  await mkdir(docsDir, { recursive: true });
  for (const document of documents) {
    const destination = path.join(docsDir, document.name);
    try {
      await writeFile(destination, document.content, { flag: 'wx' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'EEXIST') throw error;
      const existing = await readFile(destination);
      if (!existing.equals(document.content)) throw new Error(`PROJECT_DOCUMENT_CONFLICT:${document.name}`);
    }
  }
}

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
  let projectDocuments: ProjectDocument[] = [];
  if (body.mandateType === 'genesis') {
    try {
      projectDocuments = await snapshotProjectDocuments(fsCtx.workspacePath, body.projectPath);
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message.split(':')[0] : 'PROJECT_DOCUMENTS_INVALID',
        detail: error instanceof Error ? error.message : 'No se pudo preparar la documentación del proyecto',
      });
    }
  }
  let mandateId = body.mandateType === 'genesis'
    ? ''
    : (body as any).mandateId ?? randomUUID();

  let genesisRequestDigest: string | undefined;
  if (body.mandateType === 'genesis') {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.mandateLaunchId)) {
      return reply.code(400).send({ error: 'GENESIS_LAUNCH_ID_INVALID', detail: 'mandateLaunchId debe ser UUID' });
    }
    genesisRequestDigest = createHash('sha256').update(JSON.stringify({
      mandateType: body.mandateType,
      projectId: body.projectId,
      project: body.project,
      projectPath: body.projectPath,
      name: body.name,
      source: body.source,
	  recoveryRequestId: body.recoveryRequestId,
    })).digest('hex');

	// Project-level barrier: once Nucleus has a durable current Genesis,
	// the API accepts another one only when it matches the prepared recovery.
	// This prevents callers from bypassing Core with a fresh launch UUID.
	const projectRecordPath = path.join(
	  fsCtx.workspacePath, '.bloom', `.nucleus-${fsCtx.org}`, '.core',
	  'genesis-projects', `${body.projectId}.json`,
	);
	try {
	  const record = JSON.parse(await readFile(projectRecordPath, 'utf8'));
	  const pending = record?.pendingRecovery;
	  const isPreparedRecovery = pending &&
		(pending.mandateLaunchId ?? pending.genesisLaunchId) === body.mandateLaunchId &&
		pending.recoveryRequestId === body.recoveryRequestId;
	  const isReplayOfCurrent = (record?.attempts || []).some((attempt: any) =>
		attempt.mandateId === record.currentMandateId && (attempt.mandateLaunchId ?? attempt.genesisLaunchId) === body.mandateLaunchId,
	  );
	  if (record?.currentMandateId && !isPreparedRecovery && !isReplayOfCurrent) {
		return reply.code(409).send({
		  error: 'PROJECT_GENESIS_CONFLICT',
		  detail: `El proyecto ${body.projectId} ya tiene un Genesis vigente; se requiere una reserva de recuperación de Nucleus`,
		});
	  }
	} catch (error: any) {
	  if (error?.code !== 'ENOENT') {
		return reply.code(500).send({ error: 'PROJECT_GENESIS_STATE_INVALID', detail: 'No se pudo validar la continuidad Genesis del proyecto' });
	  }
	}
    const journalRoot = genesisLaunchJournalRoot(fsCtx);
    const journalPath = genesisLaunchJournalPath(fsCtx, body.mandateLaunchId);
    await mkdir(journalRoot, { recursive: true });
    const allocated = {
      schemaVersion: 1,
      mandateLaunchId: body.mandateLaunchId,
      mandateId: randomUUID(),
      requestDigest: genesisRequestDigest,
      createdAt: new Date().toISOString(),
    };
    try {
      const file = await open(journalPath, 'wx');
      try {
        await file.writeFile(JSON.stringify(allocated, null, 2), 'utf8');
        await file.sync();
      } finally {
        await file.close();
      }
      mandateId = allocated.mandateId;
    } catch (error: any) {
      if (error?.code !== 'EEXIST') throw error;
      let recorded: any;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        try {
          recorded = JSON.parse(await readFile(journalPath, 'utf8'));
          break;
        } catch {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
      if (!recorded || recorded.schemaVersion !== 1 || (recorded.mandateLaunchId ?? recorded.genesisLaunchId) !== body.mandateLaunchId ||
          typeof recorded.mandateId !== 'string' || typeof recorded.requestDigest !== 'string') {
        return reply.code(500).send({ error: 'GENESIS_LAUNCH_JOURNAL_INVALID', detail: 'No se pudo recuperar la solicitud Genesis' });
      }
      if (recorded.requestDigest !== genesisRequestDigest) {
        return reply.code(409).send({
          error: 'GENESIS_LAUNCH_CONFLICT',
          detail: `mandateLaunchId ${body.mandateLaunchId} ya fue usado con otro payload`,
        });
      }
      mandateId = recorded.mandateId;
    }
  }
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
    if (body.mandateType === 'genesis') {
      try {
        const existing = JSON.parse(await readFile(statePath, 'utf8'));
        if (existing.mandateId === mandateId && (existing.mandateLaunchId ?? existing.genesisLaunchId) === body.mandateLaunchId &&
            existing.genesisRequestDigest === genesisRequestDigest && existing.projectId === body.projectId &&
            existing.project === body.project && existing.projectPath === body.projectPath && existing.source === body.source) {
          return reply.code(202).send({ mandateId, status: 'building', currentStatus: 'building' });
        }
      } catch {
        // A malformed or unreadable state is a collision, never a replay.
      }
    }
    return reply.code(409).send({ error: 'MANDATE_ID_COLLISION', detail: `mandateId ${mandateId} ya existe — reintentar la creación` });
  }

  const now = new Date().toISOString();
  if (body.mandateType === 'genesis') {
    await persistProjectDocuments(dir, projectDocuments);
  }
  const mandateState = {
    // AGREGADO: el watcher de Nucleus (Go) necesita estos campos embebidos
    // para armar MandateBuildInput — el shape original ({status,
    // currentPhase, phases}) no le alcanzaba. Ver mandate_watcher.go
    // (MandateState) y mandate.go (createBuildMandate), que ya escriben
    // este mismo shape desde la unificación CLI/API sobre mandate_state.json.
    mandateId,
    mandateType: body.mandateType,
    mandateLaunchId: body.mandateType === 'genesis' ? body.mandateLaunchId : undefined,
    genesisRequestDigest,
	recoveryRequestId: body.mandateType === 'genesis' ? body.recoveryRequestId : undefined,
    projectId: body.projectId,
    project: body.project,
    projectPath: body.mandateType === 'genesis' ? body.projectPath : undefined,
    source: (body as any).source,
    baseGenesisId: (body as any).baseGenesis,
    status: 'building' as const,
    currentStatus: 'building' as const,
    currentPhase: 'ingest' as const,
    stateVersion: 1,
    createdAt: now,
    updatedAt: now,
    docsProvided: projectDocuments.map(document => document.name),
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
    if ((err as NodeJS.ErrnoException)?.code === 'EEXIST' && body.mandateType === 'genesis') {
      try {
        const existing = JSON.parse(await readFile(statePath, 'utf8'));
        if (existing.mandateId === mandateId && (existing.mandateLaunchId ?? existing.genesisLaunchId) === body.mandateLaunchId &&
            existing.genesisRequestDigest === genesisRequestDigest && existing.projectId === body.projectId &&
            existing.project === body.project && existing.projectPath === body.projectPath && existing.source === body.source) {
          return reply.code(202).send({ mandateId, status: 'building', currentStatus: 'building' });
        }
      } catch {
        // Preserve the original write failure below.
      }
    }
    request.log.error({ err, mandateId }, 'Fallo al inicializar mandate_state.json en disco');
    return reply.code(500).send({
      error: 'MANDATE_STATE_WRITE_FAILED',
      detail: `No se pudo escribir mandate_state.json para ${mandateId}`,
    });
  }

  // Notifica al Control Plane que el archivo está listo.
  // Nucleus (Go) reaccionará a este evento iniciando el proceso.
  publishMandateEvent('mandate:build:initiated', {
    mandateId,
    projectName: body.project,
    source: (body as any).source, // 'source' existe en genesis/domain_expansion
    initiatedAt: now,
  });

  return reply.code(202).send({ mandateId, status: 'building', currentStatus: 'building' });
}
