// backend/src/mandate-publish.ts
//
// Implementa Encargo_Implementacion_Publicacion_Mandate_Bootstrap_v1_0.md §2.1.
//
// Cierra el tramo entre "mandate firmado en disco" (nucleus mandate build) y "fila en
// Backend que permite que resolveMandateDelivery (mandate-delivery.ts, sin cambios) la
// encuentre". No reabre resolveMandateDelivery ni el schema de Marketplace ya existente
// (mandates / mandate_versions / organization_bootstrap_mandates, migraciones
// 0000_initial.sql / 0003_organization_bootstrap_mandates.sql, bucket R2 MANDATES) — sólo
// agrega el escritor que faltaba.
//
// Alcance de esta ronda (§1 del encargo, no se resuelve acá — señalado en el cierre):
// sólo el camino feliz de "primer mandate de una organización nueva" (mandateType
// genesis). Metadata mínima: description default '' (columna NOT NULL), pillar/origin_type
// quedan NULL (no se exponen en el body todavía).

import { sha256HexBytes } from './authority/canonical';

export class PublishError extends Error {
  constructor(public status: 400 | 409 | 500, message: string) { super(message); }
}

export interface PublishMandateBody {
  slug: string;
  version: string;
  description?: string;
  visibility: 'private' | 'public';
  mandate_base64: string;
  sha256: string;
  bootstrap: boolean;
}

export interface PublishMandateResult {
  mandate_id: string;
  mandate_version_id: string;
  bootstrap_assigned: boolean;
}

const HEX_64 = /^[a-fA-F0-9]{64}$/;

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function validateBody(body: PublishMandateBody | null): asserts body is PublishMandateBody {
  if (!body) throw new PublishError(400, 'invalid_body');
  if (!body.slug || typeof body.slug !== 'string') throw new PublishError(400, 'missing_slug');
  if (!body.version || typeof body.version !== 'string') throw new PublishError(400, 'missing_version');
  if (body.visibility !== 'private' && body.visibility !== 'public') throw new PublishError(400, 'invalid_visibility');
  if (!body.mandate_base64 || typeof body.mandate_base64 !== 'string') throw new PublishError(400, 'missing_mandate_base64');
  if (!body.sha256 || !HEX_64.test(body.sha256)) throw new PublishError(400, 'invalid_sha256');
  if (typeof body.bootstrap !== 'boolean') throw new PublishError(400, 'missing_bootstrap');
}

/**
 * Publica un mandate firmado: sube el artefacto a R2, registra/actualiza la fila
 * `mandates` y su `mandate_versions`, y opcionalmente lo asigna como bootstrap de la
 * organización. Espejo, del lado de escritura, de lo que resolveMandateDelivery
 * (mandate-delivery.ts) ya hace del lado de lectura — misma tabla, mismo bucket, mismo
 * criterio de integridad (sha256 recalculado, nunca confiado a ciegas).
 *
 * Orden de pasos: sigue literalmente §2.1 del encargo, incluyendo que el paso 2 (upsert
 * de `mandates`) corre ANTES del chequeo de idempotencia/conflicto del paso 3 — un intento
 * con `sha256` distinto para una versión ya publicada devuelve 409 en el paso 3, pero
 * `mandates.latest_version` ya quedó actualizado en el paso 2. Ese orden es el que pide el
 * diseño cerrado, no una elección de esta implementación.
 */
export async function publishMandate(env: Env, organizationId: string, rawBody: PublishMandateBody | null, now = new Date()): Promise<PublishMandateResult> {
  validateBody(rawBody);
  const body = rawBody;

  // Paso 1: decodificar y recalcular sha256 — rechazo antes de tocar la base.
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(body.mandate_base64);
  } catch {
    throw new PublishError(400, 'invalid_mandate_base64');
  }
  const digest = await sha256HexBytes(bytes);
  if (digest !== body.sha256.toLowerCase()) throw new PublishError(400, 'sha256_mismatch');

  const publishedAt = now.getTime();

  // Paso 2: mandates — buscar por (origin_org_id, slug); crear o actualizar latest_version.
  const existingMandate = await env.DB.prepare('SELECT id FROM mandates WHERE origin_org_id = ? AND slug = ?')
    .bind(organizationId, body.slug).first<{ id: string }>();
  const mandateId = existingMandate?.id ?? crypto.randomUUID();
  if (existingMandate) {
    await env.DB.prepare('UPDATE mandates SET latest_version = ? WHERE id = ?')
      .bind(body.version, mandateId).run();
  } else {
    await env.DB.prepare(
      `INSERT INTO mandates (id, origin_org_id, slug, description, visibility, latest_version, pillar, origin_type, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?)`,
    ).bind(mandateId, organizationId, body.slug, body.description ?? '', body.visibility, body.version, publishedAt).run();
  }

  // Paso 3: mandate_versions — idempotencia por (mandate_id, version).
  const existingVersion = await env.DB.prepare('SELECT id, sha256 FROM mandate_versions WHERE mandate_id = ? AND version = ?')
    .bind(mandateId, body.version).first<{ id: string; sha256: string }>();

  let mandateVersionId: string;
  if (existingVersion) {
    if (existingVersion.sha256.toLowerCase() !== digest) throw new PublishError(409, 'version_conflict');
    // Retry idempotente: mismo sha256, no se vuelve a subir a R2 ni a insertar.
    mandateVersionId = existingVersion.id;
  } else {
    mandateVersionId = crypto.randomUUID();
    const r2Key = `mandates/${organizationId}/${body.slug}/${body.version}.json`;
    // Paso 4: subir a R2 — sólo acá, porque el paso 3 no encontró ya la versión.
    await env.MANDATES.put(r2Key, bytes);
    await env.DB.prepare(
      'INSERT INTO mandate_versions (id, mandate_id, version, r2_key, sha256, published_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind(mandateVersionId, mandateId, body.version, r2Key, digest, publishedAt).run();
  }

  // Paso 5: bootstrap — upsert de organization_bootstrap_mandates (PK organization_id).
  // assigned_at sólo si la fila es nueva; updated_at siempre.
  let bootstrapAssigned = false;
  if (body.bootstrap) {
    const existingBootstrap = await env.DB.prepare('SELECT organization_id FROM organization_bootstrap_mandates WHERE organization_id = ?')
      .bind(organizationId).first<{ organization_id: string }>();
    if (existingBootstrap) {
      await env.DB.prepare('UPDATE organization_bootstrap_mandates SET mandate_version_id = ?, updated_at = ? WHERE organization_id = ?')
        .bind(mandateVersionId, publishedAt, organizationId).run();
    } else {
      await env.DB.prepare(
        'INSERT INTO organization_bootstrap_mandates (organization_id, mandate_version_id, assigned_at, updated_at) VALUES (?, ?, ?, ?)',
      ).bind(organizationId, mandateVersionId, publishedAt, publishedAt).run();
    }
    bootstrapAssigned = true;
  }

  return { mandate_id: mandateId, mandate_version_id: mandateVersionId, bootstrap_assigned: bootstrapAssigned };
}
