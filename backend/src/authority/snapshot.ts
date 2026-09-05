// backend/src/authority/snapshot.ts
//
// Corregido contra el schema real de `migrations/0001_authority_snapshot.sql` (la
// versión anterior de este archivo, según su propio comentario, era una inferencia sin
// haber visto esa migración). Diferencias que importan respecto a esa inferencia:
//
//  - `principals` NO tiene `organization_id` propio en 0001. La pertenencia a una
//    organización se resuelve exclusivamente vía `memberships`. Por lo tanto el
//    snapshot de una organización sólo incluye los principals que tienen (al menos)
//    una membership en esa organización — no "todos los principals".
//  - `role_definitions` incluye tanto built-in (`organization_id IS NULL`, ej.
//    'master'/'specialist') como custom de la organización (`organization_id = ?`).
//    Ambos viajan en cada snapshot de esa organización.
//  - El corte full/delta usa la columna `since_version` (agregada en 0001 — ver la
//    nota de diseño en la propia migración, no está en la lista literal de columnas
//    del encargo original) para principals/memberships/role_definitions/role_assignments,
//    y `visible_from_version` para `revocations` (esa sí explícita en el encargo).
//  - El envelope firma `content` completo (incluye `version`/`generated_at`) porque así
//    los define `AuthoritySnapshotContentBase` en schema.ts. El comentario del campo
//    `digest` en schema.ts ("sha256 hex del JCS-canonical de `content` (sin
//    version/generated_at...)") quedó desactualizado respecto a esa misma interfaz —
//    no lo toco acá porque no fue pedido, pero Génesis debería confirmarlo contra el
//    diseño físico real antes de dar esto por cerrado.

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
}

interface RoleAssignmentRow {
  id: string;
  principal_id: string;
  membership_id: string;
  role_definition_id: string;
  scope: string | null; // JSON
  effective_from: number;
  effective_until: number | null;
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
 * Nota de integridad referencial: al filtrar `memberships` primero y derivar
 * `principalIds` de ahí, un delta puede incluir una `role_assignment` cuyo
 * `principal_id`/`membership_id` NO viene en este mismo payload (porque esa fila no
 * cambió desde `baseVersion`, pero la membership/principal sí son necesarios para
 * interpretarla). Esto es inherente a un modelo delta — Nucleus debe resolver esas
 * referencias contra su estado local ya sincronizado, no asumir que cada delta es
 * autocontenido. Se deja documentado acá porque no hay diseño físico disponible en esta
 * sesión que confirme si esa es la semántica esperada o si debiera arrastrarse el grafo
 * completo de dependencias en cada delta.
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

  const roleDefinitionRows = await db
    .prepare(
      `SELECT id, organization_id, key, version, definition FROM role_definitions
       WHERE (organization_id IS NULL OR organization_id = ?1) AND since_version > ?2`,
    )
    .bind(organizationId, sinceFilter)
    .all<RoleDefinitionRow>();

  const roleAssignmentRows = await db
    .prepare(
      `SELECT id, principal_id, membership_id, role_definition_id, scope, effective_from, effective_until
       FROM role_assignments WHERE organization_id = ?1 AND since_version > ?2`,
    )
    .bind(organizationId, sinceFilter)
    .all<RoleAssignmentRow>();

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

  const role_definitions: AuthoritySnapshotRoleDefinition[] = roleDefinitionRows.results.map((row) => ({
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
