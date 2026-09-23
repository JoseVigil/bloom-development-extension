// backend/src/authority/invitation-store.ts
//
// Invitaciones a organización ajena — Fase B del encargo de invitaciones
// (Propuesta_Diseno_Invitaciones_Organizacion_v0_2.md §2, §4; aprobada por Jose
// 2026-09-22 tras confirmar sólida la propuesta). Cubre exclusivamente creación,
// listado y revocación de una invitación `pending` — nunca redención (Fase C, todavía
// no autorizada: ver la nota de la Corrección adjunta sobre el commitGuard del actor
// sintético, que agrega un requisito que el diseño no había identificado).
//
// No reabre administration.ts/administration-store.ts, mismo criterio que
// tenant-store.ts: crear/listar/revocar una invitación no es un comando sobre una
// emisión existente, es metadata previa a que exista cualquier membership o assignment.
//
// §2.3(a) del diseño: `permissions`/`masterPermissions`/`activeAssignments` viven como
// closures PRIVADOS dentro de evaluateAdministration (administration.ts:101-127, no
// exportados) — confirmado al leer ese archivo completo antes de escribir este. Se
// replica acá sólo la LECTURA (nunca la decisión de autorización real, que vuelve a
// correr en Fase C dentro de evaluateAdministration en el momento de la redención). Si
// esta copia diverge de la real, el peor caso es una invitación creada optimista que
// falla al redimirse — nunca una que otorgue de más.

import { hashSecret, randomSecret } from './human-identity';
import { authorityInstant } from './administration';
import { normalizeWireTime, withBuiltinCatalog, wireVersion } from './emission';
import { loadCurrentEmission } from './emission-store';
import type { SessionActor } from './human-session-store';
import type { WireFullContent, WireRoleAssignment } from './schema';

export type InvitationStoreFailure = 'invalid_request' | 'not_authorized' | 'organization_unavailable'
  | 'role_unavailable' | 'scope_unverifiable' | 'invitation_unavailable';
export class InvitationStoreError extends Error {
  constructor(readonly code: InvitationStoreFailure) { super(`authority_invitation_${code}`); }
}

export interface InvitationStoreServices { now: () => string; origin: string }
export interface CreateInvitationInput {
  roleId: string; roleVersion: string; scopeType: 'organization' | 'project'; scopeId?: string;
  invitedSubject?: string; validUntil?: string | null; expiresInSeconds?: number;
}
export interface CreateInvitationResult { invitationId: string; token: string; url: string }
export interface InvitationSummary {
  id: string; roleId: string; roleVersion: string; scopeType: 'organization' | 'project'; scopeId: string | null;
  invitedSubject: string | null; status: 'pending' | 'accepted' | 'revoked'; createdAt: string; expiresAt: string;
}

const DEFAULT_EXPIRES_SECONDS = 604800; // 7 días — valor por defecto, no una decisión técnica (§1 del diseño); ajustable por producto.
const MAX_EXPIRES_SECONDS = 2592000; // 30 días — techo defensivo, no especificado por el diseño.

function currentEntity(v: { status: string; valid_from: string; valid_until: string | null; accepted_at: string }, now: bigint): boolean {
  return v.status === 'active' && authorityInstant(v.valid_from) <= now
    && (v.valid_until === null || authorityInstant(v.valid_until) > now) && authorityInstant(v.accepted_at) <= now;
}
function activeAssignments(state: WireFullContent, principalId: string, scope: WireRoleAssignment['scope'], now: bigint): WireRoleAssignment[] {
  return state.role_assignments.filter(a => {
    const m = state.memberships.find(m => m.membership_id === a.membership_id && m.principal_id === principalId);
    if (!m || !currentEntity(m, now) || !currentEntity(a, now)) return false;
    if (a.scope.type !== scope.type || a.scope.id !== scope.id) return false;
    if (state.revocations.some(r => r.target_type === 'role_assignment' && r.target_id === a.assignment_id && authorityInstant(r.effective_at) <= now)) return false;
    const role = state.role_definitions.find(r => r.role_id === a.role_id && r.role_version === a.role_version);
    if (!role || role.status !== 'active') return false;
    return !state.revocations.some(r => r.target_type === 'role_definition' && r.target_id === role.role_id && authorityInstant(r.effective_at) <= now);
  });
}
function permissionsOf(state: WireFullContent, principalId: string, scope: WireRoleAssignment['scope'], now: bigint): Set<string> {
  return new Set(activeAssignments(state, principalId, scope, now)
    .flatMap(a => state.role_definitions.find(r => r.role_id === a.role_id && r.role_version === a.role_version)!.permissions));
}
function masterPermissionsOf(state: WireFullContent): Set<string> {
  const master = state.role_definitions.find(r => r.role_id === 'master' && r.role_origin === 'builtin' && r.status === 'active');
  if (!master) throw new InvitationStoreError('role_unavailable');
  return new Set(master.permissions);
}
function roleFor(state: WireFullContent, roleId: string, roleVersion: string, now: bigint) {
  const r = state.role_definitions.find(r => r.role_id === roleId && r.role_version === roleVersion);
  if (!r || r.status !== 'active') return null;
  if (state.revocations.some(rv => rv.target_type === 'role_definition' && rv.target_id === roleId && authorityInstant(rv.effective_at) <= now)) return null;
  return r;
}

/** Sostiene, en `orgScope` y sobre el `state` vigente, ambos permisos que el diseño
 * exige para poder invitar (§2.1: authority.membership.manage Y authority.assignment.manage).
 * Deliberadamente más general que "sólo master" — cualquier rol organización-definida con
 * esos dos permisos lo cumple, sin código nuevo (continuación de la decisión de
 * resolución de Fase 1 §1: el rol es siempre un parámetro validado dinámicamente). */
function canInvite(state: WireFullContent, principalId: string, organizationId: string, now: bigint): boolean {
  const held = permissionsOf(state, principalId, { type: 'organization', id: organizationId }, now);
  return held.has('authority.membership.manage') && held.has('authority.assignment.manage');
}

async function loadAuthorizedState(db: D1Database, organizationId: string, actor: SessionActor, now: bigint) {
  const current = await loadCurrentEmission(db, organizationId);
  if (!current) throw new InvitationStoreError('organization_unavailable');
  if (!canInvite(current.state, actor.principalId, organizationId, now)) throw new InvitationStoreError('not_authorized');
  // R1 como vista de SÓLO LECTURA (Propuesta_Diseno_Resolucion_AsignacionRolesBuiltin_v0_1.md
  // §3 Alt. 4, punto 3): valida el rol pedido contra el catálogo builtin completo que la
  // redención (evaluateAdministration) va a materializar. No persiste nada.
  return withBuiltinCatalog(current.state);
}

/** Crea una invitación `pending`. Autorización fail-fast (§2.2 del diseño): valida contra
 * el estado vigente en este momento, pero la autoridad real se re-evalúa recién en la
 * redención (Fase C) — si el invitador pierde el permiso entre medio, la redención falla,
 * nunca esta creación otorga de más. */
export async function createInvitation(db: D1Database, organizationId: string, actor: SessionActor,
  input: CreateInvitationInput, s: InvitationStoreServices): Promise<CreateInvitationResult> {
  if (typeof input.roleId !== 'string' || !input.roleId) throw new InvitationStoreError('invalid_request');
  try { wireVersion(input.roleVersion); } catch { throw new InvitationStoreError('invalid_request'); }
  if (input.scopeType !== 'organization' && input.scopeType !== 'project') throw new InvitationStoreError('invalid_request');
  if (input.scopeType === 'project' && (typeof input.scopeId !== 'string' || !input.scopeId)) throw new InvitationStoreError('invalid_request');
  if (input.scopeType === 'organization' && input.scopeId !== undefined) throw new InvitationStoreError('invalid_request');
  if (input.invitedSubject !== undefined && (typeof input.invitedSubject !== 'string' || !input.invitedSubject)) throw new InvitationStoreError('invalid_request');
  const expiresIn = input.expiresInSeconds ?? DEFAULT_EXPIRES_SECONDS;
  if (!Number.isFinite(expiresIn) || expiresIn <= 0 || expiresIn > MAX_EXPIRES_SECONDS) throw new InvitationStoreError('invalid_request');
  let validUntilNormalized: string | null = null;
  if (input.validUntil !== undefined && input.validUntil !== null) {
    try { validUntilNormalized = normalizeWireTime(input.validUntil); } catch { throw new InvitationStoreError('invalid_request'); }
  }

  const now = authorityInstant(s.now());
  const state = await loadAuthorizedState(db, organizationId, actor, now);

  const role = roleFor(state, input.roleId, input.roleVersion, now);
  if (!role) throw new InvitationStoreError('role_unavailable');
  const cap = masterPermissionsOf(state);
  const held = permissionsOf(state, actor.principalId, { type: 'organization', id: organizationId }, now);
  if (role.permissions.some(p => !cap.has(p) || !held.has(p))) throw new InvitationStoreError('not_authorized');

  const scopeId = input.scopeType === 'project' ? input.scopeId! : null;
  if (input.scopeType === 'project') {
    const evidence = await db.prepare(`SELECT 1 FROM authority_project_scope_evidence
      WHERE organization_id=? AND project_id=? AND status='active' AND julianday(valid_until)>julianday(?)`)
      .bind(organizationId, scopeId, s.now()).first();
    if (!evidence) throw new InvitationStoreError('scope_unverifiable');
  }

  const invitationId = crypto.randomUUID(), token = randomSecret();
  const createdAt = s.now(), expiresAt = new Date(Date.parse(createdAt) + expiresIn * 1000).toISOString();
  await db.prepare(`INSERT INTO authority_organization_invitations
    (id,organization_id,invited_by_principal_id,role_id,role_version,scope_type,scope_id,valid_until,
     invited_subject,token_hash,status,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,'pending',?,?)`)
    .bind(invitationId, organizationId, actor.principalId, role.role_id, role.role_version,
      input.scopeType, scopeId, validUntilNormalized, input.invitedSubject ?? null,
      await hashSecret(token), createdAt, expiresAt).run();

  // La URL apunta a la ruta de redención de Fase C, todavía no habilitada — se construye
  // igual desde ahora (mismo contrato que devuelve el diseño en §2.4) para que Fase C no
  // tenga que tocar este archivo cuando se autorice.
  return { invitationId, token, url: `${s.origin}/v1/authority/tenant/invitations/redeem?token=${token}` };
}

/** Lista las invitaciones de la organización. A diferencia de listTenantOrganizations
 * (tenant-store.ts), NO es de lectura abierta a cualquier miembro — mismo gate que
 * crear (§4 del diseño, señalado ahí como desviación deliberada del criterio de
 * tenant/organizations: una invitación en curso revela con qué rol/scope se está por
 * incorporar alguien). */
export async function listInvitations(db: D1Database, organizationId: string, actor: SessionActor,
  s: { now: () => string }): Promise<InvitationSummary[]> {
  const now = authorityInstant(s.now());
  await loadAuthorizedState(db, organizationId, actor, now);
  const rows = await db.prepare(`SELECT id,role_id,role_version,scope_type,scope_id,invited_subject,status,created_at,expires_at
    FROM authority_organization_invitations WHERE organization_id=? ORDER BY created_at DESC`)
    .bind(organizationId).all<{ id: string; role_id: string; role_version: string; scope_type: 'organization' | 'project';
      scope_id: string | null; invited_subject: string | null; status: 'pending' | 'accepted' | 'revoked'; created_at: string; expires_at: string }>();
  return rows.results.map(r => ({ id: r.id, roleId: r.role_id, roleVersion: r.role_version, scopeType: r.scope_type,
    scopeId: r.scope_id, invitedSubject: r.invited_subject, status: r.status, createdAt: r.created_at, expiresAt: r.expires_at }));
}

/** Revoca una invitación `pending` — nunca una ya aceptada (eso es revoke_membership,
 * fuera de alcance acá, §4 del diseño). Mismo gate de autorización que crear. */
export async function revokeInvitation(db: D1Database, organizationId: string, actor: SessionActor,
  invitationId: string, s: { now: () => string }): Promise<{ revoked: true }> {
  if (typeof invitationId !== 'string' || !invitationId) throw new InvitationStoreError('invalid_request');
  const now = authorityInstant(s.now());
  await loadAuthorizedState(db, organizationId, actor, now);
  const result = await db.prepare(`UPDATE authority_organization_invitations SET status='revoked'
    WHERE id=? AND organization_id=? AND status='pending' RETURNING id`).bind(invitationId, organizationId).first();
  if (!result) throw new InvitationStoreError('invitation_unavailable');
  return { revoked: true };
}
