import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { mandatesRoot } from '../../utils/mandate-paths';
import { resolveOrg } from '../../utils/org-resolver';

export interface MandateListItem {
  mandateId: string;
  mandateType?: string;
  project?: string;
  name?: string;
  source?: string;
  status?: string;
  currentStatus?: string;
  currentPhase?: string;
  stateVersion?: number;
  updatedAt?: string;
  createdAt?: string;
  /** 'state' = leído de mandate_state.json. 'draft' = mandate_draft.json (standard sin confirmar). */
  fileKind: 'state' | 'draft';
}

function normalizeStatus(
  parsed: Record<string, unknown>,
  mandateId: string,
  request: FastifyRequest,
): { status?: string; currentStatus?: string } {
  const legacyStatus = typeof parsed.status === 'string' ? parsed.status : undefined;
  const canonicalStatus =
    typeof parsed.currentStatus === 'string' ? parsed.currentStatus : undefined;

  if (canonicalStatus && legacyStatus && canonicalStatus !== legacyStatus) {
    request.log.warn(
      { mandateId, status: legacyStatus, currentStatus: canonicalStatus },
      'GET /mandates — status y currentStatus difieren; prevalece currentStatus',
    );
  }

  const resolvedStatus = canonicalStatus ?? legacyStatus;
  if (!resolvedStatus) {
    request.log.warn(
      { mandateId, status: legacyStatus, currentStatus: canonicalStatus },
      'GET /mandates — mandate sin status ni currentStatus',
    );
    return {};
  }

  return { status: resolvedStatus, currentStatus: resolvedStatus };
}

function projectRevision(parsed: Record<string, unknown>): { stateVersion?: number; updatedAt?: string } {
  return {
    ...(typeof parsed.stateVersion === 'number' ? { stateVersion: parsed.stateVersion } : {}),
    ...(typeof parsed.updatedAt === 'string' ? { updatedAt: parsed.updatedAt } : {}),
  };
}

/**
 * Handler de `GET /mandates` — mecanismo de catch-up.
 *
 * Contexto (Mandate_Event_Mechanism_Auditoria_v1.md, Addendum A): antes de
 * este handler no existía, en ninguna capa (CLI, HTTP, webview), ninguna
 * forma de listar mandates preexistentes. El WS (`:4124`) solo entrega
 * eventos en vivo — un mandate creado antes de que el cliente se conecte
 * (o en una corrida anterior de la app) queda invisible para siempre sin
 * este endpoint. `+layout.svelte` lo llama una vez al montar, además de
 * conectar el WS para lo que venga después.
 *
 * Escanea `mandatesRoot(fsCtx)` (`.mandates/`) y lee, por cada subcarpeta,
 * `mandate_state.json` (genesis/domain_expansion desde 'building' en
 * adelante — mismo archivo que escriben tanto `create-mandate.handler.ts`
 * como `mandate.go:createGenesisMandate`, confirmado unificado en la
 * auditoría) o, si no existe, `mandate_draft.json` (standard, todavía sin
 * confirmar). No hay un tercer archivo a considerar para este listado: el
 * propio `mandate_state.json` va reflejando `status`/`currentPhase` a
 * medida que el workflow avanza.
 *
 * Resuelve `fsCtx` en cada request (mismo criterio que `createMandateHandler`
 * — ver ese archivo, ya no usa el `fsCtx` inyectado una sola vez al bootear
 * el server) para no divergir del path que usa el handler de escritura.
 *
 * Tolerante a corrupción parcial: una carpeta con JSON inválido o sin
 * ninguno de los dos archivos se omite del listado (con `log.warn`), en vez
 * de tirar abajo el endpoint completo por un mandate.
 */
export async function listMandatesHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const workspacePath = process.env.BLOOM_NUCLEUS_PATH;

  if (!workspacePath) {
    return reply.code(500).send({
      error: 'ENV_CONFIG_MISSING',
      detail: 'BLOOM_NUCLEUS_PATH no está definida',
    });
  }

  let root: string;
  try {
    const org = await resolveOrg(workspacePath);
    root = mandatesRoot({ workspacePath: org.workspacePath, org: org.name });
  } catch (err) {
    request.log.error({ err }, 'GET /mandates — no se pudo resolver la organización activa');
    return reply.code(500).send({
      error: 'ORG_RESOLUTION_FAILED',
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  let entries: string[];
  try {
    entries = await readdir(root);
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      // Todavía no se creó ningún mandate — directorio no existe, no es error.
      return reply.code(200).send({ mandates: [] });
    }
    request.log.error({ err, root }, 'GET /mandates — no se pudo leer mandatesRoot');
    return reply.code(500).send({
      error: 'MANDATES_ROOT_UNREADABLE',
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  const mandates: MandateListItem[] = [];

  for (const mandateId of entries) {
    const dir = path.join(root, mandateId);

    // Rama 1: mandate_state.json (genesis / domain_expansion en curso).
    try {
      const raw = await readFile(path.join(dir, 'mandate_state.json'), 'utf-8');
      const parsed = JSON.parse(raw);
      const normalizedStatus = normalizeStatus(parsed, mandateId, request);
      const revision = projectRevision(parsed);
      mandates.push({
        mandateId: parsed.mandateId || mandateId,
        mandateType: parsed.mandateType,
        project: parsed.project,
        source: parsed.source,
        ...normalizedStatus,
        currentPhase: parsed.currentPhase,
        ...revision,
        createdAt: parsed.createdAt,
        fileKind: 'state',
      });
      continue;
    } catch (err: any) {
      if (err?.code && err.code !== 'ENOENT') {
        request.log.warn({ err, mandateId }, 'GET /mandates — mandate_state.json ilegible, se omite');
        continue;
      }
      // ENOENT: puede ser un draft standard — seguimos abajo.
    }

    // Rama 2: mandate_draft.json (standard, sin confirmar).
    try {
      const raw = await readFile(path.join(dir, 'mandate_draft.json'), 'utf-8');
      const parsed = JSON.parse(raw);
      const normalizedStatus = normalizeStatus(parsed, mandateId, request);
      const revision = projectRevision(parsed);
      mandates.push({
        mandateId: parsed.mandateId || mandateId,
        mandateType: parsed.mandateType,
        project: parsed.project,
        name: parsed.name,
        ...normalizedStatus,
        ...revision,
        createdAt: parsed.createdAt,
        fileKind: 'draft',
      });
    } catch (err: any) {
      if (err?.code && err.code !== 'ENOENT') {
        request.log.warn({ err, mandateId }, 'GET /mandates — mandate_draft.json ilegible, se omite');
      }
      // Ninguno de los dos archivos: carpeta huérfana/a medio escribir — se omite en silencio.
    }
  }

  return reply.code(200).send({ mandates });
}
