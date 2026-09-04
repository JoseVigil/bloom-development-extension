// backend/src/authority/snapshot.ts
//
// Construye el payload full/delta del Authority Snapshot desde las tablas de
// migrations/0001_authority_snapshot.sql, invoca canonical.ts para producir el envelope
// firmado, y mantiene `authority_state` (high-water mark) actualizada de forma atómica
// (§1.1, §1.2 del encargo — Nota técnica de riesgos §1).
//
// SUPUESTO DE DISEÑO GENERAL (documentar para revisión de Génesis contra
// BLOOM_REMOTE_AUTHORITY_PHYSICAL_DESIGN_v0_1.md, no disponible en esta sesión):
//
//   Esta fase NO incluye endpoints de escritura para principals/memberships/roles/
//   asignaciones (§3 del encargo: "poblar esas tablas por otra vía no está en el
//   alcance"). Eso deja abierta una pregunta que el encargo no resuelve explícitamente:
//   ¿quién incrementa `authority_state.current_version` si Backend nunca escribe
//   contenido en esta fase?
//
//   Elección tomada acá (a confirmar contra el diseño físico): `resolveAuthoritySnapshot`
//   calcula el contenido "full" a partir del estado actual de las tablas en cada
//   request, lo canonicaliza, y compara su digest contra `authority_state.current_digest`.
//   Si no coinciden (porque el contenido de las tablas cambió por una vía externa a esta
//   fase, o porque es la primera vez que se genera un snapshot para esa organización),
//   se hace un bump atómico de `current_version`/`current_digest` con concurrencia
//   optimista, tal cual describe la Nota técnica de riesgos §1. Si coinciden, no se
//   escribe nada — la lectura es idempotente.
//
//   Esto es "auto-reparación por lectura", no un endpoint de escritura de negocio: no crea
//   ni modifica principals/memberships/roles, sólo mantiene el high-water mark consistente
//   con lo que ya existe en las tablas. Si el diseño físico real define otro mecanismo de
//   quién dispara el versionado (p. ej. un job separado, o un endpoint de "publish" que sí
//   está fuera de esta fase), este archivo debe ajustarse — está aislado en las funciones
//   `computeFullContentCandidate` y `ensureAuthorityVersion` para que el reemplazo sea
//   localizado.

import { digestCanonical, signDigest } from "./canonical";
import type {
  AuthorityEnvelope,
  AuthoritySnapshotContent,
  AuthoritySnapshotContentDelta,
  AuthoritySnapshotContentFull,
  AuthoritySnapshotMembership,
  AuthoritySnapshotPrincipal,
  AuthoritySnapshotRevocation,
  AuthoritySnapshotRoleAssignment,
  AuthoritySnapshotRoleDefinition,
  AuthorityTrustBundle,
  AuthorityTrustBundleSigningKey,
} from "./schema";

export type AuthorityCapability = "full" | "delta";

export interface AuthoritySigningContext {
  signingKeyId: string;
  signingKeyPkcs8: ArrayBuffer;
}

export type AuthoritySnapshotResolution =
  | { kind: "no_newer_version"; organizationId: string; currentVersion: number }
  | { kind: "envelope"; organizationId: string; currentVersion: number; envelope: AuthorityEnvelope };

// ---------------------------------------------------------------------------------------
// Filas D1 crudas (SQL crudo, sin Drizzle — §2 del encargo)
// ---------------------------------------------------------------------------------------

interface PrincipalRow {
  id: string;
  external_ids: string; // JSON string
  display_name: string | null;
  since_version: number;
}

interface MembershipRow {
  id: string;
  principal_id: string;
  organization_id: string;
  status: "active" | "suspended" | "removed";
  effective_from: number;
  effective_until: number | null;
  since_version: number;
}

interface RoleDefinitionRow {
  id: string;
  organization_id: string | null;
  key: string;
  version: number;
  definition: string; // JSON string, opaco
  since_version: number;
}

interface RoleAssignmentRow {
  id: string;
  organization_id: string;
  principal_id: string;
  membership_id: string;
  role_definition_id: string;
  scope: string | null; // JSON string, opaco
  effective_from: number;
  effective_until: number | null;
  since_version: number;
}

interface RevocationRow {
  id: string;
  organization_id: string;
  target_type: "principal" | "membership" | "role_assignment";
  target_id: string;
  visible_from_version: number;
  effective_until: number | null;
  reason: string | null;
}

interface AuthorityStateRow {
  organization_id: string;
  current_version: number;
  current_digest: string | null;
  updated_at: number;
}

// ---------------------------------------------------------------------------------------
// Lectura de tablas
// ---------------------------------------------------------------------------------------

async function fetchAuthorityState(db: D1Database, organizationId: string): Promise<AuthorityStateRow | null> {
  return db
    .prepare(
      `SELECT organization_id, current_version, current_digest, updated_at
       FROM authority_state WHERE organization_id = ?`,
    )
    .bind(organizationId)
    .first<AuthorityStateRow>();
}

async function fetchPrincipals(db: D1Database, organizationId: string): Promise<PrincipalRow[]> {
  // Los principals no tienen organization_id directo (identidad interna estable,
  // §1.1 del encargo); se llega a ellos vía memberships. Se traen sólo los que
  // tienen (al menos) una membership en la organización pedida.
  const result = await db
    .prepare(
      `SELECT DISTINCT p.id, p.external_ids, p.display_name, p.since_version
       FROM principals p
       JOIN memberships m ON m.principal_id = p.id
       WHERE m.organization_id = ?`,
    )
    .bind(organizationId)
    .all<PrincipalRow>();
  return result.results;
}

async function fetchMemberships(db: D1Database, organizationId: string): Promise<MembershipRow[]> {
  const result = await db
    .prepare(
      `SELECT id, principal_id, organization_id, status, effective_from, effective_until, since_version
       FROM memberships WHERE organization_id = ?`,
    )
    .bind(organizationId)
    .all<MembershipRow>();
  return result.results;
}

async function fetchRoleDefinitions(db: D1Database, organizationId: string): Promise<RoleDefinitionRow[]> {
  // Built-in (organization_id IS NULL, §15 del diseño físico: master/specialist) + custom
  // de la organización. SUPUESTO: no se deduplica por (organization_id, key) quedándose
  // sólo con la versión más alta — se listan todas las versiones presentes en la tabla.
  // El diseño físico puede requerir sólo "la versión vigente" por key; confirmar y, si
  // corresponde, agregar acá el filtro de "última versión <= current_version" antes de
  // cerrar esta fase.
  const result = await db
    .prepare(
      `SELECT id, organization_id, key, version, definition, since_version
       FROM role_definitions WHERE organization_id IS NULL OR organization_id = ?`,
    )
    .bind(organizationId)
    .all<RoleDefinitionRow>();
  return result.results;
}

async function fetchRoleAssignments(db: D1Database, organizationId: string): Promise<RoleAssignmentRow[]> {
  const result = await db
    .prepare(
      `SELECT id, organization_id, principal_id, membership_id, role_definition_id, scope,
              effective_from, effective_until, since_version
       FROM role_assignments WHERE organization_id = ?`,
    )
    .bind(organizationId)
    .all<RoleAssignmentRow>();
  return result.results;
}

async function fetchRevocations(db: D1Database, organizationId: string): Promise<RevocationRow[]> {
  const result = await db
    .prepare(
      `SELECT id, organization_id, target_type, target_id, visible_from_version, effective_until, reason
       FROM revocations WHERE organization_id = ?`,
    )
    .bind(organizationId)
    .all<RevocationRow>();
  return result.results;
}

// ---------------------------------------------------------------------------------------
// Mapeo fila D1 -> forma de wire (schema.ts)
// ---------------------------------------------------------------------------------------

function toWirePrincipal(row: PrincipalRow): AuthoritySnapshotPrincipal {
  let externalIds: Record<string, string> = {};
  try {
    externalIds = JSON.parse(row.external_ids);
  } catch {
    externalIds = {};
  }
  return { id: row.id, external_ids: externalIds, display_name: row.display_name };
}

function toWireMembership(row: MembershipRow): AuthoritySnapshotMembership {
  return {
    id: row.id,
    principal_id: row.principal_id,
    organization_id: row.organization_id,
    status: row.status,
    effective_from: row.effective_from,
    effective_until: row.effective_until,
  };
}

function toWireRoleDefinition(row: RoleDefinitionRow): AuthoritySnapshotRoleDefinition {
  let definition: unknown = null;
  try {
    definition = JSON.parse(row.definition);
  } catch {
    definition = row.definition;
  }
  return {
    id: row.id,
    key: row.key,
    version: row.version,
    organization_id: row.organization_id,
    definition,
  };
}

function toWireRoleAssignment(row: RoleAssignmentRow): AuthoritySnapshotRoleAssignment {
  let scope: unknown | null = null;
  if (row.scope !== null) {
    try {
      scope = JSON.parse(row.scope);
    } catch {
      scope = row.scope;
    }
  }
  return {
    id: row.id,
    principal_id: row.principal_id,
    membership_id: row.membership_id,
    role_definition_id: row.role_definition_id,
    scope,
    effective_from: row.effective_from,
    effective_until: row.effective_until,
  };
}

function toWireRevocation(row: RevocationRow): AuthoritySnapshotRevocation {
  return {
    id: row.id,
    target_type: row.target_type,
    target_id: row.target_id,
    visible_from_version: row.visible_from_version,
    effective_until: row.effective_until,
    reason: row.reason,
  };
}

// ---------------------------------------------------------------------------------------
// Construcción de contenido full / delta
// ---------------------------------------------------------------------------------------

interface RawAuthorityTables {
  principals: PrincipalRow[];
  memberships: MembershipRow[];
  roleDefinitions: RoleDefinitionRow[];
  roleAssignments: RoleAssignmentRow[];
  revocations: RevocationRow[];
}

async function fetchAllTables(db: D1Database, organizationId: string): Promise<RawAuthorityTables> {
  const [principals, memberships, roleDefinitions, roleAssignments, revocations] = await Promise.all([
    fetchPrincipals(db, organizationId),
    fetchMemberships(db, organizationId),
    fetchRoleDefinitions(db, organizationId),
    fetchRoleAssignments(db, organizationId),
    fetchRevocations(db, organizationId),
  ]);
  return { principals, memberships, roleDefinitions, roleAssignments, revocations };
}

function maxSinceVersion(tables: RawAuthorityTables): number {
  const candidates = [
    0,
    ...tables.principals.map((row) => row.since_version),
    ...tables.memberships.map((row) => row.since_version),
    ...tables.roleDefinitions.map((row) => row.since_version),
    ...tables.roleAssignments.map((row) => row.since_version),
    ...tables.revocations.map((row) => row.visible_from_version),
  ];
  return Math.max(...candidates);
}

/**
 * Contenido "full" tal como existe hoy en las tablas, con la versión que ya está
 * consolidada en `authority_state` (o, si nunca se inicializó, la versión bootstrap
 * calculada a partir de `since_version`/`visible_from_version` — ver nota de supuesto al
 * inicio del archivo).
 */
function buildFullContent(
  organizationId: string,
  version: number,
  tables: RawAuthorityTables,
): AuthoritySnapshotContentFull {
  return {
    kind: "full",
    organization_id: organizationId,
    version,
    generated_at: new Date().toISOString(),
    principals: tables.principals.map(toWirePrincipal),
    memberships: tables.memberships.map(toWireMembership),
    role_definitions: tables.roleDefinitions.map(toWireRoleDefinition),
    role_assignments: tables.roleAssignments.map(toWireRoleAssignment),
    revocations: tables.revocations.map(toWireRevocation),
  };
}

/**
 * Contenido "delta": únicamente lo que cambió estrictamente después de `baseVersion`
 * (`since_version > baseVersion` para altas/cambios, `visible_from_version > baseVersion`
 * para revocations). SUPUESTO: no se modelan bajas (un principal que dejó de tener
 * membership) más allá de lo que ya cubre `revocations` — si el diseño físico define un
 * mecanismo de tombstone adicional para delta, no está implementado acá.
 */
function buildDeltaContent(
  organizationId: string,
  version: number,
  baseVersion: number,
  tables: RawAuthorityTables,
): AuthoritySnapshotContentDelta {
  return {
    kind: "delta",
    organization_id: organizationId,
    version,
    base_version: baseVersion,
    generated_at: new Date().toISOString(),
    principals: tables.principals.filter((row) => row.since_version > baseVersion).map(toWirePrincipal),
    memberships: tables.memberships.filter((row) => row.since_version > baseVersion).map(toWireMembership),
    role_definitions: tables.roleDefinitions
      .filter((row) => row.since_version > baseVersion)
      .map(toWireRoleDefinition),
    role_assignments: tables.roleAssignments
      .filter((row) => row.since_version > baseVersion)
      .map(toWireRoleAssignment),
    revocations: tables.revocations
      .filter((row) => row.visible_from_version > baseVersion)
      .map(toWireRevocation),
  };
}

// ---------------------------------------------------------------------------------------
// Versionado atómico de authority_state (Nota técnica de riesgos §1)
// ---------------------------------------------------------------------------------------

/**
 * Garantiza que `authority_state` refleje el digest del contenido "full" actual.
 *
 * Patrón exigido por la Nota técnica de riesgos §1: D1 no soporta transacciones
 * interactivas, así que la lectura previa (`observedVersion`) se usa como precondición de
 * concurrencia optimista dentro de un único `db.batch([...])`. Si el `UPDATE` afecta cero
 * filas (alguien más movió la versión entretanto), se trata como conflicto a reintentar —
 * nunca como éxito silencioso.
 *
 * Devuelve la versión/digest efectivos después de la operación (ya sea porque no hacía
 * falta cambiar nada, porque el bump tuvo éxito, o porque tras reintentar se observó que
 * otro request ya había convergido al mismo digest).
 */
async function ensureAuthorityVersion(
  db: D1Database,
  organizationId: string,
  candidateContent: AuthoritySnapshotContentFull,
  maxRetries = 3,
): Promise<{ version: number; digest: string }> {
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const existing = await fetchAuthorityState(db, organizationId);
    const observedVersion = existing?.current_version ?? 0;

    // El digest se calcula sobre el contenido sin `version`/`generated_at` (son metadatos
    // de la envoltura, no del estado en sí — ver comentario de `digest` en schema.ts).
    const { canonical, digestHex } = await digestCanonical(stableDigestSubject(candidateContent));

    if (existing && existing.current_digest === digestHex) {
      // Ya está consolidado con este contenido exacto: no hay nada que escribir.
      return { version: existing.current_version, digest: digestHex };
    }

    const nextVersion = Math.max(observedVersion + 1, candidateContent.version);
    const now = Math.floor(Date.now() / 1000);

    if (!existing) {
      // Primer snapshot de esta organización: fila `authority_state` inexistente.
      // INSERT ... con guarda de "no existía" — si otro request ganó la carrera de
      // inicialización, el INSERT falla por PK y se reintenta desde el `fetch` de arriba.
      try {
        await db
          .prepare(
            `INSERT INTO authority_state (organization_id, current_version, current_digest, updated_at)
             VALUES (?, ?, ?, ?)`,
          )
          .bind(organizationId, nextVersion, digestHex, now)
          .run();
        return { version: nextVersion, digest: digestHex };
      } catch {
        continue; // carrera de inicialización perdida: reintentar con el estado ya creado
      }
    }

    const updateStatement = db
      .prepare(
        `UPDATE authority_state
         SET current_version = ?, current_digest = ?, updated_at = ?
         WHERE organization_id = ? AND current_version = ?`,
      )
      .bind(nextVersion, digestHex, now, organizationId, observedVersion);

    // Un solo `db.batch([...])` con la única statement de escritura de esta fase (§1.1 del
    // encargo). Se deja como batch (en vez de un `.run()` suelto) para que, cuando en una
    // fase futura existan escrituras de contenido reales (altas de principals/roles/etc.),
    // se agreguen a este mismo array sin cambiar el patrón de concurrencia optimista.
    const [updateResult] = await db.batch([updateStatement]);

    if (updateResult.meta.changes === 1) {
      return { version: nextVersion, digest: digestHex };
    }
    // changes === 0: otro request movió `current_version` entre la lectura y el batch.
    // No es éxito silencioso — se reintenta el ciclo completo con el estado fresco.
    void canonical; // reservado por si se necesita loguear el canonical en un reintento fallido
  }

  throw new Error("authority_state_conflict: no se pudo converger la versión tras reintentos");
}

/** Subconjunto estable del contenido full usado para el digest de `authority_state` — sin `generated_at`. */
function stableDigestSubject(content: AuthoritySnapshotContentFull): unknown {
  const { generated_at: _generatedAt, ...rest } = content;
  return rest;
}

// ---------------------------------------------------------------------------------------
// Orquestación: snapshot (full/delta)
// ---------------------------------------------------------------------------------------

export interface ResolveAuthoritySnapshotParams {
  db: D1Database;
  organizationId: string;
  capability: AuthorityCapability;
  /** Versión que el cliente ya tiene (query param `high_water_mark`). */
  clientHighWaterMark: number | null;
  signing: AuthoritySigningContext;
}

export async function resolveAuthoritySnapshot(
  params: ResolveAuthoritySnapshotParams,
): Promise<AuthoritySnapshotResolution> {
  const { db, organizationId, capability, clientHighWaterMark, signing } = params;

  const tables = await fetchAllTables(db, organizationId);
  const bootstrapVersion = maxSinceVersion(tables);
  const existingState = await fetchAuthorityState(db, organizationId);
  const candidateVersion = Math.max(existingState?.current_version ?? 0, bootstrapVersion, 1);

  const candidateFull = buildFullContent(organizationId, candidateVersion, tables);
  const { version: currentVersion } = await ensureAuthorityVersion(db, organizationId, candidateFull);

  if (clientHighWaterMark !== null && clientHighWaterMark >= currentVersion) {
    return { kind: "no_newer_version", organizationId, currentVersion };
  }

  const content: AuthoritySnapshotContent =
    capability === "delta" && clientHighWaterMark !== null
      ? buildDeltaContent(organizationId, currentVersion, clientHighWaterMark, tables)
      : { ...candidateFull, version: currentVersion };

  const envelope = await signContent(content, signing);
  return { kind: "envelope", organizationId, currentVersion, envelope };
}

async function signContent(
  content: AuthoritySnapshotContent,
  signing: AuthoritySigningContext,
): Promise<AuthorityEnvelope> {
  const { generated_at: _generatedAt, ...digestSubject } = content;
  const { digestHex } = await digestCanonical(digestSubject);
  const signature = await signDigest(digestHex, signing.signingKeyPkcs8);
  return {
    content,
    digest: digestHex,
    signature,
    signing_key_id: signing.signingKeyId,
  };
}

// ---------------------------------------------------------------------------------------
// Trust bundle (§11.1 del diseño físico)
// ---------------------------------------------------------------------------------------

export interface ResolveTrustBundleParams {
  organizationId: string;
  issuer: string;
  signingKeys: AuthorityTrustBundleSigningKey[];
}

/**
 * SUPUESTO DE DISEÑO: la migración 0001_authority_snapshot.sql (§1.1 del encargo) no
 * define una tabla de claves de firma / issuers — el encargo tampoco la lista entre los
 * archivos de esta fase. Este helper NO lee D1: arma el trust bundle a partir de bindings
 * de entorno (Workers secrets/vars), como única fuente disponible en esta fase para el
 * emisor y su clave pública. Esto es una limitación real a resolver: si el diseño físico
 * define almacenamiento en D1 para múltiples claves con rotación, este helper debe
 * reemplazarse por una lectura de tabla — dejar constancia en el reporte de cierre.
 */
export function buildTrustBundleFromEnv(params: ResolveTrustBundleParams): AuthorityTrustBundle {
  return {
    issuer: params.issuer,
    organization_id: params.organizationId,
    signing_keys: params.signingKeys,
  };
}
