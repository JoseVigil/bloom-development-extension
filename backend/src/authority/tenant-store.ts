// backend/src/authority/tenant-store.ts
//
// Sovereign Tenant, Fase 3 (Propuesta_Arquitectura_Tenant_Soberano_v0_1.md §2.3.2-§2.3.4,
// autorizada por Jose 2026-09-16): capacidad de crear una organización hermana dentro de
// un tenant existente, y de listar las organizaciones de un tenant.
//
// CORRECCIÓN respecto de la propuesta original: la propuesta decía que esta función
// llamaría a createInitialAuthorityEmission inline, en el mismo paso. Al implementar,
// confirmé contra genesis-store.ts que finishGenesis NO hace eso — crea organización +
// identidad y devuelve, sin intentar la emisión inicial. La emisión inicial requiere una
// instalación activa registrada (installation_keys), y esa instalación sólo puede
// registrarse DESPUÉS de conocer el id de la organización nueva — no se puede tener
// lista de antemano. Intentarlo inline acá garantizaría fallar con
// configuration_unavailable en el primer llamado, siempre. Este archivo sigue
// exactamente el mismo contrato de dos pasos que génesis: crea organización + identidad
// canónica (esta función); el caller registra una instalación para esa organización
// (POST /v1/authority/installations/register, ya existente) y recién ahí llama a
// /v1/authority/initial-emission (ya existente) — sin código nuevo para ese segundo paso.
//
// No se reabre evaluateAdministration/administerAuthority (administration.ts/-store.ts):
// crear una organización nueva no es un comando sobre una emisión existente — es un
// evento distinto, una emisión que nace desde cero. Mezclarlo ahí corrompería esa
// abstracción (piensa en una única cadena de versiones por organización).
//
// Criterio de autorización (confirmado por Jose 2026-09-16): ser `master` — builtin,
// activo — en CUALQUIER organización que ya pertenezca al tenant. Se verifica leyendo la
// emisión vigente de la organización de origen (loadCurrentEmission), exactamente el
// mismo criterio que usa `masterPermissions()` en administration.ts (role_id==='master',
// role_origin==='builtin', status==='active'), aplicado a una membership activa del actor.

import type { SessionActor } from './human-session-store';
import { loadCurrentEmission } from './emission-store';
import type { WireFullContent } from './schema';

export type TenantStoreFailure = 'invalid_request' | 'tenant_unavailable' | 'not_authorized';
export class TenantStoreError extends Error {
  constructor(readonly code: TenantStoreFailure) { super(`authority_tenant_${code}`); }
}

export interface TenantOrganizationSummary { id: string; name: string; created_at: number }
export interface CreateOrganizationUnderTenantResult { organizationId: string; tenantId: string }
export interface TenantStoreServices { now: () => string }

/** Verdadero si `principalId` sostiene el rol builtin `master`, activo, vía una
 * membership activa, en `organizationId` — dentro del `state` de la emisión vigente de
 * esa organización (no una consulta SQL directa: la autoridad vive en la emisión, no en
 * una tabla de roles suelta). */
function isActiveMaster(state: WireFullContent, principalId: string, organizationId: string): boolean {
  const membership = state.memberships.find(m => m.principal_id === principalId && m.organization_id === organizationId && m.status === 'active');
  if (!membership) return false;
  return state.role_assignments.some(a => a.membership_id === membership.membership_id && a.status === 'active'
    && state.role_definitions.some(r => r.role_id === a.role_id && r.role_version === a.role_version
      && r.role_id === 'master' && r.role_origin === 'builtin' && r.status === 'active'));
}

async function resolveTenantId(db: D1Database, originOrganizationId: string): Promise<string> {
  const origin = await db.prepare('SELECT tenant_id FROM organizations WHERE id=?').bind(originOrganizationId)
    .first<{ tenant_id: string | null }>();
  if (!origin?.tenant_id) throw new TenantStoreError('tenant_unavailable');
  return origin.tenant_id;
}

/** Lista las organizaciones del mismo tenant que `originOrganizationId` (incluida ella
 * misma), ordenadas por antigüedad. No requiere rol `master` — cualquier miembro activo
 * de cualquier organización del tenant puede enumerar hermanas (§2.3.4 de la propuesta);
 * la verificación de sesión activa la hace el caller (misma responsabilidad que el resto
 * de las rutas de administration-route.ts). */
export async function listTenantOrganizations(db: D1Database, originOrganizationId: string): Promise<TenantOrganizationSummary[]> {
  const tenantId = await resolveTenantId(db, originOrganizationId);
  const rows = await db.prepare('SELECT id, name, created_at FROM organizations WHERE tenant_id=? ORDER BY created_at ASC')
    .bind(tenantId).all<TenantOrganizationSummary>();
  return rows.results;
}

/**
 * Crea una organización nueva dentro del mismo tenant que `originOrganizationId`, a
 * nombre del actor ya autenticado en esa organización de origen — mini-génesis sin el
 * paso de OAuth: el humano ya probó posesión de su sesión, así que se le da un
 * principal_id nuevo (propio de la organización nueva, igual que finishGenesis) más una
 * identidad canónica ya verificada. No intenta la emisión inicial — ver nota de cabecera.
 */
export async function createOrganizationUnderTenant(db: D1Database, originOrganizationId: string, actor: SessionActor,
  name: string, s: TenantStoreServices): Promise<CreateOrganizationUnderTenantResult> {
  if (typeof name !== 'string' || !name.trim()) throw new TenantStoreError('invalid_request');
  const tenantId = await resolveTenantId(db, originOrganizationId);

  const current = await loadCurrentEmission(db, originOrganizationId);
  if (!current || !isActiveMaster(current.state, actor.principalId, originOrganizationId)) throw new TenantStoreError('not_authorized');

  const founder = await db.prepare('SELECT subject, display_handle FROM authority_human_identities WHERE organization_id=? AND principal_id=?')
    .bind(originOrganizationId, actor.principalId).first<{ subject: string; display_handle: string }>();
  if (!founder) throw new TenantStoreError('not_authorized');

  const organizationId = crypto.randomUUID(), principalId = crypto.randomUUID(), createdAt = Date.now(), now = s.now();
  await db.batch([
    db.prepare('INSERT INTO organizations(id,name,master_github_username,key_fingerprint,created_at,tenant_id) VALUES(?,?,?,?,?,?)')
      .bind(organizationId, name.trim(), founder.display_handle, 'unassigned', createdAt, tenantId),
    db.prepare(`INSERT INTO authority_human_identities(organization_id,principal_id,subject,source_ref,evidence_kind,revision,status,verified_at,display_handle)
      VALUES(?,?,?,'canonical:github','canonical','1','active',?,?)`)
      .bind(organizationId, principalId, founder.subject, now, founder.display_handle),
  ]);
  return { organizationId, tenantId };
}
