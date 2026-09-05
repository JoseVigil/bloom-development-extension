// backend/src/authority/snapshot.ts
//
// Fase 3 — agrega dos cambios sobre la base de Fase 2 (no se reabre nada más de ese
// archivo):
//
//   §1.2 — `role_definitions` del full/delta snapshot pasa de "última versión activa
//   de cada role_id" a la unión aprobada: última versión activa de cada `key`, MÁS
//   cualquier (role_id, role_version) referenciado por un `role_assignment` con status
//   en (active, pending, suspended) presente en el mismo snapshot. Ver
//   `buildSnapshotContent` más abajo.
//
//   §1.3 — `resolveTrustBundle` deja de ser una clave estática y pasa a consultar
//   `issuer_signing_keys`, devolviendo el trust bundle completo (activas + retiradas)
//   con su cadena `signed_by_key_id`. Se agrega también `registerIssuerSigningKey`,
//   que implementa la regla de encadenamiento del §8.3 del diseño físico — sólo la
//   estructura de datos y la regla, sin el flujo operativo de disparo (eso es Fase
//   posterior, no código).
//
// SUPUESTO (§1.2): para poder distinguir "última versión activa" de "versión vieja
// referenciada", asumo que `role_definitions` tiene una columna `status` (con al menos
// el valor 'active') — el propio encargo habla de "última versión con status: active"
// como criterio ya vigente en Fase 2, pero la interfaz `RoleDefinitionRow` que tenía
// este archivo hasta ahora no la seleccionaba. La agrego acá. Si el nombre real de esa
// columna o de sus valores difiere del supuesto, ajustar sólo el SQL, la forma no cambia.
//
// SUPUESTO (§1.2): asumo que `role_assignments` tiene una columna `status` con al menos
// los valores 'active'/'pending'/'suspended' (mencionados explícitamente en el
// documento de decisión) — tampoco estaba seleccionada hasta ahora. La agrego sólo para
// la lógica interna de filtrado; no la sumo al tipo de salida `AuthoritySnapshotRoleAssignment`
// porque no tengo confirmado que `schema.ts` la tenga en ese tipo.

import { digestCanonical, signCanonicalPayload } from "./canonical";
import type {
  AuthorityEnvelope,
  AuthoritySnapshotContent,
  AuthoritySnapshotMembership,
  AuthoritySnapshotPrincipal,
  AuthoritySnapshotRevocation,
  AuthoritySnapshotRoleAssignment,
  AuthoritySnapshotRoleDefinition,
} from "./schema";

interface PrincipalRow {
  id: string;
  external_ids: string; // JSON
  display_name: string | null;
}

interface MembershipRow {
  id: string;
  principal_id: string;
  organization_id: string;
  status: string;
  effective_from: number;
  effective_until: number | null;
}

interface RoleDefinitionRow {
  id: string;
  organization_id: string | null;
  key: string;
  version: number;
  definition: string; // JSON
  status: string; // SUPUESTO — ver cabecera del archivo
}

interface RoleAssignmentRow {
  id: string;
  principal_id: string;
  membership_id: string;
  role_definition_id: string;
  scope: string | null; // JSON
  effective_from: number;
  effective_until: number | null;
  status: string; // SUPUESTO — ver cabecera del archivo; sólo para filtrado interno
}

interface RevocationRow {
  id: string;
  target_type: string;
  target_id: string;
  visible_from_version: number;
  effective_until: number | null;
  reason: string | null;
}

export interface AuthorityStateRow {
  organization_id: string;
  current_version: number;
  current_digest: string | null;
  updated_at: number;
}

export async function loadAuthorityState(db: D1Database, organizationId: string): Promise<AuthorityStateRow | null> {
  const row = await db
    .prepare(
      "SELECT organization_id, current_version, current_digest, updated_at FROM authority_state WHERE organization_id = ?",
    )
    .bind(organizationId)
    .first<AuthorityStateRow>();
  return row ?? null;
}

/**
 * Arma el contenido (sin envelope) de un snapshot. `baseVersion` null/undefined pide un
 * full; un número pide un delta desde esa versión (sólo filas con `since_version >
 * baseVersion` / revocations con `visible_from_version > baseVersion`).
 *
 * §1.2: `role_definitions` es la unión de:
 *   (a) la última versión `active` de cada `key` (organización o built-in), filtrada
 *       por `since_version` como el resto de las tablas;
 *   (b) cualquier fila específica de `role_definitions` referenciada por
 *       `role_definition_id` desde un `role_assignment` con status en
 *       (active, pending, suspended) que forma parte de este mismo snapshot — sin
 *       filtrar esas filas referenciadas por su propio `since_version`, porque pueden
 *       no haber cambiado y aun así ser necesarias para la integridad referencial del
 *       payload (una versión de rol vieja pero todavía asignada).
 *
 * Nota de integridad referencial (heredada de Fase 2, no resuelta acá): al filtrar
 * `memberships` primero y derivar `principalIds` de ahí, un delta puede incluir una
 * `role_assignment` cuyo `principal_id`/`membership_id` no viene en este mismo payload.
 * Nucleus debe resolver esas referencias contra su estado local ya sincronizado.
 */
export async function buildSnapshotContent(
  db: D1Database,
  organizationId: string,
  baseVersion: number | null,
): Promise<AuthoritySnapshotContent> {
  const state = await loadAuthorityState(db, organizationId);
  const currentVersion = state?.current_version ?? 0;
  const sinceFilter = baseVersion ?? 0;

  const membershipRows = await db
    .prepare(
      `SELECT id, principal_id, organization_id, status, effective_from, effective_until
       FROM memberships
       WHERE organization_id = ?1 AND since_version > ?2`,
    )
    .bind(organizationId, sinceFilter)
    .all<MembershipRow>();

  const principalIds = [...new Set(membershipRows.results.map((row) => row.principal_id))];
  const principalRows = principalIds.length
    ? await db
        .prepare(
          `SELECT id, external_ids, display_name FROM principals
           WHERE id IN (${principalIds.map(() => "?").join(",")}) AND since_version > ?`,
        )
        .bind(...principalIds, sinceFilter)
        .all<PrincipalRow>()
    : { results: [] as PrincipalRow[] };

  const roleAssignmentRows = await db
    .prepare(
      `SELECT id, principal_id, membership_id, role_definition_id, scope, effective_from, effective_until, status
       FROM role_assignments WHERE organization_id = ?1 AND since_version > ?2`,
    )
    .bind(organizationId, sinceFilter)
    .all<RoleAssignmentRow>();

  // §1.2(a) — última versión `active` de cada `key`, respetando el filtro de delta.
  const latestActiveRoleDefinitionRows = await db
    .prepare(
      `SELECT rd.id, rd.organization_id, rd.key, rd.version, rd.definition, rd.status
       FROM role_definitions rd
       WHERE (rd.organization_id IS NULL OR rd.organization_id = ?1)
         AND rd.status = 'active'
         AND rd.since_version > ?2
         AND rd.version = (
           SELECT MAX(rd2.version) FROM role_definitions rd2
           WHERE rd2.key = rd.key
             AND (rd2.organization_id IS NULL OR rd2.organization_id = ?1)
             AND rd2.status = 'active'
         )`,
    )
    .bind(organizationId, sinceFilter)
    .all<RoleDefinitionRow>();

  // §1.2(b) — versiones referenciadas por asignaciones vigentes presentes en este
  // snapshot, sin filtrar por su propio since_version.
  const referencedRoleDefinitionIds = [
    ...new Set(
      roleAssignmentRows.results
        .filter((row) => row.status === "active" || row.status === "pending" || row.status === "suspended")
        .map((row) => row.role_definition_id),
    ),
  ];
  const referencedRoleDefinitionRows = referencedRoleDefinitionIds.length
    ? await db
        .prepare(
          `SELECT id, organization_id, key, version, definition, status FROM role_definitions
           WHERE id IN (${referencedRoleDefinitionIds.map(() => "?").join(",")})`,
        )
        .bind(...referencedRoleDefinitionIds)
        .all<RoleDefinitionRow>()
    : { results: [] as RoleDefinitionRow[] };

  const roleDefinitionById = new Map<string, RoleDefinitionRow>();
  for (const row of latestActiveRoleDefinitionRows.results) roleDefinitionById.set(row.id, row);
  for (const row of referencedRoleDefinitionRows.results) roleDefinitionById.set(row.id, row);
  const roleDefinitionRows = [...roleDefinitionById.values()];

  const revocationRows = await db
    .prepare(
      `SELECT id, target_type, target_id, visible_from_version, effective_until, reason
       FROM revocations WHERE organization_id = ?1 AND visible_from_version > ?2`,
    )
    .bind(organizationId, sinceFilter)
    .all<RevocationRow>();

  const principals: AuthoritySnapshotPrincipal[] = principalRows.results.map((row) => ({
    id: row.id,
    external_ids: JSON.parse(row.external_ids) as Record<string, string>,
    display_name: row.display_name,
  }));

  const memberships: AuthoritySnapshotMembership[] = membershipRows.results.map((row) => ({
    id: row.id,
    principal_id: row.principal_id,
    organization_id: row.organization_id,
    status: row.status as AuthoritySnapshotMembership["status"],
    effective_from: row.effective_from,
    effective_until: row.effective_until,
  }));

  const role_definitions: AuthoritySnapshotRoleDefinition[] = roleDefinitionRows.map((row) => ({
    id: row.id,
    key: row.key,
    version: row.version,
    organization_id: row.organization_id,
    definition: JSON.parse(row.definition) as unknown,
  }));

  const role_assignments: AuthoritySnapshotRoleAssignment[] = roleAssignmentRows.results.map((row) => ({
    id: row.id,
    principal_id: row.principal_id,
    membership_id: row.membership_id,
    role_definition_id: row.role_definition_id,
    scope: row.scope ? (JSON.parse(row.scope) as unknown) : null,
    effective_from: row.effective_from,
    effective_until: row.effective_until,
  }));

  const revocations: AuthoritySnapshotRevocation[] = revocationRows.results.map((row) => ({
    id: row.id,
    target_type: row.target_type as AuthoritySnapshotRevocation["target_type"],
    target_id: row.target_id,
    visible_from_version: row.visible_from_version,
    effective_until: row.effective_until,
    reason: row.reason,
  }));

  const base = {
    organization_id: organizationId,
    version: currentVersion,
    generated_at: new Date().toISOString(),
    principals,
    memberships,
    role_definitions,
    role_assignments,
    revocations,
  };

  if (baseVersion === null || baseVersion === undefined) {
    return { ...base, kind: "full" as const };
  }
  return { ...base, kind: "delta" as const, base_version: baseVersion };
}

/**
 * Firma el contenido y arma el envelope que efectivamente viaja por HTTP (§3, §8.1 del
 * diseño físico). `signingKeyId` identifica la clave usada contra el trust bundle que
 * Nucleus tiene pinneado — viene de configuración/secret, no de esta función.
 */
export async function signSnapshotEnvelope(
  content: AuthoritySnapshotContent,
  signingKeyPkcs8: ArrayBuffer,
  signingKeyId: string,
): Promise<AuthorityEnvelope> {
  const { canonical, digestHex } = await digestCanonical(content);
  const signature = await signCanonicalPayload(canonical, signingKeyPkcs8);
  return { content, digest: digestHex, signature, signing_key_id: signingKeyId };
}

export async function resolveAuthoritySnapshot(
  db: D1Database,
  organizationId: string,
  baseVersion: number | null,
  signingKeyPkcs8: ArrayBuffer,
  signingKeyId: string,
): Promise<AuthorityEnvelope> {
  const content = await buildSnapshotContent(db, organizationId, baseVersion);
  return signSnapshotEnvelope(content, signingKeyPkcs8, signingKeyId);
}

// ---------------------------------------------------------------------------------
// §1.3 — trust bundle del issuer con rotación (issuer_signing_keys).
// ---------------------------------------------------------------------------------

export interface IssuerSigningKeyRow {
  key_id: string;
  organization_id: string;
  public_key_raw: string; // base64 raw Ed25519 (32 bytes)
  status: "active" | "retired";
  signed_by_key_id: string | null;
  created_at: number;
  retired_at: number | null;
}

/**
 * Devuelve el trust bundle completo de la organización (§8.3 del diseño físico):
 * todas las claves `active` y `retired`, junto con su `signed_by_key_id`, para que
 * Nucleus pueda reconstruir la cadena de confianza completa — no un manifiesto de una
 * sola clave.
 */
export async function resolveTrustBundle(db: D1Database, organizationId: string): Promise<IssuerSigningKeyRow[]> {
  const rows = await db
    .prepare(
      `SELECT key_id, organization_id, public_key_raw, status, signed_by_key_id, created_at, retired_at
       FROM issuer_signing_keys
       WHERE organization_id = ?1 AND status IN ('active', 'retired')
       ORDER BY created_at ASC`,
    )
    .bind(organizationId)
    .all<IssuerSigningKeyRow>();
  return rows.results;
}

/**
 * Implementa exclusivamente la regla de encadenamiento del §8.3 / §1.3 del encargo:
 * una clave nueva sólo es confiable si `signed_by_key_id` apunta a una clave ya
 * `active` de la misma organización, salvo que sea la primera clave de esa
 * organización (en cuyo caso `signed_by_key_id = null` es válido).
 *
 * No hay, en esta fase, ningún endpoint HTTP que llame a esta función — el disparo de
 * una rotación real es un procedimiento operativo de Backend (§1.3, explícito: "no se
 * construye en esta fase el flujo operativo"). Esta función existe para que la regla
 * tenga una única implementación que tests y, más adelante, ese procedimiento puedan
 * invocar — no para wireearla a una ruta ahora.
 */
export async function registerIssuerSigningKey(
  db: D1Database,
  params: { keyId: string; organizationId: string; publicKeyRaw: string; signedByKeyId: string | null },
): Promise<{ ok: true } | { ok: false; reason: "invalid_chain" }> {
  if (params.signedByKeyId === null) {
    const existing = await db
      .prepare("SELECT key_id FROM issuer_signing_keys WHERE organization_id = ? LIMIT 1")
      .bind(params.organizationId)
      .first<{ key_id: string }>();
    if (existing) {
      // Ya hay al menos una clave en la organización: una fila autofirmada
      // (signed_by_key_id = NULL) sólo es válida como la primera clave.
      return { ok: false, reason: "invalid_chain" };
    }
  } else {
    const signer = await db
      .prepare(
        "SELECT key_id FROM issuer_signing_keys WHERE key_id = ? AND organization_id = ? AND status = 'active'",
      )
      .bind(params.signedByKeyId, params.organizationId)
      .first<{ key_id: string }>();
    if (!signer) return { ok: false, reason: "invalid_chain" };
  }

  await db
    .prepare(
      `INSERT INTO issuer_signing_keys (key_id, organization_id, public_key_raw, status, signed_by_key_id, created_at, retired_at)
       VALUES (?, ?, ?, 'active', ?, ?, NULL)`,
    )
    .bind(params.keyId, params.organizationId, params.publicKeyRaw, params.signedByKeyId, Date.now())
    .run();
  return { ok: true };
}
